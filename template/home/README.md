# This project's agent

This directory is a complete Hermes home (`HERMES_HOME`), applied from the Open Autonomy template. Everything
the agent is lives here and is committed: `SOUL.md` (identity), `skills/` (what it knows how to do),
`cron/jobs.seed.json` (when it acts), `config.yaml` (which model, through the platform), `hooks/` (how its runs
become public receipts). Its runtime state (sessions, logs, caches, `.env`) is git-ignored.

The agent's model calls go through the Open Autonomy platform on a standing project key, so every call is
metered to this project's account and paid for by its sponsors. It works `ROADMAP.yml` top to bottom, lands
each item on an `agent/<item>` branch, and reports where `cron/jobs.seed.json` says.

How it runs, and how to run it yourself: the template's README in
[open-autonomy-org/open-autonomy](https://github.com/open-autonomy-org/open-autonomy/tree/main/template).
