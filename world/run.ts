#!/usr/bin/env bun
// The world's runner: up (twins, the real platform, Actions; the seed; the cookbook's stack) and down, one verb each.
// The world is an environment, not a test: the product runs itself in it — the board's dispatcher pulls the seeded
// tasks down from the moment the stack is up — and whoever drives it reads the product's own doors (its page, its
// books, its board, the twins' ledgers) one action at a time. Nothing here asserts; nothing runs unattended.
//
//   bun world/run.ts up [--cookbook <name>]   # twins + the real platform + the Actions runner, seeded; then the
//                                             # cookbook's agent, bare, as the kit starts it (.open-autonomy/start.ts)
//   bun world/run.ts env -- <cmd>      # run anything with the world's env (twin URLs, PLATFORM_URL)
//   bun world/run.ts hermes <args…>    # the pinned Hermes against the world's agent: kanban list, cron run pm
//   bun world/run.ts say <text…>       # a person speaks in the agent's channel on the Discord twin
//   bun world/run.ts down [--purge]    # tear down (--purge: forget the books, the twin and the stack's volumes)
//
// --cookbook picks the project under test (default todo-cli; also WORLD_COOKBOOK). Its scenario is
// world/handlers/<cookbook>/gateway.ts printing the twin's JSON, and it is the whole model: nothing in the
// world calls a real API, ever. The twins are the published packages in node_modules (TWINS_ROOT names a checkout instead).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NAME, ROOT, STATE, TWINS_ROOT, twinCli } from './lib.ts';

const cli = twinCli('world');
if (!existsSync(cli)) { console.error(`world/run.ts: no twins at ${cli} — bun install (or TWINS_ROOT for a checkout)`); process.exit(2); }

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
const r = Bun.spawnSync({ cmd: ['bun', handler], cwd: ROOT, stdout: 'pipe', stderr: 'inherit', env: { ...process.env, WORLD_PROJECT_DIR: resolve(STATE, '.volter', 'stack', 'project') } });
if (r.exitCode !== 0) { console.error(`world/handlers/${cookbook}/gateway.ts failed (${r.exitCode})`); process.exit(r.exitCode || 1); }
writeFileSync(scenario, r.stdout);
const portOffset = Number(process.env.WORLD_PORT_OFFSET ?? 0);
if (!Number.isInteger(portOffset) || portOffset < 0 || portOffset > 17000) throw new Error('WORLD_PORT_OFFSET must be an integer from 0 to 17000');
const worldConfig = JSON.parse(readFileSync(resolve(ROOT, 'world', 'world.json'), 'utf8')
  .replace(/\$\{TWIN:([a-z-]+)\}/g, (_, name: string) => twinCli(name)).replaceAll('${WORLD_DIR}', resolve(ROOT, 'world')).replaceAll('${SCENARIO}', scenario).replaceAll('${COOKBOOK}', cookbook));
for (const service of worldConfig.services) {
  service.port += portOffset;
  if (service.id === 'discord') service.env.TWIN_DISCORD_GATEWAY_URL = `ws://127.0.0.1:${service.port}/gateway`;
}
writeFileSync(config, JSON.stringify(worldConfig, null, 2));

// Every step reports how long it took, so the gate's cost stays visible: the loop itself is seconds.
const timed = <T>(label: string, fn: () => T): T => { const t0 = Date.now(); try { return fn(); } finally { console.log(`⏱ ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`); } };
function world(args: string[], opts: { check?: boolean } = { check: true }): number {
  const res = timed(`volter-world ${args[0]}`, () => Bun.spawnSync({ cmd: ['bun', cli, ...args], cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, ...(TWINS_ROOT ? { TWINS_ROOT } : {}) } }));
  if (opts.check && res.exitCode !== 0) { console.error(`volter-world ${args[0]} failed (${res.exitCode})`); process.exit(res.exitCode || 1); }
  return res.exitCode;
}
const inWorld = (cmd: string[]) => world(['attach', NAME, '--root', STATE, '--', 'env', `VOLTER_WORLD=${NAME}`, `WORLD_COOKBOOK=${cookbook}`, ...cmd]);
const step = (name: string, ...args: string[]) => timed(`${name}${args.length ? ` ${args.join(' ')}` : ''}`, () => inWorld(['bun', resolve(ROOT, 'world', `${name}.ts`), ...args]));
const mode = process.env.WORLD_MODE ?? 'sealed';
const verb = argv.filter((a, i) => !a.startsWith('--') && a !== cookbook && argv[i - 1] !== '--timeout')[0];
const rest = (() => { const i = argv.indexOf('--'); return i >= 0 ? argv.slice(i + 1) : []; })();
const hasStack = existsSync(resolve(ROOT, 'world', 'stack.ts'));
const stack = (...args: string[]) => (hasStack ? step('stack', ...args) : 0);
const stackDown = (purge: boolean) => { if (hasStack) Bun.spawnSync({ cmd: ['bun', resolve(ROOT, 'world', 'stack.ts'), 'down', ...(purge ? ['--purge'] : [])], cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, WORLD_COOKBOOK: cookbook } }); };
const purge = argv.includes('--purge');
const platformUrl = () => {
  const result = Bun.spawnSync({ cmd: ['bun', cli, 'url', NAME, 'platform', '--root', STATE], cwd: ROOT, stdout: 'pipe', stderr: 'inherit' });
  if (result.exitCode !== 0) throw new Error('world: cannot resolve the platform URL');
  return result.stdout.toString().trim();
};
switch (verb) {
  case 'up': {
    stackDown(true);
    world(['down', NAME, '--root', STATE], { check: false });
    world(['up', config, '--env-file', envFile, '--name', NAME, '--mode', mode, '--root', STATE]);
    step('seed');
    stack('up');
    world(['app-url', NAME, '--set', platformUrl(), '--root', STATE]);
    console.log(`\nworld up, cookbook ${cookbook}: the board is working its seed tasks. platform: ${platformUrl()}\n  page: ${platformUrl()}/p/cookbook%2F${cookbook}\n  bun world/run.ts hermes kanban list     hermes cron run pm (the PM's hour)     stack between-tasks     down --purge`);
    break;
  }
  case 'seed': step('seed'); break;
  case 'stack': stack(...argv.slice(argv.indexOf('stack') + 1).filter((a) => a !== '--cookbook' && a !== cookbook)); break;
  case 'hermes': process.exit(stack('hermes', ...argv.slice(argv.indexOf('hermes') + 1).filter((a) => a !== '--cookbook' && a !== cookbook))); break;
  case 'env': inWorld(rest); break;
  case 'say': inWorld(['bun', resolve(ROOT, 'world', 'say.ts'), ...argv.slice(argv.indexOf('say') + 1).filter((a) => a !== '--cookbook' && a !== cookbook)]); break;
  case 'down': stackDown(purge); world(['down', NAME, '--root', STATE, ...(purge ? ['--purge'] : [])]); break;
  default:
    console.error('usage: bun world/run.ts up | seed | stack up|down [--purge]|between-tasks | hermes <args…> | say <text…> | down [--purge] | env -- <cmd>   [--cookbook <name>]');
    process.exit(2);
}
