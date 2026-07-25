// End-to-end: spawn the REAL `oa` executable (bin/oa.ts) as a real `node` child process — proves the
// package is actually consumable via plain `node` (no bundler/build step), matching the portability claim
// in bin/oa.ts's own header comment, and exercises argv wiring `runCli` alone can't catch (process.exit
// codes, --help formatting, unknown-command handling).
import { describe, expect, test } from 'bun:test';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), 'bin', 'oa.ts');

function tmpRepo(schedule: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'oa-cli-'));
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify(schedule));
  return dir;
}

async function waitUntil(check: () => boolean, timeoutMs = 4_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await Bun.sleep(25);
  }
  throw new Error(`condition was not met within ${timeoutMs}ms`);
}

describe('oa (real node subprocess)', () => {
  test('--help prints the verb table and exits 0', () => {
    const r = spawnSync('node', [BIN, '--help'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('oa start');
    expect(r.stdout).toContain('oa once');
    expect(r.stdout).toContain('oa pause');
    expect(r.stdout).toContain('oa resume');
    expect(r.stdout).toContain('oa status');
    expect(r.stdout).toContain('oa dispatch');
    expect(r.stdout).toContain('oa doctor');
    expect(r.stdout).toContain('oa integration ztrack enable');
  });

  test('an unknown command exits nonzero and names itself', () => {
    const r = spawnSync('node', [BIN, 'bogus'], { encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('unknown command "bogus"');
  });

  test('service enable arms a git repository without launching OA', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      const enabled = spawnSync('node', [BIN, 'service', 'enable'], { cwd: dir, encoding: 'utf8' });
      expect(enabled.status).toBe(0);
      expect(enabled.stdout).toContain('run `oa service ensure` explicitly');

      const status = spawnSync('node', [BIN, 'service', 'status'], { cwd: dir, encoding: 'utf8' });
      expect(status.status).toBe(0);
      expect(status.stdout).toContain('enabled, stopped');
    } finally {
      spawnSync('node', [BIN, 'service', 'disable'], { cwd: dir, encoding: 'utf8' });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('ztrack integration is an OA-owned adapter over the public hook CLI', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      const binDir = join(dir, 'node_modules', '.bin');
      mkdirSync(binDir, { recursive: true });
      const calls = join(dir, 'ztrack-calls.jsonl');
      const ztrack = join(binDir, 'ztrack');
      writeFileSync(ztrack, `#!/usr/bin/env node
require('node:fs').appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + '\\n');
`);
      chmodSync(ztrack, 0o700);

      const enabled = spawnSync('node', [BIN, 'integration', 'ztrack', 'enable'], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(enabled.status).toBe(0);
      expect(enabled.stdout).toContain('ztrack integration enabled');
      expect(JSON.parse(readFileSync(calls, 'utf8').trim())).toContain('project:invoke');

      const status = spawnSync('node', [BIN, 'service', 'status'], { cwd: dir, encoding: 'utf8' });
      expect(status.stdout).toContain('enabled, stopped');

      const disabled = spawnSync('node', [BIN, 'integration', 'ztrack', 'disable'], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(disabled.status).toBe(0);
      const callLines = readFileSync(calls, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      expect(callLines.at(-1)).toEqual(['hooks', 'remove', 'open-autonomy.service']);
    } finally {
      spawnSync('node', [BIN, 'service', 'disable'], { cwd: dir, encoding: 'utf8' });
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  test('foreground start retains the historical non-Git script-only path', async () => {
    const dir = tmpRepo({
      intervalSeconds: 900,
      scripts: [`node -e "require('fs').writeFileSync('started.txt','yes')"`],
    });
    const indexUrl = new URL('./index.ts', import.meta.url).href;
    const source = `
process.chdir(${JSON.stringify(dir)});
const { runCli } = await import(${JSON.stringify(indexUrl)});
process.exit(await runCli(['start']));
`;
    const child = spawn('bun', ['-e', source], { cwd: dir, stdio: 'ignore' });
    try {
      await waitUntil(() => existsSync(join(dir, 'started.txt')));
      const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        child.once('exit', (code, signal) => resolve({ code, signal }));
      });
      child.kill('SIGINT');
      const exit = await exited;
      expect(exit.signal === 'SIGINT' || exit.code === 130).toBe(true);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10_000);

  test('pause then resume round-trips the real marker file on disk', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      const p1 = spawnSync('node', [BIN, 'pause', 'cli e2e test'], { cwd: dir, encoding: 'utf8' });
      expect(p1.status).toBe(0);
      const st1 = spawnSync('node', [BIN, 'status'], { cwd: dir, encoding: 'utf8' });
      expect(st1.stdout).toContain('PAUSED');

      const p2 = spawnSync('node', [BIN, 'resume'], { cwd: dir, encoding: 'utf8' });
      expect(p2.status).toBe(0);
      const st2 = spawnSync('node', [BIN, 'status'], { cwd: dir, encoding: 'utf8' });
      expect(st2.stdout).toContain('unpaused');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--once while paused skips legacy jobs behind the default fence', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      spawnSync('node', [BIN, 'pause'], { cwd: dir, encoding: 'utf8' });
      const r = spawnSync('node', [BIN, '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('once (unpaused, script-only schedule) actually runs the scheduled command', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: [`node -e "require('fs').writeFileSync('ran.txt','yes')"`] });
    try {
      const r = spawnSync('node', [BIN, 'once'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(0);
      const ranPath = join(dir, 'ran.txt');
      expect(Bun.file(ranPath).size).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('doctor on a script-only schedule passes and prints OK lines', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      const r = spawnSync('node', [BIN, 'doctor'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('all checks passed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('doctor --json emits parseable JSON', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      const r = spawnSync('node', [BIN, 'doctor', '--json'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.ok).toBe(true);
      expect(Array.isArray(parsed.checks)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dispatch with no agent name fails with a usage message', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      const r = spawnSync('node', [BIN, 'dispatch'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('requires an agent name');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
