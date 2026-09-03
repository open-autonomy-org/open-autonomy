# The Open Autonomy agent

This directory is a complete Hermes home (`HERMES_HOME`). Everything the agent is lives here and is
committed: `SOUL.md` (identity), `skills/` (what it knows how to do), `cron/jobs.json` (when it acts),
`config.yaml` (which model, through the platform). Its runtime state (sessions, logs, caches, `.env`)
is git-ignored.

The agent's model calls go through the platform on a standing project key, so every call is metered
to this project's account and paid for by its sponsors.

## Run it

```bash
# once: mint the standing key into hermes/.env (needs the worker admin token in ./.env)
bun platform/scripts/hermes-key.ts

# talk to it
HERMES_HOME=$PWD/hermes hermes

# run the roadmap job now
HERMES_HOME=$PWD/hermes hermes cron run build-roadmap

# keep it running: the gateway daemon fires the cron jobs (and serves Discord if DISCORD_BOT_TOKEN is set)
HERMES_HOME=$PWD/hermes hermes gateway install
```

`cron/jobs.json` pins the job's working directory to this repository's absolute path; re-create the
job with `hermes cron create` if the checkout lives elsewhere.
