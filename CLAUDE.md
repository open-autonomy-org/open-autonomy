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
- `world/` — the volter-world: twins + the platform from this tree + the kit on a cookbook.
  `bun world/run.ts check` is the gate.
- `hermes/`, `.open-autonomy/`, `container/` — our own use: the kit applied to this repository, running in
  containers on this Mac (`container/compose.yml` plus this install's `container/compose.override.yml`, which
  mounts the reporter's supercode build). It develops the product, and it is not special. Runtime state is
  git-ignored.

## Working agreement

- Nothing pushes to `main`, including maintainers: the `main-protected` ruleset has no bypass actors. Push a
  `land/<topic>` branch; `land.yml` opens its pull request and auto-merge lands it when `ci` and `security`
  pass. Don't wait on it.
- Live proof is the proof: the deployed worker and the rendered site, not local tests alone.
- Everything the agent can see may be published live. Nothing in its reach may be a secret that matters.
- **The ledger's `consumed_usd_cents` is the authoritative cost.** Never a client-side estimate.
- Security-critical paths (admin token, HMAC, the balance hard-stop, the account tree) get the higher bar:
  fail a review you cannot confidently verify. Never rotate `AGENT_PROXY_HMAC_SECRET`: it invalidates every key.
- Nothing here develops against a real API: the cookbook and the platform run only in the world; our own
  agent is the only thing that spends on the real platform. Models are `zai/glm-5.3-flash`, everywhere.
- `bun run check` = every package + the kit's check on the cookbook + the cookbook's check.
  `bun scripts/check-supply-chain.ts` = lockfile integrity + audit.
- **Tests are smoke tests.** One per surface, end to end through the worker, saying a change broke the
  surface, not why; one line each for the security claims (a forged key, a wrong scope, a forged webhook).
  The world gate is the proof. Do not grow the suites; grow the world.
- **Money in is Polar** (the merchant of record for patronage); **cards out are Stripe Issuing**. Nothing
  else takes or moves money.
- **The world is where this runs without keys.** `TWINS_ROOT=/path/to/twin bun world/run.ts check` is the
  gate — up, seed, probe, one clock fire, wait, verify, down. Run it before deploying anything that touches
  metering, keys, the stream, the docs sync or the kit. The reporter's supercode with Hermes support is
  unreleased: the world builds it from the checkout beside this one (`SUPERCODE_ROOT`).
- Our own agent is that world's operator when it verifies a platform change (`up`, then `probe` and curl).
  It never runs the agent leg.

## Live surfaces

- Worker: `https://open-autonomy.org` (`/v1/funding`, `/healthz`, `/`; the workers.dev URL is the same worker).
- README widgets: `/v1/accounts/:account/{runway,now,roadmap,activity}.svg` (Camo-safe SVG).
- A project page reads `docs/VISION.md`, `ROADMAP.yml`, `CHANGELOG.md`, `hermes/cron/jobs.seed.json`,
  `hermes/README.md`, `hermes/SOUL.md` and `hermes/config.yaml` from its repo, re-synced every ten minutes
  (`admin.yml` → `sync` forces it). The agent updates `status` in `ROADMAP.yml` as it finishes items; the
  reporter publishes its sessions as they happen.
