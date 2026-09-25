#!/usr/bin/env bun
// The PM's bounded maintenance: inspect releases, land an idle kit upgrade, request a drained restart, and put a ready
// release on the Release pull request. Never deploys, tags or publishes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project = resolve(import.meta.dir, '..');
const home = process.env.HERMES_HOME;
if (!home) throw new Error('maintenance requires HERMES_HOME from the running stack');
const command = process.argv[2] ?? 'status';
// Hermes removes credentials from terminal tools, so the PM's `ship` re-enters with only its configured GitHub door (the
// valve's App port and the word `valve`), as community.ts does; the values stay in the child and are never printed.
if (command === 'ship' && !process.env.GITHUB_TOKEN && !process.env.OA_COMMUNITY_DOOR_LOADED) {
  const script = `import os, sys
from hermes_cli.config import load_env
saved = load_env()
for name in ("GITHUB_TOKEN", "GITHUB_API_URL"):
    if saved.get(name): os.environ.setdefault(name, saved[name])
os.environ["OA_COMMUNITY_DOOR_LOADED"] = "1"
os.execvpe(sys.argv[1], sys.argv[1:], os.environ)`;
  const child = Bun.spawnSync({ cmd: ['python', '-c', script, process.execPath, ...process.argv.slice(1)], stdio: ['inherit', 'inherit', 'inherit'] });
  process.exit(child.exitCode);
}
// Bun does not use the world's HTTP injector. Point bunx at the same registry
// npm queried so the rehearsal release, rather than a cached public package, is applied.
const bunxEnv = process.env.NPM_REGISTRY_TWIN_URL ? { ...process.env, BUN_CONFIG_REGISTRY: process.env.NPM_REGISTRY_TWIN_URL } : process.env;
const run = (cmd: string[], cwd = project): string => {
  const result = Bun.spawnSync({ cmd, cwd, env: cmd[0] === 'bunx' ? bunxEnv : process.env, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(' ')} failed: ${result.stderr.toString().trim()}`);
  return result.stdout.toString().trim();
};
const git = (...args: string[]) => run(['git', ...args]);
type Task = { id: string; title: string; status: string; body?: string };
const board = () => JSON.parse(run(['hermes', 'kanban', 'list', '--json'])) as Task[];
const idle = () => !board().some((t) => ['running', 'review'].includes(t.status));
const record = (text: string) => JSON.parse(text) as { version: string; skew?: string };
const installed = record(readFileSync(resolve(project, '.open-autonomy/kit.json'), 'utf8')).version;
const runningFile = resolve(home, 'running-kit.json');
const running = existsSync(runningFile) ? record(readFileSync(runningFile, 'utf8')).version : null;
const stable = (version: string) => /^\d+\.\d+\.\d+$/.test(version);
const newer = (a: string, b: string) => {
  if (!stable(a) || !stable(b)) throw new Error(`expected stable kit versions, got ${a} and ${b}`);
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i]! > bb[i]!;
  return false;
};

// The release package's single-line fields.
function field(text: string, name: string): string {
  const values = text.split('\n').filter((line) => line.startsWith(`${name}:`)).map((line) => line.slice(name.length + 1).trim());
  if (values.length !== 1 || !values[0]) throw new Error(`the release package needs one nonempty ${name}: field`);
  return values[0];
}

if (command === 'ship') {
  // One pull request titled Release (main → prod) is what ships: whatever has landed on main compounds onto it, and
  // the owner's approval covers the diff it shows (a later push to main dismisses it). PM runs this every pass: it opens
  // the Release while main is ahead of prod, and when PM has decided the Release is ready, writes PM's package as its
  // description and mentions the owner there once per release: the only time the owner is contacted. Their merge
  // deploys and publishes. See PRODUCTION.md.
  const configText = readFileSync(resolve(project, '.open-autonomy/config.yaml'), 'utf8');
  const config = Bun.YAML.parse(configText) as { account: string };
  const api = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("ship needs the project's GitHub door (GITHUB_API_URL and GITHUB_TOKEN)");
  const request = (method: string, path: string, body?: unknown) => fetch(`${api}/repos/${config.account}${path}`, {
    method, headers: { authorization: `token ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const gh = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const r = await request(method, path, body);
    if (!r.ok) throw new Error(`GitHub ${method} ${path} answered ${r.status}`);
    return r.json() as Promise<T>;
  };
  const comments = async (issue: number): Promise<string[]> => {
    const all: string[] = [];
    for (let page = 1; ; page++) {
      const batch = await gh<Array<{ body?: string }>>('GET', `/issues/${issue}/comments?per_page=100&page=${page}`);
      all.push(...batch.map((c) => c.body ?? ''));
      if (batch.length < 100) return all;
    }
  };
  const org = config.account.split('/')[0];
  let [open] = await gh<Array<{ number: number; html_url: string }>>('GET', `/pulls?state=open&base=prod&head=${org}:main`);
  if (!open) {
    const compare = await request('GET', '/compare/prod...main');
    if (compare.status === 404) { console.log("No prod branch; setup's production door makes it. Nothing to ship."); process.exit(0); }
    if (!compare.ok) throw new Error(`GitHub GET /compare/prod...main answered ${compare.status}`);
    if ((await compare.json() as { ahead_by: number }).ahead_by === 0) { console.log('prod has everything on main; nothing to ship.'); process.exit(0); }
    open = await gh<{ number: number; html_url: string }>('POST', '/pulls', { title: 'Release', head: 'main', base: 'prod', body: 'Merging ships `main` to production: the workflows that run on a push to `prod` deploy and publish it. Read the whole diff first; money and auth changes are the owner\'s to read. Merge with a merge commit.' });
    console.log(`Opened the Release: ${open.html_url}`);
  }
  git('fetch', '-q', 'origin', 'main');
  const requested = git('show', 'origin/main:ROADMAP.md').split(/^## /m)
    .filter((section) => /^Release decision: request-review$/m.test(section));
  if (requested.length !== 1) {
    console.log(requested.length
      ? 'More than one release section requests review; PM reconciles ROADMAP.md first.'
      : `No release requested; changes keep compounding on ${open.html_url}.`);
    process.exit(0);
  }
  const release = requested[0].split(':')[0]!.trim();
  const packagePath = resolve(home, 'release-review.md');
  const review = existsSync(packagePath) ? readFileSync(packagePath, 'utf8').trim() : '';
  let scope: string;
  try {
    if (field(review, 'Release') !== release) throw new Error(`the package is for another release than ${release}`);
    scope = field(review, 'Scope');
    for (const name of ['Risks', 'Owner reads', 'Owner does']) field(review, name);
    if (!/\[[^\]]+\]\(https:\/\/[^)]+\)/.test(field(review, 'Verification'))) throw new Error('Verification needs source links');
  } catch (error) {
    console.log(`The Release is not ready: ${(error as Error).message}. Nothing sent.`);
    process.exit(0);
  }
  // Each Release pull request is one release, told once. A package written before the last Release merged belongs to
  // that one and never announces the next.
  const marker = '<!-- open-autonomy:release-ready -->';
  const merged = await gh<Array<{ merged_at: string | null }>>('GET', `/pulls?state=closed&base=prod&head=${org}:main&per_page=20`);
  const lastShip = Math.max(0, ...merged.map((p) => (p.merged_at ? Date.parse(p.merged_at) : 0)));
  if (Bun.file(packagePath).lastModified <= lastShip) {
    console.log(`The package predates the last Release; write it for ${release} before asking again. Nothing sent.`);
    process.exit(0);
  }
  const tail = 'Merging ships `main` to production: the workflows that run on a push to `prod` deploy and publish it.';
  await gh('PATCH', `/issues/${open.number}`, { body: `${marker}\n${review}\n\n${tail}` });
  if ((await comments(open.number)).some((c) => c.startsWith(marker))) {
    console.log(`Release ${release} is on ${open.html_url}; the owner was already told.`);
  } else {
    const { parseTeamConfig } = await import('./sdk/team.ts');
    const owners = parseTeamConfig(configText).members
      .filter((m) => m.scopes.includes('owner') && m.github).map((m) => `@${m.github!.login}`);
    if (!owners.length) throw new Error('the roster names no owner with a GitHub account to tell');
    await gh('POST', `/issues/${open.number}/comments`, { body: `${marker}\n${owners.join(' ')} The Release is ready: ${scope}` });
    console.log(`Release ${release} is on ${open.html_url}; the owner is told once.`);
  }
} else if (command === 'restart') {
  if (!idle()) { console.log('A task is running or under review; restart waits for an idle hour.'); process.exit(0); }
  git('fetch', '-q', 'origin', 'main');
  const landed = record(git('show', 'origin/main:.open-autonomy/kit.json')).version;
  if (running === landed) { console.log(`Gateway already runs kit ${landed}.`); process.exit(0); }
  if (!running) throw new Error('the running stack predates managed restarts; restart it once with the current start script');
  if (git('status', '--porcelain')) throw new Error('checkout has uncommitted work; restart waits until it is preserved');
  writeFileSync(resolve(home, 'kit-restart.json'), JSON.stringify({ version: landed }));
  console.log(`Kit ${landed} landed; the supervisor will drain the gateway and restart the complete stack.`);
} else if (command === 'status' || command === 'upgrade') {
  const latest = run(['npm', 'view', 'create-open-autonomy', 'version']).trim();
  console.log(JSON.stringify({ installed, running, latest, idle: idle() }));
  if (command === 'status' || !newer(latest, installed)) process.exit(0);
  if (!idle()) { console.log('A task is running or under review; upgrade waits for an idle hour.'); process.exit(0); }
  git('fetch', '-q', 'origin', 'main');
  const landed = record(git('show', 'origin/main:.open-autonomy/kit.json')).version;
  if (!newer(latest, landed)) { console.log(`Kit ${landed} already landed; request a restart.`); process.exit(0); }
  const branch = `land/kit-${latest}`;
  if (git('ls-remote', '--heads', 'origin', branch)) {
    console.log(`Upgrade ${branch} is already pushed.`);
    process.exit(0);
  }
  const parent = resolve(home, 'kit-upgrades');
  mkdirSync(parent, { recursive: true });
  const worktree = resolve(parent, latest);
  if (existsSync(worktree)) {
    if (run(['git', 'branch', '--show-current'], worktree) !== branch) throw new Error(`${worktree} is not the expected upgrade branch ${branch}`);
    console.log(`Resuming the preserved upgrade at ${worktree}.`);
  } else git('worktree', 'add', '-b', branch, worktree, 'origin/main');
  const stagedVersion = record(readFileSync(resolve(worktree, '.open-autonomy/kit.json'), 'utf8')).version;
  if (stagedVersion !== latest) {
    // A three-way merge: exit 2 means files were left marked. The worktree stays for the PM to resolve them in its own
    // session; the next `maintain.ts upgrade` resumes here, and the kit's check below refuses to push a marked file.
    const up = Bun.spawnSync({ cmd: ['bunx', `create-open-autonomy@${latest}`, 'upgrade', '.'], cwd: worktree, env: bunxEnv, stdout: 'pipe', stderr: 'pipe' });
    const said = `${up.stdout.toString()}${up.stderr.toString()}`.trim();
    if (up.exitCode === 2) { console.log(`${said}\nThe upgrade left conflicts in ${worktree}. Resolve each marked file there, keeping this project's intent and the kit's change, then run \`maintain.ts upgrade\` again.`); process.exit(2); }
    if (up.exitCode !== 0) throw new Error(`create-open-autonomy@${latest} upgrade failed: ${said}`);
    console.log(said);
  }
  run(['bunx', `create-open-autonomy@${latest}`, 'check', '.'], worktree);
  // An upgrade moves only kit-owned files, so the kit's check is its verification. A self-build repository is the
  // kit's own package too (soc2 is self-build with a layer), and its template ships the typecheck that proves the
  // kit's sources still compile.
  if (['self-build', 'soc2'].includes(record(readFileSync(resolve(worktree, '.open-autonomy/kit.json'), 'utf8')).skew ?? '')) {
    run(['bun', 'install', '--frozen-lockfile'], worktree);
    run(['bun', 'run', 'check'], worktree);
  }
  if (!idle()) throw new Error(`a task started during the upgrade; ${worktree} is preserved and has not been pushed`);
  run(['git', 'add', '-A'], worktree);
  if (run(['git', 'status', '--porcelain'], worktree)) run(['git', '-c', 'core.hooksPath=/dev/null', 'commit', '-s', '--author=Open Autonomy agent <agent@open-autonomy.org>', '-m', `kit-${latest}: take the kit upgrade`], worktree);
  // Land it the way this repository lands changes, read from main as it stands, never from the upgrade's result: a
  // branch its landing workflow takes, or, where main carries no landing workflow, main itself. An upgrade branch
  // nobody lands is an upgrade that never happens. A rule that refuses the push fails it here, loudly, with the
  // worktree preserved.
  git('fetch', '-q', 'origin', 'main');
  if (Bun.spawnSync({ cmd: ['git', 'cat-file', '-e', 'origin/main:.github/workflows/land.yml'], cwd: project }).exitCode === 0) {
    run(['git', 'push', '-u', 'origin', branch], worktree);
    git('worktree', 'remove', worktree);
    console.log(`Pushed ${branch}; the landing workflow opens its pull request, and it lands on independent agent review.`);
  } else {
    // Main moves while a conflict waits for its resolution (the PM lands its planning commits there directly), so the
    // upgrade goes on top of main as it is now. A rebase that cannot apply leaves the worktree for the PM.
    const rebase = Bun.spawnSync({ cmd: ['git', 'rebase', 'origin/main'], cwd: worktree, stdout: 'pipe', stderr: 'pipe' });
    if (rebase.exitCode !== 0) {
      Bun.spawnSync({ cmd: ['git', 'rebase', '--abort'], cwd: worktree });
      throw new Error(`the upgrade does not apply on main as it now stands; ${worktree} is preserved: bring it onto origin/main, then run \`maintain.ts upgrade\` again`);
    }
    run(['git', 'push', 'origin', 'HEAD:main'], worktree);
    git('worktree', 'remove', worktree);
    git('branch', '-D', branch);
    console.log(`Kit ${latest} landed on main; request a restart.`);
  }
} else throw new Error('usage: maintain.ts status | upgrade | restart | ship');
