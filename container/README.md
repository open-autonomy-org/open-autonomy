# Running the agent

The agent is four processes: an ssh-agent holding the deploy key, the valve holding the project's keys (the
developer's on :8787, the treasurer's on :8788 — `--valve <port>` moves both — each re-read when its file changes), the keyless reporter, and
the Hermes gateway. One script starts them, `.open-autonomy/start.ts`, and it is the only way they are started.

**On your machine**, for development: everything as you, no isolation.

```bash
bun .open-autonomy/mint-key.ts                                   # the developer's key → ~/.config/open-autonomy/agent.env
bun .open-autonomy/mint-key.ts --scopes spend,narrate,pay --out ~/.config/open-autonomy/treasurer.env
bun .open-autonomy/start.ts                                      # ssh-agent, valve, reporter, gateway; Ctrl-C ends all
HERMES_HOME=~/.local/state/open-autonomy/<project>/home hermes kanban list   # the board, from another shell
```

**In a container**, for a real setup: the same script is the image's entrypoint, run as root with the secrets
mounted for root alone; the gateway and the reporter run as the image's `hermes` user and can reach no key
(the script refuses to start if they could). Every session's turns are published, so the agent's environment
holds nothing whose leak matters: its `.env` says `OPEN_AUTONOMY_KEY=valve`; pushes sign through the
ssh-agent's socket; delivery uses at most a Discord bot token, which can only post as the bot.

- `~/.config/open-autonomy/agent.env` and `treasurer.env`: the keys, as above (rotate with `--rotate`; the
  valve takes the new key from the file without a restart).
- `~/.config/open-autonomy/deploy_key`: a deploy key for this one repository, write access:
  `ssh-keygen -t ed25519 -N '' -f ~/.config/open-autonomy/deploy_key` and
  `gh repo deploy-key add ~/.config/open-autonomy/deploy_key.pub --allow-write`. The container clones through it
  on first boot.
- The pinned Hermes image: `sh container/build-hermes.sh` builds it from `hermes.pin` (~10 minutes, once).

```bash
AGENT_SECRETS=~/.config/open-autonomy docker compose -f container/compose.yml up -d --build
docker logs -f oa-agent                                                          # the start's four processes
docker exec -u hermes oa-agent hermes kanban list                                # the board
docker exec -u hermes oa-agent hermes kanban create 'A task' --body '- its acceptance line' --assignee default --workspace dir:/work/project --skill develop
```

Several stacks on one Docker host: `STACK=<name> docker compose -p <name> …`; the container and volumes carry
the name (`<name>-agent`, `<name>-home`, `<name>-repo`). The default is `oa`.

The kit owns this directory and `.open-autonomy/start.ts`; `create-open-autonomy upgrade .` brings them forward.
