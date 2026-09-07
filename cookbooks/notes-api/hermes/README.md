# This project's agent

This is a Hermes home: persona, skills (`pm`, `develop`, `community`), profiles, configuration and cron seeds.
The PM runs an hourly scrum over `ROADMAP.md`, the project's sourced working notes. It consolidates owner
direction, community input, outside contributions and fleet activity, coordinates human commitments and
required release review, and queues executable work through Hermes's native kanban. The community desk
runs every quarter hour and captures input; the dispatcher and review lane handle fleet execution.

`kanban.seed.json` is historical input for migration, no longer replayed at startup. A kit upgrade creates
missing roadmap notes from that seed without changing an existing roadmap or live board. The first scrum
reconciles those intentions with actual tasks and commits. The project owns its roadmap and cron schedule;
kit upgrades maintain the skills and hooks. Existing cron prompts still load the updated skills.

Runtime state is in the Hermes home: the native board, sessions and cron state, `scrum-intake/` (durable
sourced messages), `scrum-plan/` (an unfinished Git planning worktree), and separate PM/community cursors.
A scrum never advances the PM cursor before the plan lands. The platform's board and sessions continue
through the existing SDK reporter; repository planning notes live in ROADMAP.md.

The owner is configured under `owner: {github: <login>, discord: "<user id>"}`. The escalation hook routes
human authority blocks through Discord subscriptions or an assigned GitHub issue and closes them when
resolved. `owner.reminder_hours` controls unchanged reminders (default 24, minimum 1); materially changed
asks can be sent sooner. Volunteer contributions use their accepted scope and agreed follow-up instead.
Maintainers alone review releases, cut tags and approve production. The PM prepares the review package and
keeps release-dependent outcomes open through verification. See `.open-autonomy/PRODUCTION.md`.

The start script runs the stack, drains active work before kit restarts, and keeps calls metered through
the platform. The reporter publishes real Hermes activity through the SDK; outside contributions are never
represented as fabricated fleet sessions. Running instructions: `container/README.md`.
