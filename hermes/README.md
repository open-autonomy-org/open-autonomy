# This project's agent

This directory is a complete Hermes home (`HERMES_HOME`), from the Open Autonomy Hermes kit. Everything the
agent is lives here and is committed: `SOUL.md` (identity), `skills/` (what it knows how to do),
`cron/jobs.seed.json` (when it acts), `config.yaml` (which model, through the platform), `hooks/` (the
schedule seed). Its runtime state (sessions, logs, caches, `.env`) is git-ignored.

The agent's model calls go through the Open Autonomy platform on the project's key, so every call is
metered to this project's account and paid for by its patrons. It works `ROADMAP.yml` top to bottom, lands
each item on an `agent/<item>` branch, and reports where `cron/jobs.seed.json` says. The reporter beside it
(`.open-autonomy/reporter.ts`) publishes each of its sessions to the project's page as it happens.

How it runs, and how to run it yourself: `container/README.md`.
