// Container startup for the existing start.ts entrypoint. The valve and reporter
// stay here; the agent's runtime runs in the prepared World executor: native Hermes, or, where the setup picks
// another harness, Supercode's orchestrator running it as each profile's worker (ADR 0009, as amended). This module
// owns its child processes, not container provisioning or restart policy.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { codexAccess } from './codex-auth.ts';
import { checkCredentialDirectory } from './credentials.ts';
import { startContainerProcess } from './container-process.ts';
import { containerMainMoved, mergeImageDenylist, openContainerCodexSandbox, prepareContainerHome, prepareContainerSubscription, renderContainerWorkerForms, writeContainerEnvironment, writeContainerKitRecord } from './container-home.ts';
import { agentHarness, agentModels, applyAgent, parseAgent } from './agent.ts';

export async function startContainer(options: {
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

  const services: ReturnType<typeof Bun.spawn>[] = [];
  let gateway: ReturnType<typeof startContainerProcess> | undefined;
  // the orchestrator stops on SIGTERM rather than draining on SIGUSR1: a stop asked for a restart is the drain
  let restartAsked = false;
  let mainWatch: ReturnType<typeof setInterval> | undefined;
  let ending: Promise<void> | undefined;
  let finish!: (code: number) => void;
  const exited = new Promise<number>(resolve => { finish = resolve; });
  const stop = (code: number): Promise<void> => ending ??= (async () => {
    clearInterval(mainWatch);
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
    void proc.exited.then(code => {
      if (ending) return;
      // The reporter narrates; it never decides whether the brain runs. It comes back in ten seconds.
      if (name === 'reporter') { console.error(`host: reporter ended (${code}); the brain keeps running, the reporter returns in 10 s`); setTimeout(() => { if (!ending) own(name, cmd, extra); }, 10_000); return; }
      console.error(`host: ${name} ended (${code})`); void stop(1);
    });
  };
  const ready = async (check: () => Promise<boolean>, name: string) => {
    const deadline = Date.now() + 30_000;
    while (!ending && Date.now() < deadline) {
      if (await check()) return;
      await Bun.sleep(100);
    }
    throw new Error(`Host did not establish ${name}; the agent's runtime was not started`);
  };
  try {
    own('executor', ['docker', 'wait', container]);
    const ports = [port, port + 1];
    const args = keys.flatMap((file, i) => ['--key', `${file}:${port + i}`]);
    // Git must be available before fetching the committed model/configuration.
    own('github valve', ['bun', resolve(import.meta.dir, 'valve.ts'), '--loopback', '--github-app', `${github}:${port + 3}`]);
    await ready(async () => {
      try { return (await fetch(`http://127.0.0.1:${port + 3}/healthz`, { signal: AbortSignal.timeout(1000) })).ok; }
      catch { return false; }
    }, 'GitHub valve');
    const host = 'http://host.docker.internal';
    const prepared = await prepareContainerHome({ container, home, workspace });
    if ((Bun.YAML.parse(prepared.config) as any)?.account !== account) throw new Error('Committed configuration names another project');
    if (!prepared.agent) throw new Error('No .open-autonomy/agent.json at the committed revision; run `create-open-autonomy upgrade` (docs/decisions/0007)');
    const agentSetup = parseAgent(prepared.agent, 'origin/main:.open-autonomy/agent.json');
    // Hermes runs itself; another harness runs as the orchestrator's worker on the same home, in the executor
    const harness = agentHarness(agentSetup);
    // the executor's image carries Hermes and Codex; another harness has no runtime there, and one on its user's own
    // login (Claude Code) cannot hold it in an executor
    if (!['hermes', 'codex'].includes(harness)) throw new Error(`.open-autonomy/agent.json picks ${harness}; the executor runs Hermes or Codex, so start ${harness} bare`);
    if (harness !== 'hermes') for (const line of await renderContainerWorkerForms({ container, home, workspace, revision: prepared.revision })) console.log(`host: ${line}`);
    const onCodex = agentModels(agentSetup).some(model => model?.provider === 'openai-codex');
    // Let native Codex startup finish before starting the fleet; its database
    // maintenance is not an authentication RPC timeout.
    if (onCodex && !process.env.HERMES_CODEX_BASE_URL?.trim()) await codexAccess();
    const twin = process.env.HERMES_CODEX_BASE_URL?.trim();
    const codexBase = onCodex ? (twin || `${host}:${port + 2}/backend-api/codex`) : '';
    if (onCodex) await prepareContainerSubscription({ container, home, baseUrl: codexBase });
    if (onCodex && !twin) args.push('--codex', String(port + 2));
    own('valve', ['bun', resolve(import.meta.dir, 'valve.ts'), '--loopback', ...args]);
    await ready(async () => {
      try { return (await Promise.all(ports.map(async p => (await fetch(`http://127.0.0.1:${p}/healthz`, { signal: AbortSignal.timeout(1000) })).text()))).every(s => s.startsWith('ok')); }
      catch { return false; }
    }, 'credential valves');
    const channelsFile = resolve(secrets, 'channels.env');
    const channels = existsSync(channelsFile) ? parseEnv(readFileSync(channelsFile, 'utf8')) : {};
    const env = { ...channels, HOME: home, HERMES_HOME: home, TERMINAL_CWD: workspace,
      HERMES_GATEWAY_EXTERNAL_SUPERVISOR: '1', HERMES_CODEX_BASE_URL: codexBase, CODEX_HOME: `${home}/codex-home-none`,
      OPEN_AUTONOMY_BASE_URL: `${host}:${port}/v1`, OPEN_AUTONOMY_PAY_URL: `${host}:${port + 1}/v1`, OPEN_AUTONOMY_KEY: 'valve',
      GITHUB_API_URL: `${host}:${port + 3}`, GITHUB_TOKEN: 'valve' };
    await writeContainerEnvironment({ container, home, env });
    // The agent's setup into the executor's home before the gateway: Hermes's own functions inside the container, the
    // applier and its base on this host. A setup that cannot be applied stops the start.
    for (const line of await applyAgent({
      setup: agentSetup, homeOf: (profile) => (profile === 'default' ? home : `${home}/profiles/${profile}`),
      homeId: account, stateRoot: resolve(state, 'apply'), workspace, container,
    })) console.log(`host: agent: ${line}`);
    await mergeImageDenylist({ container, home });
    // a Codex worker's own sandbox cannot run in the executor, which is the boundary itself: off where the profile's
    // approvals are off; a profile that keeps them keeps it, failing closed (container-home.ts)
    if (harness === 'codex') for (const line of await openContainerCodexSandbox({ container, home })) console.log(`host: ${line}`);
    const reportConfig = resolve(state, 'project-config.yaml');
    writeFileSync(reportConfig, prepared.config, { mode: 0o600 });
    // What runs the agent, for its page: the mode, the kit, the executor's image, this host. Never a credential.
    const inspected = Bun.spawnSync({ cmd: ['docker', 'inspect', '--format', '{{.Config.Image}}', container], stdout: 'pipe', stderr: 'pipe', timeout: 10_000 });
    const runtime = JSON.stringify({ mode: 'container', kit: kit.version, executor: inspected.exitCode === 0 ? inspected.stdout.toString().trim() : undefined, host: hostname() });
    let reportReady!: () => void;
    const reporterReady = new Promise<void>(resolve => { reportReady = resolve; });
    own('reporter', ['bun', resolve(import.meta.dir, 'reporter.ts'), '--container', container,
      '--config', reportConfig, '--project', workspace, '--state-file', resolve(state, 'reporter-state.json')], {
      env: { ...process.env, HERMES_HOME: home, OPEN_AUTONOMY_BASE_URL: `http://127.0.0.1:${port}/v1`, OPEN_AUTONOMY_KEY: 'valve', OPEN_AUTONOMY_RUNTIME: runtime, OPEN_AUTONOMY_HARNESS: harness },
      ipc(message) { if (message?.type === 'reporter-ready') reportReady(); },
    });
    await Promise.race([reporterReady, exited.then(() => { throw new Error('Runtime stopped before SDK reporter readiness'); })]);
    if (ending) throw new Error('A host service stopped during preparation');
    await writeContainerKitRecord({ container, home, version: kit.version });
    // the orchestrator and Supercode are the image's own (its .open-autonomy, installed for Linux)
    const kitDir = '/opt/agent/.open-autonomy';
    gateway = harness === 'hermes'
      ? startContainerProcess({ container, cwd: workspace, command: ['hermes', 'gateway', 'run'], env })
      : startContainerProcess({ container, cwd: workspace, command: ['node', `${kitDir}/node_modules/@volter-ai-dev/supercode-orchestrator/bin/orchestrator.mjs`, '--root', home],
        env: { ...env, SUPERCODE_BIN: `${kitDir}/node_modules/.bin/supercode` } });
    void gateway.exited.then(code => { if (!ending) void stop(code === 75 || (restartAsked && code === 0) ? 75 : 1); });
    const runtimeName = harness === 'hermes' ? 'native Hermes' : `the orchestrator (worker ${harness})`;
    console.log(`host: ${runtimeName} at ${prepared.revision}; ${prepared.dirty ? 'unfinished checkout preserved' : 'checkout current'}; kit ${kit.version}`);
    const restart = () => { if (harness === 'hermes') return gateway?.restart(); restartAsked = true; void gateway?.close(); };
    // What the agent IS is what main says, and main moves while it runs (start.ts's watch, read in the executor): every
    // ten minutes the checkout fetches main; a move that touches the stack's own files (hermes/, .open-autonomy/) drains
    // the runtime once the board is quiet, and this host exits 75, which its service manager restarts onto the new main.
    // A move that touches only the project's books advances the mark; a checkout with tracked changes is left alone.
    let startedMain = prepared.revision, watching = false;
    mainWatch = setInterval(async () => {
      if (ending || watching || restartAsked) return;
      watching = true;
      try {
        const seen = await containerMainMoved({ container, home, workspace, since: startedMain });
        if (!seen.main || seen.main === startedMain) return;
        if (!seen.changed.some(file => file.startsWith('hermes/') || file.startsWith('.open-autonomy/'))) { startedMain = seen.main; return; }
        if (seen.busy === null) { console.error('host: cannot read the board; the restart onto main waits'); return; }
        if (seen.busy) return;
        console.log(`host: main moved to ${seen.main.slice(0, 8)}; asking ${runtimeName} to drain before restarting the stack onto it`);
        restartAsked = true;
        restart();
      } catch (error) {
        console.error(`host: cannot read main in the executor; the watch tries again in ten minutes (${error instanceof Error ? error.message : String(error)})`);
      } finally { watching = false; }
    }, 10 * 60_000);
    return { exited, close: () => stop(0), restart };
  } catch (error) { await stop(1); throw error; }
}
