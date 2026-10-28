#!/usr/bin/env bun
// Static checks under a budget: typechecks, kit drift and docs references. Behavior is verified by
// manually driving the running product in World, not by an automated test suite.
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const BUDGET_MS = 30_000;
const steps: Array<[string, string[], string]> = [
  ['backend', ['bun', 'run', 'check'], 'packages/backend'],
  ['platform', ['bun', 'run', 'check'], 'apps/platform'],
  ['self-host', ['bun', 'run', 'check'], 'apps/self-host'],
  ['sdk', ['bun', 'run', 'check'], 'packages/sdk'],
  ['kit', ['bun', 'run', 'check'], 'packages/kit-hermes'],
  ['kit: cookbooks current', ['sh', '-c', 'bun packages/kit-hermes/src/cli.ts check cookbooks/todo-cli && bun packages/kit-hermes/src/cli.ts check .'], '.'],
  ['docs', ['bun', 'scripts/check-docs.ts'], '.'],
];
// Native frozen resolution validates version-checked workspace dependencies.
steps.unshift(['lockfile', ['pnpm', 'install', '--lockfile-only', '--frozen-lockfile', '--ignore-scripts'], '.']);
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
