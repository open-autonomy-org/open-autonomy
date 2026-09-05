#!/usr/bin/env bun
// Seed, run AFTER `up` with the world's env. Everything here goes through the vendors' own doors, as the
// person would: the cookbook is a repository on the GitHub twin, pushed over the twin's git wire; the
// project's account is funded on the local books (an admin mint stands in for a sponsor); the agent's key
// is minted THE ADOPTER WAY (the claim file committed on the twin, read back by the platform). The key
// lands in <data>/agent.env: a world artifact, worthless anywhere else.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, COOKBOOK, DATA, ENC, HOME_CHANNEL, MODEL, OWNER, PREVIOUS_MODEL, REPO_NAME, api, git, need } from './lib.ts';

const github = need('GITHUB_TWIN_URL');
const platform = need('PLATFORM_URL');
const gh = api(github);
const admin = api(platform, { 'x-admin-token': process.env.AGENT_PROXY_ADMIN_TOKEN ?? 'world-admin' });
const pub = api(platform);
mkdirSync(DATA, { recursive: true });

// 1. The project under test: the cookbook, a repository of its own on the GitHub twin.
const created = await gh.post(`/orgs/${OWNER}/repos`, { name: REPO_NAME });
if (![201, 422].includes(created.status)) throw new Error(`github twin: create repo → ${created.status} ${created.text.slice(0, 200)}`);
const work = resolve(DATA, 'work');
rmSync(work, { recursive: true, force: true });
cpSync(COOKBOOK, work, { recursive: true, filter: (src) => !/\/(node_modules|\.git)(\/|$)/.test(src) });
await git(work, 'init', '-q', '-b', 'main');
await git(work, 'config', 'user.name', 'maintainer');
await git(work, 'config', 'user.email', 'maintainer@example.test');
await git(work, 'remote', 'add', 'origin', `${github}/${ACCOUNT}.git`);
await git(work, 'add', '-A');
await git(work, 'commit', '-q', '-m', `${REPO_NAME}: the kit applied`);
await git(work, 'push', '-q', '-f', 'origin', 'HEAD:refs/heads/main');
console.log(`seed: ${ACCOUNT} on the GitHub twin at ${await git(work, 'rev-parse', '--short', 'HEAD')} (main), from ${COOKBOOK}`);
// The maintainer's rule on main: a pull request whose `ci` check is green, nobody bypasses.
const protect = await gh.put(`/repos/${ACCOUNT}/branches/main/protection`, { required_status_checks: { strict: false, contexts: ['ci'] }, enforce_admins: true, required_pull_request_reviews: null, restrictions: null });
if (protect.status !== 200) throw new Error(`github twin: protect main → ${protect.status} ${protect.text.slice(0, 200)}`);

// 2. The agent's Discord home channel on the Discord twin: created by the maintainer's first message.
const discord = api(need('DISCORD_TWIN_URL'), { authorization: 'Bot maintainer' });
const hello = await discord.post(`/api/v10/channels/${HOME_CHANNEL}/messages`, { content: `home channel of ${ACCOUNT}` });
if (hello.status !== 200) throw new Error(`discord twin: seed channel → ${hello.status} ${hello.text.slice(0, 200)}`);

// 3. Fund the project on the local books (idempotent on the key).
const minted = await admin.post(`/admin/accounts/${ENC}/mint`, { amount_usd_cents: 500, key: 'world-seed' });
if (minted.status !== 200) throw new Error(`platform: mint → ${minted.status} ${minted.text.slice(0, 200)}`);
console.log(`seed: ${ACCOUNT} funded, balance ${(await pub.get(`/v1/accounts/${ENC}`)).body?.balance_usd_cents} cents`);

// 4. The agent's key, the adopter way: challenge → claim file on main → mint.
const challenge = await pub.get(`/v1/keys/challenge?account=${ENC}`);
if (challenge.status !== 200) throw new Error(`platform: challenge → ${challenge.status} ${challenge.text.slice(0, 200)}`);
writeFileSync(resolve(work, challenge.body.file), `${challenge.body.claim}\n`);
await git(work, 'add', challenge.body.file);
await git(work, 'commit', '-q', '-m', 'claim');
await git(work, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
const key = await pub.post('/v1/keys/mint', { account: ACCOUNT, models: [MODEL, PREVIOUS_MODEL] });
if (key.status !== 200 || !key.body?.token) throw new Error(`platform: mint key → ${key.status} ${key.text.slice(0, 300)}`);
writeFileSync(resolve(DATA, 'agent.env'), `OPEN_AUTONOMY_BASE_URL=${platform}/v1\nOPEN_AUTONOMY_KEY=${key.body.token}\n`);
console.log(`seed: key minted by claim file → ${resolve(DATA, 'agent.env')}${existsSync(resolve(DATA, 'agent.env')) ? '' : ' (missing!)'}`);
// The treasurer's key: the same claim, one more scope. The only key in the stack that can pay.
const payKey = await pub.post('/v1/keys/mint', { account: ACCOUNT, models: [MODEL, PREVIOUS_MODEL], scopes: ['spend', 'narrate', 'pay'] });
if (payKey.status !== 200 || !payKey.body?.token) throw new Error(`platform: mint the treasurer's key → ${payKey.status} ${payKey.text.slice(0, 300)}`);
writeFileSync(resolve(DATA, 'treasurer.env'), `OPEN_AUTONOMY_BASE_URL=${platform}/v1\nOPEN_AUTONOMY_KEY=${payKey.body.token}\n`);
console.log(`seed: the treasurer's key (pay) → ${resolve(DATA, 'treasurer.env')}`);
// The page reads the repository: sync it now rather than waiting for staleness.
const synced = await admin.post(`/admin/accounts/${ENC}/sync`);
console.log(`seed: docs synced from the twin → ${synced.body?.ok}`);
