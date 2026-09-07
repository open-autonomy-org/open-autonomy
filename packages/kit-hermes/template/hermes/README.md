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

The owner is configured under `owner: {github: <login>, discord: "<user id>"}`. The escalation hook routes
human authority blocks through Discord subscriptions or an assigned GitHub issue and closes them when
resolved. `owner.reminder_hours` controls unchanged reminders (default 24, minimum 1); materially changed
asks can be sent sooner. Volunteer contributions use their accepted scope and agreed follow-up instead.
Maintainers alone review releases, cut tags and approve production. The PM prepares the review package and
keeps release-dependent outcomes open through verification. See `.open-autonomy/PRODUCTION.md`.

The start script runs the stack, drains active work before kit restarts, and keeps calls metered through
the platform. The reporter publishes real Hermes activity through the SDK; outside contributions are never
represented as fabricated fleet sessions. Running instructions: `container/README.md`.
