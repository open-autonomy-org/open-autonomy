#!/usr/bin/env bun
// The world's runner: the canonical down → up → seed → (agent) → land → verify → down, one verb each.
//
//   bun world/run.ts up [--cookbook <name>]    # twins + the real platform, seeded with the cookbook
//   bun world/run.ts env -- <cmd>      # run anything with the world's env (twin URLs, PLATFORM_URL, the proxy + CA)
//   bun world/run.ts agent             # one build-roadmap run of the real Hermes on the cookbook (repeat at will)
//   bun world/run.ts land              # our landing rule by hand: check each agent/* branch, merge the green ones
//   bun world/run.ts verify            # audit the books, the twin's main, the project's check, the page
//   bun world/run.ts check [--cookbook <name>]   # the gate: up → seed → agent → land → verify → down --purge
//   bun world/run.ts down [--purge]    # tear down (--purge: forget the books and twin state too)
//
// --cookbook picks the project under test (default hello-roadmap; also WORLD_COOKBOOK). Its scenario is
// world/handlers/<cookbook>/gateway.json, or gateway.ts printing that JSON, and it is the whole model: nothing
// in the world calls a real API, ever. Repeating `agent` walks the cookbook's roadmap down, one item per run.
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

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const cookbook = flag('--cookbook') ?? process.env.WORLD_COOKBOOK ?? 'hello-roadmap';
if (!existsSync(resolve(REPO, 'cookbook', cookbook, 'ROADMAP.yml'))) { console.error(`no cookbook/${cookbook}/ROADMAP.yml`); process.exit(2); }
process.env.WORLD_COOKBOOK = cookbook;

// The generated world: real paths in the config, and the cookbook's scenario as one JSON file for the twin.
const generated = resolve(REPO, '.volter', 'generated');
const config = resolve(generated, 'world.config.json');
const envFile = resolve(generated, 'world.env');
const scenario = resolve(generated, `gateway.${cookbook}.json`);
mkdirSync(generated, { recursive: true });
const handlers = resolve(REPO, 'world', 'handlers', cookbook);
if (existsSync(resolve(handlers, 'gateway.ts'))) {
  const r = Bun.spawnSync({ cmd: ['bun', resolve(handlers, 'gateway.ts')], cwd: REPO, stdout: 'pipe', stderr: 'inherit' });
  if (r.exitCode !== 0) { console.error(`world/handlers/${cookbook}/gateway.ts failed (${r.exitCode})`); process.exit(r.exitCode || 1); }
  writeFileSync(scenario, r.stdout);
} else if (existsSync(resolve(handlers, 'gateway.json'))) {
  writeFileSync(scenario, readFileSync(resolve(handlers, 'gateway.json')));
} else { console.error(`no world/handlers/${cookbook}/gateway.json (or gateway.ts): the cookbook has no scenario`); process.exit(2); }
writeFileSync(config, readFileSync(resolve(REPO, 'world', 'world.json'), 'utf8')
  .replaceAll('${TWINS_ROOT}', twins).replaceAll('${WORLD_DIR}', resolve(REPO, 'world')).replaceAll('${SCENARIO}', scenario));

function world(args: string[], opts: { check?: boolean } = { check: true }): number {
  const r = Bun.spawnSync({ cmd: ['bun', cli, ...args], cwd: REPO, stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, TWINS_ROOT: twins } });
  if (opts.check && r.exitCode !== 0) { console.error(`volter-world ${args[0]} failed (${r.exitCode})`); process.exit(r.exitCode || 1); }
  return r.exitCode;
}
const inWorld = (cmd: string[]) => world(['env', NAME, '--root', REPO, '--', 'env', `WORLD_COOKBOOK=${cookbook}`, ...cmd]);
const step = (name: string) => inWorld(['bun', resolve(REPO, 'world', `${name}.ts`)]);
const mode = process.env.WORLD_MODE ?? 'sealed';
const verb = argv.filter((a) => !a.startsWith('--') && a !== cookbook)[0];
const rest = (() => { const i = argv.indexOf('--'); return i >= 0 ? argv.slice(i + 1) : []; })();
switch (verb) {
  case 'up': {
    world(['down', NAME, '--root', REPO], { check: false });
    world(['up', config, '--env-file', envFile, '--name', NAME, '--mode', mode, '--root', REPO]);
    step('seed');
    const platformUrl = (readFileSync(envFile, 'utf8').match(/PLATFORM_URL=(\S+)/)?.[1] ?? '?').replace(/^'|'$/g, '');
    console.log(`\nworld up, cookbook ${cookbook}. platform: ${platformUrl}\n  pages: ${platformUrl}/p/cookbook%2F${cookbook}   ${platformUrl}/p/open-autonomy-org%2Fopen-autonomy\n  bun world/run.ts agent --cookbook ${cookbook}   # one run     land   # merge the green branches     verify     down --purge`);
    break;
  }
  case 'seed': case 'agent': case 'land': case 'verify': step(verb); break;
  case 'env': inWorld(rest); break;
  case 'down': world(['down', NAME, '--root', REPO, ...rest]); break;
  case 'check': {
    world(['down', NAME, '--root', REPO, '--purge'], { check: false });
    world(['up', config, '--env-file', envFile, '--name', NAME, '--mode', mode, '--root', REPO]);
    let ok = false;
    try { step('seed'); step('agent'); step('land'); step('verify'); ok = true; }
    finally { if (ok || !process.env.WORLD_PRESERVE) world(['down', NAME, '--root', REPO, '--purge'], { check: false }); else console.error(`world kept for inspection: bun world/run.ts down --purge`); }
    break;
  }
  default:
    console.error('usage: bun world/run.ts up | seed | agent | land | verify | check | down [--purge] | env -- <cmd>   [--cookbook <name>]');
    process.exit(2);
}
