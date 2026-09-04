// Shared by the world's post-up steps: where the world keeps its data, the API helpers, git.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const NAME = 'open-autonomy';
export const REPO = resolve(import.meta.dir, '..');
export const DATA = process.env.VOLTER_WORLD_DATA ?? resolve(REPO, '.volter', 'worlds', NAME, 'data');
export const COOKBOOK_NAME = process.env.WORLD_COOKBOOK ?? 'hello-roadmap';
export const COOKBOOK = resolve(REPO, 'cookbook', COOKBOOK_NAME);
export const ACCOUNT = `cookbook/${COOKBOOK_NAME}`;
export const MODEL = process.env.OPEN_AUTONOMY_MODEL ?? 'deepseek/deepseek-v4-flash';
export const WORK = resolve(DATA, 'work');
// The cookbook agent's Discord home channel on the Discord twin: the id its .env names and the seed creates.
export const HOME_CHANNEL = '1000000000000000001';
export const ENC = encodeURIComponent(ACCOUNT);
export const [OWNER, REPO_NAME] = ACCOUNT.split('/');

export const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — run this through \`bun world/run.ts env -- …\` so the world's env is present`);
  return v;
};

export function api(base: string, headers: Record<string, string> = {}) {
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, text };
  };
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b), put: (p: string, b?: unknown) => call('PUT', p, b), patch: (p: string, b?: unknown) => call('PATCH', p, b), del: (p: string) => call('DELETE', p) };
}

// A git call that hangs (a twin that stopped answering) fails loudly after ten minutes instead of holding
// the gate open forever.
export async function git(cwd: string, ...args: string[]): Promise<string> {
  const p = Bun.spawn({ cmd: ['git', ...args], cwd, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const killer = setTimeout(() => p.kill(), 600_000);
  const [code, out, err] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]);
  clearTimeout(killer);
  if (code !== 0) throw new Error(`git ${args.join(' ')} failed (${code}) in ${cwd}\n${err}`);
  return out.trim();
}

export function agentEnv(): Record<string, string> {
  const p = resolve(DATA, 'agent.env');
  if (!existsSync(p)) throw new Error(`${p} is missing — run \`bun world/run.ts seed\` first`);
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) out[m[1]] = m[2]; }
  return out;
}

