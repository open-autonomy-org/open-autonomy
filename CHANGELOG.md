# Changelog

## Unreleased

- The project moved to the dedicated `open-autonomy-org` GitHub org, and the agent now reports into the "Open Autonomy" Discord server (bot + home channel); the build-roadmap job delivers there.
- `project-keys`: any repository owner can mint a standing key for their account by committing a per-day claim file (`/v1/keys/challenge` → `.open-autonomy-claim` → `/v1/keys/mint`), and rotate it with `/v1/keys/rotate` (the old key lives one more day). Standing keys take no lane slot and are capped at three per account. `hermes-key.ts --rotate`.
- `readme-widgets`: two more Camo-safe SVGs beside the runway bar — `roadmap.svg` (the roadmap's stations, phase-ordered, with the now marker) and `activity.svg` (metered calls, spend per day for two weeks, the last call) — rendered from the same data as the site.
- `per-call-audit`: every metered model call is appended durably to the account's audit trail and served publicly at `/v1/accounts/:id/calls` (newest first, cursor-paginated); the project page links to it.
- `token-only-books`: the platform meters model calls and nothing else — the supplier debit API, the GitHub OIDC mint/exchange paths, project-to-project redistribution and the planner-label roadmap rollup are gone; a roadmap item's state is the `status` written in `ROADMAP.yml`.
- `fund-and-show`: the funding site renders the project's vision and roadmap from the repo, sponsor money lands in the account and every model call is metered against it, and the README runway widget shows the live balance and runway.
- The project's own agent is a checked-in Hermes home (`hermes/`) running off the project's account on a standing key; the platform forwards to Merge Gateway and the site renders `docs/VISION.md` and `ROADMAP.yml`.
**The repo split.** This repository is now the funding platform (`platform/`, the Cloudflare Worker)
plus this project's own Hermes setup. The `autonomy.ir.v1` descriptor, the substrate compilers, the
install CLI, the profiles and the bench moved with their full history to
[`volter-ai/open-autonomy-compiler`](https://github.com/volter-ai/open-autonomy-compiler).
