// Where `oa` points and what it carries: the platform (a flag, the environment, or open-autonomy.org) and a key
// (a flag naming a file or a token, the environment, or the project's own files under ~/.config/open-autonomy,
// the layout the kit's valves already read). A read needs no key for what the owner opened to everyone; a
// closed panel opens to the project's key; the owner's acts need a steer key.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { OpenAutonomy } from '@open-autonomy/sdk/client';
import { fail } from './ui.ts';

export const ACCOUNT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
export function account(arg: string): string {
  if (!ACCOUNT.test(arg)) fail(`not a project: ${arg}`, 'a project is owner/project, as on GitHub: oa status open-autonomy-org/hookline');
  return arg;
}
export function platform(flag?: string): string {
  return (flag ?? process.env.OPEN_AUTONOMY_URL ?? 'https://open-autonomy.org').replace(/\/$/, '');
}
export const pageOf = (base: string, acct: string): string => `${base}/${acct}`;

export type KeyKind = 'steer' | 'agent' | 'treasurer';
export interface FoundKey { token: string; from: string; kind?: KeyKind }
export const configDir = (acct: string): string => join(homedir(), '.config', 'open-autonomy', ...acct.split('/'));
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
