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

Three containers, one VM (`container/compose.yml`): `oa-agent` (the gateway: Discord + the cron schedule),
`oa-sidecar` (the key), `oa-reporter` (narrates runs to the platform through supercode's harness protocol).
The Hermes home and the checkout live in Docker volumes, `oa-home` and `oa-repo`: SQLite over a host bind
mount crashes the gateway, and nothing on the host needs them. Inspect with `docker exec`.

On the host, only two things: the key file (`~/.config/open-autonomy/agent.env`) and an ssh-agent holding
the deploy key. `cron/jobs.seed.json` pins the job's working directory to `/work/open-autonomy`.

```bash
# once: the VM, with a dedicated ssh-agent (only the deploy key) forwarded into it
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/org.open-autonomy.ssh-agent.plist  # ssh-agent -a ~/.config/open-autonomy/agent.sock
SSH_AUTH_SOCK=~/.config/open-autonomy/agent.sock ssh-add ~/.config/open-autonomy/agent_deploy_key
SSH_AUTH_SOCK=~/.config/open-autonomy/agent.sock colima start open-autonomy --ssh-agent
export DOCKER_CONTEXT=colima-open-autonomy

# once: the volumes — this directory's tracked files plus a .env with the Discord token, and a clone
docker volume create oa-home && docker volume create oa-repo
#   seed oa-home from hermes/ (+ .env), and oa-repo from a clone made with the deploy key

# once: supercode for the VM, for the reporter image
container/build-supercode.sh

# every time
docker compose -f container/compose.yml up -d --build
docker exec -u $UID oa-agent hermes cron run build-roadmap    # a run now
docker logs -f oa-reporter                                     # what it is narrating
```

Discord: the bot "Open Autonomy" lives in the "Open Autonomy" server (invite: https://discord.gg/AcKMuMv2HC); the home's
`.env` carries `DISCORD_BOT_TOKEN`, `DISCORD_ALLOWED_USERS` (who may talk to it) and `DISCORD_HOME_CHANNEL`
(where the build-roadmap job delivers its reports).
