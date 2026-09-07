// create-open-autonomy setup: prepare the infrastructure for an agent-led, funded, gated project — the owner's
// own laptop, their own accounts, Open Autonomy's money. It reads the project's situation, recommends the doors that
// fit it with the reason for each, does every step an API allows, and for the steps only a person may take (a sudo
// prompt, a captcha, a token page) it opens the exact page, says the one action, and continues when the page comes
// back. Every step is idempotent and resumable: the choices live in .open-autonomy/setup.json (no secret ever does),
// the secrets in the secrets directory the start script reads, the deploy credential in a GitHub environment.
// Initial setup connects the development fleet. Product deployment is a later, explicit --with choice;
// neither application files nor a previous production setup enroll a fresh development setup in it.
//
//   create-open-autonomy setup <dir> [--plan] [--yes] [--with a,b] [--without a,b] [--secrets <dir>] [--bare]
//
// After the setup agent establishes the owner and reviewer, the core prepares the repository on GitHub,
// the landing, the deploy key, the platform key, the owner's
// rulesets. The doors are recommended from what the repository and the accounts show, and each is the owner's to
// take, decline, or defer (`setup` again adds a deferred one). What is never automated: creating the accounts, and
// any captcha or sudo prompt — those are named as the owner's up front.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, realpathSync } from 'node:fs';
import { homedir, platform as osPlatform } from 'node:os';
import { join, resolve } from 'node:path';
import { readBranding } from './branding.ts';

export type Door = 'production' | 'release' | 'github-app' | 'discord' | 'subscription' | 'sponsors';
type Choice = 'yes' | 'no' | 'later';
interface SetupState { version: 1; steps: Record<string, string>; doors: Partial<Record<Door, Choice>>; notes: Record<string, string> }
export interface Situation {
  dir: string; project: string; account: string; owner: string; repo: string; ownerIsOrg: boolean | null; login: string | null;
  deploy: 'cloudflare-worker' | 'npm' | 'container' | 'none'; sponsorsListing: boolean; discordToken: boolean; codex: boolean; docker: boolean;
}
export interface Recommendation { door: Door; suggested: Choice; reason: string; cost: string }
interface Opts { plan: boolean; yes: boolean; with: Door[]; without: Door[]; secrets: string; bare: boolean; accountId?: string }

const say = (m: string) => console.log(m);
const ask = (q: string, def: boolean, opts: Opts): boolean => {
  if (opts.yes) return def;
  const a = prompt(`${q} ${def ? '[Y/n]' : '[y/N]'}`)?.trim().toLowerCase();
  return a ? a.startsWith('y') : def;
};
const secretPrompt = (label: string): string => {
  process.stdout.write(`${label}: `);
  const r = spawnSync('sh', ['-c', 'stty -echo 2>/dev/null; IFS= read -r x; stty echo 2>/dev/null; printf "%s" "$x"'], { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' });
  process.stdout.write('\n');
  return (r.stdout ?? '').trim();
};
const run = (cmd: string[], opts: { cwd?: string; input?: string; env?: Record<string, string> } = {}): { ok: boolean; out: string; err: string } => {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: opts.cwd, input: opts.input, encoding: 'utf8', env: { ...process.env, ...opts.env } });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
};
const gh = (args: string[], input?: unknown): { ok: boolean; json: any; err: string } => {
  const r = run(['gh', ...args, ...(input !== undefined ? ['--input', '-'] : [])], { input: input !== undefined ? JSON.stringify(input) : undefined });
  let json: any = null; try { json = r.out ? JSON.parse(r.out) : null; } catch { json = r.out; }
  return { ok: r.ok, json, err: r.err };
};
const openUrl = (url: string, action: string): void => {
  say(`\n  → opening ${url}\n    browser setup step: ${action}`);
  const opener = osPlatform() === 'darwin' ? 'open' : osPlatform() === 'win32' ? 'start' : 'xdg-open';
  spawnSync(opener, [url], { stdio: 'ignore' });
};

// Setup may resume in a different checkout. A saved step never authorizes a different Git target.
// Read configured URLs without printing them: a legacy URL may contain an embedded credential.
function checkGitTarget(s: Situation): boolean {
  const git = (...args: string[]) => run(['git', ...args], { cwd: s.dir });
  const top = git('rev-parse', '--show-toplevel');
  if (!top.ok) {
    if (existsSync(join(s.dir, '.git'))) throw new Error('Cannot inspect this Git checkout; repair it before setup');
    return false;
  }
  if (realpathSync(top.out) !== realpathSync(s.dir)) throw new Error('The setup directory is inside another Git repository. Use a separate project directory; setup will not stage the parent repository.');
  const matches = (url: string) => {
    const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/|ssh:\/\/git@ssh\.github\.com:443\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(url);
    return match?.[1].toLowerCase() === s.account.toLowerCase();
  };
  for (const key of ['remote.origin.url', 'remote.origin.pushurl']) {
    const urls = git('config', '--get-all', key).out.split('\n').filter(Boolean);
    if (urls.some((url) => !matches(url))) throw new Error(`${key} does not name ${s.account} on GitHub. Reconcile the intended checkout before setup; no remote was changed.`);
  }
  return Boolean(git('config', '--get', 'remote.origin.url').out);
}

function setupGit(s: Situation, ...args: string[]): string {
  const r = run(['git', ...args], { cwd: s.dir });
  if (!r.ok) throw new Error(`Setup Git command failed (${args[0]}); the step is incomplete. Resolve the Git error and rerun setup.`);
  return r.out;
}

// ── The situation ────────────────────────────────────────────────────────────────────────────────────────────────
export function readSituation(dir: string): Situation {
  const config = existsSync(join(dir, '.open-autonomy', 'config.yaml')) ? readFileSync(join(dir, '.open-autonomy', 'config.yaml'), 'utf8') : '';
  const account = /^account:\s*(\S+)/m.exec(config)?.[1] ?? '';
  const [owner = '', repo = ''] = account.split('/');
  const kit = existsSync(join(dir, '.open-autonomy', 'kit.json')) ? JSON.parse(readFileSync(join(dir, '.open-autonomy', 'kit.json'), 'utf8')) : {};
  const project = kit.params?.project ?? repo;
  const pkg = existsSync(join(dir, 'package.json')) ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) : {};
  const deploy: Situation['deploy'] = existsSync(join(dir, 'wrangler.toml')) || existsSync(join(dir, 'wrangler.jsonc')) ? 'cloudflare-worker'
    : pkg.name && pkg.private !== true && (pkg.publishConfig || pkg.main || pkg.exports || pkg.bin) ? 'npm'
    : existsSync(join(dir, 'Dockerfile')) ? 'container' : 'none';
  const login = run(['gh', 'api', 'user', '--jq', '.login']).out || null;
  const ownerType = owner ? run(['gh', 'api', `users/${owner}`, '--jq', '.type']).out : '';
  const ownerIsOrg = ownerType ? ownerType === 'Organization' : null;
  let sponsorsListing = false;
  if (owner) { try { const r = spawnSync('curl', ['-sL', '--max-time', '8', `https://github.com/sponsors/${owner}`], { encoding: 'utf8' }); sponsorsListing = /Select a tier/.test(r.stdout ?? ''); } catch { /* offline: no recommendation */ } }
  return {
    dir, project, account, owner, repo, ownerIsOrg, login, deploy, sponsorsListing,
    discordToken: Boolean(process.env.DISCORD_BOT_TOKEN),
    codex: existsSync(join(homedir(), '.codex', 'auth.json')),
    docker: run(['docker', 'compose', 'version']).ok,
  };
}

// ── The recommendations: each door, a default for this situation, and the reason ─────────────────────────────────
export function recommend(s: Situation, selected: Door[] = []): Recommendation[] {
  const out: Recommendation[] = [];
  if (selected.includes('production')) out.push(s.deploy === 'cloudflare-worker'
    ? { door: 'production', suggested: 'yes', reason: 'the repository is a Cloudflare Worker (wrangler.toml): a gated production door lets a human ship it from a tag, with the token in a GitHub environment no machine holds', cost: 'one token page on Cloudflare (you paste it once) and your GitHub sign-in' }
    : s.deploy === 'container'
      ? { door: 'production', suggested: 'later', reason: 'the repository has a Dockerfile but names no host; the gated door is ready whenever it does (.open-autonomy/PRODUCTION.md)', cost: 'nothing now' }
      : { door: 'production', suggested: 'no', reason: 'the repository deploys nowhere that the setup recognizes; nothing to gate yet', cost: 'nothing' });
  if (selected.includes('release')) out.push({ door: 'release', suggested: 'later', reason: 'artifact publication is a later owner-reviewed setup; this CLI does not yet scaffold its workflow', cost: 'no token collected; follow the project publication procedure' });
  out.push({ door: 'github-app', suggested: 'yes', reason: "the community desk answers the repository's issues and discussions as the project's own GitHub App — one approval, and it reaches everyone who already found the repository", cost: 'browser-led registration and installation; the credential receiver handles the secret handoff' });
  out.push({ door: 'discord', suggested: 'no', reason: 'select only if the owner agreed to Discord for development; available credentials do not choose the communication platform or destination', cost: s.discordToken ? 'verify the existing application belongs to this project, then authorize its agreed server' : 'guided browser setup: project application, secure token entry and server authorization' });
  out.push(s.codex
    ? { door: 'subscription', suggested: 'yes', reason: "a Codex login is on this machine: the agent's model can run on your subscription, outside the project's funds, with the page saying so; the grant then buys only the cookbook model", cost: 'nothing: the valve serves the login and the agent never sees it' }
    : { door: 'subscription', suggested: 'no', reason: "no subscription found; the project's grant funds the model, bounded by .open-autonomy/config.yaml", cost: 'nothing' });
  if (selected.includes('sponsors')) out.push(s.sponsorsListing
    ? { door: 'sponsors', suggested: 'later', reason: `${s.owner} has an approved GitHub Sponsors listing; sponsorships of an org land on the platform's grants pool and are given on to projects, and per-org routing for other orgs is not on the platform yet`, cost: 'a webhook in your Sponsors dashboard, when the platform routes it' }
    : { door: 'sponsors', suggested: 'no', reason: 'no Sponsors listing; when you want patrons, GitHub Sponsors or Polar are the two doors, and the project page shows the tiers the moment either exists', cost: 'nothing now' });
  return out;
}

// ── State ────────────────────────────────────────────────────────────────────────────────────────────────────────
const stateFile = (dir: string) => join(dir, '.open-autonomy', 'setup.json');
const loadState = (dir: string): SetupState => existsSync(stateFile(dir)) ? JSON.parse(readFileSync(stateFile(dir), 'utf8')) : { version: 1, steps: {}, doors: {}, notes: {} };
const saveState = (dir: string, s: SetupState) => writeFileSync(stateFile(dir), `${JSON.stringify(s, null, 2)}\n`);
const done = (st: SetupState, step: string) => Boolean(st.steps[step]);
const mark = (dir: string, st: SetupState, step: string, note?: string) => { st.steps[step] = new Date().toISOString(); if (note) st.notes[step] = note; saveState(dir, st); say(`  ✓ ${step}${note ? ` — ${note}` : ''}`); };

// ── Steps ────────────────────────────────────────────────────────────────────────────────────────────────────────
function stepGitHub(s: Situation, opts: Opts, st: SetupState): void {
  const hasOrigin = checkGitTarget(s);
  if (!s.login && !run(['gh', 'auth', 'status']).ok) {
    say("\nGitHub sign-in: the GitHub CLI's device flow — a code appears here, the page opens, you approve it.");
    if (opts.plan) return;
    const r = spawnSync('gh', ['auth', 'login', '--web', '-h', 'github.com', '-p', 'https', '-s', 'repo,workflow,admin:public_key,read:org'], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('GitHub sign-in did not complete');
  }
  const identity = run(['gh', 'api', 'user', '--jq', '.login']);
  s.login = identity.ok && identity.out ? identity.out : null;
  if (!s.login) throw new Error('Cannot verify the current GitHub account. Resolve authentication or connectivity before setup; the GitHub step is incomplete.');
  if (opts.plan) return;
  const repository = gh(['api', `repos/${s.account}`]);
  if (!repository.ok) {
    if (hasOrigin || !/HTTP 404/.test(repository.err)) throw new Error(`Cannot access ${s.account} on GitHub. Resolve repository access or connectivity before setup; no repository was created.`);
    say(`\nThe repository ${s.account} does not exist yet; creating it public, from this checkout.`);
    if (!existsSync(join(s.dir, '.git'))) setupGit(s, 'init', '-q', '-b', 'main');
    setupGit(s, 'add', '-A');
    if (setupGit(s, 'status', '--porcelain')) setupGit(s, 'commit', '-q', '-m', 'the kit');
    const r = run(['gh', 'repo', 'create', s.account, '--public', '--source=.', '--remote=origin', '--push'], { cwd: s.dir });
    if (!r.ok) throw new Error(`gh repo create: ${r.err}`);
  } else if (!hasOrigin) {
    throw new Error(`${s.account} already exists but this directory has no origin. Clone the existing repository or reconcile this checkout before setup; no remote was changed.`);
  }
  setupGit(s, 'fetch', '-q', 'origin');
  mark(s.dir, st, 'github', `${s.account}, signed in as ${s.login}`);
}

function stepDeployKey(s: Situation, opts: Opts, st: SetupState): void {
  if (done(st, 'deploy-key')) return;
  const file = join(opts.secrets, 'deploy_key');
  say(`\nDeploy key: a repository-scoped key the ssh-agent holds and the gateway pushes through; it never touches another repository.`);
  if (opts.plan) return;
  mkdirSync(opts.secrets, { recursive: true, mode: 0o700 });
  if (!existsSync(file)) { const r = run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', `${s.project} agent`, '-f', file]); if (!r.ok) throw new Error(`ssh-keygen: ${r.err}`); }
  const pub = readFileSync(`${file}.pub`, 'utf8').trim();
  const existing = gh(['api', `repos/${s.account}/keys`]).json as Array<{ key: string }> | null;
  if (!existing?.some((k) => pub.startsWith(k.key))) { const r = run(['gh', 'repo', 'deploy-key', 'add', `${file}.pub`, '--repo', s.account, '--allow-write', '--title', `${s.project} agent`]); if (!r.ok) throw new Error(`deploy key: ${r.err}`); }
  mark(s.dir, st, 'deploy-key', file);
}

function stepPlatformKey(s: Situation, opts: Opts, st: SetupState): void {
  if (done(st, 'platform-key')) return;
  say(`\nPlatform keys: the adopter way — a claim file committed to prove the repository is yours, then the developer's key and the treasurer's, into ${opts.secrets}. The agent never sees either.`);
  if (opts.plan) return;
  for (const [file, extra] of [['agent.env', []], ['treasurer.env', ['--scopes', 'spend,narrate,pay']]] as const) {
    const out = join(opts.secrets, file);
    if (existsSync(out) && /^OPEN_AUTONOMY_KEY=/m.test(readFileSync(out, 'utf8'))) continue;
    const r = spawnSync('bun', [join(s.dir, '.open-autonomy', 'mint-key.ts'), '--out', out, ...extra], { cwd: s.dir, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`minting ${file} failed`);
    chmodSync(out, 0o600);
  }
  mark(s.dir, st, 'platform-key', `${opts.secrets}/agent.env, treasurer.env`);
}

const bypassAdmin = (s: Situation) => (s.ownerIsOrg ? [{ actor_id: 1, actor_type: 'OrganizationAdmin', bypass_mode: 'always' }] : [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }]);
function upsertRuleset(s: Situation, body: Record<string, unknown>): void {
  const existing = (gh(['api', `repos/${s.account}/rulesets`]).json as Array<{ id: number; name: string }> | null)?.find((r) => r.name === body.name);
  const r = existing ? gh(['api', '-X', 'PUT', `repos/${s.account}/rulesets/${existing.id}`], body) : gh(['api', '-X', 'POST', `repos/${s.account}/rulesets`], body);
  if (!r.ok) throw new Error(`ruleset ${body.name}: ${r.err}`);
}

function stepOwnerRules(s: Situation, opts: Opts, st: SetupState): void {
  if (done(st, 'owner-rules')) return;
  say(`\nThe owner's rules: nothing pushes main (a pull request, no bypass); .github/ is yours (CODEOWNERS, code-owner review), so a landing that touches a workflow waits for you and everything else lands unreviewed.`);
  if (opts.plan) return;
  mkdirSync(join(s.dir, '.github'), { recursive: true });
  const co = join(s.dir, '.github', 'CODEOWNERS');
  if (!existsSync(co)) writeFileSync(co, `# The workflows are the owner's: a landing that touches them waits for the owner's review, so a workflow that holds a\n# secret is never changed by the agent. Everything else lands with no review.\n/.github/ @${s.login}\n`);
  upsertRuleset(s, { name: 'main-protected', target: 'branch', enforcement: 'active', bypass_actors: [], conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } }, rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }, { type: 'pull_request', parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: false, require_code_owner_review: true, require_last_push_approval: false, required_review_thread_resolution: false } }] });
  if (run(['git', 'status', '--porcelain', '--', '.github/CODEOWNERS'], { cwd: s.dir }).out) {
    // The rule requires a pull request from now on, so the CODEOWNERS file itself lands the kit's way: a land/ branch.
    run(['git', 'checkout', '-q', '-B', 'land/owner-rules'], { cwd: s.dir }); run(['git', 'add', '.github/CODEOWNERS'], { cwd: s.dir });
    run(['git', 'commit', '-q', '-m', 'The workflows are the owner\'s: CODEOWNERS on .github/'], { cwd: s.dir });
    run(['git', 'push', '-q', '-u', 'origin', 'land/owner-rules'], { cwd: s.dir }); run(['git', 'checkout', '-q', 'main'], { cwd: s.dir });
  }
  mark(s.dir, st, 'owner-rules', 'main-protected, CODEOWNERS');
}

function stepProduction(s: Situation, opts: Opts, st: SetupState): void {
  if (done(st, 'production')) return;
  say(`\nProduction door: a \`production\` environment with you as reviewer that admits only deploy-v* tags, a tag ruleset only an admin may use, and the Cloudflare token as the environment's one secret.`);
  if (opts.plan) return;
  const uid = Number(run(['gh', 'api', 'user', '--jq', '.id']).out);
  const env = gh(['api', '-X', 'PUT', `repos/${s.account}/environments/production`], { reviewers: [{ type: 'User', id: uid }], deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } });
  if (!env.ok) throw new Error(`environment: ${env.err}`);
  const pols = gh(['api', `repos/${s.account}/environments/production/deployment-branch-policies`]).json?.branch_policies as Array<{ name: string; type: string }> | undefined;
  if (!pols?.some((p) => p.name === 'deploy-v*')) gh(['api', '-X', 'POST', `repos/${s.account}/environments/production/deployment-branch-policies`], { name: 'deploy-v*', type: 'tag' });
  upsertRuleset(s, { name: 'deploy-tags-admin-only', target: 'tag', enforcement: 'active', bypass_actors: bypassAdmin(s), conditions: { ref_name: { include: ['refs/tags/deploy-v*'], exclude: [] } }, rules: [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }] });
  if (s.deploy === 'cloudflare-worker') {
    const accountId = opts.accountId ?? prompt('Cloudflare account id (dash.cloudflare.com → the account → Workers & Pages → Account ID):')?.trim();
    if (accountId) run(['gh', 'variable', 'set', 'CLOUDFLARE_ACCOUNT_ID', '--repo', s.account, '--body', accountId]);
    const secrets = gh(['api', `repos/${s.account}/environments/production/secrets`]).json?.secrets as Array<{ name: string }> | undefined;
    if (!secrets?.some((x) => x.name === 'CLOUDFLARE_API_TOKEN')) {
      const perms = JSON.stringify([{ key: 'workers_scripts', type: 'edit' }, { key: 'account_settings', type: 'read' }, { key: 'user_details', type: 'read' }]);
      openUrl(`https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${encodeURIComponent(perms)}&name=${encodeURIComponent(`${s.project}-deploy`)}`, 'the token page opens pre-filled (Workers Scripts edit, Account Settings read, User Details read): restrict it to your one account, Continue, Create Token, then paste it here — it goes straight into the GitHub environment and nowhere else');
      const token = secretPrompt('Cloudflare API token');
      const v = run(['curl', '-s', '-H', `Authorization: Bearer ${token}`, 'https://api.cloudflare.com/client/v4/user/tokens/verify']);
      if (!/"success":\s*true/.test(v.out)) throw new Error('Cloudflare did not verify that token; run setup again to retry');
      const r = run(['gh', 'secret', 'set', 'CLOUDFLARE_API_TOKEN', '--repo', s.account, '--env', 'production'], { input: token });
      if (!r.ok) throw new Error(`secret: ${r.err}`);
    }
    const wf = join(s.dir, '.github', 'workflows', 'deploy.yml');
    if (!existsSync(wf)) {
      writeFileSync(wf, DEPLOY_YML.replaceAll('__PROJECT__', s.project));
      run(['git', 'checkout', '-q', '-B', 'land/deploy-door'], { cwd: s.dir }); run(['git', 'add', wf], { cwd: s.dir });
      run(['git', 'commit', '-q', '-m', 'The production door: deploy.yml runs from a human-cut deploy-v* tag through the production environment'], { cwd: s.dir });
      run(['git', 'push', '-q', '-u', 'origin', 'land/deploy-door'], { cwd: s.dir }); run(['git', 'checkout', '-q', 'main'], { cwd: s.dir });
      say('  the deploy workflow is on branch land/deploy-door: it touches .github/, so its landing waits for your review (gh pr review --approve, then merge).');
    }
  }
  mark(s.dir, st, 'production', 'environment, tag ruleset' + (s.deploy === 'cloudflare-worker' ? ', Cloudflare token, deploy.yml' : ''));
}

function stepGitHubApp(s: Situation, opts: Opts, st: SetupState): void {
  if (opts.plan) return;
  const file = join(opts.secrets, 'github-app.json');
  if (!existsSync(file)) throw new Error('The project GitHub App credential is missing. Follow .open-autonomy/SETUP.md: use the standalone credential receiver and the browser skill, then rerun setup.');
  const r = run(['bun', join(s.dir, '.open-autonomy', 'sdk', 'credentials.ts'), 'verify-github', '--out', file, '--repository', s.account]);
  if (!r.ok) throw new Error(r.err || 'The project GitHub App installation could not be verified.');
  mark(s.dir, st, 'github-app', `${s.account} installation verified; credential outside the repository`);
}

async function stepDiscord(s: Situation, opts: Opts, st: SetupState): Promise<void> {
  if (done(st, 'discord')) return;
  const file = join(opts.secrets, 'channels.env');
  say(`\nDiscord: no API creates a bot, so the portal opens; you make the application, turn on the three privileged intents under Bot, reset the token and paste it here. The bot is then invited to your server and makes its own #${s.project} channel.`);
  if (opts.plan) return;
  const brand = readBranding(s.dir);
  say(`  Project identity: ${brand.name} — ${brand.description}. Icon: ${brand.icon}. Apply it to both the Discord application and bot profile; preserve their IDs on reruns.`);
  let token = process.env.DISCORD_BOT_TOKEN ?? '';
  if (!token) {
    openUrl('https://discord.com/developers/applications', `Reuse this project's application if present; otherwise New Application (name it ${brand.name}; the captcha is yours) → Bot → enable Presence, Server Members and Message Content intents → Reset Token → copy it`);
    token = secretPrompt('Discord bot token');
  }
  const me = run(['curl', '-s', '-H', `Authorization: Bot ${token}`, 'https://discord.com/api/v10/oauth2/applications/@me']).out;
  const appId = /"id":\s*"(\d+)"/.exec(me)?.[1];
  if (!appId) throw new Error('Discord did not accept that token; run setup again to retry');
  say(`  setup agent: verify application ${appId} belongs to this project. In https://discord.com/developers/applications/${appId}/information use ${brand.name}, the shared blurb and ${brand.icon}; under Bot use the same name and avatar. Do not replace the application to change its branding.`);
  if (JSON.parse(me).name !== brand.name) throw new Error(`Discord application ${appId} has a different name. Verify that it belongs to this project, then set its name to ${brand.name} in the developer portal and rerun setup. Preserve the application ID.`);
  const icon = `data:image/png;base64,${readFileSync(brand.icon).toString('base64')}`;
  for (const [path, body] of [['applications/@me', { description: brand.description, icon }], ['users/@me', { username: brand.name, avatar: icon }]] as const) {
    const result = await fetch(`https://discord.com/api/v10/${path}`, { method: 'PATCH', headers: { Authorization: `Bot ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!result.ok) throw new Error(`Discord ${path} branding update returned ${result.status}; preserve this application and retry the unfinished setup step.`);
  }
  openUrl(`https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot&permissions=68624`, 'pick your server and Authorize (view, send, read history, manage channels — the last only so it can make its own channel)');
  let guild: string | undefined;
  const t0 = Date.now();
  while (!guild && Date.now() - t0 < 5 * 60_000) {
    const g = run(['curl', '-s', '-H', `Authorization: Bot ${token}`, 'https://discord.com/api/v10/users/@me/guilds']).out;
    guild = /"id":\s*"(\d+)"/.exec(g)?.[1];
    if (!guild) Bun.sleepSync(3000);
  }
  if (!guild) throw new Error('the bot joined no server in five minutes; run setup again after inviting it');
  const channels = JSON.parse(run(['curl', '-s', '-H', `Authorization: Bot ${token}`, `https://discord.com/api/v10/guilds/${guild}/channels`]).out || '[]') as Array<{ id: string; name: string; type: number }>;
  let channel = channels.find((c) => c.type === 0 && c.name === s.project)?.id;
  if (!channel) {
    const made = run(['curl', '-s', '-X', 'POST', '-H', `Authorization: Bot ${token}`, '-H', 'content-type: application/json', '-d', JSON.stringify({ name: s.project, type: 0, topic: brand.description }), `https://discord.com/api/v10/guilds/${guild}/channels`]).out;
    channel = /"id":\s*"(\d+)"/.exec(made)?.[1];
  }
  if (!channel) throw new Error('could not find or make the channel; give the bot Manage Channels or make #' + s.project + ' yourself, then run setup again');
  mkdirSync(opts.secrets, { recursive: true, mode: 0o700 });
  // The guild's @everyone role permits public participation without a user-wide DM grant.
  writeFileSync(file, `DISCORD_BOT_TOKEN=${token}\nDISCORD_HOME_CHANNEL=${channel}\nDISCORD_ALLOWED_CHANNELS=${channel}\nDISCORD_FREE_RESPONSE_CHANNELS=${channel}\nDISCORD_ALLOWED_USERS=\nDISCORD_ALLOWED_ROLES=${guild}\n`, { mode: 0o600 });
  say('  setup agent: remove the bot\'s temporary Manage Channels permission after arranging the public channels; verify confidential human spaces remain inaccessible.');
  setDeliver(s.dir, true);
  mark(s.dir, st, 'discord', `#${s.project} (${channel}) → ${file}`);
}

// The schedule's reports go to the channel only when there is one; without it the template promises nothing.
function setDeliver(dir: string, discord: boolean): void {
  const p = join(dir, 'hermes', 'cron', 'jobs.seed.json');
  if (!existsSync(p)) return;
  const doc = JSON.parse(readFileSync(p, 'utf8')) as { jobs: Array<Record<string, unknown>> };
  for (const j of doc.jobs) { if (discord) j.deliver = 'discord'; else delete j.deliver; }
  writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
}

function stepSubscription(s: Situation, opts: Opts, st: SetupState): void {
  if (done(st, 'subscription')) return;
  const src = join(homedir(), '.codex', 'auth.json'); const dst = join(opts.secrets, 'codex.json');
  say(`\nSubscription: the Codex login is copied once to ${dst}; the valve serves it on its third port and refreshes it, the home's .env names it, and hermes/config.yaml points the model at it as a named custom provider. The page labels those sessions as the owner's subscription, outside the project's funds.`);
  if (opts.plan) return;
  if (!existsSync(dst)) { mkdirSync(opts.secrets, { recursive: true, mode: 0o700 }); writeFileSync(dst, readFileSync(src), { mode: 0o600 }); }
  const cfg = join(s.dir, 'hermes', 'config.yaml');
  let text = readFileSync(cfg, 'utf8');
  if (!/codex-valve/.test(text)) {
    text = text.replace(/^model:\n(?:  .*\n)+/m, `model:\n  default: gpt-5.6-sol\n  provider: codex-valve\n\ncustom_providers:\n  - name: codex-valve\n    base_url: \${HERMES_CODEX_BASE_URL}\n    api_key: valve\n    api_mode: codex_responses\n\n`);
    writeFileSync(cfg, text);
    say('  hermes/config.yaml now names the subscription; commit it with the rest.');
  }
  mark(s.dir, st, 'subscription', dst);
}

function printStart(s: Situation, opts: Opts): void {
  // Identity and delegation are established by the setup agent in the project-owned skill. Do not race
  // that work by starting the fleet here, or mark a printed command as a completed activation.
  say('\nInfrastructure prepared; project setup still needs the setup agent to verify the shared branding on each integration, finish the team roster in .open-autonomy/config.yaml and communication practices in hermes/skills/project-communications/SKILL.md, verify native permissions and actual human release reviewers, and land those settings before activation. Reuse established evidence on a rerun; report unresolved identities explicitly.');
  say(`\nAfter that verification, start ${opts.bare ? 'bare, as you — for development and fast debugging; the agent can reach its own keys' : 'in the container — the default for a real setup; the agent cannot reach its keys'}:`);
  if (opts.bare) {
    say(`  bun .open-autonomy/start.ts --secrets ${opts.secrets}   (keep it running under launchd or systemd; .open-autonomy/PRODUCTION.md and container/README.md say how)`);
  } else {
    if (!s.docker) say('  Docker is not here; install it before starting the container.');
    say(`  AGENT_SECRETS=${opts.secrets} STACK=${s.project} docker compose -p ${s.project} -f container/compose.yml up -d --build`);
  }
  say('  An existing fleet uses its supported graceful reload after the changes land. Verify the loaded skill/config and connected platforms before reporting setup complete.');
}

const DEPLOY_YML = `name: Deploy __PROJECT__
# Production, from GitHub only: this runs on a human-cut \`deploy-v*\` tag (or a dispatch from one). The \`production\`
# environment admits only those tags and its required reviewer approves each run, so the workflow that holds the
# token is always the one a human tagged, never the one on main. Egress is locked to GitHub, npm and Cloudflare.
on:
  push:
    tags: ['deploy-v*']
  workflow_dispatch:
permissions:
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: step-security/harden-runner@9af89fc71515a100421586dfdb3dc9c984fbf411 # v2.19.4
        with:
          egress-policy: block
          allowed-endpoints: >
            api.github.com:443
            github.com:443
            codeload.github.com:443
            objects.githubusercontent.com:443
            release-assets.githubusercontent.com:443
            registry.npmjs.org:443
            api.cloudflare.com:443
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: 1.3.10
          no-cache: true
      - run: bun install --frozen-lockfile
      - name: Deploy (the lockfile-pinned wrangler)
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ vars.CLOUDFLARE_ACCOUNT_ID }}
          WRANGLER_SEND_METRICS: "false"
        run: bunx wrangler deploy
`;

// ── The walk ─────────────────────────────────────────────────────────────────────────────────────────────────────
export async function setup(dir: string, raw: Partial<Opts>): Promise<void> {
  const opts: Opts = { plan: false, yes: false, with: [], without: [], secrets: join(homedir(), '.config', 'open-autonomy'), bare: false, ...raw };
  const doors: Door[] = ['production', 'release', 'github-app', 'discord', 'subscription', 'sponsors'];
  for (const door of [...opts.with, ...opts.without]) {
    if (!doors.includes(door)) throw new Error(`Unknown setup connection: ${door}. Supported: ${doors.join(', ')}`);
    if (opts.with.includes(door) && opts.without.includes(door)) throw new Error(`${door} cannot be both selected and declined`);
  }
  const s = readSituation(dir);
  if (!s.account) throw new Error(`${dir} is not a kit project (.open-autonomy/config.yaml names no account); run create or adopt first`);
  checkGitTarget(s);
  if (s.project !== 'open-autonomy' && opts.secrets === join(homedir(), '.config', 'open-autonomy') && !raw.secrets) opts.secrets = join(homedir(), '.config', `open-autonomy-${s.project}`);
  const st = loadState(dir);
  say('Setup agent: follow .open-autonomy/SETUP.md. Establish the project brief and agreed development connections first; keep application services in the local world until live activation.');
  say(`${s.project} (${s.account}) — the situation:`);
  say(`  deploys as: ${s.deploy} · owner: ${s.owner} (${s.ownerIsOrg === null ? 'unknown' : s.ownerIsOrg ? 'an org' : 'a user'}) · signed in: ${s.login ?? 'no'} · sponsors listing: ${s.sponsorsListing ? 'yes' : 'no'} · discord token: ${s.discordToken ? 'yes' : 'no'} · codex login: ${s.codex ? 'yes' : 'no'} · docker: ${s.docker ? 'yes' : 'no'}`);
  say(`  yours alone, always: creating your GitHub and platform accounts, any captcha, any sudo prompt. Everything else the setup does, and opens the exact page when your click is needed.`);
  say('  setup agent: verify Bun 1.3.10 or newer in the actual host service and Hermes terminal, install project dependencies, commit the generated lockfile and run the project check before activation. The kit uses Bun.YAML; a newer setup shell alone does not fix an older service runtime.');
  say('  setup agent: complete a first branding pass using branding/README.md: reuse or create the project name, short blurb and square icon. Provisional is fine. Use that identity for every project integration, including both Discord application and bot profiles; preserve existing application IDs and never substitute the Hermes/runtime name. Reconcile existing integrations even when their infrastructure steps are already complete.');
  say('  setup agent: follow the agreed communication policy in hermes/skills/project-communications/SKILL.md; configure only the selected platforms and verify actual human outreach and replies. Keep confidential spaces outside the publicly logged fleet.');
  say('  setup agent: record verified owner/delegate platform IDs, scoped authority and its source in the shared team section of .open-autonomy/config.yaml. Follow the communication skill for native permissions and preserve the agreed repository review policy.');
  say('  setup agent: verify the owner on GitHub (gh api user: numeric id and login) and separately on every enabled human communication platform. Link accounts only with owner-authorized evidence; repository organizations, server ownership and the helper running setup are not interchangeable with the project owner. This command defaults new workflow ownership/production review to the authenticated GitHub account: establish the agreed reviewer before those steps. Activation follows the completed agreement, not this command.');
  say('\nAfter establishing the owner and reviewer, the core prepares the repository on GitHub, the deploy key, the platform keys and the owner\'s rules.');
  say('\nDevelopment connections (plus any explicitly selected later setup):');
  const recs = recommend(s, opts.with);
  for (const r of recs) {
    const forced = opts.with.includes(r.door) ? 'yes' : opts.without.includes(r.door) ? 'no' : undefined;
    const prior = st.doors[r.door];
    say(`  ${r.door.padEnd(12)} ${(forced ?? prior ?? r.suggested).padEnd(6)} ${r.reason}\n${' '.repeat(21)}costs you: ${r.cost}`);
  }
  say(opts.with.includes('production') || opts.with.includes('release')
    ? '\nLater activation setup explicitly selected. Verify the project target and owner authorization; this does not approve a release. Package release automation remains unsupported.'
    : '\nApplication services: deferred. Develop against the world; select --with production or --with release only for a later, owner-authorized activation. Sponsorship setup is also optional, via --with sponsors.');
  if (opts.plan) { say('\n(--plan: nothing was changed)'); return; }
  // Refuse unsupported later setup before creating any connection or collecting a credential.
  if (opts.with.includes('release')) throw new Error('Package release setup is not implemented by this CLI. Prepare the reviewed publication workflow described in .open-autonomy/PRODUCTION.md; no release credential was collected.');
  if (opts.with.includes('production') && s.deploy !== 'cloudflare-worker') throw new Error('Automatic production setup supports Cloudflare Workers only. Follow the project deployment procedure for this target; no production credential was collected.');
  for (const r of recs) {
    const forced = opts.with.includes(r.door) ? 'yes' : opts.without.includes(r.door) ? 'no' : undefined;
    if (forced) { st.doors[r.door] = forced; continue; }
    if (st.doors[r.door] === 'yes' || st.doors[r.door] === 'no') continue;
    if (r.suggested === 'later' && !ask(`Take the ${r.door} door now?`, false, opts)) { st.doors[r.door] = 'later'; continue; }
    st.doors[r.door] = ask(`${r.door}: take it?`, r.suggested === 'yes', opts) ? 'yes' : 'no';
  }
  // Branding is agent-led work, not a generator or a final-design approval gate. Check before creating new apps.
  if (st.doors.discord === 'yes' && !done(st, 'discord')) readBranding(dir);
  saveState(dir, st);
  stepGitHub(s, opts, st);
  stepDeployKey(s, opts, st);
  stepPlatformKey(s, opts, st);
  stepOwnerRules(s, opts, st);
  if (opts.with.includes('production') && st.doors.production === 'yes') stepProduction(s, opts, st);
  if (st.doors['github-app'] === 'yes') stepGitHubApp(s, opts, st);
  if (st.doors.discord === 'yes') await stepDiscord(s, opts, st); else if (st.doors.discord === 'no') setDeliver(dir, false);
  if (st.doors.subscription === 'yes') stepSubscription(s, opts, st);
  if (opts.with.includes('sponsors') && st.doors.sponsors === 'later') say(`\nSponsors: when the platform routes ${s.owner}'s listing, setup again wires the webhook.`);
  printStart(s, opts);
  say(`\nThe page after activation: https://open-autonomy.org/p/${encodeURIComponent(s.account)}. \`create-open-autonomy setup\` again adds a deferred door or repairs a step; it does not start or restart the fleet.`);
}
