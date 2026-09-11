# Running the fleet

For a managed installation, World owns one executor container. The host runs
`.open-autonomy/start.ts --container`: credential valves, the SDK reporter and gateway supervision.
Hermes and its workers run as `hermes` inside the executor. No host credential directory or Docker
socket is mounted there. Supercode reads native state inside the container over its SDK transport;
the reporter publishes it from the host through the Open Autonomy SDK.

The same native Hermes profiles support platform-funded models and the optional Codex subscription.
Model and GitHub App credentials stay in protected host storage. Explicitly configured native channel
credentials are supplied to Hermes through its home; do not print them. Bare `start.ts` is still useful
for development and twin rehearsals, but is not isolation. Use synthetic credentials there; a real
autonomous bare installation requires the existing `--as` OS user boundary protecting host credentials.

## Prepare and start

The setup agent follows [SETUP.md](../.open-autonomy/SETUP.md), using the existing Docker context and
World tooling. Keep host runtime code and credentials outside the agent-writable checkout.

1. Copy `container/build-world.json` beside the project and replace the build service's `cwd` with
   the absolute reviewed project checkout. Select the verified Docker context for the World command.
   Run `volter-world up <copied-build-world.json> --root <world-state-root>`; this builds the pinned
   Hermes base and then `todo-cli-agent:local`. Check `volter-world doctor todo-cli-image
   --root <world-state-root>`, then `volter-world down todo-cli-image --root <world-state-root>`
   to release the build reservation while retaining the image/cache. Adjust the declared peak resources
   to the actual build before starting. Install host `.open-autonomy` dependencies from its lockfile when present.
2. Copy `container/world.json` beside the project into the installation's World definition. Select the
   verified Docker context and resource budget there. World `up`, `doctor` and `down` own the executor.
   Preserve `--init`, the read-only root, resource limits and named home/checkout volumes. A restart
   preserves these volumes. Never mount the Docker socket or host credentials into the executor.
3. Run the SDK valve alone on the host to verify connections before activation (the setup guide gives
   its flags). Its GitHub App port is the selected base port plus three. As the executor's `hermes`
   user, configure the repository-specific Git URL rewriting shown in SETUP.md, then clone the canonical
   `https://github.com/cookbook/todo-cli.git` into `/work/project`. Verify that both effective fetch and push
   routes use the valve, including worker worktrees. Verify the installed App's Contents write grant and actual landing settings.
   Stop this temporary valve before startup; reuse the clone when resuming.
4. Install the reviewed kit's `.open-autonomy` directory in host-owned storage and run:

   ```bash
   bun .open-autonomy/start.ts --container oa-todo-cli --secrets /absolute/protected/project-credentials
   ```

   `--config` names the host project configuration when it is elsewhere; `--state` selects host reporter
   state; `--valve` selects four consecutive ports. The executor defaults are `/work/project` and
   `/opt/data`. The host-to-container address must be reachable: setup proves this with the real Git
   connection, not merely a host health check. Linux hosts may need an explicit host forwarding route;
   do not expose credential valves publicly to make that check pass.
5. Put that host command under the machine's existing service manager after verification. It stops its
   owned gateway when its control connection closes, and exits when a required service dies. Let shutdown
   finish before restarting. Native restart exit 75 is a request for the supervisor to restart the host
   entrypoint. The World must be healthy before that entrypoint runs.

During setup, verify orphan reaping, required tools, native write roots, executable scratch and both
Git routes. Startup fetches main and verifies the project identity before starting Hermes. It loads configuration from committed
main while preserving a dirty worker checkout. Reporter readiness comes from SDK initialization.
These checks do not replace a real task, review, landing, delivered human conversation and PM cycle.

## Verification and upgrades

Use unique directories under `/opt/data/artifact-verification` for extracted executable checks; `/tmp`
may be `noexec`. Product commands run through the product's World. Preserve active work, native state
and release-review artifacts during recovery. Never solve capacity failures by deleting worker files
or weakening limits.

Upgrade through `create-open-autonomy upgrade`, review the resulting change and manually verify the changed feature.
The host kit is a separate trusted installation: a changed checkout does not update that running copy.
Drain active work, install the reviewed kit on the host, then restart through the service manager and
World. Verify the reported running version and a native operation. Existing project-owned divergence
files require explicit reconciliation; do not erase them to force a clean kit check. Older Compose
installations need this setup migration, not an automatic destructive conversion of their volumes.
