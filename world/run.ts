#!/usr/bin/env bun
// The world's runner: the canonical down → up → seed → (agent) → verify → down, one verb each.
//
//   bun world/run.ts up            # bring the world up (twins + the real platform) and seed it
//   bun world/run.ts env -- <cmd>  # run anything with the world's env (twin URLs, PLATFORM_URL, the proxy + CA)
//   bun world/run.ts agent         # one build-roadmap run of the real Hermes against the world
//   bun world/run.ts verify        # audit the books and the GitHub twin after a run
//   bun world/run.ts check         # the gate: up → seed → agent → verify → down --purge
//   bun world/run.ts down          # tear down (--purge: forget the books and twin state too)
//
// Needs the twins checkout (TWINS_ROOT, default ../twin) until the packages are published; then this file
// shrinks to `volter-world` calls. world/world.json is the committed logical config; the generated copy with
// real paths lives under .volter/ (ignored), per the twins repo's migration guide.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NAME, REPO } from './lib.ts';

const twins = resolve(process.env.TWINS_ROOT ?? resolve(REPO, '..', 'twin'));
if (!existsSync(resolve(twins, 'packages/twin/world-runtime/src/cli.ts'))) {
  console.error(`world/run.ts: no twins checkout at ${twins} — set TWINS_ROOT`);
  process.exit(2);
}
const cli = resolve(twins, 'packages/twin/world-runtime/src/cli.ts');
const generated = resolve(REPO, '.volter', 'generated');
const config = resolve(generated, 'world.config.json');
const envFile = resolve(generated, 'world.env');
mkdirSync(generated, { recursive: true });
writeFileSync(config, readFileSync(resolve(REPO, 'world', 'world.json'), 'utf8').replaceAll('${TWINS_ROOT}', twins).replaceAll('${WORLD_DIR}', resolve(REPO, 'world')));

function world(args: string[], opts: { check?: boolean } = { check: true }): number {
  const r = Bun.spawnSync({ cmd: ['bun', cli, ...args], cwd: REPO, stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, TWINS_ROOT: twins } });
  if (opts.check && r.exitCode !== 0) { console.error(`volter-world ${args[0]} failed (${r.exitCode})`); process.exit(r.exitCode || 1); }
  return r.exitCode;
}
const inWorld = (cmd: string[]) => world(['env', NAME, '--root', REPO, '--', ...cmd]);
const step = (name: string) => inWorld(['bun', resolve(REPO, 'world', `${name}.ts`)]);

const verb = process.argv[2];
const rest = process.argv.slice(3);
switch (verb) {
  case 'up':
    world(['down', NAME, '--root', REPO], { check: false });
    world(['up', config, '--env-file', envFile, '--name', NAME, '--mode', process.env.WORLD_MODE ?? 'sealed', '--root', REPO]);
    step('seed');
    console.log(`\nworld up. platform: ${readFileSync(envFile, 'utf8').match(/PLATFORM_URL=(\S+)/)?.[1] ?? '?'}   (bun world/run.ts env -- <cmd> | agent | verify | down)`);
    break;
  case 'seed': case 'agent': case 'verify': step(verb); break;
  case 'env': inWorld(rest[0] === '--' ? rest.slice(1) : rest); break;
  case 'down': world(['down', NAME, '--root', REPO, ...rest]); break;
  case 'check': {
    world(['down', NAME, '--root', REPO, '--purge'], { check: false });
    world(['up', config, '--env-file', envFile, '--name', NAME, '--mode', 'sealed', '--root', REPO]);
    let ok = false;
    try { step('seed'); step('agent'); step('verify'); ok = true; }
    finally { if (ok || !process.env.WORLD_PRESERVE) world(['down', NAME, '--root', REPO, '--purge'], { check: false }); else console.error(`world kept for inspection: bun world/run.ts down --purge`); }
    break;
  }
  default:
    console.error('usage: bun world/run.ts up | seed | agent | verify | check | down [--purge] | env -- <cmd>');
    process.exit(2);
}
