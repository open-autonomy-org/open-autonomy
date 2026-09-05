---
name: develop
description: Build one board task — its acceptance lines are the whole definition of done — verify it where the project is verified, land it on an agent branch, hand off. No tests for their own sake.
version: 3.0.0
metadata:
  hermes:
    tags: [open-autonomy, kanban, git]
    category: devops
    requires_toolsets: [terminal]
---

# Develop

You work one task from the board. `kanban_show` gives it to you: a title, and acceptance lines in its body.
Those lines are the whole definition of done. You make every one true in the running system; code existing
is not done.

## The work

1. Start from a fresh main: `git fetch origin && git checkout -B agent/<task id> origin/main`. If you already
   changed files, do this first and carry the changes over.
2. Read `CONSTITUTION.md` (what the project is and must remain: a task that would break an invariant or enter
   what is out of scope is blocked, not built), `CONTRIBUTING.md` (how code is written here) and `AGENTS.md`.
   Read the code an acceptance line touches before you write.
3. Build it. Match `CONTRIBUTING.md`. Write a test only where an acceptance line names one, or where the project's
   check would otherwise not cover the line; never tests for their own sake.
4. Verify every acceptance line where `AGENTS.md` says the project is verified: in the project's own twin world
   when it keeps one (`world/`), as its operator, driving the real surface; otherwise the project's check. You
   cannot reach production and must not try. Run the check once, green, before every push.
5. Commit small, signed as the agent, the task id first in the subject:
   `git commit -s --author="Open Autonomy agent <agent@open-autonomy.org>" -m "<task id>: <what changed>"`.
6. Push the branch: `git push -u origin agent/<task id>`. The landing workflow opens the pull request and merges
   it when the checks pass. Never wait for it; never open a pull request; never push to `main`; never rewrite
   history. If the branch exists from an earlier attempt, push to `agent/<task id>-<YYYYMMDD-HHMM>`.
7. Hand off: `kanban_request_review` naming the branch and the commit, and what is verified how.

If a line cannot be made true from here, `kanban_block` with exactly what is missing, and stop. Never file,
split or decompose tasks, and never create one: the board is the owner's. Do not loop on a failure you cannot
explain.

## When an acceptance line needs a purchase

You cannot pay: your key reaches the model, not the rails. The treasurer, a second profile of this same agent,
holds the only key that can. Ask it the way a company does, once, and wait:

1. File the request, the one task you may create:
   `kanban_create` with `assignee: "treasurer"`, `workspace_kind: "dir"`, `workspace_path: "/work/project"` (so the
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
`HERMES_HOME=/opt/data /opt/hermes/bin/hermes kanban …`.

## Cost

Every model call is metered to the project and public. Read before you write, run the check once, stop when
verified.
