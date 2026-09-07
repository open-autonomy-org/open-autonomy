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

Both packages publish from this repository: `@open-autonomy/sdk` and `create-open-autonomy`, each at its own version.
`.github/workflows/release.yml` publishes them on a human-cut `release-v<version>` tag (or a manual dispatch)
after the `production` environment's reviewer approves, with egress locked to npm and the token it needs
(`NPM_TOKEN`) installed in that environment only. The world proves the same publish and a `bun create
open-autonomy` from it against the npm registry twin (`bun world/run.ts env -- bun world/kit-release.ts <kit-version>`) before any release is cut.

## What a generated repository contains

```text
README.md            the project's front page, with the account's four widgets
CONSTITUTION.md      what the project is and must remain; its first paragraph leads the page, its invariants bind every task
CONTRIBUTING.md      how code is written here, the bar every diff is reviewed against
ROADMAP.md           notable intentions and outstanding outcomes; PM-maintained, project-owned
CHANGELOG.md         what shipped
AGENTS.md            the agent's rules for this repository
LICENSE              Apache-2.0, seeded; the project's own
package.json        the project's own check (`bun run check`), starting with a pinned TypeScript compiler
hermes/              the agent: SOUL.md, its three skills (develop, pm, community; a project's own skills live beside them, in hermes/skills/<project>/, and are the project's), profiles/treasurer (the second profile: the one that pays), kanban.seed.json (historical migration input),
                     cron/jobs.seed.json (the PM, hourly; the community desk, every quarter hour), config.yaml (the model: the project's own choice), the seed hook
.open-autonomy/      the platform connection (PRODUCTION.md: how a project ships — a human-cut tag, a reviewed environment, the workflows the owner's): config.yaml (account, publish policy, the model and rail bounds the platform holds the project's funds to), reporter.ts (the publisher:
                     sessions, the board, the setup), mint-key.ts (the key, the adopter way), start.ts (the agent's four
                     processes, the one way it starts), the vendored SDK, kit.json (which kit, version and parameters made this repository)
container/           the default for a real deployment (bare is for development and fast debugging): one image whose entrypoint is start.ts as root, dropping the gateway to the image's user; the pinned Hermes
.github/workflows/   land.yml (the landing convention; contributors run the project check before pushing)
```

## The guided setup

Understand the project first, then choose the starter. Hermes is currently the only kit; the cookbooks
are working applications of it. Start a fresh repository with `create`, or preserve an existing one
with `adopt`. The generated [setup guide](template/.open-autonomy/SETUP.md) is the setup agent's
procedure and is kept current by kit upgrades, including in this repository and every cookbook.

Setup fills the product constitution from owner direction, preserves the brief/research as PM sources,
and settles a few choices using the kit's operating defaults. It then completes real development
connections, using the setup agent's browser skill and existing provider sessions where authorization
is required. Provider credentials go through secure setup handoffs; the owner is involved at actual
human-only steps, not handed a list of configuration chores.

`create-open-autonomy setup <dir> --plan` inspects the development connections. The agent uses the
existing `--with` and `--without` choices to implement the agreed communication and model arrangement.
Discord is optional regardless of token availability. GitHub can carry human questions and release
review, but the agent must actually post requests and inspect replies there. The communication skill
owns that policy; the shared team roster owns identities and authority.

Application dependencies run in the local world. Production provisioning is a later explicit
`--with production` step for a Cloudflare Worker. Package release automation is not yet implemented;
`--with release` refuses before mutation and points to the reviewed publication procedure. Other live
application connections are established at deployment or customer activation. See the
[fresh local application walkthrough](../../cookbooks/SETUP.md) for a concrete setup rehearsal.

**Kit-owned** files are kept current by `upgrade`: `hermes/` (except `config.yaml` and `kanban.seed.json`), the reporter,
the key tool, the vendored SDK, `container/`, the landing workflow and setup/production guides. A project that takes one over names it in
`kit.json`'s `divergences`. **Seeded** files are written once and never touched again: the README, the
roadmap, historical board seed, the constitution, `CONTRIBUTING.md`, the changelog, `AGENTS.md`, the license, the model config, the publish policy.

## How the repository runs itself

The agent is stock Hermes in a container, its home the committed `hermes/`, its checkout the repository,
its model calls forwarded by the key valve beside it (which alone holds the project's key) to the platform,
where each is metered to the project's account. ROADMAP.md is the planning memory: the PM scrum reconciles sourced input and queues bounded fleet work.
The native kanban holds execution tasks; the gateway's dispatcher pulls them down and runs each as
a worker session (the `develop` skill) that builds it, verifies it where `AGENTS.md` says the project is
verified, lands it on an `agent/<task id>` branch the landing workflow merges when the checks pass, and hands
off; the review lane, Hermes's own, verifies the handoff against the constitution and `CONTRIBUTING.md` in a session of its own; once an hour the PM reconciles the roadmap, contributions, commitments and release gates (the `pm` skill). Every
session shows on the project's page with its cost.

The PM's `.open-autonomy/maintain.ts` compares the installed kit with npm, lands upgrades from a separate
worktree only while idle, and requests a complete stack restart after the upgrade merges. It prepares
human review only for a ready, sourced PM release decision with a fixed candidate and proposed version.
PM contacts the reviewer using the project communication skill and tracks the conversation on the
native task. Tags and deployment approvals remain human acts.

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

## Roadmap scrum upgrades

Version 2.8 introduces sourced `ROADMAP.md` planning. Upgrade creates a missing roadmap from the project's
historical seed, preserving holds and acceptance as intentions to reconcile, and never overwrites existing
notes. Startup stops replaying the seed into kanban. Existing tasks and owner schedules stay intact;
existing PM/community cron jobs load the new skills even if their old prompts describe filing tasks.
The first scrum matches old tasks before queueing anything. If the adopter's constitution still reserves
all task creation to the owner, the PM proposes a concrete amendment for human review and pauses new
dispatch until that authority is granted; upgrades never rewrite an adopter's constitution. Update project-owned AGENTS.md wording that
still equates the board and roadmap. No production or release permission changes with this upgrade.

`.open-autonomy/scrum.ts` handles automatic main/session discovery, bounded native cron checkpoints, an isolated planning worktree, and native idempotent
kanban creation from a sourced, landed roadmap section marked `Dispatch: fleet`. Decisions, priorities,
human commitments and release review stay with the Hermes skills, not a scheduler implemented by the kit.

PM owns careful distillation: ROADMAP.md holds notable present/future intentions; CHANGELOG.md holds notable
changes consolidated into main, separating Unreleased from released. Contributors need no special handoff
or shared-document edit. Routine activity remains in source history. The native PM cron notepad carries
bounded cursors, coverage gaps and pending pointers; no permanent scrum journal is required. Legacy intake
is preserved until acknowledged, then pruned. An unavailable source retains its checkpoint. Release review
and outstanding operational acceptance remain on roadmap even after implementation enters changelog.

PM owns release planning: maintain a sourced target schedule in ROADMAP.md, choose coherent scope and a
proposed version under project policy, and allow time for human review. A merge or elapsed target date is
not a release trigger. Only a landed, ready PM decision with a fixed candidate warrants a review request;
later main commits can accumulate independently. Humans approve the concrete proposal before shipping.
See `.open-autonomy/PRODUCTION.md` for the release fields and review package.
