# The world: Open Autonomy with no keys anywhere

`world/` is a [volter-world](https://github.com/volter-ai/twin): the platform built from this tree, against
local twins of GitHub, Discord and the model gateway, with the scenario that drives a run. No account, no
credential, no cloud, no spend. Nothing in the world calls a real API, ever: the platform under test forwards
its model calls to the gateway twin, whose answers are the cookbook's scenario. The project under test is
the cookbook, run exactly as the kit runs it: its own three-container stack, whose gateway carries the
schedule and fires the run itself. The world seeds, moves the clock, waits and audits.

```bash
export TWINS_ROOT=/path/to/twin        # until the twin packages are published
bun world/run.ts up                    # twins + the real platform + the Actions runner, seeded; then the
                                       # cookbook's stack (container/compose.yml) on the world's VM
bun world/run.ts probe                 # the platform's own proof, no agent: the operator at its doors
bun world/run.ts kit                   # the kit's proof: published to the npm twin, `bun create open-autonomy` from it, the project's check
bun world/run.ts env -- curl -s "$PLATFORM_URL/v1/funding"   # anything, inside the world
bun world/run.ts clock advance 360m    # the container's clock: the schedule's next fire is now
bun world/run.ts wait                  # watch: the run's session, then its pull request merged on the twin
bun world/run.ts verify                # the audit: the books, the twin's main, the check, the page, the stream
bun world/run.ts down --purge          # forget it (the stack's volumes too)
WORLD_STATE_ROOT=/fast/disk bun world/run.ts check   # the world's state on a disk with headroom (the runtime admits a world against the root's free space)
bun world/run.ts check                 # the gate: up → probe → clock → wait → verify → down
bun world/run.ts check --cookbook notes-api   # the same gate on the second cookbook, a service
```

The cookbook is `todo-cli` (`--cookbook <name>` picks another): eight items, each one command and one test.
Each `clock advance 360m` fires the schedule once; the roadmap walks down one item per fire.

**The smoke path** while iterating: `up`, then `probe` for a platform change, or `clock advance 360m`,
`wait`, `verify` for anything the agent touches. The world stays up between edits; the platform reloads
on its own under `wrangler dev`; a kit change is `stack down --purge` and `stack up`.

## What is real and what is a twin

Real: the worker (under `wrangler dev`, its Durable Object holding the books), the cookbook's containers
(the agent on the pinned Hermes image, the key valve, the reporter with supercode inside), git, and the
skill the agent runs. Twins: GitHub (REST plane and the git wire; pull requests, branch protection, required
checks and auto-merge, landing a real merge commit), the model gateway (the `openai` twin as the `gateway`
service) and Discord (REST v10 and the gateway websocket, where the agent's bot delivers each run's report).

Played by the world, and labelled as such: **GitHub Actions** (`actions.ts` opens the pull request for a
pushed `agent/**` branch, arms auto-merge, runs the project's own `bun run check` as the `ci` check run);
**the seal** (off the stack's bridge only the host is reachable; `verify` probes it from inside the agent's
container); **the attach** (every container's DNS is the world's reflect resolver and its TLS trust the
session CA, so an unmodified `discord.py` logs into the Discord twin); **the clock** (libfaketime in the
agent's container, its offset a file `clock advance` moves).

The agent's key is minted the adopter way, inside the world: the platform issues a challenge, the seed
commits the claim file to the repository on the twin, the platform reads it back and mints.

## Files

| File | What it is |
|---|---|
| `world.json` | the logical world: three twins, the platform, the Actions runner, on pinned ports |
| `platform.ts` | the real worker as a world service, its upstreams pointed at the twins |
| `actions.ts` | GitHub Actions for the twin, played by the world |
| `stack.ts` `stack.override.yml` | the cookbook's stack as the adopter starts it, attached, on the world's Docker host, plus the clock |
| `handlers/<cookbook>/gateway.ts` | the model's side of that cookbook's runs, and `stages/<item>/`, the files it writes |
| `seed.ts` `probe.ts` `wait.ts` `verify.ts` | the steps, each run with the world's env |
| `run.ts` | the runner |
