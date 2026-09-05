# Running the agent

Three containers in one VM, none holding a secret that matters:

- **agent** — stock Hermes at the pinned tag (`hermes.pin`), with the project checkout at `/work/project`
  and the home volume at `/opt/data`, seeded from `hermes/` and re-synced from the repository on every start.
- **valve** — holds the project's key. The agent's model calls and the reporter's narration go through it;
  key management and admin routes never do. It re-reads the key file when it changes, so a rotated key
  needs no restart.
- **reporter** — keyless. Reads the agent's sessions through supercode and publishes them to the project's
  page through the valve, as they happen.

Every session's turns are published, so the agent's environment holds nothing whose leak matters:
its `.env` says `OPEN_AUTONOMY_KEY=valve`; pushes sign through an ssh-agent forwarded from the host holding
one repository-scoped deploy key; delivery uses at most a Discord bot token, which can only post as the bot.

## The host

- `~/.config/open-autonomy/agent.env` — the key, from `bun .open-autonomy/mint-key.ts`.
- An ssh-agent holding only the deploy key, forwarded into the Docker host (on macOS with colima:
  `SSH_AUTH_SOCK=~/.config/open-autonomy/agent.sock colima start <profile> --ssh-agent`).
- The pinned Hermes image: `sh container/build-hermes.sh` builds it from `hermes.pin`.

Then the two volumes, once: `oa-home` from your `hermes/` (with a `.env` naming
`OPEN_AUTONOMY_BASE_URL=http://valve:8787/v1`, `OPEN_AUTONOMY_KEY=valve`, and the Discord token if any) and
`oa-repo`, a clone made with the deploy key. Then:

```bash
AGENT_SECRETS=~/.config/open-autonomy docker compose -f container/compose.yml up -d --build
docker exec -u $UID oa-agent hermes cron list            # the schedule, seeded from hermes/cron/jobs.seed.json
docker exec -u $UID oa-agent hermes cron run file-roadmap-item   # fire now: files the top open item on the board
docker exec -u $UID oa-agent hermes kanban list                  # the board: the task, its lane, its attempts
docker logs -f oa-reporter                               # what is being published
```

The kit owns this directory; `create-open-autonomy upgrade .` brings it forward.
