# This project's agent

This directory is a complete Hermes home (`HERMES_HOME`), from the Open Autonomy Hermes kit. Everything the
agent is lives here and is committed: `SOUL.md` (identity), `skills/` (the three things it does: `develop`,
`review`, `pm`), `kanban.seed.json` (the board's first tasks, in order; one marked `triage` is filed but not released), `cron/jobs.seed.json` (its one job: the
PM, hourly), `config.yaml` (which model, through the platform; a worker takes it at dispatch, so a model change
never strands anything), `hooks/` (the seed: the schedule and the board, on every boot, idempotent). Its runtime
state (sessions, logs, caches, `.env`, the board's database) is git-ignored.

The agent's model calls go through the Open Autonomy platform on the project's key, so every call is metered
to this project's account and paid for by its patrons. The board is the roadmap: the owner files tasks
(`hermes kanban create`), the gateway's dispatcher pulls them down in order and runs each as a worker session
that builds it and lands it on an `agent/<task id>` branch, the review lane verifies the handoff against
`STANDARDS.md` in a session of its own, and once an hour the PM job reads the whole board and unsticks what is
stuck. The reporter beside it (`.open-autonomy/reporter.ts`) publishes the board, every session and the agent's
setup to the project's page as they happen.

How it runs, and how to run it yourself: `container/README.md`.
