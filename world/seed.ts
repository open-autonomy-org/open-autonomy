#!/usr/bin/env bun
// Seed, run AFTER `up` with the world's env (bun world/run.ts seed). Everything here goes through the
// vendors' own doors, as the person would: the cookbook project is created on the GitHub twin and pushed
// to it over the twin's git wire; the project's account is funded on the local books (an admin
// mint stands in for a sponsor); the agent's standing key is minted THE ADOPTER WAY — the platform's claim
// file committed to the repo on the twin, read back by the platform through the twin's REST plane. The
// key lands in <data>/agent.env: a world artifact, worthless anywhere else.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, COOKBOOK, DATA, ENC, MODEL, OWNER, REPO, REPO_NAME, api, git, need } from './lib.ts';

const github = need('GITHUB_TWIN_URL');
const platform = need('PLATFORM_URL');
const gh = api(github);
const admin = api(platform, { 'x-admin-token': process.env.AGENT_PROXY_ADMIN_TOKEN ?? 'world-admin' });
const pub = api(platform);
mkdirSync(DATA, { recursive: true });

// 1. The project under test is the cookbook, a repository of its own on the GitHub twin: the template
//    applied (its hermes/ is committed there, as an adopter's would be), pushed over the twin's git wire.
const created = await gh.post(`/orgs/${OWNER}/repos`, { name: REPO_NAME });
if (![201, 422].includes(created.status)) throw new Error(`github twin: create repo → ${created.status} ${created.text.slice(0, 200)}`);
const work = resolve(DATA, 'work');
rmSync(work, { recursive: true, force: true });
cpSync(COOKBOOK, work, { recursive: true });
await git(work, 'init', '-q', '-b', 'main');
await git(work, 'config', 'user.name', 'maintainer');
await git(work, 'config', 'user.email', 'maintainer@example.test');
await git(work, 'remote', 'add', 'origin', `${github}/${ACCOUNT}.git`);
await git(work, 'add', '-A');
await git(work, 'commit', '-q', '-m', `${REPO_NAME}: the template applied`);
await git(work, 'push', '-q', '-f', 'origin', 'HEAD:refs/heads/main');
console.log(`seed: ${ACCOUNT} on the GitHub twin at ${await git(work, 'rev-parse', '--short', 'HEAD')} (main), from ${COOKBOOK}`);
// The maintainer's rule on main, as on GitHub (the main-protected ruleset): a pull request whose `ci` check
// is green, nobody bypasses. The twin refuses a merge without it; the world's Actions runner supplies the check.
const protect = async (repo: string) => {
  const r = await gh.put(`/repos/${repo}/branches/main/protection`, { required_status_checks: { strict: false, contexts: ['ci'] }, enforce_admins: true, required_pull_request_reviews: null, restrictions: null });
  if (r.status !== 200) throw new Error(`github twin: protect ${repo} main → ${r.status} ${r.text.slice(0, 200)}`);
};
await protect(ACCOUNT);

// 1b. Open Autonomy itself is on the same twin: this tree pushed as open-autonomy-org/open-autonomy, so the
//     local platform's own project page renders from the twin too, and both projects share one GitHub.
const self = 'open-autonomy-org/open-autonomy';
const selfCreated = await gh.post('/orgs/open-autonomy-org/repos', { name: 'open-autonomy' });
if (![201, 422].includes(selfCreated.status)) throw new Error(`github twin: create ${self} → ${selfCreated.status}`);
const mirror = resolve(DATA, 'open-autonomy');
rmSync(mirror, { recursive: true, force: true });
await git(DATA, 'clone', '-q', `file://${REPO}`, mirror);
await git(mirror, 'remote', 'set-url', 'origin', `${github}/${self}.git`);
await git(mirror, 'push', '-q', '-f', 'origin', 'HEAD:refs/heads/main');
const selfMint = await admin.post(`/admin/accounts/${encodeURIComponent(self)}/mint`, { amount_usd_cents: 500, key: 'world-seed-self' });
if (selfMint.status !== 200) throw new Error(`platform: mint ${self} → ${selfMint.status}`);
await protect(self);
console.log(`seed: ${self} on the GitHub twin at ${await git(mirror, 'rev-parse', '--short', 'HEAD')} (main), funded`);

// 2. Fund the project on the local books (idempotent on the key).
const minted = await admin.post(`/admin/accounts/${ENC}/mint`, { amount_usd_cents: 500, key: 'world-seed' });
if (minted.status !== 200) throw new Error(`platform: mint → ${minted.status} ${minted.text.slice(0, 200)}`);
console.log(`seed: ${ACCOUNT} funded, balance ${(await pub.get(`/v1/accounts/${ENC}`)).body?.balance_usd_cents} cents`);

// 3. The agent's standing key, the adopter way: challenge → claim file on main → mint.
const challenge = await pub.get(`/v1/keys/challenge?account=${ENC}`);
if (challenge.status !== 200) throw new Error(`platform: challenge → ${challenge.status} ${challenge.text.slice(0, 200)}`);
writeFileSync(resolve(work, challenge.body.file), `${challenge.body.claim}\n`);
await git(work, 'add', challenge.body.file);
await git(work, 'commit', '-q', '-m', 'claim');
await git(work, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
const key = await pub.post('/v1/keys/mint', { account: ACCOUNT, models: [MODEL] });
if (key.status !== 200 || !key.body?.token) throw new Error(`platform: mint key → ${key.status} ${key.text.slice(0, 300)}`);
writeFileSync(resolve(DATA, 'agent.env'), `OPEN_AUTONOMY_BASE_URL=${platform}/v1\nOPEN_AUTONOMY_KEY=${key.body.token}\n`);
console.log(`seed: standing key minted by claim file → ${resolve(DATA, 'agent.env')}${existsSync(resolve(DATA, 'agent.env')) ? '' : ' (missing!)'}`);
