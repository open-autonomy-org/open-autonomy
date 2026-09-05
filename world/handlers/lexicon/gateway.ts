#!/usr/bin/env bun
// The model's side of cookbooks/lexicon, printed as the openai twin's scenario JSON (world/run.ts writes it to the
// generated world). The board's workers, the reviewer and the PM as in todo-cli's scenario; and the community desk:
// every quarter hour the community job reads the repository's issues and discussions through the project's own
// tool, answers where it was asked, files the request that fits the constitution on the board (which a worker then
// builds and lands), and marks the look done; in the channel the agent answers a person's question as itself.
// Rules are stateless and key on the conversation's own text, never on call counts: the platform meters
// housekeeping calls too.
//
// stages/<key>/ holds the files the model "writes" for the seed task with that key, cumulative, each stage
// green on its own.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const here = import.meta.dir;
// The checkout the world's agent works in (world/run.ts names it): where the treasurer's task is filed to run.
const project = process.env.WORLD_PROJECT_DIR ?? (() => { throw new Error('gateway.ts: WORLD_PROJECT_DIR is not set'); })();
const seed = JSON.parse(readFileSync(resolve(here, '../../../cookbooks/lexicon/hermes/kanban.seed.json'), 'utf8')) as { tasks: Array<{ key: string; title: string }> };
// The board's seed tasks, and the one the community files (issue #2): the twin stage.
const items = [...seed.tasks.map((t) => ({ id: t.key, title: t.title })), { id: 'twin', title: 'add the term "twin" to the lexicon' }];

function files(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => { const p = join(dir, name); return statSync(p).isDirectory() ? files(p, base) : [relative(base, p)]; }).sort();
}
// The command the model runs to implement one task. Plain shell a worker may execute unattended; its outcome
// markers are assembled at run time so a command echoed back in a tool error never reads as the outcome
// itself. The task's id is the board's (the one task running), and names the branch and the commit.
function implement(item: { id: string; title: string }): string {
  const stage = resolve(here, 'stages', item.id);
  const heredoc = (path: string, text: string) => `mkdir -p "$(dirname '${path}')" && cat > '${path}' <<'__OA_FILE__'\n${text}${text.endsWith('\n') ? '' : '\n'}__OA_FILE__`;
  const writes = files(stage).map((f) => heredoc(f, readFileSync(join(stage, f), 'utf8'))).join('\n');
  return [
    // The task's id: the board's one running task, else the dispatcher's own prompt on the worker process above this shell.
    `task=$(hermes kanban list --status running --json 2>/dev/null | sed -n 's/^ *"id": *"\\([^"]*\\)".*/\\1/p' | head -1)`,
    `[ -n "$task" ] || { p=$$; while [ "$p" -gt 1 ] && [ -z "$task" ]; do task=$(ps -o command= -p $p 2>/dev/null | sed -n 's/.*kanban task \\(t_[0-9a-f]*\\).*/\\1/p'); p=$(ps -o ppid= -p $p 2>/dev/null | tr -d ' '); [ -n "$p" ] || p=1; done; }`,
    `[ -n "$task" ] || { echo "IMPLEMENTATION_""RAN no running task on the board (hermes=$(command -v hermes); list: $(hermes kanban list --status running --json 2>&1 | head -c 200))"; exit 1; }`,
    `git fetch -q origin main && git checkout -q -B agent/$task origin/main || { echo "IMPLEMENTATION_""RAN cannot start"; exit 1; }`,
    writes,
    `bun run check >/dev/null 2>&1 || { echo "IMPLEMENTATION_""RAN the check failed:"; bun run check 2>&1 | tail -20; exit 1; }`,
    `git add -A && git -c user.name='Open Autonomy agent' -c user.email='agent@open-autonomy.org' commit -q -s -m "$task: ${item.title.replace(/"/g, '\\"')}" && git push -q -u origin agent/$task || { echo "IMPLEMENTATION_""RAN push failed"; exit 1; }`,
    `echo "IMPLEMENTATION_""RAN PUSHED_BRANCH""=agent/$task $(git rev-parse --short HEAD)"`,
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
  { id: 'worker-stopped', on: { toolResultFor: 'kanban_block' }, respond: { text: 'Blocked, with the reason on the task.' } },
  // The community desk (the community job, the community skill). Most specific first: the report after the look
  // is marked done; the filing and the answers (one shell, the board's CLI: a scheduled job has no board tools)
  // after the poll that shows a request; the poll itself. Stateless, keyed on the conversation's own text.
  { id: 'community-report', on: { userTextIncludes: 'Run the community skill', toolResultFor: 'terminal', anyTextIncludes: 'COMMUNITY_DONE' }, respond: { text: 'Community: answered the question in issue #1 and the discussion; filed the request in issue #2 on the board as a task (its id is on the issue), which lands as a pull request; nothing declined.' } },
  { id: 'community-act', on: { userTextIncludes: 'Run the community skill', toolResultFor: 'terminal', anyTextIncludes: 'request: add the term' }, respond: { toolCalls: { name: 'terminal', arguments: { command: [
    `last=$(hermes kanban list 2>/dev/null | grep -v '✓' | sed -n 's/.*\\(t_[0-9a-f]*\\).*/\\1/p' | tail -1); parent=$([ -n "$last" ] && echo "--parent $last")`,
    `id=$(hermes kanban create 'add the term "twin" to the lexicon' $parent --body '- \`lexicon list\` shows twin: a local stand-in for a vendor'"'"'s API that a program talks to unmodified — the same SDK, the same wire, no key, no spend; a world is a set of them (source https://github.com/volter-ai/twin)\n- the homepage renders it (docs/index.html re-rendered, the test green)\n- from issue #2 (a community request)' --assignee default --workspace dir:$PWD --skill develop --created-by community --json 2>/dev/null | sed -n 's/^ *"id": *"\\(t_[0-9a-f]*\\)".*/\\1/p' | head -1)`,
    `[ -n "$id" ] || { echo "COMMUNITY_""FAILED could not file the task: $(hermes kanban create --help 2>&1 | head -3)"; exit 1; }`,
    `bun src/community.ts comment 2 "Filed on the board as $id — it lands as a pull request when done, and its session is on the project page." || { echo "COMMUNITY_""FAILED comment 2"; exit 1; }`,
    `bun src/community.ts comment 1 "A lexicon is this project's shared glossary: terms the community defines, rendered to the homepage. Propose one in an issue titled 'request: add the term …' with a definition and a source." || { echo "COMMUNITY_""FAILED comment 1"; exit 1; }`,
    `bun src/community.ts discuss 1 "A term of the week fits the constitution: a term is defined once and the homepage renders from the glossary alone, so the week's term is whichever was added last. I will keep it in mind when the glossary is larger." || { echo "COMMUNITY_""FAILED discuss 1"; exit 1; }`,
    `bun src/community.ts mark && echo "COMMUNITY_""DONE filed $id"`].join('\n') } } } },
  { id: 'community-quiet', on: { userTextIncludes: 'Run the community skill', toolResultFor: 'terminal', anyTextIncludes: 'COMMUNITY_POLL_DONE' }, respond: { text: 'Community: nothing new since the last look.' } },
  { id: 'community-poll', on: { userTextIncludes: 'Run the community skill', lastMessageIsToolResult: false }, respond: { toolCalls: { name: 'terminal', arguments: { command: 'bun src/community.ts poll' } } } },
  // A person in the channel: answered as the agent itself.
  { id: 'channel-what-is', on: { userTextIncludes: 'what is a lexicon' }, respond: { text: 'A lexicon is this project\'s shared glossary: terms its community defines, added by me, rendered to the homepage. Propose one in an issue titled "request: add the term …" with a definition and a source, or just say it here.' } },
  // The PM, hourly, as the pm skill says: read the board; release what is blocked `transient` and nothing else (a
  // `needs_input` block waits on the owner or the treasurer, a parked task on the owner); report. The pass after the
  // listing comes first, then the report after the pass, then the listing itself.
  { id: 'pm-report', on: { userTextIncludes: 'Run the pm skill', toolResultFor: 'terminal', anyTextIncludes: 'PM_PASS_DONE' }, respond: { text: 'PM: the board is moving. Released what was blocked transient (PM_UNSTUCK on the thread); left every needs_input block and parked task for the owner (PM_LEFT); nothing else is stuck.' } },
  { id: 'pm-unstick', on: { userTextIncludes: 'Run the pm skill', toolResultFor: 'terminal' }, respond: { toolCalls: { name: 'terminal', arguments: { command: [
    `for id in $(hermes kanban list --status blocked --json 2>/dev/null | sed -n 's/^ *"id": *"\\([^"]*\\)".*/\\1/p'); do`,
    `  if hermes kanban show $id 2>/dev/null | grep -q "'kind': 'transient'"; then hermes kanban unblock $id >/dev/null && echo "PM_""UNSTUCK $id (transient)"; else echo "PM_""LEFT $id (needs_input: the owner's or the treasurer's)"; fi; done`,
    `for id in $(hermes kanban list --status scheduled --json 2>/dev/null | sed -n 's/^ *"id": *"\\([^"]*\\)".*/\\1/p'); do echo "PM_""LEFT $id (parked: the owner's)"; done`,
    `echo PM_PASS_""DONE`].join('\n') } } } },
  { id: 'pm-look', on: { userTextIncludes: 'Run the pm skill', lastMessageIsToolResult: false }, respond: { toolCalls: { name: 'terminal', arguments: { command: 'hermes kanban list --json' } } } },
  { id: 'reviewer-done', on: { toolResultFor: 'kanban_complete' }, respond: { text: 'Approved.' } },
  // The worker, after its push: hand the task to review, then stop. The thread names the branch and the commit.
  { id: 'handoff', on: { anyTextIncludes: 'PUSHED_BRANCH=agent/', hasTool: 'kanban_request_review' }, respond: { toolCalls: { name: 'kanban_request_review', arguments: { summary: 'HANDOFF pushed the agent branch named on the thread (PUSHED_BRANCH, with its commit): implemented with the check green; the landing workflow merges it when the checks pass.' } } } },
  { id: 'worker-blocked', on: { anyTextIncludes: 'IMPLEMENTATION_RAN', hasTool: 'kanban_block' }, respond: { toolCalls: { name: 'kanban_block', arguments: { reason: 'the implementation ran but did not push; its output is on the thread', kind: 'transient' } } } },
  // The reviewer (the review lane, sdlc-review loaded), as SOUL.md says the bar is: read CONSTITUTION.md and
  // CONTRIBUTING.md and the diff the handoff names, then the verdict naming both.
  { id: 'reviewer-verdict', on: { toolResultFor: 'terminal', anyTextIncludes: 'REVIEW_READ' }, respond: { toolCalls: { name: 'kanban_complete', arguments: { summary: 'Approved: read CONSTITUTION.md (no invariant touched, nothing out of scope entered) and CONTRIBUTING.md (the diff is held to it), the diff on the pushed agent branch makes every acceptance line true and carries nothing no line asked for and no test, and the landing workflow merges it.' } } } },
  { id: 'reviewer-read', on: { toolResultFor: 'kanban_show', anyTextIncludes: 'HANDOFF pushed' }, respond: { toolCalls: { name: 'terminal', arguments: { command: `test -s CONSTITUTION.md && test -s CONTRIBUTING.md || { echo "REVIEW_""READ missing the bar: CONSTITUTION.md or CONTRIBUTING.md"; exit 1; }; git fetch -q origin main; echo "REVIEW_""READ CONSTITUTION.md ($(wc -l < CONSTITUTION.md) lines) CONTRIBUTING.md ($(wc -l < CONTRIBUTING.md) lines); diff:"; git diff --stat origin/main...HEAD` } } } },
  // The worker, oriented: the task's own record (its title beside its body — a parent's title appears without one)
  // says which seed task it is; implement it.
  ...items.map((item) => ({ id: `implement-${item.id}`, on: { toolResultFor: 'kanban_show', anyTextIncludes: `"title": ${JSON.stringify(item.title)}, "body": "` }, respond: { toolCalls: { name: 'terminal', arguments: { command: implement(item) } } } })),
  // Every dispatched session orients first: read the task.
  { id: 'orient', on: { userTextIncludes: 'work kanban task', lastMessageIsToolResult: false }, respond: { toolCalls: { name: 'kanban_show', arguments: {} } } },
  { id: 'housekeeping', on: {}, respond: { text: 'ok' } },
];
process.stdout.write(`${JSON.stringify({ $comment: 'Generated by world/handlers/lexicon/gateway.ts — edit that and the stages, not this.', handlers }, null, 2)}\n`);
