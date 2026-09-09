#!/usr/bin/env bun
// The whole check, under a budget. Everything that runs unattended in this repository — every typecheck, every
// test, the kit's drift check, the docs check — runs here, and the lot must finish in under thirty seconds, or the
// check fails naming the slowest parts. That is the standing ban on test cruft made mechanical: a test earns its
// place by guarding an invariant of the constitution and costs its share of the budget; nothing waits on an agent,
// a network or a clock. Verification of behavior is the agent driving the running product, not this.
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const BUDGET_MS = 30_000;
const steps: Array<[string, string[], string]> = [
  ['backend', ['bun', 'run', 'check'], 'packages/backend'],
  ['platform', ['bun', 'run', 'check'], 'apps/platform'],
  ['self-host', ['bun', 'run', 'check'], 'apps/self-host'],
  ['sdk', ['bun', 'run', 'check'], 'packages/sdk'],
  ['kit', ['bun', 'run', 'check'], 'packages/kit-hermes'],
  ['kit: cookbooks current', ['sh', '-c', 'bun packages/kit-hermes/src/cli.ts check cookbooks/todo-cli && bun packages/kit-hermes/src/cli.ts check cookbooks/notes-api && bun packages/kit-hermes/src/cli.ts check .'], '.'],
  ['docs', ['bun', 'scripts/check-docs.ts'], '.'],
];
// The lockfile names each workspace package's version, and `bun publish` writes that — not package.json's — in place
// of a `workspace:*` dependency; bun never refreshes it on install, so a bumped package would publish depending on
// the version before. The check keeps them equal, fixing and staging the lockfile as a pre-commit hook does.
{
  const lock = resolve(ROOT, 'bun.lock');
  let text = await Bun.file(lock).text();
  const before = text;
  for (const pattern of (await Bun.file(resolve(ROOT, 'package.json')).json()).workspaces as string[]) for (const found of new Bun.Glob(`${pattern}/package.json`).scanSync(ROOT)) {
    const dir = found.slice(0, -'/package.json'.length);
    const version = (await Bun.file(resolve(ROOT, found)).json()).version as string;
    text = text.replace(new RegExp(`("${dir.replace(/[/.]/g, '\\$&')}": \\{\\s*"name": "[^"]+",\\s*"version": ")[^"]+(")`), `$1${version}$2`);
  }
  if (text !== before) { await Bun.write(lock, text); Bun.spawnSync({ cmd: ['git', 'add', 'bun.lock'], cwd: ROOT }); console.log('check: bun.lock workspace versions refreshed'); }
}
const took: Array<[string, number]> = [];
let failed = false;
const t0 = Date.now();
for (const [name, cmd, cwd] of steps) {
  const s = Date.now();
  const r = Bun.spawnSync({ cmd, cwd: resolve(ROOT, cwd), stdout: 'pipe', stderr: 'pipe' });
  took.push([name, Date.now() - s]);
  if (r.exitCode !== 0) { failed = true; console.error(`check: ${name} failed\n${r.stdout.toString().slice(-1200)}${r.stderr.toString().slice(-1200)}`); }
}
const total = Date.now() - t0;
const line = took.map(([n, ms]) => `${n} ${(ms / 1000).toFixed(1)}s`).join(', ');
if (total > BUDGET_MS) { console.error(`check: ${(total / 1000).toFixed(1)}s, over the ${BUDGET_MS / 1000}s budget — cut what grew: ${line}`); process.exit(1); }
if (failed) process.exit(1);
console.log(`check: OK in ${(total / 1000).toFixed(1)}s of ${BUDGET_MS / 1000}s (${line})`);
