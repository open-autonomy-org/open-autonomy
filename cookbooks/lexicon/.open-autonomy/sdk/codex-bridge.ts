// A bounded transport for Hermes's native Codex app-server wire. The host chooses
// the model and remote environment; clients cannot access account/config/history APIs.
// This does not launch Codex or establish container isolation: the host runner must
// provide an isolated remote executor before enabling fleet startup.
import { timingSafeEqual } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { posix } from 'node:path';
import type { Readable, Writable } from 'node:stream';

const INTERNAL_ID = 'oa-bridge:';
const MAX_FRAME = 2 * 1024 * 1024;
type Packet = Record<string, any>;
type Id = number | string;
const record = (value: any): value is Packet => !!value && typeof value === 'object' && !Array.isArray(value);
const validId = (id: any): id is Id => typeof id === 'string' ? id.length > 0 && id.length < 128 : Number.isSafeInteger(id);
function packet(raw: string): Packet {
  if (Buffer.byteLength(raw) > MAX_FRAME) throw new Error('Codex bridge frame exceeds its size limit.');
  let value: any;
  try { value = JSON.parse(raw); } catch { throw new Error('Codex bridge requires one JSON object per frame.'); }
  if (!record(value)) throw new Error('Codex bridge does not accept JSON-RPC batches.');
  return value;
}
const only = (value: Packet, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const failure = (id: Id, message: string) => ({ id, error: { code: -32600, message } });

export interface CodexBridgePolicy { model: string; modelProvider: string; workspace: string; environmentId: string }
export interface CodexBridgeWire { client: (packet: Packet) => void; server: (packet: Packet) => void; close: () => void }

/** One native Hermes session and one host-owned Codex thread per connection. */
export class CodexBridgeSession {
  private pending = new Map<Id, string>();
  private checks = new Map<string, { request: Packet; stage: 'connect' | 'local' | 'remote'; timer: ReturnType<typeof setTimeout> }>();
  private sequence = 0;
  private initialized = false;
  private acknowledged = false;
  private thread?: string;
  private closed = false;
  constructor(private policy: CodexBridgePolicy, private wire: CodexBridgeWire) {
    if (!policy.model || !policy.modelProvider || !policy.environmentId || policy.environmentId === 'local'
      || !posix.isAbsolute(policy.workspace) || policy.workspace === '/' || posix.normalize(policy.workspace) !== policy.workspace) {
      throw new Error('Codex bridge requires a pinned model, remote environment and absolute project workspace.');
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.pending.clear();
    for (const check of this.checks.values()) clearTimeout(check.timer);
    this.checks.clear(); this.wire.close();
  }
  private unavailable(request: Packet): void {
    const message = 'The isolated Codex executor is unavailable; project execution was refused.';
    if (request.method === 'turn/completed') {
      this.wire.client({ ...request, params: { threadId: this.thread,
        turn: { id: request.params.turn.id, status: 'failed', items: [], error: { message } } } });
    } else this.wire.client(failure(request.id, message));
    this.close();
  }
  private check(request: Packet, stage: 'connect' | 'local' | 'remote'): void {
    const id = INTERNAL_ID + ++this.sequence;
    const timer = setTimeout(() => this.unavailable(request), 10_000);
    this.checks.set(id, { request, stage, timer });
    this.wire.server({ id, method: stage === 'connect' ? 'environment/info' : 'environment/status',
      params: { environmentId: stage === 'local' ? 'local' : this.policy.environmentId } });
  }
  fromClient(raw: string): void {
    if (this.closed) return;
    try {
      const p = packet(raw);
      if (!only(p, ['jsonrpc', 'id', 'method', 'params']) || (p.jsonrpc !== undefined && p.jsonrpc !== '2.0')) throw new Error();
      const params = p.params ?? {};
      if (!record(params)) throw new Error();
      if (p.method === 'initialized' && p.id === undefined && this.initialized && !this.acknowledged && only(params, [])) {
        this.acknowledged = true; this.wire.server({ method: 'initialized' }); return;
      }
      if (!validId(p.id) || (typeof p.id === 'string' && p.id.startsWith(INTERNAL_ID)) || this.pending.has(p.id) || this.pending.size >= 128) throw new Error();
      let rewritten: Packet;
      switch (p.method) {
        case 'initialize':
          if (this.initialized || this.pending.size) throw new Error();
          rewritten = { clientInfo: { name: 'hermes', title: 'Hermes Agent', version: '1' }, capabilities: { experimentalApi: true } };
          break;
        case 'thread/start': {
          if (!this.acknowledged || this.thread || [...this.pending.values()].includes('thread/start') || !only(params, ['cwd'])) throw new Error();
          const cwd = params.cwd;
          if (typeof cwd !== 'string' || posix.normalize(cwd) !== cwd || (cwd !== this.policy.workspace && !cwd.startsWith(this.policy.workspace + '/'))) throw new Error();
          rewritten = { cwd, model: this.policy.model, modelProvider: this.policy.modelProvider, ephemeral: true,
            approvalPolicy: 'never', environments: [{ environmentId: this.policy.environmentId, cwd }] };
          break;
        }
        case 'turn/start':
        case 'turn/steer': {
          if (!this.thread || params.threadId !== this.thread || !only(params, p.method === 'turn/start' ? ['threadId', 'input'] : ['threadId', 'input', 'expectedTurnId'])) throw new Error();
          if (!Array.isArray(params.input) || !params.input.length || !params.input.every((input: any) => record(input) && only(input, ['type', 'text']) && input.type === 'text' && typeof input.text === 'string')) throw new Error();
          if (p.method === 'turn/steer' && typeof params.expectedTurnId !== 'string') throw new Error();
          rewritten = params; break;
        }
        case 'thread/compact/start':
        case 'turn/interrupt':
          if (!this.thread || params.threadId !== this.thread || !only(params, p.method === 'turn/interrupt' ? ['threadId', 'turnId'] : ['threadId'])) throw new Error();
          if (p.method === 'turn/interrupt' && typeof params.turnId !== 'string') throw new Error();
          rewritten = params; break;
        default:
          this.wire.client(failure(p.id, 'This operation is unavailable through the project Codex bridge.')); return;
      }
      this.pending.set(p.id, p.method);
      const request = { id: p.id, method: p.method, params: rewritten };
      if (['thread/start', 'turn/start', 'turn/steer', 'thread/compact/start'].includes(p.method)) {
        this.check(request, p.method === 'thread/start' ? 'connect' : 'local');
      } else this.wire.server(request);
    } catch { this.close(); }
  }
  fromServer(raw: string): void {
    if (this.closed) return;
    try {
      const p = packet(raw);
      if (p.method) {
        // Authentication, permission escalation and unknown callbacks must not be
        // delegated to a container. Native MCP results travel as ordinary events.
        if (validId(p.id)) { this.wire.server({ id: p.id, error: { code: -32601, message: 'Host-side callbacks are unavailable through the project bridge.' } }); return; }
        const allowed = ['thread/started', 'thread/status/changed', 'thread/tokenUsage/updated', 'turn/started', 'turn/completed', 'turn/diff/updated', 'turn/plan/updated', 'item/started', 'item/completed', 'item/agentMessage/delta', 'item/reasoning/textDelta', 'item/reasoning/summaryTextDelta', 'item/reasoning/summaryPartAdded', 'item/commandExecution/outputDelta', 'item/fileChange/outputDelta', 'item/mcpToolCall/progress'];
        if (!allowed.includes(p.method) || !this.thread) return;
        const threadId = p.params?.threadId ?? p.params?.thread?.id;
        if (threadId !== this.thread) return;
        if (p.method === 'turn/completed' && p.params?.turn?.error) p.params.turn.error = { message: 'Codex reported a project execution error; raw host diagnostics were withheld.' };
        if (p.method === 'turn/completed') this.check(p, 'local');
        else this.wire.client(p);
        return;
      }
      if (!validId(p.id)) throw new Error();
      const check = typeof p.id === 'string' ? this.checks.get(p.id) : undefined;
      if (check) {
        clearTimeout(check.timer); this.checks.delete(p.id as string);
        const { request, stage } = check;
        if (p.error || !record(p.result) || (stage === 'local' && p.result.status !== 'unknown')
          || (stage === 'remote' && p.result.status !== 'ready')) { this.unavailable(request); return; }
        if (stage === 'connect') this.check(request, 'local');
        else if (stage === 'local') this.check(request, 'remote');
        else if (request.method === 'turn/completed') this.wire.client(request);
        else this.wire.server(request);
        return;
      }
      const method = this.pending.get(p.id);
      if (!method) throw new Error();
      this.pending.delete(p.id);
      if (p.error) { this.wire.client(failure(p.id, 'The host Codex rejected the project request; raw host diagnostics were withheld.')); return; }
      if (!record(p.result)) throw new Error();
      if (method === 'initialize') {
        this.initialized = true;
        // The native response can include the operator's home and platform paths.
        this.wire.client({ id: p.id, result: { userAgent: 'open-autonomy-codex-bridge' } }); return;
      }
      if (method === 'thread/start') {
        const id = p.result.thread?.id ?? p.result.sessionId;
        if (typeof id !== 'string' || !id) throw new Error();
        this.thread = id;
        this.wire.client({ id: p.id, result: { thread: { id }, model: this.policy.model, modelProvider: this.policy.modelProvider } }); return;
      }
      this.wire.client(p);
    } catch { this.close(); }
  }
}

export interface CodexBridgeBackend { write: (packet: Packet) => void; close: () => void }
/** The runner owns backend processes and must close them when their connection ends. */
export function serveCodexBridge(options: { token: string; policy: CodexBridgePolicy; port?: number;
  connect: (receive: (raw: string) => void, disconnected: () => void) => CodexBridgeBackend }) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(options.token)) throw new Error('Codex bridge requires an unpredictable project capability of at least 32 bytes.');
  new CodexBridgeSession(options.policy, { client() {}, server() {}, close() {} });
  const expected = Buffer.from(`Bearer ${options.token}`);
  const sessions = new Set<{ session?: CodexBridgeSession; backend?: CodexBridgeBackend }>();
  const server = Bun.serve<{ session?: CodexBridgeSession; backend?: CodexBridgeBackend }>({
    hostname: '127.0.0.1', port: options.port ?? 0,
    fetch(req, server) {
      const supplied = Buffer.from(req.headers.get('authorization') ?? '');
      if (req.headers.has('origin') || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response('Unauthorized', { status: 401 });
      if (req.method !== 'GET' || new URL(req.url).pathname !== '/session') return new Response('Not found', { status: 404 });
      if (sessions.size >= 32) return new Response('Session capacity reached', { status: 503 });
      const data = {};
      if (server.upgrade(req, { data })) return;
      return new Response('WebSocket required', { status: 426 });
    },
    websocket: {
      maxPayloadLength: MAX_FRAME, backpressureLimit: MAX_FRAME, closeOnBackpressureLimit: true,
      open(ws) {
        if (sessions.size >= 32) { ws.close(1013, 'Session capacity reached'); return; }
        const data = ws.data; sessions.add(data);
        let ended = false;
        data.session = new CodexBridgeSession(options.policy, {
          client: p => { if (ws.send(JSON.stringify(p)) === 0) data.session?.close(); },
          server: p => data.backend?.write(p),
          close: () => { ended = true; data.backend?.close(); ws.close(1000, 'Project session ended'); sessions.delete(data); },
        });
        try { data.backend = options.connect(raw => data.session?.fromServer(raw), () => data.session?.close()); if (ended) data.backend.close(); }
        catch { data.session.close(); }
      },
      message(ws, message) { if (typeof message !== 'string') ws.data.session?.close(); else ws.data.session?.fromClient(message); },
      close(ws) { ws.data.session?.close(); sessions.delete(ws.data); },
    },
  });
  return { url: `ws://127.0.0.1:${server.port}/session`, close() { for (const session of sessions) session.session?.close(); server.stop(true); } };
}

/** Preserve the stdin/stdout interface expected by the unmodified Hermes client. */
export async function forwardCodexStdio(options: { url: string; token: string; input?: Readable; output?: Writable }): Promise<void> {
  let url: URL;
  try { url = new URL(options.url); } catch { throw new Error('Invalid Codex bridge address.'); }
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(options.token)) throw new Error('Invalid project Codex capability.');
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Codex bridge needs a WebSocket address without credentials in its URL.');
  if (url.protocol === 'ws:' && !['127.0.0.1', 'localhost', '[::1]', 'host.docker.internal'].includes(url.hostname)) throw new Error('Nonlocal Codex forwarding requires TLS.');
  const input = options.input ?? process.stdin, output = options.output ?? process.stdout;
  await new Promise<void>((resolve, reject) => {
    // Bun accepts headers; DOM typings otherwise hide its constructor overload.
    const BunWebSocket = WebSocket as unknown as { new(url: string, options: Bun.WebSocketOptions): WebSocket };
    const ws = new BunWebSocket(url.href, { headers: { authorization: `Bearer ${options.token}` } });
    const decoder = new StringDecoder('utf8');
    let buffer = '', settled = false;
    const timer = setTimeout(() => end(new Error('Codex bridge connection timed out.')), 10_000);
    const end = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); input.off('data', data); input.off('end', finish); input.off('error', fail); output.off('error', fail); ws.close(); error ? reject(error) : resolve(); };
    const fail = () => end(new Error('Codex bridge stream failed.'));
    const finish = () => end();
    const data = (chunk: Buffer | string) => {
      buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
      if (Buffer.byteLength(buffer) > MAX_FRAME) { fail(); return; }
      let at: number;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
        if (!line.trim()) continue;
        if (ws.bufferedAmount > MAX_FRAME) { fail(); return; }
        ws.send(line);
      }
    };
    ws.onopen = () => { clearTimeout(timer); input.on('data', data); input.once('end', finish); input.once('error', fail); output.once('error', fail); };
    ws.onmessage = event => {
      if (settled) return;
      if (typeof event.data !== 'string' || Buffer.byteLength(event.data) > MAX_FRAME || output.writableLength > MAX_FRAME) { fail(); return; }
      output.write(event.data + '\n');
    };
    ws.onerror = () => end(new Error('Codex bridge connection failed.'));
    ws.onclose = () => end(new Error('Codex bridge disconnected; host execution fallback is unavailable.'));
  });
}
