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

Three packages publish from this repository: `@open-autonomy/sdk`, `@open-autonomy/backend` and `create-open-autonomy`, each at its own version.
`.github/workflows/release.yml` publishes them on a human-cut `release-v<kit version>` tag (or a manual dispatch)
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
                     cron/jobs.seed.json (the PM, hourly; the community desk, every quarter hour; a monitor job wakes only when its script's output changed), cron/webhooks.seed.json (routes that wake the agent on a signed POST, their secrets generated at seed time and kept in the home), config.yaml (the model: the project's own choice), the seed hook
.open-autonomy/      the platform connection (PRODUCTION.md: how a project ships — a human-cut tag, a reviewed environment, the workflows the owner's): config.yaml (account, publish policy, the model and rail bounds the platform holds the project's funds to), reporter.ts (the publisher:
                     sessions, the board, the setup), mint-key.ts (the key, the adopter way), start.ts (bare for development; --container for the host sidecar), the vendored SDK, kit.json (which kit, version and parameters made this repository)
container/           the World executor definition and pinned native Hermes image; credentials and SDK reporting stay on the host
.github/workflows/   land.yml (the landing convention; developers manually verify their feature before pushing)
```

## The guided setup

Understand the project first, then choose the starter. Hermes is currently the only kit; the cookbooks
are working applications of it. Start a fresh repository with `create`, or preserve an existing one
with `adopt`. The generated [setup guide](template/.open-autonomy/SETUP.md) is the setup agent's
procedure and is kept current by kit upgrades, including in this repository and every cookbook.

Setup fills the product constitution from owner direction, keeps sources beside the established decisions,
and settles a few choices using the kit's operating defaults. It then completes real development
connections, using the setup agent's browser skill and existing provider sessions where authorization
is required. Provider credentials go through secure setup handoffs; the owner is involved at actual
human-only steps, not handed a list of configuration chores.

Projects follow GitHub's organization structure: `account` names `organization/repository`, with many
projects per organization. Setup verifies the GitHub organization before provisioning and discovers its
existing communication space from sourced organization/project documentation. An agreed Discord server
or Slack workspace can be reused with a separately branded bot and appropriate channels for each project.
The agent records this in the existing communication policy and setup record; no second organization
registry is required. Personal repositories need an owner-agreed organization target before setup proceeds.

GitHub registration and installation stay with that browser agent. The SDK's standalone
`open-autonomy-credentials` command receives the secret handoff into protected host storage; it does
not need a repository or generate provider configuration. The kit bundles the same receiver under
`.open-autonomy/sdk/credentials.ts`. The browser agent completes installation and verifies access through
the standalone valve before Hermes starts. The normal stack is started only after setup is complete.
Follow the setup guide for the manifest permissions and the exact handoff.

`create-open-autonomy setup <dir> --plan` inspects the development connections. The agent uses the
existing `--with` and `--without` choices to implement the agreed communication and model arrangement.
Discord is optional regardless of token availability. GitHub can carry human questions and release
review, but the agent must actually post requests and inspect replies there. The communication skill
owns that policy; the shared team roster owns identities and authority.

Application dependencies run in the local world. Production provisioning is a later explicit
`--with production` step for a Cloudflare Worker. Package release automation is not yet implemented;
`--with release` refuses before mutation and points to the reviewed publication procedure. Other live
application connections are established at deployment or customer activation.

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
verified, pushes an `agent/<task id>` branch to open a PR and hands off. The native reviewer examines its
exact head against the constitution, scope and manual evidence, submits a GitHub review and confirms the
merge before completing the task. GitHub requires approval and dismisses stale approvals on changed diffs; once an hour the PM reconciles the roadmap, contributions, commitments and release gates (the `pm` skill). Every
session shows on the project's page with its cost.

The PM's `.open-autonomy/maintain.ts` compares the installed kit with npm, lands upgrades from a separate
worktree only while idle, and requests a complete stack restart after the upgrade merges. It prepares
human review only for a ready, sourced PM release decision with a fixed candidate and proposed version.
PM contacts the reviewer using the project communication skill and tracks the conversation on the
native task. Tags and deployment approvals remain human acts.

The reporter is an SDK-to-SDK publisher. Supercode supplies session discovery and paginated transcripts,
native start/end records, run outcomes, live jobs, profiles, skills and workflow state. Open Autonomy's
SDK batches and acknowledges delivery. Silence never ends a session, and a task's lane never invents
a review verdict. The reporter reads repository-owned documents from committed main and applies the
YAML publication policy in `.open-autonomy/config.yaml`; it does not parse Hermes's storage files.

Publication checkpoints record acknowledged offsets and a digest of the published prefix. Restart and
history-change events reconcile against Supercode and the destination's receipt. An upload failure stays
retryable. If already-published history changes, the append-only destination cannot replace it: reporting
stops for that session with an explicit reconciliation error rather than skipping or duplicating it.
The platform retains a transcript tail; it is not the native session archive. Scheduled runs publish by
default, with private session/job exceptions and optional chat publication controlled by project policy.

**Rails.** The agent's model calls need no configuration beyond the key. `rails:` in
`.open-autonomy/config.yaml` opens the two others, off by default: a single-use card minted against the
balance for a bounded amount at the owner's merchant categories, and a partner service's metered charge
for a listed partner within a bound. Both leave records on the public audit trail naming the rail.

## The world

A project that talks to a vendor verifies against twins, never the vendor: the kit's rehearsal (`.open-autonomy/rehearsal/`,
kept current by `upgrade`) brings the project's own world up — the twins its channels name in `rehearsal/world.json`, the
model twin on its scripted brain, the backend copy, the brain's stack — and drives stories through it. The develop skill
drives the running system in that world, one action at a time (this repository's own `world/` runs the same rehearsal in
a cookbook). Nothing an agent does reaches a real API.

## Nothing in the agent's reach is a secret that matters

The agent's `.env` says `OPEN_AUTONOMY_KEY=valve`. Managed deployments sign pushes through an ssh-agent
loaded with one repository-scoped deploy key. Local Codex uses the project GitHub App through the host
valve; startup checks its Git routes and Contents write grant before starting Hermes. The gateway
holds neither credential. Delivery uses at most a Discord bot token. Every session's turns
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

Strategy owns product-scope development under the owner's agreement in the existing project-communications
skill. Activation (on demand, scheduled or agreed event) and authority (bounded autonomous decisions or
proposals for human decision) are independent. The default is available on demand with proposals for human
decision; no strategy cron job is seeded automatically. Native sessions and cron use the same strategy skill.
PM always records explicit authorized requests, including from the agreed trackers, and manages delivery.
PM may decompose an authorized outcome, but cannot create successor features from the constitution or an
empty board. The constitution constrains scope at conception and implementation at merge. Upgrades add the
skill without changing project-owned mandates or schedules; reconcile legacy PM-inferred drafts and old job
prompts before dispatch. Keep strategic outcomes and unresolved proposals in ROADMAP.md, tasks in kanban.

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

The local Codex setup choice uses the operator's ChatGPT allowance on this computer. Both launch modes use
the host valve, which asks the installed Codex for the current login through its app-server protocol.
Codex owns credential storage and refresh; Hermes receives only a stand-in credential. OA keeps no
project copy of the login. Run the host service as the signed-in user with the same `CODEX_HOME`. This choice does not provision remote
hosting. The setup agent installs the local image and trusted host service, then verifies the
project connections and development loop. Follow the
generated `.open-autonomy/SETUP.md` for model selection and the remaining activation checks. The reporter
can run on the host with `--container <id> --project <container checkout> --state-file <host cursor file>`
and `HERMES_HOME=<container home>`. It reads through the container's native Supercode process; the host
filters and publishes the stream, without copying SQLite files or mounting host credentials into the agent.

Automated tests are banned: their accumulated code and maintenance become cruft that can prevent
repository progress. Each develop agent verifies its feature through REPL-style manual usage of the
running product, records observations in its handoff and commits no permanent test code. The shared
develop skill and seeded constitution/contributor instructions carry this policy.
