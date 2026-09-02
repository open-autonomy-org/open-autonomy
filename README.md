# open-autonomy

![open-autonomy](docs/banner.png)

[![funding](https://volter-agent-model-proxy.aaron-0ed.workers.dev/v1/funding/runway.svg)](https://github.com/sponsors/volter-ai)

**Fund a project's agents in the open.** Sponsors pay for token usage and nothing else. Every model
call is metered against the project's account, so a sponsor can audit that their money went to that
project's work. The site and this README show, live, how much is left, how fast it burns, what the
agents are doing right now, and what is on the roadmap.

This repository is three things:

1. **`platform/`** — the books. One Cloudflare Worker that meters every model call against a
   project's account (mint / grant / consume, hard-stop at zero), takes money in (GitHub Sponsors,
   coupons), and serves the public funding page and the README widgets.
2. **`hermes/`** — this project's own agent, checked in. A [Hermes](https://github.com/NousResearch/hermes-agent)
   setup (skills, crons, Discord channel) that runs off this project's funded account. It is the thing
   sponsors are paying for, and it is readable by anyone.
3. **The Hermes adapter** — the part of the platform that reads the Hermes setup and its live
   sessions and turns them into what you see: the roadmap (what will happen), the running session
   (what it is doing now), and how the agent is set up (how it works). Visualization only. The
   adapter never drives the agent.

The compiler that turns a substrate-neutral org description into GitHub Actions or a local runner
lives in [`volter-ai/open-autonomy-compiler`](https://github.com/volter-ai/open-autonomy-compiler).

## Status

| Piece | State |
|---|---|
| Metering, account tree, sponsors webhook, coupons, hard-stop | live |
| Funding page, project page, runway widget | live |
| Hermes setup in `hermes/` | not yet built |
| Hermes adapter: roadmap, live session, setup view, velocity | not yet built |
| Durable per-message audit log per account | not yet built |
| README widget family (funding, roadmap, activity, velocity) | not yet built |

## Run the checks

```bash
bun run check              # platform tests + typecheck
bun run check:supply-chain # lockfile integrity + audit
```

Deploys are tag-gated: push a `deploy-v*` tag and the `production` environment's required reviewer
approves it. See `platform/DEPLOY.md`.

## License

Apache-2.0.
