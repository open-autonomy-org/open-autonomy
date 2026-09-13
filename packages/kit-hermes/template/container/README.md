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
3. As the executor's `hermes` user, configure the repository-specific Git URL rewriting shown in SETUP.md and
   clone the canonical repository into `/work/project` (a temporary valve on the host proves both Git routes;
   stop it before startup). Never mount the Docker socket or host credentials into the executor.
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

Upgrade through `create-open-autonomy upgrade`, review the change, land it, then `create-open-autonomy runtime`
again: a new release is cut and the unit points at it; the running service keeps the old release until the
service manager restarts it (the commands are printed, never run). Verify the reported kit version on the page
and a native operation. Existing project-owned divergence files require explicit reconciliation; do not erase
them to force a clean kit check.
