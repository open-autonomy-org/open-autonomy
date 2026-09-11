// Paths and vendor helpers for Open Autonomy's World scenario.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const SCENARIO = import.meta.dir;
export const TREE = resolve(SCENARIO, '..');
export const ROOT = resolve(TREE, 'cookbooks/todo-cli');
export const NAME = process.env.OA_WORLD_NAME ?? 'open-autonomy-todo-cli';
export const STATE = resolve(process.env.WORLD_STATE_ROOT ?? resolve(TREE, '..', 'open-autonomy-world'));
export const DATA = process.env.VOLTER_WORLD_DATA ?? resolve(STATE, '.volter/worlds', NAME, 'data');
export const STACK = resolve(DATA, 'agent');
export const SECRETS = resolve(DATA, 'secrets');
export const ACCOUNT = 'cookbook/todo-cli';
export const ENC = encodeURIComponent(ACCOUNT);
export const [OWNER, REPO_NAME] = ACCOUNT.split('/');
const config = readFileSync(resolve(ROOT, '.open-autonomy/config.yaml'), 'utf8');
export const MODEL = process.env.OPEN_AUTONOMY_MODEL ?? 'zai/glm-5.3-flash';
export const CONFIG = { models: (/^models:\s*\[([^\]]*)\]/m.exec(config)?.[1] ?? '').split(',').map(s => s.trim()).filter(Boolean) };
export function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; run this command through volter-world attach`);
  return value;
}
export const hermesBin = (): string => need('WORLD_HERMES_BIN');
export const homeChannel = (): string => {
  const text = readFileSync(resolve(SECRETS, 'channels.env'), 'utf8');
  const channel = /^DISCORD_HOME_CHANNEL=(.+)$/m.exec(text)?.[1];
  if (!channel) throw new Error('scenario has no seeded Discord home channel');
  return channel;
};
export interface ScenarioContext { world: Record<string, string>; name: string; data: string; secrets: string; stack: { project: string; home: string }; account: string; root: string; log: (m: string) => void }
export const context = (log = console.log): ScenarioContext => ({ world: process.env as Record<string, string>, name: NAME, data: DATA, secrets: SECRETS, stack: { project: resolve(STACK, 'project'), home: resolve(STACK, 'home') }, account: ACCOUNT, root: ROOT, log });

export function api(base: string, headers: Record<string, string> = {}) {
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, text, headers: res.headers };
  };
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), put: (p: string, b?: unknown) => call('PUT', p, b), patch: (p: string, b?: unknown) => call('PATCH', p, b), del: (p: string) => call('DELETE', p) };
}

// A git call that hangs (a twin that stopped answering) fails loudly after ten minutes.
export async function git(cwd: string, ...args: string[]): Promise<string> {
  const p = Bun.spawn({ cmd: ['git', ...args], cwd, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const killer = setTimeout(() => p.kill(), 600_000);
  const [code, out, err] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]);
  clearTimeout(killer);
  if (code !== 0) throw new Error(`git ${args.join(' ')} failed (${code}) in ${cwd}\n${err}`);
  return out.trim();
}
export function sh(cmd: string[], opts: { quiet?: boolean; check?: boolean; env?: Record<string, string>; cwd?: string } = {}): { code: number; out: string; err: string } {
  const r = Bun.spawnSync({ cmd, cwd: opts.cwd ?? ROOT, stdout: 'pipe', stderr: opts.quiet ? 'pipe' : 'inherit', env: { ...process.env, ...opts.env } });
  const out = r.stdout.toString(); const err = opts.quiet ? r.stderr.toString() : '';
  if (opts.check !== false && r.exitCode !== 0) throw new Error(`${cmd.slice(0, 4).join(' ')} … failed (${r.exitCode})${opts.quiet ? `\n${err.slice(-800)}` : ''}`);
  return { code: r.exitCode, out, err };
}
export const timed = <T>(label: string, fn: () => T): T => { const t0 = Date.now(); try { return fn(); } finally { console.log(`⏱ ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`); } };
