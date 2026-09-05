# This project's agent

This directory is a complete Hermes home (`HERMES_HOME`), from the Open Autonomy Hermes kit. Everything the
agent is lives here and is committed: `SOUL.md` (identity), `skills/` (what it knows how to do: the roadmap's
grammar, landing, verifying in the world), `cron/jobs.seed.json` and `scripts/` (when it acts, and the fire
itself: a script that files the top open roadmap item on the agent's board and spends nothing), `config.yaml`
(which model, through the platform; a worker takes it at dispatch, so a model change never strands the
schedule), `hooks/` (the schedule seed). Its runtime state (sessions, logs, caches, `.env`) is git-ignored.

The agent's model calls go through the Open Autonomy platform on the project's key, so every call is
metered to this project's account and paid for by its patrons. It works `ROADMAP.yml` top to bottom through Hermes's own
board: each fire files the top open item as a task, the gateway's dispatcher runs it as a worker session,
the review lane verifies the handoff, and the item lands on an `agent/<item>` branch. The fire reports where
`cron/jobs.seed.json` says. The reporter beside it
(`.open-autonomy/reporter.ts`) publishes each of its sessions to the project's page as it happens.

How it runs, and how to run it yourself: `container/README.md`.
