// The board-card story (world/operators/card.ts creates its card): the card's fixed title and the scripted turns of the
// sessions the board starts for it. The board claims, launches, starts the review and closes; these turns are only
// what a coder and a reviewer would type. Each turn is one shell command, keyed on the card's title, so it runs the
// same on a pane (Claude Code) and a headless worker (Codex): the card is the worker's HERMES_KANBAN_TASK, the card
// assignment the launch put in SUPERCODE_AGENT_ASSIGNMENTS, or (a session the board did not start, adopted onto the
// card) the card's own branch, wt/<card>, that the session works in.
import { ACCOUNT } from '../lib.ts';
export const CARD_TITLE = 'Rehearsal card: note the rehearsal in REHEARSAL.md';
/** The adoption story's card (world/operators/native.ts): worked by a session started outside the board. */
export const NATIVE_TITLE = 'Rehearsal card: an adopted session notes the rehearsal';
/** What the adoption story mails the manager; its turn adopts the named session onto the named card. */
export const ADOPT_PHRASE = 'Adopt the outside session';
const sc = '"${SUPERCODE_BIN:-supercode}"';
const github = (method: string, path: string, body?: string) =>
  `curl -s -X ${method} -H 'authorization: Bearer world-bot' -H 'content-type: application/json' "\${GITHUB_TWIN_URL:-$GITHUB_API_URL}/repos/${ACCOUNT}${path}"${body ? ` -d "${body}"` : ''}`;
const card = 'card="${HERMES_KANBAN_TASK:-$(printf %s "$SUPERCODE_AGENT_ASSIGNMENTS" | jq -r \'[.[] | select(.kind == "card")][0].target // empty\')}" && card="${card:-$(git branch --show-current | sed -n \'s|^wt/\\(t_[0-9a-f]*\\)$|\\1|p\')}" && [ -n "$card" ]';
// The card's PR: the open or merged one whose head is the card's branch.
const pr = `branch=$(git branch --show-current) && pr=$(${github('GET', '/pulls?state=all&per_page=100')} | jq -c --arg b "$branch" --arg w "wt/$card" '[.[] | select(.head.ref == $b or .head.ref == $w)][0] // empty')`;

/** The coder: the first run commits, pushes the card's branch and opens its PR; the run after the review's pass merges
 * the PR at its reviewed head and asks the manager for done with that head. */
export const coder = (root: string) => [
  card, pr,
  `if [ -z "$pr" ]; then ${[
    'echo "Rehearsed: one board card, end to end." >> REHEARSAL.md && git add REHEARSAL.md',
    'git -c user.name=coder -c user.email=coder@example.test commit -q -m "$card: note the rehearsal"',
    'git push -q origin "HEAD:refs/heads/$branch"',
    `${github('POST', '/pulls', '{\\"title\\":\\"$card: rehearsal note\\",\\"head\\":\\"$branch\\",\\"base\\":\\"main\\"}')} | jq -r '.html_url'`,
  ].join(' && ')}; elif ${sc} workflow runs "$card" --root "${root}" | grep -q review_passed; then ${[
    `n=$(printf %s "$pr" | jq -r .number) && head=$(printf %s "$pr" | jq -r .head.sha)`,
    `${github('PUT', '/pulls/$n/merge', '{\\"sha\\":\\"$head\\"}')} | jq -c .`,
    `${sc} workflow request-state "$card" --state done --reason "the reviewed PR is merged at its reviewed head" --evidence "PR #$n merged at $head on the reviewer's pass" --commit "$head" --root "${root}"`,
  ].join(' && ')}; else echo "the PR is open; the board starts its review"; fi`,
].join(' && ');

/** The reviewer: a pass at the card's PR head. */
export const reviewer = (root: string) => [
  card, pr, 'head=$(printf %s "$pr" | jq -r .head.sha)',
  `${sc} workflow request-state "$card" --state done --reason "the review passed" --evidence "verdict: pass by the reviewer profile; PR head $head read whole against main" --reviewed-sha "$head" --root "${root}"`,
].join(' && ');

export const REVIEWER_PROMPT = 'You are the independent reviewer of card';

/** The manager adopts the session its mail names onto the card it names (`workflow adopt`, the manager's verb). */
export const managerAdopts = (root: string) => [
  `body=$(supercode message inbox --json --all | jq -r '[.[].envelope | select(.body | contains("${ADOPT_PHRASE}"))] | sort_by(.created_at_ms) | last.body')`,
  `card=$(printf '%s' "$body" | grep -o 't_[0-9a-f]*' | head -1) && addr=$(printf '%s' "$body" | grep -o 'sc:[^ ]*:claude-code:[0-9a-f-]*' | head -1)`,
  `supercode workflow adopt "$card" "$addr" --root "${root}"`,
].join(' && ');

/** What the owner writes the manager to pause a card (world/owner.ts send manager "<PAUSE_PHRASE> t_…: why"). */
export const PAUSE_PHRASE = 'Pause card';
/**
 * The manager pauses the card the owner's line names, giving the owner's why as its reason (`workflow pause`, the
 * manager's verb). The reason carries the why alone, never the phrase: the board quotes the reason in the pause notice
 * it files for the card's worker, and the phrase there would set off this turn in the worker's session (the manager's
 * turn keys on the phrase, which only the owner's line to the manager carries).
 */
export const managerPauses = (root: string) => [
  `body=$(supercode message inbox --json --all | jq -r '[.[].envelope | select(.body | contains("${PAUSE_PHRASE} t_"))] | sort_by(.created_at_ms) | last.body')`,
  `card=$(printf '%s' "$body" | grep -o 't_[0-9a-f]*' | head -1) && why=$(printf '%s' "$body" | sed 's/^.*${PAUSE_PHRASE} t_[0-9a-f]*: *//')`,
  `supercode workflow pause "$card" --reason "the owner: $why" --root "${root}"`,
].join(' && ');

/** What the owner writes the manager to comment on a card (world/owner.ts send manager "<COMMENT_PHRASE> t_…: text"). */
export const COMMENT_PHRASE = 'Comment on card';
/** The manager comments the owner's text on the card the line names (`workflow comment`, a manager's verb). */
export const managerComments = (root: string) => [
  `body=$(supercode message inbox --json --all | jq -r '[.[].envelope | select(.body | contains("${COMMENT_PHRASE} t_"))] | sort_by(.created_at_ms) | last.body')`,
  `card=$(printf '%s' "$body" | grep -o 't_[0-9a-f]*' | head -1) && text=$(printf '%s' "$body" | sed 's/^.*${COMMENT_PHRASE} t_[0-9a-f]*: //')`,
  `supercode workflow comment "$card" "$text" --root "${root}"`,
].join(' && ');
