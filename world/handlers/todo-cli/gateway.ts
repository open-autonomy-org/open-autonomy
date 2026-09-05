#!/usr/bin/env bun
// The model's side of a board task on cookbooks/todo-cli, printed as the openai twin's scenario JSON
// (world/run.ts writes it to the generated world). The scripted model works like the real one is asked
// to: it looks at the roadmap for the top planned item, then writes that item's code and tests, runs the
// project's check, marks the item done, commits as the agent and pushes agent/<item>. Each fire walks one
// item. Rules are stateless and key on the conversation's own text, never on call counts: the platform
// meters housekeeping calls too.
//
// stages/<item>/ holds the files the model "writes" for that item, cumulative, each stage green on its own.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const here = import.meta.dir;
const roadmap = readFileSync(resolve(here, '../../../cookbooks/todo-cli/ROADMAP.yml'), 'utf8');
const items = [...roadmap.matchAll(/- id: ([a-z0-9-]+)\n(?:(?!- id:)[\s\S])*?title: (.+)/g)].map((m) => ({ id: m[1]!, title: m[2]!.trim() }));

function files(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => { const p = join(dir, name); return statSync(p).isDirectory() ? files(p, base) : [relative(base, p)]; }).sort();
}
// The roadmap as the model rewrites it for one item: every item up to and including this one is done.
function roadmapAfter(itemId: string): string {
  let out = roadmap;
  for (const it of items) {
    out = out.replace(new RegExp(`(- id: ${it.id}\\n(?:(?!- id:)[\\s\\S])*?status: )planned`), '$1done');
    if (it.id === itemId) break;
  }
  return out;
}
// The command the model runs to implement one item. Plain shell a scheduled run may execute unattended;
// its outcome markers are assembled at run time so a command echoed back in a tool error never reads as
// the outcome itself.
function implement(item: { id: string; title: string }): string {
  const stage = resolve(here, 'stages', item.id);
  const heredoc = (path: string, text: string) => `cat > '${path}' <<'__OA_FILE__'\n${text}${text.endsWith('\n') ? '' : '\n'}__OA_FILE__`;
  const writes = [...files(stage).map((f) => heredoc(f, readFileSync(join(stage, f), 'utf8'))), heredoc('ROADMAP.yml', roadmapAfter(item.id))].join('\n');
  return [
    `git fetch -q origin main && git checkout -q -B agent/${item.id} origin/main || { echo "IMPLEMENTATION_""RAN cannot start"; exit 1; }`,
    writes,
    `bun run check >/dev/null 2>&1 || { echo "IMPLEMENTATION_""RAN the check failed:"; bun run check 2>&1 | tail -20; exit 1; }`,
    `git add -A && git -c user.name='Open Autonomy agent' -c user.email='agent@open-autonomy.org' commit -q -s -m '${item.id}: ${item.title.replace(/'/g, "'\\''")}' && git push -q -u origin agent/${item.id} || { echo "IMPLEMENTATION_""RAN push failed"; exit 1; }`,
    `echo "IMPLEMENTATION_""RAN PUSHED_BRANCH""=agent/${item.id} $(git rev-parse --short HEAD)"`,
  ].join('\n');
}

const handlers = [
  {
    id: 'clamped-output-cap',
    $comment: 'The failure class that killed a real run: a proxy that clamps the output cap gets finish_reason=length and no text, which the harness retries and then fails. The run only succeeds when the platform forwards a roomy cap.',
    on: { maxTokensBelow: 16384 },
    respond: { text: '', finishReason: 'length' },
  },
  { id: 'probe', on: { anyTextIncludes: 'probe:' }, respond: { text: 'ok' } },
  // Answers to a tool result come first: the text that triggered the call is still in the conversation.
  { id: 'worker-handed-off', on: { toolResultFor: 'kanban_request_review' }, respond: { text: 'Handed off to review: the agent branch is pushed, the landing workflow merges it when the checks pass.' } },
  { id: 'worker-stopped', on: { toolResultFor: 'kanban_block' }, respond: { text: 'Stopped: the implementation ran but did not push. Nothing was recorded on the roadmap.' } },
  { id: 'reviewer-done', on: { toolResultFor: 'kanban_complete' }, respond: { text: 'Approved.' } },
  // The worker, after its push: hand the task to review naming the branch, then stop.
  ...items.map((item) => ({ id: `handoff-${item.id}`, on: { anyTextIncludes: `PUSHED_BRANCH=agent/${item.id}`, hasTool: 'kanban_request_review' }, respond: { toolCalls: { name: 'kanban_request_review', arguments: { summary: `HANDOFF pushed agent/${item.id}: ${item.title} implemented with its tests, the check passes, status done in ROADMAP.yml; the landing workflow merges the branch.` } } } })),
  { id: 'worker-blocked', on: { anyTextIncludes: 'IMPLEMENTATION_RAN', hasTool: 'kanban_block' }, respond: { toolCalls: { name: 'kanban_block', arguments: { reason: 'the implementation ran but did not push; its output is on the thread', kind: 'transient' } } } },
  // The reviewer (the review lane, sdlc-review loaded): the handoff names the branch and the commit; approve.
  { id: 'reviewer-verdict', on: { toolResultFor: 'kanban_show', anyTextIncludes: 'HANDOFF pushed agent/' }, respond: { toolCalls: { name: 'kanban_complete', arguments: { summary: 'Approved: the handoff names the pushed agent branch and its commit, ROADMAP.yml carries the item as done on it, and the landing workflow merges it when the checks pass.' } } } },
  // The worker, oriented: the task names its roadmap item; implement it.
  ...items.map((item) => ({ id: `implement-${item.id}`, on: { toolResultFor: 'kanban_show', anyTextIncludes: `ROADMAP_ITEM=${item.id}` }, respond: { toolCalls: { name: 'terminal', arguments: { command: implement(item) } } } })),
  // Every dispatched session orients first: read the task.
  { id: 'orient', on: { userTextIncludes: 'work kanban task', lastMessageIsToolResult: false }, respond: { toolCalls: { name: 'kanban_show', arguments: {} } } },
  { id: 'housekeeping', on: {}, respond: { text: 'ok' } },
];
process.stdout.write(`${JSON.stringify({ $comment: 'Generated by world/handlers/todo-cli/gateway.ts — edit that and the stages, not this.', handlers }, null, 2)}\n`);
