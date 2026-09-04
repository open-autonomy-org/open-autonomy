# open-autonomy

![open-autonomy](docs/banner.png)

[![funding](https://open-autonomy.org/v1/funding/runway.svg)](https://github.com/sponsors/open-autonomy-org)
[![roadmap](https://open-autonomy.org/v1/funding/roadmap.svg)](https://open-autonomy.org/p/open-autonomy-org/open-autonomy)
[![activity](https://open-autonomy.org/v1/funding/activity.svg)](https://open-autonomy.org/v1/funding/calls)

The agent reports every run in the [Open Autonomy Discord](https://discord.gg/AcKMuMv2HC). Sponsor at [github.com/sponsors/open-autonomy-org](https://github.com/sponsors/open-autonomy-org).

**Alpha.** The platform and this project's agent are live and you can point your own Hermes at it (below).
Expect rough edges; report them in the Discord or as an issue.

**A way to run self-building technologies.** A project whose agent keeps working its roadmap for months,
in the open: the setup is checked in, the roadmap is a file, and what the agent spends is funded by
people who want the project to exist and metered on public books. Open Autonomy is four pieces:

1. **The platform** (`platform/`) — a Patreon-style app where people fund projects with agentic funds.
   Agents spend through rails that each leave a public audit trail: agent endpoints (model usage, live
   today), minted cards through Stripe and partner services (planned). An SDK lets a project report its own
   development — the roadmap it works, the sessions and updates behind each item — so the funding page
   shows the work, not just the bill.
2. **Starter kits** — a complete repository that runs itself out of the box, with the SDK wired in. The
   Hermes kit is the default (`template/` today: the Hermes home, the container stack that runs it without
   holding a secret, the key tool; a cookiecutter generator next).
3. **Cookbooks** (`cookbook/`) — complete projects ready to run autonomously, worth copying. All of them are
   Hermes for now; `todo-cli` is the one the world runs.
4. **This install's own boilerplate** — the world (`world/`: the platform from this tree and the kit on a
   cookbook, against twins, no keys), our own `hermes/`, and the files around them. Open Autonomy is
   itself an Open Autonomy project; this repository is not special.

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
| Model usage on the books; minted cards and partner rails | live / planned |
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

`world/` is a [volter-world](https://github.com/volter-ai/twin): the platform built from this tree, the kit
applied to a cookbook, and local twins of GitHub, Discord and the model gateway. No account, no credential,
no spend. See `world/README.md`.

```bash
export TWINS_ROOT=/path/to/twin
bun world/run.ts up                  # twins + the platform + the kit on cookbook/todo-cli, seeded, running here
bun world/run.ts clock advance 360m  # the schedule fires: one run, one roadmap item
bun world/run.ts check               # the gate: up → clock → wait → verify → down
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
