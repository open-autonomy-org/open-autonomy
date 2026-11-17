// A prepared generation contains its entire committed tree, independent of its caller's sparse checkout.
import { accessSync, constants, existsSync, lstatSync, mkdirSync, readlinkSync, renameSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
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

// Each gitlink's submodule name, as .gitmodules registers it; git keeps a submodule's own repository under that name.
function submoduleNames(project: string, revision: string, prefix: string): Map<string, string> {
  const names = new Map<string, string>();
  const records = git(project, ['config', '-z', '-f', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$'], prefix || '.', revision).split('\0');
  for (const record of records) {
    const at = record.indexOf('\n');
    if (at > 0) names.set(record.slice(at + 1), record.slice('submodule.'.length, at - '.path'.length));
  }
  return names;
}
// Long-lived reference stores of submodule objects: one bare clone per gitlink URL (git's form for a repository that
// only holds objects and refs, with no working tree) in `stores`, a kit-owned directory beside the generations. Git
// defines no location for a reference-only store, and its own modules/<name> is the long-lived checkout's real
// submodule repository, so neither is used. Retirement reads only the generations directory and never removes a store.
// A store is cloned once into a sibling that is renamed into place: an interrupted clone is never taken for a store,
// and when concurrent preparations both clone, the first rename wins and the other copy is discarded. When it lacks
// the commit a generation needs, that exact commit is fetched into a ref of its own, with the remote's tags, under
// git's own ref locks, which wait for a concurrent fetch instead of failing. Anything else at a store's path is refused
// as found, never fetched into.
async function keepStore(project: string, entry: Entry, name: string, stores: string, run: Run): Promise<string> {
  // Native init registers the gitlink's URL as update --init would, resolving a relative one against its superproject.
  await run(['git', ...complete, 'submodule', 'init', '--', `:(literal)${entry.path}`], project);
  const url = await run(['git', 'config', '--get', `submodule.${name}.url`], project);
  const plain = (url.replace(/\/+$/u, '').split(/[/:]/u).pop() ?? '').replace(/\.git$/u, '').replace(/[^A-Za-z0-9._-]/gu, '') || 'submodule';
  const store = join(stores, `${plain}-${createHash('sha256').update(url).digest('hex').slice(0, 16)}.git`);
  if (!existsSync(store)) {
    mkdirSync(stores, { recursive: true });
    const partial = `${store}.partial-${randomUUID()}`;
    try {
      await run(['git', 'clone', '--quiet', '--bare', '--', url, partial], project);
      try { renameSync(partial, store); } catch (error) { if (!existsSync(store)) throw error; }
    } finally { await rm(partial, { recursive: true, force: true }); }
  }
  const bare = await run(['git', '--git-dir', store, 'rev-parse', '--is-bare-repository'], project).catch(() => '');
  const origin = bare === 'true' ? await run(['git', '--git-dir', store, 'config', '--get', 'remote.origin.url'], project).catch(() => '') : '';
  if (bare !== 'true' || origin !== url) throw new Error(`${store} is not a bare clone of this gitlink's URL; it was left as found`);
  const held = await run(['git', '--git-dir', store, 'cat-file', '-e', `${entry.revision}^{commit}`], project).then(() => true, () => false);
  if (!held) await run(['git', '--git-dir', store, '-c', 'core.filesRefLockTimeout=60000', '-c', 'core.packedRefsTimeout=60000',
    'fetch', '--quiet', '--tags', '--no-write-fetch-head', 'origin', `${entry.revision}:refs/gitlinks/${entry.revision}`], project);
  return store;
}
// Each gitlink is cloned borrowing its long-lived store's objects (keepStore) and dissociated from it, so the
// generation never depends on the store afterwards and fetches only what the store lacks.
async function populate(project: string, revision: string, prefix: string, run: Run, stores: string): Promise<void> {
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
  const names = inventory.some(entry => entry.mode === '160000') ? submoduleNames(project, revision, prefix) : new Map<string, string>();
  for (const entry of inventory) {
    if (entry.mode !== '160000') { requireEntry(project, entry, revision, prefix); continue; }
    const relative = prefix + entry.path, name = names.get(entry.path);
    try {
      if (!name) throw new Error('.gitmodules registers no submodule at this path');
      const store = await keepStore(project, entry, name, stores, run);
      // Native init retains its normal URL registration; only the owned checkout's sparse behavior is overridden.
      await run(['git', ...complete, 'submodule', 'update', '--init', '--checkout', '--reference', store, '--dissociate', '--', `:(literal)${entry.path}`], project);
      await populate(join(project, entry.path), entry.revision, relative + '/', run, stores);
    } catch (cause) { throw refused(relative, entry.revision, cause); }
  }
}
/** `stores` holds the long-lived reference stores of submodule objects (keepStore). */
export async function checkoutCompleteSource(project: string, snapshot: string, revision: string, run: Run, stores: string): Promise<void> {
  try { await run(['git', 'worktree', 'add', '--detach', '--no-checkout', snapshot, revision], project); }
  catch (cause) { throw refused('.', revision, cause); }
  await populate(snapshot, revision, '', run, stores);
  assertCompleteSource(snapshot, revision);
}
