#!/usr/bin/env bun
// The PM's bounded maintenance: inspect releases, land a kit upgrade, request a drained restart, and put a ready
// release on the Release pull request. Never deploys, tags or publishes. `restart` is the install's deployer pass, run
// on a schedule by whoever runs the install (SETUP.md, "Keep the install on main": a launchd or cron job every ten
// minutes, a project's keep job, a PM's pass): it moves a running install onto main (the keeper performs the restart it
// asks for and never fetches main itself), and once the stack runs a revision it has not enrolled, runs enroll.ts.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const project = resolve(process.env.OPEN_AUTONOMY_PROJECT_SOURCE ?? resolve(import.meta.dir, '..'));
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
// Package managers do not use the world's HTTP injector. Point pnpm at the same registry
// the status command queried so the rehearsal release, rather than a cached public package, is applied.
const packageEnv = process.env.NPM_REGISTRY_TWIN_URL ? { ...process.env, PNPM_CONFIG_REGISTRY: process.env.NPM_REGISTRY_TWIN_URL } : process.env;
// Bounded: a command that reaches the network and hangs fails here at five minutes rather than holding the pass.
const packageCommand = (cmd: string[]): string[] => cmd[0] === 'pnpm' && process.env.NPM_REGISTRY_TWIN_URL
  ? [cmd[0], `--registry=${process.env.NPM_REGISTRY_TWIN_URL}`, ...cmd.slice(1)] : cmd;
const run = (cmd: string[], cwd = project, env = cmd[0] === 'pnpm' ? packageEnv : process.env): string => {
  const result = Bun.spawnSync({ cmd: packageCommand(cmd), cwd, env, stdout: 'pipe', stderr: 'pipe', timeout: 300_000 });
  if (result.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(' ')} failed: ${result.stderr.toString().trim()}`);
  return result.stdout.toString().trim();
};
const git = (...args: string[]) => run(['git', ...args]);
const record = (text: string) => JSON.parse(text) as { version: string; skew?: string; revision?: string };
const installed = record(readFileSync(resolve(project, '.open-autonomy/kit.json'), 'utf8')).version;
const runningFile = resolve(home, 'running-kit.json');
const runningRecord = existsSync(runningFile) ? record(readFileSync(runningFile, 'utf8')) : null;
const running = runningRecord?.version ?? null;
const stable = (version: string) => /^\d+\.\d+\.\d+$/.test(version);
const newer = (a: string, b: string) => {
  if (!stable(a) || !stable(b)) throw new Error(`expected stable kit versions, got ${a} and ${b}`);
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i]! > bb[i]!;
  return false;
};

// The registry discovers releases; only the owner's prepared source runs them.
// This is Open Autonomy's ordinary workspace layout and Bun bin, not a second resolver.
function kitSource(version: string, directory: string | undefined) {
  if (!directory) throw new Error('kit upgrade requires OPEN_AUTONOMY_SOURCE: the selected Open Autonomy source checkout; registry code is never a fallback');
  const root = realpathSync(resolve(directory));
  const kit = resolve(root, 'packages/kit-hermes'), sdk = resolve(root, 'packages/sdk');
  const manifest = JSON.parse(readFileSync(resolve(kit, 'package.json'), 'utf8'));
  const expected = /^(?:workspace:)?(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)$/.exec(manifest.dependencies?.['@open-autonomy/sdk'] ?? '')?.[1];
  const dependency = JSON.parse(readFileSync(resolve(sdk, 'package.json'), 'utf8'));
  if (manifest.name !== 'create-open-autonomy' || manifest.version !== version || !expected)
    throw new Error(`kit source ${kit} must be create-open-autonomy@${version} with an exact SDK dependency; found ${manifest.name}@${manifest.version}`);
  if (dependency.name !== '@open-autonomy/sdk' || dependency.version !== expected)
    throw new Error(`kit source SDK ${sdk} must be @open-autonomy/sdk@${expected}; found ${dependency.name}@${dependency.version}`);
  if (run(['git', 'rev-parse', '--show-toplevel'], root) !== root || realpathSync(kit) !== kit || realpathSync(sdk) !== sdk)
    throw new Error(`kit source ${root} must be the owning source checkout, with its kit and SDK inside it`);
  run(['git', 'ls-files', '--error-unmatch', 'packages/kit-hermes/package.json', 'packages/kit-hermes/src/cli.ts', 'packages/sdk/package.json', 'packages/sdk/src/index.ts'], root);
  const cli = realpathSync(resolve(kit, manifest.bin?.['create-open-autonomy'] ?? ''));
  if (cli !== resolve(kit, 'src/cli.ts')) throw new Error(`kit source ${kit} must select its native src/cli.ts bin`);
  return { root, kit, sdk, cli, version, sdkVersion: expected, commit: run(['git', 'rev-parse', 'HEAD'], root) };
}
function preparedKitSource(source: ReturnType<typeof kitSource>): void {
  const actual = realpathSync(Bun.resolveSync('@open-autonomy/sdk/package.json', dirname(source.cli)));
  if (actual !== resolve(source.sdk, 'package.json'))
    throw new Error(`kit source ${source.kit} resolves its SDK outside selected source ${source.sdk}: ${actual}`);
}

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
    const prod = await request('GET', '/branches/prod');
    if (prod.status === 404) { console.log("No prod branch; setup's production door makes it. Nothing to ship."); process.exit(0); }
    if (!prod.ok) throw new Error(`GitHub GET /branches/prod answered ${prod.status}`);
    // GitHub refuses a pull request with nothing in it (422), which is the answer to whether main has anything new.
    const made = await request('POST', '/pulls', { title: 'Release', head: 'main', base: 'prod', body: 'Merging ships `main` to production: the workflows that run on a push to `prod` deploy and publish it. Read the whole diff first; money and auth changes are the owner\'s to read. Merge with a merge commit.' });
    if (made.status === 422) { console.log(`prod has everything on main; nothing to ship (${(await made.json() as { message?: string }).message ?? 'GitHub: 422'}).`); process.exit(0); }
    if (!made.ok) throw new Error(`GitHub POST /pulls answered ${made.status}`);
    open = await made.json() as { number: number; html_url: string };
    console.log(`Opened the Release: ${open.html_url}`);
  }
  // PM requests the Release by writing its package; until it does, changes keep compounding on the open Release.
  const packagePath = resolve(home, 'release-review.md');
  const review = existsSync(packagePath) ? readFileSync(packagePath, 'utf8').trim() : '';
  if (!review) { console.log(`No release requested; changes keep compounding on ${open.html_url}.`); process.exit(0); }
  let release: string;
  let scope: string;
  try {
    release = field(review, 'Release');
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
  // The install moves onto main when the kit landed or main changed what the stack runs on: the home's content (home/
  // or hermes/) and .open-autonomy/. A move that touches only the project's own books (a roadmap, a changelog, the board's
  // records) needs no restart. Nothing waits for the board to be quiet: sessions run in their own panes and outlive the
  // stack, and a round lost to the restart is redone by the next.
  git('fetch', '-q', 'origin', 'main');
  const landed = record(git('show', 'origin/main:.open-autonomy/kit.json')).version;
  const main = git('rev-parse', 'origin/main');
  if (!runningRecord) throw new Error('the running stack predates managed restarts; restart it once with the current start script');
  // The move first: nothing about Teams decides or delays a deploy (D137). Enrolling comes after, and only on a pass that
  // asked for no restart, since a revision about to be replaced is enrolled once the stack runs its successor.
  const content = existsSync(resolve(project, 'home')) ? 'home' : 'hermes';
  const moved = !!runningRecord.revision && runningRecord.revision !== main
    && git('diff', '--name-only', runningRecord.revision, main).split('\n').some((file) => file.startsWith(`${content}/`) || file.startsWith('.open-autonomy/'));
  if (running !== landed || moved) {
    // Prepared native installs use the same whole-machine transaction as a source move. The serving checkout and
    // dependency tree are never changed in place. The native owner inventories every registered board and kit.
    if (!existsSync(resolve(home, 'kit-install.json'))) throw new Error('this install needs its separately authorized first adoption before managed upgrades; no restart was requested');
    const { machineSupercode, supercodeCommand } = await import('./machine-supercode.ts');
    const machine = machineSupercode();
    const { machinePublishedBinding } = await import('./install-runtime.ts');
    const published = machinePublishedBinding();
    const staged = published ? null : JSON.parse(run(supercodeCommand(['source', 'stage'], machine.bin)));
    if (!published && typeof staged?.candidate !== 'string') throw new Error('source preparation returned no candidate; the serving install was preserved');
    const manifest = resolve(home, `kit-upgrade-${main.slice(0, 12)}.json`);
    writeFileSync(manifest, JSON.stringify({ version: 1, kits: [{ home, project, revision: main }] }) + '\n', { mode: 0o600 });
    // Activation is admitted by the retained owner. Ending this maintenance caller cannot stop the transaction.
    const activated = Bun.spawn({ cmd: supercodeCommand(published ? ['teams', 'machine', 'upgrade', '--action', 'install', '--release', published.receipt, '--installs', manifest]
      : ['source', 'activate', staged.candidate, '--installs', manifest], machine.bin),
      cwd: project, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
    if (await activated.exited !== 0) throw new Error('the machine upgrade returned no success; read its transaction status before retrying');
    process.exit(0);
  }
  console.log(`The stack already runs kit ${landed}${runningRecord.revision ? ` and main's ${content}/ and .open-autonomy/ as of ${runningRecord.revision.slice(0, 8)}` : ''}.`);
  // Full enrollment belongs to each running revision. On subsequent passes, reconcile health subscriptions against
  // the native declarations and currently online machines: a returning machine needs no revision change. This uses
  // the existing deployer cadence, opens no extra sessions and introduces no separate polling clock.
  const enrolledFile = resolve(home, 'enrolled.json');
  const enrolled = existsSync(enrolledFile) ? (JSON.parse(readFileSync(enrolledFile, 'utf8')) as { revision?: string }).revision : undefined;
  if (runningRecord.revision) {
    const healthOnly = runningRecord.revision === enrolled;
    const enroll = Bun.spawnSync({ cmd: ['bun', resolve(project, '.open-autonomy', 'enroll.ts'), '--project', project, '--home', home, ...(healthOnly ? ['--health-only'] : [])], cwd: project, env: process.env, stdout: 'inherit', stderr: 'inherit', timeout: 120_000 });
    if (enroll.exitCode === 0 && !healthOnly) writeFileSync(enrolledFile, `${JSON.stringify({ revision: runningRecord.revision })}\n`);
    else if (enroll.exitCode !== 0) console.log(`enroll.ts did not complete (${enroll.exitCode ?? enroll.signalCode}); the next pass tries again.`);
  }
} else if (command === 'status' || command === 'upgrade') {
  const latest = run(['pnpm', '--config.nodeLinker=hoisted', 'view', 'create-open-autonomy', 'version']).trim();
  console.log(JSON.stringify({ installed, running, latest }));
  if (command === 'status' || !newer(latest, installed)) process.exit(0);
  const source = process.env.OPEN_AUTONOMY_SOURCE_ONLY === '1' || process.env.OPEN_AUTONOMY_SOURCE
    ? kitSource(latest, process.env.OPEN_AUTONOMY_SOURCE) : undefined;
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
  if (source && stagedVersion !== latest) {
    const cache = process.env.OPEN_AUTONOMY_KIT_CACHE;
    if (!cache) throw new Error(`kit upgrade from ${stagedVersion} requires OPEN_AUTONOMY_KIT_CACHE with that version's kit and SDK source links; registry code is never a fallback`);
    const ancestor = realpathSync(resolve(cache, stagedVersion, 'node_modules/create-open-autonomy'));
    const previous = kitSource(stagedVersion, resolve(ancestor, '../..'));
    if (previous.kit !== ancestor || realpathSync(resolve(cache, stagedVersion, 'node_modules/@open-autonomy/sdk')) !== previous.sdk)
      throw new Error('kit ancestor cache must link the kit and exact SDK in the same owning source checkout');
    preparedKitSource(previous);
  }
  // Native preparation belongs to the selected source's volume and preserves its frozen lifecycle policy.
  const kitCwd = source?.root ?? worktree;
  const cacheDir = resolve(dirname(run(['pnpm', 'store', 'path'], kitCwd)), 'cache');
  const native = ['pnpm', `--config.cacheDir=${cacheDir}`, '--config.nodeLinker=hoisted', '--config.package-import-method=hardlink'];
  const kitEnv = source ? { ...packageEnv, OPEN_AUTONOMY_SOURCE_ONLY: '1', OPEN_AUTONOMY_SOURCE: source.root,
    ...(process.env.OPEN_AUTONOMY_KIT_CACHE ? { OPEN_AUTONOMY_KIT_CACHE: resolve(process.env.OPEN_AUTONOMY_KIT_CACHE) } : {}) } : packageEnv;
  if (source) {
    run([...native, 'install', '--frozen-lockfile'], source.root);
    preparedKitSource(kitSource(latest, source.root));
    console.log(`Kit source: create-open-autonomy@${source.version}, @open-autonomy/sdk@${source.sdkVersion}, ${source.root} at ${source.commit}`);
  }
  const kitCommand = source ? [...native, 'exec', 'bun', source.cli] : [...native, 'dlx', `create-open-autonomy@${latest}`];
  const kitTarget = source ? worktree : '.';
  if (stagedVersion !== latest) {
    // A three-way merge: exit 2 means files were left marked. The worktree stays for the PM to resolve them in its own
    // session; the next `maintain.ts upgrade` resumes here, and the kit's check below refuses to push a marked file.
    const up = Bun.spawnSync({ cmd: packageCommand([...kitCommand, 'upgrade', kitTarget]), cwd: kitCwd, env: kitEnv, stdout: 'pipe', stderr: 'pipe' });
    const said = `${up.stdout.toString()}${up.stderr.toString()}`.trim();
    if (up.exitCode === 2) { console.log(`${said}\nThe upgrade left conflicts in ${worktree}. Resolve each marked file there, keeping this project's intent and the kit's change, then run \`maintain.ts upgrade\` again.`); process.exit(2); }
    if (up.exitCode !== 0) throw new Error(`create-open-autonomy@${latest} upgrade failed: ${said}`);
    console.log(said);
  }
  console.log(run([...kitCommand, 'check', kitTarget], kitCwd, kitEnv));
  // An upgrade moves only kit-owned files, so the kit's check is its verification. A self-build repository is the
  // kit's own package too (soc2 is self-build with a layer), and its template ships the typecheck that proves the
  // kit's sources still compile.
  if (['self-build', 'soc2'].includes(record(readFileSync(resolve(worktree, '.open-autonomy/kit.json'), 'utf8')).skew ?? '')) {
    run(['pnpm', '--config.nodeLinker=hoisted', 'install', '--frozen-lockfile', '--package-import-method', 'hardlink'], worktree);
    run(['bun', 'run', 'check'], worktree);
  }
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
