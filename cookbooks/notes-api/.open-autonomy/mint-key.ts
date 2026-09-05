#!/usr/bin/env bun
// Mint (or rotate) the project's key, the adopter way: prove control of the repository by committing the
// claim file the platform names, then mint. No admin token exists anywhere; the only authority this needs
// is the ability to push, which the maintainer running it already has. The key spends the project's balance
// and nothing else, and stops at zero.
//
//   bun .open-autonomy/mint-key.ts [--models a,b] [--scopes spend,narrate,pay] [--out <file>]   # commit the claim, mint
//   bun .open-autonomy/mint-key.ts --rotate [--grace <seconds>]            # with the current key; no commit
//
// The key is written to ~/.config/open-autonomy/agent.env (the file the key valve reads; created if
// absent), with OPEN_AUTONOMY_BASE_URL. The agent itself never sees it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { keyChallenge, keyMint, keyRotate } from './sdk/client.ts';

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const config = readFileSync(resolve(import.meta.dir, 'config.yaml'), 'utf8');
const account = arg('--account') ?? /^account:\s*(\S+)/m.exec(config)?.[1] ?? '';
const platform = (process.env.OPEN_AUTONOMY_URL ?? /^platform:\s*(\S+)/m.exec(config)?.[1] ?? 'https://open-autonomy.org').replace(/\/$/, '');
const base = `${platform}/v1`;
const models = (arg('--models') ?? 'zai/glm-5.3-flash').split(',').map((m) => m.trim()).filter(Boolean);
// The developer's key spends and narrates; the treasurer's adds `pay` (--scopes spend,narrate,pay --out …/treasurer.env).
const scopes = arg('--scopes')?.split(',').map((x) => x.trim()).filter(Boolean);
const dir = join(homedir(), '.config', 'open-autonomy');
const envPath = arg('--out') ?? join(dir, 'agent.env');
const git = (...args: string[]) => { const r = spawnSync('git', args, { stdio: ['ignore', 'pipe', 'inherit'] }); if (r.status !== 0) { console.error(`git ${args.join(' ')} failed`); process.exit(1); } return r.stdout.toString().trim(); };
if (!account) { console.error('no account: set it in .open-autonomy/config.yaml or pass --account owner/repo'); process.exit(2); }

let minted;
if (process.argv.includes('--rotate')) {
  const current = existsSync(envPath) ? /^OPEN_AUTONOMY_KEY=(.+)$/m.exec(readFileSync(envPath, 'utf8'))?.[1] : undefined;
  if (!current) { console.error(`no OPEN_AUTONOMY_KEY in ${envPath} to rotate`); process.exit(2); }
  const grace = arg('--grace');
  minted = await keyRotate(base, current, grace === undefined ? {} : { graceSeconds: Number(grace) });
} else {
  const challenge = await keyChallenge(base, account);
  if (!challenge.ok) { console.error(`challenge failed: ${JSON.stringify(challenge)}`); process.exit(1); }
  writeFileSync(challenge.file, `${challenge.claim}\n`);
  git('add', challenge.file);
  if (git('status', '--porcelain', '--', challenge.file)) { git('commit', '-q', '-m', `claim: ${account} key`, '--', challenge.file); git('push', '-q'); }
  minted = await keyMint(base, account, models, scopes);
}
if (!minted.ok || !minted.token) { console.error(`mint failed: ${JSON.stringify(minted)}`); process.exit(1); }
mkdirSync(dir, { recursive: true });
const keep = existsSync(envPath) ? readFileSync(envPath, 'utf8').split('\n').filter((l) => !/^(OPEN_AUTONOMY_KEY|OPEN_AUTONOMY_BASE_URL)=/.test(l) && l.trim()) : [];
writeFileSync(envPath, `${[...keep, `OPEN_AUTONOMY_BASE_URL=${base}`, `OPEN_AUTONOMY_KEY=${minted.token}`].join('\n')}\n`, { mode: 0o600 });
console.log(`key ${minted.key.kid} for ${minted.key.account} (models: ${minted.key.models.join(', ')}; expires ${minted.key.exp}) → ${envPath}`);
