// The host half of start.ts: credentials and SDK reporting here, native Hermes in
// one already prepared World executor. Provisioning and restart policy belong to setup/World.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { codexAccess } from './sdk/codex-auth.ts';
import { checkCredentialDirectory } from './sdk/credentials.ts';
import { checkContainerGit, startContainerProcess } from './sdk/container-process.ts';
import { prepareContainerHome, prepareContainerSubscription, verifyContainer, writeContainerEnvironment, writeContainerKitRecord } from './sdk/container-home.ts';

export async function startHost(options: {
  container: string; project?: string; home?: string; secrets?: string; state?: string; config?: string; port: number;
}) {
  const { container, port } = options;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error('A container name is required');
  if (!Number.isInteger(port) || port < 1024 || port > 65532) throw new Error('The valve needs four unprivileged ports');
  const workspace = options.project ?? '/work/project', home = options.home ?? '/opt/data';
  const configFile = options.config ?? resolve(import.meta.dir, 'config.yaml');
  const account = (Bun.YAML.parse(readFileSync(configFile, 'utf8')) as any)?.account;
  if (typeof account !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(account)) throw new Error('Configuration must name the project account');
  const secrets = checkCredentialDirectory(resolve(options.secrets ?? process.env.AGENT_SECRETS ?? resolve(homedir(), '.config/open-autonomy', account)));
  const state = checkCredentialDirectory(resolve(options.state ?? resolve(homedir(), '.local/state/open-autonomy', account, 'host')));
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const keys = ['agent.env', 'treasurer.env'].map(name => resolve(secrets, name));
  const github = resolve(secrets, 'github-app.json');
  if ([...keys, github].some(path => !existsSync(path))) throw new Error('Restore the project credentials and installed GitHub App before starting Hermes');
  const kit = JSON.parse(readFileSync(resolve(import.meta.dir, 'kit.json'), 'utf8'));
  await verifyContainer({ container, home, workspace });

  const services: ReturnType<typeof Bun.spawn>[] = [];
  let gateway: ReturnType<typeof startContainerProcess> | undefined;
  let ending: Promise<void> | undefined;
  let finish!: (code: number) => void;
  const exited = new Promise<number>(resolve => { finish = resolve; });
  const stop = (code: number): Promise<void> => ending ??= (async () => {
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
  const own = (name: string, cmd: string[], extra: { env?: Record<string, string | undefined>; ipc?: (message: any) => void } = {}) => {
    const proc = Bun.spawn({ cmd, stdin: 'ignore', stdout: 'inherit', stderr: 'inherit', ...extra });
    services.push(proc);
    void proc.exited.then(code => { if (!ending) { console.error(`host: ${name} ended (${code})`); void stop(1); } });
  };
  const ready = async (check: () => Promise<boolean>, name: string) => {
    const deadline = Date.now() + 30_000;
    while (!ending && Date.now() < deadline) {
      if (await check()) return;
      await Bun.sleep(100);
    }
    throw new Error(`Host did not establish ${name}; Hermes was not started`);
  };
  try {
    own('executor', ['docker', 'wait', container]);
    const ports = [port, port + 1, port + 3];
    const args = keys.flatMap((file, i) => ['--key', `${file}:${port + i}`]);
    args.push('--github-app', `${github}:${port + 3}`);
    args.push('--codex', String(port + 2));
    own('valve', ['bun', resolve(import.meta.dir, 'sdk/valve.ts'), '--loopback', ...args]);
    await ready(async () => {
      try { return (await Promise.all(ports.map(async p => (await fetch(`http://127.0.0.1:${p}/healthz`, { signal: AbortSignal.timeout(1000) })).text()))).every(s => s.startsWith('ok')); }
      catch { return false; }
    }, 'credential valves');
    const host = 'http://host.docker.internal';
    await checkContainerGit({ container, home, workspace, account, baseUrl: `${host}:${port + 3}` });
    const prepared = await prepareContainerHome({ container, home, workspace });
    if ((Bun.YAML.parse(prepared.config) as any)?.account !== account) throw new Error('Committed configuration names another project');
    const onCodex = prepared.models.some(model => model?.provider === 'openai-codex');
    // Let native Codex startup finish before starting the fleet; its database
    // maintenance is not an authentication RPC timeout.
    if (onCodex) await codexAccess();
    const codexBase = onCodex ? `${host}:${port + 2}/backend-api/codex` : '';
    if (onCodex) await prepareContainerSubscription({ container, home, baseUrl: codexBase });
    const channelsFile = resolve(secrets, 'channels.env');
    const channels = existsSync(channelsFile) ? parseEnv(readFileSync(channelsFile, 'utf8')) : {};
    const env = { ...channels, HOME: home, HERMES_HOME: home, TERMINAL_CWD: workspace,
      HERMES_GATEWAY_EXTERNAL_SUPERVISOR: '1', HERMES_CODEX_BASE_URL: codexBase, CODEX_HOME: `${home}/codex-home-none`,
      OPEN_AUTONOMY_BASE_URL: `${host}:${port}/v1`, OPEN_AUTONOMY_PAY_URL: `${host}:${port + 1}/v1`, OPEN_AUTONOMY_KEY: 'valve',
      GITHUB_API_URL: `${host}:${port + 3}`, GITHUB_TOKEN: 'valve' };
    await writeContainerEnvironment({ container, home, env });
    const reportConfig = resolve(state, 'project-config.yaml');
    writeFileSync(reportConfig, prepared.config, { mode: 0o600 });
    let watching = false;
    own('reporter', ['bun', resolve(import.meta.dir, 'reporter.ts'), '--container', container,
      '--config', reportConfig, '--project', workspace, '--state-file', resolve(state, 'reporter-state.json')], {
      env: { ...process.env, HERMES_HOME: home, OPEN_AUTONOMY_BASE_URL: `http://127.0.0.1:${port}/v1`, OPEN_AUTONOMY_KEY: 'valve' },
      ipc(message) { if (message?.type === 'reporter-ready') watching = true; },
    });
    await ready(async () => watching, 'SDK reporter');
    if (ending) throw new Error('A host service stopped during preparation');
    await writeContainerKitRecord({ container, home, version: kit.version });
    gateway = startContainerProcess({ container, cwd: workspace, command: ['hermes', 'gateway', 'run'], env });
    void gateway.exited.then(code => { if (!ending) void stop(code === 75 ? 75 : 1); });
    console.log(`host: native Hermes at ${prepared.revision}; ${prepared.dirty ? 'unfinished checkout preserved' : 'checkout current'}; kit ${kit.version}`);
    return { exited, close: () => stop(0), restart: () => gateway?.restart() };
  } catch (error) { await stop(1); throw error; }
}
