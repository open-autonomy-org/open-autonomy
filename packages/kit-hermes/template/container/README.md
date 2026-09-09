# Running the agent

The agent is four processes: an ssh-agent holding the deploy key, the valve holding the project's keys (the
developer's on :8787, the treasurer's on :8788 — `--valve <port>` moves both — each re-read when its file changes), the keyless reporter, and
the Hermes gateway. For normal fleet operation, `.open-autonomy/start.ts` manages the complete stack.
This is the current container stack; it does not yet implement a host sidecar. Local Codex activation
is blocked until that integration is verified. See [setup](../.open-autonomy/SETUP.md); starting the whole
fleet as the host operator is not a supported local Codex substitute.
Before activation, the setup agent can run the SDK valve alone in a one-off container with its entrypoint
overridden to verify the configured connections; see [setup](../.open-autonomy/SETUP.md). Keep those ports
unpublished and stop that process before starting the fleet through the normal entrypoint.

On restart, the stack fetches `origin/main` before loading the Hermes home. It preserves an interrupted
task's dirty checkout and extracts the committed `hermes/` configuration separately. If Git access or
snapshot extraction fails, startup stops for the supervisor to retry; it does not load the dirty home
configuration as a fallback.

**In a container** is the default for a real deployment. **On your machine**, for development and fast debugging: everything as you, no isolation, the agent able to reach its own keys — an accepted trade while debugging, never the shape of production.

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

The credential directory is mounted read/write so the root valve can persist refreshed subscription tokens
across restarts. Keep it owner-only (directory mode 700, credential files 600), owned by a UID different from
the container's `hermes` user. Startup checks access as that user before starting services and refuses if it
can read or write the credential storage. Do not solve a permission failure by making credentials readable
to the agent. Existing installations need their container recreated with the updated Compose mount.

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

## Local host connection

Use a dedicated Docker bridge network for the project's local Codex runtime. On the tested Colima setup,
`host.docker.internal` reaches the host's loopback listener: the container connects to
`ws://host.docker.internal:<bridge-port>/session` with the existing project capability. Keep the
host bridge bound to `127.0.0.1`; its authentication and restricted protocol remain in force.

Publish the container's native Codex executor only on host loopback, using
`127.0.0.1:<executor-port>:51216`, and give the host Codex process
`ws://127.0.0.1:<executor-port>` as its executor URL. The executor listens on its container interface
on port 51216. Setup chooses unused host ports and verifies both directions in the selected Docker
context before starting Hermes. Keep the container's filesystem, user and capability restrictions.

This route requires access to the Docker host; an `internal` network blocks it on Colima. If the
selected Docker context cannot reach host loopback, resolve its host networking before activation; do not
expose the native executor or an unauthenticated valve on a public interface. A tunnel is an explicit
installation choice only when a required network boundary prevents the ordinary path.

The host reporter reads container state through the existing Supercode stdio connection over
`docker exec`. The complete host/gateway supervision still needs integration and verification as
described in [setup](../.open-autonomy/SETUP.md); local fleet activation remains guarded.

The Dockerfile’s `local` target includes the pinned native Codex executor and the Hermes stdio adapter.
Its entrypoint runs only the executor as `hermes`; the ordinary default and Compose target remain
`managed`. The host-owned `.open-autonomy/local-runtime.ts` supervises a prepared container’s gateway,
Codex bridge, loopback valves and reporter. Keep that host installation outside the agent-writable
checkout. For Git, follow the native URL mappings in `.open-autonomy/SETUP.md`: the host GitHub valve serves
HTTPS Git for the project App, whose Contents permission must allow writes. Setup must verify that
connection and finish communication before installing the persistent service; local activation remains guarded.

Local startup fetches `origin/main` before syncing the native home. Unfinished checkout changes and
runtime state are preserved; configuration and reporter policy come from the fetched commit. The
setup-selected `channels.env` is loaded into the native home for gateway and cron delivery, matching
the managed runtime. Messaging bot credentials are available to Hermes; App, platform and Codex
authentication remain with the host sidecar.
