#!/usr/bin/env bun
// The install set up inside the review World the way a person would (adapted from Open Autonomy's world/seed.ts): this
// checkout's HEAD as a repository on the GitHub twin; each profile on its install route with a model the World's twins
// catalogue (the Claude profiles through the platform to its gateway, the Merge twin; the Codex profiles through the
// OpenAI twin); the account funded on the World's books; its key minted the adopter way. Idempotent over a running World.
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, CLAUDE_MODEL, CLAUDE_SMALL, ENC, MACHINE, MODEL, OWNER, REPO_NAME, ROOT, SECRETS, STACK, api, git, need } from './lib.ts';

const github = need('GITHUB_TWIN_URL');
const platform = need('PLATFORM_URL').replace(/\/$/, '');
const gh = api(github, { authorization: 'Bearer world-bot' });
const admin = api(platform, { 'x-admin-token': process.env.AGENT_PROXY_ADMIN_TOKEN ?? 'world-admin' });
const pub = api(platform);
mkdirSync(SECRETS, { recursive: true });
const project = resolve(STACK, 'project');

// 1. The repository on the GitHub twin, from this checkout's HEAD.
if ((await git(ROOT, 'status', '--porcelain', '--untracked-files=no')).trim()) throw new Error('seed: this checkout has uncommitted changes; the World clones what HEAD says — commit first');
await gh.post('/orgs', { login: OWNER });
const created = await gh.post(`/orgs/${OWNER}/repos`, { name: REPO_NAME, default_branch: 'main', private: false });
if (![201, 422].includes(created.status)) throw new Error(`github twin: create repo → ${created.status} ${created.text.slice(0, 200)}`);
const remote = `${github}/${ACCOUNT}.git`;
if (created.status === 201 || !(await git(ROOT, 'ls-remote', remote, 'refs/heads/main'))) await git(ROOT, 'push', '-q', '-f', '--no-thin', remote, 'HEAD:refs/heads/main');
mkdirSync(STACK, { recursive: true });
// The checkout declares its real origin (github.com/<owner>/<repo>), the repository's identity; git's URL rewrite in the
// World's HOME sends its transport to the GitHub twin, as a mirror would.
await git(ROOT, 'config', '--file', resolve(need('HOME'), '.gitconfig'), `url.${github}/.insteadOf`, 'https://github.com/');
const origin = `https://github.com/${ACCOUNT}.git`;
if (existsSync(resolve(project, '.git'))) { await git(project, 'remote', 'set-url', 'origin', origin); await git(project, 'fetch', '-q', 'origin'); await git(project, 'reset', '-q', '--hard', 'origin/main'); }
else await git(STACK, 'clone', '-q', origin, project);
await git(project, 'config', 'user.name', 'agent'); await git(project, 'config', 'user.email', 'agent@example.test');

// 2. This World only, committed on the twin's main as an owner would, so the start (which reads agent.json from
//    origin/main) runs it; the repository's own agent.json is untouched. Each profile keeps the install's route: the
//    Claude profiles through the org valve and the platform to its gateway (the Merge twin), on a model that twin
//    catalogues; the Codex profiles on the owner's subscription route (here the OpenAI twin), on the model it catalogues.
const setupPath = resolve(project, '.open-autonomy/agent.json');
const setup = JSON.parse(readFileSync(setupPath, 'utf8'));
for (const profile of Object.values(setup.profiles) as any[]) {
  const route = profile.inference.models.project;
  if (route.provider === 'openai-codex') {
    route.model = MODEL;
    profile.extensions.hermes.config['worker.model'] = MODEL;
  } else {
    // the live install runs Claude on the host's own login; the World's Claude runs on the rail, through the twin
    profile.inference.models.project = { provider: 'custom', model: CLAUDE_MODEL, endpoint: 'OPEN_AUTONOMY_BASE_URL', credential: 'OPEN_AUTONOMY_KEY', api_mode: 'anthropic_messages' };
    profile.inference.unattended = 'project';
    delete profile.extensions.hermes.config['worker.home'];
  }
}
// The manager, as a mail agent of its own (its main session on Claude through the Anthropic twin), so drafts, ticks
// and the owner's lines to it have an address here; the live install names the fleet manager's session at the switch.
setup.agents = { ...(setup.agents ?? {}), manager: { profile: 'manager', program: 'claude' } };
const boardFile = resolve(project, 'home/workflow.yaml');
// A claim lasts two minutes here (fifteen in the install), so a supervised session's extension shows in a rehearsal.
writeFileSync(boardFile, readFileSync(boardFile, 'utf8').replace(/^  managers: .*$/m, `  managers: ['sc:${MACHINE}:agent:manager']`)
  .replace(/^  claim_ttl_seconds: \d+$/m, '  claim_ttl_seconds: 120'));
// A thread session ends after one idle minute here, so a review sees the close and the resume (row 3) without waiting.
for (const agent of Object.values(setup.agents ?? {}) as any[]) {
  agent.idle_minutes = 1;
  // The account Room is opened on the rehearsal RH2 for the World's owner persona (production declares it in its org
  // document).
  if (agent.channel?.rh2 && process.env.VO_RH2_OWNER) agent.channel.rh2.principal = process.env.VO_RH2_OWNER;
}
writeFileSync(setupPath, `${JSON.stringify(setup, null, 2)}\n`);
// The World publishes as its own account (the live install publishes as the organization's).
const configPath = resolve(project, '.open-autonomy/config.yaml');
writeFileSync(configPath, readFileSync(configPath, 'utf8').replace(/^account: .*$/m, `account: ${ACCOUNT}`));
if ((await git(project, 'status', '--porcelain', '--', '.open-autonomy/agent.json', '.open-autonomy/config.yaml')).trim()) {
  await git(project, '-c', 'user.name=owner', '-c', 'user.email=owner@example.com', 'commit', '-q', '-am', 'review World: each profile on a model its route catalogues, under the World account');
  await git(project, 'push', '-q', '--no-thin', 'origin', 'HEAD:refs/heads/main');
}

// 3. The installed host packages, shared into the World clone (boot never downloads them).
const installed = resolve(ROOT, '.open-autonomy/node_modules');
const manifest = resolve(ROOT, '.open-autonomy/package.json');
for (const dependency of Object.keys(JSON.parse(readFileSync(manifest, 'utf8')).dependencies ?? {})) {
  if (!existsSync(resolve(installed, dependency, 'package.json'))) throw new Error(`Missing ${dependency}; install the install's .open-autonomy dependencies through a tooling World first`);
}
const modules = resolve(project, '.open-autonomy/node_modules');
mkdirSync(modules, { recursive: true });
for (const entry of readdirSync(installed)) if (entry !== '.open-autonomy-install' && !existsSync(resolve(modules, entry))) symlinkSync(resolve(installed, entry), resolve(modules, entry));
// The stamp the start reads: the kit's own install identity for its package files and default registry.
const { runtimeInstallIdentity } = await import(resolve(project, '.open-autonomy/install-runtime.ts'));
writeFileSync(resolve(modules, '.open-autonomy-install'), `${runtimeInstallIdentity({ directory: resolve(project, '.open-autonomy') })}\n`);
console.log(`seed: ${ACCOUNT} on the GitHub twin at ${await git(project, 'rev-parse', '--short', 'HEAD')}, cloned to ${project}`);

// 4. The books and the key, the adopter way (challenge → claim file on main → mint). A key already minted is kept.
const minted = await admin.post(`/admin/accounts/${ENC}/mint`, { amount_usd_cents: 5000, key: 'world-seed' });
if (minted.status !== 200) throw new Error(`platform: mint → ${minted.status} ${minted.text.slice(0, 200)}`);
const keyFile = resolve(SECRETS, 'agent.env');
const key = /^OPEN_AUTONOMY_KEY=(.+)$/m.exec(existsSync(keyFile) ? readFileSync(keyFile, 'utf8') : '')?.[1];
const alive = !!key && (await fetch(`${platform}/v1/keys`, { headers: { authorization: `Bearer ${key}` } })).status === 200;
if (!alive) {
  const challenge = await pub.get(`/v1/keys/challenge?account=${ENC}`);
  if (challenge.status !== 200) throw new Error(`platform: challenge → ${challenge.status} ${challenge.text.slice(0, 200)}`);
  writeFileSync(resolve(project, challenge.body.file), `${challenge.body.claim}\n`);
  await git(project, 'add', challenge.body.file);
  if ((await git(project, 'status', '--porcelain', '--', challenge.body.file)).trim()) await git(project, 'commit', '-q', '-m', 'claim');
  await git(project, 'push', '-q', '--no-thin', 'origin', 'HEAD:refs/heads/main');
  const minted = await pub.post('/v1/keys/mint', { account: ACCOUNT, models: [MODEL, CLAUDE_MODEL, CLAUDE_SMALL] });
  if (minted.status !== 200 || !minted.body?.token) throw new Error(`platform: mint key → ${minted.status} ${minted.text.slice(0, 300)}`);
  writeFileSync(keyFile, `OPEN_AUTONOMY_BASE_URL=${platform}/v1\nOPEN_AUTONOMY_KEY=${minted.body.token}\n`);
  console.log(`seed: key minted by claim file → ${SECRETS}`);
} else {
  writeFileSync(keyFile, readFileSync(keyFile, 'utf8').replace(/^OPEN_AUTONOMY_BASE_URL=.*$/m, `OPEN_AUTONOMY_BASE_URL=${platform}/v1`));
  console.log('seed: the key already minted on this backend copy is kept');
}

// 4b. The owner's steer key (the owner's word: statements), minted through the same claim, for the usage statement.
if (!existsSync(resolve(SECRETS, 'steer.env'))) {
  const steer = await pub.post('/v1/keys/mint', { account: ACCOUNT, scopes: ['steer'] });
  if (steer.status !== 200 || !steer.body?.token) throw new Error(`platform: mint steer key → ${steer.status} ${steer.text.slice(0, 300)}`);
  writeFileSync(resolve(SECRETS, 'steer.env'), `OPEN_AUTONOMY_STEER_KEY=${steer.body.token}\n`, { mode: 0o600 });
}

// 4c. The organization's projects (config.yaml `organization.projects`) as accounts of their own (RFC 0021 decision 10): each a repository on the
//     GitHub twin, its key minted the adopter way (a claim file on its main), kept in this install's custody, so the
//     start runs its reporter and a card tagged with it publishes under it.
const projectAccounts = ((Bun.YAML.parse(readFileSync(resolve(ROOT, '.open-autonomy', 'config.yaml'), 'utf8')) as { organization?: { projects?: Array<{ account?: string }> } }).organization?.projects ?? []).map((p) => String(p.account ?? '')).filter((a) => /^[^/\s]+\/[^/\s]+$/.test(a));
for (const projectAccount of projectAccounts) {
  const dir = resolve(SECRETS, 'projects', ...projectAccount.split('/'));
  if (existsSync(resolve(dir, 'agent.env'))) continue;
  const [, repoName] = projectAccount.split('/');
  await gh.post(`/orgs/${OWNER}/repos`, { name: repoName, default_branch: 'main', private: false });
  const enc = encodeURIComponent(projectAccount);
  const funded = await admin.post(`/admin/accounts/${enc}/mint`, { amount_usd_cents: 1000, key: `world-seed-${repoName}` });
  if (funded.status !== 200) throw new Error(`platform: mint ${projectAccount} → ${funded.status} ${funded.text.slice(0, 200)}`);
  const challenge = await pub.get(`/v1/keys/challenge?account=${enc}`);
  if (challenge.status !== 200) throw new Error(`platform: challenge ${projectAccount} → ${challenge.status} ${challenge.text.slice(0, 200)}`);
  const checkout = resolve(STACK, 'projects', repoName);
  mkdirSync(checkout, { recursive: true });
  if (!existsSync(resolve(checkout, '.git'))) await git(checkout, 'init', '-q', '-b', 'main');
  writeFileSync(resolve(checkout, challenge.body.file), `${challenge.body.claim}\n`);
  await git(checkout, 'add', '-A');
  await git(checkout, '-c', 'user.name=owner', '-c', 'user.email=owner@example.com', 'commit', '-q', '--allow-empty', '-m', 'claim');
  await git(checkout, 'push', '-q', '-f', '--no-thin', `${github}/${projectAccount}.git`, 'HEAD:refs/heads/main');
  const minted = await pub.post('/v1/keys/mint', { account: projectAccount, models: [MODEL, CLAUDE_MODEL, CLAUDE_SMALL] });
  if (minted.status !== 200 || !minted.body?.token) throw new Error(`platform: mint key ${projectAccount} → ${minted.status} ${minted.text.slice(0, 300)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'agent.env'), `OPEN_AUTONOMY_BASE_URL=${platform}/v1\nOPEN_AUTONOMY_KEY=${minted.body.token}\n`, { mode: 0o600 });
  console.log(`seed: ${projectAccount} on the GitHub twin, its key minted by claim file → ${dir}`);
}

// 5. The install's board, initialized once in its home as its owner did for the live install (the start dispatches the
//    home's boards and creates none); a board already there is kept.
if (!existsSync(resolve(need('VO_AGENT_HOME'), 'kanban'))) {
  const init = Bun.spawnSync({ cmd: [need('VO_SUPERCODE_BIN'), 'workflow', 'init', '--root', need('VO_AGENT_HOME')], stdout: 'pipe', stderr: 'pipe' });
  if (init.exitCode !== 0) throw new Error(`seed: workflow init: ${init.stderr.toString().trim().split('\n').at(-1)}`);
  console.log(`seed: ${init.stdout.toString().trim().split('\n')[0]}`);
}

// 6. Claude Code in the World's HOME: onboarded, the twin's key accepted and the mail agents' folders trusted, as a person
//    who had run it once would leave it; its model is the Anthropic twin (ANTHROPIC_BASE_URL).
const home = need('HOME');
mkdirSync(home, { recursive: true });
const trusted = Object.fromEntries(Object.values(setup.agents ?? {}).map((agent: any) => [resolve(home, 'profiles', agent.profile), { hasTrustDialogAccepted: true, hasClaudeMdExternalIncludesApproved: true, hasClaudeMdExternalIncludesWarningShown: true }]));
writeFileSync(resolve(home, '.claude.json'), `${JSON.stringify({ hasCompletedOnboarding: true, customApiKeyResponses: { approved: ['sk-twin'], rejected: [] }, projects: trusted }, null, 2)}\n`);
// Claude's own settings carry its endpoint (a pane runs with its machine's tmux environment, not this one), the GitHub
// twin and a World token for supercode's GitHub reads (Claude's tool shell drops NODE_OPTIONS, the twin injector), and the
// owner's two standing answers: a profile's CLAUDE.md imports the organization's layer, and opened sessions run
// without prompts. Its auto-updater is off: it would reinstall the host's global claude-code every few minutes, and
// each running session keeps the replaced binary open.
mkdirSync(resolve(home, '.claude'), { recursive: true });
writeFileSync(resolve(home, '.claude/settings.json'), `${JSON.stringify({ env: { ANTHROPIC_BASE_URL: need('ANTHROPIC_TWIN_URL'), ANTHROPIC_API_KEY: 'sk-twin', SUPERCODE_ORCHESTRATOR_ENTRY: need('VO_ORCHESTRATOR_BIN'), GITHUB_API_URL: github, GH_TOKEN: 'world-bot', SUPERCODE_BIN: need('VO_SUPERCODE_BIN'), DISABLE_AUTOUPDATER: '1' }, skipDangerousModePermissionPrompt: true }, null, 2)}\n`);

// 5. The install's own scenarios (company RFC 0026 decision 6): each `world/scenarios/*.ts` runs once the install is
//    seeded, with this World's environment, in name order: an engagement's twins and opening data (its client's
//    tickets, the client's repository as a snapshot, its synthetic client), never the kit's.
{
  const dir = resolve(SCENARIO, 'scenarios');
  for (const file of existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.ts')).sort() : []) {
    console.log(`seed: scenario ${file}`);
    const run = Bun.spawnSync({ cmd: ['bun', resolve(dir, file)], cwd: ROOT, env: process.env as Record<string, string>, stdout: 'inherit', stderr: 'inherit' });
    if (run.exitCode !== 0) throw new Error(`seed: scenario ${file} exited ${run.exitCode}`);
  }
}
