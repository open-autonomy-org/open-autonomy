# Open Autonomy — working notes

## What this repo is

Open Autonomy in four pieces — the platform, the starter kits, the cookbooks, and this install's own
boilerplate — and itself an Open Autonomy project. **Every spend is metered on public books.**

- `apps/platform/` — the Cloudflare Worker: the account tree, the rails (the model rail live; cards and
  partners planned), the key registry, the development stream (sessions, updates, items), the site, the
  widgets, the docs sync. Deploys and admin ops go through GitHub only (`deploy.yml`, `admin.yml`, gated by
  the `production` environment's reviewer); no machine holds a deploy or admin token.
- `packages/sdk/` — `@open-autonomy/sdk`: the roadmap codec, the stream client, the key helpers; its README
  is the wire any language can speak.
- `packages/kit-hermes/` — `create-open-autonomy`: the Hermes kit. `create`, `adopt`, `check`, `upgrade`. A
  generated repository is self-contained (the SDK is vendored into it).
- `cookbooks/` — complete autonomous projects, made with a kit plus their own code. `todo-cli` is the one the
  world runs.
- `world/` — the volter-world: twins + the platform from this tree + the kit on a cookbook, an environment to
  drive, never a gate.
- `hermes/`, `.open-autonomy/`, `container/` — our own use: the kit applied to this repository, running in
  containers on this Mac (`container/compose.yml`). It develops the product, and it is not special. Runtime
  state is git-ignored.

## Working agreement

- Nothing pushes to `main`, including maintainers: the `main-protected` ruleset has no bypass actors. Push a
  `land/<topic>` branch; `land.yml` opens its pull request and merges it. No check stands between a branch and main.
- Live proof is the proof: the deployed worker and the rendered site, not local tests alone.
- Everything the agent can see may be published live. Nothing in its reach may be a secret that matters.
- **The ledger's `consumed_usd_cents` is the authoritative cost.** Never a client-side estimate.
- Security-critical paths (admin token, HMAC, the balance hard-stop, the account tree) get the higher bar:
  fail a review you cannot confidently verify. Never rotate `AGENT_PROXY_HMAC_SECRET`: it invalidates every key.
- Nothing here develops against a real API: the cookbook and the platform run only in the world; our own
  agent is the only thing that spends on the real platform. Models are `zai/glm-5.3-flash`, everywhere.
- `bun run check` = the whole check under a thirty-second budget (typechecks, the smoke tests, the kit's drift check,
  the docs check); the pre-commit hook runs it. `bun scripts/check-supply-chain.ts` = lockfile integrity + audit.
- **Thirty seconds, total, forever.** Every test and check together finish in under thirty seconds or they are
  cut; a test guards a constitution invariant (money, keys, authority) or is not written. Behavior is verified by
  driving the running product and the world one action at a time. No gate over the world, nothing waiting on an
  agent.
- **Money in is GitHub Sponsors, Polar and grant credits**, side by side, all onto the same books (Polar is the
  merchant of record for direct patronage; grant credits are held by funders and by the org's grants account,
  and given to projects); **cards out are Stripe Issuing**. Nothing else takes or moves money.
- On this Mac the world's state lives on the SSD: `WORLD_STATE_ROOT=/Volumes/PeakSSD/volter-work/open-autonomy`
  before any `bun world/run.ts` verb (the internal disk has no headroom; the runtime admits a world against the
  root's free space). One Docker host serves both stacks: the colima VM `open-autonomy`,
  4 GiB, mounting the home and the SSD (the world's CA and data reach the containers from that root), where the
  production stack runs as `oa-*` and the world's copy of the cookbook as `world-*` (the kit's `STACK` name), each
  with its own volumes; a gate purges only its own. The VM is started at login by a launch agent (a start
  script under the open-autonomy config directory).
- **The world is where this runs without keys.** `TWINS_ROOT=/path/to/twin bun world/run.ts up` brings the twins,
  the real platform and the cookbook's agent stack up; drive it through its page and doors, then `down --purge`.
- Our own agent is that world's operator when it verifies a platform change (`up`, then `probe` and curl).
  It never runs the agent leg.

## Live surfaces

- Worker: `https://open-autonomy.org` (`/v1/funding`, `/healthz`, `/`; the workers.dev URL is the same worker).
- README widgets: `/v1/accounts/:account/{runway,now,roadmap,activity}.svg` (Camo-safe SVG).
- A project page shows what its substrate publishes through the SDK — the sessions, the roadmap, the board, the
  agent's setup, the project's documents (what it is, what shipped) — and reads from its repository only its
  metadata, a README cover and `.open-autonomy/config.yaml` for the owner's bounds (re-synced every ten minutes;
  `admin.yml` → `sync` forces it). Hermes and its board are a starter the kit makes, not shapes the platform knows.
- `CONSTITUTION.md` is what this project is and must remain; `CONTRIBUTING.md` how its code is written.
