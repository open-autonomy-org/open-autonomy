---
name: develop
description: Implement one ztrack simple-sdlc issue and produce real evidence; use when assigned a Ready or rework issue by PM.
---

# ztrack simple-sdlc Develop

Read:

- `standards/issue-and-evidence.md`
- `standards/risk-and-review.md`

You run in **this issue's own git worktree**, on a branch named for the issue and isolated from other
workers. The branch is created for you — never rename it, and never construct or assume its exact name;
`git rev-parse --abbrev-ref HEAD` tells you what it is. Everything you commit stays on that branch until
the PM integrates it after review — so **commit both your code and the issue's tracker changes**
(`git add -A` catches the `.volter` updates), or they won't merge. `ztrack check`/`ac patch`/`issue edit`
auto-scope to your issue from the branch — no need to pass the id to `check`.

**You cannot finish while `ztrack check` is red.** Completing your assignment runs a gate that re-checks
the issue first and REFUSES the completion while anything is failing, handing you the findings instead of
letting you stop. So there is nothing to arm and nothing to remember: keep iterating until the issue is
genuinely green, or take an honest escape (below). A fabricated "done" is not a thing you can express here
— it is a refusal you will read, verbatim, and have to answer.

## Procedure

1. Read the environment variable with `echo "$ZTRACK_ISSUE"`; stop if it is missing. `ZTRACK_ISSUE` is not a file.
2. View only that assigned issue and implement only its ACs.
   Stop with `OUTCOME: blocked human-required` if the issue requires a
   human-required path or topic from `risk-and-review.md`.
3. Run `ztrack check` to see the ACs you must satisfy — this is the same check the completion gate
   will run, so treat its output as the definition of finished.
4. Run project tests/checks. If a relevant check exits 0, accept it as passing;
   do not rerun only to get prettier reporter output.
5. Commit the implementation (`git add -A && git commit`).
6. For each genuinely satisfied AC, mark it passed **with evidence + proof in one
   patch** (the commit SHA is the evidence) — see `standards/issue-and-evidence.md`:
   `ztrack ac patch <issue> <ac> --json '{"checked":true,"status":"passed","evidence":[{"id":"ev1","commit":"<sha>","acVersion":1}],"proof":{"explanation":"…","evidenceRefs":["ev1"]}}'`.
   For an artifact, `ztrack evidence add <file>` (prints `image=<path>`), commit it,
   add `"image":"<path>"` to the entry. Use `ztrack issue view <issue>` for the AC
   ids/`acVersion`; `ztrack check "$ZTRACK_ISSUE"` names the exact command in its fix
   hint. A checked/passed AC with no evidence fails `check` — never fabricate one.
7. Leave unsupported ACs unchecked. If a claim genuinely can't be satisfied, take an
   **honest escape** — never fake green to finish. The escape is a BLOCK, not a completion, so the
   done-gate does not stand in its way: either leave the AC pending and block with
   `OUTCOME: blocked <reason>` (the PM re-dispatches); descope the AC; or, for a
   finding an authority knowingly accepts, `ztrack waiver sign "$ZTRACK_ISSUE" --code
   <code> [--ac <acId>] --reason "…"`.
8. Move the issue to `in-review` when **`ztrack check`** (auto-scoped to your issue) is green:
   `ztrack issue edit <issue> --state "in-review"`. Do **not** survey other issues first — capacity is the
   kernel's business, not yours, and your reviewer is a card that was opened the moment you were filed.
9. **Commit the tracker change too** so it integrates with the code:
   `git add -A && git commit -m "evidence + in-review: $ZTRACK_ISSUE"`. Do **not**
   merge to trunk — the PM integrates your branch after review approves.

End with `OUTCOME: ready-for-review` or `OUTCOME: blocked <reason>`.
