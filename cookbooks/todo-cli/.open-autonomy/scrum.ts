#!/usr/bin/env bun
// Small shell doors for the Hermes PM. Planning stays in Markdown; scheduling,
// idempotency, dependencies, leases and review belong to Hermes's native kanban.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const location = resolve(import.meta.dir, '..');
// A PM may invoke this from its planning worktree. Always bind fleet tasks and
// worktree lifecycle operations to the installation's primary checkout.
const worktrees = Bun.spawnSync({ cmd: ['git', 'worktree', 'list', '--porcelain'], cwd: location, stdout: 'pipe', stderr: 'pipe' });
const project = /^worktree (.+)$/m.exec(worktrees.stdout.toString())?.[1];
if (worktrees.exitCode || !project) throw new Error('scrum requires an ordinary Git checkout with a primary worktree');
const home = process.env.HERMES_HOME;
if (!home) throw new Error('scrum requires HERMES_HOME from the running installation');
const plan = resolve(home, 'scrum-plan');
const intake = resolve(home, 'scrum-intake');
const run = (cmd: string[], cwd = project) => {
  const r = Bun.spawnSync({ cmd, cwd, stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode) throw new Error(`${cmd.slice(0, 3).join(' ')}: ${r.stderr.toString().trim()}`);
  return r.stdout.toString().trim();
};
const git = (...args: string[]) => run(['git', ...args]);
const [command, ...args] = process.argv.slice(2);
// Hermes's create dedup lookup is intentionally outside its write transaction.
// Serialize this kit door with an OS lock; crashes release it automatically.
if (command === 'queue' && process.env.OA_SCRUM_QUEUE_LOCKED !== '1') {
  const script = `import fcntl, os, subprocess, sys
with open(os.path.join(sys.argv[1], "scrum-queue.lock"), "a") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    env = dict(os.environ, OA_SCRUM_QUEUE_LOCKED="1")
    sys.exit(subprocess.call(sys.argv[2:], env=env))`;
  const child = Bun.spawnSync({ cmd: ['python', '-c', script, home, process.execPath, ...process.argv.slice(1)], stdio: ['inherit', 'inherit', 'inherit'] });
  process.exit(child.exitCode);
}
const validId = (s: string) => /^[a-z0-9][a-z0-9-]{0,79}$/.test(s);

if (command === 'note') {
  const [source, author, body] = args;
  if (!source || !author || !body) throw new Error('note requires source, author and text');
  if (!/^(https:\/\/\S+|hermes:(session|message|task)\/\S+)$/.test(source)) throw new Error('note source must be a permalink or exact hermes:session/message/task reference');
  const id = createHash('sha256').update(JSON.stringify([source, author, body])).digest('hex').slice(0, 24);
  mkdirSync(intake, { recursive: true });
  const file = resolve(intake, `${id}.json`);
  if (!existsSync(file)) {
    const tmp = `${file}.${randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify({ id, source, author, body, received: new Date().toISOString() }, null, 2) + '\n');
    renameSync(tmp, file);
  }
  console.log(JSON.stringify({ id, source }));
} else if (command === 'prepare') {
  git('fetch', '-q', 'origin', 'main');
  if (!existsSync(plan)) {
    const id = `scrum-${new Date().toISOString().replace(/\D/g, '')}-${randomUUID().slice(0, 8)}`;
    git('worktree', 'add', '-b', `agent/${id}`, plan, 'origin/main');
  }
  const branch = run(['git', 'branch', '--show-current'], plan);
  if (!branch.startsWith('agent/scrum-')) throw new Error(`${plan} is not a scrum branch; preserve it and resolve manually`);
  const notes = existsSync(intake) ? readdirSync(intake).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(resolve(intake, f), 'utf8'))) : [];
  console.log(JSON.stringify({ worktree: plan, branch, main: git('rev-parse', 'origin/main'), changes: run(['git', 'status', '--short'], plan), board: JSON.parse(run(['hermes', 'kanban', 'list', '--archived', '--json'])), intake: notes }, null, 2));
} else if (command === 'finish') {
  if (!existsSync(plan)) { console.log('No planning worktree.'); process.exit(0); }
  git('fetch', '-q', 'origin', 'main');
  if (run(['git', 'status', '--porcelain'], plan)) throw new Error('planning worktree has uncommitted work; preserve and finish it');
  run(['git', 'merge-base', '--is-ancestor', 'HEAD', 'origin/main'], plan);
  git('worktree', 'remove', plan);
  console.log('Planning worktree retired; its work is on main.');
} else if (command === 'queue') {
  const [outcome, key, title, body, parent] = args;
  if (!outcome || !validId(outcome) || !key || !validId(key) || !title || !body) throw new Error('queue requires outcome-id, stable work-key, title, acceptance body and optional parent task');
  git('fetch', '-q', 'origin', 'main');
  const commit = git('rev-parse', 'origin/main');
  const roadmap = git('show', `${commit}:ROADMAP.md`);
  const section = roadmap.split(/^## /m).find((s) => s.startsWith(`${outcome}: `));
  if (!section) throw new Error(`landed ROADMAP.md has no outcome ${outcome}`);
  if (!/^Dispatch: fleet\s*$/m.test(section)) throw new Error(`${outcome} is not marked Dispatch: fleet; unresolved and human work must not dispatch`);
  if (!/\[[^\]]+\]\((?:https:\/\/[^)\s]+|hermes:[^)\s]+|[^)\s]+\.(?:md|json)(?:#[^)]*)?)\)/.test(section)) throw new Error(`${outcome} has no source link; source the plan before dispatch`);
  const tasks = JSON.parse(run(['hermes', 'kanban', 'list', '--archived', '--json'])) as Array<{ id: string; status: string; body?: string; idempotency_key?: string }>;
  const marker = `<!-- roadmap:${outcome}:${key} -->`;
  const existing = tasks.find((t) => t.body?.includes(marker) || t.idempotency_key === `roadmap:${outcome}:${key}`);
  if (existing) { console.log(JSON.stringify(existing)); process.exit(0); }
  const config = Bun.YAML.parse(readFileSync(resolve(project, '.open-autonomy/config.yaml'), 'utf8')) as { account: string };
  // The lookup includes archived tasks; native idempotency also covers normal retries.
  console.log(run(['hermes', 'kanban', 'create', title, '--body', `${marker}\nRoadmap: https://github.com/${config.account}/blob/${commit}/ROADMAP.md (${outcome})\n${body}`, '--assignee', 'default', '--workspace', `dir:${project}`, '--skill', 'develop', '--created-by', 'pm', '--idempotency-key', `roadmap:${outcome}:${key}`, ...(parent ? ['--parent', parent] : []), '--json']));
} else throw new Error('usage: scrum.ts prepare | finish | note <source> <author> <text> | queue <outcome-id> <work-key> <title> <body> [parent]');
