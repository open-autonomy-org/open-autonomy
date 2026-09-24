// Where `oa` points and what it carries: the platform (a flag, the environment, or open-autonomy.org) and a key
// (a flag naming a file or a token, the environment, or the project's own files under ~/.config/open-autonomy,
// the layout the kit's valves already read). A read needs no key for what the owner opened to everyone; a
// closed panel opens to the project's key; the owner's acts need a steer key.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { OpenAutonomy } from '@open-autonomy/sdk/client';
import { fail } from './ui.ts';

export const ACCOUNT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
export const ORG = /^@?[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

// The scope a command lands on, as cloud CLIs pick it (ADR 0010): the argument, the --project or --org flag, the
// checkout's GitHub remote, then the default `oa use` saved. An org comes back as `@org`, its account on the books.
export interface ScopeFlags { project?: string; org?: string }
const CONTEXT = join(homedir(), '.config', 'open-autonomy', 'context');
export function checkoutProject(dir = process.cwd()): string | undefined {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url);
    return m && ACCOUNT.test(m[1]) ? m[1] : undefined;
  } catch { return undefined; }
}
export function savedScope(): string | undefined {
  try { return readFileSync(CONTEXT, 'utf8').trim() || undefined; } catch { return undefined; }
}
export function saveScope(value: string): void {
  mkdirSync(dirname(CONTEXT), { recursive: true, mode: 0o700 });
  writeFileSync(CONTEXT, `${value}\n`);
}
export function scopeOf(arg: string | undefined, flags: ScopeFlags): { scope: string; from: string } {
  const pick: Array<[string | undefined, string]> = [[arg, 'the argument'], [flags.project, '--project'], [flags.org, '--org'], [checkoutProject(), 'this checkout'], [savedScope(), 'oa use']];
  const [value, from] = pick.find(([v]) => v) ?? [undefined, ''];
  if (!value) fail('no project or org to act on', 'name one (oa status volter-ai/volter, oa status volter-ai), run inside a checkout, or oa use <org|org/project>');
  if (ACCOUNT.test(value)) return { scope: value, from };
  if (ORG.test(value)) return { scope: `@${value.replace(/^@/, '').toLowerCase()}`, from };
  return fail(`not a project or an org: ${value}`, 'a project is owner/project, an org its owner, as on GitHub');
}
// A command that only a project has (its sessions, its board, its books).
export function account(arg: string | undefined, flags: ScopeFlags = {}): string {
  const { scope, from } = scopeOf(arg, flags);
  if (scope.startsWith('@')) fail(`${scope.slice(1)} is an org (from ${from}); this command reads one project`, `oa <command> ${scope.slice(1)}/<project>`);
  return scope;
}
export function platform(flag?: string): string {
  return (flag ?? process.env.OPEN_AUTONOMY_URL ?? 'https://open-autonomy.org').replace(/\/$/, '');
}
export const pageOf = (base: string, acct: string): string => `${base}/${acct}`;

export type KeyKind = 'steer' | 'agent' | 'treasurer';
export interface FoundKey { token: string; from: string; kind?: KeyKind }
// An org's keys sit beside its projects' folders: ~/.config/open-autonomy/<org>/steer.env.
export const configDir = (acct: string): string => join(homedir(), '.config', 'open-autonomy', ...acct.replace(/^@/, '').split('/'));
const readEnv = (file: string): string | undefined => { try { return /^OPEN_AUTONOMY_KEY=(.+)$/m.exec(readFileSync(file, 'utf8'))?.[1]?.trim().replace(/^["']|["']$/g, ''); } catch { return undefined; } };

// The key for a project: the flag (a file's path, or the token itself), the environment, then the project's files,
// steer first when the act needs it. Nothing found is fine for a read.
export function keyFor(acct: string, flag?: string, prefer: KeyKind[] = ['steer', 'agent', 'treasurer']): FoundKey | undefined {
  if (flag) {
    if (existsSync(flag)) { const token = readEnv(flag); if (!token) fail(`no OPEN_AUTONOMY_KEY in ${flag}`); return { token, from: flag }; }
    return { token: flag, from: '--key' };
  }
  if (process.env.OPEN_AUTONOMY_KEY) return { token: process.env.OPEN_AUTONOMY_KEY, from: 'OPEN_AUTONOMY_KEY' };
  for (const kind of prefer) {
    const file = join(configDir(acct), `${kind}.env`);
    const token = readEnv(file);
    if (token) return { token, from: file, kind };
  }
  return undefined;
}

export interface Doors { base: string; acct: string; key?: FoundKey; oa: OpenAutonomy; json: boolean }
export function doors(acct: string, opts: { platform?: string; key?: string; json?: boolean }, prefer?: KeyKind[]): Doors {
  const base = `${platform(opts.platform)}/v1`;
  const key = keyFor(acct, opts.key, prefer);
  return { base, acct, key, oa: new OpenAutonomy({ baseUrl: base, key: key?.token ?? '' }), json: Boolean(opts.json) };
}
