// Prepare one immutable kit/project input before asking a serving keeper to change. No home, port or service is
// touched. Dependency installation finishes in the new detached worktree; a refusal preserves the serving inputs.
// After an activation finishes, the keeper retires the generations no one needs any more (retireInstalls).
import { spawnSyncWork, spawnWork, stopWorkChild } from './work-ledger.ts';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve, sep } from 'node:path';
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
  // A failed preparation stays for diagnosis until the next activation finishes. Preparation itself deletes, rewrites
  // or checks out no existing generation.
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
  await installHostRuntime({ directory: host, environment: env, frozen: existsSync(resolve(host, 'pnpm-lock.yaml')),
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

// Generation retention, run by the keeper once an activation has finished. A home keeps the generation it serves, the
// one that serving generation replaced (its rollback) and every generation a running process still uses: its command
// line, working directory or an open file lies inside it, the keeper's own generation included. Every other generation
// whose receipt names this home and was written before the serving one's is removed, failed preparations with a
// receipt included; one prepared after it waits for the next activation, and a directory with no such receipt is never
// touched. As ADR 0031 has retirement, it names exact directories and exact worktree registrations, and never stops a
// process. The running processes are read again before each removal; a reading that is not complete (a non-zero
// answer, or one that does not show this process) counts as unread, and then nothing is removed. Each generation gets
// one report line: kept, kept for now or retired.
const GENERATION = /^[0-9a-f]{12}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export async function retireInstalls({ home, project, serving, rollback }: { home: string; project: string; serving: string; rollback: string | null }): Promise<string[]> {
  home = realpathSync(home);
  const installs = realpathSync(resolve(home, '..', 'installs'));
  const current = dirname(realpathSync(serving)), replaced = rollback && existsSync(rollback) ? dirname(realpathSync(rollback)) : null;
  if (dirname(current) !== installs) throw new Error(`the serving receipt ${serving} is not a generation in ${installs}`);
  const read = async (cmd: string[]): Promise<{ out: string; code: number | null }> => {
    const child = spawnWork(() => Bun.spawn({ cmd, stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' }));
    const bound = setTimeout(() => stopWorkChild(child, () => child.kill('SIGKILL'), { signal: 'SIGKILL' }), 60000);
    try { const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]); return { out, code }; }
    finally { clearTimeout(bound); }
  };
  // Every running process's command line, working directory and open files, as one text. A listing that does not
  // show this process was filtered or sandboxed and proves nothing about the others.
  const running = async (): Promise<string> => {
    const ps = await read(['ps', '-axww', '-o', 'pid=,command=']);
    if (ps.code !== 0) throw new Error(`ps answered ${ps.code}`);
    if (!ps.out.split('\n').some(line => line.trim().split(' ', 1)[0] === String(process.pid))) throw new Error('ps did not list this process');
    const lsof = await read(['lsof', '-n', '-w', '-Fpn']);
    if (lsof.code !== 0) throw new Error(`lsof answered ${lsof.code}`);
    if (!lsof.out.split('\n').includes(`p${process.pid}`)) throw new Error('lsof did not list this process');
    return `${ps.out}\n${lsof.out}`;
  };
  const user = (text: string, name: string): string | null => {
    const at = text.indexOf(`${installs}${sep}${name}`);
    if (at < 0) return null;
    const line = text.slice(text.lastIndexOf('\n', at) + 1, at);
    if (!line.startsWith('n')) return line.trim().split(' ', 1)[0] || 'unknown';
    const field = text.lastIndexOf('\np', at);  // an lsof file line belongs to the process field above it
    return field < 0 ? 'unknown' : text.slice(field + 2, text.indexOf('\n', field + 1));
  };
  let seen: string;
  try { seen = await running(); }
  catch (error) { return [`kept for now: every generation in ${installs} (the running processes could not be read: ${(error as Error).message}; the next activation retries)`]; }
  const written = (directory: string): number | null => {
    try {
      const receipt = JSON.parse(readFileSync(join(directory, 'install.json'), 'utf8'));
      return receipt?.kind === 'open-autonomy-install' && receipt.home === home ? statSync(join(directory, 'install.json')).mtimeMs : null;
    } catch { return null; }
  };
  const newest = written(current);
  if (newest === null) throw new Error(`the serving generation ${current} has no receipt for ${home}`);
  const report: string[] = [];
  for (const name of readdirSync(installs).sort()) {
    const directory = join(installs, name);
    if (directory === current) { report.push(`kept: ${directory} (serving)`); continue; }
    if (directory === replaced) { report.push(`kept: ${directory} (the generation the serving one replaced; its rollback)`); continue; }
    if (!GENERATION.test(name) || !lstatSync(directory, { throwIfNoEntry: false })?.isDirectory()) continue;
    const at = written(directory);
    if (at === null) { report.push(`kept: ${directory} (no install receipt names this home)`); continue; }
    if (at >= newest) { report.push(`kept for now: ${directory} (prepared after the serving generation; the next activation decides)`); continue; }
    let pid = user(seen, name);
    if (pid === null) {
      try { seen = await running(); pid = user(seen, name); }
      catch (error) { report.push(`kept for now: ${directory} and every later generation (the running processes could not be read again: ${(error as Error).message}; the next activation retries)`); break; }
    }
    if (pid !== null) { report.push(`kept: ${directory} (process ${pid} uses it)`); continue; }
    try {
      // The snapshot is a detached worktree of the project, registered at the admin directory its .git file names.
      // That pointer is read before anything is removed; a snapshot without one has no registration.
      const snapshot = join(directory, 'project');
      let admin: string | null = null;
      try {
        const pointer = readFileSync(join(snapshot, '.git'), 'utf8').match(/^gitdir: (.+)$/m)?.[1]?.trim();
        if (pointer) admin = resolve(snapshot, pointer);
      } catch { /* no .git file: no registration */ }
      const unregistered = admin ? await run(['git', 'worktree', 'remove', '--force', '--force', snapshot], project).then(() => true, () => false) : true;
      await rm(directory, { recursive: true, force: true });
      let note = '';
      // A registration Git would not remove goes with its generation: exactly the admin directory the snapshot named,
      // and only while its own gitdir file still points inside this generation. No other registration is touched.
      if (!unregistered && admin && existsSync(admin)) {
        let back: string | null = null;
        try { back = resolve(admin, readFileSync(join(admin, 'gitdir'), 'utf8').trim()); } catch { /* unreadable: not provably ours */ }
        if (basename(dirname(admin)) === 'worktrees' && back?.startsWith(`${directory}${sep}`)) await rm(admin, { recursive: true, force: true });
        else note = `; its worktree registration ${admin} was kept, since its gitdir does not point inside this generation`;
      }
      report.push(`retired: ${directory}${note}`);
    } catch (error) { report.push(`kept for now: ${directory} (it could not be removed: ${(error as Error).message}; the next activation retries)`); }
  }
  return report;
}

if (Bun.main === import.meta.path) {
  const args = process.argv.slice(2), value = (name: string) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
  const project = value('--project'), home = value('--home'), revision = value('--revision');
  if (!project || !home || !revision) throw new Error('prepare-install needs --project, --home and --revision');
  console.log(JSON.stringify(await prepareInstall({ project, home, revision, source: value('--source') ?? null, release: value('--release') ?? null, registry: value('--runtime-registry'), archive: value('--runtime-package') })));
}
