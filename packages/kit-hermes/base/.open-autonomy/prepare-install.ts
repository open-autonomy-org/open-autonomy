// Prepare one immutable kit/project input before asking a serving keeper to change. No home, port or service is
// touched. Dependency installation finishes in the new detached worktree; a refusal preserves the serving inputs.
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { agentHarness, readAgent } from './agent.ts';
import { installHostRuntime, runtimeInstallIdentity, machinePublishedBinding } from './install-runtime.ts';

export type InstallReceipt = { version: 1; kind: 'open-autonomy-install'; home: string; sourceProject: string; project: string;
  entry: string; revision: string; kitVersion: string; runtimeIdentity: string; source: string | null; release: string | null; registry: string; archive: string | null; receipt: string };
const run = async (cmd: string[], cwd: string): Promise<string> => {
  const child = Bun.spawn({ cmd, cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error(`${cmd.slice(0, 3).join(' ')} failed (${code}): ${err.trim()}`);
  return out.trim();
};
export async function prepareInstall({ project, home, revision, source = null, release = null, registry, archive, environment = process.env as Record<string, string> }:
  { project: string; home: string; revision: string; source?: string | null; release?: string | null; registry?: string; archive?: string; environment?: Record<string, string> }): Promise<InstallReceipt> {
  project = realpathSync(project); home = realpathSync(home);
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
  const setup = readAgent(snapshot);
  if (!setup || (kit.kit !== 'ir' && agentHarness(setup) === 'hermes')) throw new Error('this candidate lacks the native gateway readiness protocol; the serving install was preserved');
  const identity = runtimeInstallIdentity({ directory: host, environment: env, registry, archive });
  writeFileSync(resolve(host, 'node_modules/.open-autonomy-install'), `${identity}\n`);
  const receipt: InstallReceipt = { version: 1, kind: 'open-autonomy-install', home, sourceProject: project, project: snapshot,
    entry: resolve(host, 'start.ts'), revision: commit, kitVersion: kit.version, runtimeIdentity: identity, source, release, registry, archive: archive ?? null,
    receipt: resolve(directory, 'install.json') };
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
  const metadata = Bun.spawnSync(['git', '-C', receipt.project, 'rev-parse', 'HEAD']);
  if (metadata.exitCode !== 0 || metadata.stdout.toString().trim() !== receipt.revision) throw new Error('prepared kit project commit changed');
  const status = Bun.spawnSync(['git', '-C', receipt.project, 'status', '--porcelain', '--untracked-files=no']);
  if (status.exitCode !== 0 || status.stdout.toString().trim()) throw new Error('prepared kit tracked inputs changed');
  return receipt;
}

if (Bun.main === import.meta.path) {
  const args = process.argv.slice(2), value = (name: string) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
  const project = value('--project'), home = value('--home'), revision = value('--revision');
  if (!project || !home || !revision) throw new Error('prepare-install needs --project, --home and --revision');
  console.log(JSON.stringify(await prepareInstall({ project, home, revision, source: value('--source') ?? null, release: value('--release') ?? null, registry: value('--runtime-registry'), archive: value('--runtime-package') })));
}
