# This project's agent

This is a Hermes home: persona, skills (`pm`, `develop`, `community`), profiles, configuration and cron seeds.
The PM runs an hourly scrum over `ROADMAP.md` (notable present/future intentions) and `CHANGELOG.md`
(notable changes consolidated into main, separating Unreleased from released). It consolidates owner
direction, community input, outside contributions and fleet activity, coordinates human commitments and
required release review, and queues executable work through Hermes's native kanban. The community desk
runs every quarter hour and answers people; the dispatcher and review lane handle fleet execution.

`kanban.seed.json` is historical input for migration, no longer replayed at startup. A kit upgrade creates
missing roadmap notes from that seed without changing an existing roadmap or live board. The first scrum
reconciles those intentions with actual tasks and commits. The project owns its roadmap and cron schedule;
kit upgrades maintain the skills and hooks. Existing cron prompts still load the updated skills.

PM discovers ordinary contributions from Git, GitHub, configured channels, native session history and board
activity; contributors need no special handoff or roadmap/changelog edit. Shared documents are carefully
sourced distillations, not a journal of scrums, temporary failures or every message.

Runtime state lives in Hermes: native board, sessions and the PM cron notepad (bounded source checkpoints,
coverage gaps and unresolved pointers). `scrum-plan/` preserves an unfinished planning worktree. The helper
pins the main revision and session cutoff per scrum and acknowledges only explicitly reviewed sources after
landing. Later arrivals remain for the next batch. Legacy `scrum-intake/` notes are read until explicitly
reconciled and pruned; new optional pointers use the native notepad. Separate PM/community GitHub cursors
advance only after their inputs are accounted for. The existing SDK reporter publishes real fleet activity.

Setup writes the reviewing owner, contact channel and follow-up interval into the Project outreach policy
in `skills/open-autonomy/pm/SKILL.md`. That section is project-owned and survives kit upgrades. PM explicitly
selects delivery from those instructions; the escalation hook carries out the choice and reconciles its
receipts through native Discord subscriptions or GitHub issues. Credentials and legacy `owner` config
fields do not select a channel or authorize fallback. Missing policy or failed delivery stays a scrum gap.
Volunteer contributions use their accepted scope and agreed follow-up instead.
Maintainers alone review releases, cut tags and approve production. The PM prepares the review package and
keeps release-dependent outcomes open through verification. See `.open-autonomy/PRODUCTION.md`.

The start script runs the stack, drains active work before kit restarts, and keeps calls metered through
the platform. The reporter publishes real Hermes activity through the SDK; outside contributions are never
represented as fabricated fleet sessions. Running instructions: `container/README.md`.

PM owns release planning: maintain a sourced target schedule in ROADMAP.md, choose coherent scope and a
proposed version under project policy, and allow time for human review. A merge or elapsed target date is
not a release trigger. Only a landed, ready PM decision with a fixed candidate warrants a review request;
later main commits can accumulate independently. Humans approve the concrete proposal before shipping.
See `.open-autonomy/PRODUCTION.md` for the release fields and review package.
