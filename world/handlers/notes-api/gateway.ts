#!/usr/bin/env bun
// The model's side of a board task on cookbooks/notes-api, printed as the openai twin's scenario. The shape
// is the todo-cli scenario's (a worker per task, a reviewer, the hourly PM, stateless rules keyed on the
// conversation's own text) with this cookbook's own seed tasks and stages; the two share no code beyond the runner.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const here = import.meta.dir;
const seed = JSON.parse(readFileSync(resolve(here, '../../../cookbooks/notes-api/hermes/kanban.seed.json'), 'utf8')) as { tasks: Array<{ key: string; title: string }> };
const items = seed.tasks.map((t) => ({ id: t.key, title: t.title }));

function files(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p, base) : [relative(base, p)]; });
}
// The command the model runs to implement one task: the stage's files written cumulatively, the check, the
// commit as the agent, the push. The task's id is the board's (the one task running), and names the branch
// and the commit. Outcome markers are assembled so an echoed command never reads as one.
function implement(item: { id: string; title: string }): string {
  const stage = resolve(here, 'stages', item.id);
  const heredoc = (path: string, text: string) => `cat > '${path}' <<'__OA_FILE__'\n${text}${text.endsWith('\n') ? '' : '\n'}__OA_FILE__`;
  const writes = files(stage).map((f) => heredoc(f, readFileSync(join(stage, f), 'utf8'))).join('\n');
  return [
    // The task's id: the board's one running task, else the dispatcher's own prompt on the worker process above this shell.
    `task=$(hermes kanban list --status running --json 2>/dev/null | sed -n 's/^ *"id": *"\\([^"]*\\)".*/\\1/p' | head -1)`,
    `[ -n "$task" ] || { p=$$; while [ "$p" -gt 1 ] && [ -z "$task" ]; do task=$(tr '\\0' ' ' < /proc/$p/cmdline 2>/dev/null | sed -n 's/.*kanban task \\(t_[0-9a-f]*\\).*/\\1/p'); p=$(awk '/^PPid:/{print $2}' /proc/$p/status 2>/dev/null); [ -n "$p" ] || p=1; done; }`,
    `[ -n "$task" ] || { echo "IMPLEMENTATION_""RAN no running task on the board (hermes=$(command -v hermes); list: $(hermes kanban list --status running --json 2>&1 | head -c 200))"; exit 1; }`,
    `git fetch -q origin main && git checkout -q -B agent/$task origin/main || { echo "IMPLEMENTATION_""RAN cannot start"; exit 1; }`,
    writes,
    `bun run check >/dev/null 2>&1 || { echo "IMPLEMENTATION_""RAN the check failed:"; bun run check 2>&1 | tail -20; exit 1; }`,
    `git add -A && git -c user.name='Open Autonomy agent' -c user.email='agent@open-autonomy.org' commit -q -s -m "$task: ${item.title.replace(/"/g, '\"')}" && git push -q -u origin agent/$task || { echo "IMPLEMENTATION_""RAN push failed"; exit 1; }`,
    `echo "IMPLEMENTATION_""RAN PUSHED_BRANCH""=agent/$task $(git rev-parse --short HEAD)"`,
  ].join('\n');
}

const handlers = [
  { id: 'clamped-output-cap', on: { maxTokensBelow: 16384 }, respond: { text: '', finishReason: 'length' } },
  { id: 'probe', on: { anyTextIncludes: 'probe:' }, respond: { text: 'ok' } },
  // Answers to a tool result come first: the text that triggered the call is still in the conversation.
  { id: 'worker-handed-off', on: { toolResultFor: 'kanban_request_review' }, respond: { text: 'Handed off to review: the agent branch is pushed, the landing workflow merges it when the checks pass.' } },
  { id: 'worker-stopped', on: { toolResultFor: 'kanban_block' }, respond: { text: 'Stopped: the implementation ran but did not push. The task is blocked with what happened.' } },
  { id: 'pm-report', on: { userTextIncludes: 'Run the pm skill', toolResultFor: 'terminal' }, respond: { text: 'PM: the board is moving — every task is done, in progress or waiting its turn; nothing is stuck and nothing needs the owner.' } },
  { id: 'pm-look', on: { userTextIncludes: 'Run the pm skill', lastMessageIsToolResult: false }, respond: { toolCalls: { name: 'terminal', arguments: { command: 'hermes kanban list' } } } },
  { id: 'reviewer-done', on: { toolResultFor: 'kanban_complete' }, respond: { text: 'Approved.' } },
  { id: 'handoff', on: { anyTextIncludes: 'PUSHED_BRANCH=agent/', hasTool: 'kanban_request_review' }, respond: { toolCalls: { name: 'kanban_request_review', arguments: { summary: 'HANDOFF pushed the agent branch named on the thread (PUSHED_BRANCH, with its commit): implemented with its test, the check starts the server and passes; the landing workflow merges it when the checks pass.' } } } },
  { id: 'worker-blocked', on: { anyTextIncludes: 'IMPLEMENTATION_RAN', hasTool: 'kanban_block' }, respond: { toolCalls: { name: 'kanban_block', arguments: { reason: 'the implementation ran but did not push; its output is on the thread', kind: 'transient' } } } },
  { id: 'reviewer-verdict', on: { toolResultFor: 'kanban_show', anyTextIncludes: 'HANDOFF pushed' }, respond: { toolCalls: { name: 'kanban_complete', arguments: { summary: 'Approved: the handoff names the pushed agent branch and its commit, the diff meets STANDARDS.md and makes every acceptance line true, and the landing workflow merges it when the checks pass.' } } } },
  ...items.map((item) => ({ id: `implement-${item.id}`, on: { toolResultFor: 'kanban_show', anyTextIncludes: `"title": ${JSON.stringify(item.title)}, "body": "` }, respond: { toolCalls: { name: 'terminal', arguments: { command: implement(item) } } } })),
  { id: 'orient', on: { userTextIncludes: 'work kanban task', lastMessageIsToolResult: false }, respond: { toolCalls: { name: 'kanban_show', arguments: {} } } },
  { id: 'housekeeping', on: {}, respond: { text: 'ok' } },
];
process.stdout.write(`${JSON.stringify({ $comment: 'Generated by world/handlers/notes-api/gateway.ts — edit that and the stages, not this.', handlers }, null, 2)}\n`);
