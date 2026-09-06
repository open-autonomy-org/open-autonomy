#!/usr/bin/env bun
// Start the agent. The same processes wherever it runs; only how this script is started differs:
//   on your machine   `bun .open-autonomy/start.ts` — everything as you, no isolation, for development
//   in a container    the image's entrypoint, as root with the secrets mounted for root alone and `--as <user>`:
//                     the gateway and the reporter run as that user and can reach no key (container/README.md)
//
//   bun .open-autonomy/start.ts [--home <dir>] [--secrets <dir>] [--project <dir>] [--origin <url>] [--as <user>] [--valve <port>]
//
// The processes, in order:
//   ssh-agent   holds <secrets>/deploy_key, its socket at <home>/ssh-agent.sock; the gateway pushes through it
//               and never holds the key (absent: pushes are your own git's business)
//   the clone   <project> cloned from --origin when it is not a checkout yet (a container's first boot)
//   the home    hermes/ in the checkout copied into <home> before every start — the repository is the source of
//               truth for what the agent IS; the home keeps what it has since done (its .env is kept)
//   valve       <secrets>/agent.env on :8787 (the developer's key), <secrets>/treasurer.env on :8788 (the
//               treasurer's, the only one that pays); --valve moves both (the second is the next port) for a second
//               agent on one host — the home's .env names them (OPEN_AUTONOMY_BASE_URL, OPEN_AUTONOMY_PAY_URL) and the word `valve`
//   reporter    keyless, publishing the home's sessions and board through the valve
//   gateway     `hermes gateway run` in the checkout, HERMES_HOME=<home>
// When any of them ends, all of them end and this exits 1: the supervisor outside (you, launchd, Docker) restarts.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { basename, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const project = resolve(arg('--project') ?? resolve(import.meta.dir, '..'));
const home = resolve(arg('--home') ?? process.env.AGENT_HOME ?? resolve(homedir(), '.local', 'state', 'open-autonomy', basename(project), 'home'));
const secrets = resolve(arg('--secrets') ?? process.env.AGENT_SECRETS ?? resolve(homedir(), '.config', 'open-autonomy'));
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
const own = (path: string) => { if (user) Bun.spawnSync({ cmd: ['chown', '-R', `${user.uid}:${user.gid}`, path] }); };
// The agent's environment is what this script says. Nothing Hermes set on the process that started this one comes
// through: a start from inside another agent's worker (a project's world, brought up by a task) would otherwise inherit
// that worker's HERMES_KANBAN_DB, HERMES_KANBAN_HOME, its task and run, and file its work on the outer board.
const inherited = (): Record<string, string> => { const env: Record<string, string> = {}; for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith('HERMES_')) env[k] = v; return env; };
const agentEnv = (): Record<string, string> => ({ ...inherited(), HERMES_HOME: home, ...(user ? { HOME: home, USER: user.name, LOGNAME: user.name } : {}), ...(existsSync(sock) ? { SSH_AUTH_SOCK: sock } : {}), GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o StrictHostKeyChecking=accept-new' });

const children: Array<{ name: string; proc: ReturnType<typeof Bun.spawn> }> = [];
let ending = false;
function spawn(name: string, cmd: string[], opts: { cwd?: string; env?: Record<string, string>; asAgent?: boolean }) {
  const proc = Bun.spawn({ cmd: opts.asAgent ? drop(cmd) : cmd, cwd: opts.cwd ?? project, env: opts.env ?? inherited(), stdout: 'inherit', stderr: 'inherit', stdin: 'ignore' });
  children.push({ name, proc });
  proc.exited.then((code) => { if (ending) return; ending = true; say(`${name} ended (${code}); stopping the rest`); for (const c of children) if (c.proc !== proc) c.proc.kill(); setTimeout(() => process.exit(1), 500); });
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
if (!existsSync(resolve(project, '.git'))) {
  if (!origin) { console.error(`start: ${project} is not a checkout and no --origin to clone`); process.exit(1); }
  mkdirSync(project, { recursive: true }); own(project);
  const clone = Bun.spawnSync({ cmd: drop(['git', 'clone', '-q', origin, project]), env: agentEnv(), stdout: 'inherit', stderr: 'inherit' });
  if (clone.exitCode !== 0) { console.error(`start: cannot clone ${origin}`); process.exit(1); }
  say(`cloned ${origin} → ${project}`);
}

// 3. The home, from the checkout: everything under hermes/ except its .env, which is the home's own.
const committed = resolve(project, 'hermes');
if (existsSync(committed)) {
  // The kit's own families are mirrored, not merged: a skill or hook the checkout no longer has leaves the home too.
  for (const family of ['skills/open-autonomy', 'hooks']) rmSync(resolve(home, family), { recursive: true, force: true });
  // force: with a filter, Bun's cpSync leaves an existing file alone unless told to overwrite.
  cpSync(committed, home, { recursive: true, force: true, filter: (src) => basename(src) !== '.env' });
}
// The home's .env is the home's own, except the valve's three lines, which are this start's truth on every start.
const envFile = resolve(home, '.env');
const kept = existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n').filter((l) => l.trim() && !/^OPEN_AUTONOMY_(BASE_URL|PAY_URL|KEY)=/.test(l)) : [];
const lines = [`OPEN_AUTONOMY_BASE_URL=${baseUrl}`, `OPEN_AUTONOMY_PAY_URL=${payUrl}`, 'OPEN_AUTONOMY_KEY=valve', ...kept];
// On the first start, what the environment says about the agent's channels comes along: Discord's, and GitHub's for a community desk.
if (!existsSync(envFile)) for (const k of Object.keys(process.env).sort()) if (/^(DISCORD_|GITHUB_TOKEN$|GITHUB_API_URL$)/.test(k) && process.env[k]) lines.push(`${k}=${process.env[k]}`);
writeFileSync(envFile, `${lines.join('\n')}\n`);
own(home);
say(`home ${home} synced from ${committed}`);

// 4. The valve: one key file per port; a missing developer's key is the one thing that stops the start.
const keys: string[] = [];
if (existsSync(resolve(secrets, 'agent.env'))) keys.push('--key', `${resolve(secrets, 'agent.env')}:${valvePort}`);
if (existsSync(resolve(secrets, 'treasurer.env'))) keys.push('--key', `${resolve(secrets, 'treasurer.env')}:${valvePort + 1}`);
if (!keys.length) { console.error(`start: no ${resolve(secrets, 'agent.env')} — mint the developer's key: bun .open-autonomy/mint-key.ts`); process.exit(1); }
if (user) {
  // The whole point of --as: the agent's user must not be able to read a key.
  const peek = Bun.spawnSync({ cmd: drop(['cat', resolve(secrets, 'agent.env')]), stdout: 'pipe', stderr: 'pipe' });
  if (peek.exitCode === 0) { console.error(`start: ${resolve(secrets, 'agent.env')} is readable by ${user.name}; the secrets must belong to root alone`); process.exit(1); }
}
// The valve and the reporter run from this script's own directory (its node_modules, its vendored SDK): in a
// container that is the image's copy, and the checkout only has to be the project.
spawn('valve', ['bun', resolve(import.meta.dir, 'sdk', 'valve.ts'), ...keys], {});

// 5. The reporter and the gateway, as the agent.
const env = agentEnv();
spawn('reporter', ['bun', resolve(import.meta.dir, 'reporter.ts'), '--config', resolve(project, '.open-autonomy', 'config.yaml')], { asAgent: true, env: { ...env, OPEN_AUTONOMY_BASE_URL: baseUrl } });
spawn('gateway', ['hermes', 'gateway', 'run'], { asAgent: true, env });
say(`gateway up in ${project} as ${user?.name ?? userInfo().username}, home ${home}; the valve on :${valvePort}${keys.length > 2 ? ` and :${valvePort + 1}` : ''}`);
if (!readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8').includes('account:')) say('warning: .open-autonomy/config.yaml names no account');
await new Promise(() => {});
