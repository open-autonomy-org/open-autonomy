# Running the fleet

A real installation runs in the kit's container mode: World owns one executor, a container of the pinned Hermes
and its tools on two volumes that outlive it, the agent's home and its checkout. The host runs
`.open-autonomy/start.ts --container` beside it: the credential valves, the SDK reporter and the gateway
supervision, as World's foreground command. No host credential directory or Docker socket is mounted into the
executor; Supercode reads native state inside it over its SDK transport, and the reporter publishes through the
Open Autonomy SDK. Bare `start.ts` is for development and twin rehearsals; it is not isolation.

`create-open-autonomy runtime` writes this shape from a landed checkout, so no installation hand-builds it:

```
<runtime>/releases/kit-<rev>/   the kit at that revision, its dependencies installed: the trusted host copy
<runtime>/world.json            World's definition: the executor service and its environment
<runtime>/build-world.json      the image build through World
<runtime>/state/, world/        the host reporter's state; World's own state root
the launchd unit                World `run` with the host command in the foreground
```

The executor's lifecycle is the kit's `container/executor.ts`, called by World for `up`, `status` and `down`:
it starts the one container by name with `--init`, a read-only root, dropped capabilities and resource limits,
and stops it on `down`. It never creates the volumes or the image: an empty home would be a new agent with the
old name. It can resume a provider first (`--provider colima:<profile>`) and use another daemon (`--docker-host`).
If a container with the executor's name survives a World that died, `up` refuses; `docker stop` it yourself.

## Prepare and start

The setup agent follows [SETUP.md](../.open-autonomy/SETUP.md); the platform keys and the project's GitHub App
must be in the protected credential directory first.

1. `create-open-autonomy runtime <checkout> --secrets <credentials> --prepare-volumes` from a landed
   revision. It cuts the release, creates the two volumes once, writes the World definition and the unit, and
   prints the build command.
2. Build the image with the printed World command (`up` the build definition; `doctor`; `down` releases the
   build reservation and keeps the image). Adjust the declared resources to the actual build before starting.
3. Put the checkout on its volume once, before the unit is loaded. The executor only sleeps until the host starts
   Hermes, so bring it up through World and step in as its user:
   `bun <release>/.open-autonomy/node_modules/@volter/twin-world/src/cli.ts up <runtime>/world.json --env-file <runtime>/world.env --root <runtime>/world`,
   then `docker exec -it --user hermes oa-<project> sh`; there, the repository-specific Git URL rewriting shown in
   SETUP.md and the clone of the canonical repository into `/work/project`; then World `down`. A temporary valve on
   the host proves both Git routes; stop it before startup. Startup only fetches and checks out inside that clone.
   Never mount the Docker socket or host credentials into the executor.
4. Load the printed unit. The host command stops its owned gateway when its control connection closes and
   exits when a required service dies; a non-zero exit (native restart, exit 75) restarts it through the
   service manager; a clean stop stays down. World must be healthy before the entrypoint runs.

Startup fetches main and verifies the project identity before starting Hermes, loads configuration from
committed main while preserving a dirty worker checkout, and waits for the reporter's SDK readiness. The agent
then reports what runs it, the mode, the kit version, the executor's image and the host, on its page's Agent tab.

## Verification and upgrades

Use unique directories under `/opt/data/artifact-verification` for extracted executable checks; `/tmp` may be
`noexec`. Product commands run through the product's World. Preserve active work, native state and
release-review artifacts during recovery. Never solve capacity failures by deleting worker files or weakening
limits.

Upgrade through `create-open-autonomy upgrade` (a three-way merge; resolve any marked conflict), review the change, land it, then `create-open-autonomy runtime`
again: a new release is cut and the unit points at it; the running service keeps the old release until the
service manager restarts it (the commands are printed, never run). Verify the reported kit version on the page
and a native operation. Existing project-owned divergence files require explicit reconciliation; do not erase
them to force a clean kit check.

## The slim executor

[`Dockerfile.slim`](Dockerfile.slim) builds the same executor for the headless daily PM skews
(`manage-project`, `manage-organization`), which need Hermes, git, bun and the `.open-autonomy` tools and nothing
else. It takes out browser automation, image/video generation, the media and C/C++ toolchains, the chat-platform
and cloud-provider Python SDKs, and the dashboard/TUI source trees — each through the tool that installed it
(`apt-get purge`, `uv pip uninstall`, `uv cache clean`), with the corresponding plugin keys written into Hermes's
own `plugins.disabled` denylist by `hermes plugins disable` so the agent reports a capability as off rather than
failing when it is called. The file's header comments name every removal and how to hand one back.

Measured on the `peak-media` colima profile, arm64, 2026-09-17, both images built from the same
`hermes-agent:v2026.8.31` base (2.66 GB on its own):

| | `oa-kit:current` | `oa-kit:slim` |
|---|---|---|
| image size (`docker images`) | 2.84 GB | 0.975 GB |
| idle gateway, container total (`docker stats` at 60 s) | 209.4 MiB | 131.3 MiB |
| idle gateway, `hermes` process RSS | 170.9 MiB | 129.5 MiB |

The gateway in both runs is `hermes gateway run --no-supervise -q` against a fresh `HERMES_HOME`, with no model
configured. `hermes --version`, `git --version`, `bun --version`, `supercode --version` and `hermes plugins list`
all answer in the slim image.

Where the 1.87 GB went, largest first: the Playwright chromium shell and its system half — xvfb, `libgbm1` and the
mesa/LLVM software-GL stack behind it, and chromium's CJK/emoji fonts (~450 MB); the dashboard and TUI npm build
trees, which are only needed to produce the bundles the base image has already built (394 MB); `uv`'s wheel cache
from the base build (327 MB); the Photon iMessage sidecar's baked `node_modules` (118 MB); ffmpeg and the C/C++
toolchain (~170 MB); and the optional Python extras, of which `google-api-python-client`'s baked API discovery
cache alone is 95 MB (167 MB total). What remains is dominated by things the PM skews do use: the `node` and `bun`
binaries, `uv`, the Hermes venv and the installed `.open-autonomy` tools.

One measured negative: seeding the plugin denylist into `HERMES_HOME` before starting the gateway made no
difference to idle RSS (133.2 MiB against 131.3 MiB without it, inside run-to-run noise). The bundled platform
plugins are already registered lazily by the base image, so the memory saving above comes from the packages and
extras that are gone, not from the denylist. The denylist earns its place by keeping Hermes's own account of
itself truthful, not by saving memory.
