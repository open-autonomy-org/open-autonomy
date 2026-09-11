---
name: develop
description: Build one board task — its acceptance lines are the whole definition of done — verify it where the project is verified, land it on an agent branch, hand off. Manual feature verification is your responsibility; automated tests are forbidden.
version: 4.4.0
metadata:
  hermes:
    tags: [open-autonomy, kanban, git]
    category: devops
    requires_toolsets: [terminal]
---

# Develop

You work one task from the board. `kanban_show` gives it to you: a title, and acceptance lines in its body.
Read its roadmap reference for purpose, scope authority, dependencies, human commitments and release gates.
A task or compatible constitutional goal does not authorize extra scope; report missing authorization to PM.
Those lines define the execution handoff; the roadmap outcome can remain open after this task. You make every one true in the running system; code existing
is not done.

## The work

1. Start from a fresh main: `git fetch origin && git checkout -B agent/<task id> origin/main`. If you already
   changed files, do this first and carry the changes over.
2. Read `ROADMAP.md` and any newer landed changes to your outcome. If outside work or owner direction
   supersedes your task, report the overlap for PM reconciliation before duplicating it. Read `CONSTITUTION.md` (what the project is and must remain: a task that would break an invariant or enter
   what is out of scope is blocked, not built), `CONTRIBUTING.md` (how code is written here) and `AGENTS.md`.
   Read the code an acceptance line touches before you write.
3. Build it. Match `CONTRIBUTING.md`. Automated tests are banned: their permanent code and maintenance
   obligations compound as agents add more, eventually making repository progress impossible. Never write
   or run automated tests, and never commit test code or a persistent test harness to main. This includes
   regression tests, even for constitutional invariants.
4. You are responsible for verifying the feature you add or change through REPL-style manual usage.
   Drive the running system where `AGENTS.md` says it is verified: in the project's own twin world when
   configured, otherwise by running the program itself. Use interactive commands or the actual UI, inspect
   each result, and exercise relevant failure cases. Use disposable synthetic data; write no permanent test
   code. Inspect command definitions before invoking them; never run automated tests through a check,
   script or hook. You cannot reach production and must not try. Record what you did, what happened and
   any unverified acceptance in the handoff. Source review alone does not demonstrate feature behavior.
5. Before landing, review the final diff against the authorized outcome and every constitutional invariant.
   An acceptance checklist or green check cannot waive either. Remove accidental scope expansion or block
   for the needed decision; native reviewers apply the same scope and constitution check to the handoff.
   Commit small, signed as the agent, the task id first in the subject:
   `git commit -s --author="Open Autonomy agent <agent@open-autonomy.org>" -m "<task id>: <what changed>"`.
6. Push the completed candidate to agent/<task id>. The landing workflow opens its PR and enables
   auto-merge; GitHub must require an approving review and dismiss stale approvals when the diff changes.
   Observe the open PR and record its URL and full head SHA. Pushing opens review, not permission to merge.
   Do not approve your own work, bypass review or merge as the implementer.
7. Hand off with `kanban_request_review`: name the PR, workspace, branch and full candidate SHA, then
   the manual actions and observed results for every acceptance line and any limitations. Leave the
   workspace intact. Do not name a reviewer; the native lane claims it. Implementers never complete their
   own task. Requested changes are committed and pushed to the same PR without rewriting history, then
   manually verified and handed back for review. A changed diff requires fresh approval.

## Native PR review

When dispatched as reviewer, follow sdlc-review with this project's manual-verification policy overriding
its generic automated-test instructions. Read the PR's actual diff, original task, source authority,
constitution and manual evidence. Compare the handed-off SHA with the current PR head before reviewing
and again before submitting the verdict. A changed candidate requires review of the new diff; never
approve it using evidence for an older commit. Do not edit the implementation while reviewing it.

For correctable defects, submit a GitHub REQUEST_CHANGES review and use `kanban_request_changes` with
concrete findings. For approval, submit a GitHub APPROVE review through the project's configured GitHub
door, explicitly setting commit_id to the reviewed full SHA and recording the manual evidence. A native
approval comment alone does not satisfy GitHub's merge gate. Do not use the PR author's identity to
approve its own PR, disable protection or claim permission failures are approval. Setup verifies that the
project's reviewer identity can approve PRs opened by the landing workflow's distinct GitHub Actions identity.

Observe the merge through GitHub and fetched origin/main, then `kanban_complete` with the PR, reviewed
SHA and landed evidence. A pending or failed merge is not completion: retain the approval evidence and
report the concrete blocker. Resume the unchanged approved PR without repeating completed verification.
Human release approval remains separate. Older already-merged work still needs honest execution review;
never claim it had pre-merge approval or reopen it simply to manufacture that history.

If a line cannot be made true from here, `kanban_block` with exactly what is missing, and stop. For a human
decision use `kind: "needs_input"`; for a permission you cannot obtain use `kind: "capability"`. State the
ask as an action: the exact command, page or secret name, and how the owner releases the task afterward.
Never include a secret value. PM reviews these blocks and contacts the human using the project's agreed communication practices.
Never file,
split or decompose implementation tasks: send discovered work and source evidence to the PM scrum. Do not loop on a failure you cannot
explain.

## When an acceptance line needs a purchase

You cannot pay: your key reaches the model, not the rails. The treasurer, a second profile of this same agent,
holds the only key that can. Ask it the way a company does, once, and wait:

1. File the request, the one task you may create:
   `kanban_create` with `assignee: "treasurer"`, `workspace_kind: "dir"`, `workspace_path: <the project checkout, your working directory>` (so the
   treasurer reads the owner's bounds), title `Purchase: <what> at <merchant>, at most $<ceiling>`, and a body of
   `- ` lines: what, merchant (and its category), at most N cents, purpose, `for task: <your task id>`,
   and how to pay (the merchant's checkout: a URL, a command). Stay within the owner's bounds in
   `.open-autonomy/config.yaml`; a request outside them is refused, and the bound is the owner's to change.
2. `kanban_block` your task with `kind: "needs_input"` and the request's title as the reason, and stop. (Not
   `dependency`: the board re-runs a dependency block at once when no parent is pending; `needs_input` holds
   until the treasurer releases you.)
3. When the treasurer has paid it posts `RECEIPT: …` as a comment on your task and unblocks it; your next
   attempt sees the receipt in `kanban_show`. Record what was bought where the acceptance line says, and go on.

The card never passes through you. Every purchase lands on the public audit trail under your task.

## The board from a shell

The board's tools (`kanban_show`, `kanban_create`, `kanban_block`, `kanban_request_review`) are yours in the
conversation. From the terminal the CLI needs its home and its path named in full:
`hermes kanban …` (HERMES_HOME is set in your environment).

## Cost

Every model call is metered to the project and public. Read before you write, manually verify the feature, and stop when verified.
