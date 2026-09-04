#!/usr/bin/env bun
// Mint (or rotate) a project's STANDING platform key for its agent, the adopter way: prove
// control of the repository by committing the platform's claim file, then mint. No admin token exists on
// any machine; the only authority this needs is the ability to push to the repo, which the maintainer
// running it already has. The key spends the project's balance and nothing else, and stops at zero.
//
//   bun template/mint-key.ts [--account owner/repo] [--models a,b] [--home hermes]
//   bun template/mint-key.ts --rotate [--out ~/.config/open-autonomy/agent.env]   # with the current key; no commit needed
//
// The key is written to <home>/.env (git-ignored) as OPEN_AUTONOMY_KEY with OPEN_AUTONOMY_BASE_URL. Under
// the container setup the key sidecar reads that file; the agent itself never sees the key.
// --rotate asks the platform for a fresh key using the current one; the old key keeps working for a day.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const proxyUrl = (process.env.OPEN_AUTONOMY_URL || 'https://open-autonomy.org').replace(/\/$/, '');
const home = arg('--home') ?? 'hermes';
// The key's home: the host-only file the sidecar reads (see hermes/README.md), else the Hermes home's .env.
const hostKeyDir = join(homedir(), '.config', 'open-autonomy');
const envPath = arg('--out') ?? (existsSync(hostKeyDir) ? join(hostKeyDir, 'agent.env') : join(home, '.env'));
const rotate = process.argv.includes('--rotate');
const account = arg('--account') ?? (() => { const r = spawnSync('git', ['remote', 'get-url', 'origin'], { stdio: ['ignore', 'pipe', 'ignore'] }).stdout?.toString().trim() ?? ''; return /github\.com[:/]([^/]+\/[^/.]+)/.exec(r)?.[1] ?? 'open-autonomy-org/open-autonomy'; })();
const models = (arg('--models') ?? 'zai/glm-5.3-flash').split(',').map((m) => m.trim()).filter(Boolean);
const git = (...args: string[]) => {
  const r = spawnSync('git', args, { stdio: ['ignore', 'pipe', 'inherit'] });
  if (r.status !== 0) { console.error(`git ${args.join(' ')} failed`); process.exit(1); }
  return r.stdout.toString().trim();
};

let res: Response;
if (rotate) {
  const current = existsSync(envPath) ? readFileSync(envPath, 'utf8').match(/^OPEN_AUTONOMY_KEY=(.+)$/m)?.[1] : undefined;
  if (!current) { console.error(`no OPEN_AUTONOMY_KEY in ${envPath} to rotate`); process.exit(2); }
  res = await fetch(`${proxyUrl}/v1/keys/rotate`, { method: 'POST', headers: { authorization: `Bearer ${current}` } });
} else {
  // 1. The challenge: a per-day claim the platform expects to find committed on the repo's default branch.
  const ch = await fetch(`${proxyUrl}/v1/keys/challenge?account=${encodeURIComponent(account)}`);
  const challenge = await ch.json() as { claim?: string; file?: string; error?: unknown };
  if (!ch.ok || !challenge.claim || !challenge.file) { console.error(`challenge failed: ${ch.status} ${JSON.stringify(challenge.error ?? '')}`); process.exit(1); }
  // 2. Commit and push the claim file (the maintainer's own push authority; nothing else is needed).
  writeFileSync(challenge.file, `${challenge.claim}\n`);
  git('add', challenge.file);
  if (git('status', '--porcelain', '--', challenge.file)) {
    git('commit', '-q', '-m', `claim: ${account} standing key`, '--', challenge.file);
    git('push', '-q');
  }
  // 3. Mint: the platform reads the claim back from GitHub.
  res = await fetch(`${proxyUrl}/v1/keys/mint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, models }) });
}
const body = await res.json() as { ok?: boolean; error?: { code?: string } | string; token?: string; run?: { run_id: string; expires_at: string; repo: string; models: string[] } };
if (!res.ok || !body.ok || !body.token || !body.run) {
  console.error(`${rotate ? 'rotate' : 'mint'} failed: ${res.status} ${typeof body.error === 'string' ? body.error : body.error?.code ?? ''}`);
  process.exit(1);
}

// Merge into <home>/.env: replace our keys, keep everything else (the Discord token).
const keep = existsSync(envPath)
  ? readFileSync(envPath, 'utf8').split('\n').filter((l) => !/^(OPEN_AUTONOMY_KEY|OPEN_AUTONOMY_BASE_URL|OPEN_AUTONOMY_KEY_RUN_ID|OPEN_AUTONOMY_KEY_EXPIRES_AT)=/.test(l) && l.trim() !== '')
  : [];
keep.push(`OPEN_AUTONOMY_BASE_URL=${proxyUrl}/v1`);
keep.push(`OPEN_AUTONOMY_KEY=${body.token}`);
keep.push(`OPEN_AUTONOMY_KEY_RUN_ID=${body.run.run_id}`);
keep.push(`OPEN_AUTONOMY_KEY_EXPIRES_AT=${body.run.expires_at}`);
writeFileSync(envPath, keep.join('\n') + '\n');
console.log(`${rotate ? 'rotated' : 'minted'} standing key for ${body.run.repo} (models: ${body.run.models.join(', ')}; expires ${body.run.expires_at}) → ${envPath}`);
