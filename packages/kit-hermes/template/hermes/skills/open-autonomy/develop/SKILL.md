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
2. Read `AGENTS.md`, `STANDARDS.md` and `docs/VISION.md`. Read the code an acceptance line touches before you
   write.
3. Build it. Match `STANDARDS.md`. Write a test only where an acceptance line names one, or where the project's
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

If a line cannot be made true from here, `kanban_block` with exactly what is missing. Do not loop on a failure
you cannot explain.

## Spending through a rail

Only when an acceptance line needs a purchase (a domain, a service), and only within the owner's bounds in
`.open-autonomy/config.yaml`: `POST http://valve:8787/v1/rails/card` (`{usd_cents, purpose}`) mints a
single-use card bounded to that amount and the owner's merchant categories; a partner charge is
`POST http://valve:8787/v1/rails/partner`. Both need `authorization: Bearer valve`. Every purchase lands on the
public audit trail naming its purpose; a refusal is the owner's bound, not an error to work around. Record what
was bought in the repository where the line says.

## Cost

Every model call is metered to the project and public. Read before you write, run the check once, stop when
verified.
