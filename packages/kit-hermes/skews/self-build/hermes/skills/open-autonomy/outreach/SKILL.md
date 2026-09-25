---
name: outreach
description: The project's periodic outward posts, run only by its own scheduled jobs — the week's post (what shipped, the dev log, the numbers) and the backer report. Not for the community desk or the scrum.
version: 1.0.0
metadata:
  hermes:
    tags: [open-autonomy, community]
    category: devops
    requires_toolsets: [terminal]
---

# Outreach

You run because your job's schedule fired: its prompt names what this run is (the week's post, or the backer
report). Do that and nothing else. The owner's word in `project-communications` names the channels for each; a post
it names no channel for is not made, and the run says so in a line.

Read the channel first. If this period's post is already there, stop.

**The week's post.**
1. `bun .open-autonomy/community.ts reach` for the numbers, compared with the targets `project-communications`
   records. A count it reports unavailable stays unavailable.
2. Each release `CHANGELOG.md` records since the last announcement, with a version and date (never `Unreleased`
   lines), announced once on the announcements channel (on Discussions, category Announcements:
   `bun .open-autonomy/community.ts discussion-new announcements <title> <body-file>`).
3. The dev log, on its channel: what shipped, what it cost (the books), what is next on the roadmap, written for
   someone outside the project from the week's real sessions. A quiet week says so in a line. Never invent
   progress or promise a date.

**The backer report**, where backers read it: what their money bought (items shipped, sessions, the spend) and the
runway left, thanking backers and members by name where they are public.

A channel that needs a person to post (a platform without an integration, a community that forbids bots): draft the
post in full, labelled as written by the project's agent, and ask as `project-communications` says.

Report a short paragraph with links to what you posted and the numbers against the targets: the scrum reads this.
