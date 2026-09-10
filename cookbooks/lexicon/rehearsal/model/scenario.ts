#!/usr/bin/env bun
// The scripted brain: what the model twin answers when the brain thinks, printed as the scenario document the twin
// serves (the kit's rehearsal writes it into the world). The board's workers, the reviewer and the PM as in todo-cli's
// scenario; and the community desk: every quarter hour the community job (`WAKE: COMMUNITY`) reads the repository's
// issues and discussions through the project's own tool, answers where it was asked, files the request that fits the
// constitution on the board (which a worker then builds and lands), and marks the look done; in the channel the brain
// answers a person's question as itself. Handlers are stateless and key on the conversation's own text, never on call
// counts: the platform meters housekeeping calls too.
//
// stages/<key>/ holds the files the model "writes" for the seed task with that key, cumulative, each stage green on its own.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const here = import.meta.dir;
// The scripted PM, shared by the board's stories: the PM job's wake (`WAKE: PM`, the token its prompt carries and the
// skill text never does) runs the beat as the model's terminal call — the scrum beat, or the release-planning beat when
// the world was brought up for the release rehearsal (REHEARSAL_RELEASE=1) — and the beat's last line is the verdict.
const beat = process.env.REHEARSAL_RELEASE === '1' ? 'rehearsal/model/release-beat.ts' : 'rehearsal/model/scrum-beat.ts'; // relative to the brain's checkout
const scrumHandlers = [
  { id: 'scrum-report', on: { userTextIncludes: 'WAKE: PM', toolResultFor: 'terminal', anyTextIncludes: 'SCRUM_BEAT_DONE' }, respond: { text: 'Scrum reconciled the sourced roadmap and fleet work. The terminal output records the landing or dispatch result. Human commitments and release gates remain explicit.' } },
  { id: 'scrum-act', on: { userTextIncludes: 'WAKE: PM', lastMessageIsToolResult: false }, respond: { toolCalls: { name: 'terminal', arguments: { command: `bun ${beat}` } } } },
  { id: 'scrum-error', on: { userTextIncludes: 'WAKE: PM', toolResultFor: 'terminal' }, respond: { text: 'Scrum did not finish: inspect the terminal error. Preserve the planning worktree and leave the PM cursor unchanged.' } },
];
// The brain's checkout in the world (the kit's rehearsal names it): where the treasurer's task is filed to run.
const project = process.env.REHEARSAL_STACK_PROJECT ?? (() => { throw new Error('scenario.ts: REHEARSAL_STACK_PROJECT is not set'); })();
const seed = JSON.parse(readFileSync(resolve(here, '../../hermes/kanban.seed.json'), 'utf8')) as { tasks: Array<{ key: string; title: string }> };
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
  ...scrumHandlers,
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
  { id: 'community-report', on: { userTextIncludes: 'WAKE: COMMUNITY', toolResultFor: 'terminal', anyTextIncludes: 'COMMUNITY_DONE' }, respond: { text: 'Community: answered the question in issue #1 and the discussion; preserved the request in issue #2 for roadmap scrum; nothing declined.' } },
  { id: 'community-act', on: { userTextIncludes: 'WAKE: COMMUNITY', toolResultFor: 'terminal', anyTextIncludes: 'request: add the term' }, respond: { toolCalls: { name: 'terminal', arguments: { command: [
    `bun .open-autonomy/community.ts comment 2 "Captured for the PM scrum to consider in ROADMAP.md." || exit 1`,
    `bun .open-autonomy/community.ts comment 1 "A lexicon is this project's shared glossary: terms the community defines, rendered to the homepage. Propose one in an issue titled 'request: add the term …' with a definition and a source." || { echo "COMMUNITY_""FAILED comment 1"; exit 1; }`,
    `bun .open-autonomy/community.ts discuss 1 "A term of the week fits the constitution: a term is defined once and the homepage renders from the glossary alone, so the week's term is whichever was added last. I will keep it in mind when the glossary is larger." || { echo "COMMUNITY_""FAILED discuss 1"; exit 1; }`,
    `bun .open-autonomy/community.ts mark && echo "COMMUNITY_""DONE captured request"`].join('\n') } } } },
  { id: 'community-quiet', on: { userTextIncludes: 'WAKE: COMMUNITY', toolResultFor: 'terminal', anyTextIncludes: 'COMMUNITY_POLL_DONE' }, respond: { text: 'Community: nothing new since the last look.' } },
  { id: 'community-poll', on: { userTextIncludes: 'WAKE: COMMUNITY', lastMessageIsToolResult: false }, respond: { toolCalls: { name: 'terminal', arguments: { command: 'bun .open-autonomy/community.ts poll' } } } },
  // A person in the channel: answered as the agent itself.
  { id: 'channel-what-is', on: { userTextIncludes: 'what is a lexicon' }, respond: { text: 'A lexicon is this project\'s shared glossary: terms its community defines, added by me, rendered to the homepage. Propose one in an issue titled "request: add the term …" with a definition and a source, or just say it here.' } },
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
process.stdout.write(`${JSON.stringify({ $comment: 'GENERATED by rehearsal/model/scenario.ts — the scripted brain for the model twin; edit the generator and the stages.', extractors: {}, handlers }, null, 2)}\n`);
