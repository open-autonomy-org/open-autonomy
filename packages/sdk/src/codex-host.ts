// Host-owned native Codex processes. Authentication stays in the installed CLI;
// a project receives only the restricted bridge after account and runtime checks.
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, posix } from 'node:path';
import { checkCredentialDirectory } from './credentials.ts';
import { serveCodexBridge, type CodexBridgeBackend } from './codex-bridge.ts';

type Packet = Record<string, any>;
const MAX_FRAME = 2 * 1024 * 1024;
const SERVER = 'open_autonomy_hermes';
const DISABLED = ['hooks', 'plugins', 'apps', 'in_app_browser', 'browser_use', 'browser_use_external', 'memory_tool', 'external_agent_memory_import', 'multi_agent_v2', 'skill_mcp_dependency_install'];
const envKeys = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'NODE_EXTRA_CA_CERTS', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY'];
const object = (v: any): v is Packet => !!v && typeof v === 'object' && !Array.isArray(v);
const CONTEXT_KEYS = ['HERMES_HOME', 'HERMES_KANBAN_TASK', 'HERMES_KANBAN_RUN_ID', 'HERMES_KANBAN_DB', 'HERMES_KANBAN_BOARD', 'HERMES_KANBAN_WORKSPACE', 'HERMES_KANBAN_WORKSPACES_ROOT', 'HERMES_KANBAN_CLAIM_LOCK', 'HERMES_SESSION_ID'];
const toml = (v: any): string => Array.isArray(v) ? `[${v.map(toml).join(',')}]` : object(v)
  ? `{${Object.entries(v).map(([k, value]) => `${JSON.stringify(k)}=${toml(value)}`).join(',')}}` : JSON.stringify(v);

/** Native protocol ownership includes bounded buffers, request deadlines and process cleanup. */
class NativeCodex {
  private child: ReturnType<typeof spawn>;
  private pending = new Map<string, { resolve: (p: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private sequence = 0;
  private ended = false;
  private killTimer?: ReturnType<typeof setTimeout>;
  receive?: (raw: string) => void;
  disconnected?: () => void;
  constructor(binary: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
    this.child = spawn(binary, ['app-server', ...args], { cwd, env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'ignore'] });
    let buffer = '';
    this.child.stdout!.setEncoding('utf8');
    this.child.stdout!.on('data', (chunk: string) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_FRAME) { this.close(); return; }
      let at: number;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
        if (!line.trim()) continue;
        let p: Packet;
        try { p = JSON.parse(line); if (!object(p)) throw Error(); } catch { this.close(); return; }
        const pending = this.pending.get(p.id);
        if (pending) {
          this.pending.delete(p.id); clearTimeout(pending.timer);
          p.error ? pending.reject(new Error('Native Codex rejected host verification; raw diagnostics were withheld.')) : pending.resolve(p.result);
        } else if (this.receive) this.receive(line);
        else if (p.id !== undefined && p.method) this.write({ id: p.id, error: { code: -32601, message: 'Host verification does not accept callbacks.' } });
      }
    });
    this.child.on('error', () => this.close());
    this.child.on('exit', () => { clearTimeout(this.killTimer); this.close(); });
    this.child.stdin!.on('error', () => this.close());
  }
  write(p: Packet): void {
    if (this.ended) throw new Error('The native Codex process is closed.');
    const raw = JSON.stringify(p) + '\n';
    if (Buffer.byteLength(raw) > MAX_FRAME || this.child.stdin!.writableLength > MAX_FRAME) { this.close(); throw new Error('Native Codex protocol capacity exceeded.'); }
    this.child.stdin!.write(raw);
  }
  request(method: string, params: Packet, timeoutMs = 10_000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.ended || this.pending.size >= 16) { reject(new Error('Native Codex is unavailable.')); return; }
      const id = `oa-host:${++this.sequence}`;
      const timer = setTimeout(() => { this.close(); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); } catch { this.close(); }
    });
  }
  async initialize(timeoutMs: number): Promise<void> {
    await this.request('initialize', { clientInfo: { name: 'open-autonomy-host', version: '1' }, capabilities: { experimentalApi: true } }, timeoutMs);
    this.write({ method: 'initialized' });
  }
  close(): void {
    if (this.ended) return;
    this.ended = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Native Codex verification ended or timed out; raw diagnostics were withheld.')); }
    this.pending.clear();
    const stop = (signal: NodeJS.Signals) => {
      try { if (process.platform !== 'win32' && this.child.pid) process.kill(-this.child.pid, signal); else this.child.kill(signal); } catch { /* Owned process already ended. */ }
    };
    stop('SIGTERM');
    if (this.child.exitCode === null && this.child.signalCode === null) { this.killTimer = setTimeout(() => stop('SIGKILL'), 1000); this.killTimer.unref(); }
    this.disconnected?.();
  }
}

export interface CodexHostOptions {
  model: string;
  workspace: string;
  hermesHome: string;
  executorUrl: string;
  stateDir: string;
  token: string;
  port?: number;
  binary?: string;
  startupTimeoutMs?: number;
}

function checkConfig(config: any): void {
  if (!object(config) || config.model_provider !== 'openai'
    || DISABLED.some(key => config.features?.[key] !== false)
    || config.features?.skip_host_skill_discovery !== true
    || (config.notify?.length ?? 0) !== 0
    || config.shell_environment_policy?.inherit !== 'none'
    || Object.keys(config.shell_environment_policy?.set ?? {}).length
    || Object.keys(config.model_providers?.openai ?? {}).length) {
    throw new Error('Codex configuration does not preserve the project host boundary. Reconcile managed settings, shell environment overrides or an overridden OpenAI provider; global configuration was not changed.');
  }
}

function sessionContext(request: Request, options: CodexHostOptions): Record<string, string> {
  const raw = request.headers.get('x-open-autonomy-context') ?? '{}';
  if (raw.length > 4096) throw Error('Oversized context');
  const context = JSON.parse(raw);
  if (!object(context) || Object.entries(context).some(([k, v]) => !CONTEXT_KEYS.includes(k) || typeof v !== 'string' || !v || v.length > 512 || /[\x00-\x1f]/.test(v))) throw Error('Invalid context');
  const home = context.HERMES_HOME ?? options.hermesHome;
  if (home !== options.hermesHome && !new RegExp(`^${options.hermesHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/profiles/[A-Za-z0-9_-]+$`).test(home)) throw Error('Invalid profile');
  if (context.HERMES_KANBAN_TASK) {
    if (!/^t_[a-zA-Z0-9_-]+$/.test(context.HERMES_KANBAN_TASK) || !/^[1-9][0-9]*$/.test(context.HERMES_KANBAN_RUN_ID ?? '') || !context.HERMES_KANBAN_DB) throw Error('Incomplete worker context');
  } else if (Object.keys(context).some(k => k.startsWith('HERMES_KANBAN_'))) throw Error('Worker context without a task');
  for (const key of ['HERMES_KANBAN_DB', 'HERMES_KANBAN_WORKSPACE', 'HERMES_KANBAN_WORKSPACES_ROOT']) {
    const path = context[key];
    if (path && (posix.normalize(path) !== path || ![options.hermesHome, options.workspace].some(root => path === root || path.startsWith(root + '/')))) throw Error('Invalid container path');
  }
  return { ...context, HERMES_HOME: home };
}

/** A persistent, loopback-only bridge; this does not start the Hermes fleet. */
export async function startCodexHost(options: CodexHostOptions) {
  const executor = new URL(options.executorUrl);
  if (executor.protocol !== 'ws:' || !['127.0.0.1', '[::1]'].includes(executor.hostname) || executor.username || executor.password || executor.search || executor.hash) {
    throw new Error('The native executor must be on the protected host loopback connection.');
  }
  for (const path of [options.workspace, options.hermesHome]) if (!posix.isAbsolute(path) || path === '/' || posix.normalize(path) !== path) throw new Error('Container workspace and Hermes home must be normalized absolute paths.');
  if (!options.model.trim()) throw new Error('The agreed Codex model is required.');
  const stateDir = checkCredentialDirectory(options.stateDir);
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  chmodSync(stateDir, 0o700);
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  if (existsSync(join(codexHome, 'environments.toml'))) throw new Error('Reconcile the installed Codex environments.toml before starting the project host; it was not changed.');
  const env: NodeJS.ProcessEnv = Object.fromEntries(envKeys.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
  Object.assign(env, { CODEX_HOME: codexHome, CODEX_SQLITE_HOME: stateDir, CODEX_EXEC_SERVER_URL: options.executorUrl, RUST_LOG: 'error' });
  const fixed = {
    model: options.model, model_provider: 'openai', sqlite_home: stateDir, notify: [],
    features: { ...Object.fromEntries(DISABLED.map(k => [k, false])), skip_host_skill_discovery: true },
    shell_environment_policy: { inherit: 'none' },
  };
  const cli = (values: Packet) => Object.entries(values).flatMap(([k, value]) => ['-c', `${k}=${toml(value)}`]);
  const binary = options.binary ?? 'codex';
  const timeout = options.startupTimeoutMs ?? 180_000;
  // Discover configuration through Codex itself. No thread, tool or model request
  // is permitted here, and no account/config packet is returned to the container.
  const discovery = new NativeCodex(binary, cli(fixed), { ...env, CODEX_EXEC_SERVER_URL: 'none' }, stateDir);
  let servers: Packet;
  try {
    await discovery.initialize(timeout);
    const account = await discovery.request('account/read', { refreshToken: false });
    if (account?.account?.type !== 'chatgpt') throw new Error('The project host requires the installed Codex ChatGPT login. No API-key fallback is allowed.');
    const models = await discovery.request('model/list', {});
    if (!models?.data?.some((m: any) => m.id === options.model)) throw new Error('The agreed model is unavailable in the installed Codex.');
    const result = await discovery.request('config/read', { includeLayers: false });
    checkConfig(result?.config);
    const names = Object.keys(result.config.mcp_servers ?? {});
    if (names.includes(SERVER)) throw new Error('The project MCP server name is already configured globally; reconcile it before starting the host.');
    servers = Object.fromEntries(names.map(name => [name, { enabled: false }]));
  } finally { discovery.close(); }
  const children = new Set<NativeCodex>();
  let stopped = false;
  const bridge = serveCodexBridge({ token: options.token, port: options.port,
    policy: { model: options.model, modelProvider: 'openai', workspace: options.workspace, environmentId: 'remote', externalSandbox: true },
    context: request => sessionContext(request, options),
    connect(receive, disconnected, context): CodexBridgeBackend {
      if (stopped) throw new Error('Project host stopped.');
      const mcp = { command: '/opt/hermes/.venv/bin/python', args: ['-m', 'agent.transports.hermes_tools_mcp_server'], cwd: '/opt/hermes',
        environment_id: 'remote', required: true, startup_timeout_sec: 12,
        env: { HOME: context.HERMES_HOME, HERMES_DISABLE_LAZY_INSTALLS: '1', HERMES_LAZY_INSTALL_TARGET: '', ...context },
        enabled_tools: ['skills_list', 'skill_view', 'kanban_show', 'kanban_list', 'kanban_create', 'kanban_unblock', 'kanban_link', 'kanban_complete', 'kanban_block', 'kanban_request_review', 'kanban_request_changes', 'kanban_comment', 'kanban_heartbeat'] };
      const child = new NativeCodex(binary, cli({ ...fixed, mcp_servers: { ...servers, [SERVER]: mcp } }), env, stateDir);
      children.add(child);
      let ready = false, ended = false;
      const waiting: Packet[] = [];
      const close = () => { if (ended) return; ended = true; children.delete(child); child.close(); };
      child.disconnected = () => { close(); disconnected(); };
      const send = (p: Packet) => {
        if (p.method === 'initialize') receive(JSON.stringify({ id: p.id, result: { userAgent: 'open-autonomy-host' } }));
        else if (p.method !== 'initialized') child.write(p);
      };
      void (async () => {
        await child.initialize(timeout);
        const account = await child.request('account/read', { refreshToken: false });
        if (account?.account?.type !== 'chatgpt') throw new Error('Codex login changed.');
        const result = await child.request('config/read', { includeLayers: false });
        checkConfig(result?.config);
        const effective = result.config.mcp_servers ?? {};
        if (Object.entries(effective).some(([name, c]) => name !== SERVER && (c as any).enabled !== false)
          || effective[SERVER]?.enabled === false
          || effective[SERVER]?.command !== mcp.command || effective[SERVER]?.cwd !== mcp.cwd
          || JSON.stringify(effective[SERVER]?.args) !== JSON.stringify(mcp.args)
          || JSON.stringify(effective[SERVER]?.enabled_tools) !== JSON.stringify(mcp.enabled_tools)
          || Object.keys(effective[SERVER]?.env ?? {}).length !== Object.keys(mcp.env).length
          || Object.entries(mcp.env).some(([k, v]) => effective[SERVER]?.env?.[k] !== v)
          || effective[SERVER]?.environment_id !== 'remote' || effective[SERVER]?.required !== true) throw new Error('Codex tool configuration changed during startup.');
        if (ended) return;
        child.receive = receive; ready = true;
        for (const p of waiting.splice(0)) send(p);
      })().catch(() => { close(); disconnected(); });
      return { write(p) { if (ended) throw new Error('Project session closed.'); if (ready) send(p); else if (waiting.length < 2) waiting.push(p); else close(); }, close };
    },
  });
  return { url: bridge.url, close() { if (stopped) return; stopped = true; bridge.close(); for (const child of children) child.close(); children.clear(); } };
}
