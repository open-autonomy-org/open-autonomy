# open-autonomy

![open-autonomy](docs/banner.png)

[![funding](https://open-autonomy.org/v1/funding/runway.svg)](https://github.com/sponsors/open-autonomy-org)
[![roadmap](https://open-autonomy.org/v1/funding/roadmap.svg)](https://open-autonomy.org/p/open-autonomy-org/open-autonomy)
[![activity](https://open-autonomy.org/v1/funding/activity.svg)](https://open-autonomy.org/v1/funding/calls)

The agent reports every run in the [Open Autonomy Discord](https://discord.gg/AcKMuMv2HC). Sponsor at [github.com/sponsors/open-autonomy-org](https://github.com/sponsors/open-autonomy-org).

**Alpha.** The platform and this project's agent are live and you can point your own Hermes at it (below).
Expect rough edges; report them in the Discord or as an issue.

**Tools for sustained autonomous development.** An agent that keeps working a project's roadmap for
months, not one session: its setup is checked in and readable, its roadmap is a file, and what keeps it
running is metered in the open. Sponsors pay for token usage and nothing else, every model call lands
on public books, and the site and this README show what the agent is doing, what it will do next, and
what it cost.

This repository is a product and a use of it:

1. **`template/`** — the product. A Hermes home any project drops into its repository as `hermes/`, the
   container stack that runs it without holding a secret, and the tool that mints its key. Applied to a
   repository, it gives that project an agent that works its `ROADMAP.yml` top to bottom, funded by the
   project's sponsors, readable by anyone.
2. **`platform/`** — the books. One Cloudflare Worker that meters every model call against a project's
   account (mint / grant / consume, hard-stop at zero), takes money in (GitHub Sponsors, coupons), forwards
   the call to the model gateway, and serves the public funding page, each project's page and the README
   widgets.
3. **`cookbook/`** — worked examples: `hello-roadmap` is the smallest repository the template applies to,
   and what the world runs to prove the template builds something.
4. **`world/`** — the volter-world: twins of GitHub and the model gateway, the platform built from this
   tree, and the scenarios. `check` applies the template to a cookbook and runs it end to end with no keys.
5. **`hermes/`** — our own use of the product: the template applied to this repository. It is the agent
   that develops the template and the platform, and it is not special.

The compiler that turns a substrate-neutral org description into GitHub Actions or a local runner
lives in [`volter-ai/open-autonomy-compiler`](https://github.com/volter-ai/open-autonomy-compiler).

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
| README widgets: funding, now, roadmap, activity | live |
| The spine: what the agent will do, is doing, and did, with receipts and transcripts | live |

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
for one more day. Every call then lands on your account's books and audit trail, and your project gets
a page at `https://open-autonomy.org/p/OWNER/REPO` rendering its `docs/VISION.md`, `ROADMAP.yml`,
`CHANGELOG.md` and `hermes/` the same way this one does.

**Funding an account in the alpha.** GitHub Sponsors of this org fund this project's agent. Other
accounts are funded by a grant from it: ask in the Discord, and a maintainer runs the reviewed admin
workflow that moves balance to your account. A key spends nothing until its account has a balance, and
stops at zero.

## Run the whole thing with no keys

`world/` is a [volter-world](https://github.com/volter-ai/twin): the platform built from this tree, the real
agent applied to a cookbook, and local twins of GitHub and the model gateway. No account, no credential, no
spend. See `world/README.md`.

```bash
export TWINS_ROOT=/path/to/twin
bun world/run.ts up          # twins + the platform, seeded: the product, running on your machine
bun world/run.ts agent       # the template on cookbook/hello-roadmap, one run
bun world/run.ts check       # the gate: up → seed → agent → verify → down
```

## Give your project an agent

See [`template/README.md`](template/README.md): apply the home, write your `AGENTS.md` and `ROADMAP.yml`,
mint a key by proving control of your repository, run the stack.

## Run the checks

```bash
bun run check              # platform tests + typecheck
bun run check:supply-chain # lockfile integrity + audit
```

Deploys and admin operations happen through GitHub workflows that wait for the `production` environment's
reviewer; no machine holds a deploy or admin token. See `platform/DEPLOY.md`.

## License

Apache-2.0.
