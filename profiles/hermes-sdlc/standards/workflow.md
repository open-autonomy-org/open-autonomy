# Workflow Standard

Read this from PM and Review skills.

## Isolation & integration

- Each issue is worked in its **own git worktree**, on a branch named for the issue. **The Runner names
  that branch, not you** — it carries a per-card token, because a worktree outlives the card that made it
  and git refuses one branch in two worktrees. Read a branch back (`runner.ts get <id> --json`,
  `git rev-parse --abbrev-ref HEAD`); never construct one, and never pass `--branch`.
- Develop and Review **share that one worktree**: the reviewer is dispatched into the proposal's tree only
  after the developer has finished, so it stands on the branch it reviews and its verdict commits beside
  the evidence.
- The tracker is a **shared board** (central across all worktrees), so the PM reads
  every issue's live state on trunk without inspecting worktrees.
- **Only the PM touches trunk.** Workers commit on their branch; the PM **integrates**
  a `done` issue by `git merge --no-ff <branch-from-the-runner>` into trunk, **and then removes that
  worktree and branch** — the kernel never reclaims a worktree (`complete`/`archive` do no cleanup and
  `kanban gc` prunes only events, logs and scratch workspaces), so integrated work accumulates forever if
  the PM does not tear it down. Review is a verdict only — it never merges.

## WIP

- At most one issue in `in-progress`, at most one in `in-review`.
- **The board's kernel enforces concurrency**, from `policy.maxConcurrent`; the PM does not count workers
  and must not re-implement the cap. To see what is actually in flight, ask the Runner
  (`runner.ts list --json`) — never infer it from branches or worktree directories, which outlive the
  sessions that made them.
- PM is the only integrator, and decides only what ENTERS the board; the kernel decides when each card runs.
- Develop and Review agents handle one issue and stop.
- **`ready` means implementable, not necessarily *approved for the loop*: dispatch eligibility
  additionally requires `policy.dispatch` (the `allow_label` allowlist, when `mode: allowlist`) and a
  body free of explicit deferral/do-not-dispatch markers.** State is a property the PM reads; the body's
  prose can still say "not this one" — prose wins.
- `ztrack:reviewing` means a review worker already claimed an `in-review` issue.
- **Rework:** when a reviewer requests changes it sends the issue back to `in-progress`
  and ends — the branch stays but no worker runs. The PM files `develop` for that issue again; the Runner
  returns the work to the same branch rather than opening a second one (filing is idempotent per issue).
  Only a genuinely broken/unrecoverable worktree (no rework feedback, worker dead, nothing salvageable) is
  reset to `ready` + dropped.

## States

The lifecycle states are exactly those of the `simple-sdlc` ztrack preset (lowercase):

| State | Meaning |
|---|---|
| `draft` | not yet ready to work |
| `ready` | issue can be implemented |
| `in-progress` | develop agent is working |
| `in-review` | implementation claims are ready to verify |
| `done` | all ACs are passed and ztrack is green |

There is no canceled state in this preset — to drop work, delete the issue
(`ztrack issue delete <id>`).

## Gates

A worker in its worktree runs `ztrack check` (it **auto-scopes** to the issue from
the branch name — no id needed) before every handoff. Review cannot start on a red
issue. Done is only allowed when all of the issue's ACs pass with evidence. (The PM
on trunk may run a whole-tracker `ztrack check` for board awareness.)

That last rule is **enforced, not merely asked for**: a `code:propose` worker's completion runs
`ztrack check` first and is REFUSED while the issue is red, with the findings handed back. The board's own
notion of done is "a worker returned" — which a worker that produced nothing satisfies just as well — so
this gate is what makes a `done` card mean the work exists. It fails CLOSED: if the check cannot run at
all, the completion is refused rather than presumed.
