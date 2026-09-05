#!/usr/bin/env bun
// The model's side of a board task on cookbooks/todo-cli, printed as the openai twin's scenario JSON
// (world/run.ts writes it to the generated world). The scripted model works like the real one is asked
// to: it reads its task from the board, writes that task's code, runs the project's check, commits as the
// agent and pushes agent/<task id>, hands off; the reviewer approves; the PM job reads the board and reports.
// Rules are stateless and key on the conversation's own text, never on call counts: the platform meters
// housekeeping calls too.
//
// stages/<key>/ holds the files the model "writes" for the seed task with that key, cumulative, each stage
// green on its own.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const here = import.meta.dir;
const seed = JSON.parse(readFileSync(resolve(here, '../../../cookbooks/todo-cli/hermes/kanban.seed.json'), 'utf8')) as { tasks: Array<{ key: string; title: string }> };
const items = seed.tasks.map((t) => ({ id: t.key, title: t.title }));

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
    `task=$(HERMES_HOME=/opt/data /opt/hermes/bin/hermes kanban list --status running --json 2>/dev/null | sed -n 's/^ *"id": *"\\([^"]*\\)".*/\\1/p' | head -1)`,
    `[ -n "$task" ] || { p=$$; while [ "$p" -gt 1 ] && [ -z "$task" ]; do task=$(tr '\\0' ' ' < /proc/$p/cmdline 2>/dev/null | sed -n 's/.*kanban task \\(t_[0-9a-f]*\\).*/\\1/p'); p=$(awk '/^PPid:/{print $2}' /proc/$p/status 2>/dev/null); [ -n "$p" ] || p=1; done; }`,
    `[ -n "$task" ] || { echo "IMPLEMENTATION_""RAN no running task on the board (hermes=$(command -v hermes); list: $(HERMES_HOME=/opt/data /opt/hermes/bin/hermes kanban list --status running --json 2>&1 | head -c 200))"; exit 1; }`,
    `git fetch -q origin main && git checkout -q -B agent/$task origin/main || { echo "IMPLEMENTATION_""RAN cannot start"; exit 1; }`,
    writes,
    `bun run check >/dev/null 2>&1 || { echo "IMPLEMENTATION_""RAN the check failed:"; bun run check 2>&1 | tail -20; exit 1; }`,
    `git add -A && git -c user.name='Open Autonomy agent' -c user.email='agent@open-autonomy.org' commit -q -s -m "$task: ${item.title.replace(/"/g, '\\"')}" && git push -q -u origin agent/$task || { echo "IMPLEMENTATION_""RAN push failed"; exit 1; }`,
    `echo "IMPLEMENTATION_""RAN PUSHED_BRANCH""=agent/$task $(git rev-parse --short HEAD)"`,
  ].join('\n');
}

// The treasurer's payment for the domain: the one blocked developer task is the one waiting; the card is minted on
// the treasurer's valve naming that task, presented to the registrar (the Stripe twin), captured; the receipt goes
// on the developer's task and the task is released. Plain shell; the card never leaves this session.
const payDomain = [
    `dev=$(HERMES_HOME=/opt/data /opt/hermes/bin/hermes kanban list --status blocked --assignee default --json 2>/dev/null | sed -n 's/^ *"id": *"\\([^"]*\\)".*/\\1/p' | head -1); [ -n "$dev" ] || { echo "PAYMENT_""RAN no blocked developer task on the board: $(HERMES_HOME=/opt/data /opt/hermes/bin/hermes kanban list --status blocked --json 2>&1 | head -c 200)"; exit 1; }`,
    `card=$(curl -sf -X POST http://valve-pay:8787/v1/rails/card -H 'authorization: Bearer valve' -H 'content-type: application/json' -d "{\\"usd_cents\\":250,\\"purpose\\":\\"domain todo-cli.example\\",\\"item\\":\\"$dev\\"}") || { echo "PAYMENT_""RAN the card rail refused"; exit 1; }`,
    `card_id=$(printf '%s' "$card" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4); last4=$(printf '%s' "$card" | grep -o '"last4":"[^"]*"' | head -1 | cut -d'"' -f4); [ -n "$card_id" ] || { echo "PAYMENT_""RAN no card id: $card"; exit 1; }`,
    `auth=$(curl -sf -u sk_test_world: -X POST http://host.docker.internal:47616/v1/test_helpers/issuing/authorizations -d card=$card_id -d amount=200 -d 'merchant_data[category]=computer_software_stores' -d 'merchant_data[name]=Namecheap') || { echo "PAYMENT_""RAN the registrar could not authorize"; exit 1; }`,
    `auth_id=$(printf '%s' "$auth" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4); printf '%s' "$auth" | grep -q '"approved":true' || { echo "PAYMENT_""RAN the authorization was declined: $auth"; exit 1; }`,
    `curl -sf -u sk_test_world: -X POST http://host.docker.internal:47616/v1/test_helpers/issuing/authorizations/$auth_id/capture >/dev/null || { echo "PAYMENT_""RAN the capture failed"; exit 1; }`,
    `HERMES_HOME=/opt/data /opt/hermes/bin/hermes kanban comment $dev "RECEIPT: domain todo-cli.example at Namecheap, \\$2.00 on card ····$last4" >/dev/null && HERMES_HOME=/opt/data /opt/hermes/bin/hermes kanban unblock $dev >/dev/null || { echo "PAYMENT_""RAN paid but could not release $dev"; exit 1; }`,
    `echo "PAYMENT_""RAN PAID domain todo-cli.example at Namecheap on card $card_id for $dev"`,
  ].join('\n');

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
  // The developer, after filing its purchase request: block on it and stop.
  { id: 'worker-asked', on: { toolResultFor: 'kanban_create' }, respond: { toolCalls: { name: 'kanban_block', arguments: { reason: 'waiting on the treasurer: Purchase: domain todo-cli.example at Namecheap, at most $2.50', kind: 'needs_input' } } } },
  // The treasurer, after paying: complete its request with the receipt.
  { id: 'treasurer-paid', on: { toolResultFor: 'terminal', anyTextIncludes: 'PAYMENT_RAN PAID' }, respond: { toolCalls: { name: 'kanban_complete', arguments: { summary: 'Paid: domain todo-cli.example at Namecheap, $2.00 on a single-use card; the receipt is on the developer task, which is released.' } } } },
  { id: 'treasurer-failed', on: { toolResultFor: 'terminal', anyTextIncludes: 'PAYMENT_RAN', hasTool: 'kanban_block' }, respond: { toolCalls: { name: 'kanban_block', arguments: { reason: 'the payment did not go through; its output is on the thread', kind: 'transient' } } } },
  // The PM, hourly: read the board, report. Its answer to the board listing comes first.
  { id: 'pm-report', on: { userTextIncludes: 'Run the pm skill', toolResultFor: 'terminal' }, respond: { text: 'PM: the board is moving — every task is done, in progress or waiting its turn; nothing is stuck and nothing needs the owner.' } },
  { id: 'pm-look', on: { userTextIncludes: 'Run the pm skill', lastMessageIsToolResult: false }, respond: { toolCalls: { name: 'terminal', arguments: { command: 'hermes kanban list' } } } },
  { id: 'reviewer-done', on: { toolResultFor: 'kanban_complete' }, respond: { text: 'Approved.' } },
  // The worker, after its push: hand the task to review, then stop. The thread names the branch and the commit.
  { id: 'handoff', on: { anyTextIncludes: 'PUSHED_BRANCH=agent/', hasTool: 'kanban_request_review' }, respond: { toolCalls: { name: 'kanban_request_review', arguments: { summary: 'HANDOFF pushed the agent branch named on the thread (PUSHED_BRANCH, with its commit): implemented with the check green; the landing workflow merges it when the checks pass.' } } } },
  { id: 'worker-blocked', on: { anyTextIncludes: 'IMPLEMENTATION_RAN', hasTool: 'kanban_block' }, respond: { toolCalls: { name: 'kanban_block', arguments: { reason: 'the implementation ran but did not push; its output is on the thread', kind: 'transient' } } } },
  // The reviewer (the review lane, sdlc-review loaded): the handoff names the branch and the commit; approve.
  { id: 'reviewer-verdict', on: { toolResultFor: 'kanban_show', anyTextIncludes: 'HANDOFF pushed' }, respond: { toolCalls: { name: 'kanban_complete', arguments: { summary: 'Approved: the handoff names the pushed agent branch and its commit, the diff meets STANDARDS.md and makes every acceptance line true, and the landing workflow merges it when the checks pass.' } } } },
  // The treasurer, oriented: a purchase request is its task; pay it.
  { id: 'treasurer-pay-domain', on: { toolResultFor: 'kanban_show', anyTextIncludes: '"title": "Purchase: domain todo-cli.example' }, respond: { toolCalls: { name: 'terminal', arguments: { command: payDomain } } } },
  // The developer on the domain task: with the treasurer's receipt on it, implement; without, ask the treasurer.
  // First match wins, so the receipt handler stands before the ask.
  { id: 'implement-domain-paid', on: { toolResultFor: 'kanban_show', anyTextIncludes: 'RECEIPT: domain todo-cli.example' }, respond: { toolCalls: { name: 'terminal', arguments: { command: implement(items.find((i) => i.id === 'domain')!) } } } },
  { id: 'ask-treasurer-domain', on: { toolResultFor: 'kanban_show', anyTextIncludes: '"title": "the project owns its domain name", "body": "' }, respond: { toolCalls: { name: 'kanban_create', arguments: { title: 'Purchase: domain todo-cli.example at Namecheap, at most $2.50', assignee: 'treasurer', workspace_kind: 'dir', workspace_path: '/work/project', body: '- what: the domain todo-cli.example\n- merchant: Namecheap (computer_software_stores)\n- at most: 250 cents\n- purpose: domain todo-cli.example\n- for task: the developer task blocked on this request\n- how to pay: present the card at the registrar' } } } },
  // The worker, oriented: the task's own record (its title beside its body — a parent's title appears without one)
  // says which seed task it is; implement it.
  ...items.map((item) => ({ id: `implement-${item.id}`, on: { toolResultFor: 'kanban_show', anyTextIncludes: `"title": ${JSON.stringify(item.title)}, "body": "` }, respond: { toolCalls: { name: 'terminal', arguments: { command: implement(item) } } } })),
  // Every dispatched session orients first: read the task.
  { id: 'orient', on: { userTextIncludes: 'work kanban task', lastMessageIsToolResult: false }, respond: { toolCalls: { name: 'kanban_show', arguments: {} } } },
  { id: 'housekeeping', on: {}, respond: { text: 'ok' } },
];
process.stdout.write(`${JSON.stringify({ $comment: 'Generated by world/handlers/todo-cli/gateway.ts — edit that and the stages, not this.', handlers }, null, 2)}\n`);
