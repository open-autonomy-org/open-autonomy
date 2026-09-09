#!/usr/bin/env bun
// The brain's stack as the kit starts it, inside the world: the kit's own start script on the world clone, with the
// world's secrets (the keys the seed minted, the channels' twin credentials), its home under the world's state, its
// origin the GitHub twin, the pinned Hermes on its PATH. Its model goes valve → the backend copy → the model twin (the
// scripted brain); its channels go to the twins. Nothing it inherits is the operator's: the environment it starts
// with is built here from nothing (the world's own stripEnv rule, for a stack the world does not start).
//   stack.ts up | down [--purge] | restart | hermes <args…>
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { ACCOUNT, ROOT, SECRETS, STACK, STATE, context, hooks, need, sh, timed } from './lib.ts';

const home = resolve(STACK, 'home');
const project = resolve(STACK, 'project');
const pidFile = resolve(STACK, 'start.pid');
const logFile = resolve(STACK, 'start.log');
const VALVE_PORT = Number(process.env.REHEARSAL_VALVE_PORT ?? 18887);
const h = await hooks();

// The pinned Hermes, from the project's own pin, installed once under the world's state: the tag cloned, its commit
// checked, `uv sync --frozen`. The world runs the Hermes a project ships with; a project may name another (hooks.hermesBin).
function hermesBin(): string {
  const given = h.hermesBin ?? process.env.WORLD_HERMES_BIN ?? process.env.HERMES_BIN ?? (existsSync('/opt/hermes/.venv/bin/hermes') ? '/opt/hermes/.venv/bin' : undefined);
  if (given) return given.replace(/^~(?=$|\/)/, process.env.HOME ?? '');
  const pin = Object.fromEntries(readFileSync(resolve(ROOT, 'container', 'hermes.pin'), 'utf8').split('\n').map((l) => l.trim().split('=') as [string, string]).filter(([k]) => k && !k.startsWith('#')));
  const dir = resolve(STATE, '.volter', 'hermes', pin.HERMES_TAG);
  if (!existsSync(resolve(dir, '.venv', 'bin', 'hermes'))) {
    console.log(`stack: installing Hermes ${pin.HERMES_TAG} under ${dir} (one-time, minutes)`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(resolve(dir, '..'), { recursive: true });
    const outside: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env as Record<string, string | undefined>)) if (typeof v === 'string' && !/^(https?_proxy|all_proxy|no_proxy|node_options|node_extra_ca_certs|ssl_cert_file|requests_ca_bundle|curl_ca_bundle)$/i.test(k)) outside[k] = v;
    Bun.spawnSync({ cmd: ['git', 'clone', '-q', '--depth', '1', '--branch', pin.HERMES_TAG, pin.HERMES_REPO, dir], env: outside, stdout: 'inherit', stderr: 'inherit' });
    const have = sh(['git', '-C', dir, 'rev-parse', 'HEAD'], { quiet: true, env: outside }).out.trim();
    if (have !== pin.HERMES_COMMIT) throw new Error(`hermes.pin: ${pin.HERMES_TAG} is ${have}, not the pinned ${pin.HERMES_COMMIT}`);
    sh(['uv', 'sync', '--frozen', '--python', '3.12', '--extra', 'messaging'], { cwd: dir, env: outside });
  }
  return resolve(dir, '.venv', 'bin');
}
// The stack's environment, from nothing: the machine's PATH with Hermes first, HOME, the world's twin addresses the
// channels need, and what the project's hook adds. Never the operator's shell, never a custody file.
function stackEnv(bin: string): Record<string, string> {
  const world = context().world;
  const base: Record<string, string> = { PATH: `${bin}:${process.env.PATH ?? ''}`, HOME: process.env.HOME ?? '', USER: process.env.USER ?? 'agent', TERM: 'xterm', LANG: process.env.LANG ?? 'en_US.UTF-8', HERMES_HOME: home };
  // The world's proxy and CA, when the world attached this process (the twins' hostnames resolve to the twins).
  for (const k of ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'VOLTER_WORLD']) if (process.env[k]) base[k] = process.env[k]!;
  if (world.GITHUB_TWIN_URL) Object.assign(base, { GITHUB_API_URL: world.GITHUB_TWIN_URL, GITHUB_TOKEN: 'world-bot' });
  return { ...base, ...(h.stackEnv ? h.stackEnv(context()) : {}) };
}
function start(): void {
  const bin = hermesBin();
  for (const f of ['agent.env']) if (!existsSync(resolve(SECRETS, f))) throw new Error(`${resolve(SECRETS, f)} is missing — run \`bun .open-autonomy/rehearsal/run.ts seed\` first`);
  if (!existsSync(resolve(project, '.git'))) throw new Error(`${project} is missing — run the seed first`);
  mkdirSync(home, { recursive: true });
  const log = openSync(logFile, 'a');
  const child = spawn('bun', [resolve(project, '.open-autonomy', 'start.ts'), '--project', project, '--home', home, '--secrets', SECRETS, '--origin', `${need('GITHUB_TWIN_URL')}/${ACCOUNT}.git`, '--valve', String(VALVE_PORT)], { cwd: project, env: stackEnv(bin), detached: true, stdio: ['ignore', log, log] });
  child.unref();
  writeFileSync(pidFile, `${child.pid}\n`);
}
function stop(): void {
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  if (pid) { try { process.kill(-pid, 'SIGTERM'); } catch { /* gone */ } const deadline = Date.now() + 10_000; while (Date.now() < deadline) { try { process.kill(pid, 0); Bun.sleepSync(200); } catch { break; } } }
  rmSync(pidFile, { force: true });
}
// The gateway seeds its schedule as it boots; the stack is up once the valve answers and the schedule exists.
function waitUp(): void {
  const bin = hermesBin();
  const deadline = Date.now() + 300_000; const booted = Date.now();
  for (;;) {
    const list = sh([resolve(bin, 'hermes'), 'cron', 'list'], { quiet: true, check: false, env: { ...stackEnv(bin) }, cwd: existsSync(project) ? project : STATE }).out;
    if (/\[active\]/.test(list)) break;
    if (existsSync(pidFile)) { try { process.kill(Number(readFileSync(pidFile, 'utf8').trim()), 0); } catch { throw new Error(`stack: the start script ended (${logFile})`); } }
    if (Date.now() > deadline) throw new Error(`stack: the gateway did not seed its schedule within five minutes (${logFile})`);
    Bun.sleepSync(2000);
  }
  console.log(`⏱ stack: gateway boot to schedule seeded: ${((Date.now() - booted) / 1000).toFixed(1)}s`);
}
function down(purge: boolean): void { stop(); if (purge) for (const d of [home, project]) rmSync(d, { recursive: true, force: true }); console.log(`stack: down${purge ? ', the home and the clone removed' : ''}`); }

const [verb, ...rest] = process.argv.slice(2);
if (verb === 'up') { stop(); timed('start', () => start()); waitUp(); console.log(`stack: up (valve :${VALVE_PORT}, home ${home}, log ${logFile})`); }
else if (verb === 'down') down(rest.includes('--purge'));
else if (verb === 'restart') { stop(); timed('restart', () => start()); waitUp(); }
else if (verb === 'hermes') { const bin = hermesBin(); process.exit(Bun.spawnSync({ cmd: [resolve(bin, 'hermes'), ...rest], cwd: existsSync(project) ? project : STATE, env: stackEnv(bin), stdio: ['inherit', 'inherit', 'inherit'] }).exitCode); }
else { console.error('usage: stack.ts up | down [--purge] | restart | hermes <args…>'); process.exit(2); }
