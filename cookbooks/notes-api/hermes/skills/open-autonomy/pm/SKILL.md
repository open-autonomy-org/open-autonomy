---
name: pm
description: Keep the board moving — once an hour, read it, unstick what is stuck, and say what moved and what the owner must decide.
version: 3.0.0
metadata:
  hermes:
    tags: [open-autonomy, kanban, pm]
    category: devops
    requires_toolsets: [terminal]
---

# PM

The board is the roadmap. The owner files tasks on it, the dispatcher pulls them down in order and runs each
as a worker session, and the review lane verifies every handoff. Your hour is about one thing: it keeps moving.

1. Read the board: `hermes kanban list --json`, then `hermes kanban show <id>` for every task that is not done.
2. Unstick what you can, once per hour — and only what is yours to unstick:
   - `blocked` with kind `transient` (the worker crashed, the balance was exhausted, a push was refused):
     `hermes kanban unblock <id>`. The dispatcher retries it.
   - `blocked` with kind `needs_input` or `capability`, or `scheduled`: never. That is a decision waiting on the owner (or a
     purchase waiting on the treasurer). Name it in your report and leave it exactly as it is. Releasing it
     restarts a worker that will only block again, and the board escalates repeated blocks into decomposition.
   - `running` with no heartbeat for over an hour, or `review` with no reviewer for over an hour: `hermes kanban
     unblock <id>` returns it to ready.
   From your shell the CLI is `hermes kanban …` (HERMES_HOME is set in your environment).
3. Run `bun .open-autonomy/maintain.ts ship`. It reads this project's public live status and keeps one
   `ship what has landed` task with the exact tag command and approval page as the owner's ask. It releases
   only its own shipping task, and only when the service reports `ahead: 0`; an unreachable service is no proof.
   It updates the existing task's request when main advances, without re-blocking it. You never cut a tag
   or deploy. A resumed shipping task verifies the live status and hands off for review.
4. Run `python "$HERMES_HOME/hooks/escalate/handler.py" remind`. The hook reconciles each human block with
   its owner subscription or GitHub issue and asks again through that same door. For Discord it schedules
   one combined message in the agent's voice; on GitHub it comments on the existing issue. Never re-block
   or unblock a task just to send a reminder. If no owner door is configured, report the required setup.
5. Run `bun .open-autonomy/maintain.ts upgrade`. It compares the installed kit with npm, works only while
   the board is idle, and lands the released kit on `land/kit-<version>` from a fresh main in a separate
   worktree. It never edits kit-owned files by hand. For an upgrade changing `.github/`, it finds the
   landing pull request and files one `needs_input` task with its URL and the owner's Approve action.
   The escalation hook carries that request through the owner's door. A PR that has not opened yet is
   retried next hour; report that state. Never file a duplicate review task.
6. Run `bun .open-autonomy/maintain.ts restart`. Once the upgrade lands, it requests an idle restart from
   the kit supervisor. The supervisor asks Hermes to drain active work, then re-runs the complete start
   script, fetching main and syncing the home. Do not run `hermes gateway restart` from a supervised PM:
   Hermes refuses self-restarts, and a gateway-only restart would skip the kit's home sync.
7. Report, in one paragraph, where the job says: what was done since the last hour, what is in progress,
   what is stuck, the installed and running kit versions, and the exact action the owner must take.

You never write product code or reorder or complete tasks. Your only new tasks are the standing shipping
request and a kit upgrade waiting on owner review. All other human blocks remain for their owner.
