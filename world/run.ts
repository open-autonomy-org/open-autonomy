#!/usr/bin/env bun
// The world: Open Autonomy's own rehearsal, which is the kit's rehearsal with a cookbook as the project. Each cookbook
// keeps its own (`cookbooks/<name>/rehearsal/`: the world's definition with the platform built from this tree on the
// twins, the scripted brain, the stories, the hooks) and carries the kit's engine (`.open-autonomy/rehearsal/`, kept
// current by the kit). This front runs that engine in the cookbook, with the platform from this checkout.
//
//   bun world/run.ts up [--cookbook <name>]   # twins + the platform from this tree + the Actions runner, seeded; then the
//                                             # cookbook's brain, bare, as the kit starts it (.open-autonomy/start.ts)
//   bun world/run.ts story rehearsal/stories/<name>.jsonl | stories     # a story through the world; every story
//   bun world/run.ts hermes <args…>    # the pinned Hermes against the world's brain: kanban list, cron run pm
//   bun world/run.ts say <text…>       # a person speaks in the brain's channel on the Discord twin
//   bun world/run.ts env -- <cmd>      # run anything with the world's env (twin URLs, PLATFORM_URL)
//   bun world/run.ts fresh | down [--purge] | seed | stack up|down|restart | url [service]
//
// --cookbook picks the project under test (default todo-cli; also WORLD_COOKBOOK). WORLD_STATE_ROOT names a disk with
// headroom for the world's state (the runtime admits a world against the root's free space); WORLD_HERMES_BIN an
// installed pinned Hermes; TWINS_ROOT a twins checkout. Nothing in the world calls a real API, ever.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const argv = process.argv.slice(2);
const i = argv.indexOf('--cookbook');
const cookbook = i >= 0 ? argv[i + 1] : process.env.WORLD_COOKBOOK ?? 'todo-cli';
if (i >= 0) argv.splice(i, 2);
const project = resolve(ROOT, 'cookbooks', cookbook);
const engine = resolve(project, '.open-autonomy', 'rehearsal', 'run.ts');
if (!existsSync(resolve(project, 'rehearsal', 'world.json')) || !existsSync(engine)) { console.error(`no cookbooks/${cookbook}/rehearsal/world.json, or the cookbook does not carry the kit's rehearsal`); process.exit(2); }
const verb = argv[0];
switch (verb) {
  case 'up': case 'fresh': case 'down': case 'seed': case 'stack': case 'story': case 'stories': case 'say': case 'hermes': case 'env': case 'url': {
    const args = verb === 'story' && argv[1] && !argv[1].startsWith('/') ? [verb, resolve(process.cwd(), argv[1]), ...argv.slice(2)] : argv;
    const r = Bun.spawnSync({ cmd: ['bun', engine, ...args], cwd: project, stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, WORLD_COOKBOOK: cookbook, OPEN_AUTONOMY_ROOT: ROOT } });
    process.exit(r.exitCode);
  }
  default:
    console.error('usage: bun world/run.ts up | fresh | down [--purge] | seed | stack up|down|restart | story <file> | stories | say <text…> | hermes <args…> | env -- <cmd…> | url [service]   [--cookbook <name>]');
    process.exit(2);
}
