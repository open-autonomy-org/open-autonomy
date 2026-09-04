#!/usr/bin/env bun
// The cookbook's agent as the template runs it (bun world/run.ts stack up|down|clock): the adopter's own steps
// from template/README.md, performed against the world's Docker host, and nothing else. The stack is the
// product's compose file untouched — the gateway carries the schedule and fires the run itself; the world
// only seeds, waits and audits. What the world adds is stack.override.yml: its clock, reaching the container.
//
//   up     the Hermes image, the two volumes (home from the cookbook's hermes/, the clone from the twin),
//          the key file the sidecar reads, then `docker compose up -d --build`
//   down   `docker compose down`; with --purge the volumes too
//   clock advance <N>(s|m|h|d)   move the container's clock (the schedule is "every 360m" from boot)
//
// The Docker host is the world's own (WORLD_DOCKER_CONTEXT, default colima-open-autonomy-world): the compose
// file names its containers and volumes, so a host runs one agent — this VM is the world's, as the template
// says "a VM of its own is best". Containers reach the host's services at host.docker.internal.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, COOKBOOK, DATA, REPO, agentEnv, need } from './lib.ts';

const context = process.env.WORLD_DOCKER_CONTEXT ?? 'colima-open-autonomy-world';
const profile = context.replace(/^colima-/, '');
const project = 'oa';
const stackDir = resolve(DATA, 'stack');
const compose = ['docker', '--context', context, 'compose', '-p', project, '-f', resolve(REPO, 'template/container/compose.yml'), '-f', resolve(REPO, 'world/stack.override.yml')];
const uid = process.env.AGENT_UID ?? String(process.getuid?.() ?? 501);
const gid = process.env.AGENT_GID ?? String(process.getgid?.() ?? 20);

// Docker and colima are the machine's tooling, not the product under test: they run outside the world's
// proxy (image pulls and builds go to their registries), with the injector's NODE_OPTIONS dropped too.
const hostEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(https?_proxy|all_proxy|no_proxy|node_options|node_extra_ca_certs)$/i.test(k)) env[k] = v;
  return env;
};
function sh(cmd: string[], opts: { input?: string; quiet?: boolean; check?: boolean; env?: Record<string, string> } = {}): { code: number; out: string } {
  const r = Bun.spawnSync({ cmd, cwd: REPO, stdin: opts.input === undefined ? 'inherit' : new TextEncoder().encode(opts.input), stdout: 'pipe', stderr: opts.quiet ? 'pipe' : 'inherit', env: { ...hostEnv(), ...opts.env } });
  const out = r.stdout.toString();
  if (opts.check !== false && r.exitCode !== 0) throw new Error(`${cmd.slice(0, 4).join(' ')} … failed (${r.exitCode})${opts.quiet ? `\n${r.stderr.toString().slice(-800)}` : ''}`);
  return { code: r.exitCode, out };
}
const docker = (...args: string[]) => sh(['docker', '--context', context, ...args], { quiet: true });
// A container reaches the host's services (the platform, the GitHub twin) at host.docker.internal.
const forContainers = (url: string) => url.replace(/\/\/(127\.0\.0\.1|localhost)(?=[:/]|$)/, '//host.docker.internal');

async function up(): Promise<void> {
  const github = need('GITHUB_TWIN_URL');
  const env = agentEnv();
  // The Docker host: the world's own VM, started once and kept (like the twins checkout).
  if (sh(['docker', 'context', 'inspect', context], { quiet: true, check: false }).code !== 0) {
    console.log(`stack: starting the world's Docker host (colima profile ${profile}, one-time)`);
    sh(['colima', 'start', profile, '--cpu', '4', '--memory', '6', '--disk', '20']);
  }
  // The pinned Hermes image, by the template's own tool (copied from another Docker host on this machine
  // when one already built it — same tag, same digest — since the build is ten minutes).
  const pin = Object.fromEntries(readFileSync(resolve(REPO, 'template/container/hermes.pin'), 'utf8').split('\n').map((l) => l.trim().split('=') as [string, string]).filter(([k]) => k));
  const image = `hermes-agent:${pin.HERMES_TAG}`;
  if (docker('image', 'inspect', image).code !== 0) {
    const other = sh(['docker', 'context', 'ls', '-q'], { quiet: true }).out.split('\n').map((c) => c.trim()).filter((c) => c && c !== context)
      .find((c) => Bun.spawnSync({ cmd: ['docker', '--context', c, 'image', 'inspect', image], stdout: 'ignore', stderr: 'ignore' }).exitCode === 0);
    if (other) {
      console.log(`stack: copying ${image} from Docker host ${other}`);
      const r = Bun.spawnSync({ cmd: ['sh', '-c', `docker --context '${other}' save '${image}' | docker --context '${context}' load`], cwd: REPO, stdout: 'inherit', stderr: 'inherit', env: hostEnv() });
      if (r.exitCode !== 0) throw new Error('image copy failed');
    } else {
      console.log(`stack: building ${image} (template/container/build-hermes.sh, ~10 minutes)`);
      sh(['sh', resolve(REPO, 'template/container/build-hermes.sh')], { env: { DOCKER_CONTEXT: context } });
    }
  }
  // The two volumes, as the adopter seeds them: the home from the cookbook's hermes/ (its .env points at the
  // sidecar), the checkout cloned from the project's origin — here the GitHub twin.
  mkdirSync(stackDir, { recursive: true });
  for (const v of ['oa-home', 'oa-repo']) { sh(['docker', '--context', context, 'volume', 'rm', '-f', v], { quiet: true, check: false }); docker('volume', 'create', v); }
  sh(['docker', '--context', context, 'run', '--rm', '-v', 'oa-home:/opt/data', '-v', `${resolve(COOKBOOK, 'hermes')}:/src:ro`, 'alpine:3', 'sh', '-c',
    `cp -a /src/. /opt/data/ && printf 'OPEN_AUTONOMY_BASE_URL=http://sidecar:8787/v1\\nOPEN_AUTONOMY_KEY=sidecar\\n' > /opt/data/.env && chown -R ${uid}:${gid} /opt/data`], { quiet: true });
  sh(['docker', '--context', context, 'run', '--rm', '-v', 'oa-repo:/work', 'alpine/git:2.47.2', '-c', 'safe.directory=*', 'clone', '-q', `${forContainers(github)}/${ACCOUNT}.git`, '/work'], { quiet: true });
  sh(['docker', '--context', context, 'run', '--rm', '-v', 'oa-repo:/work', 'alpine:3', 'chown', '-R', `${uid}:${gid}`, '/work'], { quiet: true });
  // The key file the sidecar reads (template/README.md: ~/.config/open-autonomy/agent.env), with the
  // platform's address as the container sees it.
  const secrets = resolve(stackDir, 'secrets');
  mkdirSync(secrets, { recursive: true });
  writeFileSync(resolve(secrets, 'agent.env'), `OPEN_AUTONOMY_BASE_URL=${forContainers(env.OPEN_AUTONOMY_BASE_URL!)}\nOPEN_AUTONOMY_KEY=${env.OPEN_AUTONOMY_KEY}\n`);
  // The world's clock for the container: libfaketime (built once for the image's Debian, kept under .volter)
  // and the offset file, starting at zero.
  const faketime = resolve(stackDir, 'faketime');
  mkdirSync(faketime, { recursive: true });
  const lib = resolve(REPO, '.volter', 'faketime', 'libfaketime.so.1');
  if (!existsSync(lib)) {
    mkdirSync(resolve(REPO, '.volter', 'faketime'), { recursive: true });
    console.log('stack: building libfaketime for the image (one-time)');
    sh(['docker', '--context', context, 'run', '--rm', '-v', `${resolve(REPO, '.volter', 'faketime')}:/out`, 'debian:trixie-slim', 'sh', '-c',
      'apt-get update -qq >/dev/null && apt-get install -y -qq libfaketime >/dev/null 2>&1 && cp /usr/lib/*/faketime/libfaketime.so.1 /out/'], { quiet: true });
  }
  writeFileSync(resolve(faketime, 'libfaketime.so.1'), readFileSync(lib));
  writeFileSync(resolve(faketime, 'clock'), '+0\n');
  // The stack, as the adopter starts it.
  sh([...compose, 'up', '-d', '--build'], { env: { AGENT_SECRETS: secrets, WORLD_STACK_DIR: stackDir, AGENT_UID: uid, AGENT_GID: gid, TWINS_ROOT: process.env.TWINS_ROOT ?? resolve(REPO, '..', 'twin') } });
  seal();
  // The gateway seeds its schedule from cron/jobs.seed.json as it boots (the schedule-seed hook). Its first
  // fire is one interval after that, so the clock is only worth advancing once the job exists — the product's
  // own door says when: `hermes cron list` (template/README.md).
  const deadline = Date.now() + 300_000;
  for (;;) {
    const list = sh(['docker', '--context', context, 'exec', '-u', uid, 'oa-agent', 'hermes', 'cron', 'list'], { quiet: true, check: false }).out;
    if (/build-roadmap/.test(list)) break;
    if (Date.now() > deadline) throw new Error('stack: the gateway did not seed its schedule within five minutes (docker logs oa-agent)');
    Bun.sleepSync(5000);
  }
  console.log(`stack: up on ${context} — the gateway carries the schedule (build-roadmap seeded); \`bun world/run.ts clock advance 360m\` brings its first fire forward`);
}

// The seal: nothing leaves the world. On the world's Docker host, traffic off the stack's bridge may only
// go to the host (the platform and the twins, at host.docker.internal); every other destination is refused,
// not served — a public probe Hermes makes at boot fails the way a sealed world fails it. Container-to-
// container traffic never leaves the bridge and is untouched. The rule lives in a chain of its own, so
// re-applying it is idempotent and `down` can drop it.
function seal(): void {
  const netId = docker('network', 'inspect', `${project}_agent`, '--format', '{{.Id}}').out.trim();
  const bridge = `br-${netId.slice(0, 12)}`;
  const host = sh(['docker', '--context', context, 'run', '--rm', 'alpine:3', 'getent', 'hosts', 'host.docker.internal'], { quiet: true }).out.trim().split(/\s+/)[0];
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host ?? '')) throw new Error('stack: cannot resolve host.docker.internal from a container');
  const script = [
    'iptables -N OA_WORLD_SEAL 2>/dev/null || true',
    'iptables -F OA_WORLD_SEAL',
    `iptables -A OA_WORLD_SEAL -i ${bridge} ! -d ${host}/32 -j REJECT --reject-with icmp-port-unreachable`,
    'iptables -C DOCKER-USER -j OA_WORLD_SEAL 2>/dev/null || iptables -I DOCKER-USER 1 -j OA_WORLD_SEAL',
  ].join(' && ');
  sh(['colima', 'ssh', '-p', profile, '--', 'sudo', 'sh', '-c', script], { quiet: true });
  console.log(`stack: sealed — off ${bridge} only ${host} (the host's platform and twins) is reachable`);
}
function unseal(): void {
  sh(['colima', 'ssh', '-p', profile, '--', 'sudo', 'sh', '-c', 'iptables -D DOCKER-USER -j OA_WORLD_SEAL 2>/dev/null; iptables -F OA_WORLD_SEAL 2>/dev/null; iptables -X OA_WORLD_SEAL 2>/dev/null; true'], { quiet: true, check: false });
}

function down(purge: boolean): void {
  if (sh(['docker', 'context', 'inspect', context], { quiet: true, check: false }).code !== 0) return;
  unseal();
  sh([...compose, 'down', '--remove-orphans'], { env: { AGENT_SECRETS: resolve(stackDir, 'secrets'), WORLD_STACK_DIR: stackDir }, quiet: true, check: false });
  if (purge) for (const v of ['oa-home', 'oa-repo']) sh(['docker', '--context', context, 'volume', 'rm', '-f', v], { quiet: true, check: false });
  console.log(`stack: down${purge ? ', volumes removed' : ''}`);
}

function clockAdvance(spec: string): void {
  const m = /^(\d+)(s|m|h|d)$/.exec(spec);
  if (!m) throw new Error(`clock advance: ${JSON.stringify(spec)} is not <N>(s|m|h|d)`);
  const seconds = Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
  const file = resolve(stackDir, 'faketime', 'clock');
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
