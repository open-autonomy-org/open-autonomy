import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawn } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  disableService,
  enableService,
  ensureService,
  probeService,
  servicePaths,
  serviceStatus,
} from './service.ts';

const roots: string[] = [];
const livePids = new Set<number>();
const blockers = new Set<Server>();

function gitRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'oa-service-'));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function idleLauncher(root: string): string {
  const path = join(root, 'fixture-oa.ts');
  const serviceUrl = new URL('./service.ts', import.meta.url).href;
  writeFileSync(path, `import { runService } from ${JSON.stringify(serviceUrl)};
const projectIndex = process.argv.indexOf('--project');
const cwd = projectIndex >= 0 ? process.argv[projectIndex + 1] : process.cwd();
await runService({
  cwd,
  installSignalHandlers: true,
  run: async (signal, onReady) => {
    onReady();
    if (signal.aborted) return;
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
  },
});
`);
  return path;
}

async function waitUntil(check: () => Promise<boolean>, timeoutMs = 4_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await Bun.sleep(25);
  }
  throw new Error(`condition was not met within ${timeoutMs}ms`);
}

afterEach(async () => {
  for (const pid of livePids) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
  livePids.clear();
  await Promise.all(Array.from(blockers, (server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
  blockers.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('repository service lifecycle', () => {
  test('enable only arms the service and does not launch it', async () => {
    const root = gitRepo();
    enableService(root, idleLauncher(root));

    const status = await serviceStatus(root);
    expect(status.enabled).toBe(true);
    expect(status.state).toBe('stopped');
  });

  test('concurrent ensures converge on one resident process', async () => {
    const root = gitRepo();
    enableService(root, idleLauncher(root));

    const results = await Promise.all(Array.from({ length: 6 }, () => ensureService(root)));
    for (const result of results) livePids.add(result.health.pid);

    expect(new Set(results.map((result) => result.health.pid)).size).toBe(1);
    expect((await serviceStatus(root)).state).toBe('running');

    const stopped = await disableService(root);
    expect(stopped.stopped).toBe(true);
    livePids.clear();
    expect((await serviceStatus(root)).state).toBe('stopped');
  }, 20_000);

  test('a hard-killed service stays down until the next ensure', async () => {
    const root = gitRepo();
    enableService(root, idleLauncher(root));
    const first = await ensureService(root);
    livePids.add(first.health.pid);

    process.kill(first.health.pid, 'SIGKILL');
    livePids.delete(first.health.pid);
    const paths = servicePaths(root);
    await waitUntil(async () => (await probeService(paths)) === null);

    await Bun.sleep(200);
    expect(await probeService(paths)).toBeNull();

    const second = await ensureService(root);
    livePids.add(second.health.pid);
    expect(second.health.pid).not.toBe(first.health.pid);

    await disableService(root);
    livePids.clear();
  });

  test('a receipt cannot redirect ensure into another Git repository', async () => {
    const root = gitRepo();
    const otherRoot = gitRepo();
    const receipt = enableService(root, idleLauncher(root));
    const paths = servicePaths(root);
    writeFileSync(paths.enabled, JSON.stringify({ ...receipt, projectRoot: otherRoot }));

    await expect(ensureService(root)).rejects.toThrow('project root does not belong to this Git repository');
    expect((await serviceStatus(otherRoot)).state).toBe('stopped');
  });

  test('an unrelated listener on the first candidate does not disable the service', async () => {
    const root = gitRepo();
    const firstPort = servicePaths(root).port;
    const blocker = createServer((socket) => {
      socket.end('HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\nconnection: close\r\n\r\n');
    });
    blockers.add(blocker);
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(firstPort, '127.0.0.1', resolve);
    });
    enableService(root, idleLauncher(root));

    const result = await ensureService(root);
    livePids.add(result.health.pid);
    const status = await serviceStatus(root);

    expect(status.state).toBe('running');
    expect(status.paths.port).not.toBe(firstPort);

    await disableService(root);
    livePids.clear();
  }, 20_000);

  test('foreground service reports the signal that stopped it', async () => {
    const root = gitRepo();
    mkdirSync(join(root, 'scheduler'), { recursive: true });
    writeFileSync(join(root, 'scheduler', 'schedule.json'), JSON.stringify({
      intervalSeconds: 900,
      scripts: ['node -e ""'],
    }));
    const indexUrl = new URL('./index.ts', import.meta.url).href;
    const source = `
process.chdir(${JSON.stringify(root)});
const { runCli } = await import(${JSON.stringify(indexUrl)});
process.exit(await runCli(['start']));
`;
    const child = spawn('bun', ['-e', source], { cwd: root, stdio: 'ignore' });
    if (!child.pid) throw new Error('foreground service did not spawn');
    livePids.add(child.pid);
    const paths = servicePaths(root);
    await waitUntil(async () => (await probeService(paths))?.ready === true);

    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    child.kill('SIGINT');
    const exit = await exited;
    livePids.delete(child.pid);

    expect(exit).toEqual({ code: 130, signal: null });
  }, 20_000);
});
