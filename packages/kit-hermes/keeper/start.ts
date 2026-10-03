#!/usr/bin/env bun
// The keeper: it starts this install's processes, keeps them running and stops them. It is the kit's code, consumed
// from the kit package, and runs only through a project's .open-autonomy/start.ts, which finds it here. That directory
// (its package.json, node_modules, kit.json and the kit's vendored services) is the host directory below.
// --container runs the existing valve/reporter on this host, against a prepared World executor (container/README.md).
// Without it this is the bare stack; legacy --as privilege dropping remains available for existing installations.
//
//   bun .open-autonomy/start.ts [--home <dir>] [--secrets <dir>] [--project <dir>] [--origin <url>] [--as <user>] [--valve <port>]
//   bun .open-autonomy/start.ts --fleet <fleet.json> [--valve <port>]     several projects together (fleet.ts)
//
// What a keeper does not do, and where it is done instead:
//   - declaring the install's mail agents, opening their main sessions, opening an every-machine agent's instance on
//     each other machine, and registering the checkout in this machine's workspace map: .open-autonomy/enroll.ts, run
//     by whoever moves the install onto a new revision. These acts belong to Teams and the machine daemon, and enroll.ts
//     goes when those own them;
//   - deciding that the install should move onto a new main: `maintain.ts restart`, run by whoever deploys (it asks
//     for the restart this keeper performs; see the restart request below).
//
// <secrets>/github-app.json, when present, is the agent's own GitHub identity for its community desk (a GitHub App
// installed on the repository: app_id, installation_id, repository, private_key): the valve serves it on the fourth
// port as api.github.com, and the home's .env points GITHUB_API_URL there with GITHUB_TOKEN=valve — every comment the
// desk posts is the app's, and the key never enters the agent.
//
// Both launch modes forward Hermes's native openai-codex provider through the host
// valve. The installed Codex owns the current login and refresh; OA keeps no copy.
// HERMES_CODEX_BASE_URL selects a model twin during rehearsals instead.
//
// The processes, in order:
//   ssh-agent   holds <secrets>/deploy_key, its socket at <home>/ssh-agent.sock; the gateway pushes through it
//               and never holds the key (absent: pushes are your own git's business)
//   the clone   <project> cloned from --origin when it is not a checkout yet (a container's first boot); a clean
//               checkout is brought to origin/main on every start, so the agent is what the repository says today
//   the home    hermes/ in the checkout copied into <home> before every start — the repository is the source of
//               truth for what the agent IS; the home keeps what it has since done (its .env is kept)
//   valve       <secrets>/agent.env on :8787 (the developer's key), <secrets>/treasurer.env on :8788 (the
//               treasurer's, the only one that pays); --valve moves both (the second is the next port) for a second
//               agent on one host — the home's .env names them (OPEN_AUTONOMY_BASE_URL, OPEN_AUTONOMY_PAY_URL) and the word `valve`
//   reporter    keyless, publishing the home's sessions and board through the valve
//   gateway     `hermes gateway run` in the checkout, HERMES_HOME=<home>; or, where .open-autonomy/agent.json picks
//               another harness (`"harness": "codex"`), Volter Harness's orchestrator on the same home, running that
//               harness as each profile's worker (ADR 0007, as amended)
//   board       the board's dispatcher (`workflow serve`), where the home declares workflow.yaml (ADR 0017)
//   channel     one per mail agent with an RH2 account Room, carrying it to the agent's mailbox
// When any of them ends, all of them end and this exits 1: the supervisor outside (you, launchd, Docker) restarts.
import type { Setup } from '../base/.open-autonomy/agent.ts';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { constants, hostname, tmpdir } from 'node:os';
import { homedir, userInfo } from 'node:os';
import { basename, dirname, relative, resolve } from 'node:path';

// The host directory: the project's .open-autonomy, whose start.ts is the entry that imported this keeper.
if (Bun.main === import.meta.path) { console.error('start: the keeper runs through a project\'s .open-autonomy/start.ts, not on its own. Nothing was started.'); process.exit(1); }
const host = dirname(Bun.main);
// The kit's modules the keeper calls are the host's copies, rendered beside the entry: their own imports (the applier
// in @volter/supercode-orchestrator) resolve from the host's node_modules, wherever the kit package itself is installed.
const { codexAccess }: typeof import('../base/.open-autonomy/codex-auth.ts') = await import(resolve(host, 'codex-auth.ts'));
const { installHostRuntime, runtimeInstallIdentity }: typeof import('../base/.open-autonomy/install-runtime.ts') = await import(resolve(host, 'install-runtime.ts'));
const { agentHarness, agentModels, applyAgent, parseAgent, profileHarness, readAgent, renderWorkerForms }: typeof import('../base/.open-autonomy/agent.ts') = await import(resolve(host, 'agent.ts'));
const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
// A managed executor keeps credentials, reporting and supervision on this host.
// The bare entrypoint below remains the development/rehearsal path.
if (arg('--fleet')) {
  const { startFleet } = await import(resolve(host, 'fleet.ts'));
  const runtime = await startFleet({ definition: resolve(arg('--fleet')!), port: Number(arg('--valve') ?? 8787), secretsRoot: arg('--secrets-root'), stateRoot: arg('--state-root') });
  process.exit(await runtime.exited);
}
if (arg('--container')) {
  const { startContainer } = await import(resolve(host, 'container.ts'));
  const runtime = await startContainer({ container: arg('--container')!, project: arg('--project'),
    home: arg('--home'), secrets: arg('--secrets'), state: arg('--state'),
    config: arg('--config'), port: Number(arg('--valve') ?? 8787) });
  process.exit(await runtime.exited);
}
const project = resolve(arg('--project') ?? resolve(host, '..'));
// The agent's content: the IR kit's native folder, home/ (docs/decisions/0017), or the Hermes kit's hermes/.
const content = existsSync(resolve(project, 'home')) ? 'home' : 'hermes';
// What this process loaded: the project's entry and the kit's keeper. Either changing under it (a fetched checkout, an
// installed kit release) restarts the stack onto the new code.
const loadedEntry = readFileSync(Bun.main, 'utf8');
const loadedKeeper = readFileSync(import.meta.path, 'utf8');
// The termination signals: launchd's bootout (SIGTERM), a terminal's ^C (SIGINT) and a closed terminal (SIGHUP). Both
// layers below handle all three, so none of them takes the default action that ends one process alone and leaves its
// children running with no one above them.
const stopSignals = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const;
// Hermes drains active turns and exits 75 for an in-band restart. Restart the complete
// kit entrypoint so a landed upgrade also refreshes the home, valve and reporter.
if (!argv.includes('--stack-child')) {
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let stopping = false;
  // The stack below stops on the same signal and exits once its children have; this process leaves when it does.
  for (const signal of stopSignals) process.on(signal, () => { stopping = true; child?.kill(constants.signals[signal]); });
  let entry = Bun.main;
  while (!stopping) {
    child = Bun.spawn({ cmd: ['bun', entry, ...argv, '--stack-child'], stdio: ['ignore', 'inherit', 'inherit'] });
    const code = await child.exited;
    if (stopping || code !== 75) process.exit(stopping ? 0 : code);
    entry = resolve(project, '.open-autonomy/start.ts');
  }
  process.exit(0);
}
// The home's default is named by the project's account (owner/repo from .open-autonomy/config.yaml), never by the
// checkout's directory name: two projects checked out as `project` must not share one home.
const account = /^account:\s*(\S+)/m.exec(existsSync(resolve(project, '.open-autonomy', 'config.yaml')) ? readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8') : '')?.[1];
const home = resolve(arg('--home') ?? process.env.AGENT_HOME ?? resolve(homedir(), '.local', 'state', 'open-autonomy', ...(account ?? basename(project)).split('/'), 'home'));
const secrets = resolve(arg('--secrets') ?? process.env.AGENT_SECRETS ?? resolve(homedir(), '.config', 'open-autonomy'));
const developerKey = resolve(secrets, 'agent.env');
if (!existsSync(developerKey)) { console.error(`start: no ${developerKey} — restore the developer credential or complete setup before starting the fleet`); process.exit(1); }
const origin = arg('--origin') ?? process.env.ORIGIN;
const as = arg('--as');
const valvePort = Number(arg('--valve') ?? process.env.VALVE_PORT ?? 8787);
const baseUrl = `http://127.0.0.1:${valvePort}/v1`;
const payUrl = `http://127.0.0.1:${valvePort + 1}/v1`;
const say = (m: string) => console.log(`start: ${m}`);
const sock = resolve(home, 'ssh-agent.sock');

// Who the agent's processes run as: you, or with --as the named user (root drops to it; the secrets stay root's).
const user = as ? (() => { const r = Bun.spawnSync({ cmd: ['id', '-u', as], stdout: 'pipe', stderr: 'pipe' }); const g = Bun.spawnSync({ cmd: ['id', '-g', as], stdout: 'pipe' }); if (r.exitCode !== 0) throw new Error(`start: no such user ${as}`); return { name: as, uid: Number(r.stdout.toString().trim()), gid: Number(g.stdout.toString().trim()) }; })() : null;
const drop = (cmd: string[]): string[] => (user ? ['setpriv', `--reuid=${user.uid}`, `--regid=${user.gid}`, '--clear-groups', ...cmd] : cmd);
// The host's credentials must remain inaccessible
// to the agent UID: refuse before starting children, including when host/container UIDs happen to match.
if (user) {
  let isolated = false;
  try {
    isolated = Bun.spawnSync({ cmd: drop(['sh', '-c', 'for path do if [ -r "$path" ] || [ -w "$path" ]; then exit 1; fi; done', 'credential-isolation', secrets,
      resolve(process.env.CODEX_HOME ?? resolve(homedir(), '.codex')), ...['agent.env', 'treasurer.env', 'deploy_key', 'github-app.json'].map((name) => resolve(secrets, name))]), stdout: 'pipe', stderr: 'pipe' }).exitCode === 0;
  } catch { /* An unavailable privilege-drop tool cannot establish isolation. */ }
  if (!isolated) {
    console.error('start: cannot establish credential isolation from the agent user. Use owner-only storage owned by a different UID; verify setpriv is available. No services were started.');
    process.exit(1);
  }
}
const own = (path: string) => { if (user) Bun.spawnSync({ cmd: ['chown', '-R', `${user.uid}:${user.gid}`, path] }); };
// The agent's environment is what this script says. Nothing Hermes set on the process that started this one comes
// through: a start from inside another agent's worker (a project's world, brought up by a task) would otherwise inherit
// that worker's HERMES_KANBAN_DB, HERMES_KANBAN_HOME, its task and run, and file its work on the outer board.
const inherited = (): Record<string, string> => { const env: Record<string, string> = {}; for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith('HERMES_')) env[k] = v; return env; };
// TERMINAL_CWD: a conversation's shell (a channel message answered live) starts in the checkout, as a task's does —
// Hermes would otherwise start it in the home, where the agent finds its own files and none of the project's.
// Bare mode gives the agent what the container gave it: the kit's own tools (the World CLI among them) on PATH, and a
// data root outside the checkout, beside its home, for its verification World, scratch and whatever must stay off the
// tree (OPEN_AUTONOMY_DATA; the container mounts the same at /opt/data).
const data = resolve(home, '..', 'data');
const agentEnv = (): Record<string, string> => ({ ...inherited(), PATH: `${resolve(host, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`, OPEN_AUTONOMY_DATA: data, HERMES_HOME: home, TERMINAL_CWD: project, ...(user ? { HOME: home, USER: user.name, LOGNAME: user.name } : {}), ...(existsSync(sock) ? { SSH_AUTH_SOCK: sock } : {}), GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o StrictHostKeyChecking=accept-new' });

const children: Array<{ name: string; proc: ReturnType<typeof Bun.spawn> }> = [];
// The one-shot commands the start waits on (a fetch, a clone, the host's dependency install), so a signal reaches them too.
const helpers = new Set<ReturnType<typeof Bun.spawn>>();
// Set by a termination signal (or a service ending): from then on this start begins nothing — no service, no restart,
// no command — and only waits for what it already started to exit.
let ending = false;
let restartAsked = false;
process.on('exit', () => {
  for (const proc of [...children.map((c) => c.proc), ...helpers]) { try { proc.kill(); } catch { /* already gone */ } }
});
function spawn(name: string, cmd: string[], opts: { cwd?: string; env?: Record<string, string>; asAgent?: boolean }) {
  if (ending) throw new Error(`start: ${name} not started: the stack is stopping`);
  const proc = Bun.spawn({ cmd: opts.asAgent ? drop(cmd) : cmd, cwd: opts.cwd ?? project, env: opts.env ?? inherited(), stdout: 'inherit', stderr: 'inherit', stdin: 'ignore' });
  children.push({ name, proc });
  proc.exited.then(async (code) => {
    if (ending) return;
    // The board's dispatcher ends cleanly (0) when a newer orchestrator is installed under it, for its keeper to start the
    // new one (supercode's `workflow serve`): this start is that keeper, so only the dispatcher restarts, not the stack.
    if (name === 'board' && code === 0) {
      say(`board ended (0) for a newer orchestrator; the rest keeps running, the board returns in 10 s`);
      children.splice(children.findIndex((c) => c.proc === proc), 1);
      setTimeout(() => { if (!ending) spawn(name, cmd, opts); }, 10_000);
      return;
    }
    if (name.startsWith('reporter') || name.startsWith('channel ')) {
      // A reporter narrates and a channel carries a Room; neither decides whether the brain runs. Each comes back in
      // ten seconds.
      say(`${name} ended (${code}); the brain keeps running, the ${name} returns in 10 s`);
      children.splice(children.findIndex((c) => c.proc === proc), 1);
      setTimeout(() => { if (!ending) spawn(name, cmd, opts); }, 10_000);
      return;
    }
    ending = true;
    say(`${name} ended (${code}); stopping the rest`);
    for (const c of children) if (c.proc !== proc) c.proc.kill();
    await Promise.all(children.map((c) => c.proc.exited));
    // the runtime drained on request (Hermes exits 75; the orchestrator, told to stop, exits 0): restart onto main
    process.exit(name === 'gateway' && (code === 75 || (restartAsked && code === 0)) ? 75 : 1);
  });
  return proc;
}
// Leave only once every child is gone: launchd starts the successor the moment this process exits, and a gateway still
// winding down (a tick in flight) makes that successor find it "already running" and die at once.
// Every child is told SIGTERM whichever signal arrived: it is the stop every service has always been sent here (the
// orchestrator records each conversation to resume on it), while what SIGHUP means is each program's own.
for (const sig of stopSignals) process.on(sig, async () => {
  if (ending) return;
  ending = true;
  say(`${sig}: stopping ${children.length} service(s)${helpers.size ? ` and ${helpers.size} command(s) in flight` : ''}; nothing new starts`);
  const live = [...children.map((c) => c.proc), ...helpers];
  for (const proc of live) proc.kill(constants.signals.SIGTERM);
  const bound = new Promise<void>((done) => setTimeout(done, 15_000));
  await Promise.race([Promise.all(live.map((proc) => proc.exited)), bound]);
  for (const proc of live) if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
  process.exit(0);
});
// The startup's await points: once a signal has arrived, the start goes no further (the handler above exits the process
// when what it already started has exited). Startup code between two awaits runs whole, so these are the only places a
// signal can have arrived since the last check.
const halted = (): Promise<void> => (ending ? new Promise<never>(() => {}) : Promise.resolve());
// A one-shot command the start waits on without blocking the event loop (Bun.spawnSync would hold every signal handler
// until it returned), tracked so a signal reaches it, and bounded: a command that reaches the network (a fetch, a clone,
// an agent holding a key) and hangs is stopped at its bound and reads as failed, so the start never waits forever.
async function command(cmd: string[], opts: { cwd: string; env: Record<string, string>; boundMs: number }): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  await halted();
  const proc = Bun.spawn({ cmd, cwd: opts.cwd, env: opts.env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  helpers.add(proc);
  let overran = false;
  const bound = setTimeout(() => { overran = true; proc.kill(constants.signals.SIGTERM); setTimeout(() => proc.kill('SIGKILL'), 5000).unref(); }, opts.boundMs);
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(bound);
  helpers.delete(proc);
  await halted();
  return overran ? { exitCode: null, stdout, stderr: `${stderr}${stderr && !stderr.endsWith('\n') ? '\n' : ''}${cmd.join(' ')}: no answer within ${opts.boundMs / 1000} s` } : { exitCode, stdout, stderr };
}

mkdirSync(home, { recursive: true });
own(home);
mkdirSync(data, { recursive: true });
own(data);

// 1. ssh-agent, as the agent (an agent only answers its own uid, or root): the key is added by us, from a file
//    the agent cannot read, and lives in the agent's memory alone.
const deployKey = resolve(secrets, 'deploy_key');
if (existsSync(deployKey)) {
  rmSync(sock, { force: true });
  spawn('ssh-agent', ['ssh-agent', '-D', '-a', sock], { asAgent: true, cwd: home });
  const t0 = Date.now(); while (!existsSync(sock) && Date.now() - t0 < 5000) { await Bun.sleep(50); await halted(); }
  const add = await command(['ssh-add', '-q', deployKey], { cwd: home, env: { ...inherited(), SSH_AUTH_SOCK: sock }, boundMs: 30_000 });
  if (add.exitCode !== 0) { console.error(`start: ssh-add ${deployKey}: ${add.stderr.trim()}`); process.exit(1); }
  say(`ssh-agent holds the deploy key at ${sock}`);
} else say(`no ${deployKey}: pushes use your own git and keys`);

// 2. The checkout.
let committedFrom: string | undefined;
if (!existsSync(resolve(project, '.git'))) {
  if (!origin) { console.error(`start: ${project} is not a checkout and no --origin to clone`); process.exit(1); }
  mkdirSync(project, { recursive: true }); own(project);
  const clone = await command(drop(['git', 'clone', '-q', origin, project]), { cwd: home, env: agentEnv(), boundMs: 600_000 });
  if (clone.exitCode !== 0) { console.error(`start: cannot clone ${origin}: ${clone.stderr.trim()}`); process.exit(1); }
  say(`cloned ${origin} → ${project}`);
} else {
  // What the agent IS is what main says: a clean checkout moves to origin/main before the home is synced from it
  // (the skills, the schedule, the documents the reporter publishes). A dirty one — a killed attempt's work — is
  // left as it is; the next attempt starts from a fresh main itself. A failed fetch or snapshot stops startup:
  // the supervisor can retry, but unlanded configuration must not become the running home.
  const git = (...args: string[]) => Bun.spawnSync({ cmd: drop(['git', ...args]), cwd: project, env: agentEnv(), stdout: 'pipe', stderr: 'pipe' });
  // Untracked files (a task's worktree directory, a scratch note) survive a move of the checkout; only tracked
  // changes are a killed attempt's work.
  const status = git('status', '--porcelain', '--untracked-files=no');
  const fetched = status.exitCode === 0 ? await command(drop(['git', 'fetch', '-q', 'origin']), { cwd: project, env: agentEnv(), boundMs: 120_000 }) : undefined;
  if (!fetched || fetched.exitCode !== 0) { console.error(`start: cannot inspect and fetch the committed configuration${fetched?.stderr.trim() ? ` (${fetched.stderr.trim().split('\n').at(-1)})` : ''}; startup stopped, retry when Git access is restored`); process.exit(1); }
  if (status.stdout.toString().trim()) {
    // The working tree is a killed attempt's; what the agent IS still comes from main: its hermes/ is taken from
    // origin/main directly, and the tree is left for the next attempt to carry over.
    const dir = mkdtempSync(resolve(tmpdir(), 'open-autonomy-hermes-'));
    process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
    own(dir);
    const archive = git('archive', '--format=tar', 'origin/main', content);
    const extracted = archive.exitCode === 0 && Bun.spawnSync({ cmd: drop(['tar', '-x', '-C', dir]), stdin: archive.stdout, cwd: project, env: agentEnv(), stdout: 'pipe', stderr: 'pipe' }).exitCode === 0;
    if (!extracted || !existsSync(resolve(dir, content))) { console.error(`start: cannot extract the committed ${content}/ configuration; startup stopped, repair snapshot permissions or the committed ${content} directory`); process.exit(1); }
    committedFrom = resolve(dir, content);
    say(`checkout ${project} has uncommitted changes; preserved, using Hermes configuration from origin/main`);
  } else {
    if (git('checkout', '-q', '--detach', 'origin/main').exitCode !== 0) { console.error('start: cannot check out origin/main; startup stopped without loading local configuration'); process.exit(1); }
    say(`checkout ${project} at origin/main (${git('rev-parse', '--short', 'HEAD').stdout.toString().trim()})`);
  }
}

// Fetching can replace the entry, and a changed package.json installs another kit release, so another keeper. Load
// the landed code before claiming its version is running, rather than continuing the previous one with a new record.
const reload = async () => {
  ending = true;
  for (const child of children) child.proc.kill();
  await Promise.all(children.map((child) => child.proc.exited));
  process.exit(75);
};
if (readFileSync(resolve(project, '.open-autonomy/start.ts'), 'utf8') !== loadedEntry) await reload();
// The host's dependencies (the kit with this keeper, Volter Harness, the orchestrator, the reporter's) are installed when
// package.json is not the one the last complete install satisfied: a stamp beside them names it, and a failed install
// leaves none, so node_modules alone is no evidence. (The lockfile is not the identity: a clone may carry none.) An
// install that is already complete costs no registry call, which a sealed world could not make. The install is a child
// a stop signal reaches like any other.
{
  // A committed lock pins the install (frozen); one git does not track (ignored, or left by an older install) is
  // this host's scratch, and the install brings it up to package.json instead of refusing on it.
  const committed = (file: string) => Bun.spawnSync({ cmd: drop(['git', 'ls-files', '--error-unmatch', relative(project, file)]), cwd: project, env: agentEnv(), stdout: 'ignore', stderr: 'ignore' }).exitCode === 0;
  const lock = ['bun.lock', 'bun.lockb'].map((file) => resolve(host, file)).find((file) => existsSync(file) && committed(file));
  const stamp = resolve(host, 'node_modules', '.open-autonomy-install');
  const runtimeOptions = { directory: host, registry: arg('--runtime-registry'), archive: arg('--runtime-package') };
  const want = runtimeInstallIdentity(runtimeOptions);
  if ((existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : '') !== want) {
    let install: ReturnType<typeof Bun.spawn> | undefined;
    try {
      await installHostRuntime({ ...runtimeOptions, environment: agentEnv(), command: drop, frozen: !!lock, started: (child) => { install = child; helpers.add(child); } });
    } catch (error) {
      await halted();
      throw error;
    } finally { if (install) helpers.delete(install); }
    await halted();
    writeFileSync(stamp, `${want}\n`);
    say(`the host's dependencies installed in ${host}`);
  }
  const keeper = resolve(host, 'node_modules', 'create-open-autonomy', 'keeper', 'start.ts');
  if (!existsSync(keeper)) { console.error(`start: ${host}/package.json does not install the kit (create-open-autonomy), whose keeper runs this install. No services were started.`); ending = true; for (const c of children) c.proc.kill(); process.exit(1); }
  if (readFileSync(keeper, 'utf8') !== loadedKeeper) await reload();
}

// The agent's setup (docs/decisions/0007): .open-autonomy/agent.json, from the same revision the home comes from.
// A project still carrying hermes/config.yaml has not taken the upgrade that derives it.
const agentSetup: Setup | null = (() => {
  if (!committedFrom) return readAgent(project);
  const shown = Bun.spawnSync({ cmd: drop(['git', 'show', 'origin/main:.open-autonomy/agent.json']), cwd: project, env: agentEnv(), stdout: 'pipe', stderr: 'pipe' });
  return shown.exitCode === 0 ? parseAgent(shown.stdout.toString(), 'origin/main:.open-autonomy/agent.json') : null;
})();
if (!agentSetup) { console.error('start: no .open-autonomy/agent.json; run `create-open-autonomy upgrade` to derive it from hermes/config.yaml (docs/decisions/0007). No services were started.'); process.exit(1); }

// 3. The home, from the repository: everything under hermes/ except its .env, which is the home's own.
const committed = committedFrom ?? resolve(project, content);
// The lane this install runs (docs/decisions/0020): a home that declares its lanes (lanes.yaml: each lane's board file
// and profiles) runs the one its config.yaml names (`lane:`), else the first. Of the profiles the lanes name, only this
// lane's are rendered and applied, and its board file is the home's workflow.yaml; the other lanes' leave the home.
const lanesFile = resolve(committed, 'lanes.yaml');
const lanes = existsSync(lanesFile) ? Bun.YAML.parse(readFileSync(lanesFile, 'utf8')) as Record<string, { workflow?: string; profiles?: string[] }> : undefined;
const laneName = lanes ? String((Bun.YAML.parse(readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8')) as { lane?: unknown } | null)?.lane ?? Object.keys(lanes)[0]) : undefined;
const lane = lanes && laneName ? lanes[laneName] : undefined;
if (lanes && !lane) { console.error(`start: .open-autonomy/config.yaml names lane ${laneName}; the home's lanes are ${Object.keys(lanes).join(', ')}. No services were started.`); process.exit(1); }
// A lane deselects only the skew's profiles another lane names; an install's own profiles (an account manager's owner
// instance) run in every lane.
const laned = new Set(Object.values(lanes ?? {}).flatMap((l) => l.profiles ?? []));
const outOfLane = lane ? Object.keys(agentSetup.profiles).filter((name) => laned.has(name) && !(lane.profiles ?? []).includes(name)) : [];
for (const name of outOfLane) delete agentSetup.profiles[name];
for (const [name, mailAgent] of Object.entries(agentSetup.agents ?? {})) if (!agentSetup.profiles[mailAgent.profile]) { console.error(`start: agent ${name} runs profile ${mailAgent.profile}, which lane ${laneName} does not run. No services were started.`); process.exit(1); }
// The harness the owner picks (the constitution's words): Hermes runs itself; any other runs as the orchestrator's
// worker on this same home, which is then rendered in the workers' forms first, Hermes's as their shadow.
const harness = agentHarness(agentSetup);
// Claude Code runs on a model the valve reaches: every profile's default model names its endpoint (the platform's rail),
// so no worker silently falls back to a login nobody chose. A bare start as the host's own user (no --as) may instead
// declare the harness's own login on a profile (`credential: "harness-login"`): every process here already runs as that
// user and reads that login, so the declaration names the route the host already has rather than opening one.
const ownLogin = (m?: { credential?: string }) => m?.credential === 'harness-login' && !user;
if (Object.entries(agentSetup?.profiles ?? {}).some(([name, p]) => { if (profileHarness(agentSetup, name) !== 'claude-code') return false; const m = p.inference?.default ? p.inference.models?.[p.inference.default] : undefined; return !m?.endpoint && !m?.base_url && !ownLogin(m); })) { console.error(`start: .open-autonomy/agent.json runs a profile on Claude Code; each such profile's default model must name its endpoint (the platform's model rail), or, on a start as the host's own user, declare the harness's own login (credential harness-login). No services were started.`); process.exit(1); }
if (harness !== 'hermes' && !Bun.which('node')) { console.error(`start: .open-autonomy/agent.json picks ${harness}, which Volter Harness's orchestrator runs, and it needs node (22.13 or later) on PATH. No services were started.`); process.exit(1); }
if (existsSync(committed)) {
  // The kit's own families are mirrored, not merged: a skill or hook the checkout no longer has leaves the home too.
  for (const family of ['skills/open-autonomy', 'hooks', 'plugins/escalate']) rmSync(resolve(home, family), { recursive: true, force: true });
  // The workers' forms before anything of Hermes's runs here: the persona as AGENTS.md (SOUL.md its link), each skill
  // under .agents/skills/; a Hermes call first would write a default SOUL.md beside the rendered persona.
  if (harness !== 'hermes') for (const line of renderWorkerForms(committed, home)) say(line);
  const workerForm = (src: string) => harness !== 'hermes' && /^(profiles\/[^/]+\/)?(SOUL\.md|skills)$/.test(relative(committed, src));
  // force: with a filter, Bun's cpSync leaves an existing file alone unless told to overwrite.
  cpSync(committed, home, { recursive: true, force: true, filter: (src) => basename(src) !== '.env' && !workerForm(src) });
  if (lane) {
    // A profile the setup declared but the lane does not run, and a profile folder of another lane, leave the home.
    const laneProfiles = new Set(Object.keys(agentSetup.profiles));
    const committedProfiles = existsSync(resolve(committed, 'profiles')) ? readdirSync(resolve(committed, 'profiles')) : [];
    for (const name of new Set([...outOfLane, ...committedProfiles])) if (laned.has(name) && !laneProfiles.has(name)) rmSync(resolve(home, 'profiles', name), { recursive: true, force: true });
    if (lane.workflow && lane.workflow !== 'workflow.yaml') cpSync(resolve(committed, lane.workflow), resolve(home, 'workflow.yaml'), { force: true });
    say(`lane ${laneName}: profiles ${[...laneProfiles].filter((n) => n !== 'default').join(', ')}; board ${lane.workflow ?? 'workflow.yaml'}`);
  }
}
// The home's .env is the home's own, except the valve's three lines, which are this start's truth on every start.
const envFile = resolve(home, '.env');
// The agent's GitHub identities: one record per port, from the fourth. <secrets>/github-app.json is the only place
// this start finds a record today; the valve takes one --github-app per record, so several serve side by side.
const githubRecords: Array<{ file: string; port: number }> = existsSync(resolve(secrets, 'github-app.json')) ? [{ file: resolve(secrets, 'github-app.json'), port: valvePort + 3 }] : [];
const githubApp = githubRecords.length > 0;
const managed = githubApp ? /^(OPEN_AUTONOMY_(BASE_URL|PAY_URL|KEY)|HERMES_CODEX_BASE_URL|GITHUB_API_URL|GITHUB_TOKEN)=/ : /^(OPEN_AUTONOMY_(BASE_URL|PAY_URL|KEY)|HERMES_CODEX_BASE_URL)=/;
const kept = existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n').filter((l) => l.trim() && !managed.test(l)) : [];
// Keep the host login environment for the valve; only the agent gets an empty Codex home.
const hostEnvironment = inherited();
const onCodex = agentModels(agentSetup).some((m) => m.provider === 'openai-codex');
const codexPort = valvePort + 2;
const codexTwin = process.env.HERMES_CODEX_BASE_URL?.trim();
const codexForward = codexTwin || (onCodex ? `http://127.0.0.1:${codexPort}/backend-api/codex` : undefined);
if (onCodex && !codexTwin) await codexAccess();
await halted();
// A home that still routes its model through a custom provider at HERMES_CODEX_BASE_URL gets no valve and no
// address: every run would fail on a connection error, silently. Say so where the operator reads.
if (!onCodex && !codexTwin && JSON.stringify(agentSetup).includes('HERMES_CODEX_BASE_URL')) console.error('start: the model config expects the Codex valve (HERMES_CODEX_BASE_URL) but names no openai-codex provider; give the named model provider openai-codex in .open-autonomy/agent.json and drop the custom provider, or every run fails to connect');
const codexBase = codexForward ? [`HERMES_CODEX_BASE_URL=${codexForward}`] : [];
// The desk's GitHub door likewise: the valve's fourth port, as api.github.com.
const githubDoor = githubRecords.length ? [`GITHUB_API_URL=http://127.0.0.1:${githubRecords[0].port}`, 'GITHUB_TOKEN=valve'] : [];
const lines = [`OPEN_AUTONOMY_BASE_URL=${baseUrl}`, `OPEN_AUTONOMY_PAY_URL=${payUrl}`, 'OPEN_AUTONOMY_KEY=valve', ...codexBase, ...githubDoor, ...kept];
// The agent's channels: <secrets>/channels.env (the setup writes it: the Discord bot and its channel; an engagement
// adds its Slack bot, its webhook platform, whatever it speaks) is this start's truth for every line it holds — a
// channel is whatever platform the gateway reads from the home's .env, not a list this script knows; on the first
// start without it, what the environment says comes along instead.
const channelsFile = resolve(secrets, 'channels.env');
const channelLine = /^[A-Z][A-Z0-9_]*=/;
if (existsSync(channelsFile)) { const ch = readFileSync(channelsFile, 'utf8').split('\n').filter((l) => channelLine.test(l)); lines.splice(lines.length, 0, ...ch); for (let i = lines.length - ch.length - 1; i >= 0; i--) if (channelLine.test(lines[i]) && ch.some((c) => c.split('=')[0] === lines[i].split('=')[0])) lines.splice(i, 1); }
else if (!existsSync(envFile)) for (const k of Object.keys(process.env).sort()) if (/^(DISCORD_|GITHUB_TOKEN$|GITHUB_API_URL$)/.test(k) && process.env[k]) lines.push(`${k}=${process.env[k]}`);
writeFileSync(envFile, `${lines.join('\n')}\n`);
// Only the stand-in belongs in Hermes's pool. Remove prior imported subscription
// entries so failures cannot fall back to a copied login or a different account.
if (onCodex) {
  type Store = { providers?: Record<string, { tokens?: { access_token?: string }; last_refresh?: string }>; credential_pool?: Record<string, Array<Record<string, unknown>>> };
  const readStore = (file: string): Store => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };
  // The home and each profile the setup declares (a kit's profiles differ: the Hermes kit's treasurer, the company
  // skew's manager, coders and the rest), wherever the start rendered one.
  const profileHomes = Object.keys(agentSetup.profiles).map((name) => (name === 'default' ? home : resolve(home, 'profiles', name))).filter((dir) => existsSync(dir));
  for (const profile of [...new Set([home, ...profileHomes])]) {
    const authFile = resolve(profile, 'auth.json');
    const store = readStore(authFile);
    // The pool entry alone: Hermes copies a singleton token record into the pool under the real service's address,
    // which would be a second entry pointing the wrong way; with no singleton it takes the pool, whose entry names
    // the forward address itself, and the address in the home's .env agrees.
    const now = new Date().toISOString();
    if (store.providers?.['openai-codex']) delete store.providers['openai-codex'];
    const pool = (store.credential_pool ??= {});
    pool['openai-codex'] = [{ id: 'valve', label: 'the forwarded subscription', source: 'manual:valve', priority: 0, access_token: 'valve', refresh_token: 'valve', base_url: codexForward, inference_base_url: codexForward, last_refresh: now }];
    writeFileSync(authFile, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    const noCli = resolve(home, 'codex-home-none');
    mkdirSync(noCli, { recursive: true });
    process.env.CODEX_HOME = noCli;
    // Hermes reads the user's global store (~/.hermes/auth.json) into the pool only for a provider the home has no
    // entry for; the stand-in is that entry, so the user's real login stays out. HOME stays the user's: a project's
    // doors may live under it (Peak's ~/peak), and a container gives the agent its own HOME already.
  }
}
own(home);
say(`home ${home} synced from ${committed}`);
const runningKit = JSON.parse(readFileSync(resolve(project, '.open-autonomy/kit.json'), 'utf8'));
// The revision this stack runs: the main the home was rendered from (a dirty checkout's home comes from origin/main too).
// `maintain.ts restart` measures a move of main from it.
const startedRevision = Bun.spawnSync({ cmd: drop(['git', 'rev-parse', 'origin/main']), cwd: project, env: agentEnv(), stdout: 'pipe', stderr: 'pipe' }).stdout.toString().trim();
writeFileSync(resolve(home, 'running-kit.json'), JSON.stringify({ version: runningKit.version, ...(startedRevision ? { revision: startedRevision } : {}) }));
const homeReadme = resolve(home, 'README.md');
// The site renders the setup's opening paragraphs; put the running version there, where the home has a README (the
// Hermes kit's does; the IR kit's home is profiles and a board).
if (existsSync(homeReadme)) writeFileSync(homeReadme, readFileSync(homeReadme, 'utf8').replace('\n\n', `\n\nRunning ${runningKit.kit === 'ir' ? 'IR' : 'Hermes'} kit ${runningKit.version}. `));

// 4. The valve: one key file per port; a missing developer's key is the one thing that stops the start.
const keys: string[] = ['--key', `${developerKey}:${valvePort}`];
// The paying key's port answers only the treasurer (valve.ts --caller): a credential minted on every start, given to the
// valve in its environment and to the treasurer in its own profile's .env (OPEN_AUTONOMY_PAY_KEY, which its model key and
// its rail calls present). Any other process on the host, which reaches loopback as easily, is refused.
const valveEnv: Record<string, string> = { ...hostEnvironment };
if (existsSync(resolve(secrets, 'treasurer.env'))) {
  keys.push('--key', `${resolve(secrets, 'treasurer.env')}:${valvePort + 1}`, '--caller', String(valvePort + 1));
  const payKey = randomBytes(32).toString('base64url');
  valveEnv[`OPEN_AUTONOMY_VALVE_CALLER_${valvePort + 1}`] = payKey;
  const treasurerHome = resolve(home, 'profiles', 'treasurer');
  if (existsSync(treasurerHome)) {
    const payEnv = resolve(treasurerHome, '.env');
    const keptPay = existsSync(payEnv) ? readFileSync(payEnv, 'utf8').split('\n').filter((l) => l.trim() && !/^OPEN_AUTONOMY_PAY_KEY=/.test(l)) : [];
    writeFileSync(payEnv, `${[...keptPay, `OPEN_AUTONOMY_PAY_KEY=${payKey}`].join('\n')}\n`, { mode: 0o600 });
    own(payEnv);
  }
}
// Both launch modes use the host Codex login. A model twin never starts real authentication.
if (onCodex && !codexTwin) keys.push('--codex', String(codexPort));
// The agent's GitHub identities: the valve mints each app's own installation tokens and serves its desk's routes on its own port.
for (const record of githubRecords) keys.push('--github-app', `${record.file}:${record.port}`);
// An organization's projects (docs/decisions/0017): a project this install publishes for has its key in this install's
// own custody, <secrets>/projects/<owner>/<repo>/agent.env, placed there once the project's own install has retired
// (it never publishes beside one). Each such project gets its key on its own port and its own reporter; a project
// without one stays on the organization's page.
const orgConfig = Bun.YAML.parse(readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8')) as { organization?: { projects?: Array<{ account?: unknown; tag?: unknown }> } } & Record<string, unknown>;
// A project's cards carry its tag: its short name (`tag`, e.g. rh2), else its account or repository name.
const projectReporters: Array<{ account: string; tag: string; port: number }> = [];
if (harness !== 'hermes') (orgConfig?.organization?.projects ?? []).forEach((entry, i) => {
  const projectAccount = typeof entry?.account === 'string' && /^[\w.-]+\/[\w.-]+$/.test(entry.account) ? entry.account : undefined;
  if (!projectAccount) return;
  const keyFile = resolve(secrets, 'projects', ...projectAccount.split('/'), 'agent.env');
  if (!existsSync(keyFile)) { say(`${projectAccount}: no key in this install's custody (${keyFile}); its cards publish on the organization's page`); return; }
  const port = valvePort + 4 * (i + 1);
  keys.push('--key', `${keyFile}:${port}`);
  projectReporters.push({ account: projectAccount, tag: typeof entry?.tag === 'string' && /^[\w.-]+$/.test(entry.tag) ? entry.tag : projectAccount, port });
});
spawn('valve', ['bun', resolve(host, 'valve.ts'), '--loopback', ...keys], { env: valveEnv });

// 5. The reporter and the gateway, as the agent.
const env = agentEnv();
// 6. The agent's setup into its home, before anything runs there: each profile's model, settings and jobs, through
//    Hermes's own functions (Volter Harness's applier), owned by their Hermes ids against a base beside the home. A setup
//    that cannot be applied stops the start: a gateway on an unrendered home would run on Hermes's default model.
try {
  const lines = await applyAgent({
    setup: agentSetup, homeOf: (profile) => (profile === 'default' ? home : resolve(home, 'profiles', profile)),
    homeId: account ?? basename(project), stateRoot: resolve(home, '..', 'apply'), workspace: project, asAgent: user ? drop([]) : [],
  });
  for (const line of lines) say(`agent: ${line}`);
} catch (error) {
  await halted();
  console.error(`start: the agent's setup could not be applied: ${(error as Error).message}. No gateway was started.`);
  process.exit(1);
}
await halted();
// What runs the agent, for its page: bare on this host, and which kit. Never a credential.
const runtimeFacts = JSON.stringify({ mode: 'bare', kit: (() => { try { return JSON.parse(readFileSync(resolve(host, 'kit.json'), 'utf8')).version; } catch { return undefined; } })(), host: hostname() });
// The installed builds, unless the environment names others: a review or a World runs an unreleased branch's build of
// supercode and its orchestrator (OPEN_AUTONOMY_SUPERCODE_BIN, OPEN_AUTONOMY_ORCHESTRATOR_BIN) on the same start.
const orchestratorBin = process.env.OPEN_AUTONOMY_ORCHESTRATOR_BIN || resolve(host, 'node_modules', '@volter', 'supercode-orchestrator', 'bin', 'orchestrator.mjs');
const supercodeBin = process.env.OPEN_AUTONOMY_SUPERCODE_BIN || resolve(host, 'node_modules', '.bin', 'supercode');
spawn('reporter', ['bun', resolve(host, 'publisher.ts'), '--config', resolve(project, '.open-autonomy', 'config.yaml')], { asAgent: true, env: { ...env, OPEN_AUTONOMY_BASE_URL: baseUrl, OPEN_AUTONOMY_RUNTIME: runtimeFacts, OPEN_AUTONOMY_HARNESS: harness, SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin, OPEN_AUTONOMY_PROJECT_REPORTERS: projectReporters.map((p) => p.tag).join(',') } });
// Each project's reporter: the organization's publication policy under the project's account, its cards (its tenant)
// and their sessions only, through the project's own key.
for (const p of projectReporters) {
  const dir = resolve(home, '..', 'reporters', ...p.account.split('/'));
  mkdirSync(dir, { recursive: true }); own(dir);
  const config = resolve(dir, 'config.yaml');
  writeFileSync(config, `${JSON.stringify({ ...orgConfig, account: p.account, tenant: p.tag, state_file: 'reporter-state.json' }, null, 2)}\n`);
  own(config);
  spawn(`reporter ${p.account}`, ['bun', resolve(host, 'publisher.ts'), '--config', config, '--project', project], { asAgent: true, env: { ...env, OPEN_AUTONOMY_BASE_URL: `http://127.0.0.1:${p.port}/v1`, OPEN_AUTONOMY_RUNTIME: runtimeFacts, OPEN_AUTONOMY_HARNESS: harness, SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin } });
}
// A home that declares its board (workflow.yaml, the board IR) has its dispatcher here, a service of this start like the
// rest, so the board runs only through the install's own start (docs/decisions/0017).
const boardDeclared = harness !== 'hermes' && existsSync(resolve(home, 'workflow.yaml'));
// The runtime on the home: Hermes's gateway, or the orchestrator running the picked harness as each profile's worker
// (it holds the home's gateway lock as Hermes's gateway does, so the two never serve one home at once). Where this
// start runs the board's dispatcher, the orchestrator is told so (SUPERCODE_BOARD_DISPATCHER=serve) and runs no round
// of its own: one dispatcher per board by what is started, with no lock (supercode's orchestrator §2.9). It still tells
// chat-platform subscribers through its channel adapters, which the dispatcher does not host.
const gateway = harness === 'hermes'
  ? spawn('gateway', ['hermes', 'gateway', 'run'], { asAgent: true, env: { ...env, HERMES_GATEWAY_EXTERNAL_SUPERVISOR: '1' } })
  : spawn('gateway', [Bun.which('node')!, orchestratorBin, '--root', home], { asAgent: true, env: { ...env, SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin, ...(boardDeclared ? { SUPERCODE_BOARD_DISPATCHER: 'serve' } : {}) } });
if (boardDeclared) spawn('board', [Bun.which('node')!, orchestratorBin, 'workflow', 'serve', '--root', home], { asAgent: true, env: { ...env, SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin } });
// The home's declared agents (the IR's agent layer, `agents.json`: supercode docs/architecture/orchestrator.md §2.10),
// rendered from the setup like the rest of the home, so an export names each one it folds into its profile. Declaring
// them to Teams and opening their sessions is not this keeper's (enroll.ts, above).
const agentLayerFile = resolve(home, 'agents.json');
const agentLayer = existsSync(agentLayerFile) ? JSON.parse(readFileSync(agentLayerFile, 'utf8')) : {};
agentLayer.agents = { ...(agentLayer.agents ?? {}), ...Object.fromEntries(Object.entries(agentSetup.agents ?? {}).map(([name, mailAgent]) => [name, { name, profile: mailAgent.profile }])) };
if (Object.keys(agentLayer.agents).length) writeFileSync(agentLayerFile, `${JSON.stringify(agentLayer, null, 2)}\n`);
// Each mail agent with an RH2 account Room has its Room carried to its mailbox by a channel process, a service of this
// start that restarts like the reporter (supercode docs/adr/0008). RH2 is reached as the agent's own principal where the
// organization declares it (supercode ADR 0017), else through a Room-chat installation for it; the channel reads the
// record from this home.
for (const [name, mailAgent] of Object.entries(agentSetup.agents ?? {})) {
  const rh2 = mailAgent.channel?.rh2;
  if (!rh2) continue;
  spawn(`channel ${name}`, [Bun.which('node')!, orchestratorBin, 'agent-channel', '--agent', name, '--root', home,
    ...(rh2.room ? ['--room', rh2.room] : []), ...(rh2.room_key ? ['--room-key', rh2.room_key] : []),
    ...(rh2.room_name ? ['--room-name', rh2.room_name] : []), ...(rh2.principal ? ['--principal', rh2.principal] : []),
    '--state', resolve(home, '..', 'channels', `${name}.json`)], { asAgent: true, env: { ...env, SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin } });
}
// The restart this keeper performs on request: the stack drains and starts again, onto whatever the checkout then
// holds, whatever the board holds (sessions run in their own panes and outlive the stack). Whether to move is not this
// keeper's to decide: `maintain.ts restart` (run by whoever deploys: a person, a PM's pass, a keep job) fetches main,
// and when the kit or the stack's own files (the home's content, .open-autonomy/) moved since this stack started, writes
// <home>/kit-restart.json. A request naming the kit version and revision this stack already runs is spent.
const restartRequest = resolve(home, 'kit-restart.json');
let restarting = false;
setInterval(() => {
  if (ending || restarting || !existsSync(restartRequest)) return;
  let request: { version?: string; revision?: string } | undefined;
  try { request = JSON.parse(readFileSync(restartRequest, 'utf8')); }
  catch { say('cannot decode kit-restart.json; repair the request before restarting'); return; }
  rmSync(restartRequest, { force: true });
  const moved = !!request?.revision && request.revision !== startedRevision;
  if (!moved && (!request?.version || request.version === runningKit.version)) return;
  restarting = true;
  const runtime = harness === 'hermes' ? 'Hermes' : 'the orchestrator';
  say(moved ? `restart asked for main at ${request!.revision!.slice(0, 8)}; asking ${runtime} to drain before restarting the stack onto it` : `kit ${request!.version} landed; asking ${runtime} to drain before restarting the stack`);
  restartAsked = true;
  // Hermes drains on SIGUSR1; the orchestrator stops on SIGTERM, recording each conversation's session to resume.
  // Bun's Subprocess.kill string mapping uses the Linux number on some macOS
  // releases. Use the host's signal constant: SIGUSR1 is 30 on macOS, 10 on Linux.
  process.kill(gateway.pid, harness === 'hermes' ? constants.signals.SIGUSR1 : constants.signals.SIGTERM);
}, 5000);
say(`${harness === 'hermes' ? 'gateway' : `orchestrator (worker ${harness})`} up in ${project} as ${user?.name ?? userInfo().username}, home ${home}; the valve on :${valvePort}${existsSync(resolve(secrets, 'treasurer.env')) ? ` and :${valvePort + 1}` : ''}${codexForward ? `; the Codex subscription through ${codexForward}` : ''}${githubRecords.length ? `; the GitHub App on ${githubRecords.map((r) => `:${r.port}`).join(' and ')}` : ''}`);
if (!readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8').includes('account:')) say('warning: .open-autonomy/config.yaml names no account');
await new Promise(() => {});
