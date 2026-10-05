# The Open Autonomy starter kits

`create-open-autonomy` renders complete repositories and keeps their supplied files current. The package's
historical directory name does not limit it to Hermes: it supplies the `hermes` and `ir` kits. Choose the
project slug, its platform account and a skew; the skew selects the kit. There is no separate `--kit` flag.

The [ecosystem architecture](../../docs/decisions/0024-ecosystem-target-architecture.md) distinguishes this
**template-rendering engine** (`src/kit.ts`) from OA's autonomous running composition. OA owns the templates,
creator/upgrade machinery and connection adapters. Supercode owns the operational IR, codecs, orchestrator
and native interfaces; the selected external harness runs the work. Rendering a repository does not prove
that its runtime is configured or operating.

A kit is a lineage ([ADR 0006](../../docs/decisions/0006-the-kit-is-a-lineage.md)): shared `base/` files are
overlaid by a skew, whole files. `soc2` overlays `self-build`. The IR render omits the base's Hermes content
and supplies its native home from the company skew.

| Kit | Skew | Runtime and generated content | Operating role |
| --- | --- | --- | --- |
| `hermes` | `self-build` (default) | Stock Hermes by default; `hermes/` | Project fleet, develop/review lanes, strategy, community and hourly PM scrum |
| `hermes` | `manage-project` | Stock Hermes by default; `hermes/` | Daily PM plan and record for human executors; no board dispatch |
| `hermes` | `manage-organization` | Stock Hermes by default; `hermes/` | Daily organization cycle; requests sent to its projects |
| `hermes` | `soc2` | Self-build runtime; `hermes/` plus [compliance records](skews/soc2/records/README.md) and [Evidence Desk program](skews/soc2/COMPLIANCE.md) | Self-build with declared human seams and release gates ([ADR 0008](../../docs/decisions/0008-human-seams.md)) |
| `ir` | `company` | Supercode orchestrator, Claude Code default and Codex profiles; [home/](skews/company/home/) | Organization layer and a profile per job; one product or go-to-market lane per install, cards tagged by project ([ADR 0017](../../docs/decisions/0017-the-ir-native-kit.md), [ADR 0020](../../docs/decisions/0020-the-company-skew-runs-lanes.md)); records register in the organization's record repository ([ADR 0022](../../docs/decisions/0022-the-records-register.md)) |

The setup in `.open-autonomy/agent.json` selects the harness; another supported harness can run on the
same home through the external orchestrator ([ADR 0009](../../docs/decisions/0009-another-harness-on-the-same-home.md)).
The source candidate `create-open-autonomy` 3.25.0 selects the native runtime separately from its workers
([ADR 0026](../../docs/decisions/0026-selected-native-runtime-adapters.md)): company/IR bare startup uses the
orchestrator's public setup, inventory and job doors without locating Hermes. Hermes installs keep their explicit
Hermes adapter. This candidate requires SDK 4.0.1 for the shared publication normalizers; these source versions do
not claim an npm release or upgrade any running install.

The organization publisher always serves owner controls, independently of narrative enrollment and delivery.
It pauses/resumes only owned scheduled-job intent, with fresh native readback. The pinned native and Hermes
adapters supply no safe board pause/resume contract: board intent stays pending and uncertain dispatcher
quiescence cannot become observed pause. Active attempts may finish; unrelated pauses remain owned by their
original actor. Unsupported setup fields and conflicting native overrides refuse before setup effects.

```bash
bun create open-autonomy my-project --project my-project --account owner/my-project
bun create open-autonomy my-company --project my-company --account owner/company --skew company
create-open-autonomy adopt .   --project my-project --account owner/my-project --skew manage-project   # into an existing repository
create-open-autonomy check .     # where the project stands against the kit: version, files it changed, unresolved merges
create-open-autonomy upgrade .   # merge the kit's change into the project's files three-way; conflicts stay marked for an agent
create-open-autonomy upgrade --fleet <fleet.json>   # every project of a fleet: cloned fresh, upgraded, landed as that repository lands
create-open-autonomy setup .     # the guided walk: what this project's situation calls for, and the pages only you can click
```

`create` writes a new or empty directory; `adopt` writes only missing files in an existing one. `check`
reports version, local divergence, declaration problems and unresolved merges. `upgrade` uses the recorded
version as the ancestor of a three-way merge; conflicts remain for the project to resolve. Generated `.gitignore`
private-state rules use that same merge, preserving owner edits and reporting conflicts. These lineage commands do not start an agent.
Before activation, resolve the rendered host's exact manifest with `bun .open-autonomy/install-runtime.ts --update-lock`
inside its World and review/commit the adopter-owned lock. A template cannot include its own containing kit archive's
integrity; a committed unresolved template lock refuses at startup instead of silently becoming unfrozen.

## Several projects together: a fleet

A project runs alone with its own `start.ts`; several run together with one: `start.ts --fleet <fleet.json>` composes
one executor's home from each project's own `hermes/` (each a Hermes profile, served by one multiplexed gateway), one
valve on the host holding each project's key on its own port (and each project's GitHub App on its own), one reporter
per project publishing to its own account, and one Codex login forwarded to every profile. Nothing about a project
changes; it can run alone tomorrow ([ADR 0006](../../docs/decisions/0006-the-kit-is-a-lineage.md)).
`create-open-autonomy fleet <runtime-dir> --name <fleet> --image <image> --project owner/repo=<origin> …` writes the
definition and World's executor definition with one volume per checkout, and prints the two commands, World up and
the host start; a fleet starts by an explicit command and never at login. Each project's credentials live at
`~/.config/open-autonomy/<owner>/<repo>/` as when it runs alone. What a fleet bends: its profiles share one
user, one filesystem and one network, and the valve answers by port, so any profile can reach any sibling's
key, GitHub door and home. A fleet is for projects of one organization that trust each other; a project that
must not be readable by its siblings runs alone. A fleet opens no treasurer door, so nothing in it pays.
`container/Dockerfile.slim` is the image for headless daily PM skews whose channel is GitHub; a chat
platform needs the full `Dockerfile` image.

## From npm

Three packages publish from this repository: `@open-autonomy/sdk`, `@open-autonomy/backend` and `create-open-autonomy`, each at its own version.
`.github/workflows/release.yml` publishes each new version when the owner merges the standing `main` → `prod` pull
request (`apps/platform/DEPLOY.md`), with egress locked to npm and the token it needs
(`NPM_TOKEN`) installed in that environment only. The world proves the same publish and a `bun create
open-autonomy` from it against the npm registry twin (the [World operator guide](../../world/README.md)) before any release is cut.

## What a generated repository contains

Shared files connect either layout to the selected backend:

```text
README.md, CONSTITUTION.md, AGENTS.md, LICENSE   seeded project-owned documentation; additional docs vary by skew
.open-autonomy/      config.yaml (account, platform, bounds, publish policy), agent.json (runtime setup),
                     publisher.ts, source-events.ts, owner-control.ts, host valve and credential tools, start.ts,
                     enroll.ts, publication-operator.ts, vendored SDK, kit.json (kit, skew, version and identity)
container/           supplied executor/image tooling; its use depends on the selected runtime
.github/workflows/   supplied landing workflow where the skew includes it
```

The Hermes layout adds `hermes/`: persona, skills, profiles and historical board seed. `self-build` and
`manage-project` also seed [ROADMAP.md](skews/self-build/ROADMAP.md) and [CHANGELOG.md](skews/self-build/CHANGELOG.md); the other skews use their chosen native records.
The IR/company layout adds [home/](skews/company/home/): organization instructions, profiles, skills, role prompts,
[lanes.yaml](skews/company/home/lanes.yaml), [workflow.yaml](skews/company/home/workflow.yaml) and [workflow.gtm.yaml](skews/company/home/workflow.gtm.yaml). `lane:` in the connection config selects one lane;
the keeper applies that lane's profiles and starts its external board dispatcher. The company template
also supplies [.open-autonomy/usage.ts](skews/company/.open-autonomy/usage.ts) for the owner's usage statement. See the
[company template](skews/company/README.md) and its decisions for lane behavior.

Company installs keep their records register in the organization's record repository:
`create-open-autonomy records init <record-repo>` supplies the template/check without replacing an existing
register; `create-open-autonomy records estate <record-repo>` reports unregistered records across that machine's
declared roots. The manager and auditor reconcile those records under [ADR 0022](../../docs/decisions/0022-the-records-register.md).
The supplied [company World](skews/company/world/README.md) rehearses the install's own start and integrations;
its operator selects the source trees and owns synthetic opening data, while external World owns lifecycle.

For example, OA owns the reusable `company` skew; a Volter company install is an owner-operated
organization instance of it, with Volter's agents, lanes, policies and project assignments. Supercode
owns its native IR and orchestration. OA adapters can publish each project's projections to its selected
backend; RH2 owns Workplace when the owner selects that integration. These connections are choices of
the instance, rather than Volter-specific behavior in OA's core.

Both layouts use the same creator and recorded lineage. Native homes retain execution state; the
publisher sends OA projections through the SDK. A published view is not a lossless native home backup.

Publication requires explicit source enrollment or retained-state adoption through the generated
[publication front door](base/.open-autonomy/PUBLICATION.md). Missing enrollment leaves reporter delivery
pending while native execution and organization owner controls continue. The always-running publisher selects
control-only mode when enrollment is absent; declared/refused narrative initialization remains visible without
blocking its independent control queue. Each tenant declares an owner-relative `reporter_config` with its own
account/API-bound custody, policy and private state; organization enrollment is never copied into it.
Standalone reporters declare `native_runtime: {kind: orchestrator, root: /absolute/native/home}` (or explicit
`hermes`); the keeper supplies and checks that selection for its reporters.

## The guided setup

Understand the project first, then choose the starter. Both kits share the template renderer; the cookbooks
are complete applications of the project contract. Start a fresh repository with `create`, or preserve an existing one
with `adopt`. The generated [setup guide](base/.open-autonomy/SETUP.md) is the setup agent's
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

GitHub registration and installation stay with that browser agent. The kit's own
`credentials.ts` tool receives the secret handoff into protected host storage; it does
not need a repository or generate provider configuration. It is the kit-owned file
`.open-autonomy/credentials.ts`. The browser agent completes installation and verifies access through
the standalone valve before Hermes starts. The normal stack is started only after setup is complete.
Follow the setup guide for the manifest permissions and the exact handoff.

`create-open-autonomy setup <dir> --plan` inspects the development connections. The agent uses the
existing `--with` and `--without` choices to implement the agreed communication and model arrangement.
Discord is optional regardless of token availability. GitHub can carry human questions and release
review, but the agent must actually post requests and inspect replies there. The communication skill
owns that policy; the shared team roster owns identities and authority.

Application dependencies run in the local world. Production provisioning is a later explicit `--with
production` step: the `owners` team, the `prod` branch the standing Release pull request merges into, the
`production` environment that admits it, and for a Cloudflare Worker the token and `deploy.yml`. Package
release automation is not yet implemented; `--with release` refuses before mutation and points to the reviewed
publication procedure. Other live application connections are established at deployment or customer
activation.

**Kit-owned** files are kept current by `upgrade`, from the base and the recorded skew: supplied runtime content
under `hermes/` or [home/](skews/company/home/) (excluding project skills outside the OA namespace and the Hermes board/webhook seeds),
`agent.json`, the publisher,
the key tool, the vendored SDK, `container/`, the landing workflow (self-build) and setup/production guides. A project is a branch of its skew
(ADR 0006): it may change any of them, and `upgrade` merges the kit's next version into its copy three-way, the render of the version it last
took (fetched once from the registry into the kit cache, `OPEN_AUTONOMY_KIT_CACHE` or `.cache/open-autonomy/kit` under the home directory) as the ancestor. A file only the project changed keeps the project's; a file
only the kit changed takes the kit's whole; a file both changed merges, and where the same lines moved apart the conflict stays in the file, marked,
for an agent in the project's own session to resolve before landing. `check` reports the version, the files the project changed and any unresolved
merge; behind the kit or mid-merge it exits 1. **Seeded** files are written once and never touched again: the README, the
roadmap, historical board seed, the constitution, `CONTRIBUTING.md`, the changelog, `AGENTS.md`, the license, the model config, the publish policy.

## How a Hermes self-build repository runs itself

The agent is stock Hermes in a container, its home the committed `hermes/`, its checkout the repository,
its model calls forwarded by the key valve beside it (which alone holds the project's key) to the platform,
where each is metered to the project's account. A roadmap and changelog are a tracking form a skew chooses instead of
a board (manage-project and self-build keep them; the others plan on the board): there, ROADMAP.md is the planning
memory, which the PM scrum reconciles from sourced input and queues bounded fleet work from.
The native kanban holds execution tasks; the gateway's dispatcher pulls them down and runs each as
a worker session (the `develop` skill) that builds it, verifies it where `AGENTS.md` says the project is
verified, pushes an `agent/<task id>` branch to open a PR and hands off. The native reviewer examines its
exact head against the constitution, scope and manual evidence, submits a GitHub review and confirms the
merge before completing the task. GitHub requires approval and dismisses stale approvals on changed diffs.
Once an hour the PM reconciles the roadmap, contributions, commitments and release gates (the `pm` skill).
Sessions admitted by the publication policy appear on the selected server with their settled costs.

The PM's `.open-autonomy/maintain.ts` compares the installed kit with npm, lands upgrades from a separate
worktree only while idle (a merge conflict holds the worktree for the PM to resolve, then resumes), lands them the
way the repository lands changes (a `land/kit-<version>` branch for its landing workflow, or main itself where no
landing workflow stands), and requests a complete stack restart after the upgrade lands. When PM decides the
Release is ready, `maintain.ts ship` writes its package on the standing Release pull request (`main` → `prod`) and
mentions the owner there once. The owner's approval and merge of the Release is the one human act that ships.

## Host tools

Beside the vendored SDK, the kit's own host tools run outside the agent's credential boundary, each one file under
`.open-autonomy/`, run with Bun from the checkout:

Paying container installs use the treasurer's separate executor and host-held key under
[ADR 0021](../../docs/decisions/0021-the-pay-boundary.md). A bare start opens a pay port only for a synthetic
World with `--rehearsal`; fleets open none. This kit custody boundary does not change the platform's treasury rules.

- **The valve** (`.open-autonomy/valve.ts`) holds the project's key: `--key <file>:<port>`, one port per key file
  (the developer's on 8787, the treasurer's on 8788 with `--caller`, served in container mode to the treasurer's own
  executor alone and in a bare start only for a rehearsal: the pay boundary, docs/decisions/0021), each file re-read when it changes so a rotated key needs no
  restart, `/healthz` naming the key's expiry. The agent is pointed at the valve with the literal word `valve` as its
  key and never sees the credential. It forwards the model routes, the narration route (`/v1/agent/events`), the
  rails and public reads of the account, and refuses the rest. `--codex <port>` forwards the host's current Codex
  ChatGPT login through Codex's own app-server protocol (`codex-auth.ts`): Codex owns storage and refresh, the kit
  keeps no copy. `--github-app <file>:<port>` serves the agent's GitHub App identity as api.github.com for the desk.
- **The credential handoff** (`.open-autonomy/credentials.ts`): `receive --out <protected file>` serves a loopback
  page that saves what a person pastes, verbatim, owner-only, never overwriting; `receive --github-app owner/repo`
  receives a GitHub App manifest callback instead; `capture` transfers one field from a page in the existing
  normal browser straight to the receiver. The command prints an address or a receipt, never the secret. Destinations
  are outside every Git checkout; `checkCredentialDirectory` is shared with `mint-key.ts` and the kit's setup.
- **The Volter Harness adapter** (`.open-autonomy/reporting.ts`): the publication policy and the transcript publisher the
  reporter uses to read native Hermes through Volter Harness's harness SDK and publish through the Open Autonomy SDK.
- **The Hookline adapter** ([hookline.ts](base/.open-autonomy/hookline.ts)): when the host's Hookline connection is
  configured, the keeper forwards pull-request events to the named native agent/session and retains delivery IDs.
  Hookline owns inbox delivery; Supercode owns the mailbox/session door. This adapter grants no execution authority.

The publisher serves both layouts and uses the external native contracts: retained board events and the
live session index, plus Volter Harness session discovery and paginated transcripts,
native start/end records, run outcomes, live jobs, profiles, skills and workflow state. Open Autonomy's
SDK batches and acknowledges delivery. Silence never ends a session, and a task's lane never invents
a review verdict. The reporter reads repository-owned documents from committed main and applies the
YAML publication policy in `.open-autonomy/config.yaml`; it does not parse Hermes's storage files. Native
source identity, replay and projection requirements belong to the [SDK contract](../sdk/README.md) and
[ADR 0016](../../docs/decisions/0016-retained-source-publication.md). The board adapter saves source cursors
only after its publication callback resolves; that callback checkpoint is not a receipt for every OA write.

Publication checkpoints record acknowledged offsets and a digest of the published prefix. Restart and
history-change events reconcile against Volter Harness and the destination's receipt. An upload failure stays
retryable. If already-published history changes, the append-only destination cannot replace it: reporting
stops for that session with an explicit reconciliation error rather than skipping or duplicating it.
The platform retains a transcript tail; it is not the native session archive. Scheduled runs publish by
default, with private session/job exceptions and optional chat publication controlled by project policy.

The publisher's independent controller receives the owner's word for either native runtime.
`POST /v1/agent/state {"state":"paused"}` on a `steer`-scoped key records the request on the platform. The controller
reads it through the valve and applies supported public job controls, remembering ownership before mutation and
checking native readback. A run in flight may finish; channel conversations still answer. `{"state":"running"}`
resumes only owned jobs after readback; independently disabled jobs stay disabled. Board pause/resume remains
pending because the pinned adapters lack a safe owning door. It reports `paused` only when authoritative native
reads establish no enabled job, live funded run or unknown dispatcher; otherwise the page retains "pause requested
· still running" with the cause.

Private `<reporter-state>.control.json` holds canonical pause ownership, separate from narrative receipts and
checkpoints. Its first seed may copy validated retained pause arrays, recording their source digest and custody
limitations. Once present, even empty sets remain authoritative. Missing/refused publication enrollment and
narrative delivery cannot disable this control loop; malformed control state or conflicting account/API/runtime
scope refuses native effects. Both modes use one verified local lock, released only after queues and source drain.
The [publication front door](base/.open-autonomy/PUBLICATION.md) documents the private state and operator recovery.

**Rails.** The agent's model calls need no configuration beyond the key. `rails:` in
`.open-autonomy/config.yaml` opens the two others, off by default: a single-use card minted against the
balance for a bounded amount at the owner's merchant categories, and a partner service's metered charge
for a listed partner within a bound. Both leave records on the public audit trail naming the rail.

## The world

A rehearsal is an ordinary World scenario: opening state through vendor APIs, file handlers for model
judgment and faults, and the unmodified application running inside World. The kit includes World tooling;
each project owns its scenario beside its application. It does not receive OA's scenario or a separate
rehearsal engine. The company skew also supplies its own generalized [World scenario template](skews/company/world/README.md);
each adopter owns its resulting source-tree selections, synthetic opening data and model handlers.
OA's [World guide](../../world/README.md) demonstrates its separate scenario with the cookbook, the real
platform, synthetic vendors and manual actions. World owns resources, processes, readiness and cleanup.

## Nothing in the agent's reach is a secret that matters

The agent's `.env` says `OPEN_AUTONOMY_KEY=valve`. Managed deployments sign pushes through an ssh-agent
loaded with one repository-scoped deploy key. Local Codex uses the project GitHub App through the host
valve; startup checks its Git routes and Contents write grant before starting Hermes. The gateway
holds neither credential. Delivery uses the configured channel connection; publication follows the
project's audience policy, and the platform redacts secret-shaped text at intake as the second wall.

## Roadmap scrum upgrades

Version 2.8 introduces sourced [ROADMAP.md](skews/self-build/ROADMAP.md) planning. Upgrade creates a missing roadmap from the project's
historical seed, preserving holds and acceptance as intentions to reconcile, and never overwrites existing
notes. Startup stops replaying the seed into kanban. Existing tasks and owner schedules stay intact;
existing PM/community cron jobs load the new skills even if their old prompts describe filing tasks.
The first scrum matches old tasks before queueing anything; upgrades never rewrite an adopter's
constitution. Update project-owned AGENTS.md wording that still equates the board and roadmap. No production or release permission changes with this upgrade.

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

PM owns release planning: one sourced release section in ROADMAP.md, a coherent scope and a version under
project policy. Everything landed on `main` compounds onto the one Release pull request, the only thing a person is
asked about; a merge or a date is not a release. See `.open-autonomy/PRODUCTION.md`.

The local Codex setup choice uses the operator's ChatGPT allowance on this computer. Both launch modes use
the host valve, which asks the installed Codex for the current login through its app-server protocol.
Codex owns credential storage and refresh; Hermes receives only a stand-in credential. OA keeps no
project copy of the login. Run the host service as the signed-in user with the same `CODEX_HOME`. This choice does not provision remote
hosting. The setup agent installs the local image and trusted host service, then verifies the
project connections and development loop. Follow the
generated `.open-autonomy/SETUP.md` for model selection and the remaining activation checks. The reporter
can run on the host with `--container <id> --project <container checkout> --state-file <host cursor file>`
and `HERMES_HOME=<container home>`. It reads through the container's native Volter Harness process; the host
filters and publishes the stream, without copying SQLite files or mounting host credentials into the agent.

Automated tests are banned: their accumulated code and maintenance become cruft that can prevent
repository progress. Each develop agent verifies its feature through REPL-style manual usage of the
running product, records observations in its handoff and commits no permanent test code. The shared
develop skill and seeded constitution/contributor instructions carry this policy.
