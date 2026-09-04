#!/usr/bin/env bun
// The world's runner: down → up (twins, the platform, Actions; seed; the cookbook's stack) → clock → wait →
// verify → down, one verb each. The world seeds and watches; the product runs itself.
//
//   bun world/run.ts up [--cookbook <name>]   # twins + the real platform + the Actions runner, seeded; then the
//                                             # cookbook's own container stack, as the kit runs it
//   bun world/run.ts probe             # the platform's own proof, no agent: the operator at its doors
//   bun world/run.ts env -- <cmd>      # run anything with the world's env (twin URLs, PLATFORM_URL)
//   bun world/run.ts clock advance 360m   # the container's clock: the schedule fires on its own
//   bun world/run.ts wait [--timeout s]   # watch: the run's session, then its pull request merged on the twin
//   bun world/run.ts verify            # audit the books, the twin's main, the project's check, the page
//   bun world/run.ts walk [--items N]  # N fires in a row
//   bun world/run.ts check [--cookbook <name>]   # the gate: up → clock → wait → verify → down --purge
//   bun world/run.ts down [--purge]    # tear down (--purge: forget the books, the twin and the stack's volumes)
//
// --cookbook picks the project under test (default todo-cli; also WORLD_COOKBOOK). Its scenario is
// world/handlers/<cookbook>/gateway.ts printing the twin's JSON, and it is the whole model: nothing in the
// world calls a real API, ever. Needs the twins checkout (TWINS_ROOT, default ../twin).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NAME, ROOT } from './lib.ts';

const twins = resolve(process.env.TWINS_ROOT ?? resolve(ROOT, '..', 'twin'));
if (!existsSync(resolve(twins, 'packages/twin/world-runtime/src/cli.ts'))) { console.error(`world/run.ts: no twins checkout at ${twins} — set TWINS_ROOT`); process.exit(2); }
const cli = resolve(twins, 'packages/twin/world-runtime/src/cli.ts');

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const cookbook = flag('--cookbook') ?? process.env.WORLD_COOKBOOK ?? 'todo-cli';
if (!existsSync(resolve(ROOT, 'cookbooks', cookbook, 'ROADMAP.yml'))) { console.error(`no cookbooks/${cookbook}/ROADMAP.yml`); process.exit(2); }
process.env.WORLD_COOKBOOK = cookbook;

const generated = resolve(ROOT, '.volter', 'generated');
const config = resolve(generated, 'world.config.json');
const envFile = resolve(generated, 'world.env');
const scenario = resolve(generated, `gateway.${cookbook}.json`);
mkdirSync(generated, { recursive: true });
const handler = resolve(ROOT, 'world', 'handlers', cookbook, 'gateway.ts');
if (!existsSync(handler)) { console.error(`no world/handlers/${cookbook}/gateway.ts: the cookbook has no scenario`); process.exit(2); }
const r = Bun.spawnSync({ cmd: ['bun', handler], cwd: ROOT, stdout: 'pipe', stderr: 'inherit' });
if (r.exitCode !== 0) { console.error(`world/handlers/${cookbook}/gateway.ts failed (${r.exitCode})`); process.exit(r.exitCode || 1); }
writeFileSync(scenario, r.stdout);
writeFileSync(config, readFileSync(resolve(ROOT, 'world', 'world.json'), 'utf8')
  .replaceAll('${TWINS_ROOT}', twins).replaceAll('${WORLD_DIR}', resolve(ROOT, 'world')).replaceAll('${SCENARIO}', scenario).replaceAll('${COOKBOOK}', cookbook));

function world(args: string[], opts: { check?: boolean } = { check: true }): number {
  const res = Bun.spawnSync({ cmd: ['bun', cli, ...args], cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, TWINS_ROOT: twins } });
  if (opts.check && res.exitCode !== 0) { console.error(`volter-world ${args[0]} failed (${res.exitCode})`); process.exit(res.exitCode || 1); }
  return res.exitCode;
}
const inWorld = (cmd: string[]) => world(['env', NAME, '--root', ROOT, '--', 'env', `WORLD_COOKBOOK=${cookbook}`, ...cmd]);
const step = (name: string, ...args: string[]) => inWorld(['bun', resolve(ROOT, 'world', `${name}.ts`), ...args]);
const mode = process.env.WORLD_MODE ?? 'sealed';
const verb = argv.filter((a, i) => !a.startsWith('--') && a !== cookbook && argv[i - 1] !== '--timeout' && argv[i - 1] !== '--items')[0];
const rest = (() => { const i = argv.indexOf('--'); return i >= 0 ? argv.slice(i + 1) : []; })();
const hasStack = existsSync(resolve(ROOT, 'world', 'stack.ts'));
const stack = (...args: string[]) => (hasStack ? step('stack', ...args) : 0);
const stackDown = (purge: boolean) => { if (hasStack) Bun.spawnSync({ cmd: ['bun', resolve(ROOT, 'world', 'stack.ts'), 'down', ...(purge ? ['--purge'] : [])], cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, WORLD_COOKBOOK: cookbook } }); };
const purge = argv.includes('--purge');
const platformUrl = () => (readFileSync(envFile, 'utf8').match(/PLATFORM_URL=(\S+)/)?.[1] ?? '?').replace(/^'|'$/g, '');
switch (verb) {
  case 'up': {
    stackDown(true);
    world(['down', NAME, '--root', ROOT], { check: false });
    world(['up', config, '--env-file', envFile, '--name', NAME, '--mode', mode, '--root', ROOT]);
    step('seed');
    stack('up');
    console.log(`\nworld up, cookbook ${cookbook}. platform: ${platformUrl()}\n  page: ${platformUrl()}/p/cookbook%2F${cookbook}\n  bun world/run.ts probe   # the platform's proof     clock advance 360m     wait     verify     down --purge`);
    break;
  }
  case 'seed': case 'probe': case 'verify': step(verb); break;
  case 'wait': step('wait', ...argv.filter((a, i) => a === '--timeout' || argv[i - 1] === '--timeout')); break;
  case 'walk': { const n = Number(flag('--items') ?? 1); for (let i = 1; i <= n; i++) { console.log(`\nwalk: fire ${i} of ${n}`); stack('clock', 'advance', '360m'); step('wait'); } break; }
  case 'stack': stack(...argv.slice(argv.indexOf('stack') + 1).filter((a) => a !== '--cookbook' && a !== cookbook)); break;
  case 'clock': stack('clock', ...argv.slice(argv.indexOf('clock') + 1).filter((a) => a !== '--cookbook' && a !== cookbook)); break;
  case 'env': inWorld(rest); break;
  case 'down': stackDown(purge); world(['down', NAME, '--root', ROOT, ...(purge ? ['--purge'] : [])]); break;
  case 'check': {
    stackDown(true);
    world(['down', NAME, '--root', ROOT, '--purge'], { check: false });
    world(['up', config, '--env-file', envFile, '--name', NAME, '--mode', mode, '--root', ROOT]);
    let ok = false;
    try {
      step('seed'); step('probe');
      if (hasStack) { stack('up'); stack('clock', 'advance', '360m'); step('wait'); step('verify'); }
      ok = true;
    } finally {
      if (ok || !process.env.WORLD_PRESERVE) { stackDown(true); world(['down', NAME, '--root', ROOT, '--purge'], { check: false }); }
      else console.error('world kept for inspection: bun world/run.ts down --purge');
    }
    break;
  }
  default:
    console.error('usage: bun world/run.ts up | seed | probe | stack up|down [--purge] | clock advance <N>(s|m|h|d) | wait [--timeout s] | walk [--items N] | verify | check | down [--purge] | env -- <cmd>   [--cookbook <name>]');
    process.exit(2);
}
