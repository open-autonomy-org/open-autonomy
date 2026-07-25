import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, request } from 'node:http';
import { createConnection } from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';
import type { ProcRunner } from './types.ts';
import { defaultProc } from './proc.ts';

export const SERVICE_ENABLE_SCHEMA = 'open-autonomy.service-enable.v1' as const;
export const SERVICE_RUNTIME_SCHEMA = 'open-autonomy.service-runtime.v1' as const;
export const SERVICE_HEALTH_SCHEMA = 'open-autonomy.service-health.v1' as const;

export interface ServiceEnableReceipt {
  schema: typeof SERVICE_ENABLE_SCHEMA;
  projectRoot: string;
  gitCommonDir: string;
  launcher: string;
  enabledAt: string;
}

interface ServiceRuntimeReceipt {
  schema: typeof SERVICE_RUNTIME_SCHEMA;
  projectRoot: string;
  gitCommonDir: string;
  pid: number;
  port: number;
  instanceId: string;
  secret: string;
  startedAt: string;
}

export interface ServiceHealth {
  schema: typeof SERVICE_HEALTH_SCHEMA;
  projectRoot: string;
  gitCommonDir: string;
  pid: number;
  instanceId: string;
  ready: boolean;
}

export interface ServicePaths {
  projectRoot: string;
  gitCommonDir: string;
  home: string;
  enabled: string;
  runtime: string;
  log: string;
  ports: number[];
  port: number;
}

export interface ServiceStatus {
  enabled: boolean;
  state: 'stopped' | 'starting' | 'running' | 'port-conflict';
  paths: ServicePaths;
  health?: ServiceHealth;
}

function atomicJson(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
  try { chmodSync(path, 0o600); } catch { /* best effort on non-POSIX filesystems */ }
}

function gitCommonDir(cwd: string, proc: ProcRunner): string {
  const result = proc('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8' });
  if (result.status !== 0 || result.error || !result.stdout.trim()) {
    throw new Error('[oa] service requires a git repository');
  }
  return realpathSync(resolve(cwd, result.stdout.trim()));
}

/**
 * Stable repository-scoped candidates. Binding any one of them is the singleton
 * lease; multiple candidates keep an unrelated listener from disabling a repo.
 */
export function servicePorts(commonDir: string): number[] {
  const ports: number[] = [];
  for (let index = 0; ports.length < 8; index += 1) {
    const digest = createHash('sha256').update(`${commonDir}\0${index}`).digest();
    const port = 20_000 + digest.readUInt32BE(0) % 28_000;
    if (!ports.includes(port)) ports.push(port);
  }
  return ports;
}

export function servicePort(commonDir: string): number {
  return servicePorts(commonDir)[0]!;
}

export function servicePaths(cwd = process.cwd(), proc: ProcRunner = defaultProc): ServicePaths {
  const projectRoot = realpathSync(resolve(cwd));
  const commonDir = gitCommonDir(projectRoot, proc);
  const home = join(commonDir, 'open-autonomy', 'service');
  const ports = servicePorts(commonDir);
  return {
    projectRoot,
    gitCommonDir: commonDir,
    home,
    enabled: join(home, 'enabled.json'),
    runtime: join(home, 'runtime.json'),
    log: join(home, 'service.log'),
    ports,
    port: ports[0]!,
  };
}

function atPort(paths: ServicePaths, port: number): ServicePaths {
  return { ...paths, port };
}

function ensureHome(paths: ServicePaths): void {
  mkdirSync(paths.home, { recursive: true, mode: 0o700 });
  try { chmodSync(paths.home, 0o700); } catch { /* best effort on non-POSIX filesystems */ }
}

export function readServiceEnable(
  paths: ServicePaths,
  proc: ProcRunner = defaultProc,
): ServiceEnableReceipt | null {
  try {
    const value = JSON.parse(readFileSync(paths.enabled, 'utf8')) as ServiceEnableReceipt;
    if (
      value.schema !== SERVICE_ENABLE_SCHEMA ||
      value.gitCommonDir !== paths.gitCommonDir ||
      !isAbsolute(value.projectRoot) ||
      !isAbsolute(value.launcher)
    ) throw new Error('invalid fields');
    const receiptPaths = servicePaths(value.projectRoot, proc);
    if (receiptPaths.gitCommonDir !== paths.gitCommonDir) {
      throw new Error('project root does not belong to this Git repository');
    }
    realpathSync(value.launcher);
    return value;
  } catch (error) {
    if (!existsSync(paths.enabled)) return null;
    throw new Error(`[oa] service enable receipt is invalid at ${paths.enabled}: ${(error as Error).message}`);
  }
}

function readRuntime(paths: ServicePaths): ServiceRuntimeReceipt | null {
  try {
    const value = JSON.parse(readFileSync(paths.runtime, 'utf8')) as ServiceRuntimeReceipt;
    return value.schema === SERVICE_RUNTIME_SCHEMA && value.gitCommonDir === paths.gitCommonDir ? value : null;
  } catch {
    return null;
  }
}

export function enableService(cwd: string, launcher: string, proc: ProcRunner = defaultProc): ServiceEnableReceipt {
  const paths = servicePaths(cwd, proc);
  const launcherPath = realpathSync(resolve(launcher));
  const receipt: ServiceEnableReceipt = {
    schema: SERVICE_ENABLE_SCHEMA,
    projectRoot: paths.projectRoot,
    gitCommonDir: paths.gitCommonDir,
    launcher: launcherPath,
    enabledAt: new Date().toISOString(),
  };
  ensureHome(paths);
  atomicJson(paths.enabled, receipt);
  return receipt;
}

function httpJson(
  port: number,
  method: 'GET' | 'POST',
  path: string,
  secret?: string,
  timeoutMs = 350,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolvePromise, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      method,
      path,
      headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
      timeout: timeoutMs,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        let parsed: unknown = null;
        try { parsed = JSON.parse(body); } catch { /* an occupied foreign port is not our service */ }
        resolvePromise({ status: response.statusCode ?? 0, body: parsed });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function probePort(port: number, timeoutMs = 350): Promise<ServiceHealth | null> {
  try {
    const response = await httpJson(port, 'GET', '/health', undefined, timeoutMs);
    const health = response.body as ServiceHealth | null;
    if (response.status !== 200 || health?.schema !== SERVICE_HEALTH_SCHEMA) return null;
    return health;
  } catch {
    return null;
  }
}

async function locateService(
  paths: ServicePaths,
  timeoutMs = 350,
): Promise<{ paths: ServicePaths; health: ServiceHealth } | null> {
  const healthByPort = await Promise.all(paths.ports.map((port) => probePort(port, timeoutMs)));
  for (let index = 0; index < paths.ports.length; index += 1) {
    const port = paths.ports[index]!;
    const health = healthByPort[index];
    if (health?.gitCommonDir === paths.gitCommonDir) {
      return { paths: atPort(paths, port), health };
    }
  }
  return null;
}

export async function probeService(paths: ServicePaths, timeoutMs = 350): Promise<ServiceHealth | null> {
  return (await locateService(paths, timeoutMs))?.health ?? null;
}

async function portOccupied(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(250);
    socket.once('connect', () => {
      socket.destroy();
      resolvePromise(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolvePromise(false);
    });
    socket.once('error', () => resolvePromise(false));
  });
}

export async function serviceStatus(cwd: string, proc: ProcRunner = defaultProc): Promise<ServiceStatus> {
  const paths = servicePaths(cwd, proc);
  const enabled = readServiceEnable(paths, proc) !== null;
  const located = await locateService(paths);
  if (located) {
    return {
      enabled,
      state: located.health.ready ? 'running' : 'starting',
      paths: located.paths,
      health: located.health,
    };
  }
  const occupied = await Promise.all(paths.ports.map((port) => portOccupied(port)));
  return {
    enabled,
    state: occupied.every(Boolean) ? 'port-conflict' : 'stopped',
    paths,
  };
}

export interface RunServiceOptions {
  cwd: string;
  run: (signal: AbortSignal, onReady: () => void) => Promise<void>;
  installSignalHandlers?: boolean;
}

export async function runService(opts: RunServiceOptions): Promise<NodeJS.Signals | null> {
  let paths = servicePaths(opts.cwd);
  ensureHome(paths);
  const instanceId = randomBytes(16).toString('hex');
  const secret = randomBytes(24).toString('hex');
  const abort = new AbortController();
  let ready = false;
  const health = (): ServiceHealth => ({
    schema: SERVICE_HEALTH_SCHEMA,
    projectRoot: paths.projectRoot,
    gitCommonDir: paths.gitCommonDir,
    pid: process.pid,
    instanceId,
    ready,
  });

  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(health()));
      return;
    }
    if (
      req.method === 'POST' &&
      req.url === '/stop' &&
      req.headers.authorization === `Bearer ${secret}`
    ) {
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      abort.abort();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  let claimedPort: number | null = null;
  for (const port of paths.ports) {
    try {
      await new Promise<void>((resolvePromise, reject) => {
        const onError = (error: Error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolvePromise();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '127.0.0.1');
      });
      claimedPort = port;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
      const existing = await probePort(port);
      if (existing?.gitCommonDir === paths.gitCommonDir) {
        throw new Error(`[oa] service already running for this repository (pid ${existing.pid})`);
      }
    }
  }
  if (claimedPort === null) {
    throw new Error(`[oa] service cannot claim any repository port (${paths.ports.join(', ')}); all are occupied`);
  }
  paths = atPort(paths, claimedPort);

  const runtime: ServiceRuntimeReceipt = {
    schema: SERVICE_RUNTIME_SCHEMA,
    projectRoot: paths.projectRoot,
    gitCommonDir: paths.gitCommonDir,
    pid: process.pid,
    port: paths.port,
    instanceId,
    secret,
    startedAt: new Date().toISOString(),
  };
  atomicJson(paths.runtime, runtime);

  const signalHandlers = new Map<NodeJS.Signals, () => void>();
  let receivedSignal: NodeJS.Signals | null = null;
  if (opts.installSignalHandlers) {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
      const handler = () => {
        receivedSignal ??= signal;
        abort.abort();
      };
      signalHandlers.set(signal, handler);
      process.once(signal, handler);
    }
  }

  try {
    await opts.run(abort.signal, () => { ready = true; });
  } finally {
    abort.abort();
    for (const [signal, handler] of signalHandlers) process.off(signal, handler);
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    const current = readRuntime(paths);
    if (current?.instanceId === instanceId) rmSync(paths.runtime, { force: true });
  }
  return receivedSignal;
}

export interface EnsureServiceResult {
  action: 'already-running' | 'started';
  health: ServiceHealth;
}

async function waitForReady(
  paths: ServicePaths,
  action: EnsureServiceResult['action'],
  timeoutMs: number,
  candidate?: ChildProcess,
): Promise<EnsureServiceResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const located = await locateService(paths);
    if (located?.health.ready) {
      const health = located.health;
      if (candidate && health.pid !== candidate.pid) {
        try { candidate.kill('SIGTERM'); } catch { /* candidate already exited */ }
      }
      candidate?.unref();
      return { action, health };
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  if (candidate) {
    try { candidate.kill('SIGTERM'); } catch { /* candidate already exited */ }
    candidate.unref();
  }
  throw new Error(`[oa] service did not become ready within ${timeoutMs}ms; see ${paths.log}`);
}

export async function ensureService(cwd: string, timeoutMs = 8_000): Promise<EnsureServiceResult> {
  const initialPaths = servicePaths(cwd);
  const enabled = readServiceEnable(initialPaths);
  if (!enabled) {
    throw new Error(`[oa] service is not enabled for this repository; run \`oa service enable\``);
  }
  const paths = servicePaths(enabled.projectRoot);
  if (paths.gitCommonDir !== initialPaths.gitCommonDir) {
    throw new Error(`[oa] service enable receipt does not belong to this Git repository`);
  }
  const existing = await locateService(paths);
  if (existing) {
    if (existing.health.ready) return { action: 'already-running', health: existing.health };
    return waitForReady(paths, 'already-running', timeoutMs);
  }
  const occupied = await Promise.all(paths.ports.map((port) => portOccupied(port)));
  if (occupied.every(Boolean)) {
    throw new Error(`[oa] service cannot start: all repository ports are occupied (${paths.ports.join(', ')})`);
  }
  if (spawnSync('bun', ['--version'], { stdio: 'ignore' }).status !== 0) {
    throw new Error('[oa] service requires Bun (https://bun.sh)');
  }

  ensureHome(paths);
  const logFd = openSync(paths.log, 'a', 0o600);
  let child: ChildProcess;
  try {
    child = spawn('bun', [enabled.launcher, 'service', 'run', '--project', enabled.projectRoot], {
      cwd: enabled.projectRoot,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env,
    });
  } finally {
    closeSync(logFd);
  }

  return waitForReady(paths, 'started', timeoutMs, child);
}

export async function disableService(cwd: string): Promise<{ stopped: boolean; paths: ServicePaths }> {
  const paths = servicePaths(cwd);
  rmSync(paths.enabled, { force: true });
  const located = await locateService(paths);
  if (!located) {
    const occupied = await Promise.all(paths.ports.map((port) => portOccupied(port)));
    if (occupied.every(Boolean)) {
      throw new Error(`[oa] service was disarmed, but all repository ports are occupied or unresponsive`);
    }
    return { stopped: false, paths };
  }
  const health = located.health;
  const activePaths = located.paths;
  const runtime = readRuntime(paths);
  if (!runtime || runtime.instanceId !== health.instanceId || runtime.port !== activePaths.port) {
    throw new Error(`[oa] service was disarmed but its live process could not be authenticated; inspect pid ${health.pid}`);
  }
  const response = await httpJson(activePaths.port, 'POST', '/stop', runtime.secret, 1_000);
  if (response.status !== 202) throw new Error(`[oa] service was disarmed but pid ${health.pid} refused to stop`);
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (!(await probePort(activePaths.port, 100))) return { stopped: true, paths: activePaths };
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error(`[oa] service was disarmed but pid ${health.pid} did not stop within 3000ms`);
}
