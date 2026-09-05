# The Hermes kit

The default Open Autonomy starter kit: a complete repository that runs its own Hermes agent against the
platform, with the SDK wired in. One command scaffolds it from two identity parameters, the project's name
and its platform account; everything else is boilerplate the kit fills in.

```bash
bun create open-autonomy my-project --project my-project --account owner/my-project
create-open-autonomy adopt .   --project my-project --account owner/my-project   # into an existing repository
create-open-autonomy check .     # the kit-owned files against the kit (exit 1 on drift)
create-open-autonomy upgrade .   # check, then rewrite the kit-owned files
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
ROADMAP.yml          what gets built, in order — the agent works it top to bottom
docs/VISION.md       why the project exists; its first paragraph is the page's lead
CHANGELOG.md         what shipped
AGENTS.md            the agent's rules for this repository
LICENSE              Apache-2.0, seeded; the project's own
package.json, test/  the project's own check (`bun run check`), starting with one test
hermes/              the agent: SOUL.md, its skills (roadmap, land, verify-in-world, rails), the schedule seed and the fire's script, config.yaml (the model:
                     the project's own choice), the schedule-seed hook
.open-autonomy/      the platform connection: config.yaml (account, publish policy, roadmap source),
                     reporter.ts (the sessions bridge), mint-key.ts (the key, the adopter way), setup.ts (the host, by one command), roadmap.ts
                     (the owner-side roadmap driver: pull a tracker into ROADMAP.yml, push it to the platform,
                     reconcile finished items back), the vendored SDK, kit.json (which kit, version and
                     parameters made this repository)
container/           the stack: the agent, the key valve, the reporter; the pinned Hermes image
.github/workflows/   ci.yml (the project's check on every branch), land.yml (the landing convention)
```

**Kit-owned** files are kept current by `upgrade`: `hermes/` (except `config.yaml`), the reporter, the key
tool, the vendored SDK, `container/`, the two workflows. A project that takes one over names it in
`kit.json`'s `divergences`. **Seeded** files are written once and never touched again: the README, the
roadmap, the vision, the changelog, `AGENTS.md`, the license, the model config, the publish policy.

## How the repository runs itself

The agent is stock Hermes in a container, its home the committed `hermes/`, its checkout the repository,
its model calls forwarded by the key valve beside it (which alone holds the project's key) to the platform,
where each is metered to the project's account. Its schedule fires a script that files the
top open item of `ROADMAP.yml` on the agent's board (Hermes's Kanban) and spends nothing; the gateway's
dispatcher runs the item as a worker session that builds it, verifies it, lands it on an `agent/<item>` branch
the landing workflow merges when the checks pass, marks it done and hands off; the review lane verifies the
handoff in a session of its own. Both sessions show on the project's page with their cost.

The reporter beside it is keyless: it discovers the agent's sessions through supercode's harness SDK
(`subscribeSessionIndex`, `follow`, `subscribeSessionActivity`) and publishes each one through the valve
with the Open Autonomy SDK, attaching it to the roadmap item it serves. It publishes the rest the same way:
the board (`workflowLoad`: each task's lane, attempts, handoff and verdicts under its item), the roadmap it finds
in the checkout, and the agent's setup (its persona, model, schedule and skills). The platform reads no file of
the agent's; everything a page shows about it came through the SDK. Scheduled runs publish by default;
`.open-autonomy/config.yaml` names the private exceptions. The project's page shows every session, update
and settled cent per item, live while a session runs.

**Rails.** The agent's model calls need no configuration beyond the key. `rails:` in
`.open-autonomy/config.yaml` opens the two others, off by default: a single-use card minted against the
balance for a bounded amount at the owner's merchant categories, and a partner service's metered charge
for a listed partner within a bound. Both leave records on the public audit trail naming the rail.

## Nothing in the agent's reach is a secret that matters

The agent's `.env` says `OPEN_AUTONOMY_KEY=valve`. Pushes sign through an ssh-agent forwarded from the host
holding one repository-scoped deploy key. Delivery uses at most a Discord bot token. Every session's turns
are published; the platform redacts secret-shaped text at intake as the second wall.
