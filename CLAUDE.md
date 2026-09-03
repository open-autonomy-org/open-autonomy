# Open Autonomy — working notes

## What this repo is

Fund a project's agents in the open. **The only thing funded is token usage.** Three parts:

- `platform/` — the Cloudflare Worker: meters every model call against a project's account
  (mint / grant / consume, hard-stop at zero), takes money in (GitHub Sponsors webhook, coupons), serves
  the funding page and the README widgets. Deploys and admin ops go through GitHub only (`deploy.yml`,
  `admin.yml`, both gated by the `production` environment's reviewer); no machine holds a deploy or admin
  token. See `platform/DEPLOY.md`.
- `hermes/` — this project's own agent, checked in: a Hermes home (SOUL, skills, the cron schedule, Discord
  delivery) that runs on this Mac off the project's funded account on a standing key. Runtime state is
  git-ignored. `platform/scripts/agent-reporter.ts` (launchd) narrates its runs to the platform as
  CloudEvents, reading the home through supercode's `sessions.index.subscribe` + `sessions.follow`.
- the live view (inside `platform/`) — the project page's spine (NEXT from the roadmap, NOW streaming the
  running job, DONE as receipts), the run page, the Setup pane read from `hermes/`, and the `now.svg` widget.
  **Visualization only.** It never drives the agent.

The compiler lineage (IR, substrates, install CLI, profiles, bench) lives in
`volter-ai/open-autonomy-compiler`. Do not re-import it here.

## Working agreement

- Develop directly on `main`; push and merge without waiting. Report what you did.
- Live proof is the proof: the deployed worker and the rendered site/README, not local tests alone.
- Everything the agent can see may be published live. Nothing in its reach may be a secret that matters.
- **The ledger's `consumed_usd_cents` is the authoritative cost.** Never a client-side estimate.
- Security-critical paths (admin token, HMAC, spend caps, the account tree) get the higher bar:
  fail a review you cannot confidently verify.
- `bun run check` = platform tests + typecheck. `bun run check:supply-chain` = lockfile integrity + audit.
- **Test the whole stack without tokens or cloud:** the sibling twins repo has `cookbook/open-autonomy-world`
  (real `hermes` one-shot → this worker under `wrangler dev` → the openai twin as the model gateway → the GitHub
  twin). `cd ../twin && OPEN_AUTONOMY_ROOT=$PWD/../open-autonomy bun test cookbook/open-autonomy-world/`.
  Run it before deploying anything that touches metering, keys, or the docs sync.

## Live surfaces

- Worker: `https://open-autonomy.org` (`/v1/funding`, `/health`, `/`; the workers.dev URL is the same worker).
- README widget: `/v1/funding/runway.svg` (Camo-safe SVG: no scripts, no external refs).
- The project page reads `docs/VISION.md`, `ROADMAP.yml`, `CHANGELOG.md`, `hermes/cron/jobs.seed.json`,
  `hermes/README.md`, `hermes/SOUL.md` and `hermes/config.yaml` from this repo, re-synced every ten minutes
  (`POST /admin/accounts/:id/sync` forces it). The agent updates `status` in `ROADMAP.yml` as it finishes items.
