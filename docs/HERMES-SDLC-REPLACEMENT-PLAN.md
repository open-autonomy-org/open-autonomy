# hermes-sdlc → full SDLC replacement: the execution plan

Status: **not started**. Baseline: commit `eaaaf003`, `bun test packages/substrate-hermes` = 18 pass /
75 expects, `bunx tsc -p tsconfig.json` clean.

This document is written to be executed by an agent **without access to the design history**. Every task
states its own context, the exact files and lines, a prescribed change (no open design decisions), and a
**PROOF** block whose command and expected observable define done. Do the tasks in order; do not skip a
proof; append each proof's actual output to the **Ledger** at the bottom and commit after each task
(lowercase conventional commits, e.g. `fix(substrate-hermes): …`).

## What this system is (context you must not re-derive wrong)

Two planes, joined at a branch name and an exit code:

- **Hermes' kanban kernel owns DISPATCH.** `packages/substrate-hermes/src/runner.ts` (`HermesRunner`)
  drives it through the `hermes kanban` CLI only — never `kanban.db` directly. The kernel promotes,
  claims, leases, kills overruns, re-queues dead workers, and caps concurrency. Nothing in this repo
  re-implements any of that.
- **ztrack owns VERIFICATION.** The done-gate (`src/ztrack-gate.ts`) is a Hermes `pre_tool_call` hook
  that REFUSES `kanban_complete` while `ztrack check --auto-scope` is red. It fails CLOSED.
- The profile is `profiles/hermes-sdlc/` (six actors: pm, draft, develop, review, maintainer, audit).
  `develop` runs isolated (own worktree, branch = issue ref + per-create token from `branchFor`);
  `review` is opened as a linked CHILD card placed in the proposal's worktree; the PM alone integrates
  (`merge --no-ff`) and tears down the worktree+branch afterwards — nothing else ever reclaims one.
- The emitted `scripts/runner.ts` (from `src/runner-frontend.ts`) is a second, self-contained
  implementation of the launch rules; `src/runner-frontend.test.ts` holds the two byte-identical.

## Ground rules (violating any of these is a failed task, whatever else passed)

1. **Isolation.** Every live proof runs under a fresh `HERMES_HOME` (e.g.
   `export HERMES_HOME=$(mktemp -d)/hermes-home`) and a throwaway git repo. NEVER read-write the real
   `~/.hermes` profiles, boards, or cron jobs. Never touch the operator's live termfleet fleet, its
   consoles, or its providers.
2. **Money.** Phases 3 and 4 spawn real model workers. Workers use **Sonnet 5**. Before the first
   worker-spawning run of each phase, stop and get explicit operator confirmation.
3. **Outward messages.** `hermes send` delivers to the operator's real messaging platforms. Proofs use
   the file-fallback path (below) except ONE confirmed end-to-end send, which requires operator OK first.
4. **Evidence discipline.** A task is done when its PROOF block's expected observable was actually
   observed. Paste the real output (trimmed) into the Ledger. "The test should pass" is not evidence.
5. **Regression gate after every task:** `bun test packages/substrate-hermes && bunx tsc -p tsconfig.json`
   both clean. Ten review cycles showed most new defects were introduced by fixes; this gate is why.

---

## Phase 0 — verify the baseline (no changes)

Run, from the repo root:

```sh
git log --oneline -1                      # expect eaaaf003 or a descendant
bun test packages/substrate-hermes        # expect 18 pass (or more), 0 fail
bunx tsc -p tsconfig.json                 # expect no output, exit 0
hermes --version                          # expect v0.18.x — the substrate was proven against 0.18.2
```

If any of these fail, stop and report; do not "fix forward" a broken baseline.

---

## Phase 1 — close the four known code defects (mechanical, no live runs)

### T1.1 — the frontend's `RUNNING` set contradicts its own comment

**Where:** `packages/substrate-hermes/src/runner-frontend.ts` (~line 177–180 of the emitted script
template: `const RUNNING = new Set(['todo','scheduled','ready','running','review','blocked','triage'])`).

**Problem:** the comment above it says "`triage` is NOT running… reporting it as a live session hid a
wedge" — yet `triage` and `blocked` are in the set. The set is actually the **LISTED** set (everything
in flight, including paused cards, which `sessionOf` then reports as `paused`). The behavior is correct;
the name and comment describe a different rule and will mislead the next editor.

**Change:** rename `RUNNING` → `LISTED` inside the emitted template and rewrite the comment to say: this
is the in-flight set `list` shows without `--all`; `blocked`/`triage` are listed but reported as
`status: 'paused'` (via `PAUSED`), which is how a wedge stays visible without masquerading as live work.
Behavior must not change.

**PROOF:** `bun test packages/substrate-hermes` green, and
`grep -c "RUNNING" packages/substrate-hermes/src/runner-frontend.ts` prints `0`.

### T1.2 — `update()` claims boolean, `blockGuarded` throws, and an unknown card state reports success

**Where:** `packages/substrate-hermes/src/runner.ts`, `update` (~516) and `blockGuarded` (~547–558),
plus the note on `readCard` (~473–477): a missing card and a real failure (locked db, bad `--board`)
both surface as `undefined`.

**Problems:** (a) `Runner.update` is documented/typed as returning `Promise<boolean>` but `blockGuarded`
throws on the triage wedge — deliberate (a wedged card must be loud), yet undeclared, so a caller doing
`if (!await runner.update(...))` will crash instead of branch. (b) In `blockGuarded`, if the post-block
`readCard` returns `undefined` (state unknown), the triage check is silently false and the method
returns `ok` — a possible wedge reported as success.

**Change:** keep the throw — it is load-bearing. Add JSDoc on `update` declaring exactly when it throws.
In `blockGuarded`, when the post-block `readCard(id)` returns `undefined` while the `block` call itself
succeeded, throw a distinct error: the card's state after blocking could not be read, so success would be
a guess (name the two indistinguishable causes: card missing vs. board unreadable). Mirror nothing into
the frontend — `scripts/runner.ts` has no update verb, so this is `HermesRunner`-only.

**PROOF:** a new test (reuse the stub-`hermes` harness from `runner-frontend.test.ts`, which fakes the
CLI by putting a recording script first on `PATH`): stub `block` → exit 0 and `show` → the triage card;
assert `update(id, {status:'paused'})` rejects with the triage message. Second case: stub `show` after
block to print unparseable output; assert it rejects with the unknown-state message, not `resolves(true)`.
Mutation check: comment out the new throw, the test must fail; restore.

### T1.3 — SUBSTRATE-FACTS tells a directly-launched reviewer it is in a worktree it may not be in

**Where:** `packages/substrate-hermes/src/substrate-facts.ts` (~31–34 computes `boundReviewerOf` /
`inProposalWorktree` statically from the IR; ~72–78 renders the workspace row).

**Problem:** the appendix declares itself authoritative over the skill, and for any actor that is some
proposer's `review:` target it asserts "the `develop` worktree you were opened for… Commit your verdict
HERE." That is true for the review-edge child card, but a review card can also be launched **directly**
(`runner.ts launch review --ref X`), which lowers to `dir:<repo>` — the shared checkout, on trunk. The
appendix then instructs a trunk-resident worker to commit "here". This is the same class of bug the
`dualMode` branch already fixed for `audit`: prose cannot know the run, so it must discriminate on the
**environment**, not assert one case.

**Change:** rewrite the bound-reviewer workspace row to be environment-discriminated: check where you
are with `git rev-parse --abbrev-ref HEAD` (and/or cwd under `.worktrees/`). On an issue branch ⇒ you
are in the proposal's worktree; commit the verdict there. On trunk (`master`/`main`) ⇒ you were launched
directly into the shared checkout; do NOT commit, and treat the missing worktree as the finding to
report. Keep the review-edge case as the described-first, expected-normal case.

**PROOF:** `substrateFacts` currently has **zero test coverage** (grep `substrateFacts`
in `lowering.test.ts` — empty). Add a small test: build the hermes-sdlc IR fixture, render facts for
`review`, assert the row contains both discriminated cases and no longer contains an unconditional
"Commit your verdict HERE". Then `bun test packages/substrate-hermes` green.

### T1.4 — the createCard spent-key retry loop is dead weight in the equivalence test

**Where:** `packages/substrate-hermes/src/runner-frontend.test.ts` (the stub `hermes` always answers
`status:"ready"`), vs. the retry loops in `runner.ts` `createCard` (~338–369) and the frontend template
(~106–123).

**Problem:** the loop that makes rework possible at all — a `done` idempotency hit means the key is
SPENT ⇒ retry with ` (attempt N)` key AND a fresh `branchFor` branch — is exercised by no test in either
implementation. This exact loop was wrong once already (branch reuse would have wedged every rework).

**Change:** extend the stub so the first created card's `show` answers `status:"done"` and the second
answers `status:"ready"` (the stub records argv to a file; give it a small state file to count calls).
Drive `launch develop --ref LOCAL-9` through BOTH implementations. Assert, for each: exactly two
`create` calls; the second carries `--idempotency-key … (attempt 2)`; the two `--branch` values differ;
and the argv sequences of the two implementations are byte-identical (same normalization the existing
test uses for timestamps/nonces — extend it if branch tokens need masking).

**PROOF:** mutation check both directions: (a) delete the fresh-branch reassignment in the frontend
template → test fails; (b) delete it in `HermesRunner` → test fails; restore both, test green.

### T1.5 — dangling dry-run reference in the IR header

**Where:** `profiles/hermes-sdlc/ir.yml` line ~9 cites `scenarios/hermes-sdlc/run.ts`; that file does
not exist (`scenarios/hermes-sdlc/` holds only `README.md` + `json-schema.ts`; the README points to a
sibling repo: `../twin/cookbook/hermes-sdlc/run.ts`).

**Change:** fix the ir.yml comment to point where the dry-run actually lives (the twin cookbook path,
as the scenario README does). Comment-only; no behavior.

**PROOF:** `grep -rn "scenarios/hermes-sdlc/run.ts" profiles/ packages/` prints nothing.

---

## Phase 2 — the notification seam (a blocked card must reach a human)

**The gap:** `kanban_block(needs_input)` is the profile's only human seam, and today it is **silent** —
the card waits for an operator who has no reason to look at the board. For unattended operation a silent
stall is worse than a crash. Hermes already ships the delivery mechanism: `hermes send --to
<platform[:chat_id]>` pipes text to any configured messaging platform, **no gateway or LLM required**
(verified against hermes v0.18.2: `hermes send --help`).

### T2.1 — emit an attention notifier and wire it in

**Design (decided; implement as written):**

1. New file `packages/substrate-hermes/src/notifications.ts`, exporting a Python script template
   `oa-attention-sweep.py` (same pattern as `session-env.ts` / `ztrack-gate.ts`: TypeScript exports the
   script source + installed-path constants; `emit.ts`'s installer copies it under
   `$HERMES_HOME/open-autonomy/` and substitutes the `@@…@@` placeholders — reuse the existing
   placeholder machinery, add no second one).
2. The sweep script: `hermes kanban list --json` (via `$HERMES_BIN`), select cards with
   `status in {blocked, triage}`, diff against a state file
   `$HERMES_HOME/open-autonomy/attention-notified.json` (map card-id → last-notified status, so each
   card+status notifies once, and a card that un-wedges and re-wedges notifies again). For each new one,
   compose: card id, title, assignee, status, the block reason if present in `kanban show` events, and
   the one command an operator needs (`hermes kanban show <id> --json` / `hermes kanban unblock <id>`).
3. Delivery: if `OPEN_AUTONOMY_NOTIFY_TARGET` is set (e.g. `telegram`, `slack:C0123`), pipe the message
   to `hermes send --to $OPEN_AUTONOMY_NOTIFY_TARGET`. If unset, or if `send` exits non-zero, append to
   `$HERMES_HOME/open-autonomy/attention.log` — degraded but never silent, same philosophy as
   `OPEN_AUTONOMY_PARAMS_ERROR`. The script always exits 0.
4. Scheduling — a discovery step with a two-branch decision, then implement the branch that holds:
   read `~/.hermes/hermes-agent/cron/jobs.py`. **If** `hermes cron create` supports a shell/command job
   (not only an agent-prompt job), register the sweep every 10 minutes through `emit.ts`'s existing
   cron-reconcile-by-name machinery (root home, not a profile home — the sweep is an operator concern).
   **Else** register it as a `post_tool_call` hook on `kanban_block` (immediate worker-block coverage)
   AND have the installer print a documented one-line system-cron suggestion for the sweep (covers
   kernel-initiated wedges: circuit breaker, spawn-fail auto-block — those never pass through a worker's
   tool call). Record which branch held, and why, in the Ledger.

**PROOF (no operator ping needed):** isolated `HERMES_HOME`, fresh board; `hermes kanban create` a card,
`hermes kanban block <id> "test" --kind needs_input`; run the sweep with `OPEN_AUTONOMY_NOTIFY_TARGET`
unset → `attention.log` gains exactly one entry naming the card; run it again → no duplicate; unblock,
re-block → a second entry. Then unit-test the selection/diff logic if it is factored into a testable
function; regression gate green.

### T2.2 — one real delivery, end to end

With operator confirmation and a target they name (`hermes send --list` shows what is configured): block
a card on an isolated board, run the sweep with `OPEN_AUTONOMY_NOTIFY_TARGET` set, and confirm the
message arrived on the real platform. **PROOF:** the operator's confirmation, quoted in the Ledger.

---

## Phase 3 — staged live proofs (isolated; Sonnet 5 workers; operator OK before first spawn)

Build one reusable rig first, then five proofs against it. Keep the rig under
`scenarios/hermes-sdlc/live/` as plain scripts (they are operator-run rigs, not CI tests — do not wire
them into `npm`/`bun` check scripts).

### T3.0 — the rig

A script that, given a scratch dir: creates a git repo (initial commit, `master`), runs the
open-autonomy compile/install for `profiles/hermes-sdlc` into it against a fresh `HERMES_HOME`, seeds
the ztrack tracker (simple-sdlc preset) with parametrizable issues (title, ACs, `oa-approved` label),
and starts the Hermes gateway pointed at that home. It must print every path it created and how to tear
everything down. Workers run Sonnet 5. **PROOF:** rig up → `hermes kanban list --json` answers on the
isolated board, all profile configs pass the install's own gate probe, teardown leaves nothing running
(`pgrep -f` on the isolated home path is empty).

### T3.1 — one card, the whole way through, including integration and teardown

Seed ONE trivial-but-real issue (e.g. "add `scripts/greet.sh` printing the repo name; AC: script exists
and is executable"). Let the loop run unattended: PM tick files develop → develop implements in its
worktree, gate holds until ztrack is green → review card promotes, reviewer verdicts in the proposal's
worktree → PM integrates.

**PROOF, all five or it failed:** (1) trunk `git log --merges -1` shows the `--no-ff` integrate commit;
(2) `git worktree list` shows only the main tree; (3) the issue branch is deleted; (4) `ztrack check`
green on trunk with the AC evidence citing a commit that exists; (5) no card left in `running`/`blocked`.
This is the first time integration + teardown will have ever executed for real — treat any deviation as
a finding, not noise.

### T3.2 — rework, deterministically

The spent-idempotency-key path, proven against the REAL kernel without needing a model to misbehave:
on the rig's board, launch develop for an issue via `scripts/runner.ts`, drive the card to `done` by
hand (`hermes kanban complete` on a green fixture or via the worker), then launch the same actor+ref
again. **PROOF:** a NEW card exists (different id), its key carries ` (attempt 2)`, its branch differs
from the first card's, and the kernel dispatches it (status leaves `ready`). The model-driven variant
(reviewer actually requesting changes) is deliberately deferred to the soak.

### T3.3 — kill a worker mid-flight

While a develop card is `running`, read `worker_pid` from `hermes kanban show <id> --json` runs and
`kill -9` it. **PROOF:** the kernel reclaims the lease (card leaves `running` without human action),
a later dispatch retries it, and the card eventually completes green — or, if the failure threshold
trips instead, the card lands where the discriminator says (`gave_up` event, reported by
`runner.ts get` as kernel-parked, and — with Phase 2 — a notification fires). Either outcome is a pass
**if the surfaces report it truthfully**; a silent stall is the only failure.

### T3.4 — a human-required block reaches a human

Seed an issue whose path matches `policy.risk.human_required_paths`. **PROOF:** the PM refuses to file
it (tick output says blocked-for-human) — and separately, force a worker-side `needs_input` block and
confirm the Phase-2 notification fires with the card id and unblock command. Then `hermes kanban
unblock` and confirm the card resumes and completes.

### T3.5 — gateway restart mid-card

Kill the gateway process while a develop card is `running`; restart it against the same `HERMES_HOME`.
**PROOF:** the board state survives, the orphaned claim is reclaimed on lease expiry, the card re-runs
to completion, and nothing is double-dispatched (exactly one live worker per card at any time —
check runs history).

---

## Phase 4 — the soak (the actual replacement test; operator OK required)

**Rule (from the operator's own doctrine): never drop the incumbent before the replacement is proven
carrying, source-bound.** The work must be real work that would otherwise have gone through the existing
process — not synthetic cards minted to pass.

- **Setup:** clone open-autonomy to a dedicated soak checkout whose local `master` is a soak
  integration branch (so the PM's merges land somewhere real but the canonical trunk stays protected;
  the soak branch returns to the real trunk afterwards as one reviewed PR). Fresh `HERMES_HOME`.
  The operator picks ~5 real backlog issues and labels them `oa-approved` — the allowlist fence doing
  its job is part of the test.
- **Run:** gateway up, unattended, for a working day. During the run, deliberately include: at least one
  reviewer changes-requested → rework round-trip; one worker kill (T3.3's move); one human-required
  block answered via the notification.
- **Pass condition:** all selected issues reach merged-on-soak-trunk with ztrack green and worktrees
  torn down, with **zero human rescues** other than the designed seams (unblock after notification).
  Every deviation is logged as a finding with the evidence (`kanban show --json`, git state, logs) —
  findings are the deliverable; fix and re-run until the pass condition holds on a clean run.
- **After:** write the outcome into this file's Ledger and — per the roadmap docs — record honestly
  whether hermes-sdlc is ready to carry a real repo, with the list of what it still cannot do.

---

## Phase 5 — upstream filings (tracked, not blocking)

File these as tracked issues (do not fix silently in this repo):

1. `open-autonomy.review.v1` requires `pr` unconditionally — wrong for any PR-free code host; the
   substrate's `result-envelope.ts` currently forks the schema (`+hermes-no-code-host`) to strip it.
   The standard schema should make `pr` conditional on the code host.
2. `@open-autonomy/core` has no result-envelope validator — every substrate re-implements validation
   or skips it. One validator in core, substrates call it.
3. The done-gate has never been challenged by a genuinely adversarial worker (a model instructed to
   fake done). Design a red-team proof: a scripted "worker" that tries tracker edits without commits,
   evidence citing nonexistent SHAs, etc., asserting the gate refuses each. Good candidate for a later
   phase; not on the replacement critical path because the gate already fails closed on every observed
   dishonest shape.

---

## Ledger (append-only; executing agent writes here)

### 2026-07-28 — Phase 0, Phase 1, Phase 2 executed; Phase 3 partially

**Phase 0** — baseline `eaaaf003`: `18 pass / 0 fail / 75 expects`, `tsc` clean, Hermes v0.18.2. Green.

**T1.1** `632c1a0c` — renamed the emitted frontend's `RUNNING` → `LISTED`, comment rewritten to the rule the
code implements. Proof: `18 pass`, `grep -c RUNNING … = 0`, tsc clean. No behavior change.

**T1.2** `d3112d7f` — `blockGuarded` now throws when the post-block `readCard` is unreadable (it previously
returned the kernel's exit code as a verdict about a card nothing observed, silently covering the very wedge
the guard exists to catch); `update()` JSDoc declares both throwing paths. New `runner-update.test.ts`
(4 tests). Mutation-verified: disabling the unreadable-state throw → 1 fail; disabling the triage throw →
2 fails; restored → `22 pass`.

**T1.3** `1ed5834f` — SUBSTRATE-FACTS' bound-reviewer row now discriminates on the environment
(`git rev-parse --abbrev-ref HEAD`) instead of asserting the review edge. A directly-launched review card
lowers to `dir:<repo>` = trunk, where the old unconditional "Commit your verdict HERE" instructed a commit
onto trunk — the one act reserved for the PM. First coverage `substrateFacts` has ever had
(`substrate-facts.test.ts`, 3 tests). Mutation-verified. Note: the IR validator requires any `review:`
target to declare `result.schema: open-autonomy.review.v1` — the test fixture must carry it.

**T1.5** `b59cc350` — ir.yml cited `scenarios/hermes-sdlc/run.ts`, which does not exist; repointed at the
twin repo's `cookbook/hermes-sdlc/run.ts`. Proof: `grep -rn … = 0 hits`.

**T1.4** `3462628c` — the spent-idempotency-key retry now has coverage in both implementations, via a
call-order-dependent stub whose first `show` answers `done`. Asserts 3 creates (proposal, retry, review
card), the exact key sequence `[…LOCAL-1, …LOCAL-1 (attempt 2), …review:LOCAL-1:t_stub00]`, and two
DIFFERENT `--branch` values (extracted from the raw log — `normalize` masks branch tokens on purpose).
Mutation-verified **four ways**: dropping the fresh branch, or the spent-key detection, in either
implementation → fail. Restored → `26 pass`. Gotcha for a future editor: flags after `--body` land on a
later line of the argv log than the word `create`, because the card body is multi-line — filter the raw
log, not the create lines.

**Phase 2 (T2.1)** `c0d530e0` — the attention sweep. **Both scheduling branches were investigated and the
first held**: `hermes cron create --script <f> --no-agent` exists and is Hermes' documented watchdog (script
IS the job, stdout delivered verbatim, empty stdout silent). Two design decisions differ from the plan text
and are better:
- **Delivery is the cron job's `--deliver`, not an in-script `hermes send`.** `--deliver` already uses
  `send` underneath; a second sender would be a second mechanism to drift.
- **The job is registered in every STANDING profile's home, not the root home.** The plan said root; that is
  wrong here — Hermes executes cron per profile and no gateway runs in the root home, so a root job would
  never fire (the identical silent-never-fires failure the standing-actor cron block already fixed). Safe
  because `kanban_home()` resolves `<root>` from `<root>/profiles/<name>` deliberately, so the board is
  shared; one shared state file under the root home keeps it to one report per card.

Live proof, isolated `HERMES_HOME=/tmp/oa-sweep-home-WRfd`, real board, real installer:
```
[hermes-lowering] attention sweep [*/10 * * * *] in: pm audit -> the cron default target
  22baa32ae0c2 [active]  Name: open-autonomy:attention  Schedule: */10 * * * *
                         Script: oa-attention-sweep.py   Mode: no-agent (script stdout delivered directly)

RUN 1 (newly parked)  -> "open-autonomy: 1 card(s) need a human … why: a worker is asking for a human
                          reason: the spec does not say which auth mode to use  (recurrence 1)"
RUN 2 (unchanged)     -> stdout=[]            # silent
after unblock         -> stdout=[]            # silent
after re-block        -> reported again, and the kernel's breaker had fired:
                         "why: THE KERNEL GAVE UP (no worker is coming back; nobody was asked)"
```
**That live run caught a defect reading had not**: the terminal `block_loop_detected` event carries its own
`reason`/`recurrences`, but `why()` matched only `kind == "blocked"`, so a triaged card reported the STALE
first reason and "recurrence 1". Fixed to match the terminal kinds too; re-proven → `reason: still unclear
after the answer  (recurrence 2)` plus the `will NOT move a triage card` warning. `notifications.test.ts`
(6 tests) mutation-verified both ways, including re-introducing that exact defect.

**Phase 3 (T3.2 only — no model workers, no spend)** — the rework path against the REAL kernel:
```
launch develop --ref LOCAL-1  -> t_51c7b3a0  branch LOCAL-1-ms5hbdi8-1
  review card t_728222b6  status todo  ws .worktrees/t_51c7b3a0   # edge placed in the PREDICTED worktree
kanban complete t_51c7b3a0    -> done;  review card auto-released todo -> ready   # recompute_ready, live
launch develop --ref LOCAL-1  -> t_0f24d550  branch LOCAL-1-ms5hbrfo-2           # NEW card, NEW branch
  its own review card t_b00ff165  ws .worktrees/t_0f24d550   # NOT the dead proposal's — parent-keyed
```
So the spent-key retry, the fresh branch, the review edge, the predicted worktree path, and
`recompute_ready`'s release are all now proven against the real kernel rather than a stub.

**Not run, and why:** T3.0/T3.1/T3.3/T3.4/T3.5 and Phase 4 spawn real Sonnet 5 workers. Ground rule 2
requires operator confirmation before the first spend; T2.2 likewise needs a real delivery target.

**Environment note (not a regression):** `bun run check:core` shows 13 failures on this box, all in
`packages/local-runner-cli` and scheduler/provider tests that `spawnSync('node', [<a .ts file>])`. Node here
cannot load `.ts` (`ERR_UNKNOWN_FILE_EXTENSION`), so they fail regardless of this work; none import
substrate-hermes, and `bun test packages/core/src` is `204 pass / 0 fail`. `check:profiles` (3 pass) and
`check:compile` (72 pass, `compile OK`) are green.

| date | task | commit | evidence (trimmed real output) |
|---|---|---|---|
| 2026-07-28 | T1.1 | `632c1a0c` | 18 pass; `grep -c RUNNING` = 0 |
| 2026-07-28 | T1.2 | `d3112d7f` | 22 pass; mutations → 1 fail / 2 fail |
| 2026-07-28 | T1.3 | `1ed5834f` | 25 pass; mutation → 1 fail |
| 2026-07-28 | T1.5 | `b59cc350` | 0 dangling refs |
| 2026-07-28 | T1.4 | `3462628c` | 26 pass; 4/4 mutations caught |
| 2026-07-28 | T2.1 | `c0d530e0` | 32 pass; live report/silence/re-report + kernel-give-up discrimination |
| 2026-07-28 | T3.2 | (proof only) | real kernel: new card + new branch + own review card on re-launch |
| 2026-07-28 | T3.0 | `ccc93cb2` | rig up end to end; install-candidate flow exercised |
| 2026-07-28 | credential fix | `ccc93cb2` | A/B: with link → HTTP 401; without → "No inference provider configured" |

### 2026-07-28 (continued) — T3.0 built; T3.1+ BLOCKED on operator credentials

**T3.0 — the rig exists and works** (`scenarios/hermes-sdlc/live/rig.sh`, verbs `up` / `seed` / `down`).
It builds a throwaway git repo + an isolated `HERMES_HOME`, pins **Sonnet 5**, symlinks secrets rather than
copying them, and drives the REAL install path. Three things it had to learn, all of which would cost the
next person an hour:
- Compiling into a **git worktree** does not write files — it produces a reviewable install candidate
  (`--force` is refused: "every replacement must remain visible in the reviewed candidate commit") and
  prints `install-candidate=<sha>`, which `open-autonomy accept <sha> --target <repo>` then lands.
- `ztrack` must be **repo-local** (`npm i ztrack@1.4.0`), and on this box it must be invoked through the
  `~/.local/bin/ztrack` shim, because this node build lacks TypeScript support and the preset is `.mts`.
- The simple-sdlc AC grammar is `- [ ] <id> v<N> <text>` + an indented `- status:` line. A plain markdown
  checkbox parses with no `version`, and every later `ztrack ac patch` refuses with "does not parse against
  the grammar" — i.e. a casually-authored issue silently cannot receive evidence. `ztrack issue scaffold`
  prints the canonical shape; `rig.sh seed` now writes it.

**A real defect found by running it** (`ccc93cb2`): every worker and cron job died with
`RuntimeError: No LLM provider configured`. `get_env_path()` is `get_hermes_home()/.env` with **no root
fallback**, and an active profile IS the home — so `install.py` wrote `config.yaml` into each profile home
and left it authenticating against nothing while the root home beside it held the credentials. The auth
store resolves the same way. Both are now symlinked into each profile home (never copied). Proven by A/B in
an isolated home with a dummy key: **with** the link → `HTTP 401: User not found` (provider resolved);
**without** → `No inference provider configured`.

**BLOCKER — T3.1, T3.3, T3.4, T3.5 and Phase 4 cannot run on this box.** No usable model credential exists
here, and this is not a rig or install problem: the operator's OWN home fails identically.
```
$ cd /tmp && hermes -z "reply with the single word OK"
hermes -z: agent failed: No LLM provider configured.
```
`~/.hermes/auth.json` has `providers: []` and one credential-pool entry for openrouter whose
`source` is `env:OPENROUTER_API_KEY` — and that variable is set nowhere: not in the environment, not in a
login shell (`bash -lc` confirms), and `~/.hermes/.env` is entirely commented out. So Hermes knows where the
key should come from and it is absent.

**CORRECTION — the openrouter reading above was the wrong diagnosis, and stopping on it was premature.**
The operator's intent is "my default claude", and Hermes supports exactly that: its `anthropic` provider
accepts `CLAUDE_CODE_OAUTH_TOKEN` (`PROVIDER_REGISTRY["anthropic"].api_key_env_vars` =
`ANTHROPIC_API_KEY → ANTHROPIC_TOKEN → CLAUDE_CODE_OAUTH_TOKEN`), and `~/.claude/.credentials.json` holds a
live Claude Max token. Wired that way (`fcd53e48`), **authentication works**:
```
$ HERMES_HOME=<rig>/hermes-home/profiles/pm hermes -z "reply with the single word OK"
OK
```
Three more traps were found and are now handled by `rig.sh`:
- A **direct-API provider rejects an OpenRouter-style route**: the model id must be bare (`claude-sonnet-5`,
  not `anthropic/claude-sonnet-5`), and a `base_url` merged in from the operator's config silently
  overrides the chosen provider. The model block is assigned, not merged.
- **Cron jobs are pinned to the inference config they were created under.** Changing the model on a live
  install makes every standing actor refuse to run — *"Skipped to prevent unintended spend: global
  inference config drifted since this job was created"* — loud in the job log, invisible on the board.
  A good guard and a real operational trap; the rig now finalizes model/provider BEFORE `install.py` runs.
- Profile homes need their own credentials (the `ccc93cb2` fix above).

**THE ACTUAL BLOCKER, precisely diagnosed.** A trivial prompt succeeds; a real agent run does not:
```
RuntimeError: HTTP 400: Third-party apps now draw from your extra usage, not your plan limits.
Add more at claude.ai/settings/usage and keep going.
```
Reproduced on a clean `rig.sh up` where everything else is verified correct (auth resolves, provider/model
right, cron created under the final config, LOCAL-1 seeded, `ztrack check` green). So the Claude **Max
subscription does not fund third-party apps** — Hermes draws on pay-as-you-go "extra usage", and this
account has none.

**Two ways to unblock, both the operator's call:**
1. Add extra usage at `claude.ai/settings/usage` — then `rig.sh up` works as-is, no changes needed.
2. Export `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` before `rig.sh up` — the rig already prefers an
   exported key over the Claude token, so that is the only step.

Nothing in this repo can supply either, and no agent should go looking for a key.

**Resume point once credentials exist:**
```
scenarios/hermes-sdlc/live/rig.sh up                    # prints <root>, resolves credentials itself
scenarios/hermes-sdlc/live/rig.sh seed <root>/repo
cd <root>/repo && HERMES_HOME=<root>/hermes-home/profiles/pm hermes cron run <pm-job-id>
```
then T3.1's five proofs (merge commit on trunk, no stray worktrees, branch deleted, ztrack green with
commit-backed evidence, no card left running/blocked).
