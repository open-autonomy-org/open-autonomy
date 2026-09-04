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
//
// The Docker host is the world's own (WORLD_DOCKER_CONTEXT, default colima-open-autonomy-world). Containers
// reach the host's services at host.docker.internal.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, COOKBOOK, COOKBOOK_NAME, DATA, HOME_CHANNEL, ROOT, agentEnv, need } from './lib.ts';

const context = process.env.WORLD_DOCKER_CONTEXT ?? 'colima-open-autonomy-world';
const profile = context.replace(/^colima-/, '');
const project = 'oa';
const stackDir = resolve(DATA, 'stack');
const compose = ['docker', '--context', context, 'compose', '-p', project, '-f', resolve(COOKBOOK, 'container/compose.yml'), '-f', resolve(ROOT, 'world/stack.override.yml')];
const twinsCli = resolve(process.env.TWINS_ROOT ?? resolve(ROOT, '..', '..', 'twin'), 'packages/twin/world-runtime/src/cli.ts');
const REFLECT_FRONT = 443;
const REFLECT_RESOLVER = 53;
const worldDir = resolve(DATA, 'stack', 'world');
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
  for (const host of ['discord.com', 'gateway.discord.gg']) sh(['bun', twinsCli, 'route', 'open-autonomy', 'add', host, '--root', ROOT], { quiet: true, check: false });
  const child = Bun.spawn({ cmd: ['bun', twinsCli, 'reflect', 'open-autonomy', '--target-ip', ip, '--resolver-ip', dnsIp, '--port', String(REFLECT_FRONT), '--resolver-port', String(REFLECT_RESOLVER), '--root', ROOT], cwd: ROOT, stdout: Bun.file(resolve(stackDir, 'reflect.log')), stderr: Bun.file(resolve(stackDir, 'reflect.log')), env: hostEnv() });
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

async function up(): Promise<void> {
  const github = need('GITHUB_TWIN_URL');
  const env = agentEnv();
  if (sh(['docker', 'context', 'inspect', context], { quiet: true, check: false }).code !== 0) {
    console.log(`stack: starting the world's Docker host (colima profile ${profile}, one-time)`);
    sh(['colima', 'start', profile, '--cpu', '4', '--memory', '6', '--disk', '20']);
  }
  // The pinned Hermes image, by the kit's own tool (copied from another Docker host on this machine when
  // one already built it, since the build is ten minutes).
  const pin = Object.fromEntries(readFileSync(resolve(COOKBOOK, 'container/hermes.pin'), 'utf8').split('\n').map((l) => l.trim().split('=') as [string, string]).filter(([k]) => k));
  const image = `hermes-agent:${pin.HERMES_TAG}`;
  if (docker('image', 'inspect', image).code !== 0) {
    const other = sh(['docker', 'context', 'ls', '-q'], { quiet: true }).out.split('\n').map((c) => c.trim()).filter((c) => c && c !== context)
      .find((c) => Bun.spawnSync({ cmd: ['docker', '--context', c, 'image', 'inspect', image], stdout: 'ignore', stderr: 'ignore' }).exitCode === 0);
    if (other) {
      console.log(`stack: copying ${image} from Docker host ${other}`);
      const r = Bun.spawnSync({ cmd: ['sh', '-c', `docker --context '${other}' save '${image}' | docker --context '${context}' load`], cwd: ROOT, stdout: 'inherit', stderr: 'inherit', env: hostEnv() });
      if (r.exitCode !== 0) throw new Error('image copy failed');
    } else {
      console.log(`stack: building ${image} (container/build-hermes.sh, ~10 minutes)`);
      sh(['sh', resolve(COOKBOOK, 'container/build-hermes.sh')], { env: { DOCKER_CONTEXT: context } });
    }
  }
  const ip = hostIp();
  // A previous stack's containers would keep the volumes pinned; take them down first.
  down(false);
  // The two volumes, as the adopter seeds them: the home from the cookbook's hermes/ (its .env points at
  // the valve and names the Discord bot — a fake token the twin accepts — and its home channel), the
  // checkout cloned from the project's origin, here the GitHub twin.
  mkdirSync(stackDir, { recursive: true });
  const botToken = sh(['bun', twinsCli, 'fake-env', 'DISCORD_BOT_TOKEN'], { quiet: true }).out.trim().replace(/^DISCORD_BOT_TOKEN=/, '');
  if (!botToken) throw new Error('stack: volter-world fake-env DISCORD_BOT_TOKEN gave nothing');
  for (const v of ['oa-home', 'oa-repo']) { sh(['docker', '--context', context, 'volume', 'rm', '-f', v], { quiet: true, check: false }); docker('volume', 'create', v); }
  sh(['docker', '--context', context, 'run', '--rm', '-v', 'oa-home:/opt/data', '-v', `${resolve(COOKBOOK, 'hermes')}:/src:ro`, 'alpine:3', 'sh', '-c',
    `cp -a /src/. /opt/data/ && printf 'OPEN_AUTONOMY_BASE_URL=http://valve:8787/v1\\nOPEN_AUTONOMY_KEY=valve\\nDISCORD_BOT_TOKEN=${botToken}\\nDISCORD_HOME_CHANNEL=${HOME_CHANNEL}\\n' > /opt/data/.env && chown -R ${uid}:${gid} /opt/data`], { quiet: true });
  sh(['docker', '--context', context, 'run', '--rm', '-v', 'oa-repo:/work', 'alpine/git:2.47.2', '-c', 'safe.directory=*', 'clone', '-q', `${forContainers(github)}/${ACCOUNT}.git`, '/work'], { quiet: true });
  sh(['docker', '--context', context, 'run', '--rm', '-v', 'oa-repo:/work', 'alpine:3', 'chown', '-R', `${uid}:${gid}`, '/work'], { quiet: true });
  // The key file the valve reads, with the platform's address as the container sees it.
  const secrets = resolve(stackDir, 'secrets');
  mkdirSync(secrets, { recursive: true });
  writeFileSync(resolve(secrets, 'agent.env'), `OPEN_AUTONOMY_BASE_URL=${forContainers(env.OPEN_AUTONOMY_BASE_URL!)}\nOPEN_AUTONOMY_KEY=${env.OPEN_AUTONOMY_KEY}\n`);
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
  const ca = readFileSync(resolve(ROOT, '.volter', 'worlds', 'open-autonomy', 'tls', 'ca-cert.pem'), 'utf8');
  // The agent image is built first (a build needs no world) so certifi's path can be read from it.
  sh([...compose, 'build', 'agent'], { env: { AGENT_SECRETS: secrets, WORLD_STACK_DIR: stackDir, WORLD_CERTIFI_PATH: '/dev/null', AGENT_UID: uid, AGENT_GID: gid } });
  const certifiPath = sh(['docker', '--context', context, 'run', '--rm', '--entrypoint', '/opt/hermes/.venv/bin/python', `${COOKBOOK_NAME}-agent:local`, '-c', 'import certifi; print(certifi.where())'], { quiet: true, check: false }).out.trim();
  if (!certifiPath.startsWith('/')) throw new Error('stack: cannot find certifi in the agent image');
  const bundle = sh(['docker', '--context', context, 'run', '--rm', '--entrypoint', 'cat', `${COOKBOOK_NAME}-agent:local`, certifiPath], { quiet: true }).out;
  writeFileSync(resolve(worldDir, 'ca-bundle.pem'), `${bundle.trimEnd()}\n${ca}`);
  // supercode with Hermes support is on its main branch, not yet released: the reporter runs a build from
  // the checkout beside the twins (SUPERCODE_ROOT, default ../../supercode), made once on the world's
  // Docker host for the image's Linux and kept under .volter.
  const supercodeBin = resolve(ROOT, '.volter', 'supercode-build', 'supercode');
  if (!existsSync(supercodeBin)) {
    const src = resolve(process.env.SUPERCODE_ROOT ?? resolve(ROOT, '..', '..', 'supercode'));
    if (!existsSync(resolve(src, 'crates', 'cli', 'Cargo.toml'))) throw new Error(`stack: no supercode checkout at ${src} (SUPERCODE_ROOT) to build the reporter's supercode from`);
    console.log('stack: building supercode from the checkout for the reporter (one-time, ~15 minutes)');
    mkdirSync(resolve(ROOT, '.volter', 'supercode-build'), { recursive: true });
    sh(['docker', '--context', context, 'run', '--rm', '-v', `${src}:/src:ro`, '-v', `${resolve(ROOT, '.volter', 'supercode-build')}:/out`, 'rust:1-bookworm', 'sh', '-c',
      'mkdir /build && tar -C /src --exclude=./target --exclude=./node_modules --exclude=./.git --exclude="*/node_modules" -cf - . | tar -C /build -xf - && cd /build && cargo build --release --bin supercode && cp target/release/supercode /out/supercode']);
  }
  writeFileSync(resolve(worldDir, 'supercode'), readFileSync(supercodeBin), { mode: 0o755 });
  const dnsIp = resolverIp();
  reflectUp(ip, dnsIp);
  // The stack, as the adopter starts it — attached: every container's DNS is the world's resolver and its
  // trust the session CA.
  sh(['bun', twinsCli, 'attach', 'open-autonomy', '--via', 'reflect', '--root', ROOT, '--', ...compose, 'up', '-d', '--build'], { env: { AGENT_SECRETS: secrets, WORLD_STACK_DIR: stackDir, WORLD_CERTIFI_PATH: certifiPath, AGENT_UID: uid, AGENT_GID: gid } });
  seal();
  // The gateway seeds its schedule as it boots; the clock is only worth advancing once the job exists.
  const deadline = Date.now() + 300_000;
  for (;;) {
    const list = sh(['docker', '--context', context, 'exec', '-u', uid, 'oa-agent', 'hermes', 'cron', 'list'], { quiet: true, check: false }).out;
    if (/build-roadmap/.test(list)) break;
    if (Date.now() > deadline) throw new Error('stack: the gateway did not seed its schedule within five minutes (docker logs oa-agent)');
    Bun.sleepSync(5000);
  }
  console.log(`stack: up on ${context} — the gateway carries the schedule (build-roadmap seeded); \`bun world/run.ts clock advance 360m\` brings its first fire forward`);
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
else { console.error('usage: stack.ts up | down [--purge] | seal | clock advance <N>(s|m|h|d)'); process.exit(2); }
