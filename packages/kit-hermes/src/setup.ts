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
// the landing, the selected Git authentication, the platform key, the owner's
// rulesets. The doors are recommended from what the repository and the accounts show, and each is the owner's to
// take, decline, or defer (`setup` again adds a deferred one). What is never automated: creating the accounts, and
// any captcha or sudo prompt — those are named as the owner's up front.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, realpathSync, lstatSync } from 'node:fs';
import { homedir, platform as osPlatform } from 'node:os';
import { parseEnv } from 'node:util';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { checkCredentialDirectory } from '@open-autonomy/sdk/credentials';
import { localCodexLogin, probeLocalCodex, checkLocalCodexProfiles } from '@open-autonomy/sdk/local-codex';
import { readBranding } from './branding.ts';
import { validateParams } from './kit.ts';

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
  const project = validateParams({ project: kit.params?.project ?? repo, account }).project;
  const pkg = existsSync(join(dir, 'package.json')) ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) : {};
  const deploy: Situation['deploy'] = existsSync(join(dir, 'wrangler.toml')) || existsSync(join(dir, 'wrangler.jsonc')) ? 'cloudflare-worker'
    : pkg.name && pkg.private !== true && (pkg.publishConfig || pkg.main || pkg.exports || pkg.bin) ? 'npm'
    : existsSync(join(dir, 'Dockerfile')) ? 'container' : 'none';
  const login = run(['gh', 'api', 'user', '--jq', '.login']).out || null;
  const organization = owner ? run(['gh', 'api', `orgs/${owner}`, '--jq', '.type']) : null;
  const personal = organization && !organization.ok && /HTTP 404/.test(organization.err)
    ? run(['gh', 'api', `users/${owner}`, '--jq', '.type']) : null;
  const ownerIsOrg = organization?.ok && organization.out === 'Organization' ? true
    : personal?.ok && personal.out === 'User' ? false : null;
  let sponsorsListing = false;
  if (owner) { try { const r = spawnSync('curl', ['-sL', '--max-time', '8', `https://github.com/sponsors/${owner}`], { encoding: 'utf8' }); sponsorsListing = /Select a tier/.test(r.stdout ?? ''); } catch { /* offline: no recommendation */ } }
  const dockerServer = run(['docker', 'version', '--format', '{{.Server.Version}}']);
  return {
    dir, project, account, owner, repo, ownerIsOrg, login, deploy, sponsorsListing,
    discordToken: Boolean(process.env.DISCORD_BOT_TOKEN),
    codex: localCodexLogin(),
    docker: dockerServer.ok && Boolean(dockerServer.out.trim()) && run(['docker', 'compose', 'version']).ok,
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
  out.push({ door: 'subscription', suggested: 'no', reason: s.codex
    ? 'the installed local Codex reports a ChatGPT login: offer this choice alongside Open Autonomy models, explaining the required host/container service; verify model access and the project runtime separately'
    : 'local Codex is unavailable or has no verified ChatGPT login: offer Open Autonomy models or guided local Codex sign-in',
    cost: 'local Codex uses this computer and its operator’s allowance, through the prepared host/container service; Open Autonomy models use project funds and can run on an agreed local or hosted fleet' });
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
  if (repository.ok && repository.json?.default_branch !== 'main') throw new Error('This Hermes kit requires main as the default branch for its runtime and landing. Agree and complete a repository migration with the owner before setup, or use a compatible kit; no Git, policy or credential changes were made.');
  if (!repository.ok) {
    if (hasOrigin || !/HTTP 404/.test(repository.err)) throw new Error(`Cannot access ${s.account} on GitHub. Resolve repository access or connectivity before setup; no repository was created.`);
    if (existsSync(join(s.dir, '.git')) && setupGit(s, 'symbolic-ref', '--short', 'HEAD') !== 'main') throw new Error('Create the project from an agreed main checkout before setup. The existing local branch was preserved; no repository or credentials were created.');
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
  const file = join(opts.secrets, 'deploy_key');
  say(`\nDeploy key: a repository-scoped key the ssh-agent holds and the gateway pushes through; it never touches another repository.`);
  if (opts.plan) return;
  mkdirSync(opts.secrets, { recursive: true, mode: 0o700 });
  if (!existsSync(file)) { const r = run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', `${s.project} agent`, '-f', file]); if (!r.ok) throw new Error(`ssh-keygen: ${r.err}`); }
  const pub = readFileSync(`${file}.pub`, 'utf8').trim();
  const listed = gh(['api', `repos/${s.account}/keys?per_page=100`, '--paginate', '--slurp']);
  if (!listed.ok || !Array.isArray(listed.json) || !listed.json.every(Array.isArray)) throw new Error('Cannot inspect repository deploy keys. Resolve GitHub access before continuing; no key was registered.');
  const keyIdentity = (key: string) => key.trim().split(/\s+/).slice(0, 2).join(' ');
  const registered = (listed.json.flat() as Array<{ key: string; read_only: boolean; enabled?: boolean }>).find((key) => typeof key.key === 'string' && keyIdentity(key.key) === keyIdentity(pub));
  if (registered) {
    if (registered.read_only !== false || registered.enabled === false) throw new Error('The registered deploy key does not permit writes. Reconcile its access with the owner before resuming; its permissions were not changed.');
  } else {
    if (done(st, 'deploy-key')) throw new Error('The saved deploy key is no longer registered for this repository. Reconcile its revocation or the intended credential with the owner before resuming; it was not re-registered.');
    const r = run(['gh', 'repo', 'deploy-key', 'add', `${file}.pub`, '--repo', s.account, '--allow-write', '--title', `${s.project} agent`]);
    if (!r.ok) throw new Error(`deploy key: ${r.err}`);
  }
  mark(s.dir, st, 'deploy-key', file);
}

function stepPlatformKey(s: Situation, opts: Opts, st: SetupState): void {
  if (done(st, 'platform-key')) return;
  say(`\nPlatform keys: the adopter way — the key tool prepares a public claim when needed; the setup agent lands it through the normal Git/PR process, then reruns setup to mint the developer's key and the treasurer's into ${opts.secrets}. The agent never sees either.`);
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
function ensureRuleset(s: Situation, body: Record<string, unknown>): void {
  const listed = gh(['api', `repos/${s.account}/rulesets`]);
  if (!listed.ok || !Array.isArray(listed.json)) throw new Error('Cannot inspect repository rulesets; resolve access before changing repository policy.');
  // Existing policy belongs to the owner. Setup must not weaken it by replaying template defaults.
  if (listed.json.some((r: { name: string }) => r.name === body.name)) return;
  const r = gh(['api', '-X', 'POST', `repos/${s.account}/rulesets`], body);
  if (!r.ok) throw new Error(`ruleset ${body.name}: ${r.err}`);
}

function stepOwnerRules(s: Situation, opts: Opts, st: SetupState): void {
  say('\nRepository policy: preserve existing rulesets, prepare absent kit defaults, and land CODEOWNERS. The setup agent verifies the actual owner and effective review policy before activation.');
  if (opts.plan) return;
  if (setupGit(s, 'diff', '--cached', '--name-only')) throw new Error('Finish or preserve the staged work before owner-rule setup; setup will not include it in its commit.');
  setupGit(s, 'fetch', '-q', 'origin');
  const co = join(s.dir, '.github', 'CODEOWNERS');
  const remote = run(['git', 'show', 'origin/main:.github/CODEOWNERS'], { cwd: s.dir });
  const pending = run(['git', 'show', 'refs/heads/land/owner-rules:.github/CODEOWNERS'], { cwd: s.dir });
  if (pending.ok && remote.ok && pending.out !== remote.out && !run(['git', 'merge-base', '--is-ancestor', 'refs/heads/land/owner-rules', 'origin/main'], { cwd: s.dir }).ok) {
    throw new Error('The existing owner-rules branch differs from the landed policy and has not merged. Reconcile that pending change through normal Git/PR tools before completing owner-rule setup.');
  }
  // An unchanged file on stale default-branch history is not a request to revert a landed policy change.
  const unchanged = !setupGit(s, 'status', '--porcelain', '--', '.github/CODEOWNERS');
  const onDefaultHistory = run(['git', 'merge-base', '--is-ancestor', 'HEAD', 'origin/main'], { cwd: s.dir }).ok;
  const intended = remote.ok && unchanged && onDefaultHistory ? remote.out
    : existsSync(co) ? readFileSync(co, 'utf8').trim() : pending.ok ? pending.out : remote.ok ? remote.out
    : `# The workflows are the owner's: a landing that touches them waits for the owner's review, so a workflow that holds a\n# secret is never changed by the agent. Everything else lands with no review.\n/.github/ @${s.login}`;
  ensureRuleset(s, { name: 'main-protected', target: 'branch', enforcement: 'active', bypass_actors: [], conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } }, rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }, { type: 'pull_request', parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: false, require_code_owner_review: true, require_last_push_approval: false, required_review_thread_resolution: false } }] });
  if (!remote.ok || remote.out !== intended) {
    if (!existsSync(co) && !pending.ok) {
      mkdirSync(join(s.dir, '.github'), { recursive: true });
      writeFileSync(co, `${intended}\n`);
    }
    throw new Error('Reconcile the intended CODEOWNERS with the agreed owner policy and land it on main through normal Git/PR tools, then rerun setup. Reuse an existing owner-rules branch/PR and exclude unrelated feature work; setup does not commit, switch branches or push it.');
  }
  mark(s.dir, st, 'owner-rules', 'main-protected ruleset present; CODEOWNERS landed; effective owner policy requires setup-agent verification');
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
  ensureRuleset(s, { name: 'deploy-tags-admin-only', target: 'tag', enforcement: 'active', bypass_actors: bypassAdmin(s), conditions: { ref_name: { include: ['refs/tags/deploy-v*'], exclude: [] } }, rules: [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }] });
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

function stepGitHubApp(opts: Opts): void {
  if (opts.plan) return;
  const file = join(opts.secrets, 'github-app.json');
  if (!existsSync(file)) throw new Error('The project GitHub App credential is missing. Follow .open-autonomy/SETUP.md: use the standalone credential receiver and the browser skill, then rerun setup.');
  say('  GitHub App credential is present. The setup agent completes installation in the browser and verifies repository access through the running valve before activation.');
}

async function stepDiscord(s: Situation, opts: Opts, st: SetupState): Promise<void> {
  if (opts.plan) return;
  const file = join(opts.secrets, 'channels.env');
  const prior = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const saved = parseEnv(prior) as Record<string, string>;
  const channel = process.env.DISCORD_HOME_CHANNEL ?? saved.DISCORD_HOME_CHANNEL;
  if (!channel || !/^\d+$/.test(channel)) throw new Error('The setup agent must select the agreed Discord destination first, using DISCORD_HOME_CHANNEL. No server or channel was chosen automatically.');
  const tokenFile = join(opts.secrets, 'discord.token');
  const token = process.env.DISCORD_BOT_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : saved.DISCORD_BOT_TOKEN);
  if (!token) throw new Error('Receive the project Discord token into discord.token in the protected credential directory, then rerun setup. Follow .open-autonomy/SETUP.md; do not paste the token into chat.');
  const read = async (path: string): Promise<any> => {
    let response: Response;
    try { response = await fetch(`https://discord.com/api/v10/${path}`, { signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bot ${token}` } }); }
    catch { throw new Error('Cannot reach Discord with the saved credential; resolve the connection before rerunning setup.'); }
    if (!response.ok) throw new Error(`Discord ${path} returned ${response.status}; verify the project app and agreed destination before rerunning setup.`);
    return response.json();
  };
  const me = await read('oauth2/applications/@me');
  const brand = readBranding(s.dir);
  if (me.name !== brand.name || typeof me.id !== 'string' || !/^\d+$/.test(me.id)) throw new Error('Discord application identity does not match the project branding. The setup agent must verify the existing application and reconcile its branding in the browser.');
  const destination = await read(`channels/${channel}`);
  if (destination.id !== channel || !destination.guild_id) throw new Error('The chosen Discord destination is not an accessible server channel. Verify the agreed public destination; direct messages are not a fleet workspace.');
  mkdirSync(opts.secrets, { recursive: true, mode: 0o700 });
  // Only connection values change. Participation, tool access and report delivery belong to native
  // Hermes configuration and the project communication skill, not this credential verification step.
  const kept = prior.split('\n').filter((line) => !/^\s*(?:export\s+)?DISCORD_(BOT_TOKEN|HOME_CHANNEL)\s*=/.test(line) && line.trim());
  writeFileSync(file, `${[...kept, `DISCORD_BOT_TOKEN=${JSON.stringify(token)}`, `DISCORD_HOME_CHANNEL=${channel}`].join('\n')}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  mark(s.dir, st, 'discord', `app ${me.id}, guild ${destination.guild_id}, channel ${channel}; native permissions and delivery require setup-agent verification`);
  say(`  Discord app ${me.id} can reach channel ${channel}. The setup agent verifies the agreed public access, branding and per-job delivery through the project communication skill.`);
}

async function stepSubscription(s: Situation, opts: Opts, st: SetupState): Promise<void> {
  // Verified before any provisioning, including on reruns. No auth-file copying,
  // no OAuth refresh implementation, and no hosted substitute for this computer.
  const config = Bun.YAML.parse(readFileSync(join(s.dir, 'hermes/config.yaml'), 'utf8')) as any;
  const stateDir = join(homedir(), '.local', 'state', 'open-autonomy', ...s.account.split('/'), 'codex-runtime-state');
  say('  Checking the installed Codex account and agreed model; authentication stays with Codex.');
  say('  Codex startup warning: the installed CLI may pause while preparing or indexing its local database, especially with an existing session history. Setup waits up to three minutes. A timeout alone does not mean your login is broken; inspect Codex startup before restarting or signing in again.');
  const verified = await probeLocalCodex({ stateDir, model: config.model.default });
  mark(s.dir, st, 'subscription', `installed Codex confirmed ChatGPT and ${verified.model}; project database state at ${stateDir}; native metadata verified; setup agent verifies and installs the isolated host/container service separately`);
}

function printStart(s: Situation, opts: Opts, localCodex: boolean): void {
  // Identity and delegation are established by the setup agent in the project-owned skill. Do not race
  // that work by starting the fleet here, or mark a printed command as a completed activation.
  say('\nInfrastructure prepared; project setup still needs the setup agent to verify the shared branding on each integration, finish the team roster in .open-autonomy/config.yaml and communication practices in hermes/skills/project-communications/SKILL.md, verify native permissions and actual human release reviewers, and land those settings before activation. Reuse established evidence on a rerun; report unresolved identities explicitly.');
  if (localCodex) {
    say('\nFor local Codex, follow SETUP.md to run the installed .open-autonomy/local-runtime.ts entrypoint on the host with one container built from the local target. Verify the complete project loop before reporting activation. The ordinary start.ts and managed Compose entrypoint do not run this arrangement.');
    return;
  }
  say(`\nAfter that verification, start ${opts.bare ? 'bare, as you — for development and fast debugging; the agent can reach its own keys' : 'in the container — the default for a real setup; the agent cannot reach its keys'}:`);
  if (opts.bare) {
    say(`  bun .open-autonomy/start.ts --secrets ${opts.secrets}   (keep it running under launchd or systemd; .open-autonomy/PRODUCTION.md and container/README.md say how)`);
  } else {
    if (!s.docker) say('  A working Docker connection is not verified; select or start a local runtime before starting the container.');
    say('  sh container/build-hermes.sh   # build the pinned base image if absent');
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
  const opts: Opts = { plan: false, yes: false, with: [], without: [], bare: false, ...raw, secrets: raw.secrets ?? join(homedir(), '.config', 'open-autonomy') };
  const doors: Door[] = ['production', 'release', 'github-app', 'discord', 'subscription', 'sponsors'];
  for (const door of [...opts.with, ...opts.without]) {
    if (!doors.includes(door)) throw new Error(`Unknown setup connection: ${door}. Supported: ${doors.join(', ')}`);
    if (opts.with.includes(door) && opts.without.includes(door)) throw new Error(`${door} cannot be both selected and declined`);
  }
  const s = readSituation(dir);
  if (!s.account) throw new Error(`${dir} is not a kit project (.open-autonomy/config.yaml names no account); run create or adopt first`);
  checkGitTarget(s);
  if (!opts.plan && s.ownerIsOrg !== true) throw new Error(s.ownerIsOrg === false
    ? 'Open Autonomy project setup requires a GitHub organization-owned repository. Agree an organization with the owner and reconcile the intended repository before provisioning; no repository transfer or credential changes were made.'
    : 'Cannot verify the GitHub organization. Resolve GitHub sign-in, lookup access or the organization name before provisioning; no repository or credential changes were made.');
  if (s.project !== 'open-autonomy' && opts.secrets === join(homedir(), '.config', 'open-autonomy') && !raw.secrets) opts.secrets = join(homedir(), '.config', `open-autonomy-${s.project}`);
  const credentialDir = checkCredentialDirectory(opts.secrets);
  for (const name of ['agent.env', 'treasurer.env', 'deploy_key', 'deploy_key.pub', 'github-app.json', 'codex.json', 'channels.env', 'discord.token']) {
    let entry;
    try { entry = lstatSync(join(credentialDir, name)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (entry && (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1)) throw new Error(`${name} must be a regular credential file, not a symlink, hard link or directory. Reconcile protected storage before setup; no credential was read or written.`);
  }
  const withinProject = relative(realpathSync(s.dir), credentialDir);
  if (!withinProject || (!isAbsolute(withinProject) && withinProject !== '..' && !withinProject.startsWith(`..${sep}`))) throw new Error('Credentials cannot be saved inside the project, including before Git initialization. Choose protected storage outside the project.');
  const st = loadState(dir);
  say('Setup agent: follow .open-autonomy/SETUP.md. Establish the project brief and agreed development connections first; keep application services in the local world until live activation.');
  say(`${s.project} (${s.account}) — the situation:`);
  say(s.ownerIsOrg === true
    ? `  organization: ${s.owner}. Discover its existing project setup and communication space before choosing new connections; use a project-branded bot and project channels in an agreed shared server/workspace.`
    : '  organization: unresolved. Setup requires a verified GitHub organization; personal repositories need an owner-agreed organization target before provisioning.');
  say(`  deploys as: ${s.deploy} · owner: ${s.owner} (${s.ownerIsOrg === null ? 'unknown' : s.ownerIsOrg ? 'an org' : 'a user'}) · signed in: ${s.login ?? 'no'} · sponsors listing: ${s.sponsorsListing ? 'yes' : 'no'} · discord token: ${s.discordToken ? 'yes' : 'no'} · codex login: ${s.codex ? 'yes' : 'no'} · docker ready: ${s.docker ? 'yes' : 'no'}`);
  say(`  yours alone, always: creating your GitHub and platform accounts, any captcha, any sudo prompt. Everything else the setup does, and opens the exact page when your click is needed.`);
  say('  setup agent: verify Bun 1.3.10 or newer in the actual host service and Hermes terminal, install project dependencies, commit the generated lockfile and run the project check before activation. The kit uses Bun.YAML; a newer setup shell alone does not fix an older service runtime.');
  say('  setup agent: complete a first branding pass using branding/README.md: reuse or create the project name, short blurb and square icon. Provisional is fine. Use that identity for every project integration, including both Discord application and bot profiles; preserve existing application IDs and never substitute the Hermes/runtime name. Reconcile existing integrations even when their infrastructure steps are already complete.');
  say('  setup agent: follow the agreed communication policy in hermes/skills/project-communications/SKILL.md; configure only the selected platforms and verify actual human outreach and replies. Keep confidential spaces outside the publicly logged fleet.');
  say('  setup agent: record verified owner/delegate platform IDs, scoped authority and its source in the shared team section of .open-autonomy/config.yaml. Follow the communication skill for native permissions and preserve the agreed repository review policy.');
  say('  setup agent: compare the detected Codex subscription with the configured platform’s live /v1/catalog through an authorized standalone valve; /v1/models lists only that key’s bounds. Present the available options and costs, ask for the model arrangement, then apply --with subscription or --without subscription. A default of no prevents unattended enrollment; it does not replace this offer. Follow SETUP.md when the platform connection is not ready yet.');
  say('  setup agent: verify the owner on GitHub (gh api user: numeric id and login) and separately on every enabled human communication platform. Link accounts only with owner-authorized evidence; repository organizations, server ownership and the helper running setup are not interchangeable with the project owner. This command defaults new workflow ownership/production review to the authenticated GitHub account: establish the agreed reviewer before those steps. Activation follows the completed agreement, not this command.');
  say('\nAfter establishing the owner and reviewer, the core prepares the repository on GitHub, the selected Git authentication, the platform keys and the owner\'s rules.');
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
    const question = r.door === 'subscription'
      ? 'Use the installed Codex on this computer for development, under its ChatGPT allowance?'
      : `${r.door}: take it?`;
    st.doors[r.door] = ask(question, r.suggested === 'yes', opts) ? 'yes' : 'no';
  }
  if (st.doors.subscription === 'yes' && st.doors['github-app'] !== 'yes') throw new Error('Local Codex Git requires the project GitHub App with Contents: write. Resolve the development connection choice before creating credentials.');
  // Completion markers describe an earlier run, not the contents of the currently selected host.
  // Leave recovery to the setup agent; never silently replace a missing credential on a resumed step.
  const savedCredentials: Array<[string, string[]]> = [['deploy-key', ['deploy_key', 'deploy_key.pub']], ['platform-key', ['agent.env', 'treasurer.env']]];
  for (const [step, files] of savedCredentials) {
    if (step === 'deploy-key' && st.doors.subscription === 'yes') continue;
    if (done(st, step) && files.some((file) => !existsSync(join(opts.secrets, file)))) throw new Error(`The saved setup step ${step} is missing credential files in the selected directory. Restore the intended files or reconcile the credential directory and setup record before resuming; no replacement credential was issued.`);
  }
  say(st.doors.subscription === 'yes'
    ? '  Git authentication: project GitHub App on the host valve, Contents: write. Complete this grant during initial registration; no SSH deploy key is needed.'
    : '  Git authentication: repository-scoped SSH deploy key. The community App needs Contents: read.');
  // Branding is agent-led work, not a generator or a final-design approval gate. Check before creating new apps.
  if (st.doors.discord === 'yes' && !done(st, 'discord')) readBranding(dir);
  if (st.doors.subscription === 'yes') {
    checkLocalCodexProfiles(join(s.dir, 'hermes'));
    if (!s.codex) throw new Error('Local Codex needs the installed codex CLI signed in with ChatGPT as this operator. Complete codex login locally and rerun setup; no credentials were copied.');
  }
  saveState(dir, st);
  stepGitHub(s, opts, st);
  if (st.doors.subscription !== 'yes') stepDeployKey(s, opts, st);
  stepPlatformKey(s, opts, st);
  say('\nFunding: minting keys and setting spending limits do not fund the project. Before activation, the setup agent verifies usable balance on the configured platform’s project page and completes an owner-authorized gift or coupon redemption if needed. The /give flow transfers existing credits; do not assume a grant. Then verify a bounded model call with the agreed model. An explicitly selected subscription uses its operator’s allowance instead.');
  stepOwnerRules(s, opts, st);
  if (opts.with.includes('production') && st.doors.production === 'yes') stepProduction(s, opts, st);
  if (st.doors['github-app'] === 'yes') stepGitHubApp(opts);
  if (st.doors.discord === 'yes') await stepDiscord(s, opts, st);
  if (st.doors.subscription === 'yes') await stepSubscription(s, opts, st);
  if (opts.with.includes('sponsors') && st.doors.sponsors === 'later') say(`\nSponsors: when the platform routes ${s.owner}'s listing, setup again wires the webhook.`);
  printStart(s, opts, st.doors.subscription === 'yes');
  say(`\nThe page after activation: https://open-autonomy.org/p/${encodeURIComponent(s.account)}. \`create-open-autonomy setup\` again adds a deferred door or repairs a step; it does not start or restart the fleet.`);
}
