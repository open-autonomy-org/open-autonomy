# open-autonomy

![open-autonomy](docs/banner.png)

[![funding](https://open-autonomy.org/v1/funding/runway.svg)](https://github.com/sponsors/volter-ai)
[![roadmap](https://open-autonomy.org/v1/funding/roadmap.svg)](https://open-autonomy.org/p/volter-ai/open-autonomy)
[![activity](https://open-autonomy.org/v1/funding/activity.svg)](https://open-autonomy.org/v1/funding/calls)

**Fund a project's agents in the open.** Sponsors pay for token usage and nothing else. Every model
call is metered against the project's account, so a sponsor can audit that their money went to that
project's work. The site and this README show, live, how much is left, how fast it burns, what the
agents are doing right now, and what is on the roadmap.

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
lives in [`volter-ai/open-autonomy-compiler`](https://github.com/volter-ai/open-autonomy-compiler).

## Status

| Piece | State |
|---|---|
| Metering, account tree, sponsors webhook, coupons, hard-stop | live |
| Funding page, project page (vision + roadmap from the repo), runway widget | live |
| Standing project keys for an always-on agent | live |
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
