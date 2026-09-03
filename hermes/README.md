# The Open Autonomy agent

This directory is a complete Hermes home (`HERMES_HOME`). Everything the agent is lives here and is
committed: `SOUL.md` (identity), `skills/` (what it knows how to do), `cron/jobs.json` (when it acts),
`config.yaml` (which model, through the platform). Its runtime state (sessions, logs, caches, `.env`)
is git-ignored.

The agent's model calls go through the platform on a standing project key, so every call is metered
to this project's account and paid for by its sponsors.

## Run it

Every run's turns are published live on the project page, so the agent runs where nothing it can read
is a secret that matters: a container (`container/compose.yml`) holding only its checkout and this home.

- **Model calls** go to a sidecar container that holds the project's standing key and forwards the model
  routes to the platform. The agent's own `.env` says `OPEN_AUTONOMY_KEY=sidecar`. The key file the sidecar
  reads lives on the host at `~/.config/open-autonomy/agent.env`, minted by `platform/scripts/hermes-key.ts`
  (the adopter way: a claim file proves control of the repo, no admin token).
- **Pushes** sign through an ssh-agent forwarded from the host, holding one repository-scoped deploy key.
  The agent pushes `agent/<item>` branches; `.github/workflows/land.yml` opens the pull request and it
  merges when the `ci` and `security` checks pass. The agent cannot push to `main`, open a pull request,
  cut a deploy tag, or dispatch a workflow.
- **Discord** is the one token in its reach: it can only post as the bot.

Host layout the compose file expects (`AGENT_ROOT`, default `~/volter/open-autonomy-agent`):

```text
~/volter/open-autonomy-agent/home   the Hermes home: this directory's tracked files, plus .env (Discord)
~/volter/open-autonomy-agent/repo   the agent's checkout (git@github.com:… over the deploy key)
~/.config/open-autonomy/agent.env   OPEN_AUTONOMY_KEY + OPEN_AUTONOMY_BASE_URL — the sidecar's, never the agent's
```

```bash
# the host: a dedicated ssh-agent with only the deploy key, forwarded into the VM the containers run in
SSH_AUTH_SOCK=~/.config/open-autonomy/agent.sock colima start open-autonomy --ssh-agent
# the containers: the sidecar and the gateway (Discord + the cron schedule)
docker compose -f container/compose.yml up -d --build
# a run now, inside the container
docker exec oa-agent hermes cron run build-roadmap
# narrate runs to the platform (the site's NOW / DONE bands): on the host, reading the container's home
SUPERCODE_BIN=/path/to/supercode bun platform/scripts/agent-reporter.ts --home ~/volter/open-autonomy-agent/home --repo ~/volter/open-autonomy-agent/repo --install
```

`cron/jobs.seed.json` pins the job's working directory to the container's checkout, `/work/open-autonomy`.

Discord: the bot "Open Autonomy" lives in the "Open Autonomy" server (invite: https://discord.gg/AcKMuMv2HC); the home's
`.env` carries `DISCORD_BOT_TOKEN`, `DISCORD_ALLOWED_USERS` (who may talk to it) and `DISCORD_HOME_CHANNEL`
(where the build-roadmap job delivers its reports).
