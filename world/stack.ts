#!/usr/bin/env bun
// The cookbook's stack as the kit runs it (bun world/run.ts stack up|down|clock): the adopter's own steps
// from container/README.md, performed against the world's Docker host, and nothing else. The compose file is
// the kit's untouched — the gateway carries the schedule and fires the run itself; the world only seeds,
// waits and audits. What the world adds is stack.override.yml: its clock, reaching the container.
//
//   up     the Hermes image, the two volumes (home from the cookbook's hermes/, the clone from the twin),
//          the key file the valve reads, then `docker compose up -d --build`
//   down   `docker compose down`; with --purge the volumes too
//   clock advance <N>(s|m|h|d)   move the container's clock (the schedule is "every 360m" from boot)
//   between-fires  what the owner does between two fires: the config on the twin's main moves from the
//          previous model to the cookbook's, the checkout follows, the stack restarts (the next worker spends on
//          it), and the key is rotated with a short grace (the valve picks the new key up unrestarted; the old
//          key is refused after its grace)
//
// The Docker host is the world's own (WORLD_DOCKER_CONTEXT, default colima-open-autonomy-world). Containers
// reach the host's services at host.docker.internal.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, COOKBOOK, COOKBOOK_NAME, DATA, HOME_CHANNEL, MODEL, PREVIOUS_MODEL, ROOT, WORK, agentEnv, git, need, STATE } from './lib.ts';

const context = process.env.WORLD_DOCKER_CONTEXT ?? 'colima-open-autonomy-world';
const profile = context.replace(/^colima-/, '');
const project = 'oa';
// What the containers mount (the secrets, the clock, the CA bundle) stays under the home directory: the world's
// Docker host mounts nothing outside it, whatever disk the rest of the state lives on.
const stackDir = resolve(ROOT, '.volter', 'stack');
const compose = ['docker', '--context', context, 'compose', '-p', project, '-f', resolve(COOKBOOK, 'container/compose.yml'), '-f', resolve(ROOT, 'world/stack.override.yml')];
const twinsCli = resolve(process.env.TWINS_ROOT ?? resolve(ROOT, '..', 'twin'), 'packages/twin/world-runtime/src/cli.ts');
const REFLECT_FRONT = 443;
const REFLECT_RESOLVER = 53;
const worldDir = resolve(stackDir, 'world');
const uid = process.env.AGENT_UID ?? String(process.getuid?.() ?? 501);
const gid = process.env.AGENT_GID ?? String(process.getgid?.() ?? 20);

// Docker and colima are the machine's tooling, not the product under test: they run outside the world's
// proxy (image pulls and builds go to their registries).
const hostEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(https?_proxy|all_proxy|no_proxy|node_options|node_extra_ca_certs)$/i.test(k)) env[k] = v;
  return env;
};
function sh(cmd: string[], opts: { input?: string; quiet?: boolean; check?: boolean; env?: Record<string, string> } = {}): { code: number; out: string } {
  const r = Bun.spawnSync({ cmd, cwd: ROOT, stdin: opts.input === undefined ? 'inherit' : new TextEncoder().encode(opts.input), stdout: 'pipe', stderr: opts.quiet ? 'pipe' : 'inherit', env: { ...hostEnv(), ...opts.env } });
  const out = r.stdout.toString();
  if (opts.check !== false && r.exitCode !== 0) throw new Error(`${cmd.slice(0, 4).join(' ')} … failed (${r.exitCode})${opts.quiet ? `\n${r.stderr.toString().slice(-800)}` : ''}`);
  return { code: r.exitCode, out };
}
const docker = (...args: string[]) => sh(['docker', '--context', context, ...args], { quiet: true });
const timed = <T>(label: string, fn: () => T): T => { const t0 = Date.now(); try { return fn(); } finally { console.log(`⏱ stack: ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`); } };
const forContainers = (url: string) => url.replace(/\/\/(127\.0\.0\.1|localhost)(?=[:/]|$)/, '//host.docker.internal');
function hostIp(): string {
  const ip = sh(['docker', '--context', context, 'run', '--rm', 'alpine:3', 'getent', 'hosts', 'host.docker.internal'], { quiet: true }).out.trim().split(/\s+/)[0];
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip ?? '')) throw new Error('stack: cannot resolve host.docker.internal from a container');
  return ip;
}
function resolverIp(): string {
  const iface = sh(['sh', '-c', "route -n get default 2>/dev/null | awk '/interface:/{print $2}'"], { quiet: true, check: false }).out.trim();
  const ip = iface ? sh(['ipconfig', 'getifaddr', iface], { quiet: true, check: false }).out.trim() : '';
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw new Error("stack: the host has no LAN address for the containers' DNS");
  return ip;
}
// The world's reflect front and resolver, for the vendor the agent's own HTTP client cannot be pointed
// elsewhere: discord.py. Routed hosts resolve to the host, whose :443 terminates TLS with the session CA.
function reflectUp(ip: string, dnsIp: string): void {
  reflectDown();
  for (const host of ['discord.com', 'gateway.discord.gg']) sh(['bun', twinsCli, 'route', 'open-autonomy', 'add', host, '--root', STATE], { quiet: true, check: false });
  const child = Bun.spawn({ cmd: ['bun', twinsCli, 'reflect', 'open-autonomy', '--target-ip', ip, '--resolver-ip', dnsIp, '--port', String(REFLECT_FRONT), '--resolver-port', String(REFLECT_RESOLVER), '--root', STATE], cwd: ROOT, stdout: Bun.file(resolve(stackDir, 'reflect.log')), stderr: Bun.file(resolve(stackDir, 'reflect.log')), env: hostEnv() });
  child.unref();
  writeFileSync(resolve(stackDir, 'reflect.pid'), `${child.pid}\n`);
  const deadline = Date.now() + 15_000;
  for (;;) {
    if (sh(['dig', '+short', '+time=1', '+tries=1', '@127.0.0.1', '-p', String(REFLECT_RESOLVER), 'discord.com'], { quiet: true, check: false }).out.trim() === ip) break;
    if (Date.now() > deadline) throw new Error(`stack: the reflect resolver did not answer within 15s (${resolve(stackDir, 'reflect.log')})`);
    Bun.sleepSync(500);
  }
  console.log(`stack: reflect up — the resolver at ${dnsIp}:${REFLECT_RESOLVER} answers discord.com with ${ip}, whose :${REFLECT_FRONT} hands it to the Discord twin`);
}
function reflectDown(): void {
  const pidFile = resolve(stackDir, 'reflect.pid');
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  if (pid) { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
  rmSync(pidFile, { force: true });
}

// A file on the twin's main, written the way an owner commits one: in the host checkout the seed made (WORK,
// on main), committed as the owner and pushed. The twin's git and its API then agree, which a contents-API
// write alone does not give the clone.
async function putMain(path: string, content: string, message: string): Promise<void> {
  await git(WORK, 'fetch', '-q', 'origin');
  await git(WORK, 'checkout', '-q', 'main');
  await git(WORK, 'reset', '-q', '--hard', 'origin/main');
  writeFileSync(resolve(WORK, path), content);
  await git(WORK, '-c', 'user.name=owner', '-c', 'user.email=owner@example.com', 'commit', '-q', '-am', message);
  await git(WORK, 'push', '-q', 'origin', 'main');
}
const configYaml = (): string => readFileSync(resolve(COOKBOOK, 'hermes', 'config.yaml'), 'utf8');
function previousConfig(): string {
  const yaml = configYaml();
  if (!yaml.includes(`default: ${MODEL}`)) throw new Error(`stack: the cookbook's hermes/config.yaml does not name ${MODEL} as its default model`);
  return yaml.replace(`default: ${MODEL}`, `default: ${PREVIOUS_MODEL}`);
}
// The gateway seeds its schedule as it boots; the clock is only worth advancing once the job exists.
function waitSchedule(): void {
  const deadline = Date.now() + 300_000;
  const booted = Date.now();
  for (;;) {
    const list = sh(['docker', '--context', context, 'exec', '-u', uid, 'oa-agent', 'hermes', 'cron', 'list'], { quiet: true, check: false }).out;
    if (/file-roadmap-item/.test(list)) break;
    if (Date.now() > deadline) throw new Error('stack: the gateway did not seed its schedule within five minutes (docker logs oa-agent)');
    Bun.sleepSync(2000);
  }
  console.log(`⏱ stack: gateway boot to schedule seeded: ${((Date.now() - booted) / 1000).toFixed(1)}s`);
}
const certifiIn = (image: string): string => {
  const p = sh(['docker', '--context', context, 'run', '--rm', '--entrypoint', '/opt/hermes/.venv/bin/python', image, '-c', 'import certifi; print(certifi.where())'], { quiet: true, check: false }).out.trim();
  if (!p.startsWith('/')) throw new Error('stack: cannot find certifi in the agent image');
  return p;
};
const composeEnv = (certifiPath: string) => ({ AGENT_SECRETS: resolve(stackDir, 'secrets'), WORLD_STACK_DIR: stackDir, WORLD_CERTIFI_PATH: certifiPath, AGENT_UID: uid, AGENT_GID: gid });

async function up(): Promise<void> {
  const github = need('GITHUB_TWIN_URL');
  await putMain('hermes/config.yaml', previousConfig(), `hermes/config.yaml: the model before the owner moves it (${PREVIOUS_MODEL})`);
  const env = agentEnv();
  if (sh(['docker', 'context', 'inspect', context], { quiet: true, check: false }).code !== 0) {
    console.log(`stack: starting the world's Docker host (colima profile ${profile}, one-time)`);
    sh(['colima', 'start', profile, '--cpu', '4', '--memory', '6', '--disk', '20']);
  }
  // The pinned Hermes image, by the kit's own tool (copied from another Docker host on this machine when
  // one already built it, since the build is ten minutes).
  const ip = hostIp();
  // A previous stack's containers would keep the volumes pinned; take them down first.
  down(false);
  mkdirSync(stackDir, { recursive: true });
  // The key file the valve reads, with the platform's address as the container sees it.
  const secrets = resolve(stackDir, 'secrets');
  mkdirSync(secrets, { recursive: true });
  writeFileSync(resolve(secrets, 'agent.env'), `OPEN_AUTONOMY_BASE_URL=${forContainers(env.OPEN_AUTONOMY_BASE_URL!)}\nOPEN_AUTONOMY_KEY=${env.OPEN_AUTONOMY_KEY}\n`);
  // The host, the adopter way: the kit's own setup tool makes the image and the two volumes — the home from the
  // cookbook's hermes/ (its .env names the Discord bot, a fake token the twin accepts, and its home channel),
  // the checkout cloned from the project's origin, here the GitHub twin — so what the world proves is what
  // an adopter runs.
  const botToken = sh(['bun', twinsCli, 'fake-env', 'DISCORD_BOT_TOKEN'], { quiet: true }).out.trim().replace(/^DISCORD_BOT_TOKEN=/, '');
  if (!botToken) throw new Error('stack: volter-world fake-env DISCORD_BOT_TOKEN gave nothing');
  timed('setup', () => sh(['bun', resolve(COOKBOOK, '.open-autonomy', 'setup.ts'), '--context', context, '--secrets', secrets, '--uid', uid, '--gid', gid, '--fresh',
    '--origin', `${github}/${ACCOUNT}.git`, '--origin-in-container', `${forContainers(github)}/${ACCOUNT}.git`,
    '--env', `DISCORD_BOT_TOKEN=${botToken}`, '--env', `DISCORD_HOME_CHANNEL=${HOME_CHANNEL}`]));
  // What the world mounts into the container (stack.override.yml): the clock — libfaketime, built once for
  // the image's Debian — and the session CA in Python's certifi bundle.
  mkdirSync(worldDir, { recursive: true });
  const lib = resolve(ROOT, '.volter', 'faketime', 'libfaketime.so.1');
  if (!existsSync(lib)) {
    mkdirSync(resolve(ROOT, '.volter', 'faketime'), { recursive: true });
    console.log('stack: building libfaketime for the image (one-time)');
    sh(['docker', '--context', context, 'run', '--rm', '-v', `${resolve(ROOT, '.volter', 'faketime')}:/out`, 'debian:trixie-slim', 'sh', '-c',
      'apt-get update -qq >/dev/null && apt-get install -y -qq libfaketime >/dev/null 2>&1 && cp /usr/lib/*/faketime/libfaketime.so.1 /out/'], { quiet: true });
  }
  writeFileSync(resolve(worldDir, 'libfaketime.so.1'), readFileSync(lib));
  writeFileSync(resolve(worldDir, 'clock'), '+0\n');
  const ca = readFileSync(resolve(STATE, '.volter', 'worlds', 'open-autonomy', 'tls', 'ca-cert.pem'), 'utf8');
  // The agent image is built first (a build needs no world) so certifi's path can be read from it.
  timed('agent image', () => sh([...compose, 'build', 'agent'], { env: { AGENT_SECRETS: secrets, WORLD_STACK_DIR: stackDir, WORLD_CERTIFI_PATH: '/dev/null', AGENT_UID: uid, AGENT_GID: gid } }));
  const certifiPath = certifiIn(`${COOKBOOK_NAME}-agent:local`);
  const bundle = sh(['docker', '--context', context, 'run', '--rm', '--entrypoint', 'cat', `${COOKBOOK_NAME}-agent:local`, certifiPath], { quiet: true }).out;
  writeFileSync(resolve(worldDir, 'ca-bundle.pem'), `${bundle.trimEnd()}\n${ca}`);
  const dnsIp = resolverIp();
  timed('reflect', () => reflectUp(ip, dnsIp));
  // The stack, as the adopter starts it — attached: every container's DNS is the world's resolver and its
  // trust the session CA.
  timed('compose up --build', () => sh(['bun', twinsCli, 'attach', 'open-autonomy', '--via', 'reflect', '--root', STATE, '--', ...compose, 'up', '-d', '--build'], { env: composeEnv(certifiPath) }));
  timed('seal', () => seal());
  waitSchedule();
  console.log(`stack: up on ${context} — the gateway carries the schedule (file-roadmap-item seeded) and the board's dispatcher; \`bun world/run.ts clock advance 360m\` brings its first fire forward`);
}

// The seal: off the stack's bridge only the host (the platform, the twins, the front, the resolver) is
// reachable; everything else is refused. Container-to-container traffic is untouched.
function seal(): void {
  const netId = docker('network', 'inspect', `${project}_agent`, '--format', '{{.Id}}').out.trim();
  const bridge = `br-${netId.slice(0, 12)}`;
  const dnsIp = resolverIp();
  const host = hostIp();
  const script = [
    'iptables -N OA_WORLD_SEAL 2>/dev/null || true',
    'iptables -F OA_WORLD_SEAL',
    `iptables -A OA_WORLD_SEAL -i ${bridge} -d ${host}/32 -j RETURN`,
    `iptables -A OA_WORLD_SEAL -i ${bridge} -d ${dnsIp}/32 -j RETURN`,
    `iptables -A OA_WORLD_SEAL -i ${bridge} -j REJECT --reject-with icmp-port-unreachable`,
    'iptables -C DOCKER-USER -j OA_WORLD_SEAL 2>/dev/null || iptables -I DOCKER-USER 1 -j OA_WORLD_SEAL',
  ].join(' && ');
  sh(['colima', 'ssh', '-p', profile, '--', 'sudo', 'sh', '-c', script], { quiet: true });
  console.log(`stack: sealed — off ${bridge} only the host (${host}; ${dnsIp}: the resolver) is reachable`);
}
function unseal(): void {
  sh(['colima', 'ssh', '-p', profile, '--', 'sudo', 'sh', '-c', 'iptables -D DOCKER-USER -j OA_WORLD_SEAL 2>/dev/null; iptables -F OA_WORLD_SEAL 2>/dev/null; iptables -X OA_WORLD_SEAL 2>/dev/null; iptables -t nat -D PREROUTING -j OA_WORLD_REFLECT 2>/dev/null; iptables -t nat -F OA_WORLD_REFLECT 2>/dev/null; iptables -t nat -X OA_WORLD_REFLECT 2>/dev/null; true'], { quiet: true, check: false });
}

// The owner moves the model: hermes/config.yaml on main now names the cookbook's model, the agent's checkout
// follows main, and the stack restarts the way an adopter restarts it (`docker compose up -d`): home-sync
// carries the config into the home and the gateway boots; the next task's worker takes the model from it.
async function betweenFires(): Promise<void> {
  await putMain('hermes/config.yaml', configYaml(), `hermes/config.yaml: model ${MODEL}`);
  sh(['docker', '--context', context, 'exec', '-u', uid, 'oa-agent', 'sh', '-c', 'cd /work/project && git fetch -q origin && git checkout -q main && git reset -q --hard origin/main'], { quiet: true });
  timed('compose up (restart)', () => sh(['bun', twinsCli, 'attach', 'open-autonomy', '--via', 'reflect', '--root', STATE, '--', ...compose, 'up', '-d', '--force-recreate', 'home-sync', 'agent'], { env: composeEnv(certifiIn(`${COOKBOOK_NAME}-agent:local`)) }));
  waitSchedule();
  await rotateKey();
  console.log(`stack: the model moved to ${MODEL} and the schedule followed; \`bun world/run.ts clock advance 360m\` brings the next fire forward`);
}

// The owner rotates the key the adopter way (`bun .open-autonomy/mint-key.ts --rotate`), here with a five-second
// grace so the refusal is provable now. The valve re-reads the mounted key file on its next request; the old key
// is listed with its shortened expiry, then refused.
async function rotateKey(): Promise<void> {
  const platform = need('PLATFORM_URL').replace(/\/$/, '');
  const file = resolve(stackDir, 'secrets', 'agent.env');
  const before = /^OPEN_AUTONOMY_KEY=(.+)$/m.exec(readFileSync(file, 'utf8'))?.[1];
  if (!before) throw new Error(`stack: no key in ${file} to rotate`);
  const r = Bun.spawnSync({ cmd: ['bun', resolve(COOKBOOK, '.open-autonomy', 'mint-key.ts'), '--rotate', '--out', file, '--grace', '5'], cwd: COOKBOOK, env: { ...process.env, OPEN_AUTONOMY_URL: platform }, stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode !== 0) throw new Error(`stack: key rotation failed: ${r.stderr.toString().slice(-400)}`);
  // The tool writes the platform's address as it reached it (the host's); the valve reads the file from inside
  // the stack, so the address is rewritten as the containers see it — the same file, the same inode.
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^OPEN_AUTONOMY_BASE_URL=.*$/m, `OPEN_AUTONOMY_BASE_URL=${forContainers(platform)}/v1`));
  const after = /^OPEN_AUTONOMY_KEY=(.+)$/m.exec(readFileSync(file, 'utf8'))?.[1];
  if (!after || after === before) throw new Error('stack: the key file was not rewritten with a new key');
  const api = (token: string, path: string) => fetch(`${platform}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const listed = await (await api(after, '/v1/keys')).json() as { keys?: Array<{ kid: string; exp: string }> };
  if ((listed.keys ?? []).length < 2) throw new Error(`stack: the registry does not list both keys after the rotation: ${JSON.stringify(listed).slice(0, 200)}`);
  // The valve sees the new key without a restart: its health line names the new key.
  const newKid = (JSON.parse(Buffer.from(after.split('.')[0], 'base64url').toString('utf8')) as { kid: string }).kid;
  // The mounted file's new bytes reach the container within moments; the valve reads them on its next request.
  let health = '';
  for (let i = 0; i < 20 && !health.includes(newKid); i++) {
    await Bun.sleep(500);
    health = sh(['docker', '--context', context, 'exec', '-u', uid, 'oa-agent', 'curl', '-s', 'http://valve:8787/healthz'], { quiet: true, check: false }).out;
  }
  if (!health.includes(newKid)) throw new Error(`stack: the valve did not pick up the rotated key within ten seconds: ${health}`);
  await Bun.sleep(6500);
  if ((await api(before, '/v1/models')).status !== 401) throw new Error('stack: the old key still works after its grace');
  if ((await api(after, '/v1/models')).status !== 200) throw new Error('stack: the new key does not spend');
  console.log(`stack: key rotated (${newKid}); the valve took it unrestarted and the old key is refused after its grace`);
}

function down(purge: boolean): void {
  if (sh(['docker', 'context', 'inspect', context], { quiet: true, check: false }).code !== 0) return;
  unseal();
  reflectDown();
  sh([...compose, 'down', '--remove-orphans'], { env: { AGENT_SECRETS: resolve(stackDir, 'secrets'), WORLD_STACK_DIR: stackDir, WORLD_CERTIFI_PATH: '/dev/null' }, quiet: true, check: false });
  if (purge) for (const v of ['oa-home', 'oa-repo']) sh(['docker', '--context', context, 'volume', 'rm', '-f', v], { quiet: true, check: false });
  console.log(`stack: down${purge ? ', volumes removed' : ''}`);
}

function clockAdvance(spec: string): void {
  const m = /^(\d+)(s|m|h|d)$/.exec(spec);
  if (!m) throw new Error(`clock advance: ${JSON.stringify(spec)} is not <N>(s|m|h|d)`);
  const seconds = Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
  const file = resolve(worldDir, 'clock');
  const current = existsSync(file) ? Number(readFileSync(file, 'utf8').trim()) : 0;
  writeFileSync(file, `+${current + seconds}\n`);
  console.log(`clock: the container is now ${(current + seconds) / 3600} hours ahead`);
}

const [verb, ...rest] = process.argv.slice(2);
if (verb === 'up') await up();
else if (verb === 'down') down(rest.includes('--purge'));
else if (verb === 'clock' && rest[0] === 'advance' && rest[1]) clockAdvance(rest[1]);
else if (verb === 'seal') seal();
else if (verb === 'between-fires') await betweenFires();
else { console.error('usage: stack.ts up | down [--purge] | seal | between-fires | clock advance <N>(s|m|h|d)'); process.exit(2); }
