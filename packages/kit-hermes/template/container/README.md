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

The image includes OpenSSH for a host sidecar's persistent transport. Its
[inetd mode](https://man.openbsd.org/sshd#i) carries the SSH connection over
`docker exec -i --user hermes <container> /usr/sbin/sshd -i -e -f /opt/agent/sshd_config`.
It runs as `hermes`, needs no additional capabilities and publishes no Docker ports.
The host's ordinary SSH client supplies local and remote port forwards on that connection.

Before starting the gateway, the setup agent prepares native SSH authentication: create a dedicated
client key in the protected host runtime directory, and a host key in
`/opt/data/.open-autonomy-transport/host_key` inside the container. Install the client's public key
as `authorized_keys` beside that host key, and record the container's public host key in the host's
project-specific `known_hosts`. Keep the home and transport directory owner-only (700), and private
keys 600. These keys authenticate this local transport.

Write a native SSH client configuration in the host runtime directory with `ProxyCommand` set to
that Docker command, `IdentityFile` and `UserKnownHostsFile` pointing at those files, and
`BatchMode yes`, `IdentitiesOnly yes`, `StrictHostKeyChecking yes` and `ExitOnForwardFailure yes`.
Use `ssh -F <that config> -N -T <configured host>` under the existing supervisor. A local forward
binds a host loopback port to the container's native Codex executor on `127.0.0.1:51216`.
Remote forwards bind container loopback ports 8787–8790 to the host's developer valve, treasurer
valve, restricted Codex bridge and GitHub valve respectively. Setup chooses unused host ports;
container port numbers are private to each container. `sshd_config` permits just those endpoints
and disables shell sessions and agent forwarding.

Verify both directions, concurrent sessions and disconnect handling before starting Hermes. The
native transport supplies the connection; the host still owns the Codex bridge, reporter and
service supervision described in [setup](../.open-autonomy/SETUP.md). Local fleet activation remains
guarded until the complete arrangement is verified.
