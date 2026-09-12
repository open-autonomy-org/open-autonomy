#!/usr/bin/env bun
// Start native Hermes. --container runs the existing valve/reporter on this host, against a prepared World
// executor (container/README.md). Without it this is the bare development/rehearsal
// stack; legacy --as privilege dropping remains available for existing installations.
//
//   bun .open-autonomy/start.ts [--home <dir>] [--secrets <dir>] [--project <dir>] [--origin <url>] [--as <user>] [--valve <port>]
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
//   gateway     `hermes gateway run` in the checkout, HERMES_HOME=<home>
// When any of them ends, all of them end and this exits 1: the supervisor outside (you, launchd, Docker) restarts.
import { codexAccess } from './codex-auth.ts';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import { homedir, userInfo } from 'node:os';
import { basename, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
// A managed executor keeps credentials, reporting and supervision on this host.
// The bare entrypoint below remains the development/rehearsal path.
if (arg('--container')) {
  const { startContainer } = await import('./container.ts');
  const runtime = await startContainer({ container: arg('--container')!, project: arg('--project'),
    home: arg('--home'), secrets: arg('--secrets'), state: arg('--state'),
    config: arg('--config'), port: Number(arg('--valve') ?? 8787) });
  process.exit(await runtime.exited);
}
const project = resolve(arg('--project') ?? resolve(import.meta.dir, '..'));
const loadedSource = readFileSync(import.meta.path, 'utf8');
// Hermes drains active turns and exits 75 for an in-band restart. Restart the complete
// kit entrypoint so a landed upgrade also refreshes the home, valve and reporter.
if (!argv.includes('--stack-child')) {
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { stopping = true; child?.kill(signal); });
  let entry = import.meta.path;
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
const agentEnv = (): Record<string, string> => ({ ...inherited(), HERMES_HOME: home, TERMINAL_CWD: project, ...(user ? { HOME: home, USER: user.name, LOGNAME: user.name } : {}), ...(existsSync(sock) ? { SSH_AUTH_SOCK: sock } : {}), GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o StrictHostKeyChecking=accept-new' });

const children: Array<{ name: string; proc: ReturnType<typeof Bun.spawn> }> = [];
let ending = false;
process.on('exit', () => {
  for (const child of children) { try { child.proc.kill(); } catch { /* already gone */ } }
});
function spawn(name: string, cmd: string[], opts: { cwd?: string; env?: Record<string, string>; asAgent?: boolean }) {
  const proc = Bun.spawn({ cmd: opts.asAgent ? drop(cmd) : cmd, cwd: opts.cwd ?? project, env: opts.env ?? inherited(), stdout: 'inherit', stderr: 'inherit', stdin: 'ignore' });
  children.push({ name, proc });
  proc.exited.then(async (code) => {
    if (ending) return;
    ending = true;
    say(`${name} ended (${code}); stopping the rest`);
    for (const c of children) if (c.proc !== proc) c.proc.kill();
    await Promise.all(children.map((c) => c.proc.exited));
    process.exit(name === 'gateway' && code === 75 ? 75 : 1);
  });
  return proc;
}
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => { ending = true; for (const c of children) c.proc.kill(); setTimeout(() => process.exit(0), 300); });

mkdirSync(home, { recursive: true });
own(home);

// 1. ssh-agent, as the agent (an agent only answers its own uid, or root): the key is added by us, from a file
//    the agent cannot read, and lives in the agent's memory alone.
const deployKey = resolve(secrets, 'deploy_key');
if (existsSync(deployKey)) {
  rmSync(sock, { force: true });
  spawn('ssh-agent', ['ssh-agent', '-D', '-a', sock], { asAgent: true, cwd: home });
  const t0 = Date.now(); while (!existsSync(sock) && Date.now() - t0 < 5000) Bun.sleepSync(50);
  const add = Bun.spawnSync({ cmd: ['ssh-add', '-q', deployKey], env: { ...process.env, SSH_AUTH_SOCK: sock }, stdout: 'pipe', stderr: 'pipe' });
  if (add.exitCode !== 0) { console.error(`start: ssh-add ${deployKey}: ${add.stderr.toString().trim()}`); process.exit(1); }
  say(`ssh-agent holds the deploy key at ${sock}`);
} else say(`no ${deployKey}: pushes use your own git and keys`);

// 2. The checkout.
let committedFrom: string | undefined;
if (!existsSync(resolve(project, '.git'))) {
  if (!origin) { console.error(`start: ${project} is not a checkout and no --origin to clone`); process.exit(1); }
  mkdirSync(project, { recursive: true }); own(project);
  const clone = Bun.spawnSync({ cmd: drop(['git', 'clone', '-q', origin, project]), env: agentEnv(), stdout: 'inherit', stderr: 'inherit' });
  if (clone.exitCode !== 0) { console.error(`start: cannot clone ${origin}`); process.exit(1); }
  say(`cloned ${origin} → ${project}`);
} else {
  // What the agent IS is what main says: a clean checkout moves to origin/main before the home is synced from it
  // (the skills, the schedule, the documents the reporter publishes). A dirty one — a killed attempt's work — is
  // left as it is; the next attempt starts from a fresh main itself. A failed fetch or snapshot stops startup:
  // the supervisor can retry, but unlanded configuration must not become the running home.
  const git = (...args: string[]) => Bun.spawnSync({ cmd: drop(['git', ...args]), cwd: project, env: agentEnv(), stdout: 'pipe', stderr: 'pipe' });
  const status = git('status', '--porcelain');
  if (status.exitCode !== 0 || git('fetch', '-q', 'origin').exitCode !== 0) { console.error('start: cannot inspect and fetch the committed configuration; startup stopped, retry when Git access is restored'); process.exit(1); }
  if (status.stdout.toString().trim()) {
    // The working tree is a killed attempt's; what the agent IS still comes from main: its hermes/ is taken from
    // origin/main directly, and the tree is left for the next attempt to carry over.
    const dir = mkdtempSync(resolve(tmpdir(), 'open-autonomy-hermes-'));
    process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
    own(dir);
    const archive = git('archive', '--format=tar', 'origin/main', 'hermes');
    const extracted = archive.exitCode === 0 && Bun.spawnSync({ cmd: drop(['tar', '-x', '-C', dir]), stdin: archive.stdout, cwd: project, env: agentEnv(), stdout: 'pipe', stderr: 'pipe' }).exitCode === 0;
    if (!extracted || !existsSync(resolve(dir, 'hermes'))) { console.error('start: cannot extract committed Hermes configuration; startup stopped, repair snapshot permissions or the committed hermes directory'); process.exit(1); }
    committedFrom = resolve(dir, 'hermes');
    say(`checkout ${project} has uncommitted changes; preserved, using Hermes configuration from origin/main`);
  } else {
    if (git('checkout', '-q', '--detach', 'origin/main').exitCode !== 0) { console.error('start: cannot check out origin/main; startup stopped without loading local configuration'); process.exit(1); }
    say(`checkout ${project} at origin/main (${git('rev-parse', '--short', 'HEAD').stdout.toString().trim()})`);
  }
}

// Fetching can replace this very entrypoint. Load the landed code before claiming its
// version is running, rather than continuing the previous script with a new kit record.
if (readFileSync(resolve(project, '.open-autonomy/start.ts'), 'utf8') !== loadedSource) {
  ending = true;
  for (const child of children) child.proc.kill();
  await Promise.all(children.map((child) => child.proc.exited));
  process.exit(75);
}

// 3. The home, from the repository: everything under hermes/ except its .env, which is the home's own.
const committed = committedFrom ?? resolve(project, 'hermes');
if (existsSync(committed)) {
  // The kit's own families are mirrored, not merged: a skill or hook the checkout no longer has leaves the home too.
  for (const family of ['skills/open-autonomy', 'hooks', 'plugins/escalate']) rmSync(resolve(home, family), { recursive: true, force: true });
  // force: with a filter, Bun's cpSync leaves an existing file alone unless told to overwrite.
  cpSync(committed, home, { recursive: true, force: true, filter: (src) => basename(src) !== '.env' });
}
// The home's .env is the home's own, except the valve's three lines, which are this start's truth on every start.
const envFile = resolve(home, '.env');
const githubApp = existsSync(resolve(secrets, 'github-app.json'));
const managed = githubApp ? /^(OPEN_AUTONOMY_(BASE_URL|PAY_URL|KEY)|HERMES_CODEX_BASE_URL|GITHUB_API_URL|GITHUB_TOKEN)=/ : /^(OPEN_AUTONOMY_(BASE_URL|PAY_URL|KEY)|HERMES_CODEX_BASE_URL)=/;
const kept = existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n').filter((l) => l.trim() && !managed.test(l)) : [];
// Keep the host login environment for the valve; only the agent gets an empty Codex home.
const hostEnvironment = inherited();
const onCodex = ['config.yaml', 'profiles/treasurer/config.yaml'].some((f) => existsSync(resolve(home, f)) && /^\s+provider:\s*openai-codex\s*$/m.test(readFileSync(resolve(home, f), 'utf8')));
const codexPort = valvePort + 2;
const codexTwin = process.env.HERMES_CODEX_BASE_URL?.trim();
const codexForward = codexTwin || (onCodex ? `http://127.0.0.1:${codexPort}/backend-api/codex` : undefined);
if (onCodex && !codexTwin) await codexAccess();
const codexBase = codexForward ? [`HERMES_CODEX_BASE_URL=${codexForward}`] : [];
// The desk's GitHub door likewise: the valve's fourth port, as api.github.com.
const githubDoor = githubApp ? [`GITHUB_API_URL=http://127.0.0.1:${valvePort + 3}`, 'GITHUB_TOKEN=valve'] : [];
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
  for (const profile of [home, resolve(home, 'profiles/treasurer')]) {
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
writeFileSync(resolve(home, 'running-kit.json'), JSON.stringify({ version: runningKit.version }));
const homeReadme = resolve(home, 'README.md');
// The site renders the setup's opening paragraphs; put the running version there.
writeFileSync(homeReadme, readFileSync(homeReadme, 'utf8').replace('\n\n', `\n\nRunning Hermes kit ${runningKit.version}. `));

// 4. The valve: one key file per port; a missing developer's key is the one thing that stops the start.
const keys: string[] = ['--key', `${developerKey}:${valvePort}`];
if (existsSync(resolve(secrets, 'treasurer.env'))) keys.push('--key', `${resolve(secrets, 'treasurer.env')}:${valvePort + 1}`);
// Both launch modes use the host Codex login. A model twin never starts real authentication.
if (onCodex && !codexTwin) keys.push('--codex', String(codexPort));
// The agent's GitHub identity: the valve mints the app's installation tokens and serves the desk's routes on the fourth port.
const githubFile = resolve(secrets, 'github-app.json');
if (githubApp) keys.push('--github-app', `${githubFile}:${valvePort + 3}`);
spawn('valve', ['bun', resolve(import.meta.dir, 'valve.ts'), '--loopback', ...keys], { env: hostEnvironment });

// 5. The reporter and the gateway, as the agent. The reporter's own dependencies (supercode, beside it in
//    .open-autonomy/package.json) are installed when that file is not the one the last complete install satisfied:
//    a stamp beside them names it, and a failed install leaves none, so node_modules alone is no evidence. (The
//    lockfile is not the identity: a clone carries none, the kit ignores it.) An install that is already complete
//    costs no registry call, which a sealed world could not make.
const env = agentEnv();
{
  const lock = ['bun.lock', 'bun.lockb'].map((file) => resolve(import.meta.dir, file)).find(existsSync);
  const stamp = resolve(import.meta.dir, 'node_modules', '.open-autonomy-install');
  const want = String(Bun.hash(readFileSync(resolve(import.meta.dir, 'package.json'))));
  if ((existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : '') !== want) {
    const install = Bun.spawnSync({ cmd: drop(['bun', 'install', ...(lock ? ['--frozen-lockfile'] : [])]), cwd: import.meta.dir, env, stdout: 'inherit', stderr: 'inherit' });
    if (install.exitCode !== 0) { console.error(`start: cannot install the reporter's dependencies in ${import.meta.dir}`); process.exit(1); }
    writeFileSync(stamp, `${want}\n`);
    say(`reporter dependencies installed in ${import.meta.dir}`);
  }
}
spawn('reporter', ['bun', resolve(import.meta.dir, 'reporter.ts'), '--config', resolve(project, '.open-autonomy', 'config.yaml')], { asAgent: true, env: { ...env, OPEN_AUTONOMY_BASE_URL: baseUrl } });
const gateway = spawn('gateway', ['hermes', 'gateway', 'run'], { asAgent: true, env: { ...env, HERMES_GATEWAY_EXTERNAL_SUPERVISOR: '1' } });
let restarting = false;
const restartRequest = resolve(home, 'kit-restart.json');
setInterval(() => {
  if (ending || restarting || !existsSync(restartRequest)) return;
  let request: { version?: string };
  try { request = JSON.parse(readFileSync(restartRequest, 'utf8')); }
  catch { say('cannot decode kit-restart.json; repair the request before restarting'); return; }
  if (!request.version || request.version === runningKit.version) { rmSync(restartRequest, { force: true }); return; }
  const board = Bun.spawnSync({ cmd: drop(['hermes', 'kanban', 'list', '--json']), cwd: project, env, stdout: 'pipe', stderr: 'pipe' });
  if (board.exitCode !== 0) { say('cannot read the board; kit restart waits'); return; }
  try {
    const tasks = JSON.parse(board.stdout.toString());
    if (!Array.isArray(tasks) || tasks.some((task: { status: string }) => ['running', 'review'].includes(task.status))) return;
  } catch { say('cannot decode the board; kit restart waits'); return; }
  restarting = true;
  rmSync(restartRequest, { force: true });
  say(`kit ${request.version} landed; asking Hermes to drain before restarting the stack`);
  // Bun's Subprocess.kill string mapping uses the Linux number on some macOS
  // releases. Use the host's signal constant: SIGUSR1 is 30 on macOS, 10 on Linux.
  process.kill(gateway.pid, constants.signals.SIGUSR1);
}, 5000);
say(`gateway up in ${project} as ${user?.name ?? userInfo().username}, home ${home}; the valve on :${valvePort}${existsSync(resolve(secrets, 'treasurer.env')) ? ` and :${valvePort + 1}` : ''}${codexForward ? `; the Codex subscription through ${codexForward}` : ''}${githubApp ? `; the GitHub App on :${valvePort + 3}` : ''}`);
if (!readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8').includes('account:')) say('warning: .open-autonomy/config.yaml names no account');
await new Promise(() => {});
