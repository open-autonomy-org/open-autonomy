// A single native readiness observation. World owns retrying and the timeout.
import { resolve } from 'node:path';
import { hermesBin, STACK } from './lib.ts';
const result = Bun.spawnSync({ cmd: [resolve(hermesBin(), 'hermes'), 'cron', 'list'],
  cwd: resolve(STACK, 'project'), env: { ...process.env, HERMES_HOME: resolve(STACK, 'home') }, stdout: 'pipe', stderr: 'pipe' });
if (result.exitCode !== 0 || !result.stdout.toString().includes('[active]')) process.exit(1);
console.log('Native Hermes schedule is ready');
