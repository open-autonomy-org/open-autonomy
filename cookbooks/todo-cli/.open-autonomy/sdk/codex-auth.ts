// Host-only authentication through the installed Codex. Codex owns its credential
// store and refresh; OA never reads, copies or writes the login. A short-lived
// app-server reads the current login on every acquisition, including account switches.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface CodexAccess { accessToken: string; accountId: string }
const unavailable = () => new Error('Codex login unavailable. Verify `codex login status` as the host service user, using its CODEX_HOME, and sign in with ChatGPT if needed.');

export async function codexAccess(options: { home?: string; rejectedToken?: string } = {}): Promise<CodexAccess> {
  const child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
    env: { ...process.env, ...(options.home ? { CODEX_HOME: options.home } : {}) },
    // Neither Codex diagnostics nor protocol bodies may enter the public stream.
    stdio: ['pipe', 'pipe', 'ignore'],
    detached: process.platform !== 'win32',
  });
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  let id = 0, failed = false;
  const fail = () => {
    failed = true;
    for (const waiter of pending.values()) waiter.reject(unavailable());
    pending.clear();
  };
  child.on('error', fail);
  child.on('exit', fail);
  child.stdin.on('error', fail);
  lines.on('line', line => {
    try {
      const message = JSON.parse(line), waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(unavailable()); else waiter.resolve(message.result);
    } catch { fail(); }
  });
  const send = (message: unknown) => child.stdin.write(JSON.stringify(message) + '\n');
  const request = (method: string, params: unknown): Promise<any> => new Promise((resolve, reject) => {
    if (failed) { reject(unavailable()); return; }
    const key = ++id;
    pending.set(key, { resolve, reject });
    send({ id: key, method, params });
  });
  const stop = () => {
    try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* already exited */ }
  };
  const timer = setTimeout(() => { fail(); stop(); }, 120_000);
  try {
    await request('initialize', { clientInfo: { name: 'open_autonomy', version: '1' }, capabilities: {} });
    send({ method: 'initialized' });
    const read = async (refreshToken: boolean) => {
      const value = await request('getAuthStatus', { includeToken: true, refreshToken });
      if (value?.authMethod !== 'chatgpt' || typeof value.authToken !== 'string' || !value.authToken) throw unavailable();
      return value.authToken as string;
    };
    const claims = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    let token = await read(false);
    if (token === options.rejectedToken || Number(claims(token).exp ?? 0) * 1000 < Date.now() + 300_000) token = await read(true);
    const accountId = claims(token)['https://api.openai.com/auth']?.chatgpt_account_id;
    if (typeof accountId !== 'string' || !accountId) throw unavailable();
    return { accessToken: token, accountId };
  } catch { throw unavailable(); }
  finally {
    clearTimeout(timer);
    lines.close();
    child.stdin.destroy();
    child.stdout.destroy();
    stop();
    await closed;
  }
}
