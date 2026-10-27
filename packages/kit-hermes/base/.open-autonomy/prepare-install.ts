// Prepare one immutable kit/project input before asking a serving keeper to change. No home, port or service is
// touched. Dependency installation finishes in the new detached worktree; a refusal preserves the serving inputs.
import { spawnSyncWork, spawnWork } from './work-ledger.ts';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installHostRuntime, runtimeInstallIdentity, machinePublishedBinding, machineSourceReceipt } from './install-runtime.ts';

export type InstallReceipt = { version: 1; kind: 'open-autonomy-install'; home: string; sourceProject: string; project: string;
  entry: string; revision: string; kitVersion: string; runtimeIdentity: string; source: string | null; release: string | null; registry: string; archive: string | null; receipt: string;
  initiator: Initiator };
// Who asked for this preparation. Supercode's machine owner, which runs it for an activation, relays the activating
// command's own reading in SUPERCODE_INITIATOR stamped with the owner's pid; it is taken only from this process's actual
// parent, so a value left in a long-lived environment never names a later preparation, and it is re-checked here field
// by field, as any other input. Anything else records this process's own facts. Every kept text passes the Teams
// redactor and is cut on a code-point boundary; without the redactor no text but the pid facts is kept. The board's
// per-run launch secret is never a claim, and its value is redacted wherever it appears. A record, never an authority.
//
// The redactor is the machine's own supercode's (@volter/teams/redact), loaded by its file path in the selection this
// preparation is for: a source pin's tree or a retained release's closure. The kit's own install does not carry it, and
// no package specifier is resolved, so nothing is ever fetched to find it.
// The file is taken only where it really lies inside that root (a source tree links it from its own sdk/volter-teams);
// a link that leads outside the root names no redactor, and only the pids are kept.
function redactorPath(supercodeRoot: string | null): string | null {
  if (!supercodeRoot) return null;
  let root: string;
  try { root = realpathSync(supercodeRoot); } catch { return null; }
  const modules = join(root, 'node_modules', '@volter');
  for (const path of [join(modules, 'supercode-teams', 'node_modules', '@volter', 'teams', 'redact.mjs'), join(modules, 'teams', 'redact.mjs')]) {
    if (!existsSync(path)) continue;
    const actual = realpathSync(path);
    return actual.startsWith(root + sep) ? actual : null;
  }
  return null;
}
/** The supercode root a complete machine selection names: the staged source candidate's tree, or the retained release. */
function supercodeRootOf(source: string | null, release: string | null): string | null {
  try {
    if (source) return JSON.parse(readFileSync(source, 'utf8')).lock?.root ?? null;
    if (release) return JSON.parse(readFileSync(release, 'utf8')).root ?? null;
  } catch { /* an unreadable selection names no redactor */ }
  return null;
}
export type Initiator = { version: 1; at: string | null; pid: number; ppid: number | null; executable: string | null; argv: string[]; cwd: string | null;
  session: string | null; session_error: string | null; claims: Record<string, string>;
  ancestry: { pid: number; parent_pid: number | null; image: string | null; command_line: string | null }[]; ancestry_error: string | null };
const CLAIMS = ['CLAUDE_CODE_SESSION_ID', 'CODEX_THREAD_ID', 'SUPERCODE_CALLER', 'SUPERCODE_AGENT_ID', 'SUPERCODE_AGENT_SESSION',
  'SUPERCODE_HOOK_SESSION', 'SUPERCODE_BOARD_OWNER_PID'];
const pidOf = (value: unknown): number | null => Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 0xffffffff ? value as number : null;
export async function installInitiator(environment: Record<string, string | undefined>, supercodeRoot: string | null): Promise<Initiator> {
  let redact: ((text: string) => string) | null = null;
  const launch = environment.SUPERCODE_RUN_LAUNCH;
  try {
    const path = redactorPath(supercodeRoot);
    if (path) {
      const module = await import(pathToFileURL(path).href);
      redact = (text: string) => {
        const clean: string = module.redactText(text);
        return launch && launch.length >= 8 ? clean.split(launch).join('[redacted:SUPERCODE_RUN_LAUNCH]') : clean;
      };
    }
  } catch { /* no redactor: no text is kept */ }
  const text = (value: unknown, max = 1024): string | null => {
    if (typeof value !== 'string' || !redact) return null;
    let clean: string;
    try { clean = redact(value.toWellFormed()); } catch { return null; }
    if (clean.length <= max) return clean;
    const last = clean.charCodeAt(max - 1);
    return `${clean.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max)}…`;
  };
  const check = (value: any): Initiator | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || pidOf(value.pid) === null) return null;
    const claims: Record<string, string> = {};
    for (const name of CLAIMS) { const kept = text(value.claims?.[name], 256); if (kept !== null) claims[name] = kept; }
    return { version: 1, at: text(value.at, 64), pid: value.pid, ppid: pidOf(value.ppid), executable: text(value.executable),
      argv: Array.isArray(value.argv) ? value.argv.slice(0, 64).map((word: unknown) => text(word)).filter((word: string | null): word is string => word !== null) : [],
      cwd: text(value.cwd, 4096), session: text(value.session, 512), session_error: text(value.session_error, 512), claims,
      ancestry: Array.isArray(value.ancestry) ? value.ancestry.slice(0, 32).filter((row: any) => pidOf(row?.pid) !== null).map((row: any) => ({
        pid: row.pid, parent_pid: pidOf(row.parent_pid), image: text(row.image, 256), command_line: text(row.command_line, 2048) })) : [],
      ancestry_error: text(value.ancestry_error, 512) };
  };
  const raw = environment.SUPERCODE_INITIATOR;
  if (raw && raw.length <= 65536) try {
    const relayed = JSON.parse(raw);
    if (relayed?.relay_pid === process.ppid) { const checked = check(relayed); if (checked) return checked; }
  } catch { /* not a relayed initiator: this process's own facts below */ }
  let cwd: string | null = null;
  try { cwd = process.cwd(); } catch { /* a removed directory has no name */ }
  return check({ version: 1, at: new Date().toISOString(), pid: process.pid, ppid: process.ppid, executable: process.execPath, argv: process.argv, cwd,
    session: null, session_error: 'not read: no initiator was relayed to this preparation', claims: environment, ancestry: [], ancestry_error: 'not read' })!;
}
const run = async (cmd: string[], cwd: string): Promise<string> => {
  const child = spawnWork(() => Bun.spawn({ cmd, cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }));
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error(`${cmd.slice(0, 3).join(' ')} failed (${code}): ${err.trim()}`);
  return out.trim();
};
export async function prepareInstall({ project, home, revision, source = null, release = null, registry, archive, environment = process.env as Record<string, string> }:
  { project: string; home: string; revision: string; source?: string | null; release?: string | null; registry?: string; archive?: string; environment?: Record<string, string> }): Promise<InstallReceipt> {
  project = realpathSync(project); home = realpathSync(home);
  source ??= release ? null : machineSourceReceipt(environment);
  if (source && release) throw new Error('kit preparation names one complete machine selection');
  if (source) source = realpathSync(source);
  if (release) release = realpathSync(release);
  registry ??= environment.NPM_REGISTRY_TWIN_URL ?? 'https://registry.npmjs.org';
  archive ??= environment.OPEN_AUTONOMY_RUNTIME_PACKAGE;
  const commit = await run(['git', 'rev-parse', '--verify', `${revision}^{commit}`], project);
  if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new Error('install preparation has no exact project commit');
  const directory = resolve(home, '..', 'installs', `${commit.slice(0, 12)}-${randomUUID()}`), snapshot = resolve(directory, 'project');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Keep failed preparation inputs for diagnosis. No existing generation is deleted, rewritten or checked out.
  await run(['git', 'worktree', 'add', '--detach', snapshot, commit], project);
  const host = resolve(snapshot, '.open-autonomy');
  if (archive) {
    const copied = resolve(directory, statSync(archive).isDirectory() ? 'artifacts' : 'runtime.tgz');
    cpSync(realpathSync(archive), copied, { recursive: true, errorOnExist: true, force: false }); archive = copied;
  }
  const env = { ...environment };
  delete env.SUPERCODE_SOURCE_CANDIDATE; delete env.SUPERCODE_RELEASE_RECEIPT;
  if (source) env.SUPERCODE_SOURCE_CANDIDATE = realpathSync(source);
  if (release) env.SUPERCODE_RELEASE_RECEIPT = release;
  release = machinePublishedBinding(env)?.receipt ?? null;
  await installHostRuntime({ directory: host, environment: env, frozen: existsSync(resolve(host, 'bun.lock')) || existsSync(resolve(host, 'bun.lockb')),
    registry, archive });
  const keeper = resolve(host, 'node_modules/create-open-autonomy/keeper/install-owner.ts');
  if (!existsSync(keeper)) throw new Error('the prepared kit predates serving install handovers');
  const kit = JSON.parse(readFileSync(resolve(host, 'kit.json'), 'utf8'));
  const { agentHarness, readAgent } = await import(resolve(host, 'agent.ts'));
  const setup = readAgent(snapshot);
  if (!setup || (kit.kit !== 'ir' && agentHarness(setup) === 'hermes')) throw new Error('this candidate lacks the native gateway readiness protocol; the serving install was preserved');
  const identity = runtimeInstallIdentity({ directory: host, environment: env, registry, archive });
  writeFileSync(resolve(host, 'node_modules/.open-autonomy-install'), `${identity}\n`);
  const receipt: InstallReceipt = { version: 1, kind: 'open-autonomy-install', home, sourceProject: project, project: snapshot,
    entry: resolve(host, 'start.ts'), revision: commit, kitVersion: kit.version, runtimeIdentity: identity, source, release, registry, archive: archive ?? null,
    receipt: resolve(directory, 'install.json'), initiator: await installInitiator(environment, supercodeRootOf(source, release)) };
  writeFileSync(receipt.receipt, JSON.stringify(receipt) + '\n', { mode: 0o600 });
  return receipt;
}
export function readInstall(path: string, home: string): InstallReceipt {
  path = realpathSync(path); home = realpathSync(home);
  const receipt = JSON.parse(readFileSync(path, 'utf8')) as InstallReceipt;
  if (receipt.version !== 1 || receipt.kind !== 'open-autonomy-install' || receipt.home !== resolve(home) || receipt.receipt !== path
    || dirname(dirname(path)) !== realpathSync(resolve(home, '..', 'installs'))
    || receipt.project !== resolve(dirname(path), 'project') || realpathSync(receipt.project) !== receipt.project
    || receipt.entry !== resolve(receipt.project, '.open-autonomy/start.ts')) throw new Error('kit receipt is not an install prepared for this home');
  const metadata = spawnSyncWork(() => Bun.spawnSync(['git', '-C', receipt.project, 'rev-parse', 'HEAD']));
  if (metadata.exitCode !== 0 || metadata.stdout.toString().trim() !== receipt.revision) throw new Error('prepared kit project commit changed');
  const status = spawnSyncWork(() => Bun.spawnSync(['git', '-C', receipt.project, 'status', '--porcelain', '--untracked-files=no']));
  if (status.exitCode !== 0 || status.stdout.toString().trim()) throw new Error('prepared kit tracked inputs changed');
  return receipt;
}

if (Bun.main === import.meta.path) {
  const args = process.argv.slice(2), value = (name: string) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
  const project = value('--project'), home = value('--home'), revision = value('--revision');
  if (!project || !home || !revision) throw new Error('prepare-install needs --project, --home and --revision');
  console.log(JSON.stringify(await prepareInstall({ project, home, revision, source: value('--source') ?? null, release: value('--release') ?? null, registry: value('--runtime-registry'), archive: value('--runtime-package') })));
}
