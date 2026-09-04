#!/usr/bin/env bun
// The model's side of build-roadmap runs on cookbook/todo-cli, printed as the openai twin's scenario JSON
// (world/run.ts writes it to the generated world). The scripted model works like the real one is asked to:
// it looks at the roadmap for the top planned item, then writes that item's code and tests, runs the
// project's check, marks the item done, commits as the agent and pushes agent/<item>. Each run walks one
// item; repeating `bun world/run.ts agent` walks the roadmap down. Rules are stateless and key on the
// conversation's own text, never on call counts: the platform meters housekeeping calls too.
//
// stages/<item>/ holds the files the model "writes" for that item, cumulative, and each stage passes the
// project's check on its own (they are exercised before the world runs them).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const here = import.meta.dir;
const roadmap = readFileSync(resolve(here, '../../../cookbook/todo-cli/ROADMAP.yml'), 'utf8');
const items = [...roadmap.matchAll(/- id: ([a-z0-9-]+)\n(?:(?!- id:)[\s\S])*?title: (.+)/g)].map((m) => ({ id: m[1]!, title: m[2]!.trim() }));

function files(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => { const p = join(dir, name); return statSync(p).isDirectory() ? files(p, base) : [relative(base, p)]; }).sort();
}
// The roadmap as the model rewrites it for one item: every item up to and including this one is done.
function roadmapAfter(itemId: string): string {
  let out = roadmap;
  for (const it of items) {
    out = out.replace(new RegExp(`(- id: ${it.id}\\n(?:(?!- id:)[\\s\\S])*?status: )planned`), `$1done`);
    if (it.id === itemId) break;
  }
  return out;
}
// The command the model runs to implement one item: fetch main, write the stage's files and the roadmap,
// check, commit, push. Plain shell a scheduled run may execute unattended (no script-via-flag, nothing
// destructive); its outcome markers are assembled at run time so a command echoed back in a tool error can
// never read as the outcome itself.
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
    $comment: 'The failure class that killed a real run: a proxy that clamps the output cap gets finish_reason=length and no text, which Hermes retries and then fails. The run only succeeds when the platform forwards a roomy cap.',
    on: { maxTokensBelow: 16384 },
    respond: { text: '', finishReason: 'length' },
  },
  {
    id: 'after-push-report',
    on: { anyTextIncludes: 'PUSHED_BRANCH=agent/' },
    respond: { text: 'Done. The top open item is implemented with its tests, the check passes, its status is done in ROADMAP.yml, committed as the Open Autonomy agent and pushed to its agent/<item> branch. The landing rule merges it when the checks pass.' },
  },
  {
    id: 'after-failed-implementation',
    on: { anyTextIncludes: 'IMPLEMENTATION_RAN' },
    respond: { text: 'Stopped: the implementation ran but did not push; its output is above. Nothing was recorded on the roadmap.' },
  },
  ...items.map((item) => ({
    id: `implement-${item.id}`,
    on: { anyTextIncludes: `NEXT_ITEM=${item.id}` },
    respond: { toolCalls: { name: 'terminal', arguments: { command: implement(item) } } },
  })),
  {
    id: 'nothing-open',
    on: { anyTextIncludes: 'NEXT_ITEM=none' },
    respond: { text: 'Nothing to do: every item on ROADMAP.yml is done.' },
  },
  {
    id: 'agent-turn-find-next-item',
    on: { hasTool: 'terminal', lastMessageIsToolResult: false },
    respond: { toolCalls: { name: 'terminal', arguments: { command: `git fetch -q origin main && git checkout -q --detach origin/main && next=$(awk '/^  - id:/{id=$3} /^ *status: planned/{print id; exit}' ROADMAP.yml) && echo "NEXT_ITEM=\${next:-none}"` } } },
  },
  { id: 'housekeeping', on: {}, respond: { text: 'ok' } },
];
process.stdout.write(`${JSON.stringify({ $comment: 'Generated by world/handlers/todo-cli/gateway.ts — edit that and the stages, not this.', handlers }, null, 2)}\n`);
