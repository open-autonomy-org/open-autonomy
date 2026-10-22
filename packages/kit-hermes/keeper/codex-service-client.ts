// Acquire the independently serving host proxy. The kernel arbitrates the port; a failed contender owns no listener.
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

type Identity = { service: string; protocol: number; binding: string; instance: string; pid: number };

export async function ensureCodexService({ port, directory, environment }: { port: number; directory: string; environment: Record<string, string> }): Promise<Identity> {
  const codexHome = resolve(environment.CODEX_HOME || resolve(environment.HOME || homedir(), '.codex'));
  const binding = createHash('sha256').update(codexHome).digest('hex');
  const ready = async (): Promise<Identity | null> => {
    let response: Response;
    try { response = await fetch(`http://127.0.0.1:${port}/readyz`, { signal: AbortSignal.timeout(1000) }); }
    catch (error) {
      // Only a refused connection means no listener. A timeout is never permission to replace a serving process.
      if ((error as { cause?: { code?: string }; code?: string }).cause?.code === 'ECONNREFUSED' || ['ConnectionRefused', 'ECONNREFUSED'].includes((error as { code?: string }).code ?? '')) return null;
      throw new Error(`Codex proxy :${port} readiness could not be read; the listener was left serving`, { cause: error });
    }
    const value = response.ok ? await response.json().catch(() => null) as Identity | null : null;
    if (value?.service !== 'open-autonomy-codex-proxy' || value.protocol !== 1 || value.binding !== binding || !value.instance || !(value.pid > 0)) {
      throw new Error(`Codex proxy :${port} belongs to another service or Codex home. It was left serving; stage the successor on a separate --codex-proxy-port.`);
    }
    return value;
  };
  const existing = await ready();
  if (existing) return existing;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const log = openSync(resolve(directory, 'codex-proxy.log'), 'a', 0o600);
  const instance = randomUUID();
  const child = spawn(process.execPath, [resolve(import.meta.dir, 'codex-service.ts'), String(port), binding, instance], {
    env: environment, cwd: directory, detached: true, stdio: ['ignore', log, log],
  });
  closeSync(log);
  // Readiness is one bounded startup operation. Neither this acquisition nor a keeper stop kills an existing proxy.
  let failed: Error | undefined;
  child.on('error', error => { failed = error; });
  child.unref();
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    if (failed) throw failed;
    const identity = await ready();
    if (identity) return identity;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Codex proxy start ended (${child.exitCode ?? child.signalCode}); inspect ${resolve(directory, 'codex-proxy.log')}. No serving process was stopped.`);
    await Bun.sleep(50);
  }
  throw new Error(`Codex proxy :${port} did not report readiness; no serving process was stopped. Inspect ${resolve(directory, 'codex-proxy.log')}.`);
}
