#!/usr/bin/env bun
// The project set up inside the world the way a person would: this checkout's HEAD as a repository on the GitHub
// twin, pushed over the twin's git wire; the project's account funded on the world's books (an admin mint stands in
// for a sponsor or an invoice); the brain's keys minted THE ADOPTER WAY (the claim file committed on the twin's main,
// read back by the backend copy); the channels' twin credentials written for the stack. Idempotent over a running
// world: a repository already there moves forward only (its main carries what the brain wrote), a key already minted
// is kept. Then the project's own seed hook, for what the kit cannot know (a client's repository, a tracker's board).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { ACCOUNT, CONFIG, ENC, MODEL, OWNER, REPO_NAME, ROOT, SECRETS, STACK, api, context, git, hooks, need, sh, twinCli } from './lib.ts';

const github = need('GITHUB_TWIN_URL');
const platform = need('PLATFORM_URL').replace(/\/$/, '');
const gh = api(github, { authorization: 'Bearer world-bot' });
const admin = api(platform, { 'x-admin-token': process.env.AGENT_PROXY_ADMIN_TOKEN ?? 'world-admin' });
const pub = api(platform);
mkdirSync(SECRETS, { recursive: true });
const project = resolve(STACK, 'project');

// 1. The project's repository on the GitHub twin: what this checkout's HEAD says. A new world takes HEAD as its main
//    (force); an existing world's main moves forward only, whole objects (a twin that lost a delta's base still unpacks).
//    A project that is a directory of a larger repository (a cookbook in the product's tree) is that directory's tree
//    as a repository of its own: one commit holding it, on top of the world's main when the world already has one.
if (sh(['git', 'status', '--porcelain', '--', '.'], { quiet: true }).out.trim()) throw new Error('seed: this checkout has uncommitted changes; the world clones what HEAD says — commit first');
await gh.post('/orgs', { login: OWNER });
// Public, as the page publishes it: the platform syncs a public repository's profile and refuses a private one.
const created = await gh.post(`/orgs/${OWNER}/repos`, { name: REPO_NAME, default_branch: 'main', private: false });
if (![201, 422].includes(created.status)) throw new Error(`github twin: create repo → ${created.status} ${created.text.slice(0, 200)}`);
const remote = `${github}/${ACCOUNT}.git`;
const prefix = relative(sh(['git', 'rev-parse', '--show-toplevel'], { quiet: true }).out.trim(), ROOT);
if (!prefix) {
  if (created.status === 201) await git(ROOT, 'push', '-q', '-f', '--no-thin', remote, 'HEAD:refs/heads/main');
  else { try { await git(ROOT, 'push', '-q', '--no-thin', remote, 'HEAD:refs/heads/main'); console.log("seed: the world's main moved forward to HEAD"); } catch { console.log("seed: the world's main keeps what the brain wrote (this checkout's HEAD is not a fast-forward of it; `fresh` starts over)"); } }
} else {
  const tree = await git(ROOT, 'rev-parse', `HEAD:${prefix}`);
  const message = `${REPO_NAME}: ${prefix} at ${await git(ROOT, 'rev-parse', '--short', 'HEAD')}`;
  let parent: string | undefined;
  if (created.status !== 201) { try { await git(ROOT, 'fetch', '-q', remote, 'main'); parent = await git(ROOT, 'rev-parse', 'FETCH_HEAD'); } catch { /* an empty repository */ } }
  if (parent && (await git(ROOT, 'rev-parse', 'FETCH_HEAD^{tree}')) === tree) console.log("seed: the world's main already holds this checkout's HEAD");
  else {
    const commit = await git(ROOT, 'commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message);
    await git(ROOT, 'push', '-q', '-f', '--no-thin', remote, `${commit}:refs/heads/main`);
    if (parent) console.log("seed: the world's main moved forward to HEAD");
  }
}
// The world clone: the checkout the stack runs (the start script brings it to origin/main on every start).
mkdirSync(STACK, { recursive: true });
if (existsSync(resolve(project, '.git'))) { await git(project, 'remote', 'set-url', 'origin', remote); await git(project, 'fetch', '-q', 'origin'); await git(project, 'reset', '-q', '--hard', 'origin/main'); }
else await git(STACK, 'clone', '-q', remote, project);
await git(project, 'config', 'user.name', 'agent'); await git(project, 'config', 'user.email', 'agent@example.test');
// The reporter's dependencies are this checkout's, already installed: the world clone shares them.
if (existsSync(resolve(ROOT, '.open-autonomy', 'node_modules'))) {
  if (!existsSync(resolve(project, '.open-autonomy', 'node_modules'))) sh(['ln', '-sfn', resolve(ROOT, '.open-autonomy', 'node_modules'), resolve(project, '.open-autonomy', 'node_modules')]);
  // A directory-only node_modules/ rule does not ignore this warm-cache symlink.
  // Keep our fixture out of Git status so restart can advance a clean checkout.
  const exclude = resolve(project, await git(project, 'rev-parse', '--git-path', 'info/exclude'));
  const prior = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
  if (!prior.split('\n').includes('/.open-autonomy/node_modules')) writeFileSync(exclude, `${prior}\n/.open-autonomy/node_modules\n`);
}
// The maintainer's rule on main when the project lands through pull requests: the `ci` check, nobody bypasses. A
// project whose brain writes main directly (its books) has no landing workflow and no protection.
if (existsSync(resolve(ROOT, '.github', 'workflows', 'land.yml'))) {
  const protect = await gh.put(`/repos/${ACCOUNT}/branches/main/protection`, { required_status_checks: { strict: false, contexts: ['ci'] }, enforce_admins: true, required_pull_request_reviews: null, restrictions: null });
  if (protect.status !== 200) throw new Error(`github twin: protect main → ${protect.status} ${protect.text.slice(0, 200)}`);
}
console.log(`seed: ${ACCOUNT} on the GitHub twin at ${await git(project, 'rev-parse', '--short', 'HEAD')} (main), cloned to ${project}`);

// 2. The books: the project funded on the world's backend copy (idempotent on the key).
const minted = await admin.post(`/admin/accounts/${ENC}/mint`, { amount_usd_cents: 5000, key: 'world-seed' });
if (minted.status !== 200) throw new Error(`platform: mint → ${minted.status} ${minted.text.slice(0, 200)}`);
console.log(`seed: ${ACCOUNT} funded, balance ${(await pub.get(`/v1/accounts/${ENC}`)).body?.balance_usd_cents} cents`);

// 3. The brain's keys, the adopter way: challenge → claim file on the twin's main → mint. A key already minted on
//    this backend copy is kept; the developer's key spends and narrates, the treasurer's adds `pay`. The keys carry
//    the project's bounds and what its hooks add (the registry holds a few keys per account: these two are all it mints).
const h = await hooks();
const models = [...new Set([MODEL, ...CONFIG.models, ...(h.models ?? [])])];
const keyFile = resolve(SECRETS, 'agent.env');
const alive = async (file: string): Promise<boolean> => { const k = /^OPEN_AUTONOMY_KEY=(.+)$/m.exec(existsSync(file) ? readFileSync(file, 'utf8') : '')?.[1]; return !!k && (await fetch(`${platform}/v1/accounts/${ENC}`, { headers: { authorization: `Bearer ${k}` } })).status === 200; };
if (await alive(keyFile)) console.log('seed: the key already minted on this backend copy is kept');
else {
  const challenge = await pub.get(`/v1/keys/challenge?account=${ENC}`);
  if (challenge.status !== 200) throw new Error(`platform: challenge → ${challenge.status} ${challenge.text.slice(0, 200)}`);
  writeFileSync(resolve(project, challenge.body.file), `${challenge.body.claim}\n`);
  await git(project, 'add', challenge.body.file);
  if ((await git(project, 'status', '--porcelain', '--', challenge.body.file)).trim()) await git(project, 'commit', '-q', '-m', 'claim');
  await git(project, 'push', '-q', '--no-thin', 'origin', 'HEAD:refs/heads/main');
  const key = await pub.post('/v1/keys/mint', { account: ACCOUNT, models });
  if (key.status !== 200 || !key.body?.token) throw new Error(`platform: mint key → ${key.status} ${key.text.slice(0, 300)}`);
  writeFileSync(keyFile, `OPEN_AUTONOMY_BASE_URL=${platform}/v1\nOPEN_AUTONOMY_KEY=${key.body.token}\n`);
  const payKey = await pub.post('/v1/keys/mint', { account: ACCOUNT, models, scopes: ['spend', 'narrate', 'pay'] });
  if (payKey.status === 200 && payKey.body?.token) writeFileSync(resolve(SECRETS, 'treasurer.env'), `OPEN_AUTONOMY_BASE_URL=${platform}/v1\nOPEN_AUTONOMY_KEY=${payKey.body.token}\n`);
  console.log(`seed: keys minted by claim file (models ${models.join(', ')}) → ${SECRETS}`);
}

// 4. The channels' twin credentials, for the stack: the GitHub twin as the community desk's door (the desk re-enters
//    GITHUB_TOKEN from the home's .env, which the start script fills from this file), a Discord bot the twin accepts
//    and its home channel when the world has a Discord twin, the webhook platform on loopback. A project's other
//    channels come from its stackEnv hook.
const lines: string[] = ['WEBHOOK_ENABLED=1', 'WEBHOOK_PORT=8646', `GITHUB_API_URL=${github}`, 'GITHUB_TOKEN=world-bot'];
if (process.env.DISCORD_TWIN_URL) {
  const token = sh(['bun', twinCli('world'), 'fake-env', 'DISCORD_BOT_TOKEN'], { quiet: true }).out.trim().replace(/^DISCORD_BOT_TOKEN=/, '');
  const home = process.env.DISCORD_HOME_CHANNEL ?? '1000000000000000001';
  const hello = await api(process.env.DISCORD_TWIN_URL, { authorization: 'Bot maintainer' }).post(`/api/v10/channels/${home}/messages`, { content: `home channel of ${ACCOUNT}` });
  if (hello.status !== 200) throw new Error(`discord twin: seed channel → ${hello.status} ${hello.text.slice(0, 200)}`);
  lines.push(`DISCORD_BOT_TOKEN=${token}`, `DISCORD_HOME_CHANNEL=${home}`, 'DISCORD_ALLOWED_CHANNELS=*', 'DISCORD_ALLOWED_USERS=*');
}
writeFileSync(resolve(SECRETS, 'channels.env'), `${lines.join('\n')}\n`);
// The page reads the repository: sync it now rather than waiting for staleness.
console.log(`seed: docs synced from the twin → ${(await admin.post(`/admin/accounts/${ENC}/sync`)).body?.ok}`);

// 5. What the project seeds beyond itself.
if (h.seed) await h.seed(context((m) => console.log(`seed: ${m}`)));
