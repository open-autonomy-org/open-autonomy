# The Hermes kit

The default Open Autonomy starter kit: a complete repository that runs its own Hermes agent against the
platform, with the SDK wired in. One command scaffolds it from two identity parameters, the project's name
and its platform account; everything else is boilerplate the kit fills in.

```bash
bun create open-autonomy my-project --project my-project --account owner/my-project
create-open-autonomy adopt .   --project my-project --account owner/my-project   # into an existing repository
create-open-autonomy check .     # the kit-owned files against the kit (exit 1 on drift)
create-open-autonomy upgrade .   # check, then rewrite the kit-owned files
create-open-autonomy setup .     # the guided walk: what this project's situation calls for, and the pages only you can click
```

## From npm

Both packages publish from this repository: `@open-autonomy/sdk` and `create-open-autonomy`, at one version.
`.github/workflows/release.yml` publishes them on a human-cut `release-v<version>` tag (or a manual dispatch)
after the `production` environment's reviewer approves, with egress locked to npm and the token it needs
(`NPM_TOKEN`) installed in that environment only. The world proves the same publish and a `bun create
open-autonomy` from it against the npm registry twin (`bun world/run.ts kit`) before any release is cut.

## What a generated repository contains

```text
README.md            the project's front page, with the account's four widgets
CONSTITUTION.md      what the project is and must remain; its first paragraph leads the page, its invariants bind every task
CONTRIBUTING.md      how code is written here, the bar every diff is reviewed against
CHANGELOG.md         what shipped
AGENTS.md            the agent's rules for this repository
LICENSE              Apache-2.0, seeded; the project's own
package.json, test/  the project's own check (`bun run check`), starting with one test
hermes/              the agent: SOUL.md, its three skills (develop, pm, community; a project's own skills live beside them, in hermes/skills/<project>/, and are the project's), profiles/treasurer (the second profile: the one that pays), kanban.seed.json (the board's first tasks, in order),
                     cron/jobs.seed.json (the PM, hourly; the community desk, every quarter hour), config.yaml (the model: the project's own choice), the seed hook
.open-autonomy/      the platform connection (PRODUCTION.md: how a project ships — a human-cut tag, a reviewed environment, the workflows the owner's): config.yaml (account, publish policy, the model and rail bounds the platform holds the project's funds to), reporter.ts (the publisher:
                     sessions, the board, the setup), mint-key.ts (the key, the adopter way), start.ts (the agent's four
                     processes, the one way it starts), the vendored SDK, kit.json (which kit, version and parameters made this repository)
container/           the default for a real deployment (bare is for development and fast debugging): one image whose entrypoint is start.ts as root, dropping the gateway to the image's user; the pinned Hermes
.github/workflows/   ci.yml (the project's check on every branch), land.yml (the landing convention)
```

## The guided setup

`create-open-autonomy setup <dir>` takes a kit repository to a running, gated, funded project on your own laptop, spending
Open Autonomy's money. It reads the situation — what the repository deploys as, whether the owner is an org, whether a
Sponsors listing, a Discord token or a Codex login is in sight — and recommends the doors that fit, each with its
reason and what it will cost you in clicks. The core needs no questions: the repository on GitHub (the CLI's device
flow), the deploy key, the platform keys the adopter way, and the owner's rules (nothing pushes `main`; `.github/` is
yours). The doors are yours to take, decline or defer: a gated production door (Cloudflare token into a GitHub
environment, a pre-filled token page), the agent's GitHub App (GitHub's manifest flow: one Create, one Install), a
Discord channel (the portal, a token paste, one invite; the bot makes its own channel), your subscription for the
model. What is never automated: creating your accounts, and any captcha or sudo prompt — the setup opens the exact
page and continues when it comes back. `--plan` prints the situation and the recommendations and changes nothing;
every step is idempotent, so `setup` again adds a deferred door or repairs one. A declined door leaves no trace: the
schedule promises no channel it does not have.
Setup also records the signed-in GitHub owner and, when supplied, their Discord user ID in
`hermes/config.yaml`. Human-blocked tasks reach that owner through Discord or an assigned GitHub issue.

**Kit-owned** files are kept current by `upgrade`: `hermes/` (except `config.yaml` and `kanban.seed.json`), the reporter,
the key tool, the vendored SDK, `container/`, the two workflows. A project that takes one over names it in
`kit.json`'s `divergences`. **Seeded** files are written once and never touched again: the README, the
board's seed, the constitution, `CONTRIBUTING.md`, the changelog, `AGENTS.md`, the license, the model config, the publish policy.

## How the repository runs itself

The agent is stock Hermes in a container, its home the committed `hermes/`, its checkout the repository,
its model calls forwarded by the key valve beside it (which alone holds the project's key) to the platform,
where each is metered to the project's account. The board is the roadmap: the owner files tasks (the seed
files the first ones, in order, on the first boot), the gateway's dispatcher pulls them down and runs each as
a worker session (the `develop` skill) that builds it, verifies it where `AGENTS.md` says the project is
verified, lands it on an `agent/<task id>` branch the landing workflow merges when the checks pass, and hands
off; the review lane, Hermes's own, verifies the handoff against the constitution and `CONTRIBUTING.md` in a session of its own; once an hour the PM job reads the whole board and unsticks what is stuck (the `pm` skill). Every
session shows on the project's page with its cost.

The PM's `.open-autonomy/maintain.ts` compares the installed kit with npm, lands upgrades from a separate
worktree only while idle, and requests a complete stack restart after the upgrade merges. It also keeps
one owner request when the configured live service is behind main. The escalation hook repeats human
asks hourly and closes their notifications when resolved; tags and deployment approvals remain human acts.

The reporter beside it is keyless: it discovers the agent's sessions through supercode's harness SDK
(`subscribeSessionIndex`, `follow`, `subscribeSessionActivity`) and publishes each one through the valve
with the Open Autonomy SDK, attaching it to the task it serves. It publishes the rest the same way: the board
(`workflowLoad`: every task as a roadmap item, and each task's lane, attempts, handoff and verdicts under it) and
the agent's setup (its persona, model, schedule and skills). The platform reads no file of
the agent's; everything a page shows about it came through the SDK. Scheduled runs publish by default;
`.open-autonomy/config.yaml` names the private exceptions. The project's page shows every session, update
and settled cent per item, live while a session runs.

**Rails.** The agent's model calls need no configuration beyond the key. `rails:` in
`.open-autonomy/config.yaml` opens the two others, off by default: a single-use card minted against the
balance for a bounded amount at the owner's merchant categories, and a partner service's metered charge
for a listed partner within a bound. Both leave records on the public audit trail naming the rail.

## The world

A project that talks to a vendor verifies against twins, never the vendor: `bun add -d @volter/twin-world @volter/twin-<vendor>`,
a `world/world.json` naming them, `bunx volter-world up world/world.json`. The develop skill drives the running
system in that world, one action at a time (this repository's own `world/` is the shape). Nothing an agent does
reaches a real API.

## Nothing in the agent's reach is a secret that matters

The agent's `.env` says `OPEN_AUTONOMY_KEY=valve`. Pushes sign through an ssh-agent the start script loads with
one repository-scoped deploy key, which the gateway never holds. Delivery uses at most a Discord bot token. Every session's turns
are published; the platform redacts secret-shaped text at intake as the second wall.
