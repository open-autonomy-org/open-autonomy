---
name: pm
description: Run the project scrum — reconcile sourced roadmap notes with developments, coordinate people and fleet work, queue dispatch, and prepare human release review.
version: 4.0.0
metadata:
  hermes:
    tags: [open-autonomy, kanban, pm]
    category: devops
    requires_toolsets: [terminal]
---

# Scrum

`ROADMAP.md` is the project's planning memory: current work, future intentions, decisions, commitments,
and open questions. You maintain it within the owner's direction and `CONSTITUTION.md`. The kanban is the
fleet's working memory. Issues, PRs, discussions, chat and board activity are inputs, not competing plans.
Run this scrum hourly and when asked to reconcile a significant development. An older cron prompt saying
only "unstick the board" still invokes this whole skill.

## Reconcile and plan

1. Run `bun .open-autonomy/scrum.ts prepare`. It fetches main, creates or resumes a separate planning
   worktree, and prints its path, the full board, and durable intake notes. Work on `ROADMAP.md` there;
   never switch or clean the worker's checkout. Run helper commands from the original checkout;
   only editing, checks and Git commands for the planning PR run in the planning worktree. Read the roadmap, constitution, contributing rules and
   relevant Git history. If a previous planning branch awaits landing, resolve that before another plan.
2. Run `bun .open-autonomy/community.ts poll pm` for GitHub developments independently of the community
   desk's cursor. Read full sources, not just titles. Follow cited PRs into the diff and verification;
   inspect `hermes kanban show <id> --json` for active work, handoffs and comments. Review pending questions
   even when there is no new input. A failed or unavailable source remains an explicit coverage gap.
3. Consolidate into the roadmap. Give outcomes stable `## <id>: <title>` headings; keep the rest natural
   Markdown. Explain what is happening now, next and later, completion criteria, dependencies and unresolved
   contradictions. Cite every substantive claim or decision with a message permalink, issue/PR URL,
   commit/file link or `hermes:task/<id>` / session reference. Label Hermes deductions as proposals or
   inferences with their rationale and evidence. A person's suggestion is not an owner instruction.
   Preserve conflicting sources until resolved; don't silently replace explicit owner priorities or scope.
4. Account for outside contributions before queueing implementation. Record the real contributor and
   evidence, not an invented Hermes execution or cost. If work overlaps a running task, comment on it and
   coordinate a handoff or pause through Hermes's supported CLI; never reset its lease or edit its workspace.
   Use `hermes kanban --help` for state transitions. Do not call an active task done just because a PR merged.

If the constitution still reserves all task creation to the owner, do not queue new work. Prepare a
concrete proposed constitutional change for owner review and record the conflict in the roadmap. Continue
coordinating existing authorized work; never rewrite the constitution yourself.

On migration, the kit imports the old committed seed into roadmap notes, labelled as historical intentions.
Compare those notes with the live board and landed history before dispatch: match existing seed keys/titles,
link their actual IDs and retain their owners, holds and acceptance. Do not recreate existing work. Existing
owner-written roadmap content is preserved by upgrades. Update stale project instructions that still call
kanban the roadmap in the same planning PR, explaining the migration; never change the constitution.

## People and release

The repo builds itself by default. Record a human executor only with a source for their explicit "I'll do it"
or another accepted commitment. A request awaiting a reply is not an assignment; silence is not acceptance.
Acknowledge accepted scope through the same conversation, record the acknowledgment, and agree dates or
follow-ups rather than inventing them. Invitations remain proposals. No human profile belongs in fleet
queue commands; queue only the fleet's support, integration or verification work. If a commitment stalls,
ask or propose taking over before duplicating it. Pending replies do not stop independent work.

Required maintainer release review is an established human responsibility: request it without inventing a
voluntary commitment. Prepare the exact candidate commit, changes/diff links, verification evidence,
remaining risks and required review/tag/approval actions from the project's release instructions. Record
"awaiting human release review" and the request source; send through the configured owner door. Never tag,
approve or deploy. Approval applies to the reviewed candidate, not later commits. Code merged, release
approved, released and post-release verified are distinct facts. Keep release-dependent outcomes open
until their criteria are evidenced; absent live access means verification remains pending.

Use `.open-autonomy/community.ts comment <issue> <text>` / `discuss <number> <text>` for GitHub and Hermes's
configured messaging tools for chat. Read before posting, keep a source link to outreach in roadmap notes,
and reuse the existing conversation. Don't assign GitHub issues to people without acceptance except the
configured maintainer's established authority requests. Follow up when agreed or when a material change
needs attention; don't send an unchanged ask every scrum.

## Land the plan, then queue

Commit the roadmap and any necessary project-owned instruction correction on the planning branch printed
by `prepare`, signed as the agent with its scrum ID first. Run the project's check before pushing that
branch; the normal landing workflow handles the PR. Preserve an unfinished worktree across interruptions.
Do not rewrite history or push main. `bun .open-autonomy/scrum.ts finish` removes a clean planning worktree
only after its HEAD is on origin/main. A failed check, pending PR or conflict leaves it for you to resolve.
For a no-change scrum, don't manufacture a commit.

Queue a bounded amount of ready fleet work from the landed roadmap with:
`bun .open-autonomy/scrum.ts queue <outcome-id> <work-key> <title> <body> [parent-task-id]`.
Mark only ready fleet outcomes `Dispatch: fleet`; use `Dispatch: hold` for human work, future ideas and unresolved decisions.
The body names executable acceptance and its scope; use the same work key on retries and a new key only
for distinct work. The helper attaches a commit-pinned roadmap reference and an idempotency key. It refuses
an unsourced section. Check existing board work first: a different key is not permission to duplicate it.
Use parent dependencies to serialize tasks sharing a checkout. Future ideas, unresolved owner decisions,
and volunteered human work stay in the roadmap until fleet action is appropriate. Reconcile obsolete queued
work using the supported CLI; preserve history and explain withdrawals. Workers hand off to the review lane,
which alone completes their tasks. You can refine priorities and create tasks; you don't implement product code.

After the plan lands and its inputs are accounted for, run `bun .open-autonomy/community.ts mark pm`.
A failed scrum must not advance that cursor. Intake notes are immutable and stay available for later scrums;
record which note IDs were considered in the roadmap's short dated scrum record, with decisions and sources.
Don't claim every source was reviewed if one was unavailable.

## Keep the installation moving

- Retry explained transient blocks once per scrum. Leave human, capability and scheduled holds until the
  required decision or evidence arrives. Inspect stale running/review tasks; don't blindly release live work.
- Prepare `$HERMES_HOME/release-review.md` with `Candidate: <full commit>`, `Verification:`, `Risks:`,
  and `Human action:` plus source links. Use the exact project release procedure, never guessed tag names.
  Keep the package outside the checkout so preparing it does not change the candidate.
  Run `bun .open-autonomy/maintain.ts ship` to maintain the existing deployment request when live is behind.
  It sends a new request only with a package for that candidate. Record the request in the roadmap;
  delivery is not proof of human review. It releases only its
  own shipping task when the live service reports `ahead: 0`; unknown status releases nothing.
- Run `python "$HERMES_HOME/hooks/escalate/handler.py" remind` to reconcile owner doors. Respect the owner's
  configured reminder interval; human commitments outside those authority requests use agreed follow-ups.
- Run `bun .open-autonomy/maintain.ts upgrade`, then `restart` for idle kit maintenance. Workflow-changing
  upgrades wait for owner review. The supervisor drains and restarts the full stack after landing.

Report what changed in the plan and why, what was queued, pending commitments and release reviews, missing
sources, and installed/running kit versions. A scrum may conclude that the existing plan still holds.
