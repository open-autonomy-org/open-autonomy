# Open Autonomy's World scenario

A rehearsal is running a scenario in World. This directory describes OA's opening situation,
model judgment and manual actions. The unmodified application is `cookbooks/todo-cli`, running
with the real platform and native Hermes. Generated projects have World tooling and author
scenarios for their own applications; they do not carry this scenario or a rehearsal engine.

World owns every service, including the agent: startup order, resources, injected environment,
readiness, logs and shutdown. The agent's command seeds through vendor APIs, then executes the
ordinary `.open-autonomy/start.ts`. Homes, clones, books and synthetic keys live in instance data
and are removed by normal World purge. The source scenario survives.

## Prepare and run

Install dependencies from the lockfile through a tooling World, using the package manager's warm
cache. Prepare both the OA workspace and the cookbook's `.open-autonomy` dependencies. Use the
Hermes version recorded in `cookbooks/todo-cli/container/hermes.pin`; an existing installation
can be reused. Boot does not download Hermes or bypass World to install packages.

```bash
export WORLD_STATE_ROOT=/fast/disk/oa-world  # outside the checkout
export OA_WORLD_NAME=open-autonomy-todo-cli
export WORLD_HERMES_BIN=/path/to/pinned-hermes/.venv/bin
export TWINS_ROOT=/path/to/twin             # current checkout; omit to use installed packages
bun world/prepare.ts
```

Preparation prints the exact World commands for the installed CLI or selected Twin checkout.
It writes ordinary `world.config.json` and `<scenario>/handlers/openai.json` under
`$WORLD_STATE_ROOT/scenarios/$OA_WORLD_NAME/`. Use the printed commands, or the equivalent
installed CLI below, from the OA repository:

```bash
volter-world up "$WORLD_STATE_ROOT/scenarios/$OA_WORLD_NAME/world.config.json" --env-file "$WORLD_STATE_ROOT/scenarios/$OA_WORLD_NAME/world.env" --root "$WORLD_STATE_ROOT"
volter-world app-url "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" --set "$(volter-world url "$OA_WORLD_NAME" platform --root "$WORLD_STATE_ROOT")"
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operator.ts hermes kanban list
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operator.ts hermes cron run pm
volter-world doctor "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT"
volter-world tail "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" --no-follow
volter-world down "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" --purge
```

`up` starts a fresh instance and the agent entrypoint seeds it once. A running instance rejects
another `up`; it is never silently reseeded. To change handlers or the opening situation, finish
attached commands, run `down --purge`, prepare again and `up`. Other services use automatic ports;
for a second simultaneous scenario, choose another name and `OA_VALVE_PORT` (default 18787,
plus the following three ports for the existing OA valves). World reports conflicts and capacity
refusals. It never reclaims another actor's process or World.

The model twin supplies authored judgment. A labeled stub is missing scenario content; read
`tail`, edit `world/model/scenario.ts`, and prepare a fresh instance. Scenario code can be complex
without requiring another runner. Verification is manual: perform an action and inspect the
actual vendor records, native board, published SDK state and books. Do not run test suites.

## Scenario content

| Source | Responsibility |
|---|---|
| `world.config.json` | Six vendor twins, platform, live fixture, simulated Actions and the native agent |
| `prepare.ts` | Resolve local source paths and emit the model handler file |
| `seed.ts`, `opening.ts` | Repository, funded account, adopter key claim and opening conversations through APIs |
| `agent.sh`, `ready.ts` | Execute the normal app entrypoint; observe its native schedule once |
| `model/` | Authored model judgment and the files that judgment writes |
| `actions.ts` | Explicit simulation of OA's GitHub Actions workflow activity |
| `live.ts` | A simulated deployed version reported to the real platform |
| `operator.ts`, `operators/` | One manual action or observation through native/vendor doors |

GitHub Twin stores branches, pull requests, reviews and checks; it does not execute CI. The
Actions scenario service opens PRs for pushed agent branches, compiles the exact head and reports
that result through GitHub APIs. Twin performs the merge when its requirements are met. The
platform and SDK reporter are real. Synthetic OAuth does not prove live consent or permissions.
Local World interception is not OS isolation; use synthetic credentials and the World’s declared
network policy. This scenario does not enable real model calls or production deployment.

## Community and development

Before preparation, choose `REHEARSAL_COMMUNITY=1 REHEARSAL_IDLE=1`, without
`REHEARSAL_SCRUM` or `REHEARSAL_RELEASE`. The opening seed creates question #1, documentation
request #2 and discussion #1. Use a current Twin checkout for GraphQL discussion creation.

```bash
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operator.ts hermes cron run community
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operator.ts say 'what is todo-cli?'
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operator.ts channel
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operator.ts hermes cron run pm
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/scrum.ts inspect
```

Read the issue and discussion replies through the community door. After the planning PR lands,
a subsequent PM run can queue `community-usage`; inspect the resulting the [community document](model/stages/community-usage/COMMUNITY.md) on main
and its source link to request #2. Routine reports stay local; the direct Discord reply goes to
the person who asked. With no opening flags, the historical todo intentions instead await PM
reconciliation before dispatch. `REHEARSAL_IDLE=1` starts with an empty board.

`world/operators/account.ts` supplies individual `inspect`, `rotate-key`, `model` and
`live [commit|unreachable]` actions. Run them attached. Rotation uses the real key tool with a
five-second grace; observe the valve adopting the key and the old token refusing afterward.
Model selection commits the new default on the twin's main; send `/restart` in the scenario
channel to request native Hermes restart. The ordinary kit entrypoint handles the native restart,
while World continues owning the service. Inspect the next worker's model and metered spend.
A live fixture change is an observation for the page, never a production deployment.

## Roadmap scrum rehearsal

Export `REHEARSAL_SCRUM=1` before preparation. The opening seed creates owner direction, a volunteer,
an unanswered suggestion, a conflicting proposal and an outside PR through GitHub APIs. The scripted PM
plans, the plan lands, and a subsequent scrum queues fleet work.
Explicitly scripted judgment, with real Hermes cron, kit helpers, git landing, board dispatch and native review: it proves
mechanics, not unscripted judgment. The operator beats below drive one step at a time by hand. The PM's poll reads the
outside pull request from the repository's issue list, as GitHub serves it. Use a current twins checkout
with `TWINS_ROOT=<checkout>`. The Discord seed discovers the checkout twin's text channel and writes it
to the world's channels.env, which every door reads.

```bash
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/scrum.ts overlap   # existing integration work awaiting the outside PR
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operator.ts hermes cron run pm                         # consolidate and push sourced planning notes
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operator.ts hermes cron run pm                         # after landing: queue fleet implementation
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/scrum.ts inspect  # read roadmap, board, issues and PRs
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/scrum.ts guards   # held human work refuses; concurrent creates share one native task
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/scrum.ts intake   # duplicate chat capture and a late GitHub reply, independent desk cursors
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operator.ts say /restart                             # preserve native notepad and unfinished planning worktree
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operator.ts hermes cron run pm                         # reconcile the late reply and preserved intake
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/scrum.ts release  # reconcile an existing PM release proposal; no proposal means no request
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/scrum.ts archive  # after native review: archived work is not recreated
```

Read the resulting records between beats; a cron exit alone is no proof. `release` leaves human approval
pending and sends only to the twin. No production approval, release or deployment is performed. A needed
model beat outside this script remains an unauthored scenario, not evidence of reasoning quality.

The distillation follow-up uses the same world. After the initial planning PR lands, run another scrum to
retire that batch. `attach -- bun world/operators/scrum.ts outside` merges the ordinary outside PR and adds a
routine comment, without a Hermes handoff or shared-document edit. Subsequent PM scrums must discover the
landed commit, source one Unreleased changelog entry, and retain human release review in roadmap. Repeat
scrums should add no journal entries or duplicate changes. `inspect` prints both documents and native PM
notepad state. `checkpoint` shows a stable interrupted batch and refusal of a wrong snapshot ID; `gap`
retires a batch without acknowledging incomplete sources so the next one repeats their history. `notepad`
exercises deduplication and the native size limit; acknowledged routine pointers should be pruned without
entering shared documents. These are manual operator beats, not assertions of unscripted model judgment.

## Target release schedule rehearsal

Export `REHEARSAL_RELEASE=1 REHEARSAL_IDLE=1` (without REHEARSAL_SCRUM) before bringing todo-cli up. This selects
`world/model/release-beat.ts` as the scripted PM judgment; all planning PRs, notepad checkpoints, board transitions and
owner requests still use the running kit and native Hermes. Drive the accumulate → request-review → defer sequence manually:

```bash
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/release.ts accumulate
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operator.ts hermes cron run pm  # land a sourced target schedule, without asking for release
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operator.ts hermes cron run pm  # after landing: reconcile; main can be ahead with no shipping request
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/release.ts prepare
# Repeat the two PM beats: preparation still requires no human release request.
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/release.ts request-review
# Repeat the PM beats after landing: a ready PM decision produces the version/candidate-specific request.
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/release.ts inspect
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/release.ts later
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/release.ts finish-later # after landing; request/candidate stay fixed
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/release.ts invalid-package # mismatched version cannot create/change a request
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/release.ts reconcile # restored package keeps the authorized request unchanged
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/release.ts defer
# Repeat PM beats: the changed plan parks the previous request; PM withdraws it in the original conversation.
```

Inspect state between beats; a successful cron return alone is not proof of landing. The `landed` operator command waits up to 30 seconds for the current planning branch to reach main before the next PM beat. `unknown` simulates an
unreachable live service. `deployed`, after a valid ready plan, changes only the world's live-observation fixture
to the selected candidate: its shipping hold can release while later main commits remain unreleased. This is
not a deploy, tag or human approval. `reconcile` updates the native hold; the next PM scrum follows up in
the human conversation. Repeated PM beats check the task's conversation reference rather than sending a
fresh request. The target
window is intentionally separate from these decisions; there is no clock-triggered release mechanism.

A renewed ready decision after deferral starts a new native review card; the withdrawn card stays held, preserving its history and dependencies.

## Shared team roster rehearsal

With an idle todo-cli world running (`REHEARSAL_IDLE=1`), the manual `world/operators/team.ts` beats seed a confirmed human through
GitHub's Contents API, submit the platform form, exchange a synthetic OAuth code, inspect the resulting
draft PR and merge only as the world human. No real account, token or approval is used.

```bash
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/team.ts seed
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/team.ts propose
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/team.ts inspect  # main still has the original roster
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/team.ts stale    # stale form refuses; no additional PR
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/team.ts merge    # retry after the world's CI finishes
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/team.ts inspect  # merged roster is now visible
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/team.ts scrum    # native PM preparation
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/team.ts non-owner
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/team.ts propose  # revoked owner/moderator refuses
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/team.ts scrum    # resumed snapshot, current authority
```

Inspect between beats. The twin has no GraphQL mark-ready mutation, so the merge beat closes the draft
and opens an ordinary review PR for the identical branch through GitHub's real REST API. CI and merge
remain real. Its synthetic OAuth exchange does not prove GitHub consent UI or real token permissions.

The team flow requires the current [GitHub twin's Contents and Git ref support](https://github.com/volter-ai/twin/tree/main/packages/twin/github#coverage).
Select that checkout with `TWINS_ROOT` before bringing the world up.

## Install the packed kit into a fresh project

Publish only to the world's registry, then run the actual package CLI outside this monorepo. Choose a
fresh rehearsal version when source changes; this number does not choose the production release version.
The registry must also contain the generated project's development dependencies. Seed those through its
ordinary publish API from cached package artifacts; missing metadata is a twin coverage gap.

```bash
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun world/operators/kit-release.ts 2.8.2
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- sh -c 'npm_config_registry="$NPM_REGISTRY_TWIN_URL" bunx create-open-autonomy@2.8.2 create /tmp/oa-onboarding --project oa-onboarding --account cookbook/oa-onboarding'
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- sh -c 'npm_config_registry="$NPM_REGISTRY_TWIN_URL" bun install --cwd /tmp/oa-onboarding'
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- bun run --cwd /tmp/oa-onboarding check
volter-world attach "$OA_WORLD_NAME" --root "$WORLD_STATE_ROOT" -- sh -c 'npm_config_registry="$NPM_REGISTRY_TWIN_URL" bun install --frozen-lockfile --cwd /tmp/oa-onboarding'
```

Inspect the generated branding, team/setup instructions, runtime and compiler versions, and kit record.
Check with a PATH that contains Bun and Node but no global TypeScript compiler, so this machine's installed
tools cannot hide an undeclared project dependency. Initial installation creates the project's lockfile;
subsequent installs must preserve it. This proves packaging and bootstrap mechanics, while the scrum,
implementation/review, and release-schedule rehearsals above exercise the running fleet. Provider consent,
real project requirements, and production activation still need their own setup evidence.
