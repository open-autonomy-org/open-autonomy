// Paths and vendor helpers for the install's review World (the company skew's rehearsal, company RFC 0026 decision 6).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const SCENARIO = import.meta.dir;
export const ROOT = resolve(SCENARIO, '..');
export const NAME = process.env.VO_WORLD_NAME ?? 'vorg';
// The World's own machine name (its first machine's enrollment, so every address sc:<machine>:… in it): never the real
// machine's, whose name the owner's own connector holds.
export const MACHINE = process.env.VO_MACHINE_NAME ?? `${NAME}-machine`;
export const STATE = resolve(process.env.WORLD_STATE_ROOT ?? resolve(ROOT, '..', 'vorg-worlds'));
export const DATA = process.env.VOLTER_WORLD_DATA ?? resolve(STATE, '.volter/worlds', NAME, 'data');
export const STACK = resolve(DATA, 'agent');
export const SECRETS = resolve(DATA, 'secrets');
// The install's account, as its config.yaml names it.
export const ACCOUNT = process.env.VO_ACCOUNT ?? /^account:\s*(\S+)/m.exec(readFileSync(resolve(ROOT, '.open-autonomy', 'config.yaml'), 'utf8'))?.[1] ?? 'owner/install';
export const ENC = encodeURIComponent(ACCOUNT);
export const [OWNER, REPO_NAME] = ACCOUNT.split('/');
export const MODEL = 'gpt-6-astra';
// The Claude profiles' model here: one the Merge twin catalogues (the install names claude-opus-5-5, which it does not),
// and Claude Code's small-model calls (bare).
export const CLAUDE_MODEL = 'anthropic/claude-haiku-4-5-20251001';
export const CLAUDE_SMALL = 'claude-haiku-4-5-20251001';
/** The account manager in RH2: its own agent principal, installed in the install's home (world/rh2-agent.ts), once made. */
export async function accountManagerInRh2(): Promise<{ principalId: string; token: string }> {
  const file = resolve(STACK, 'home', 'apps', 'rh2-agent.account-manager.json');
  for (let i = 0; !existsSync(file); i++) { if (i > 300) throw new Error(`no RH2 agent installation at ${file}`); await Bun.sleep(2000); }
  return JSON.parse(readFileSync(file, 'utf8'));
}
export function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; run this command through volter-world attach (or set it for prepare)`);
  return value;
}
export function api(base: string, headers: Record<string, string> = {}) {
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, text };
  };
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), put: (p: string, b?: unknown) => call('PUT', p, b) };
}
export async function git(cwd: string, ...args: string[]): Promise<string> {
  const p = Bun.spawn({ cmd: ['git', ...args], cwd, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const [code, out, err] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]);
  if (code !== 0) throw new Error(`git ${args.join(' ')} failed (${code}) in ${cwd}\n${err}`);
  return out.trim();
}
