// SUBSTRATE-FACTS declares itself authoritative over the portable skill it is appended to ("where they
// disagree, this section wins"), so a sentence here that is wrong for the run the worker is actually in has
// no recovery: obeying it is the bug, and the worker cannot tell.
//
// Every case below is a run whose shape the appendix CANNOT know statically and therefore must not assert.
// The class has bitten twice — `audit` (cron and dispatch are both possible, so a binary branch told a
// dispatched worker it owned no card) and `review` (the review EDGE places it in a proposal's worktree, but
// a directly-launched review card is on trunk). The rule the tests encode: where two runs are possible,
// discriminate on the ENVIRONMENT, never on the IR alone.
import { expect, test } from 'bun:test';
import { parseIr } from '@open-autonomy/core';
import { loweringFor } from './emit';
import { substrateFacts } from './substrate-facts';

/** The hermes-sdlc shape in miniature: an isolated proposer bound to a shared reviewer, plus a dual-mode
 *  actor (cron AND dispatch) — the two runs the appendix has to discriminate. */
const IR_SRC = `schema: autonomy.ir.v1
targets: [hermes]
agents:
  develop:
    behavior: develop
    capabilities: [code:propose]
    execution: { workspace: isolated }
    review: review
    triggers: [{ dispatch: true, params: { ZTRACK_ISSUE: subject.ref } }]
  review:
    behavior: review
    capabilities: [code:review]
    execution: { workspace: shared }
    # required by the IR validator of any \`review:\` target — the bound reviewer's verdict IS the merge
    # gate, so its envelope shape is not a per-profile choice.
    result: { schema: open-autonomy.review.v1 }
    triggers: [{ dispatch: true, params: { ZTRACK_ISSUE: subject.ref } }]
  audit:
    behavior: audit
    capabilities: [tasks:converse, "code:propose@docs/audits"]
    triggers:
      - dispatch: true
        params: { TARGET_REF: subject.ref }
      - cron: "51 9 * * 0"
policy: { maxConcurrent: 2, box: { tracker: { ztrackPreset: simple-sdlc } } }
resources: []
`;

const facts = (role: string) => {
  const ir = parseIr(IR_SRC);
  return substrateFacts(ir, loweringFor(ir), role);
};

test('a bound reviewer is told to CHECK where it is, not that it is in the proposal worktree', () => {
  // `boundReviewerOf` is a static IR property — "some proposer names this role as its reviewer" — and does
  // NOT establish that this run came through that edge. A directly-launched review card lowers to
  // `dir:<repo>`, i.e. trunk, where the old unconditional "Commit your verdict HERE" was an instruction to
  // commit onto trunk: the one act reserved for the PM.
  const md = facts('review');
  expect(md).toContain('git rev-parse --abbrev-ref HEAD');
  // Both runs must be described, each with its own action.
  expect(md).toMatch(/ISSUE BRANCH/);
  expect(md).toMatch(/main`\/`master`|`main`\/`master`/);
  expect(md).toContain('do NOT commit');
  // The assertion that made the trunk case unrecoverable must be gone: "commit HERE" may no longer appear
  // without a condition attached to it.
  expect(md).not.toMatch(/worktree you were opened for\*\* — its branch is checked out/);
});

test('a dual-mode actor is told to read the environment for whether it owns a card', () => {
  // The same class, already fixed: `audit` declares cron AND dispatch, and `isStanding` is only "has a
  // cron", so a binary branch told a DISPATCHED audit worker it owned no card and that kanban_complete
  // would fail — obeying which ends the turn without completing, and the card re-dispatches forever.
  const md = facts('audit');
  expect(md).toContain('$HERMES_KANBAN_TASK');
  expect(md).toContain('check `$HERMES_KANBAN_TASK` first');
  expect(md).toContain('**if `$HERMES_KANBAN_TASK` is set**');
});

test('an isolated proposer still gets the plain, unconditional worktree statement', () => {
  // The discrimination above must not leak into the case that IS statically knowable: `develop` always runs
  // in its own worktree on its own branch, and hedging that would cost a true fact.
  const md = facts('develop');
  expect(md).toContain('your own git worktree, on a branch named for your issue');
  expect(md).not.toContain('git rev-parse --abbrev-ref HEAD');
});
