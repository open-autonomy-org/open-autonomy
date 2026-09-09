// Shared by the rehearsal's steps: where the world keeps its state, the project's identity, the twins' CLIs, the API
// and git helpers, the project's hooks. The rehearsal is the kit's; a project owns rehearsal/ (its world, its
// scenario, its stories, its hooks) and never edits this directory (the kit keeps it current).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const KIT_DIR = import.meta.dir;                       // .open-autonomy/rehearsal (the kit's)
export const ROOT = resolve(KIT_DIR, '..', '..');             // the project
export const REHEARSAL = resolve(ROOT, 'rehearsal');          // the project's: world.json, model/, stories/, hooks.ts
export const NAME = process.env.REHEARSAL_WORLD ?? `${readConfig().account.replace('/', '-')}-rehearsal`;
// The twins: the published packages in the project's .open-autonomy/node_modules (@volter/twin-world and one
// @volter/twin-<vendor> per twin), or a checkout named by TWINS_ROOT when the twins themselves are being developed.
export const TWINS_ROOT = process.env.TWINS_ROOT ? resolve(process.env.TWINS_ROOT) : undefined;
export const twinCli = (name: string): string => {
  const override = process.env[`WORLD_${name.toUpperCase().replaceAll('-', '_')}_CLI`];
  if (override) return resolve(override);
  if (TWINS_ROOT) {
    // The runtime's package moved once; the newer location wins when both exist.
    const candidates = name === 'world' ? [resolve(TWINS_ROOT, 'packages/world-runtime/src/cli.ts'), resolve(TWINS_ROOT, 'packages/twin/world-runtime/src/cli.ts')] : [resolve(TWINS_ROOT, 'packages/twin', name, 'src/cli.ts')];
    return candidates.find(existsSync) ?? candidates[0];
  }
  return resolve(ROOT, '.open-autonomy', 'node_modules', '@volter', name === 'world' ? 'twin-world' : `twin-${name}`, 'src/cli.ts');
};
// Where the world's state lives (its instances, the generated config, the backend copy's books, the stack's clone and
// home): the project by default, or WORLD_STATE_ROOT — a disk with headroom, since the runtime admits a world only
// against the free space of the root it is given.
export const STATE = process.env.WORLD_STATE_ROOT ? resolve(process.env.WORLD_STATE_ROOT) : ROOT;
export const DATA = process.env.VOLTER_WORLD_DATA ?? resolve(STATE, '.volter', 'worlds', NAME, 'data');
export const GENERATED = resolve(STATE, '.volter', 'generated', NAME);
export const STACK = resolve(STATE, '.volter', 'stack', NAME);
export const SECRETS = resolve(DATA, 'secrets');

// The project's identity and bounds, from .open-autonomy/config.yaml (the same line reader the reporter uses).
export interface ProjectConfig { account: string; models: string[]; platform: string }
export function readConfig(): ProjectConfig {
  const text = existsSync(resolve(ROOT, '.open-autonomy', 'config.yaml')) ? readFileSync(resolve(ROOT, '.open-autonomy', 'config.yaml'), 'utf8') : '';
  const account = /^account:\s*(\S+)/m.exec(text)?.[1] ?? '';
  const models = (/^models:\s*\[([^\]]*)\]/m.exec(text)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const platform = (/^platform:\s*(\S+)/m.exec(text)?.[1] ?? 'https://open-autonomy.org').replace(/\/$/, '');
  return { account, models, platform };
}
export const CONFIG = readConfig();
export const ACCOUNT = CONFIG.account;
export const ENC = encodeURIComponent(ACCOUNT);
export const [OWNER, REPO_NAME] = ACCOUNT.split('/');
// The model the rehearsal's brain spends on: the project's first bound model, or the kit's default.
export const MODEL = process.env.OPEN_AUTONOMY_MODEL ?? CONFIG.models[0] ?? 'zai/glm-5.3-flash';

export const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — run this through \`bun .open-autonomy/rehearsal/run.ts env -- …\` so the world's env is present`);
  return v;
};
export function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) { const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim()); if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1'); }
  return out;
}
export const worldEnv = (): Record<string, string> => readEnvFile(resolve(GENERATED, 'world.env'));

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

// The project's hooks (rehearsal/hooks.ts): what the kit cannot know about a project's vendors and doors.
//   custody(ctx)     writes whatever the project's own scripts read as their credentials, from the twins' addresses
//   seed(ctx)        what the project seeds beyond itself (a client's repository on the GitHub twin, a tracker's board)
//   acts             the project's own story acts: { name: (ctx, line) => Promise<void> }
//   conditions       the project's own story conditions: { name: (ctx, want) => Promise<boolean> }
//   stackEnv(ctx)    extra environment for the brain's stack (twin addresses its channels need), beyond the kit's
//   hermesBin        a Hermes to run instead of the pin (a directory holding `hermes`)
//   ticks            the monitor jobs a story ticks after each act (default: every monitor job)
export interface RehearsalContext { world: Record<string, string>; name: string; data: string; secrets: string; stack: { project: string; home: string }; account: string; root: string; log: (m: string) => void }
export interface Hooks {
  custody?: (ctx: RehearsalContext) => Promise<void> | void;
  seed?: (ctx: RehearsalContext) => Promise<void> | void;
  acts?: Record<string, (ctx: RehearsalContext, line: Record<string, unknown>) => Promise<void> | void>;
  conditions?: Record<string, (ctx: RehearsalContext, want: unknown, line: Record<string, unknown>) => Promise<boolean> | boolean>;
  stackEnv?: (ctx: RehearsalContext) => Record<string, string>;
  hermesBin?: string;
  ticks?: string[];
}
export async function hooks(): Promise<Hooks> {
  const file = resolve(REHEARSAL, 'hooks.ts');
  if (!existsSync(file)) return {};
  return ((await import(file)).default ?? {}) as Hooks;
}
export const context = (log = (m: string) => console.log(m)): RehearsalContext => ({ world: worldEnv(), name: NAME, data: DATA, secrets: SECRETS, stack: { project: resolve(STACK, 'project'), home: resolve(STACK, 'home') }, account: ACCOUNT, root: ROOT, log });
