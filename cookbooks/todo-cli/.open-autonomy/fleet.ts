// Several projects running together: one executor, one multiplexed Hermes gateway serving each project's own
// hermes/ as a profile, one valve on this host holding each project's key on its own port, one reporter per project,
// one filesystem of checkouts, one Codex login. Nothing about a project changes: its hermes/ and .open-autonomy/ are
// what they are when it runs alone; this is a start-time arrangement (docs/decisions/0006).
//
//   bun .open-autonomy/start.ts --fleet <fleet.json> [--valve <port>] [--secrets-root <dir>] [--state-root <dir>]
//
// fleet.json:
//   { "container": "oa-fleet-<name>",
//     "projects": [ { "account": "owner/repo", "origin": "https://github.com/owner/repo.git" }, … ] }
//
// Inside the executor: the fleet home is /opt/data, its default profile an empty shell that only holds the gateway's
// multiplex flag; each project is /opt/data/profiles/<repo> (synced from its checkout's hermes/ at origin/main on
// every start) with its checkout at /work/<repo>. On this host, each project's credentials are
// <secrets-root>/<owner>/<repo>/ (agent.env; github-app.json when it has one) and its reporter
// state <state-root>/<owner>/<repo>/host/. Ports from --valve (8787): the Codex forward on +2; project i's key on
// +4(i+1), its GitHub door on +4(i+1)+3. Profile names are flat in one gateway (docs/decisions/0007): a project's
// nested profiles are composed as <repo>-<profile> beside it, never dropped; each profile's setup is its project's
// .open-autonomy/agent.json entry, applied into its home before the gateway starts. A fleet opens no treasurer door:
// work is routed to a profile by its bare name, which a composed <repo>-treasurer is not, so nothing in a fleet pays;
// every profile's pay address is its key's, which spends and stops at zero.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { resolve } from 'node:path';
import { codexAccess } from './codex-auth.ts';
import { checkCredentialDirectory } from './credentials.ts';
import { startContainerProcess } from './container-process.ts';
import { ensureContainerClone, mergeImageDenylist, prepareContainerHome, prepareContainerSubscription, writeContainerEnvironment, writeContainerKitRecord, writeContainerText } from './container-home.ts';
import { agentModels, applyAgent, parseAgent, type Setup } from './agent.ts';

const PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/; // Hermes's own profile id rule
type Project = { account: string; origin: string; name: string; secrets: string; state: string; home: string; workspace: string; key: number; github?: number };

export async function startFleet(options: { definition: string; port: number; secretsRoot?: string; stateRoot?: string }) {
  const def = JSON.parse(readFileSync(options.definition, 'utf8')) as { container?: string; projects?: Array<{ account?: string; origin?: string }> };
  const container = def.container ?? '';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error('fleet.json must name the executor container');
  const { port } = options;
  const count = (def.projects ?? []).length;
  if (!Number.isInteger(port) || port < 1024 || port + 4 * (count + 1) > 65535) throw new Error(`The valve needs a base port with room for ${count} project(s) above it`);
  const secretsRoot = resolve(options.secretsRoot ?? process.env.AGENT_SECRETS_ROOT ?? resolve(homedir(), '.config/open-autonomy'));
  const stateRoot = resolve(options.stateRoot ?? resolve(homedir(), '.local/state/open-autonomy'));
  const fleetHome = '/opt/data';
  const kit = JSON.parse(readFileSync(resolve(import.meta.dir, 'kit.json'), 'utf8'));
  const say = (m: string) => console.log(`fleet: ${m}`);

  // 1. The projects, each a complete kit install of its own; the profile name is the repository's, and two projects
  //    cannot share one.
  const projects: Project[] = [];
  for (const [i, p] of (def.projects ?? []).entries()) {
    if (!p.account || !/^[\w.-]+\/[\w.-]+$/.test(p.account) || !p.origin) throw new Error(`fleet.json project ${i}: account (owner/repo) and origin are required`);
    const [owner, repo] = p.account.split('/');
    const name = repo.toLowerCase();
    if (!PROFILE.test(name)) throw new Error(`${p.account}: the repository name is not a Hermes profile id (lowercase letters, digits, - and _)`);
    if (projects.some((q) => q.name === name)) throw new Error(`${p.account}: another project already claims the profile ${name}`);
    const secrets = checkCredentialDirectory(resolve(secretsRoot, owner, repo));
    if (!existsSync(resolve(secrets, 'agent.env'))) throw new Error(`${p.account}: no ${resolve(secrets, 'agent.env')}; mint the project's key before it joins the fleet`);
    const state = checkCredentialDirectory(resolve(stateRoot, owner, repo, 'host'));
    mkdirSync(state, { recursive: true, mode: 0o700 });
    const base = port + 4 * (i + 1);
    projects.push({ account: p.account, origin: p.origin, name, secrets, state, home: `${fleetHome}/profiles/${name}`, workspace: `/work/${name}`, key: base,
      ...(existsSync(resolve(secrets, 'github-app.json')) ? { github: base + 3 } : {}) });
  }
  if (!projects.length) throw new Error('fleet.json names no projects');

  const services: ReturnType<typeof Bun.spawn>[] = [];
  let gateway: ReturnType<typeof startContainerProcess> | undefined;
  let ending: Promise<void> | undefined;
  let finish!: (code: number) => void;
  const exited = new Promise<number>((r) => { finish = r; });
  const stop = (code: number): Promise<void> => ending ??= (async () => {
    await gateway?.close();
    for (const proc of services) if (proc.exitCode === null) proc.kill();
    const force = setTimeout(() => { for (const proc of services) if (proc.exitCode === null) proc.kill('SIGKILL'); }, 5000);
    await Promise.all(services.map((proc) => proc.exited));
    clearTimeout(force);
    process.off('SIGTERM', onSignal); process.off('SIGINT', onSignal);
    finish(code);
  })();
  const onSignal = () => { void stop(0); };
  process.on('SIGTERM', onSignal); process.on('SIGINT', onSignal);
  const own = (name: string, cmd: string[], extra: { env?: Record<string, string | undefined>; ipc?: (message: any) => void } = {}) => {
    const proc = Bun.spawn({ cmd, stdin: 'ignore', stdout: 'inherit', stderr: 'inherit', ...extra });
    services.push(proc);
    void proc.exited.then((code) => { if (!ending) { console.error(`fleet: ${name} ended (${code})`); void stop(1); } });
  };
  const ready = async (check: () => Promise<boolean>, name: string) => {
    const deadline = Date.now() + 30_000;
    while (!ending && Date.now() < deadline) { if (await check()) return; await Bun.sleep(100); }
    throw new Error(`the host did not establish ${name}; Hermes was not started`);
  };
  const healthy = async (p: number) => { try { return (await fetch(`http://127.0.0.1:${p}/healthz`, { signal: AbortSignal.timeout(1000) })).text().then((t) => t.startsWith('ok')); } catch { return false; } };
  const host = 'http://host.docker.internal';

  try {
    own('executor', ['docker', 'wait', container]);
    // 2. The GitHub doors first: a private project's clone and fetch inside the executor go through its own port.
    const githubArgs = projects.filter((p) => p.github).flatMap((p) => ['--github-app', `${resolve(p.secrets, 'github-app.json')}:${p.github}`]);
    if (githubArgs.length) {
      own('github valve', ['bun', resolve(import.meta.dir, 'valve.ts'), '--loopback', ...githubArgs]);
      await ready(async () => (await Promise.all(projects.filter((p) => p.github).map((p) => healthy(p.github!)))).every(Boolean), 'the GitHub doors');
    }
    for (const p of projects) if (!p.github) say(`${p.account}: no github-app.json; the profile has no GitHub door and its checkout must be reachable without one`);
    // 3. Each project's checkout and profile home, from its own origin/main.
    let onCodex = false;
    const configs = new Map<string, string>();
    const agents = new Map<string, Setup>();
    // a project's nested profile, composed flat beside it: <repo>-<profile>
    const profileHome = (p: Project, profile: string) => (profile === 'default' ? p.home : `${fleetHome}/profiles/${p.name}-${profile}`);
    const composed = new Set(projects.map((p) => p.name));
    for (const p of projects) {
      const clone = await ensureContainerClone({ container, workspace: p.workspace, origin: p.origin, home: p.home, ...(p.github ? { door: `${host}:${p.github}/${p.account}` } : {}) });
      const prepared = await prepareContainerHome({ container, home: p.home, workspace: p.workspace });
      if ((Bun.YAML.parse(prepared.config) as any)?.account !== p.account) throw new Error(`${p.workspace} names another account than ${p.account}`);
      if (!prepared.agent) throw new Error(`${p.account}: no .open-autonomy/agent.json at ${prepared.revision.slice(0, 8)}; run \`create-open-autonomy upgrade\` there (docs/decisions/0007)`);
      const setup = parseAgent(prepared.agent, `${p.account}:.open-autonomy/agent.json`);
      agents.set(p.name, setup);
      for (const profile of Object.keys(setup.profiles).filter((n) => n !== 'default')) {
        const flat = `${p.name}-${profile}`;
        if (!PROFILE.test(flat)) throw new Error(`${p.account}: its ${profile} profile would be ${flat}, which is not a Hermes profile id; the fleet refuses rather than drop it`);
        if (composed.has(flat)) throw new Error(`${p.account}: its ${profile} profile would be ${flat}, which another profile already is; the fleet refuses rather than drop it`);
        composed.add(flat);
        // its content (persona, skills) from the project's own nested profile, copied into the flat home
        const copy = Bun.spawnSync({ cmd: ['docker', 'exec', '--user', 'hermes', container, 'sh', '-c', 'mkdir -p "$2" && cp -a "$1/." "$2/"', 'compose', `${p.home}/profiles/${profile}`, profileHome(p, profile)], stdout: 'pipe', stderr: 'pipe', timeout: 30_000 });
        if (copy.exitCode !== 0) throw new Error(`${p.account}: composing ${flat} failed: ${copy.stderr.toString().trim()}`);
      }
      configs.set(p.name, prepared.config);
      onCodex ||= agentModels(setup).some((m) => m?.provider === 'openai-codex');
      say(`${p.account}: ${clone} at ${p.workspace}, profile ${p.name} at ${prepared.revision.slice(0, 8)}${prepared.dirty ? ' (unfinished checkout preserved)' : ''}`);
    }
    // 4. The one Codex login, forwarded once for every profile.
    const twin = process.env.HERMES_CODEX_BASE_URL?.trim();
    if (onCodex && !twin) await codexAccess();
    const codexBase = onCodex ? (twin || `${host}:${port + 2}/backend-api/codex`) : '';
    for (const p of projects) {
      const setup = agents.get(p.name)!;
      for (const profile of Object.keys(setup.profiles)) {
        const home = profileHome(p, profile);
        if (onCodex) await prepareContainerSubscription({ container, home, baseUrl: codexBase });
        await writeContainerEnvironment({ container, home, env: {
          HOME: home, HERMES_HOME: home, TERMINAL_CWD: p.workspace, HERMES_CODEX_BASE_URL: codexBase, CODEX_HOME: `${home}/codex-home-none`,
          OPEN_AUTONOMY_BASE_URL: `${host}:${p.key}/v1`, OPEN_AUTONOMY_PAY_URL: `${host}:${p.key}/v1`, OPEN_AUTONOMY_KEY: 'valve',
          HERMES_WRITE_SAFE_ROOT: [fleetHome, ...projects.map((q) => q.workspace)].join(':'),
          ...(p.github ? { GITHUB_API_URL: `${host}:${p.github}`, GITHUB_TOKEN: 'valve' } : {}) } });
        await writeContainerKitRecord({ container, home, version: kit.version });
      }
      // each profile's setup into its home, before the gateway: Hermes's own functions inside the executor
      for (const line of await applyAgent({ setup, homeOf: (profile) => profileHome(p, profile), homeId: p.account, stateRoot: resolve(p.state, 'apply'), workspace: p.workspace, container })) say(`${p.name}: agent: ${line}`);
      for (const profile of Object.keys(setup.profiles)) await mergeImageDenylist({ container, home: profileHome(p, profile) });
    }
    // 5. The fleet's default profile: an empty shell whose only word is the multiplex flag (and the model the
    //    gateway needs to boot, the first project's). It answers no channel and runs no job.
    const model = ((Bun.YAML.parse(readProfileConfig(container, projects[0].home)) as any)?.model ?? {}) as Record<string, string>;
    const modelBlock = Object.keys(model).length ? `model:\n${Object.entries(model).filter(([, v]) => typeof v === 'string').map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join('\n')}\n` : '';
    const imageSeed = Bun.spawnSync({ cmd: ['docker', 'exec', container, 'sh', '-c', 'cat /opt/hermes/cli-config.yaml.example 2>/dev/null || true'], stdout: 'pipe', stderr: 'pipe', timeout: 10_000 });
    const disabled = ((Bun.YAML.parse(imageSeed.stdout.toString() || '{}') as any)?.plugins?.disabled ?? []) as string[];
    const pluginsBlock = disabled.length ? `plugins:\n  disabled:\n${disabled.map((k) => `    - ${JSON.stringify(k)}`).join('\n')}\n` : '';
    await writeContainerText({ container, home: fleetHome, name: 'config.yaml', text: `# The fleet's default profile: composed by the host, never a project's. Every project is a profile beside it.\ngateway:\n  multiplex_profiles: true\n${modelBlock}memory:\n  memory_enabled: false\n  user_profile_enabled: false\n${pluginsBlock}` });
    await writeContainerEnvironment({ container, home: fleetHome, env: { HOME: fleetHome, HERMES_HOME: fleetHome, HERMES_CODEX_BASE_URL: codexBase, CODEX_HOME: `${fleetHome}/codex-home-none` } });
    if (onCodex) await prepareContainerSubscription({ container, home: fleetHome, baseUrl: codexBase });
    // 6. The valve: every project's key on its own port, the Codex forward once.
    const keyArgs = projects.flatMap((p) => ['--key', `${resolve(p.secrets, 'agent.env')}:${p.key}`]);
    if (onCodex && !twin) keyArgs.push('--codex', String(port + 2));
    own('valve', ['bun', resolve(import.meta.dir, 'valve.ts'), '--loopback', ...keyArgs]);
    await ready(async () => (await Promise.all(projects.map((p) => healthy(p.key)))).every(Boolean), 'the credential valves');
    // 7. One reporter per project, each watching its own profile home, publishing to its own account.
    const inspected = Bun.spawnSync({ cmd: ['docker', 'inspect', '--format', '{{.Config.Image}}', container], stdout: 'pipe', stderr: 'pipe', timeout: 10_000 });
    const runtime = JSON.stringify({ mode: 'container', kit: kit.version, executor: inspected.exitCode === 0 ? inspected.stdout.toString().trim() : undefined, host: hostname(), fleet: container });
    const readiness: Promise<void>[] = [];
    for (const p of projects) {
      const reportConfig = resolve(p.state, 'project-config.yaml');
      writeFileSync(reportConfig, configs.get(p.name)!, { mode: 0o600 });
      let reportReady!: () => void;
      readiness.push(new Promise<void>((r) => { reportReady = r; }));
      own(`reporter ${p.name}`, ['bun', resolve(import.meta.dir, 'reporter.ts'), '--container', container, '--config', reportConfig, '--project', p.workspace, '--state-file', resolve(p.state, 'reporter-state.json')],
        { env: { ...process.env, HERMES_HOME: p.home, OPEN_AUTONOMY_BASE_URL: `http://127.0.0.1:${p.key}/v1`, OPEN_AUTONOMY_KEY: 'valve', OPEN_AUTONOMY_RUNTIME: runtime }, ipc(message) { if (message?.type === 'reporter-ready') reportReady(); } });
    }
    await Promise.race([Promise.all(readiness), exited.then(() => { throw new Error('the runtime stopped before the reporters were ready'); })]);
    if (ending) throw new Error('a host service stopped during preparation');
    // 8. One gateway over the composed home (every profile's schedule is already applied).
    gateway = startContainerProcess({ container, cwd: '/work', command: ['hermes', 'gateway', 'run'], env: {
      HOME: fleetHome, HERMES_HOME: fleetHome, HERMES_GATEWAY_EXTERNAL_SUPERVISOR: '1', GATEWAY_MULTIPLEX_PROFILES: 'true', HERMES_CODEX_BASE_URL: codexBase, CODEX_HOME: `${fleetHome}/codex-home-none`,
      // Every checkout is a place the agents write; the image names only the project shape's.
      HERMES_WRITE_SAFE_ROOT: [fleetHome, ...projects.map((q) => q.workspace)].join(':') } });
    void gateway.exited.then((code) => { if (!ending) void stop(code === 75 ? 75 : 1); });
    say(`${composed.size} profile(s) of ${projects.length} project(s) on ${container}, kit ${kit.version}: ${projects.map((p) => `${p.name} key :${p.key}${p.github ? ` github :${p.github}` : ''}`).join(', ')}${onCodex ? `; the Codex login on :${port + 2}` : ''}. The profiles share one user and one network: a fleet is for projects of one organization that trust each other.`);
    return { exited, close: () => stop(0), restart: () => gateway?.restart() };
  } catch (error) { await stop(1); throw error; }
}

// A profile's committed config, read back from the home the executor just synced (the host holds no checkout).
function readProfileConfig(container: string, home: string): string {
  const r = Bun.spawnSync({ cmd: ['docker', 'exec', '--user', 'hermes', container, 'cat', `${home}/config.yaml`], stdout: 'pipe', stderr: 'pipe', timeout: 10_000 });
  return r.exitCode === 0 ? r.stdout.toString() : '';
}
