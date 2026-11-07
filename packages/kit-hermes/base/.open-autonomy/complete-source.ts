// A prepared generation contains its entire committed tree, independent of its caller's sparse checkout.
import { accessSync, constants, lstatSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSyncWork } from './work-ledger.ts';

type Entry = { mode: string; revision: string; path: string };
type Run = (cmd: string[], cwd: string) => Promise<string>;
const complete = ['-c', 'core.sparseCheckout=false', '-c', 'core.sparseCheckoutCone=false', '-c', 'index.sparse=false',
  '-c', 'submodule.recurse=false'];
const refused = (path: string, revision: string, cause: unknown): Error =>
  new Error(`prepared source input ${JSON.stringify(path)} at ${revision} is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });

function git(project: string, args: string[], path: string, revision: string): string {
  const result = spawnSyncWork(() => Bun.spawnSync(['git', '-C', project, ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }));
  if (result.exitCode !== 0) throw refused(path, revision, new Error(`git ${args[0]} failed (${result.exitCode}): ${result.stderr.toString().trim()}`));
  return result.stdout.toString();
}
function entries(project: string, revision: string, prefix: string): Entry[] {
  // NUL records retain spaces, tabs and newlines in paths. The inventory comes from the commit, never the index.
  const records = git(project, ['ls-tree', '-r', '-t', '-z', '--full-tree', revision], prefix || '.', revision).split('\0');
  if (records.pop() !== '') throw refused(prefix || '.', revision, new Error('Git returned an incomplete tree inventory'));
  return records.map(record => {
    const match = /^(040000 tree|100644 blob|100755 blob|120000 blob|160000 commit) ([0-9a-f]{40,64})\t([\s\S]+)$/.exec(record);
    if (!match) throw refused(prefix || '.', revision, new Error('Git returned an unsupported tree entry'));
    return { mode: match[1].slice(0, 6), revision: match[2], path: match[3] };
  });
}
function requireEntry(project: string, entry: Entry, revision: string, prefix: string): void {
  const path = join(project, entry.path), relative = prefix + entry.path;
  try {
    const actual = lstatSync(path);
    if (entry.mode === '120000') {
      if (!actual.isSymbolicLink()) throw new Error('expected a symbolic link');
      readlinkSync(path); // The link is the input; an external target is not part of this tree.
    } else if (entry.mode === '040000' || entry.mode === '160000') {
      if (!actual.isDirectory()) throw new Error('expected a directory');
      accessSync(path, constants.R_OK | constants.X_OK);
    } else {
      if (!actual.isFile()) throw new Error('expected a regular file');
      accessSync(path, constants.R_OK);
    }
  } catch (cause) { throw refused(relative, entry.mode === '160000' ? entry.revision : revision, cause); }
}
function assertTree(project: string, revision: string, prefix: string): void {
  for (const entry of entries(project, revision, prefix)) {
    requireEntry(project, entry, revision, prefix);
    if (entry.mode !== '160000') continue;
    const path = join(project, entry.path), relative = prefix + entry.path;
    if (git(path, ['rev-parse', '--show-prefix'], relative, entry.revision) !== '\n'
      || git(path, ['rev-parse', '--verify', 'HEAD'], relative, entry.revision).trim() !== entry.revision)
      throw refused(relative, entry.revision, new Error('Gitlink is not checked out at its exact commit'));
    assertTree(path, entry.revision, relative + '/');
  }
}
/** Shared preparation/admission guard; complete historical snapshots need no new receipt version. */
export function assertCompleteSource(project: string, revision: string): void { assertTree(project, revision, ''); }

async function populate(project: string, revision: string, prefix: string, run: Run): Promise<void> {
  const inventory = entries(project, revision, prefix);
  try { await run(['git', ...complete, 'read-tree', '--reset', '-u', '--no-sparse-checkout', revision], project); }
  catch (cause) {
    // Name the unavailable committed input while retaining the original checkout failure.
    for (const entry of inventory) {
      if (entry.mode === '160000') continue;
      try { requireEntry(project, entry, revision, prefix); }
      catch (missing) { throw new Error(`${(missing as Error).message}; ${(cause as Error).message}`, { cause }); }
    }
    throw refused(prefix || '.', revision, cause);
  }
  for (const entry of inventory) {
    if (entry.mode !== '160000') { requireEntry(project, entry, revision, prefix); continue; }
    const relative = prefix + entry.path;
    try {
      // Native init retains its normal URL registration; only the owned checkout's sparse behavior is overridden.
      await run(['git', ...complete, 'submodule', 'update', '--init', '--checkout', '--', `:(literal)${entry.path}`], project);
      await populate(join(project, entry.path), entry.revision, relative + '/', run);
    } catch (cause) { throw refused(relative, entry.revision, cause); }
  }
}
export async function checkoutCompleteSource(project: string, snapshot: string, revision: string, run: Run): Promise<void> {
  try { await run(['git', 'worktree', 'add', '--detach', '--no-checkout', snapshot, revision], project); }
  catch (cause) { throw refused('.', revision, cause); }
  await populate(snapshot, revision, '', run);
  assertCompleteSource(snapshot, revision);
}
