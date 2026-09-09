// The local Codex choice is a process runtime, not a credential source. These
// checks are shared by setup and startup; neither reads Codex's auth store.
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { checkCredentialDirectory } from './credentials.ts';

export function localCodexLogin(): boolean {
  const result = spawnSync('codex', ['login', 'status'], { encoding: 'utf8', timeout: 10_000 });
  // An API-key login is a different funding arrangement. Never print the raw
  // result: some CLI versions include account information in status output.
  return result.status === 0 && /logged in using ChatGPT/i.test(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
}

export function usesLocalCodex(config: any): boolean {
  return config?.model?.provider === 'local-codex' || config?.model?.api_mode === 'codex_app_server'
    || config?.model?.openai_runtime === 'codex_app_server';
}

export const LOCAL_CODEX_ACTIVATION_BLOCKED = 'Local Codex activation is unavailable: the host sidecar and container executor are not integrated and verified yet. Keep the fleet stopped; running Hermes as the host operator is not a supported substitute.';

// Fail before starting any fleet process. Native transport selection alone does
// not isolate agent tools from the operator's filesystem and credentials.
export function checkLocalCodexActivation(configs: any[], requested: boolean): void {
  if (requested || configs.some(usesLocalCodex)) throw new Error(LOCAL_CODEX_ACTIVATION_BLOCKED);
}

export function checkLocalCodexConfig(config: any): void {
  const provider = Array.isArray(config?.custom_providers) ? config.custom_providers.find((entry: any) => entry?.name === 'local-codex') : undefined;
  if (config?.model?.provider !== 'local-codex' || typeof config.model.default !== 'string' || !config.model.default.trim()
    || provider?.api_mode !== 'codex_app_server' || provider?.api_key !== 'local-codex'
    || provider?.base_url !== 'http://127.0.0.1:1/v1' || config.model.base_url || config.model.api_key
    || config?.terminal?.backend !== 'local' || config?.terminal?.home_mode === 'profile') {
    throw new Error('Local Codex requires the native codex_app_server configuration in SETUP.md, with the agreed local model. Configure it before setup; OAuth import and the codex-valve proxy are not local Codex.');
  }
}

export function checkLocalCodexProfiles(home: string): void {
  let model: string | undefined;
  for (const path of ['config.yaml', 'profiles/treasurer/config.yaml']) {
    const config = Bun.YAML.parse(readFileSync(join(home, path), 'utf8')) as any;
    checkLocalCodexConfig(config);
    if (model && model !== config.model.default) throw new Error('The pinned Hermes runtime uses the local Codex model for both profiles. Reconcile their model labels with the model verified in Codex.');
    model = config.model.default;
  }
}

// Probe the installed CLI's native protocol, not its authentication files. A project
// database avoids contending with the interactive client's history/log migrations.
// Cold startup can backfill session metadata before initialize; warm startup is fast.
export async function probeLocalCodex(options: { stateDir: string; model: string; binary?: string; startupTimeoutMs?: number }): Promise<{ accountType: 'chatgpt'; model: string }> {
  if (!options.model.trim()) throw new Error('Choose the local Codex model before checking access.');
  const stateDir = checkCredentialDirectory(options.stateDir);
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  chmodSync(stateDir, 0o700);
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'NODE_EXTRA_CA_CERTS', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  // Existing environments.toml takes precedence over the native environment variable.
  // Do not rewrite it or claim this read-only check disables an owner's configured tools.
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  if (existsSync(join(codexHome, 'environments.toml'))) throw new Error('Codex has an explicit environments.toml. Reconcile that configuration before the isolated runtime check; it was not changed.');
  Object.assign(env, { CODEX_HOME: codexHome, CODEX_SQLITE_HOME: stateDir, CODEX_EXEC_SERVER_URL: 'none', RUST_LOG: 'error' });
  const child = spawn(options.binary ?? 'codex', ['app-server', '-c', `sqlite_home=${JSON.stringify(stateDir)}`], {
    env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'ignore'],
  });
  let nextId = 0;
  let buffer = '';
  let failed: Error | undefined;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const fail = (message: string) => {
    failed ??= new Error(message);
    for (const request of pending.values()) request.reject(failed);
    pending.clear();
  };
  child.on('error', () => fail('The installed Codex app-server could not start. No login or model check completed.'));
  child.on('exit', () => fail('Codex app-server ended before verification completed. Its raw diagnostics were not published.'));
  child.stdin.on('error', () => fail('The Codex protocol connection closed before verification completed.'));
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    if (buffer.length > 2 * 1024 * 1024) { fail('Codex returned an oversized protocol response.'); return; }
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message: any;
      try { message = JSON.parse(line); }
      catch { fail('Codex returned invalid protocol data; raw output was not published.'); return; }
      if (message.method) {
        // No tool, approval or authentication callback is permitted by this probe.
        if (message.id !== undefined) child.stdin.write(`${JSON.stringify({ id: message.id, error: { code: -32601, message: 'Read-only setup verification does not accept callbacks.' } })}\n`);
        continue;
      }
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      if (message.error) request.reject(new Error('Codex rejected a setup protocol request. Its raw response was not published.'));
      else request.resolve(message.result);
    }
  });
  async function request(method: string, params: object, timeoutMs = 10_000): Promise<any> {
    if (failed) throw failed;
    const id = ++nextId;
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(method === 'initialize'
            ? 'Codex initialization timed out while preparing local state. Inspect native startup/database health; this does not establish a login failure.'
            : 'Codex account/model verification timed out; no access was confirmed.'));
        }, timeoutMs);
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      });
    } finally { clearTimeout(timer!); }
  }
  try {
    await request('initialize', { clientInfo: { name: 'open-autonomy-setup', version: '1' } }, options.startupTimeoutMs ?? 180_000);
    child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
    const account = await request('account/read', { refreshToken: false });
    if (account?.account?.type !== 'chatgpt') throw new Error('The installed Codex did not confirm a ChatGPT login. Reconcile the selected allowance locally.');
    const models = await request('model/list', {});
    if (!models?.data?.some((entry: any) => entry.id === options.model)) throw new Error('The agreed model was not listed by the installed Codex. Reconcile the model choice before activation.');
    return { accountType: 'chatgpt', model: options.model };
  } finally {
    child.stdout.removeAllListeners('data');
    child.stdin.end();
    const stop = (signal: NodeJS.Signals) => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* This owned process already exited. */ } };
    stop('SIGTERM');
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => { const timer = setTimeout(() => { stop('SIGKILL'); resolve(); }, 1000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    }
  }
}
