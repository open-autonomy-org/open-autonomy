#!/usr/bin/env bun
// The cookbook's agent as the kit starts it on a laptop (bun world/run.ts stack up|down|between-tasks): the kit's
// own start script, `.open-autonomy/start.ts`, run bare inside the world's environment — no container, no
// isolation, since nothing the world's agent can reach is worth protecting (its keys are the local platform's,
// its completions the scenario's, its remote the GitHub twin). The seal is the world's environment: every
// vendor is a twin, and anything untwinned is refused by the proxy.
//
//   up             the pinned Hermes (container/hermes.pin, installed once under the world's state), the checkout
//                  cloned from the twin, then the start script: ssh-agent (none here), valve, reporter, gateway
//   down           end the start script (its processes end with it); --purge forgets the home and the checkout
//   between-tasks  what the owner does between two tasks: the config on the twin's main moves from the previous
//                  model to the cookbook's, the checkout follows, the agent restarts (the next worker spends on
//                  it), and the key is rotated with a short grace (the valve picks the new key up unrestarted;
//                  the old key is refused after its grace)
//   hermes …       the pinned Hermes against the world's home, in the checkout (`hermes kanban list`,
//                  `hermes cron run pm`: the PM's hour, now)
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, COOKBOOK, DATA, HOME_CHANNEL, MODEL, PREVIOUS_MODEL, STATE, WORK, git, need, twinCli } from './lib.ts';

const stackDir = resolve(STATE, '.volter', 'stack');
const VALVE_PORT = 18787;
const home = resolve(stackDir, 'home');
const project = resolve(stackDir, 'project');
const pidFile = resolve(stackDir, 'start.pid');
const logFile = resolve(stackDir, 'start.log');
const timed = <T>(label: string, fn: () => T): T => { const t0 = Date.now(); try { return fn(); } finally { console.log(`⏱ stack: ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`); } };
function sh(cmd: string[], opts: { quiet?: boolean; check?: boolean; env?: Record<string, string>; cwd?: string } = {}): { code: number; out: string } {
  const r = Bun.spawnSync({ cmd, cwd: opts.cwd ?? STATE, stdout: 'pipe', stderr: opts.quiet ? 'pipe' : 'inherit', env: { ...process.env, ...opts.env } });
  const out = r.stdout.toString();
  if (opts.check !== false && r.exitCode !== 0) throw new Error(`${cmd.slice(0, 4).join(' ')} … failed (${r.exitCode})${opts.quiet ? `\n${r.stderr.toString().slice(-800)}` : ''}`);
  return { code: r.exitCode, out };
}

// The pinned Hermes, from the cookbook's own pin, installed once under the world's state: the tag cloned, its
// commit checked, `uv sync --frozen`. The world runs the Hermes a project ships with.
function hermesBin(): string {
  // Where a Hermes at the pin already lives (the agent's own container: /opt/hermes), use it.
  const given = process.env.HERMES_BIN ?? (existsSync('/opt/hermes/.venv/bin/hermes') ? '/opt/hermes/.venv/bin' : undefined);
  if (given) return given;
  const pin = Object.fromEntries(readFileSync(resolve(COOKBOOK, 'container', 'hermes.pin'), 'utf8').split('\n').map((l) => l.trim().split('=') as [string, string]).filter(([k]) => k && !k.startsWith('#')));
  const dir = resolve(STATE, '.volter', 'hermes', pin.HERMES_TAG);
  if (!existsSync(resolve(dir, '.venv', 'bin', 'hermes'))) {
    console.log(`stack: installing Hermes ${pin.HERMES_TAG} under ${dir} (one-time, minutes)`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(resolve(dir, '..'), { recursive: true });
    // Hermes and its packages come from the real GitHub and PyPI: the machine's tooling, outside the world's proxy.
    const outside: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(https?_proxy|all_proxy|no_proxy|node_options|node_extra_ca_certs|ssl_cert_file|requests_ca_bundle|curl_ca_bundle)$/i.test(k)) outside[k] = v;
    Bun.spawnSync({ cmd: ['git', 'clone', '-q', '--depth', '1', '--branch', pin.HERMES_TAG, pin.HERMES_REPO, dir], env: outside, stdout: 'inherit', stderr: 'inherit' });
    const have = sh(['git', '-C', dir, 'rev-parse', 'HEAD'], { quiet: true, env: outside }).out.trim();
    if (have !== pin.HERMES_COMMIT) throw new Error(`hermes.pin: ${pin.HERMES_TAG} is ${have}, not the pinned ${pin.HERMES_COMMIT}`);
    sh(['uv', 'sync', '--frozen', '--python', '3.12', '--extra', 'messaging'], { cwd: dir, env: outside });
  }
  return resolve(dir, '.venv', 'bin');
}
const agentEnv = (bin: string): Record<string, string> => ({ ...process.env as Record<string, string>, PATH: `${bin}:${process.env.PATH ?? ''}`, HERMES_HOME: home });

// A file on the twin's main, written the way an owner commits one: in the host checkout the seed made (WORK,
// on main), committed as the owner and pushed. The twin's git and its API then agree.
async function putMain(path: string, content: string, message: string): Promise<void> {
  await git(WORK, 'fetch', '-q', 'origin');
  await git(WORK, 'checkout', '-q', 'main');
  await git(WORK, 'reset', '-q', '--hard', 'origin/main');
  writeFileSync(resolve(WORK, path), content);
  if (!(await git(WORK, 'status', '--porcelain', '--', path)).trim()) return;
  await git(WORK, '-c', 'user.name=owner', '-c', 'user.email=owner@example.com', 'commit', '-q', '-am', message);
  await git(WORK, 'push', '-q', 'origin', 'main');
}
const configYaml = (): string => readFileSync(resolve(COOKBOOK, 'hermes', 'config.yaml'), 'utf8');
function previousConfig(): string {
  const yaml = configYaml();
  if (!yaml.includes(`default: ${MODEL}`)) throw new Error(`stack: the cookbook's hermes/config.yaml does not name ${MODEL} as its default model`);
  return yaml.replace(`default: ${MODEL}`, `default: ${PREVIOUS_MODEL}`);
}

// The start script, detached, its output in start.log; the world's environment (the proxy, the CA, the clock)
// is its environment, and the pinned Hermes is first on its PATH.
function start(): void {
  const bin = hermesBin();
  // The reporter's two dependencies, installed once beside it — from the real registry: the machine's tooling, outside the world's proxy.
  if (!existsSync(resolve(COOKBOOK, '.open-autonomy', 'node_modules'))) {
    const outside: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(https?_proxy|all_proxy|no_proxy|node_options|node_extra_ca_certs|ssl_cert_file|requests_ca_bundle|curl_ca_bundle)$/i.test(k)) outside[k] = v;
    timed("the reporter's dependencies", () => sh(['bun', 'install'], { cwd: resolve(COOKBOOK, '.open-autonomy'), env: outside, quiet: true }));
  }
  for (const f of ['agent.env', 'treasurer.env']) if (!existsSync(resolve(DATA, f))) throw new Error(`${resolve(DATA, f)} is missing — run \`bun world/run.ts seed\` first`);
  mkdirSync(stackDir, { recursive: true });
  // The agent's Discord: a bot token the twin accepts (a fake the twins mint) and its home channel, which the start
  // script writes into the home's .env on the first start. discord.py reaches the twin through the world's proxy
  // (HTTPS_PROXY, which Hermes's Discord platform honors) and the session CA.
  const botToken = sh(['bun', twinCli('world'), 'fake-env', 'DISCORD_BOT_TOKEN'], { quiet: true }).out.trim().replace(/^DISCORD_BOT_TOKEN=/, '');
  if (!botToken) throw new Error('stack: volter-world fake-env DISCORD_BOT_TOKEN gave nothing');
  // One appending descriptor for every process's output: separate opens would overwrite one another.
  const log = openSync(logFile, 'a');
  const child = Bun.spawn({
    // The valve on 18787/18788: the world's agent must sit beside a real one on the same host (an agent's own container).
    cmd: ['bun', resolve(COOKBOOK, '.open-autonomy', 'start.ts'), '--project', project, '--home', home, '--secrets', DATA, '--origin', `${need('GITHUB_TWIN_URL')}/${ACCOUNT}.git`, '--valve', String(VALVE_PORT)],
    // The channel is open to anyone in it; the repository's issues and discussions are the GitHub twin's, on a token
    // it accepts (the community tool's door: GITHUB_API_URL and GITHUB_TOKEN).
    cwd: COOKBOOK, env: { ...agentEnv(bin), DISCORD_BOT_TOKEN: botToken, DISCORD_HOME_CHANNEL: HOME_CHANNEL, DISCORD_ALLOWED_CHANNELS: '*', DISCORD_ALLOWED_USERS: '*', GITHUB_API_URL: need('GITHUB_TWIN_URL'), GITHUB_TOKEN: 'world-bot' }, stdout: log, stderr: log, stdin: 'ignore',
  });
  child.unref();
  writeFileSync(pidFile, `${child.pid}\n`);
}
function stop(): void {
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  if (pid) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ }
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) { try { process.kill(pid, 0); Bun.sleepSync(200); } catch { break; } }
  }
  rmSync(pidFile, { force: true });
}
// The gateway seeds its schedule as it boots; the stack is up once the board and the schedule exist.
function waitSchedule(): void {
  const bin = hermesBin();
  const deadline = Date.now() + 300_000;
  const booted = Date.now();
  for (;;) {
    const list = sh([resolve(bin, 'hermes'), 'cron', 'list'], { quiet: true, check: false, env: agentEnv(bin), cwd: existsSync(project) ? project : STATE }).out;
    if (/\bpm\b/.test(list)) break;
    if (existsSync(pidFile)) { try { process.kill(Number(readFileSync(pidFile, 'utf8').trim()), 0); } catch { throw new Error(`stack: the start script ended (${logFile})`); } }
    if (Date.now() > deadline) throw new Error(`stack: the gateway did not seed its schedule within five minutes (${logFile})`);
    Bun.sleepSync(2000);
  }
  console.log(`⏱ stack: gateway boot to schedule seeded: ${((Date.now() - booted) / 1000).toFixed(1)}s`);
}

async function up(): Promise<void> {
  await putMain('hermes/config.yaml', previousConfig(), `hermes/config.yaml: the model before the owner moves it (${PREVIOUS_MODEL})`);
  down(true);
  timed('start', () => start());
  waitSchedule();
  console.log(`stack: up — the board holds the seed tasks and its dispatcher is pulling them down; the PM job is seeded (\`bun world/run.ts hermes cron run pm\` fires its hour now). log: ${logFile}`);
}

// The owner moves the model: hermes/config.yaml on main now names the cookbook's model, the agent's checkout
// follows main, and the agent restarts the way an owner restarts it (the start script again: the home re-synced
// from the checkout, the gateway booted, its seed hook finding the board already filed); the next worker the
// board dispatches takes the model from it.
async function betweenTasks(): Promise<void> {
  await putMain('hermes/config.yaml', configYaml(), `hermes/config.yaml: model ${MODEL}`);
  await git(project, 'fetch', '-q', 'origin');
  await git(project, 'checkout', '-q', 'main');
  await git(project, 'reset', '-q', '--hard', 'origin/main');
  stop();
  timed('restart', () => start());
  waitSchedule();
  await rotateKey();
  console.log(`stack: the model moved to ${MODEL}; the next worker the board dispatches spends on it`);
}

// The owner rotates the key the adopter way (`bun .open-autonomy/mint-key.ts --rotate`), here with a five-second
// grace so the refusal is provable now. The valve re-reads the key file on its next request; the old key is
// listed with its shortened expiry, then refused.
async function rotateKey(): Promise<void> {
  const platform = need('PLATFORM_URL').replace(/\/$/, '');
  const file = resolve(DATA, 'agent.env');
  const before = /^OPEN_AUTONOMY_KEY=(.+)$/m.exec(readFileSync(file, 'utf8'))?.[1];
  if (!before) throw new Error(`stack: no key in ${file} to rotate`);
  const r = Bun.spawnSync({ cmd: ['bun', resolve(COOKBOOK, '.open-autonomy', 'mint-key.ts'), '--rotate', '--out', file, '--grace', '5'], cwd: COOKBOOK, env: { ...process.env, OPEN_AUTONOMY_URL: platform }, stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode !== 0) throw new Error(`stack: key rotation failed: ${r.stderr.toString().slice(-400)}`);
  const after = /^OPEN_AUTONOMY_KEY=(.+)$/m.exec(readFileSync(file, 'utf8'))?.[1];
  if (!after || after === before) throw new Error('stack: the key file was not rewritten with a new key');
  const api = (token: string, path: string) => fetch(`${platform}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const listed = await (await api(after, '/v1/keys')).json() as { keys?: Array<{ kid: string; exp: string }> };
  if ((listed.keys ?? []).length < 2) throw new Error(`stack: the registry does not list both keys after the rotation: ${JSON.stringify(listed).slice(0, 200)}`);
  const newKid = (JSON.parse(Buffer.from(after.split('.')[0], 'base64url').toString('utf8')) as { kid: string }).kid;
  let health = '';
  for (let i = 0; i < 20 && !health.includes(newKid); i++) { await Bun.sleep(500); health = await fetch(`http://127.0.0.1:${VALVE_PORT}/healthz`).then((h) => h.text()).catch(() => ''); }
  if (!health.includes(newKid)) throw new Error(`stack: the valve did not pick up the rotated key within ten seconds: ${health}`);
  await Bun.sleep(6500);
  if ((await api(before, '/v1/models')).status !== 401) throw new Error('stack: the old key still works after its grace');
  if ((await api(after, '/v1/models')).status !== 200) throw new Error('stack: the new key does not spend');
  console.log(`stack: key rotated (${newKid}); the valve took it unrestarted and the old key is refused after its grace`);
}

function down(purge: boolean): void {
  stop();
  if (purge) for (const d of [home, project]) rmSync(d, { recursive: true, force: true });
  console.log(`stack: down${purge ? ', the home and the checkout removed' : ''}`);
}

const [verb, ...rest] = process.argv.slice(2);
if (verb === 'up') await up();
else if (verb === 'down') down(rest.includes('--purge'));
else if (verb === 'between-tasks') await betweenTasks();
else if (verb === 'hermes') { const bin = hermesBin(); process.exit(Bun.spawnSync({ cmd: [resolve(bin, 'hermes'), ...rest], cwd: existsSync(project) ? project : STATE, env: agentEnv(bin), stdio: ['inherit', 'inherit', 'inherit'] }).exitCode); }
else { console.error('usage: stack.ts up | down [--purge] | between-tasks | hermes <args…>'); process.exit(2); }
