---
name: organization
description: Run the organization's daily cycle — gather every project, record the meeting's outcomes and carry them down, post the memo with the agenda.
version: 1.0.0
metadata:
  hermes:
    tags: [open-autonomy, organization]
    category: devops
    requires_toolsets: [terminal]
---

# The organization's day

You run once a day. The organization's executors are its projects; your job is the memo and the meeting.
You dispatch nothing and edit no project's code. Load `project-communications` first: it names the
channel, the roster and who may decide.

## 1. Gather

For each project under `organization.projects` in `.open-autonomy/config.yaml` (an account, and where
one exists on this machine, a checkout path):

- Fetch its `origin/main` and read `git log --format='%H %an: %s' --name-only <cursor>..origin/main` in
  pages of 100, from the cursor the notepad keeps for that project
  (`hermes cron notepad <job> get cursor:<account>`); the first cycle has none and reads the last seven
  days. A project with no checkout here is read through the GitHub door
  (`bun .open-autonomy/community.ts read 'commits?since=<iso>&per_page=100'` against that repository).
- Read its `ROADMAP.md` and `CHANGELOG.md` at `origin/main`.
- Read what it says on the platform: `oa status <account>`, `oa roadmap <account>`, `oa sessions <account>`
  and `oa books <account>` (the SDK's doors; a project whose panels are closed to you answers `not open to
  this view`, which is a fact for the memo, not a gap to work around).
- Compare the two: git is what happened, the timeline is what the project claims. A roadmap that lags its
  git, or git that lags its roadmap, is a finding.

Read the organization's channel since the last memo, and this repository's home, project pages and latest
daily record. Keep one coverage line in the notepad per source; an unreadable source is a gap and is named
in the memo as one.

## 2. The meeting

Read the owner's answers under yesterday's memo. Each answer is an outcome of one of four kinds, and the
repository's operating runbook says where each lives:

- a target or commitment changed: a numbered decision in this repository's decisions, using its template and
  the next number, never rewriting an earlier one;
- work for a project: a request filed in that project's intake, an issue or discussion on the project's
  repository under the organization's roster identity, stating the outcome, its source (the memo's thread)
  and the acceptance in the owner's words, at the stated scope, never decomposed;
- a question still open: back on today's agenda, unchanged;
- a correction to the record: the affected page in this repository, with a dated correction appended to any
  past daily record it touches.

A minute is never the only copy of an action. A request you filed yesterday is checked today: has the
project's roadmap moved in response? Unmoved is a finding in today's memo, not a repeated request.

## 3. The memo

Post one message in the organization's channel, in this order, each part present even when empty:

1. **Results against commitments.** For each outcome on the project pages: the commitment, the latest
   measured actual with its date and source, and one word, ahead, on track, behind, or unknown. Unknown
   is a measure not collected, never zero.
2. **What moved.** Per project, what landed since yesterday, from git and the changelog, one line each,
   with the commit or pull request. What did not move, where the roadmap said it should.
3. **Gaps.** Sources not read, measures not collected, projects that publish nothing, roadmaps stale
   against their git.
4. **Yesterday's decisions and their effect.** Each outcome recorded yesterday and what changed because of it.
5. **Agenda.** The decisions that need the owner today, each as one question with the evidence beneath it
   and the options if there are options. Nothing else asks the owner anything.

Concise but complete: leave out what does not change a decision, never compress what does. Numbers go in a
table or on their own line. Every claim cites its source. Then update this repository's home summary and
today's daily record from the same evidence, commit on `agent/cycle-<date>` from fresh `origin/main`, and
push; the repository's landing takes it from there. Advance each project's cursor in the notepad to the
snapshot you read only after the memo is posted; a failed cycle advances nothing.

On the cadence the runbook names for the targets review, the memo carries the review's sections in place of
the daily ones; it is the same memo, not a second job.

## Keep the installation moving

Inspect `hermes cron list`, `runs` and `incidents` for a missed cycle or a delivery that did not reach the
channel; a memo prepared but not delivered is not a memo. Run `bun .open-autonomy/maintain.ts upgrade`,
then `restart`, for idle kit maintenance.
