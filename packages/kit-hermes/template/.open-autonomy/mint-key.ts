#!/usr/bin/env bun
// Mint (or rotate) the project's key, the adopter way: prove control of the repository by committing the
// claim file the platform names, then mint. No admin token exists anywhere; the only authority this needs
// is the ability to push, which the maintainer running it already has. The key spends the project's balance
// and nothing else, and stops at zero.
//
//   bun .open-autonomy/mint-key.ts [--models a,b] [--scopes spend,narrate,pay] [--out <file>]   # mint, or prepare a claim to land
//   bun .open-autonomy/mint-key.ts --rotate [--grace <seconds>]            # with the current key; no commit
//
// The key is written to ~/.config/open-autonomy/agent.env (the file the key valve reads; created if
// absent), with OPEN_AUTONOMY_BASE_URL. The agent itself never sees it.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { keyChallenge, keyMint, keyRotate } from './sdk/client.ts';
import { checkCredentialDirectory } from './sdk/credentials.ts';

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const config = readFileSync(resolve(import.meta.dir, 'config.yaml'), 'utf8');
const account = arg('--account') ?? /^account:\s*(\S+)/m.exec(config)?.[1] ?? '';
const platform = (process.env.OPEN_AUTONOMY_URL ?? /^platform:\s*(\S+)/m.exec(config)?.[1] ?? 'https://open-autonomy.org').replace(/\/$/, '');
const base = `${platform}/v1`;
const selectedModels = arg('--models');
const models: unknown = process.argv.includes('--rotate') ? undefined : selectedModels === undefined
  ? (Bun.YAML.parse(config) as { models?: unknown }).models
  : selectedModels.split(',').map((m) => m.trim());
if (!process.argv.includes('--rotate') && (!Array.isArray(models) || !models.length || models.some((m) => typeof m !== 'string' || !m.trim()))) {
  console.error('Choose key models with --models or a nonempty models list in .open-autonomy/config.yaml. An unrestricted project policy still needs explicitly bounded keys.');
  process.exit(2);
}
// The developer's key spends and narrates; the treasurer's adds `pay` (--scopes spend,narrate,pay --out …/treasurer.env).
const scopes = arg('--scopes')?.split(',').map((x) => x.trim()).filter(Boolean);
const dir = join(homedir(), '.config', 'open-autonomy');
const envPath = resolve(arg('--out') ?? join(dir, 'agent.env'));
if (!account) { console.error('no account: set it in .open-autonomy/config.yaml or pass --account owner/repo'); process.exit(2); }

// Prepare the actual destination before asking the platform to issue or rotate a key.
// Rotation can update a regular protected file, but must never follow a symlink into another location.
try {
  checkCredentialDirectory(dirname(envPath));
  let existing;
  try { existing = lstatSync(envPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw new Error('Choose a regular credential file, not a symlink, hard link or directory.');
  mkdirSync(dirname(envPath), { recursive: true, mode: 0o700 });
  if (existing) chmodSync(envPath, 0o600);
} catch (error) { console.error(`credential destination: ${(error as Error).message}`); process.exit(2); }

let minted;
if (process.argv.includes('--rotate')) {
  const current = existsSync(envPath) ? /^OPEN_AUTONOMY_KEY=(.+)$/m.exec(readFileSync(envPath, 'utf8'))?.[1] : undefined;
  if (!current) { console.error(`no OPEN_AUTONOMY_KEY in ${envPath} to rotate`); process.exit(2); }
  const grace = arg('--grace');
  minted = await keyRotate(base, current, grace === undefined ? {} : { graceSeconds: Number(grace) });
} else {
  // A valid claim already on the default branch needs no local commit, including on a stale checkout.
  minted = await keyMint(base, account, models as string[], scopes);
  const code = (minted as { error?: { code?: string } }).error?.code;
  if (code === 'claim_file_missing' || code === 'claim_mismatch') {
    const challenge = await keyChallenge(base, account);
    if (!challenge.ok || challenge.file !== '.open-autonomy-claim') { console.error('Could not obtain the expected repository claim from the platform.'); process.exit(1); }
    const project = resolve(import.meta.dir, '..');
    const path = resolve(project, challenge.file);
    let existing;
    try { existing = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) { console.error('The claim must be a regular file, not a symlink or directory.'); process.exit(1); }
    if (!existing || readFileSync(path, 'utf8').trim() !== challenge.claim) {
      const status = spawnSync('git', ['status', '--porcelain', '--', challenge.file], { cwd: project, encoding: 'utf8' });
      if (status.status !== 0 || status.stdout.trim()) { console.error('Reconcile the existing claim changes in the project checkout before preparing a new claim.'); process.exit(1); }
      writeFileSync(path, `${challenge.claim}\n`);
    }
    console.error(`Claim prepared at ${path}. Land it on ${account}'s default branch through the normal Git/PR process, then rerun this command. Reuse any pending claim PR; no commit, push or credential issuance was performed.`);
    process.exit(1);
  }
}
if (!minted.ok || !minted.token) { console.error(`mint failed: ${JSON.stringify(minted)}`); process.exit(1); }
const keep = existsSync(envPath) ? readFileSync(envPath, 'utf8').split('\n').filter((l) => !/^(OPEN_AUTONOMY_KEY|OPEN_AUTONOMY_BASE_URL)=/.test(l) && l.trim()) : [];
writeFileSync(envPath, `${[...keep, `OPEN_AUTONOMY_BASE_URL=${base}`, `OPEN_AUTONOMY_KEY=${minted.token}`].join('\n')}\n`, { mode: 0o600 });
console.log(`key ${minted.key.kid} for ${minted.key.account} (models: ${minted.key.models.join(', ')}; expires ${minted.key.exp}) → ${envPath}`);
