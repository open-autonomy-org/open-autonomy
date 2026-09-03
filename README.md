# open-autonomy

![open-autonomy](docs/banner.png)

[![funding](https://open-autonomy.org/v1/funding/runway.svg)](https://github.com/sponsors/open-autonomy-org)
[![roadmap](https://open-autonomy.org/v1/funding/roadmap.svg)](https://open-autonomy.org/p/open-autonomy-org/open-autonomy)
[![activity](https://open-autonomy.org/v1/funding/activity.svg)](https://open-autonomy.org/v1/funding/calls)

The agent reports every run in the [Open Autonomy Discord](https://discord.gg/AcKMuMv2HC). Sponsor at [github.com/sponsors/open-autonomy-org](https://github.com/sponsors/open-autonomy-org).

**Tools for sustained autonomous development.** An agent that keeps working a project's roadmap for
months, not one session: its setup is checked in and readable, its roadmap is a file, and what keeps it
running is metered in the open. Sponsors pay for token usage and nothing else, every model call lands
on public books, and the site and this README show what the agent is doing, what it will do next, and
what it cost.

This repository is two things:

1. **`platform/`** — the books. One Cloudflare Worker that meters every model call against a
   project's account (mint / grant / consume, hard-stop at zero), takes money in (GitHub Sponsors,
   coupons), forwards the call to the model gateway, and serves the public funding page and the
   README widget. The site renders this project's `docs/VISION.md` and `ROADMAP.yml` straight from
   the repository.
2. **`hermes/`** — this project's own agent, checked in. A stock [Hermes](https://github.com/NousResearch/hermes-agent)
   home (identity, skills, schedule) that works `ROADMAP.yml` top to bottom, running off this
   project's funded account on a standing key. It is the thing sponsors are paying for, and it is
   readable by anyone.

The compiler that turns a substrate-neutral org description into GitHub Actions or a local runner
lives in [`open-autonomy-org/open-autonomy-compiler`](https://github.com/open-autonomy-org/open-autonomy-compiler).

## Status

| Piece | State |
|---|---|
| Metering, account tree, sponsors webhook, coupons, hard-stop | live |
| Funding page, project page (vision + roadmap from the repo), runway widget | live |
| Standing project keys: self-serve by claim file, rotation with a grace period | live |
| Hermes home in `hermes/`, calls metered through the platform | live |
| The build-roadmap cron job | live on the owner's machine |
| Only token usage on the books | live |
| Per-call audit trail, public at `/v1/accounts/:id/calls` | live |
| README widgets: funding, roadmap, activity | live |
| Agent live view | on `ROADMAP.yml` |

## Point your own Hermes at the platform

Three commands, run from your repository's checkout. The key spends nothing until your account is
funded, so the only authority it needs is control of the repo.

```bash
curl -s "https://open-autonomy.org/v1/keys/challenge?account=OWNER/REPO"     # → {"claim":"oa-claim-…","file":".open-autonomy-claim"}
printf '%s\n' oa-claim-… > .open-autonomy-claim && git add .open-autonomy-claim && git commit -m "claim" && git push
curl -s -X POST https://open-autonomy.org/v1/keys/mint -d '{"account":"OWNER/REPO"}' # → {"token":"…"}
```

Put the token in your Hermes home's `.env` as `OPEN_AUTONOMY_KEY` with
`OPEN_AUTONOMY_BASE_URL=https://open-autonomy.org/v1`, and use this repo's `hermes/config.yaml` as the
model block. Rotate any time with `POST /v1/keys/rotate` (bearer: the current key); the old key works
for one more day. Every call then lands on your account's books and audit trail.

## Run the checks

```bash
bun run check              # platform tests + typecheck
bun run check:supply-chain # lockfile integrity + audit
```

Deploys are tag-gated: push a `deploy-v*` tag and the `production` environment's required reviewer
approves it. See `platform/DEPLOY.md`.

## License

Apache-2.0.
