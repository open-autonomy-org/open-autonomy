#!/usr/bin/env bun
// Seed, run AFTER `up` with the world's env (bun world/run.ts seed). Everything here goes through the
// vendors' own doors, as the person would: the repository is created on the GitHub twin and this checkout
// is pushed to it over the twin's git wire; the project's account is funded on the local books (an admin
// mint stands in for a sponsor); the agent's standing key is minted THE ADOPTER WAY — the platform's claim
// file committed to the repo on the twin, read back by the platform through the twin's REST plane. The
// key lands in <data>/agent.env: a world artifact, worthless anywhere else.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, DATA, ENC, MODEL, OWNER, REPO, REPO_NAME, ROADMAP_FIXTURE, api, git, need } from './lib.ts';

const github = need('GITHUB_TWIN_URL');
const platform = need('PLATFORM_URL');
const gh = api(github);
const admin = api(platform, { 'x-admin-token': process.env.AGENT_PROXY_ADMIN_TOKEN ?? 'world-admin' });
const pub = api(platform);
mkdirSync(DATA, { recursive: true });

// 1. The repository lives on the GitHub twin: this checkout, pushed over the twin's git wire, with the
//    world's own one-item roadmap on main.
const created = await gh.post(`/orgs/${OWNER}/repos`, { name: REPO_NAME });
if (![201, 422].includes(created.status)) throw new Error(`github twin: create repo → ${created.status} ${created.text.slice(0, 200)}`);
const work = resolve(DATA, 'work');
rmSync(work, { recursive: true, force: true });
await git(DATA, 'clone', '-q', `file://${REPO}`, work);
await git(work, 'remote', 'set-url', 'origin', `${github}/${ACCOUNT}.git`);
await git(work, 'config', 'user.name', 'maintainer');
await git(work, 'config', 'user.email', 'maintainer@example.test');
writeFileSync(resolve(work, 'ROADMAP.yml'), ROADMAP_FIXTURE);
await git(work, 'add', 'ROADMAP.yml');
await git(work, 'commit', '-q', '-m', 'world: one planned item');
await git(work, 'push', '-q', '-f', 'origin', 'HEAD:refs/heads/main');
console.log(`seed: ${ACCOUNT} on the GitHub twin at ${await git(work, 'rev-parse', '--short', 'HEAD')} (main)`);

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
