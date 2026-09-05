# The world: Open Autonomy with no keys anywhere

`world/` is a [volter-world](https://github.com/volter-ai/twin): the platform built from this tree, against
local twins of GitHub and the model gateway, with the scenario that drives a run. No account, no credential,
no cloud, no spend, no Docker. Nothing in the world calls a real API, ever: the platform under test forwards
its model calls to the gateway twin, whose answers are the cookbook's scenario. The project under test is the
cookbook, started exactly as the kit starts it on a laptop (`.open-autonomy/start.ts`, bare, as you): its
gateway carries the schedule and works the board itself. The world seeds, waits and audits.

```bash
export TWINS_ROOT=/path/to/twin        # until the twin packages are published
export WORLD_STATE_ROOT=/fast/disk     # the world's state on a disk with headroom (the runtime admits a world against the root's free space)
bun world/run.ts up                    # twins + the real platform + the Actions runner, seeded; then the cookbook's agent (seconds)
open "$(bun world/run.ts env -- sh -c 'echo $PLATFORM_URL')/p/cookbook%2Ftodo-cli"   # the page: watch the board work
bun world/run.ts env -- curl -s "$PLATFORM_URL/v1/funding"   # anything, inside the world: the books, the sessions, the twins' ledgers
bun world/run.ts hermes kanban list    # the board, through the pinned Hermes against the world's home
bun world/run.ts hermes cron run pm    # the PM's hour, now
bun world/run.ts stack between-tasks   # what an owner does between two tasks: move the model, rotate the key, restart the agent
bun world/run.ts down --purge          # forget it (the agent's home and checkout too)
```

The world is an environment, not a test. Nothing in it asserts and nothing runs unattended: whoever brings it up
drives it one action at a time — the page, the books, the board, the twins' ledgers (`volter-world tail`) — and
reads what the product says. That is the repository's standing rule on tests: everything that runs by itself finishes
in under thirty seconds (`bun run check`), and behavior is verified by driving the running product.

The cookbook is `todo-cli` (`--cookbook <name>` picks another): nine seed tasks, each one command, which the
board's dispatcher pulls down in order from the moment the agent is up. The world stays up between edits; the
platform reloads on its own under `wrangler dev`; a kit change is `stack down --purge` and `stack up`.

## What is real and what is a twin

Real: the worker (under `wrangler dev`, its Durable Object holding the books), the cookbook's agent (the pinned
Hermes from `container/hermes.pin`, installed once under the world's state; the valve; the reporter with
supercode inside), git, and the skill the agent runs. Twins: GitHub (REST plane and the git wire; pull requests,
branch protection, required checks and auto-merge, landing a real merge commit) and the model gateway (the
`openai` twin as the `gateway` service).

Played by the world, and labelled as such: **GitHub Actions** (`actions.ts` opens the pull request for a
pushed `agent/**` branch, arms auto-merge, runs the project's own `bun run check` as the `ci` check run);
**the seal** (the world's environment: every vendor is a twin, and the proxy refuses anything untwinned).

The agent's key is minted the adopter way, inside the world: the platform issues a challenge, the seed
commits the claim file to the repository on the twin, the platform reads it back and mints.

## Files

| File | What it is |
|---|---|
| `world.json` | the logical world: two twins, the platform, the Actions runner, on pinned ports |
| `platform.ts` | the real worker as a world service, its upstreams pointed at the twins |
| `actions.ts` | GitHub Actions for the twin, played by the world |
| `stack.ts` | the cookbook's agent as the kit starts it, bare, inside the world's environment |
| `handlers/<cookbook>/gateway.ts` | the model's side of that cookbook's runs, and `stages/<item>/`, the files it writes |
| `seed.ts` | the seed, run with the world's env: the cookbook on the GitHub twin, the books funded, the keys minted the adopter way |
| `run.ts` | the runner |
