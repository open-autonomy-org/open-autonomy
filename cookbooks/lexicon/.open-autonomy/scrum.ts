#!/usr/bin/env bun
// Small shell doors for the Hermes PM. Planning stays in Markdown; scheduling,
// idempotency, dependencies, leases and review belong to Hermes's native kanban.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
// The kit places its vendored SDK beside this helper when rendering a project.
const { parseTeamConfig } = await import(resolve(import.meta.dir, 'sdk/team.ts'));

const location = resolve(import.meta.dir, '..');
// A PM may invoke this from its planning worktree. Always bind fleet tasks and
// worktree lifecycle operations to the installation's primary checkout.
const worktrees = Bun.spawnSync({ cmd: ['git', 'worktree', 'list', '--porcelain'], cwd: location, stdout: 'pipe', stderr: 'pipe' });
const project = /^worktree (.+)$/m.exec(worktrees.stdout.toString())?.[1];
if (worktrees.exitCode || !project) throw new Error('scrum requires an ordinary Git checkout with a primary worktree');
const home = process.env.HERMES_HOME;
if (!home) throw new Error('scrum requires HERMES_HOME from the running installation');
const plan = resolve(home, 'scrum-plan');
const intake = resolve(home, 'scrum-intake'); // read-only migration from pre-notepad kits
const run = (cmd: string[], cwd = project) => {
  const r = Bun.spawnSync({ cmd, cwd, stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode) throw new Error(`${cmd.slice(0, 3).join(' ')}: ${r.stderr.toString().trim()}`);
  return r.stdout.toString().trim();
};
const git = (...args: string[]) => run(['git', ...args]);
const [command, ...args] = process.argv.slice(2);
// Hermes's create dedup lookup is intentionally outside its write transaction.
// Serialize this kit door with an OS lock; crashes release it automatically.
if (['prepare', 'finish', 'note', 'queue'].includes(command) && process.env.OA_SCRUM_QUEUE_LOCKED !== '1') {
  const script = `import fcntl, os, subprocess, sys
with open(os.path.join(sys.argv[1], "scrum-queue.lock"), "a") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    env = dict(os.environ, OA_SCRUM_QUEUE_LOCKED="1")
    sys.exit(subprocess.call(sys.argv[2:], env=env))`;
  const child = Bun.spawnSync({ cmd: ['python', '-c', script, home, process.execPath, ...process.argv.slice(1)], stdio: ['inherit', 'inherit', 'inherit'] });
  process.exit(child.exitCode);
}
const validId = (s: string) => /^[a-z0-9][a-z0-9-]{0,79}$/.test(s);

// Use the pinned Hermes API, not a second state store. The cron scheduler injects
// this bounded notepad into PM's next session. Resolve the name to its real job ID.
const native = (action: string, ...values: string[]): any => JSON.parse(run(['python', '-c', `import json, sys
from cron.jobs import resolve_job_ref
from cron import notepad
job = resolve_job_ref("pm")
if not job: raise ValueError("PM cron job is missing; seed the installation first")
job_id = job["id"]
action, *args = sys.argv[1:]
if action == "get": result = {"job": job_id, "state": json.loads(notepad.get_note(job_id, "scrum") or "{}"), "notes": notepad.list_notes(job_id)}
elif action == "set":
    notepad.set_note(job_id, args[0], args[1]); result = True
elif action == "delete": result = notepad.delete_note(job_id, args[0])
elif action == "sessions":
    from hermes_state import SessionDB
    db = SessionDB(read_only=True)
    rows = db.search_sessions(limit=100, offset=int(args[1]))
    result = {"rows": [{k: r.get(k) for k in ("id", "source", "title", "last_active")} for r in rows if float(r.get("last_active") or 0) >= float(args[0])], "more": len(rows) == 100 and float(rows[-1].get("last_active") or 0) >= float(args[0])}
elif action == "session":
    from hermes_state import SessionDB
    rows = SessionDB(read_only=True).get_messages(args[0], include_compacted=True, limit=100, offset=int(args[1]))
    result = {"messages": [{k: r.get(k) for k in ("id", "role", "content", "timestamp")} for r in rows], "more": len(rows) == 100}
else: raise ValueError("unknown native action")
print(json.dumps(result))`, action, ...values]));
type Snapshot = { id: string; main: string; started: number };
type State = { main?: string; sessionsSince?: number; pending?: Snapshot };
const memory = () => native('get') as { job: string; state: State; notes: Array<{ key: string; value: string }> };
const save = (state: State) => native('set', 'scrum', JSON.stringify(state));
const notes = () => [
  ...memory().notes.filter((n) => n.key.startsWith('pending:')).map((n) => JSON.parse(n.value)),
  ...(existsSync(intake) ? readdirSync(intake).filter((f) => /^[a-f0-9]{24}\.json$/.test(f)).map((f) => JSON.parse(readFileSync(resolve(intake, f), 'utf8'))) : []),
];
const changes = (state: State, offset = '0') => {
  if (!state.pending) throw new Error('prepare a scrum first');
  if (state.main) git('merge-base', '--is-ancestor', state.main, state.pending.main);
  const range = state.main ? `${state.main}..${state.pending.main}` : state.pending.main;
  return { base: state.main ?? null, head: state.pending.main, count: Number(git('rev-list', '--count', range)),
    log: git('log', '--format=%H %an: %s', '--name-only', '--max-count=100', `--skip=${offset}`, range) };
};
const offset = (value = '0') => { if (!/^\d+$/.test(value)) throw new Error('offset must be a nonnegative integer'); return value; };

if (command === 'note') {
  // Optional internal convenience, never a contributor handoff requirement.
  const [source, author, body] = args;
  if (!source || !author || !body) throw new Error('note requires source, author and text');
  if (!/^(https:\/\/\S+|hermes:(session|message|task)\/\S+)$/.test(source)) throw new Error('note requires a permalink or exact Hermes reference');
  const id = createHash('sha256').update(JSON.stringify([source, author, body])).digest('hex').slice(0, 24);
  native('set', `pending:${id}`, JSON.stringify({ id, source, author, body }));
  console.log(JSON.stringify({ id, source }));
} else if (command === 'prepare') {
  git('fetch', '-q', 'origin', 'main');
  const { job, state } = memory();
  const resumed = !!state.pending;
  if (!state.pending) {
    state.pending = { id: randomUUID(), main: git('rev-parse', 'origin/main'), started: Date.now() / 1000 };
    save(state); // pin inputs before creating the worktree; restart resumes the same batch
  }
  if (!existsSync(plan)) {
    const branch = `agent/scrum-${state.pending.id}`;
    const exists = Bun.spawnSync({ cmd: ['git', 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`], cwd: project }).exitCode === 0;
    git('worktree', 'add', ...(exists ? [plan, branch] : ['-b', branch, plan, state.pending.main]));
  }
  const branch = run(['git', 'branch', '--show-current'], plan);
  if (!branch.startsWith('agent/scrum-')) throw new Error(`${plan} is not a scrum branch; preserve it and resolve manually`);
  let sessions;
  try { sessions = native('sessions', String(state.sessionsSince ?? 0), '0'); }
  catch (error) { sessions = { gap: String(error) }; }
  let team;
  try { team = { commit: git('rev-parse', 'origin/main'), ...parseTeamConfig(git('show', 'origin/main:.open-autonomy/config.yaml')) }; }
  catch (error) { team = { gap: String(error) }; }
  console.log(JSON.stringify({ worktree: plan, branch, job, resumed, snapshot: state.pending, checkpoint: state,
    main: git('rev-parse', 'origin/main'), mainChanges: changes(state), sessions, team,
    changes: run(['git', 'status', '--short'], plan), board: JSON.parse(run(['hermes', 'kanban', 'list', '--archived', '--json'])), intake: notes() }, null, 2));
} else if (command === 'changes') {
  console.log(JSON.stringify(changes(memory().state, offset(args[0])), null, 2));
} else if (command === 'sessions') {
  console.log(JSON.stringify(native('sessions', String(memory().state.sessionsSince ?? 0), offset(args[0])), null, 2));
} else if (command === 'session') {
  if (!args[0]) throw new Error('session requires an exact session ID');
  console.log(JSON.stringify(native('session', args[0], offset(args[1])), null, 2));
} else if (command === 'finish') {
  const { state } = memory();
  if (!state.pending || args[0] !== state.pending.id) throw new Error('finish requires the current snapshot ID and explicitly reviewed sources');
  const reviewed = args.slice(1);
  if (reviewed.some((s) => !['main', 'sessions'].includes(s) && !/^note:[a-f0-9]{24}$/.test(s))) throw new Error('reviewed sources: main, sessions, note:<id>');
  if (!existsSync(plan)) throw new Error('planning worktree is missing; restore it before acknowledging inputs');
  git('fetch', '-q', 'origin', 'main');
  if (run(['git', 'status', '--porcelain'], plan)) throw new Error('planning worktree has uncommitted work; preserve and finish it');
  run(['git', 'merge-base', '--is-ancestor', 'HEAD', 'origin/main'], plan);
  // Retire first. A crash before saving repeats inputs; it never skips them.
  git('worktree', 'remove', plan);
  if (reviewed.includes('main')) state.main = state.pending.main;
  if (reviewed.includes('sessions')) state.sessionsSince = state.pending.started;
  delete state.pending;
  save(state);
  for (const source of reviewed.filter((s) => s.startsWith('note:'))) {
    const id = source.slice(5);
    native('delete', `pending:${id}`);
    rmSync(resolve(intake, `${id}.json`), { force: true });
  }
  console.log('Planning work landed; only explicitly reviewed source checkpoints advanced.');
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
} else throw new Error('usage: scrum.ts prepare | changes [offset] | sessions [offset] | session <id> [offset] | finish <snapshot-id> [main] [sessions] [note:<id>] | note <source> <author> <text> | queue <outcome-id> <work-key> <title> <body> [parent]');
