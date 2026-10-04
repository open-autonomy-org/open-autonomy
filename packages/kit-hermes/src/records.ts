// The records register (docs/decisions/0022-the-records-register.md): a company install's organization keeps one, in its
// record repository, and registers a record before using it. `records init` writes the kit's register template there
// where none is (records-register.md, records.json) and always the kit's current check (tools/records-check.mjs, the one
// file the kit keeps current there), and wires the check into the repository's pre-commit. `records estate` runs the
// check over the estate's roots (records.json `estate.roots`): the auditor's unregistered count.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const KIT_RECORDS = resolve(import.meta.dir, '..', 'records');
const CHECK = 'tools/records-check.mjs';
const HOOK_LINE = `node "$(git rev-parse --show-toplevel)/${CHECK}" staged || exit 1`;

const git = (dir: string, args: string[]): string => {
  try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
};

/** Writes the register's parts into a record repository: only what is missing, except the check, which is the kit's. */
export function initRecords(target: string): { written: string[]; kept: string[]; notes: string[] } {
  if (!existsSync(join(target, '.git'))) throw new Error(`${target} is not a git checkout (the organization's record repository)`);
  const written: string[] = [];
  const kept: string[] = [];
  const notes: string[] = [];
  const place = (rel: string, content: string, mode?: number) => {
    const file = join(target, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    if (mode) chmodSync(file, mode);
    written.push(rel);
  };
  const template = (rel: string) => readFileSync(join(KIT_RECORDS, 'template', rel), 'utf8');
  if (existsSync(join(target, 'records.json'))) kept.push('records.json');
  else place('records.json', template('records.json'));
  const config = JSON.parse(readFileSync(join(target, 'records.json'), 'utf8')) as { register?: string };
  const register = config.register ?? 'records-register.md';
  if (existsSync(join(target, register))) kept.push(register);
  else place(register, template('records-register.md'));
  mkdirSync(join(target, 'tools'), { recursive: true });
  copyFileSync(join(KIT_RECORDS, 'records-check.mjs'), join(target, CHECK));
  chmodSync(join(target, CHECK), 0o755);
  written.push(CHECK);
  // The pre-commit: the kit's, where the repository has none; otherwise the check is called first in its own.
  const hooksPath = git(target, ['config', 'core.hooksPath']) || '.githooks';
  const hook = join(target, hooksPath, 'pre-commit');
  if (!existsSync(hook)) place(`${hooksPath}/pre-commit`, template('.githooks/pre-commit'), 0o755);
  else if (readFileSync(hook, 'utf8').includes(CHECK)) kept.push(`${hooksPath}/pre-commit`);
  else {
    const lines = readFileSync(hook, 'utf8').split('\n');
    const at = lines[0]?.startsWith('#!') ? 1 : 0;
    lines.splice(at, 0, '# A record is registered before it is used (the records register; create-open-autonomy records init).', HOOK_LINE);
    writeFileSync(hook, lines.join('\n'));
    written.push(`${hooksPath}/pre-commit (the check added)`);
  }
  if (!git(target, ['config', 'core.hooksPath'])) notes.push(`this checkout runs no hook from ${hooksPath}/: each clone enables it with \`git config core.hooksPath ${hooksPath}\``);
  return { written, kept, notes };
}

/** The estate's unregistered records, by the record repository's own check. Exit 0 only at zero. */
export function estateRecords(target: string, json: boolean): number {
  const check = join(target, CHECK);
  if (!existsSync(check)) throw new Error(`${target} has no ${CHECK}; run \`create-open-autonomy records init ${target}\``);
  return spawnSync('node', [check, 'estate', ...(json ? ['--json'] : [])], { cwd: target, stdio: 'inherit' }).status ?? 1;
}
