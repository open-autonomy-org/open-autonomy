#!/usr/bin/env bun
// The keeper: it starts this install's processes, keeps them running and stops them. It is the kit's code, consumed
// from the kit package, and runs only through a project's .open-autonomy/start.ts, which finds it here. That directory
// (its package.json, node_modules, kit.json and the kit's vendored services) is the host directory below.
// --container runs the existing valve/reporter on this host, against a prepared World executor (container/README.md).
// Without it this is the bare stack; legacy --as privilege dropping remains available for existing installations.
//
//   bun .open-autonomy/start.ts [--home <dir>] [--secrets <dir>] [--project <dir>] [--origin <url>] [--as <user>] [--valve <port>] [--rehearsal]
//   bun .open-autonomy/start.ts --fleet <fleet.json> [--valve <port>]     several projects together (fleet.ts)
//
// What a keeper does not do, and where it is done instead:
//   - declaring the install's mail agents, opening their main sessions, opening an every-machine agent's instance on
//     each other machine, and registering the checkout in this machine's workspace map: .open-autonomy/enroll.ts, run
//     by the deployer pass once per revision this stack runs. These acts belong to Teams and the machine daemon, and
//     enroll.ts goes when those own them;
//   - deciding that the install should move onto a new main: the deployer pass, `maintain.ts restart`, which the host
//     schedules beside the start (SETUP.md, "Keep the install on main"); it asks for the restart this keeper performs.
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
//   valve       <secrets>/agent.env on :8787 (the developer's key); <secrets>/treasurer.env (the treasurer's, the only
//               one that pays) on :8788 only with --rehearsal, a World's twin keys: bare mode is no pay boundary
//               (docs/decisions/0021); --valve moves both (the second is the next port) for a second agent on one
//               host — the home's .env names them (OPEN_AUTONOMY_BASE_URL, OPEN_AUTONOMY_PAY_URL) and the word `valve`
//   reporter    keyless, publishing through the valve; native waits for its owned gateway's public ready event
//   gateway     `hermes gateway run` in the checkout, HERMES_HOME=<home>; or, where .open-autonomy/agent.json picks
//               another harness (`"harness": "codex"`), Volter Harness's orchestrator on the same home, running that
//               harness as each profile's worker (ADR 0007, as amended)
//   board       the board's dispatcher (`workflow serve`), where the home declares workflow.yaml (ADR 0017)
//   channel     one per mail agent with an RH2 account Room, carrying it to the agent's mailbox
// When any of them ends, all of them end and this exits 1: the supervisor outside (you, launchd, Docker) restarts.
import type { Setup } from '../base/.open-autonomy/agent.ts';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
const { agentHarness, agentModels, parseAgent, profileHarness, readAgent, renderWorkerForms }: typeof import('../base/.open-autonomy/agent.ts') = await import(resolve(host, 'agent.ts'));
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
// The pay boundary (docs/decisions/0021): every bare process is one OS user, so nothing here can keep a profile from the
// treasurer's key or its pay credential, and a bare start serves no pay port. Container mode carries the treasurer in its
// own executor. A World's rehearsal, whose keys are twins, says --rehearsal and gets the port.
const paying = argv.includes('--rehearsal') && existsSync(resolve(secrets, 'treasurer.env'));
if (!paying && existsSync(resolve(secrets, 'treasurer.env'))) say(`${resolve(secrets, 'treasurer.env')} is not served: bare mode is one OS user, so it has no pay boundary (docs/decisions/0021); the treasurer pays from container mode's own executor`);
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
// AGENT_SECRETS names the custody directory this start reads, so a gated worker's sandbox keeps it unreadable (Volter
// Harness's activation.mjs) whichever --secrets named it; it names a path, never a credential.
const agentEnv = (): Record<string, string> => ({ ...inherited(), AGENT_SECRETS: secrets, PATH: `${resolve(host, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`, OPEN_AUTONOMY_DATA: data, HERMES_HOME: home, TERMINAL_CWD: project, ...(user ? { HOME: home, USER: user.name, LOGNAME: user.name } : {}), ...(existsSync(sock) ? { SSH_AUTH_SOCK: sock } : {}), GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o StrictHostKeyChecking=accept-new' });

const children: Array<{ name: string; proc: ReturnType<typeof Bun.spawn> }> = [];
// The one-shot commands the start waits on (a fetch, a clone, the host's dependency install), so a signal reaches them too.
const helpers = new Set<ReturnType<typeof Bun.spawn>>();
// Set by a termination signal (or a service ending): from then on this start begins nothing — no service, no restart,
// no command — and only waits for what it already started to exit.
let ending = false;
let nativeGatewayReady = false;
let restartAsked = false;
process.on('exit', () => {
  for (const proc of [...children.map((c) => c.proc), ...helpers]) { try { proc.kill(); } catch { /* already gone */ } }
});
function spawn(name: string, cmd: string[], opts: { cwd?: string; env?: Record<string, string>; asAgent?: boolean; stdout?: 'pipe'; allowRestart?: () => boolean }) {
  if (ending) throw new Error(`start: ${name} not started: the stack is stopping`);
  const proc = Bun.spawn({ cmd: opts.asAgent ? drop(cmd) : cmd, cwd: opts.cwd ?? project, env: opts.env ?? inherited(), stdout: opts.stdout ?? 'inherit', stderr: 'inherit', stdin: 'ignore' });
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
      setTimeout(() => {
        if (!ending && (opts.allowRestart?.() ?? true)) spawn(name, cmd, opts);
        else if (!ending) say(`${name} pending: owning native gateway readiness is unavailable; no restart started`);
      }, 10_000);
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
    say(`checkout ${project} has uncommitted changes; preserved, using ${content} configuration from origin/main`);
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
      throw new Error(`${(error as Error).message}. Resolve the adopter's exact host manifest before activation: run bun .open-autonomy/install-runtime.ts --update-lock from the project inside its World, review/commit .open-autonomy/bun.lock, then retry. Startup does not unfreeze a committed lock.`);
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
const kitSelection = JSON.parse(readFileSync(resolve(project, '.open-autonomy/kit.json'), 'utf8'));
const nativeSelection = { kind: kitSelection.kit === 'ir' || harness !== 'hermes' ? 'orchestrator' : 'hermes', root: home };
const onNative = nativeSelection.kind === 'orchestrator';
const nativeSelectionEnv = JSON.stringify(nativeSelection);
const orchestratorBin = process.env.OPEN_AUTONOMY_ORCHESTRATOR_BIN || resolve(host, 'node_modules', '@volter', 'supercode-orchestrator', 'bin', 'orchestrator.mjs');
const supercodeBin = process.env.OPEN_AUTONOMY_SUPERCODE_BIN || resolve(host, 'node_modules', '.bin', 'supercode');
// Claude Code runs on a model the valve reaches: every profile's default model names its endpoint (the platform's rail),
// so no worker silently falls back to a login nobody chose. A bare start as the host's own user (no --as) may instead
// declare the harness's own login on a profile (`credential: "harness-login"`): every process here already runs as that
// user and reads that login, so the declaration names the route the host already has rather than opening one.
const ownLogin = (m?: { credential?: string }) => m?.credential === 'harness-login' && !user;
if (Object.entries(agentSetup?.profiles ?? {}).some(([name, p]) => { if (profileHarness(agentSetup, name) !== 'claude-code') return false; const m = p.inference?.default ? p.inference.models?.[p.inference.default] : undefined; return !m?.endpoint && !m?.base_url && !ownLogin(m); })) { console.error(`start: .open-autonomy/agent.json runs a profile on Claude Code; each such profile's default model must name its endpoint (the platform's model rail), or, on a start as the host's own user, declare the harness's own login (credential harness-login). No services were started.`); process.exit(1); }
if (onNative && !Bun.which('node')) { console.error(`start: the selected native runtime needs node (22.13 or later) on PATH. No services were started.`); process.exit(1); }
if (existsSync(committed)) {
  // The kit's own families are mirrored, not merged: a skill or hook the checkout no longer has leaves the home too.
  for (const family of ['skills/open-autonomy', 'hooks', 'plugins/escalate']) rmSync(resolve(home, family), { recursive: true, force: true });
  // The workers' forms before anything of Hermes's runs here: the persona as AGENTS.md (SOUL.md its link), each skill
  // under .agents/skills/; a Hermes call first would write a default SOUL.md beside the rendered persona.
  if (onNative) for (const line of renderWorkerForms(committed, home)) say(line);
  const workerForm = (src: string) => onNative && /^(profiles\/[^/]+\/)?(SOUL\.md|skills)$/.test(relative(committed, src));
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
const lines = [`OPEN_AUTONOMY_BASE_URL=${baseUrl}`, ...(paying ? [`OPEN_AUTONOMY_PAY_URL=${payUrl}`] : []), 'OPEN_AUTONOMY_KEY=valve', ...codexBase, ...githubDoor, ...kept];
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
// its rail calls present). Any other process on the host, which reaches loopback as easily, is refused. Served only in a
// rehearsal (above); otherwise a credential an earlier start left in the treasurer's .env is taken out.
const valveEnv: Record<string, string> = { ...hostEnvironment };
const payKey = paying ? randomBytes(32).toString('base64url') : undefined;
if (payKey) {
  keys.push('--key', `${resolve(secrets, 'treasurer.env')}:${valvePort + 1}`, '--caller', String(valvePort + 1));
  valveEnv[`OPEN_AUTONOMY_VALVE_CALLER_${valvePort + 1}`] = payKey;
}
const payEnv = resolve(home, 'profiles', 'treasurer', '.env');
if (existsSync(resolve(home, 'profiles', 'treasurer')) && (payKey || existsSync(payEnv))) {
  const keptPay = existsSync(payEnv) ? readFileSync(payEnv, 'utf8').split('\n').filter((l) => l.trim() && !/^OPEN_AUTONOMY_PAY_KEY=/.test(l)) : [];
  writeFileSync(payEnv, `${[...keptPay, ...(payKey ? [`OPEN_AUTONOMY_PAY_KEY=${payKey}`] : [])].join('\n')}\n`, { mode: 0o600 });
  own(payEnv);
}
// Both launch modes use the host Codex login. A model twin never starts real authentication.
if (onCodex && !codexTwin) keys.push('--codex', String(codexPort));
// The agent's GitHub identities: the valve mints each app's own installation tokens and serves its desk's routes on its own port.
for (const record of githubRecords) keys.push('--github-app', `${record.file}:${record.port}`);
// An organization's projects (docs/decisions/0017): a project this install publishes for has its key in this install's
// own custody, <secrets>/projects/<owner>/<repo>/agent.env, placed there once the project's own install has retired
// (it never publishes beside one). Each such project gets its key on its own port and its own reporter; a project
// without one stays on the organization's page.
const orgConfig = Bun.YAML.parse(readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8')) as { organization?: { projects?: Array<{ account?: unknown; tag?: unknown; reporter_config?: unknown }> } } & Record<string, unknown>;
const { nativeRuntime }: typeof import('../base/.open-autonomy/native-runtime.ts') = await import(resolve(host, 'native-runtime.ts'));
nativeRuntime({ native_runtime: orgConfig.native_runtime, hermes_home: orgConfig.hermes_home }, { ...process.env, OPEN_AUTONOMY_NATIVE_RUNTIME: nativeSelectionEnv });
// A project's cards carry its tag: its short name (`tag`, e.g. rh2), else its account or repository name.
const projectReporters: Array<{ account: string; tag: string; port: number; reporterConfig?: string }> = [];
if (onNative) (orgConfig?.organization?.projects ?? []).forEach((entry, i) => {
  const projectAccount = typeof entry?.account === 'string' && /^[\w.-]+\/[\w.-]+$/.test(entry.account) ? entry.account : undefined;
  if (!projectAccount) return;
  const keyFile = resolve(secrets, 'projects', ...projectAccount.split('/'), 'agent.env');
  if (!existsSync(keyFile)) { say(`${projectAccount}: no key in this install's custody (${keyFile}); its cards publish on the organization's page`); return; }
  const port = valvePort + 4 * (i + 1);
  keys.push('--key', `${keyFile}:${port}`);
  projectReporters.push({ account: projectAccount, tag: typeof entry?.tag === 'string' && /^[\w.-]+$/.test(entry.tag) ? entry.tag : projectAccount, port,
    ...(typeof entry.reporter_config === 'string' ? { reporterConfig: entry.reporter_config } : {}) });
});
spawn('valve', ['bun', resolve(host, 'valve.ts'), '--loopback', ...keys], { env: valveEnv });

// 5. The reporter and the gateway, as the agent.
const env = agentEnv();
// 6. Apply each profile through the selected runtime's public setup adapter and external applier ownership.
//    A refused declaration stops startup before any gateway runs on unintended defaults.
//    The applier runs as a child the start waits on, tracked like any command: it applies synchronously, profile
//    after profile, and in this process would hold every signal handler until it finished (a stop mid-startup waited
//    for the whole setup, then started the services before stopping them).
{
  const request = JSON.stringify({ agent: resolve(host, 'agent.ts'), setup: agentSetup, home, runtime: nativeSelection, homeId: account ?? basename(project), stateRoot: resolve(home, '..', 'apply'), workspace: project, asAgent: user ? drop([]) : [] });
  const applier = `const r = JSON.parse(process.argv[1]); const { applyAgent } = await import(r.agent); const { resolve } = await import('node:path');
const lines = await applyAgent({ setup: r.setup, runtime: r.runtime, homeOf: (p) => (p === 'default' ? r.home : resolve(r.home, 'profiles', p)), homeId: r.homeId, stateRoot: r.stateRoot, workspace: r.workspace, asAgent: r.asAgent });
process.stdout.write('\\n' + JSON.stringify(lines) + '\\n');`;
  const applied = await command(['bun', '-e', applier, request], { cwd: project, env: { ...process.env, SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin } as Record<string, string>, boundMs: 600_000 });
  if (applied.exitCode !== 0) { console.error(`start: the agent's setup could not be applied: ${applied.stderr.trim().split('\n').at(-1)}. No gateway was started.`); process.exit(1); }
  for (const line of JSON.parse(applied.stdout.trim().split('\n').at(-1) ?? '[]') as string[]) say(`agent: ${line}`);
}
// What runs the agent, for its page: bare on this host, and which kit. Never a credential.
const runtimeFacts = JSON.stringify({ mode: 'bare', kit: (() => { try { return JSON.parse(readFileSync(resolve(host, 'kit.json'), 'utf8')).version; } catch { return undefined; } })(), host: hostname() });
// The installed builds, unless the environment names others: a review or a World runs an unreleased branch's build of
// supercode and its orchestrator (OPEN_AUTONOMY_SUPERCODE_BIN, OPEN_AUTONOMY_ORCHESTRATOR_BIN) on the same start.
// The orchestrator that serves this home, and the supercode it drives, are the ones this install runs, named in the home
// (orchestrator.json) when they are put in place, before any dispatcher: supercode's \`workflow\` on this home (a shell,
// the connector's board follower, the board door) runs that orchestrator driving that supercode, never what the machine
// has installed globally.
{
  const named = (bin: string) => {
    const entry = existsSync(bin) ? realpathSync(bin) : bin;
    let version: string | null = null;
    try { version = JSON.parse(readFileSync(resolve(dirname(entry), '..', 'package.json'), 'utf8')).version ?? null; } catch { /* named without one */ }
    return { entry, version };
  };
  const orchestrator = named(orchestratorBin);
  writeFileSync(resolve(home, 'orchestrator.json'), `${JSON.stringify({ package: '@volter/supercode-orchestrator', version: orchestrator.version, entry: orchestrator.entry, supercode: named(supercodeBin) })}\n`);
}
// The board the repository declares (`board:` in .open-autonomy/config.yaml; company RFC 0025 decisions 3 and 4): its
// document at the repository's root, in the board's own checkout beside the home (a clone of the project's origin, on
// main), and the home's store on supercode's ztrack backing, each write committed and pushed, its manager the one this
// install declares. Made here, from the repository, before any dispatcher or reporter opens the board, so a new machine
// needs no step by hand; the same board again changes nothing. A start that cannot make it stops and says why, as it
// does when it cannot fetch the project: nothing serves a home whose board is not the one its repository declares, so
// nothing makes another in its place; the stop says what init found (a home whose board is on another backing, say).
const stopStart = (why: string): never => {
  console.error(`start: ${why}; startup stopped`);
  ending = true;
  for (const c of children) c.proc.kill();
  process.exit(1);
};
const boardSetup = (Bun.YAML.parse(readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8')) as { board?: { document?: unknown; archive?: { max_lines?: unknown; period?: unknown } } } | null)?.board;
if (typeof boardSetup?.document === 'string' && onNative && existsSync(resolve(home, 'workflow.yaml'))) {
  const checkout = resolve(home, '..', 'board');
  if (!existsSync(resolve(checkout, '.git'))) {
    // The origin as the project configures it (`get-url` would hand over an insteadOf rewrite's target instead).
    const from = Bun.spawnSync({ cmd: drop(['git', 'config', '--get', 'remote.origin.url']), cwd: project, env: agentEnv(), stdout: 'pipe', stderr: 'pipe' }).stdout.toString().trim();
    if (!from) stopStart(`the board's checkout ${checkout} cannot be made: ${project} names no origin`);
    // Something already at the checkout's path that is not a checkout is never this start's to remove.
    if (existsSync(checkout)) stopStart(`the board's checkout ${checkout} cannot be made: ${checkout} is there and is not a checkout of ${from}`);
    const clone = await command(drop(['git', 'clone', '-q', '--branch', 'main', from, checkout]), { cwd: dirname(checkout), env: agentEnv(), boundMs: 600_000 });
    if (clone.exitCode !== 0) {
      rmSync(checkout, { recursive: true, force: true }); // what this start's own clone left
      stopStart(`the board's checkout ${checkout} cannot be made: ${clone.stderr.trim().split('\n').at(-1) || 'the clone ran past its bound'}`);
    }
    say(`board: cloned ${from} on main → ${checkout}`);
  }
  const archive = boardSetup.archive ?? {};
  // The board's manager is the one this install declares: of the managers the home's workflow names, the address of one
  // of this install's own mail agents (agent.json); else the workflow's one manager, or the orchestrator asks which.
  const managers = [(Bun.YAML.parse(readFileSync(resolve(home, 'workflow.yaml'), 'utf8')) as { params?: { managers?: unknown } } | null)?.params?.managers ?? []].flat().filter((m): m is string => typeof m === 'string');
  const ours = managers.filter((m) => Object.keys(agentSetup.agents ?? {}).some((name) => m.endsWith(`:agent:${name}`)));
  const declares = ['--backing', 'ztrack', '--document', resolve(checkout, boardSetup.document), '--commit',
    ...(ours.length === 1 ? ['--manager', ours[0]] : []),
    ...(archive.max_lines ? ['--archive-max-lines', String(archive.max_lines)] : []), ...(archive.period ? ['--archive-period', String(archive.period)] : [])];
  const init = Bun.spawnSync({ cmd: drop([Bun.which('node')!, orchestratorBin, 'workflow', 'init', '--root', home, ...declares, '--json']),
    cwd: home, env: { ...agentEnv(), SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin }, stdout: 'pipe', stderr: 'pipe' });
  let answer: { kept?: boolean; path?: string } | undefined;
  try { answer = JSON.parse(init.stdout.toString()); } catch { /* no answer */ }
  if (init.exitCode !== 0 || !answer) {
    const why = init.stderr.toString().trim().split('\n').filter((line) => !/ExperimentalWarning|trace-warnings/.test(line)).at(-1) ?? `workflow init exited ${init.exitCode}`;
    stopStart(`the board its repository declares cannot be made: ${why}`);
  }
  say(`board: ${answer!.kept ? 'kept' : 'made'} on the ztrack backing (${answer!.path ?? home})`);
}
let reportersStarted = false;
function startReporters(): void {
  if (ending || reportersStarted || (onNative && !nativeGatewayReady)) return;
  reportersStarted = true;
  // Owner controls remain independent of narrative enrollment. Native gateway
  // readiness is its public mutation-door contract, not a narrative prerequisite.
  if (!Object.hasOwn(orgConfig, 'publication')) say('publication pending: reporter enrollment is required; owner controls and the native brain keep running');
  spawn('reporter', ['bun', resolve(host, 'publisher.ts'), '--config', resolve(project, '.open-autonomy', 'config.yaml')], { asAgent: true, allowRestart: () => !onNative || nativeGatewayReady, env: { ...env, OPEN_AUTONOMY_BASE_URL: baseUrl, OPEN_AUTONOMY_RUNTIME: runtimeFacts, OPEN_AUTONOMY_HARNESS: harness, OPEN_AUTONOMY_NATIVE_RUNTIME: nativeSelectionEnv, SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin, OPEN_AUTONOMY_PROJECT_REPORTERS: projectReporters.map((p) => p.tag).join(',') } });
  // Each project's reporter: its own committed policy/custody under its account, its cards (its tenant)
  // and their sessions only, through the project's own key.
  for (const p of projectReporters) {
    try {
      if (!p.reporterConfig || p.reporterConfig.startsWith('/')) throw new Error('declare an owner-relative reporter_config with this account\'s own publication custody');
      const config = resolve(project, p.reporterConfig);
      if (relative(project, config).startsWith('..') || !existsSync(config) || relative(project, realpathSync(config)).startsWith('..')) throw new Error('reporter_config must resolve inside the project');
      const tenantConfig = Bun.YAML.parse(readFileSync(config, 'utf8')) as Record<string, unknown>;
      if (tenantConfig.account !== p.account || tenantConfig.tenant !== p.tag || !tenantConfig.publication) throw new Error('reporter_config requires the exact account, tenant tag and independently enrolled publication block');
      if (tenantConfig.platform !== orgConfig.platform) throw new Error('reporter_config must name the selected logical platform; the valve is transport only');
      nativeRuntime({ native_runtime: tenantConfig.native_runtime }, { ...process.env, OPEN_AUTONOMY_NATIVE_RUNTIME: nativeSelectionEnv });
      spawn(`reporter ${p.account}`, ['bun', resolve(host, 'publisher.ts'), '--config', config, '--project', project], { asAgent: true, allowRestart: () => !onNative || nativeGatewayReady, env: { ...env, OPEN_AUTONOMY_BASE_URL: `http://127.0.0.1:${p.port}/v1`, OPEN_AUTONOMY_RUNTIME: runtimeFacts, OPEN_AUTONOMY_HARNESS: harness, OPEN_AUTONOMY_NATIVE_RUNTIME: nativeSelectionEnv, SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin } });
    } catch (error) { say(`publication ${p.account} pending: ${(error as Error).message}; the native brain keeps running`); }
  }
}
if (!onNative) startReporters();
else say('publication pending: waiting for the owned native gateway public readiness event');
// Pull request events through hookline (company RFC 0026 decision 4): where custody holds <secrets>/hookline.env (the
// inbox, its read token, this install's socket target), hookline.ts attaches and tells the manager of each event once.
// It reads that file itself, so the token is in no other process's environment.
if (existsSync(resolve(secrets, 'hookline.env'))) spawn('hookline', ['bun', resolve(host, 'hookline.ts'), '--env', resolve(secrets, 'hookline.env'), '--state', resolve(home, 'hookline-told.json')], { env: { ...env, SUPERCODE_BIN: supercodeBin } });
// A home that declares its board (workflow.yaml, the board IR) has its dispatcher here, a service of this start like the
// rest, so the board runs only through the install's own start (docs/decisions/0017).
const boardDeclared = onNative && existsSync(resolve(home, 'workflow.yaml'));
// The runtime on the home: Hermes's gateway, or the orchestrator running the picked harness as each profile's worker
// (it holds the home's gateway lock as Hermes's gateway does, so the two never serve one home at once). The board's one
// dispatcher is the `workflow serve` below; the orchestrator runs no round (supercode's orchestrator §2.9).
const gateway = !onNative
  ? spawn('gateway', ['hermes', 'gateway', 'run'], { asAgent: true, env: { ...env, HERMES_GATEWAY_EXTERNAL_SUPERVISOR: '1' } })
  : spawn('gateway', [Bun.which('node')!, orchestratorBin, '--root', home], { asAgent: true, env: { ...env, SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin }, stdout: 'pipe' });
if (onNative) {
  gateway.exited.then(() => { nativeGatewayReady = false; });
  void nativeReadiness().catch(error => { nativeGatewayReady = false; if (!ending) say(`publication pending: native gateway readiness refused (${(error as Error).message})`); });
}
if (boardDeclared) spawn('board', [Bun.which('node')!, orchestratorBin, 'workflow', 'serve', '--root', home], { asAgent: true, env: { ...env, SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin } });
// The public CLI may re-exec one direct daemon child as hermes-gateway. Bind
// its loaded and ready events to that exact owned launch chain, never another
// home, once-mode output, an arbitrary descendant or a prose log sentence.
async function nativeReadiness(): Promise<void> {
  let loadedPid: number | undefined, buffer = '', discarding = false;
  const decoder = new TextDecoder(), maxLine = 64 * 1024;
  const owned = async (pid: number): Promise<boolean> => {
    if (ending || gateway.exitCode !== null || !Number.isSafeInteger(pid) || pid <= 0) return false;
    if (!['darwin', 'linux'].includes(process.platform)) return false;
    const observed = await command(['/bin/ps', '-p', String(pid), '-o', 'ppid='], { cwd: project, env: inherited(), boundMs: 2000 });
    if (ending || gateway.exitCode !== null || observed.exitCode !== 0 || !/^\s*\d+\s*$/.test(observed.stdout)) return false;
    const parent = Number(observed.stdout.trim());
    return pid === gateway.pid ? parent === process.pid : parent === gateway.pid;
  };
  const line = async (value: string): Promise<void> => {
    if (ending || value.length > maxLine) return;
    let event: any; try { event = JSON.parse(value); } catch { return; }
    if (!event || event.root !== home || !Number.isSafeInteger(event.pid) || event.pid <= 0) return;
    if (event.event === 'loaded' && typeof event.version === 'string' && event.version && typeof event.started_at === 'string' && event.started_at) {
      if (await owned(event.pid)) loadedPid = event.pid;
    } else if (event.event === 'ready' && event.once === undefined && event.pid === loadedPid && Array.isArray(event.connected) && event.connected.every((name: unknown) => typeof name === 'string') && Array.isArray(event.down) && event.down.every((name: unknown) => typeof name === 'string') && Number.isSafeInteger(event.webhook_port) && event.webhook_port >= 0 && event.webhook_port <= 65535 && Number.isSafeInteger(event.tick_ms) && event.tick_ms > 0 && typeof event.restarted === 'boolean') {
      if (!await owned(event.pid) || ending) return;
      nativeGatewayReady = true;
      startReporters();
    }
  };
  try {
    for await (const chunk of gateway.stdout!) {
      process.stdout.write(chunk); // retain the public child's stdout byte-for-byte
      let text = decoder.decode(chunk, { stream: true });
      if (discarding) { const at = text.indexOf('\n'); if (at < 0) continue; text = text.slice(at + 1); discarding = false; }
      buffer += text;
      let at: number;
      while ((at = buffer.indexOf('\n')) >= 0) { const value = buffer.slice(0, at); buffer = buffer.slice(at + 1); await line(value); }
      if (buffer.length > maxLine) { buffer = ''; discarding = true; }
    }
  } finally { nativeGatewayReady = false; if (!ending && !reportersStarted) say('publication pending: native gateway ended its event stream before verified readiness'); }
}
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
// A mail agent's other channels (company RFC 0026 decision 3): an engagement's Slack channels and its client's Jira
// ticket comments, carried to the same mailbox by the same bridge (supercode agent-channel --platform slack|jira). Their
// credentials stay in custody: <secrets>/slack.env (SLACK_BOT_TOKEN, SLACK_APP_TOKEN, and SLACK_CHANNELS where the
// agent.json names no channel ids) and <secrets>/jira.env (JIRA_EMAIL and JIRA_API_TOKEN, or JIRA_TOKEN), read here and
// given to that one process.
const custodyEnv = (file: string): Record<string, string> => {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m) out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2'); }
  return out;
};
for (const [name, mailAgent] of Object.entries(agentSetup.agents ?? {})) {
  const slack = mailAgent.channel?.slack;
  if (slack) {
    const creds = custodyEnv(resolve(secrets, 'slack.env'));
    const channels = slack.channels?.length ? slack.channels : (creds.SLACK_CHANNELS ?? '').split(',').map((c) => c.trim()).filter(Boolean);
    if (!creds.SLACK_BOT_TOKEN || !creds.SLACK_APP_TOKEN || !channels.length) say(`channel ${name} slack: ${resolve(secrets, 'slack.env')} needs SLACK_BOT_TOKEN, SLACK_APP_TOKEN and the channels (agent.json or SLACK_CHANNELS); not carried`);
    else spawn(`channel ${name} slack`, [Bun.which('node')!, orchestratorBin, 'agent-channel', '--agent', name, '--platform', 'slack', '--slack-channel', channels.join(','),
      '--state', resolve(home, '..', 'channels', `${name}.slack.json`)], { env: { ...env, SLACK_BOT_TOKEN: creds.SLACK_BOT_TOKEN, SLACK_APP_TOKEN: creds.SLACK_APP_TOKEN, SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin } });
  }
  const jira = mailAgent.channel?.jira;
  if (jira) {
    const creds = custodyEnv(resolve(secrets, 'jira.env'));
    const auth: Record<string, string> | undefined = creds.JIRA_TOKEN ? { JIRA_TOKEN: creds.JIRA_TOKEN } : creds.JIRA_EMAIL && creds.JIRA_API_TOKEN ? { JIRA_EMAIL: creds.JIRA_EMAIL, JIRA_API_TOKEN: creds.JIRA_API_TOKEN } : undefined;
    if (!jira.site || !jira.jql || !auth) say(`channel ${name} jira: agent.json needs its site and jql, and ${resolve(secrets, 'jira.env')} its credential; not carried`);
    else spawn(`channel ${name} jira`, [Bun.which('node')!, orchestratorBin, 'agent-channel', '--agent', name, '--platform', 'jira', '--site', jira.site, '--jql', jira.jql,
      '--state', resolve(home, '..', 'channels', `${name}.jira.json`)], { env: { ...env, ...auth, SUPERCODE_BIN: supercodeBin, SUPERCODE_ORCHESTRATOR_ENTRY: orchestratorBin } });
  }
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
  const runtime = onNative ? 'the orchestrator' : 'Hermes';
  say(moved ? `restart asked for main at ${request!.revision!.slice(0, 8)}; asking ${runtime} to drain before restarting the stack onto it` : `kit ${request!.version} landed; asking ${runtime} to drain before restarting the stack`);
  restartAsked = true;
  // Hermes drains on SIGUSR1; the orchestrator stops on SIGTERM, recording each conversation's session to resume.
  // Bun's Subprocess.kill string mapping uses the Linux number on some macOS
  // releases. Use the host's signal constant: SIGUSR1 is 30 on macOS, 10 on Linux.
  process.kill(gateway.pid, onNative ? constants.signals.SIGTERM : constants.signals.SIGUSR1);
}, 5000);
say(`${onNative ? `orchestrator (worker ${harness})` : 'gateway'} up in ${project} as ${user?.name ?? userInfo().username}, home ${home}; the valve on :${valvePort}${paying ? ` and :${valvePort + 1} (a rehearsal's pay port)` : ''}${codexForward ? `; the Codex subscription through ${codexForward}` : ''}${githubRecords.length ? `; the GitHub App on ${githubRecords.map((r) => `:${r.port}`).join(' and ')}` : ''}`);
if (!readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8').includes('account:')) say('warning: .open-autonomy/config.yaml names no account');
await new Promise(() => {});
