import { spawnWork, stopWorkChild } from './work-ledger.ts';
// Host-only authentication through the installed Codex. Codex owns its credential
// store and refresh; OA never reads, copies or writes the login. A short-lived
// app-server reads the current login on every acquisition, including account switches.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface CodexAccess { accessToken: string; accountId: string }
type Phase = 'startup' | 'authentication';
const unavailable = (phase: Phase) => new Error(phase === 'startup' ? 'Codex app-server did not initialize. Inspect the host Codex runtime; startup failure does not establish an invalid login.' : 'Codex login unavailable. Verify `codex login status` as the host service user, using its CODEX_HOME, and sign in with ChatGPT if needed.');

type AccessOptions = { home?: string; rejectedToken?: string; signal?: AbortSignal };
const acquisitions = new Map<string, Promise<CodexAccess>>();
const scopedAcquisitions = new WeakMap<AbortSignal, Map<string, Promise<CodexAccess>>>();

// Coalesce concurrent requests without caching credentials after acquisition. A new
// acquisition still observes account changes through a fresh native Codex process.
export function codexAccess(options: AccessOptions = {}): Promise<CodexAccess> {
  const key = options.home ?? '';
  let owned = acquisitions;
  if (options.signal) {
    owned = scopedAcquisitions.get(options.signal) ?? new Map();
    scopedAcquisitions.set(options.signal, owned);
  }
  const current = owned.get(key);
  if (current) return current.then(access => options.rejectedToken === access.accessToken
    ? codexAccess(options) : access);
  const pending = acquire(options).finally(() => owned.delete(key));
  owned.set(key, pending);
  return pending;
}

async function acquire(options: AccessOptions): Promise<CodexAccess> {
  options.signal?.throwIfAborted();
  let phase: Phase = 'startup';
  const child = spawnWork(() => spawn('codex', ['app-server', '--listen', 'stdio://'], {
    env: { ...process.env, ...(options.home ? { CODEX_HOME: options.home } : {}) },
    // Neither Codex diagnostics nor protocol bodies may enter the public stream.
    stdio: ['pipe', 'pipe', 'ignore'],
    detached: process.platform !== 'win32',
  }), 'node');
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  let id = 0, failed = false;
  const fail = (error = unavailable(phase)) => {
    failed = true;
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  };
  child.on('error', () => fail());
  child.on('exit', () => fail());
  child.stdin.on('error', () => fail());
  child.stdout.on('error', () => fail());
  lines.on('close', () => fail());
  lines.on('line', line => {
    try {
      const message = JSON.parse(line), waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(unavailable(phase)); else waiter.resolve(message.result);
    } catch { fail(); }
  });
  const send = (message: unknown) => child.stdin.write(JSON.stringify(message) + '\n');
  const request = (method: string, params: unknown): Promise<any> => new Promise((resolve, reject) => {
    if (failed) { reject(options.signal?.aborted ? options.signal.reason : unavailable(phase)); return; }
    const key = ++id;
    pending.set(key, { resolve, reject });
    send({ id: key, method, params });
  });
  const stop = () => {
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
    stopWorkChild(child, () => process.platform !== 'win32' ? process.kill(-child.pid!, 'SIGKILL') : child.kill('SIGKILL'), { signal: 'SIGKILL' });
  };
  let failure: unknown, cleanup: unknown;
  const abort = () => { fail(options.signal?.reason); try { stop(); } catch (error) { cleanup = error; } };
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  // Codex may run its own database maintenance before initialize responds. Do not
  // repeatedly kill that maintenance and restart it with the next request.
  // Native process exit still rejects initialization; overlapping callers share it.
  try {
    await request('initialize', { clientInfo: { name: 'open_autonomy', version: '1' }, capabilities: {} });
    phase = 'authentication';
    send({ method: 'initialized' });
    const read = async (refreshToken: boolean) => {
      const value = await request('getAuthStatus', { includeToken: true, refreshToken });
      if (value?.authMethod !== 'chatgpt' || typeof value.authToken !== 'string' || !value.authToken) throw unavailable(phase);
      return value.authToken as string;
    };
    const claims = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    let token = await read(false);
    if (token === options.rejectedToken || Number(claims(token).exp ?? 0) * 1000 < Date.now() + 300_000) token = await read(true);
    const accountId = claims(token)['https://api.openai.com/auth']?.chatgpt_account_id;
    if (typeof accountId !== 'string' || !accountId) throw unavailable(phase);
    return { accessToken: token, accountId };
  } catch { failure = options.signal?.aborted ? options.signal.reason : unavailable(phase); throw failure; }
  finally {
    options.signal?.removeEventListener('abort', abort);
    lines.close();
    child.stdin.destroy();
    // Continue consuming protocol bytes until native close; destroying stdout
    // before joining can discard its actual completion.
    child.stdout.resume();
    try { stop(); } catch (error) { cleanup = error; }
    await closed;
    if (cleanup) throw new AggregateError([...(failure ? [failure] : []), cleanup], 'Codex authentication cleanup failed');
  }
}
