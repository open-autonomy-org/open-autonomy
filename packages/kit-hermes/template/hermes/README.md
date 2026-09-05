# This project's agent

This directory is a complete Hermes home (`HERMES_HOME`), from the Open Autonomy Hermes kit. Everything the
agent is lives here and is committed: `SOUL.md` (identity), `skills/` (the two things it does beyond what Hermes
brings: `develop`, `pm`), `kanban.seed.json` (the board's first tasks, in order; one with a `held` reason is filed parked, the owner's to release with `hermes kanban unblock`), `cron/jobs.seed.json` (its one job: the
PM, hourly), `config.yaml` (which model, through the platform; a worker takes it at dispatch, so a model change
never strands anything), `hooks/` (the seed: the schedule and the board, on every boot, idempotent). Its runtime
state (sessions, logs, caches, `.env`, the board's database) is git-ignored.

The agent's model calls go through the Open Autonomy platform on the project's key, so every call is metered
to this project's account and paid for by its patrons. The board is the roadmap: the owner files tasks
(`hermes kanban create`), the gateway's dispatcher pulls them down in order and runs each as a worker session
that builds it and lands it on an `agent/<task id>` branch, the review lane (Hermes's own) verifies the handoff
against `CONSTITUTION.md` and `CONTRIBUTING.md` in a session of its own, and once an hour the PM job reads the whole board and unsticks what is
stuck. The reporter beside it (`.open-autonomy/reporter.ts`) publishes the board, every session, the agent's setup,
and the project's documents (`CONSTITUTION.md` as what it is, `CHANGELOG.md` as what shipped) to the project's
page as they happen. The platform reads none of these files itself.

How it runs, and how to run it yourself: `container/README.md`.
