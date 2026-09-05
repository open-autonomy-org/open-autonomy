#!/usr/bin/env bun
// The host, set up by one command, idempotently: what container/README.md asks of the owner before
// `docker compose up`, done or found done, and what it cannot do said plainly. Safe to run again.
//
//   bun .open-autonomy/setup.ts [--context <docker context>] [--secrets <dir>] [--origin <url>]
//                               [--origin-in-container <url>] [--env KEY=VALUE ...] [--uid N --gid N] [--fresh]
//
//   1. the key file  <secrets>/agent.env (default ~/.config/open-autonomy), from mint-key.ts — found or named
//   2. the image     hermes-agent:<tag> from container/hermes.pin — present, copied from another Docker host
//                    that has it, or built (container/build-hermes.sh, ~10 minutes)
//   3. the volumes   oa-home from hermes/ (its .env: the valve's address, the dummy key, every --env), oa-repo
//                    a clone of --origin (default: this repository's origin, cloned with your own git and
//                    keys); --fresh recreates both
//   4. what is yours the deploy key and the ssh-agent that forwards it, the Discord token; then compose up
//
// The world's stack step calls this same file, so what an adopter runs and what the world proves never drift.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const here = resolve(import.meta.dir, '..');
const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const args = (name: string): string[] => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
const context = arg('--context') ?? process.env.DOCKER_CONTEXT;
const secrets = resolve(arg('--secrets') ?? join(homedir(), '.config', 'open-autonomy'));
const uid = arg('--uid') ?? String(process.getuid?.() ?? 501);
const gid = arg('--gid') ?? String(process.getgid?.() ?? 20);
const fresh = argv.includes('--fresh');
const docker = ['docker', ...(context ? ['--context', context] : [])];
const say = (m: string) => console.log(`setup: ${m}`);
const run = (cmd: string[], opts: { quiet?: boolean; check?: boolean; env?: Record<string, string>; cwd?: string } = {}) => {
  const r = Bun.spawnSync({ cmd, cwd: opts.cwd ?? here, stdout: 'pipe', stderr: opts.quiet ? 'pipe' : 'inherit', env: { ...process.env, ...opts.env } });
  if (opts.check !== false && r.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(' ')} … failed (${r.exitCode})${opts.quiet ? `\n${r.stderr.toString().slice(-600)}` : ''}`);
  return { code: r.exitCode, out: r.stdout.toString() };
};
const todo: string[] = [];

// 1. The key file.
const keyFile = join(secrets, 'agent.env');
const token = existsSync(keyFile) ? /^OPEN_AUTONOMY_KEY=(.+)$/m.exec(readFileSync(keyFile, 'utf8'))?.[1] : undefined;
if (token) {
  try { const c = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')) as { kid?: string; exp?: string }; say(`key: ${c.kid} in ${keyFile}, expires ${c.exp}`); } catch { say(`key: present in ${keyFile}`); }
} else {
  say(`no key in ${keyFile}`);
  todo.push(`mint the key: bun .open-autonomy/mint-key.ts${secrets === join(homedir(), '.config', 'open-autonomy') ? '' : ` --out ${keyFile}`}`);
}

// 2. The image.
const pin = Object.fromEntries(readFileSync(join(here, 'container', 'hermes.pin'), 'utf8').split('\n').map((l) => l.trim().split('=') as [string, string]).filter(([k]) => k && !k.startsWith('#')));
const image = `hermes-agent:${pin.HERMES_TAG}`;
if (run([...docker, 'image', 'inspect', image], { quiet: true, check: false }).code === 0) say(`image: ${image} present`);
else {
  const other = run(['docker', 'context', 'ls', '-q'], { quiet: true }).out.split('\n').map((c) => c.trim()).filter((c) => c && c !== context)
    .find((c) => run(['docker', '--context', c, 'image', 'inspect', image], { quiet: true, check: false }).code === 0);
  if (other) { say(`image: copying ${image} from Docker host ${other}`); run(['sh', '-c', `docker --context '${other}' save '${image}' | ${docker.join(' ')} load`]); }
  else { say(`image: building ${image} (container/build-hermes.sh, ~10 minutes)`); run(['sh', join(here, 'container', 'build-hermes.sh')], { env: context ? { DOCKER_CONTEXT: context } : {} }); }
}

// 3. The volumes.
const have = (v: string) => run([...docker, 'volume', 'inspect', v], { quiet: true, check: false }).code === 0;
if (fresh) for (const v of ['oa-home', 'oa-repo']) run([...docker, 'volume', 'rm', '-f', v], { quiet: true, check: false });
if (have('oa-home') && have('oa-repo')) say('volumes: oa-home and oa-repo present (compose re-syncs the home from hermes/ on every start; --fresh recreates both)');
else {
  const origin = arg('--origin') ?? run(['git', 'remote', 'get-url', 'origin'], { quiet: true }).out.trim();
  const originInside = arg('--origin-in-container') ?? origin;
  for (const v of ['oa-home', 'oa-repo']) if (!have(v)) run([...docker, 'volume', 'create', v], { quiet: true });
  const env = [`OPEN_AUTONOMY_BASE_URL=http://valve:8787/v1`, `OPEN_AUTONOMY_KEY=valve`, ...args('--env')];
  run([...docker, 'run', '--rm', '-v', 'oa-home:/opt/data', '-v', `${join(here, 'hermes')}:/src:ro`, 'alpine:3', 'sh', '-c',
    `cp -a /src/. /opt/data/ && printf '%s\\n' ${env.map((e) => `'${e.replace(/'/g, "'\\''")}'`).join(' ')} > /opt/data/.env && chown -R ${uid}:${gid} /opt/data`], { quiet: true });
  say(`home: oa-home seeded from hermes/ (.env: the valve's address, the dummy key${args('--env').length ? `, ${args('--env').map((e) => e.split('=')[0]).join(', ')}` : ''})`);
  // The clone is made on the host with your own git (and so your own keys), then carried into the volume.
  const tmp = mkdtempSync(join(tmpdir(), 'oa-setup-'));
  try {
    run(['git', 'clone', '-q', origin, join(tmp, 'repo')], { quiet: true });
    if (originInside !== origin) run(['git', '-C', join(tmp, 'repo'), 'remote', 'set-url', 'origin', originInside], { quiet: true });
    run([...docker, 'run', '--rm', '-v', 'oa-repo:/work', '-v', `${join(tmp, 'repo')}:/src:ro`, 'alpine:3', 'sh', '-c', `cp -a /src/. /work/ && chown -R ${uid}:${gid} /work`], { quiet: true });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  say(`repo: oa-repo cloned from ${origin}${originInside !== origin ? ` (origin inside the container: ${originInside})` : ''}`);
}

// 4. What is the owner's, and what is next.
say('yours: the deploy key and the ssh-agent that forwards it into the Docker host (container/README.md), and the Discord bot token if you deliver there');
for (const t of todo) say(`next: ${t}`);
say(`next: AGENT_SECRETS=${secrets} ${docker.join(' ')} compose -f container/compose.yml up -d --build`);
