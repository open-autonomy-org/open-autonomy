#!/usr/bin/env bun
// Pull request events through hookline (company RFC 0026 decision 4): the install attaches to its hookline inbox as a
// socket target, one outbound connection with no tunnel and no inbound port, and turns each event into one message to
// its manager's session. It replaces a webhook tunnel and its local script.
//
// The keeper runs this when <secrets>/hookline.env exists:
//   HOOKLINE_INBOX        the inbox's websocket origin (wss://hookline.<you>.workers.dev)
//   HOOKLINE_READ_TOKEN   the inbox's read token (the socket handshake is a guarded read)
//   HOOKLINE_TARGET       this install's socket target's name (PUT /targets/<name> {"url":"hookline-socket:<name>"})
//   HOOKLINE_MAIL_TO      who is told; default `manager`, the install's manager agent on this machine
//
// The wire is hookline's socket protocol (hookline src/socket-targets.ts): stop-and-wait frames, each answered ack
// once its message is sent, or nack to be sent again on the inbox's schedule. Hookline delivers each event exactly once
// and in order. A replay (X-Hookline-Replay) or a re-send of an event already told is acknowledged and not told again:
// the event ids already told are kept in --state. Events that are not about a pull request are acknowledged and left.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const envFile = arg('--env');
const fileEnv: Record<string, string> = {};
if (envFile && existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (m) fileEnv[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
}
const setting = (name: string): string | undefined => fileEnv[name] ?? process.env[name];
const inbox = setting('HOOKLINE_INBOX')?.replace(/\/+$/, '');
const token = setting('HOOKLINE_READ_TOKEN');
const target = setting('HOOKLINE_TARGET') ?? 'install';
const mailTo = setting('HOOKLINE_MAIL_TO') ?? 'manager';
const supercode = process.env.SUPERCODE_BIN || 'supercode';
const stateFile = arg('--state');
const say = (m: string) => console.log(`hookline: ${m}`);
if (!inbox || !/^wss?:\/\//.test(inbox) || !token) { say(`${envFile ?? 'its env'} names no HOOKLINE_INBOX (ws:// or wss://) and HOOKLINE_READ_TOKEN; nothing to attach to`); process.exit(2); }

// The event ids already told, newest last, bounded.
const told: string[] = stateFile && existsSync(stateFile) ? (() => { try { return JSON.parse(readFileSync(stateFile, 'utf8')) as string[]; } catch { return []; } })() : [];
const toldSet = new Set(told);
const remember = (id: string) => {
  told.push(id); toldSet.add(id);
  while (told.length > 5000) toldSet.delete(told.shift()!);
  if (stateFile) writeFileSync(stateFile, JSON.stringify(told));
};

type Headers = Array<[string, string]>;
const header = (headers: Headers, name: string): string | undefined => headers.find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1];

/** One line about a pull request event, or undefined for an event that is not about one. */
export function describe(headers: Headers, body: string): string | undefined {
  const kind = header(headers, 'X-Hookline-Original-X-GitHub-Event');
  let p: Record<string, any>;
  try { p = JSON.parse(body); } catch { return undefined; }
  const repo = p.repository?.full_name ?? '?';
  const pr = p.pull_request ?? (p.issue?.pull_request ? p.issue : undefined);
  if (!pr) return undefined;
  const ref = `${repo}#${pr.number} "${pr.title ?? ''}" ${pr.html_url ?? ''}`.trim();
  const who = p.sender?.login ? ` by ${p.sender.login}` : '';
  if (kind === 'pull_request') return `pull request ${p.action === 'closed' ? (pr.merged ? 'merged' : 'closed unmerged') : p.action}${who}: ${ref}${p.action === 'synchronize' && p.after ? ` (head ${String(p.after).slice(0, 8)})` : ''}`;
  if (kind === 'pull_request_review') return `review ${p.review?.state ?? p.action}${who}: ${ref}${p.review?.body ? `\n\n${String(p.review.body).slice(0, 2000)}` : ''}`;
  if (kind === 'pull_request_review_comment') return `review comment ${p.action}${who} on ${p.comment?.path ?? 'a file'}: ${ref}\n\n${String(p.comment?.body ?? '').slice(0, 2000)}`;
  if (kind === 'issue_comment') return `comment ${p.action}${who}: ${ref}\n\n${String(p.comment?.body ?? '').slice(0, 2000)}`;
  return undefined;
}

/** The session to tell: an address (`sc:<machine>:<harness>:<id>`) names one session; any other name is an agent, whose
 *  main session the agent mailbox finds (`manager`). */
const locator = /^sc:[^:]+:([^:]+):(.+)$/.exec(mailTo) ? { harness: mailTo.split(':')[2]!, session_id: mailTo.split(':').slice(3).join(':') } : { harness: 'agent', session_id: mailTo.replace(/^sc:[^:]+:agent:/, '') };

/** One request to supercode's session service from a named sender (`hookline`), as the skew's no-model jobs send: a
 *  service is no session, so `message send` (which answers from the calling session) cannot carry it. */
async function tell(event: string, line: string): Promise<boolean> {
  const serve = Bun.spawn({ cmd: [supercode, 'harness', 'serve'], stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  const request = { jsonrpc: '2.0', id: 1, method: 'harness.v1.sessions.message', params: { locator, text: `${line}\n\n(hookline event ${event})`, from_name: 'hookline', subject: line.split('\n')[0]!.slice(0, 120) } };
  serve.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'harness.v1.capabilities', params: {} })}\n${JSON.stringify(request)}\n`);
  serve.stdin.flush();
  let answer: { result?: { delivered_to_bus?: boolean; refusal?: { message?: string } }; error?: { message?: string } } | undefined;
  const reader = serve.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = setTimeout(() => serve.kill(), 60_000);
  try {
    while (!answer) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value);
      for (const row of buffer.split('\n')) { try { const parsed = JSON.parse(row); if (parsed.id === 1) answer = parsed; } catch { /* a partial line */ } }
      buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
    }
  } finally { clearTimeout(deadline); serve.kill(); }
  if (answer?.result?.delivered_to_bus === true) return true;
  say(`telling ${mailTo} about ${event} failed: ${answer?.error?.message ?? answer?.result?.refusal?.message ?? 'no answer from supercode harness serve'}`);
  return false;
}

let socket: WebSocket | undefined;
const attach = (): void => {
  const ws = new WebSocket(`${inbox}/targets/${encodeURIComponent(target)}/socket?token=${encodeURIComponent(token)}`);
  socket = ws;
  ws.onopen = () => say(`attached to ${inbox} as ${JSON.stringify(target)}; telling ${mailTo}`);
  ws.onmessage = async (message) => {
    if (typeof message.data !== 'string') return;
    let f: { delivery?: number; attempt?: number; event?: string; headers?: Headers; body?: string };
    try { f = JSON.parse(message.data); } catch { say('a frame is not JSON; ignored'); return; }
    if (!Number.isInteger(f.delivery) || !Number.isInteger(f.attempt) || typeof f.event !== 'string' || !Array.isArray(f.headers) || typeof f.body !== 'string') { say('a malformed frame; ignored'); return; }
    let ok = true;
    let status = 200;
    if (!toldSet.has(f.event)) {
      let body = '';
      try { body = new TextDecoder().decode(Uint8Array.from(atob(f.body), (c) => c.charCodeAt(0))); } catch { /* not text */ }
      const line = describe(f.headers, body);
      if (line) {
        ok = await tell(f.event, line);
        status = ok ? 200 : 502;
        if (ok) say(`${f.event}: told ${mailTo}: ${line.split('\n')[0]}`);
      }
      if (ok) remember(f.event);
    } else say(`${f.event}: already told${header(f.headers, 'X-Hookline-Replay') === 'true' ? ' (a replay)' : ''}; acknowledged`);
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(ok ? { v: 1, ack: f.delivery, attempt: f.attempt, status } : { v: 1, nack: f.delivery, attempt: f.attempt, status, error: `could not tell ${mailTo}` }));
  };
  ws.onclose = () => { if (socket !== ws) return; socket = undefined; setTimeout(attach, 1000); };
  ws.onerror = () => say('the socket errored; reattaching');
};
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { socket?.close(1000, 'stopping'); process.exit(0); });
attach();
