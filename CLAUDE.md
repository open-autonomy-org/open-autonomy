# Open Autonomy — working notes

## What this repo is

A product and a use of it. **The only thing funded is token usage.**

- `template/` — the product: a Hermes home any project applies as `hermes/`, the container stack that runs it
  without holding a secret (agent + key sidecar), the key tool. `template/apply.ts` applies it; `--check`
  fails on drift. An applied home is never edited in place.
- `platform/` — the product's other half: the Cloudflare Worker that meters every model call against a
  project's account, takes money in, serves the funding page, each project's page (spine, receipts, live
  turns, Setup pane) and the README widgets. Deploys and admin ops go through GitHub only (`deploy.yml`,
  `admin.yml`, gated by the `production` environment's reviewer); no machine holds a deploy or admin token.
- `cookbook/` — worked examples of adopting the template. `hello-roadmap` is the one the world runs.
- `world/` — the volter-world: twins + the platform from this tree + the scenarios. Cookbooks are the
  projects under test. `bun world/run.ts check` is the gate.
- `hermes/` — our own use: the template applied to this repository, running in containers on this Mac. It
  develops the template and the platform, and it is not special. Its runtime state is git-ignored.
- **The roadmap is the product's** (`template/`, `platform/`). `hermes/` and `world/` change only when a
  product change reaches into them.

The compiler lineage (IR, substrates, install CLI, profiles, bench) lives in
`volter-ai/open-autonomy-compiler`. Do not re-import it here.

## Working agreement

- Nothing pushes to `main`, including maintainers: the `main-protected` ruleset has no bypass actors (a deploy
  key counts as the admin role, so an admin bypass would hand the agent main). Push a `land/<topic>` branch;
  `land.yml` opens its pull request and auto-merge lands it when `ci` and `security` pass. Don't wait on it.
- Live proof is the proof: the deployed worker and the rendered site/README, not local tests alone.
- Everything the agent can see may be published live. Nothing in its reach may be a secret that matters.
- **The ledger's `consumed_usd_cents` is the authoritative cost.** Never a client-side estimate.
- Security-critical paths (admin token, HMAC, spend caps, the account tree) get the higher bar:
  fail a review you cannot confidently verify.
- `bun run check` = platform tests + typecheck. `bun run check:supply-chain` = lockfile integrity + audit.
- **The world is where this runs without keys:** `world/` (see `world/README.md`).
  `TWINS_ROOT=/path/to/twin bun world/run.ts check` is the gate — up, seed, the template on a cookbook, one
  real Hermes run, audit, down. Run it before deploying anything that touches metering, keys, the docs sync,
  or the template; `bun world/run.ts up` to have the product running in front of you.
- Our own agent is that world's operator when it verifies a platform change (`up`, then curl). It never runs
  the agent leg: that would be an agent inside an agent, and the leg exists to test the template, not it.

## Live surfaces

- Worker: `https://open-autonomy.org` (`/v1/funding`, `/health`, `/`; the workers.dev URL is the same worker).
- README widget: `/v1/funding/runway.svg` (Camo-safe SVG: no scripts, no external refs).
- The project page reads `docs/VISION.md`, `ROADMAP.yml`, `CHANGELOG.md`, `hermes/cron/jobs.seed.json`,
  `hermes/README.md`, `hermes/SOUL.md` and `hermes/config.yaml` from this repo, re-synced every ten minutes
  (`POST /admin/accounts/:id/sync` forces it). The agent updates `status` in `ROADMAP.yml` as it finishes items.
