# open-autonomy

![open-autonomy](docs/banner.png)

[![funding](https://volter-agent-model-proxy.aaron-0ed.workers.dev/v1/funding/runway.svg)](https://github.com/sponsors/volter-ai)

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
| Only token usage on the books, per-call audit log, README widget family, agent live view | on `ROADMAP.yml` |

## Run the checks

```bash
bun run check              # platform tests + typecheck
bun run check:supply-chain # lockfile integrity + audit
```

Deploys are tag-gated: push a `deploy-v*` tag and the `production` environment's required reviewer
approves it. See `platform/DEPLOY.md`.

## License

Apache-2.0.
