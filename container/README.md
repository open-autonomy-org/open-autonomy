# Running the agent

Two containers, none holding a secret the agent can reach:

- **agent** — stock Hermes at the pinned tag (`hermes.pin`), with the project checkout at `/work/project`
  and the home volume at `/opt/data`, synced from `hermes/` on every start.
- **bridge** — everything the agent may use but must not possess: the valve (the developer's key on :8787, the
  treasurer's on :8788, each re-read when its file changes, `/healthz` naming the expiry), an ssh-agent holding
  the deploy key with its socket shared over a volume, and the keyless reporter that reads the agent's home
  through supercode and publishes it through the valve.

Every session's turns are published, so the agent's environment holds nothing whose leak matters: its `.env`
says `OPEN_AUTONOMY_KEY=valve`; pushes sign through the bridge's socket; delivery uses at most a Discord bot
token, which can only post as the bot.

## The host

`bun .open-autonomy/setup.ts` does the steps below, idempotently, and says what it cannot do and what to run
next. By hand:

- `~/.config/open-autonomy/agent.env` — the developer's key, from `bun .open-autonomy/mint-key.ts`;
  `~/.config/open-autonomy/treasurer.env` — the treasurer's, from `bun .open-autonomy/mint-key.ts --scopes
  spend,narrate,pay --out ~/.config/open-autonomy/treasurer.env`. Rotate with `--rotate`; the bridge takes the
  new key from the file without a restart.
- `~/.config/open-autonomy/deploy_key` — a deploy key for this one repository, write access:
  `ssh-keygen -t ed25519 -N '' -f ~/.config/open-autonomy/deploy_key` and `gh repo deploy-key add
  ~/.config/open-autonomy/deploy_key.pub --allow-write`.
- The pinned Hermes image: `sh container/build-hermes.sh` builds it from `hermes.pin`.

Then the two volumes, once: `oa-home` from your `hermes/` (with a `.env` naming
`OPEN_AUTONOMY_BASE_URL=http://bridge:8787/v1`, `OPEN_AUTONOMY_KEY=valve`, and the Discord token if any) and
`oa-repo`, a clone. Then:

```bash
AGENT_SECRETS=~/.config/open-autonomy docker compose -f container/compose.yml up -d --build
docker exec -u $UID oa-agent hermes cron list            # the schedule: the PM, hourly, seeded from hermes/cron/jobs.seed.json
docker exec -u $UID oa-agent hermes kanban create 'A task' --body '- its acceptance line' --assignee default --workspace dir:/work/project --skill develop   # file work
docker exec -u $UID oa-agent hermes kanban list                  # the board: the task, its lane, its attempts
docker logs -f oa-bridge                                 # the valve's keys, the reporter's publishing
```

Several stacks on one Docker host, two projects or a project beside a world's copy of it: give each a name,
`bun .open-autonomy/setup.ts --stack <name>` and `STACK=<name> docker compose -p <name> …`; the containers and
volumes carry it (`<name>-agent`, `<name>-home`). The default is `oa`.

The kit owns this directory; `create-open-autonomy upgrade .` brings it forward.
