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
  ['platform', ['bun', 'run', 'check'], 'apps/platform'],
  ['sdk', ['bun', 'run', 'check'], 'packages/sdk'],
  ['kit', ['bun', 'run', 'check'], 'packages/kit-hermes'],
  ['kit: cookbooks current', ['sh', '-c', 'bun packages/kit-hermes/src/cli.ts check cookbooks/todo-cli && bun packages/kit-hermes/src/cli.ts check cookbooks/notes-api && bun packages/kit-hermes/src/cli.ts check .'], '.'],
  ['docs', ['bun', 'scripts/check-docs.ts'], '.'],
];
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
