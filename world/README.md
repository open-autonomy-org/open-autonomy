# The world: Open Autonomy with no keys anywhere

`world/` is a [volter-world](https://github.com/volter-ai/twin): the platform built from this tree, against
local twins of GitHub and the model gateway, with the scenarios that drive a run. No account, no credential,
no cloud, no spend. Nothing in the world calls a real API, ever: the platform under test forwards its
model calls to the gateway twin, whose answers are the cookbook's scenario. The projects under test are the
cookbooks, run exactly as the template runs them: their own container stack, whose gateway carries the
schedule and fires the run itself. The world seeds, moves the clock, waits and audits. It alters no code and
no process. Our own `hermes/` keeps running in production regardless.

```bash
export TWINS_ROOT=/path/to/twin        # until the twin packages are published
bun world/run.ts up --cookbook todo-cli   # twins + the real worker + the Actions runner, seeded; then the
                                          # cookbook's own stack (template/container/compose.yml) on the world's VM
bun world/run.ts env -- curl -s "$PLATFORM_URL/v1/funding"   # anything, inside the world
bun world/run.ts clock advance 360m    # the container's clock: the schedule's next fire is now
bun world/run.ts wait                  # watch: the run's receipt, then its pull request merged on the twin
bun world/run.ts verify                # the audit: the books, the twin's main, the project's check, the page
bun world/run.ts down --purge          # forget it (the stack's volumes too)
bun world/run.ts check --cookbook todo-cli   # the gate: up → clock → wait → verify → down
```

Each `clock advance 360m` fires the schedule once; `wait` sees it through; the roadmap walks down one item
per fire. The default cookbook is `hello-roadmap`, one item that only marks itself done. `todo-cli` has
eight items, each one command and one test.

## Two uses, one world

- **Testing the platform.** `up` is twins plus the worker from this tree, seeded. Our own agent is this
  world's *operator* when it verifies a platform change: it exercises acceptance lines against
  `$PLATFORM_URL` with curl. It never starts a second agent inside its own run.
- **Testing the template, through a cookbook.** The cookbook's stack runs as an adopter runs it: the home
  volume seeded from its `hermes/`, the checkout cloned from its origin (the twin), the key file the sidecar
  reads, `docker compose up`. From there the product is on its own: the gateway seeds its schedule from
  `cron/jobs.seed.json`, the cron fires, the agent works the top item, pushes `agent/<item>`, narrates through
  its webhooks and the sidecar; the twin lands the pull request when its check is green.

## What is real and what is a twin

Real: `platform/`'s worker (under `wrangler dev`, its Durable Objects holding the books), the cookbook's
containers (the agent on the pinned Hermes image, the sidecar), git, and the skill the agent runs. Twins:
GitHub (REST plane and the git wire, holding both the cookbook and `open-autonomy-org/open-autonomy` pushed
from this tree, so both project pages render from it; pull requests, branch protection, required checks and
auto-merge, landing a real merge commit on its git wire), the model gateway (the `openai` twin as the
`gateway` service, speaking the gateway's wire) and Discord (REST v10 and the gateway websocket, where the
agent's bot logs in and delivers each run's report to its home channel). Every model call is metered on the local books exactly as in
production, because it is the same worker.

**Played by the world, and labelled as such:**

- **GitHub Actions.** The twin runs no workflows. `actions.ts` is a world service playing the runner for the
  landing convention the template prescribes (our `land.yml` + `ci.yml`): a pushed `agent/**` branch gets
  its pull request opened once and auto-merge armed; each pull request head gets the project's own
  `bun run check` reported as the `ci` check run; a merged head branch is deleted. It merges nothing: the
  twin does, exactly when GitHub would.
- **The seal.** On the world's Docker host, traffic off the stack's bridge may only reach the host (the
  platform and the twins); everything else is refused, not served. `verify` probes it from inside the
  agent's container.
- **The attach.** `stack.override.yml` points the agent container's DNS at the world's reflect resolver
  and puts the session CA where its clients trust it, and the world's Docker host redirects the
  container's 53 and 443 into reflect's resolver and front. An unmodified `discord.py` then reaches the
  Discord twin at discord.com (the twin advertises a gateway address the container can reach). This is
  the composition the twins repository's ATTACH.md leaves to the recipe, done by the world's host.
- **The clock.** `stack.override.yml` preloads libfaketime into the agent's container, reading its offset
  from a file `clock advance` moves; monotonic time stays real. A six-hour jump trips the gateway's own
  liveness watchdog, which restarts it; the due job fires when it is back. That is Hermes's real behaviour
  under a clock jump, and the only addition the world makes to the stack.

The agent's key is minted **the adopter way**, inside the world: the platform issues a challenge, the
seed commits the claim file to the repository on the twin, the platform reads it back and mints. The key
lands in the world's data directory and is worthless anywhere else.

## The two moves

- **State** is created through the vendors' own doors (`seed.ts`): the repositories are pushed to the twin's
  git wire, `main` is protected the way the `main-protected` ruleset protects it (the `ci` check required, no
  bypass), the accounts are funded through the platform's admin route, the key through the mint route, the
  bot's home channel by a first message posted to it on the Discord twin.
- **Behaviour** is the cookbook's scenario, `handlers/<cookbook>/gateway.json` or a `gateway.ts` that
  prints it: ordered first-match rules keyed on the conversation's own text and tools, never on call
  counts (the platform meters Hermes's housekeeping calls too, and their number is not contractual). The
  scripted model does what the real one is asked to: find the top planned item, write its code and tests,
  run the project's check, mark it done, commit as the agent, push `agent/<item>`. `todo-cli`'s
  `stages/<item>/` are the files it writes, cumulative, each stage green on its own.

Every scenario's first rule is the failure class that killed a real run: a request whose output cap is
under 16384 gets `finish_reason: length` and no text, which Hermes retries four times and then fails. So
a platform that clamps the agent's output cap cannot pass `check`, and `verify` also refuses a run where
that handler matched at all.

## Files

| File | What it is |
|---|---|
| `world.json` | the logical world: two twins, the platform, the Actions runner, on pinned ports. `${TWINS_ROOT}`, `${WORLD_DIR}`, `${SCENARIO}`, `${COOKBOOK}` are substituted into an ignored generated copy under `.volter/`, so no developer's paths are committed |
| `platform.ts` | the real worker as a world service: `wrangler dev` with its upstreams pointed at the twins the world injected, supervised |
| `actions.ts` | GitHub Actions for the twin, played by the world |
| `stack.ts` `stack.override.yml` | the cookbook's stack as the adopter starts it, on the world's own Docker host (`WORLD_DOCKER_CONTEXT`, a colima VM the world creates once), plus the clock |
| `handlers/<cookbook>/` | the model's side of that cookbook's runs |
| `seed.ts` `wait.ts` `verify.ts` | the post-up steps, each run with the world's env |
| `run.ts` | the runner: `up`, `stack`, `clock`, `wait`, `verify`, `check`, `down`, `env -- <cmd>`, `--cookbook <name>` |

## Receipts

Hermes narrates its run through its own outbound webhooks to the sidecar, which translates them into the
platform's CloudEvents, exactly as in production. So the receipt path — the intake, its redaction, the
project page's live turns and health line — is under the world too. `verify.ts` reads the receipt and
the page, never the prose.

## What it does not cover yet

The agent's pushes go to the twin over its git wire, not through the deploy key in a forwarded ssh-agent
(the twin speaks no ssh). Discord delivery has a twin (`@volter/twin-discord`) but this world does not run it: `discord.py`
hardcodes its base URL and builds its own HTTP session, so reaching the twin from an unmodified Hermes needs
the reflect front (DNS plus the session CA), tracked as a roadmap item.
