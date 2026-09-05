#!/usr/bin/env bun
// The world's runner: down → up (twins, the platform, Actions; seed; the cookbook's stack) → wait → verify →
// down, one verb each. The world seeds and watches; the product runs itself: the board's dispatcher pulls the
// seeded tasks down one by one from the moment the stack is up.
//
//   bun world/run.ts up [--cookbook <name>]   # twins + the real platform + the Actions runner, seeded; then the
//                                             # cookbook's own container stack, as the kit runs it
//   bun world/run.ts probe             # the platform's own proof, no agent: the operator at its doors
//   bun world/run.ts env -- <cmd>      # run anything with the world's env (twin URLs, PLATFORM_URL)
//   bun world/run.ts clock advance 60m    # the container's clock: the hourly PM fires on its own
//   bun world/run.ts wait [--timeout s] [--pm]   # watch: the next task's session, its pull request merged on the twin, its
//                                             # review; --pm: the PM's session and report
//   bun world/run.ts verify            # audit the books, the twin's main, the project's check, the page
//   bun world/run.ts check [--cookbook <name>]   # the gate: up → probe → kit → wait → between-tasks → clock → wait → wait --pm → verify → down --purge
//   bun world/run.ts down [--purge]    # tear down (--purge: forget the books, the twin and the stack's volumes)
//
// --cookbook picks the project under test (default todo-cli; also WORLD_COOKBOOK). Its scenario is
// world/handlers/<cookbook>/gateway.ts printing the twin's JSON, and it is the whole model: nothing in the
// world calls a real API, ever. Needs the twins checkout (TWINS_ROOT, default ../twin).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NAME, ROOT, STATE } from './lib.ts';

const twins = resolve(process.env.TWINS_ROOT ?? resolve(ROOT, '..', 'twin'));
if (!existsSync(resolve(twins, 'packages/twin/world-runtime/src/cli.ts'))) { console.error(`world/run.ts: no twins checkout at ${twins} — set TWINS_ROOT`); process.exit(2); }
const cli = resolve(twins, 'packages/twin/world-runtime/src/cli.ts');

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const cookbook = flag('--cookbook') ?? process.env.WORLD_COOKBOOK ?? 'todo-cli';
if (!existsSync(resolve(ROOT, 'cookbooks', cookbook, 'hermes', 'kanban.seed.json'))) { console.error(`no cookbooks/${cookbook}/hermes/kanban.seed.json`); process.exit(2); }
process.env.WORLD_COOKBOOK = cookbook;

const generated = resolve(STATE, '.volter', 'generated');
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

// Every step reports how long it took, so the gate's cost stays visible: the loop itself is seconds.
const timed = <T>(label: string, fn: () => T): T => { const t0 = Date.now(); try { return fn(); } finally { console.log(`⏱ ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`); } };
function world(args: string[], opts: { check?: boolean } = { check: true }): number {
  const res = timed(`volter-world ${args[0]}`, () => Bun.spawnSync({ cmd: ['bun', cli, ...args], cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, TWINS_ROOT: twins } }));
  if (opts.check && res.exitCode !== 0) { console.error(`volter-world ${args[0]} failed (${res.exitCode})`); process.exit(res.exitCode || 1); }
  return res.exitCode;
}
const inWorld = (cmd: string[]) => world(['env', NAME, '--root', STATE, '--', 'env', `WORLD_COOKBOOK=${cookbook}`, ...cmd]);
const step = (name: string, ...args: string[]) => timed(`${name}${args.length ? ` ${args.join(' ')}` : ''}`, () => inWorld(['bun', resolve(ROOT, 'world', `${name}.ts`), ...args]));
const mode = process.env.WORLD_MODE ?? 'sealed';
const verb = argv.filter((a, i) => !a.startsWith('--') && a !== cookbook && argv[i - 1] !== '--timeout' && a !== '--pm')[0];
const rest = (() => { const i = argv.indexOf('--'); return i >= 0 ? argv.slice(i + 1) : []; })();
const hasStack = existsSync(resolve(ROOT, 'world', 'stack.ts'));
const stack = (...args: string[]) => (hasStack ? step('stack', ...args) : 0);
const stackDown = (purge: boolean) => { if (hasStack) Bun.spawnSync({ cmd: ['bun', resolve(ROOT, 'world', 'stack.ts'), 'down', ...(purge ? ['--purge'] : [])], cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, WORLD_COOKBOOK: cookbook } }); };
const purge = argv.includes('--purge');
const platformUrl = () => (readFileSync(envFile, 'utf8').match(/PLATFORM_URL=(\S+)/)?.[1] ?? '?').replace(/^'|'$/g, '');
switch (verb) {
  case 'up': {
    stackDown(true);
    world(['down', NAME, '--root', STATE], { check: false });
    world(['up', config, '--env-file', envFile, '--name', NAME, '--mode', mode, '--root', STATE]);
    step('seed');
    stack('up');
    console.log(`\nworld up, cookbook ${cookbook}: the board is working its seed tasks. platform: ${platformUrl()}\n  page: ${platformUrl()}/p/cookbook%2F${cookbook}\n  bun world/run.ts probe   # the platform's proof     wait     clock advance 60m     wait --pm     verify     down --purge`);
    break;
  }
  case 'seed': case 'probe': case 'kit': case 'verify': step(verb); break;
  case 'wait': step('wait', ...argv.filter((a, i) => a === '--timeout' || argv[i - 1] === '--timeout' || a === '--pm')); break;
  case 'stack': stack(...argv.slice(argv.indexOf('stack') + 1).filter((a) => a !== '--cookbook' && a !== cookbook)); break;
  case 'clock': stack('clock', ...argv.slice(argv.indexOf('clock') + 1).filter((a) => a !== '--cookbook' && a !== cookbook)); break;
  case 'env': inWorld(rest); break;
  case 'down': stackDown(purge); world(['down', NAME, '--root', STATE, ...(purge ? ['--purge'] : [])]); break;
  case 'check': {
    stackDown(true);
    world(['down', NAME, '--root', STATE, '--purge'], { check: false });
    world(['up', config, '--env-file', envFile, '--name', NAME, '--mode', mode, '--root', STATE]);
    let ok = false;
    try {
      step('seed'); step('probe'); step('kit');
      // The restart strands the worker the board had just dispatched; an hour on the clock expires its claim (the
      // dispatcher reruns the task on the new model) and fires the PM, whose session and report the audit expects.
      if (hasStack) { stack('up'); step('wait'); stack('between-tasks'); stack('clock', 'advance', '60m'); step('wait'); step('wait', '--pm'); step('verify'); }
      ok = true;
    } finally {
      if (ok || !process.env.WORLD_PRESERVE) { stackDown(true); world(['down', NAME, '--root', STATE, '--purge'], { check: false }); }
      else console.error('world kept for inspection: bun world/run.ts down --purge');
    }
    break;
  }
  default:
    console.error('usage: bun world/run.ts up | seed | probe | kit | stack up|down [--purge]|between-tasks | clock advance <N>(s|m|h|d) | wait [--timeout s] [--pm] | verify | check | down [--purge] | env -- <cmd>   [--cookbook <name>]');
    process.exit(2);
}
