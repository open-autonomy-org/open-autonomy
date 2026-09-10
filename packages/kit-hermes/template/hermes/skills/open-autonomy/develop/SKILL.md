---
name: develop
description: Build one board task — its acceptance lines are the whole definition of done — verify it where the project is verified, land it on an agent branch, hand off. No tests for their own sake.
version: 4.2.0
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
3. Build it. Match `CONTRIBUTING.md`. Write no test unless the acceptance line guards an invariant of the
   constitution and `bun run check` stays under thirty seconds with it; behavior is verified by running the system,
   never by a test written for the occasion.
4. Verify every acceptance line by driving the running system where `AGENTS.md` says it is verified: in the
   project's own twin world when it keeps one (`world/`), as its operator, one action at a time, reading what
   comes back; otherwise by running the program itself. You cannot reach production and must not try. Run
   `bun run check` once, green, before every push.
5. Before landing, review the final diff against the authorized outcome and every constitutional invariant.
   An acceptance checklist or green check cannot waive either. Remove accidental scope expansion or block
   for the needed decision; native reviewers apply the same scope and constitution check to the handoff.
   Commit small, signed as the agent, the task id first in the subject:
   `git commit -s --author="Open Autonomy agent <agent@open-autonomy.org>" -m "<task id>: <what changed>"`.
6. Push the branch once, when every acceptance line is true: `git push -u origin agent/<task id>`. The landing
   merges whatever is pushed, so a push mid-task lands half a feature on main; commit as often as you like, push
   at the handoff. The landing workflow opens the pull request and merges
   it when the checks pass. Never wait for it; never open a pull request; never push to `main`; never rewrite
   history. If the branch exists from an earlier attempt, push to `agent/<task id>-<YYYYMMDD-HHMM>`.
7. Hand off: `kanban_request_review` naming the branch and the commit, and what is verified how. The handoff is the
   only way you end a task: you never run `hermes kanban complete`, `reclaim`, `unblock`, `archive` or `edit` on
   any task, yours included — completing is the review lane's act after it has read your work, and a task you
   complete yourself was never reviewed. Name no reviewer:
   the review lane takes the task itself, and a profile the home does not have would hold it forever. This call is
   how a task ends; a turn that ends without it marks the task done with nothing reviewed, which is never right —
   even when the work is already on main, hand it off.

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

Every model call is metered to the project and public. Read before you write, run the check once, stop when
verified.
