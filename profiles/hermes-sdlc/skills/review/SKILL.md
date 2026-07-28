---
name: review
description: Review one ztrack simple-sdlc issue; use when PM assigns an In Review issue that is green under ztrack check.
---

# ztrack simple-sdlc Review

Read:

- `standards/workflow.md`
- `standards/issue-and-evidence.md`
- `standards/risk-and-review.md`

You run in the **developer's own worktree**, on the branch they built — you are dispatched only after they
finished, so the tree is idle and yours to read. That is why `ztrack check`/`issue edit` auto-scope to your
issue from the branch, and why your verdict must be **committed here**: the evidence commits already live
on this branch, and a verdict committed anywhere else would collide with them when the PM integrates. You
are a **verdict** only — you mark the issue `done` or send it back; you **never merge** (the PM integrates
the branch after you approve).

## Procedure

1. Read the environment variable with `echo "$ZTRACK_ISSUE"`; stop if it is missing. `ZTRACK_ISSUE` is not a file.
2. **Confirm you are standing on the issue's branch** before reading anything:
   `git rev-parse --abbrev-ref HEAD` must contain `$ZTRACK_ISSUE`. If it does not — or the command fails
   because this is not a git worktree at all — stop immediately with
   `OUTCOME: blocked workspace-not-the-proposal`. Reviewing the wrong tree produces a confident verdict
   about code you never saw, which is worse than no verdict; refuse instead of improvising a path.
3. Run `ztrack check --json` (auto-scoped to your issue from the branch); stop if it's red.
4. Inspect the assigned issue's cited commits and evidence for each passed AC. **Read the commits
   themselves** — `git show <sha>` and `git show <sha> --stat` — rather than assuming the tracker's claim
   about them: a cited SHA existing is what `ztrack check` proves, and whether it contains the claimed
   change is what only you can. If a cited test/check exits 0, accept the command as passing; do not rerun
   only to get prettier reporter output.
5. Apply `risk-and-review.md`. If the change touches a human-required path or
   topic without explicit approval, send it back:
   `ztrack issue edit <issue> --remove-label ztrack:reviewing --state "in-progress"`,
   then `git add -A && git commit -m "review: changes-requested"`, and leave
   `OUTCOME: changes-requested human-required`.
6. If any claim does not hold, send it back the same way (`--remove-label ztrack:reviewing
   --state "in-progress"` + commit) and leave requested changes.
7. If all claims hold, approve: `ztrack issue edit <issue> --remove-label ztrack:reviewing --state done`,
   re-run `ztrack check`, then **commit the verdict** so it integrates:
   `git add -A && git commit -m "review: done $ZTRACK_ISSUE"`. The PM merges your branch next tick.

End with `OUTCOME: merged` or `OUTCOME: changes-requested`.
