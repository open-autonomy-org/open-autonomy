// Host-owned supervision for a prepared local container. Setup still owns image,
// checkout, native configuration and connections; this module does not provision them.
// Keep this installed host code outside the agent-writable container checkout.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startCodexHost } from './sdk/codex-host.ts';
import { startContainerProcess } from './sdk/container-process.ts';
import { checkCredentialDirectory } from './sdk/credentials.ts';
import { checkLocalCodexConfig } from './sdk/local-codex.ts';

export async function startLocalRuntime(options: {
  container: string; executorUrl: string; stateDir: string; secrets: string;
  config: string; workspace?: string; hermesHome?: string; valvePort?: number;
}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(options.container)) throw new Error('A container name or ID is required.');
  const workspace = options.workspace ?? '/work/project', home = options.hermesHome ?? '/opt/data';
  const port = options.valvePort ?? 8787;
  if (!Number.isInteger(port) || port < 1024 || port > 65532) throw new Error('Choose an unprivileged valve port with room for four services.');
  const state = checkCredentialDirectory(options.stateDir);
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const keys = ['agent.env', 'treasurer.env'].map(name => resolve(options.secrets, name));
  if (keys.some(path => !existsSync(path))) throw new Error('Restore both project credentials before starting the local runtime.');
  const read = Bun.spawnSync({ cmd: ['docker', 'exec', '--user', 'hermes', options.container,
    '/opt/hermes/.venv/bin/python', '-c',
    'import json,sys,yaml; from pathlib import Path; h=Path(sys.argv[1]); print(json.dumps([yaml.safe_load((h/p).read_text()) for p in ["config.yaml","profiles/treasurer/config.yaml"]]))', home],
    stdout: 'pipe', stderr: 'pipe', timeout: 10_000 });
  if (read.exitCode !== 0) throw new Error('The prepared container profiles could not be read.');
  const configs = JSON.parse(read.stdout.toString());
  for (const config of configs) checkLocalCodexConfig(config);
  const model = configs[0].model.default;
  if (configs[1].model.default !== model) throw new Error('Both native profiles must use the agreed local Codex model.');
  const version = Bun.spawnSync({ cmd: ['codex', '--version'], stdout: 'pipe', stderr: 'pipe', timeout: 10_000 });
  const label = version.stdout.toString().trim();
  if (version.exitCode !== 0 || !/^codex-cli \d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(label)) throw new Error('The installed host Codex version could not be verified.');
  const token = randomBytes(32).toString('base64url');
  const bridge = await startCodexHost({ model, workspace, hermesHome: home,
    executorUrl: options.executorUrl, stateDir: resolve(state, 'codex'), token });
  const services: ReturnType<typeof Bun.spawn>[] = [];
  let gateway: ReturnType<typeof startContainerProcess> | undefined;
  let ending: Promise<void> | undefined;
  let finish!: (code: number) => void;
  const exited = new Promise<number>(resolve => { finish = resolve; });
  const stop = (code: number) => ending ??= (async () => {
    bridge.close();
    await gateway?.close();
    for (const proc of services) if (proc.exitCode === null) proc.kill();
    const force = setTimeout(() => { for (const proc of services) if (proc.exitCode === null) proc.kill('SIGKILL'); }, 5000);
    await Promise.all(services.map(proc => proc.exited));
    clearTimeout(force);
    process.off('SIGTERM', onSignal); process.off('SIGINT', onSignal);
    finish(code);
  })();
  const onSignal = () => { void stop(0); };
  process.on('SIGTERM', onSignal); process.on('SIGINT', onSignal);
  function own(name: string, cmd: string[], extra: { env?: Record<string, string | undefined>; ipc?: (message: any) => void } = {}) {
    const proc = Bun.spawn({ cmd, stdin: 'ignore', stdout: 'inherit', stderr: 'inherit', ...extra });
    services.push(proc);
    void proc.exited.then(code => { if (!ending) { console.error(`local runtime: ${name} ended (${code})`); void stop(1); } });
    return proc;
  }
  async function ready(check: () => Promise<boolean>, description: string) {
    const deadline = Date.now() + 30_000;
    while (!ending && Date.now() < deadline) {
      if (await check()) return;
      await Bun.sleep(100);
    }
    throw new Error(`Local runtime did not establish ${description}; Hermes was not started.`);
  }
  try {
    own('container', ['docker', 'wait', options.container]);
    const valveArgs = keys.flatMap((file, i) => ['--key', `${file}:${port + i}`]);
    if (existsSync(resolve(options.secrets, 'github-app.json'))) valveArgs.push('--github-app', `${resolve(options.secrets, 'github-app.json')}:${port + 3}`);
    own('valve', ['bun', resolve(import.meta.dir, 'sdk/valve.ts'), '--loopback', ...valveArgs]);
    await ready(async () => {
      try { return (await Promise.all([port, port + 1].map(async p => (await fetch(`http://127.0.0.1:${p}/healthz`, { signal: AbortSignal.timeout(1000) })).text()))).every(s => s.startsWith('ok')); }
      catch { return false; }
    }, 'the project valves');
    let watching = false;
    own('reporter', ['bun', resolve(import.meta.dir, 'reporter.ts'), '--config', options.config,
      '--container', options.container, '--project', workspace, '--state-file', resolve(state, 'reporter-state.json')], {
      env: { ...process.env, HERMES_HOME: home, OPEN_AUTONOMY_BASE_URL: `http://127.0.0.1:${port}/v1`, OPEN_AUTONOMY_KEY: 'valve' },
      ipc(message) { if (message?.type === 'reporter-ready') watching = true; },
    });
    await ready(async () => watching, 'the container reporter');
    if (ending) throw new Error('A host service ended during startup.');
    gateway = startContainerProcess({ container: options.container, cwd: workspace, command: ['hermes', 'gateway', 'run'], env: {
      HOME: home, HERMES_HOME: home, TERMINAL_CWD: workspace, HERMES_GATEWAY_EXTERNAL_SUPERVISOR: '1',
      OPEN_AUTONOMY_CODEX_VERSION: label, OPEN_AUTONOMY_CODEX_URL: bridge.url.replace('127.0.0.1', 'host.docker.internal'), OPEN_AUTONOMY_CODEX_TOKEN: token,
      OPEN_AUTONOMY_BASE_URL: `http://host.docker.internal:${port}/v1`, OPEN_AUTONOMY_PAY_URL: `http://host.docker.internal:${port + 1}/v1`,
      GITHUB_API_URL: `http://host.docker.internal:${port + 3}`, GITHUB_TOKEN: 'valve',
    } });
    void gateway.exited.then(code => { if (!ending) void stop(code === 75 ? 75 : 1); });
    return { exited, close: () => stop(0), restart: () => gateway?.restart() };
  } catch (error) { await stop(1); throw error; }
}
