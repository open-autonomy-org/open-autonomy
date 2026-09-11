#!/usr/bin/env bun
// The project set up inside the world the way a person would: this checkout's HEAD as a repository on the GitHub
// twin, pushed over the twin's git wire; the project's account funded on the world's books (an admin mint stands in
// for a sponsor or an invoice); the brain's keys minted THE ADOPTER WAY (the claim file committed on the twin's main,
// read back by the backend copy); the channels' twin credentials written for the stack. Idempotent over a running
// world: a repository already there moves forward only (its main carries what the brain wrote), a key already minted
// is kept. Then OA’s opening situation.
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { ACCOUNT, CONFIG, ENC, MODEL, NAME, OWNER, REPO_NAME, ROOT, SECRETS, STACK, api, context, git, need, sh } from './lib.ts';
import { PREVIOUS_MODEL, seedOpening } from './opening.ts';

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
// Share the already-installed package tree, with an instance-local install stamp. Boot never
// downloads dependencies or disables World interception to reach a package registry.
const installed = resolve(ROOT, '.open-autonomy/node_modules');
const manifest = resolve(ROOT, '.open-autonomy/package.json');
for (const dependency of Object.keys(JSON.parse(readFileSync(manifest, 'utf8')).dependencies ?? {})) {
  if (!existsSync(resolve(installed, dependency, 'package.json'))) throw new Error(`Missing ${dependency}; install the cookbook's .open-autonomy dependencies through a tooling World first`);
}
const modules = resolve(project, '.open-autonomy/node_modules');
mkdirSync(modules, { recursive: true });
for (const entry of readdirSync(installed)) {
  if (entry === '.open-autonomy-install' || existsSync(resolve(modules, entry))) continue;
  symlinkSync(resolve(installed, entry), resolve(modules, entry));
}
writeFileSync(resolve(modules, '.open-autonomy-install'), `${String(Bun.hash(readFileSync(manifest)))}\n`);
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
//    the project's bounds and previous model (the registry holds a few keys per account: these two are all it mints).
const models = [...new Set([MODEL, ...CONFIG.models, PREVIOUS_MODEL])];
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
  // A bot token of this world's own: the twin accepts any, and Hermes locks a token machine-wide (two worlds' brains on
  // the one deterministic fake would refuse to connect while the other's gateway runs).
  const token = `${Buffer.from('1000000000000000000').toString('base64url')}.world.${NAME.replace(/[^A-Za-z0-9]/g, '')}`;
  const discord = api(process.env.DISCORD_TWIN_URL, { authorization: 'Bot maintainer' });
  // The brain's home channel: the id the settings name, which a twin that creates a channel on its first message
  // accepts; a twin that ships the installation a freshly invited bot sees (one guild, one text channel) names its own,
  // and the channel the agent and manual operators use is the one written here (channels.env), never a guess.
  let home = process.env.DISCORD_HOME_CHANNEL ?? '1000000000000000001';
  let hello = await discord.post(`/api/v10/channels/${home}/messages`, { content: `home channel of ${ACCOUNT}` });
  if (hello.status === 404) {
    const bot = api(process.env.DISCORD_TWIN_URL, { authorization: `Bot ${token}` });
    const guild = ((await bot.get('/api/v10/users/@me/guilds')).body ?? [])[0]?.id;
    const channel = guild ? ((await bot.get(`/api/v10/guilds/${guild}/channels`)).body ?? []).find((c: any) => c.type === 0)?.id : undefined;
    if (!channel) throw new Error(`discord twin: channel ${home} is unknown and the bot's guild names no text channel (${hello.text.slice(0, 120)})`);
    home = String(channel);
    hello = await discord.post(`/api/v10/channels/${home}/messages`, { content: `home channel of ${ACCOUNT}` });
  }
  if (hello.status !== 200) throw new Error(`discord twin: seed channel → ${hello.status} ${hello.text.slice(0, 200)}`);
  // The home channel is the brain's own: a person there is answered without addressing the bot (Hermes otherwise
  // answers a guild message only when mentioned).
  lines.push(`DISCORD_BOT_TOKEN=${token}`, `DISCORD_HOME_CHANNEL=${home}`, `DISCORD_FREE_RESPONSE_CHANNELS=${home}`, 'DISCORD_ALLOWED_CHANNELS=*', 'DISCORD_ALLOWED_USERS=*');
}
writeFileSync(resolve(SECRETS, 'channels.env'), `${lines.join('\n')}\n`);
// The page reads the repository: sync it now rather than waiting for staleness.
console.log(`seed: docs synced from the twin → ${(await admin.post(`/admin/accounts/${ENC}/sync`)).body?.ok}`);

// 5. OA’s opening situation.
await seedOpening(context((m) => console.log(`seed: ${m}`)));
