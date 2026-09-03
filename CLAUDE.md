# Open Autonomy — working notes

## What this repo is

Fund a project's agents in the open. **The only thing funded is token usage.** Three parts:

- `platform/` — the Cloudflare Worker: meters every model call against a project's account
  (mint / grant / consume, hard-stop at zero), takes money in (GitHub Sponsors webhook, coupons), serves
  the funding page and the README widgets. Deploy is tag-gated (`deploy-v*`, `production` environment).
  Admin scripts in `platform/scripts/`.
- `hermes/` — this project's own agent, checked in: a Hermes setup (skills, crons, Discord channel)
  that runs off this project's funded account. Not built yet.
- the Hermes adapter (inside `platform/`) — reads `hermes/` and the live sessions and renders the
  roadmap (what will happen), the running session (what it is doing now) and the setup (how it works).
  **Visualization only.** It never drives the agent.

The compiler lineage (IR, substrates, install CLI, profiles, bench) lives in
`open-autonomy-org/open-autonomy-compiler`. Do not re-import it here.

## Working agreement

- Develop directly on `main`; push and merge without waiting. Report what you did.
- Live proof is the proof: the deployed worker and the rendered site/README, not local tests alone.
- **The ledger's `consumed_usd_cents` is the authoritative cost.** Never a client-side estimate.
- Security-critical paths (admin token, HMAC, spend caps, the account tree) get the higher bar:
  fail a review you cannot confidently verify.
- `bun run check` = platform tests + typecheck. `bun run check:supply-chain` = lockfile integrity + audit.

## Live surfaces

- Worker: `https://open-autonomy.org` (`/v1/funding`, `/health`, `/`; the workers.dev URL is the same worker).
- README widget: `/v1/funding/runway.svg` (Camo-safe SVG: no scripts, no external refs).
- The project page reads `docs/VISION.md`, `ROADMAP.yml` and `CHANGELOG.md` from this repo. The agent
  updates `status` in `ROADMAP.yml` as it finishes items.
