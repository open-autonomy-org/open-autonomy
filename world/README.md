# The world: Open Autonomy with no keys anywhere

The world is the kit's own rehearsal (`.open-autonomy/rehearsal/`, which every cookbook carries and the kit keeps
current) run in a cookbook, with the platform built from this tree in place of the bare backend copy. Each cookbook keeps
its world under `cookbooks/<name>/rehearsal/`: the [volter-world](https://github.com/volter-ai/twin) definition (local
twins of GitHub, Discord, the model gateway, Stripe, Polar and the npm registry, a deployed service the page compares with
main, GitHub Actions played by the kit's runner), the scripted brain the model twin serves, its stories, and the hooks
that seed what the kit cannot know. No account, no credential, no cloud, no spend, no Docker. Nothing in the world calls
a real API, ever. The project under test is the cookbook, started exactly as the kit starts it on a laptop
(`.open-autonomy/start.ts`, bare, as you): its gateway carries the schedule and works the board itself.

```bash
export WORLD_STATE_ROOT=/fast/disk     # the world's state on a disk with headroom (the runtime admits a world against the root's free space)
bun world/run.ts up                    # twins + the real platform + the Actions runner, seeded; then the cookbook's brain (seconds)
open "$(bun world/run.ts url)/p/cookbook%2Ftodo-cli"   # the page: watch the fleet work
bun world/run.ts stories               # every story of the cookbook: one line each, verdict and seconds
bun world/run.ts story rehearsal/stories/board.jsonl   # one story: the seeded tasks land, the owner moves the model, the treasurer pays
bun world/run.ts env -- curl -s "$PLATFORM_URL/v1/funding"   # anything, inside the world: the books, the sessions, the twins' ledgers
bun world/run.ts hermes kanban list    # the fleet board, through the pinned Hermes against the world's home
bun world/run.ts hermes cron run pm    # the PM's hour, now (`cron run community`: the community desk; select REHEARSAL_COMMUNITY=1 before up)
bun world/run.ts say "what is todo-cli?"   # a person speaks in the brain's channel on the Discord twin; the brain answers
bun world/run.ts fresh                 # start over (a restart is `fresh`, never down-then-up)
```

`WORLD_STATE_ROOT` must lie outside this checkout (the kit's default, the cookbook's own directory, does not): the
kit refuses to write a credential inside a repository, and the `between-tasks` act rotates the brain's key into the
world's secrets. `--cookbook <name>` picks the project under test (default `todo-cli`; also `WORLD_COOKBOOK`). For a second world of the
same cookbook on one machine, use a separate `WORLD_STATE_ROOT` and export `REHEARSAL_PORT_OFFSET=1000`: every service
port moves together. `WORLD_HERMES_BIN` names an installed pinned Hermes bin directory (otherwise the pin is installed
once under the state root). The opening position a story needs is exported before `up` and read by the cookbook's seed
hook (`rehearsal/env` lists them): `REHEARSAL_IDLE=1` starts with an empty board for owner-notification, upgrade and
release exercises; `REHEARSAL_SCRUM=1` seeds the scrum rehearsal's community; `REHEARSAL_RELEASE=1` selects the PM's
release-planning judgment; `REHEARSAL_OWNER_DOOR=github` has the owner ask for release review in an assigned GitHub
issue instead of the project's Discord channel — the seed writes ordinary instructions into the project-owned
communication skill, just as a setup agent would, and the scripted PM loads that skill through native Hermes and contacts
the reviewer itself. `WORLD_<VENDOR>_CLI` (`WORLD_GITHUB_CLI`, say) points at one twin's CLI in a checkout when
verifying a fix before its release; `TWINS_ROOT` names a whole checkout.

The world is an environment, not a gate. Nothing runs unattended over it: whoever brings it up drives it — the page, the
books, the board, the twins' ledgers (`volter-world tail`) — and reads what the product says, or runs a story and reads
what it did. Do not run automated test suites or test hooks. The cookbook’s `bun run check` is compilation only;
verify behavior by driving the running product and inspecting the result.

The cookbook is `todo-cli`: nine historical seed intentions, each one command. Fire the PM to reconcile them into
ROADMAP.md; a subsequent scrum queues ready work after the planning PR lands; the brain thinks on the owner's previous
model until the `between-tasks` act moves it (the model on main, the checkout following, the brain restarted, the key
rotated with a short grace). For community interactions, export `REHEARSAL_COMMUNITY=1 REHEARSAL_IDLE=1`
(without `REHEARSAL_SCRUM` or `REHEARSAL_RELEASE`) before `up`. The seed creates a question and a documentation
request as issues, and a usage-tip idea as a discussion through GitHub GraphQL. Run `hermes cron run community`,
inspect the issue comments and discussion reply through the community door, then `say "what is todo-cli?"`
and inspect the Discord reply. Routine cron reports stay local in this scenario. Run `hermes cron run pm` and read the sourced `community-usage` section on main's
ROADMAP.md after the planning PR lands. The next scrum can queue the matching documentation stage.
The transferred `rehearsal/stories/community.jsonl` records this sequence. It requires the current Twin
checkout's GraphQL discussion creation support (`TWINS_ROOT`); an older twin refuses the seed loudly. The world stays up between edits; the platform reloads on its own
under `wrangler dev`; a kit change is `stack down --purge` and `stack up`; a code change to the cookbook is `fresh`.

## What is real and what is a twin

Real: the worker (under `wrangler dev`, its Durable Object holding the books), the cookbook's brain (the pinned Hermes
from `container/hermes.pin`, installed once under the world's state; the valve; the reporter with supercode inside), git,
and the skills the brain runs. Twins: GitHub (REST plane, GraphQL for discussions, and the git wire; pull requests,
branch protection, required checks and auto-merge, landing a real merge commit), Discord (REST v10 and the gateway
websocket, which Hermes's bot reaches through the world's proxy), the model gateway (the `openai` twin as the `gateway`
service, serving the cookbook's scenario), Stripe (cards out), Polar (money in) and the npm registry.

Played by the world, and labelled as such: **GitHub Actions** (the kit's Actions runner opens the pull request for a
pushed `agent/**` branch, arms auto-merge, runs the project's own `bun run check` as the `ci` check run); **the deployed
service** (`cookbooks/todo-cli/rehearsal/live.ts` reports the commit it runs, and the `live` act moves it); **the seal** (the world's
environment: every vendor is a twin, and the proxy refuses anything untwinned).

The brain's key is minted the adopter way, inside the world: the platform issues a challenge, the seed commits the claim
file to the repository on the twin, the platform reads it back and mints.

## Files

| File | What it is |
|---|---|
| `world/run.ts` | the front: runs the cookbook's engine in the cookbook, with the platform from this tree |
| `cookbooks/<name>/.open-autonomy/rehearsal/` | the kit's engine, carried by the cookbook and kept current by the kit: the seed, the stack, the Actions runner, the story runner |
| `cookbooks/<name>/rehearsal/world.json` | the logical world: six twins, the platform, the live service, the Actions runner, on pinned ports |
| `apps/platform/world.ts` | the platform as a world service, its upstreams pointed at the twins |
| `cookbooks/<name>/rehearsal/model/scenario.ts` | the scripted brain, and `stages/<item>/`, the files it writes; the scrum and release beats, the PM's judgment |
| `cookbooks/<name>/rehearsal/hooks.ts` | what the kit cannot know: the books' patronage, the previous model, the owner's door, the acts and conditions |
| `cookbooks/<name>/rehearsal/stories/` | the stories, one per shape of the method |
| `cookbooks/todo-cli/rehearsal/operators/` | the manual beats below, one step at a time by hand |

## Roadmap scrum rehearsal

`bun world/run.ts story rehearsal/stories/scrum.jsonl` runs the shape end to end: the `scrum-seed` act files owner
direction, a documentation volunteer, an unanswered suggestion, a conflicting proposal and an outside PR through GitHub's
ordinary APIs (`REHEARSAL_SCRUM=1` before `up` seeds them at the start instead); the scripted PM (`cookbooks/todo-cli/rehearsal/model/scrum-beat.ts`)
plans, the plan lands, the next scrum queues fleet work, the outside PR merges and the following scrum distills it.
Explicitly scripted judgment, with real Hermes cron, kit helpers, git landing, board dispatch and native review: it proves
mechanics, not unscripted judgment. The operator beats below drive one step at a time by hand. The PM's poll reads the
outside pull request from the repository's issue list, as GitHub serves it. Use a current twins checkout
with `TWINS_ROOT=<checkout>`. The Discord seed discovers the checkout twin's text channel and writes it
to the world's channels.env, which every door reads.

```bash
bun world/run.ts env -- bun rehearsal/operators/scrum.ts overlap   # existing integration work awaiting the outside PR
bun world/run.ts hermes cron run pm                         # consolidate and push sourced planning notes
bun world/run.ts hermes cron run pm                         # after landing: queue fleet implementation
bun world/run.ts env -- bun rehearsal/operators/scrum.ts inspect  # read roadmap, board, issues and PRs
bun world/run.ts env -- bun rehearsal/operators/scrum.ts guards   # held human work refuses; concurrent creates share one native task
bun world/run.ts env -- bun rehearsal/operators/scrum.ts intake   # duplicate chat capture and a late GitHub reply, independent desk cursors
bun world/run.ts stack restart                             # preserve native notepad and unfinished planning worktree
bun world/run.ts hermes cron run pm                         # reconcile the late reply and preserved intake
bun world/run.ts env -- bun rehearsal/operators/scrum.ts release  # reconcile an existing PM release proposal; no proposal means no request
bun world/run.ts env -- bun rehearsal/operators/scrum.ts archive  # after native review: archived work is not recreated
```

Read the resulting records between beats; a cron exit alone is no proof. `release` leaves human approval
pending and sends only to the twin. No production approval, release or deployment is performed. A needed
model beat outside this script remains an unauthored scenario, not evidence of reasoning quality.

The distillation follow-up uses the same world. After the initial planning PR lands, run another scrum to
retire that batch. `env -- bun rehearsal/operators/scrum.ts outside` merges the ordinary outside PR and adds a
routine comment, without a Hermes handoff or shared-document edit. Subsequent PM scrums must discover the
landed commit, source one Unreleased changelog entry, and retain human release review in roadmap. Repeat
scrums should add no journal entries or duplicate changes. `inspect` prints both documents and native PM
notepad state. `checkpoint` shows a stable interrupted batch and refusal of a wrong snapshot ID; `gap`
retires a batch without acknowledging incomplete sources so the next one repeats their history. `notepad`
exercises deduplication and the native size limit; acknowledged routine pointers should be pruned without
entering shared documents. These are manual operator beats, not assertions of unscripted model judgment.

## Target release schedule rehearsal

Export `REHEARSAL_RELEASE=1 REHEARSAL_IDLE=1` (without REHEARSAL_SCRUM) before bringing todo-cli up. This selects
`cookbooks/todo-cli/rehearsal/model/release-beat.ts` as the scripted PM judgment; all planning PRs, notepad checkpoints, board transitions and
owner requests still use the running kit and native Hermes. `bun world/run.ts story rehearsal/stories/release.jsonl` runs
the accumulate → request-review → defer shape; the operator beats below drive it by hand.

```bash
bun world/run.ts env -- bun rehearsal/operators/release.ts accumulate
bun world/run.ts hermes cron run pm  # land a sourced target schedule, without asking for release
bun world/run.ts hermes cron run pm  # after landing: reconcile; main can be ahead with no shipping request
bun world/run.ts env -- bun rehearsal/operators/release.ts prepare
# Repeat the two PM beats: preparation still requires no human release request.
bun world/run.ts env -- bun rehearsal/operators/release.ts request-review
# Repeat the PM beats after landing: a ready PM decision produces the version/candidate-specific request.
bun world/run.ts env -- bun rehearsal/operators/release.ts inspect
bun world/run.ts env -- bun rehearsal/operators/release.ts later
bun world/run.ts env -- bun rehearsal/operators/release.ts finish-later # after landing; request/candidate stay fixed
bun world/run.ts env -- bun rehearsal/operators/release.ts invalid-package # mismatched version cannot create/change a request
bun world/run.ts env -- bun rehearsal/operators/release.ts reconcile # restored package keeps the authorized request unchanged
bun world/run.ts env -- bun rehearsal/operators/release.ts defer
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

With an idle todo-cli world running (`REHEARSAL_IDLE=1`), the manual `cookbooks/todo-cli/rehearsal/operators/team.ts` beats seed a confirmed human through
GitHub's Contents API, submit the platform form, exchange a synthetic OAuth code, inspect the resulting
draft PR and merge only as the world human. No real account, token or approval is used.

```bash
bun world/run.ts env -- bun rehearsal/operators/team.ts seed
bun world/run.ts env -- bun rehearsal/operators/team.ts propose
bun world/run.ts env -- bun rehearsal/operators/team.ts inspect  # main still has the original roster
bun world/run.ts env -- bun rehearsal/operators/team.ts stale    # stale form refuses; no additional PR
bun world/run.ts env -- bun rehearsal/operators/team.ts merge    # retry after the world's CI finishes
bun world/run.ts env -- bun rehearsal/operators/team.ts inspect  # merged roster is now visible
bun world/run.ts env -- bun rehearsal/operators/team.ts scrum    # native PM preparation
bun world/run.ts env -- bun rehearsal/operators/team.ts non-owner
bun world/run.ts env -- bun rehearsal/operators/team.ts propose  # revoked owner/moderator refuses
bun world/run.ts env -- bun rehearsal/operators/team.ts scrum    # resumed snapshot, current authority
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
bun world/run.ts env -- bun rehearsal/operators/kit-release.ts 2.8.2
bun world/run.ts env -- sh -c 'npm_config_registry="$NPM_REGISTRY_TWIN_URL" bunx create-open-autonomy@2.8.2 create /tmp/oa-onboarding --project oa-onboarding --account cookbook/oa-onboarding'
bun world/run.ts env -- sh -c 'npm_config_registry="$NPM_REGISTRY_TWIN_URL" bun install --cwd /tmp/oa-onboarding'
bun world/run.ts env -- bun run --cwd /tmp/oa-onboarding check
bun world/run.ts env -- sh -c 'npm_config_registry="$NPM_REGISTRY_TWIN_URL" bun install --frozen-lockfile --cwd /tmp/oa-onboarding'
```

Inspect the generated branding, team/setup instructions, runtime and compiler versions, and kit record.
Check with a PATH that contains Bun and Node but no global TypeScript compiler, so this machine's installed
tools cannot hide an undeclared project dependency. Initial installation creates the project's lockfile;
subsequent installs must preserve it. This proves packaging and bootstrap mechanics, while the scrum,
implementation/review, and release-schedule rehearsals above exercise the running fleet. Provider consent,
real project requirements, and production activation still need their own setup evidence.

## Setup and runtime regression

`cookbooks/todo-cli/rehearsal/operators/setup-runtime.ts <executor>` operates only disposable
homes/checkouts and explicitly owned children in an existing World executor. Run it through that
executor's `volter-world attach`: it verifies executable scratch, tools/write roots, clean/resumed home
preparation, preservation of unfinished work and native state, control-stream closure, and orphan reaping.
It does not restart or reconfigure the live fleet. Its printed directory retains the synthetic evidence.

With `REHEARSAL_RELEASE=1 REHEARSAL_IDLE=1`, the separate `continuation.jsonl` story exercises PM
landing and dispatching an explicit owner request while the original candidate still awaits human review.
Generic encouragement and the historical seed do not authorize additional product scope.
The model's choice is authored scenario behavior, not proof of unscripted planning judgment. A blind
agent also rehearses the packed kit from a fresh project without this repository's operator history;
provider challenges remain explicit human checkpoints. Record discovered defects and verification in
the change's PR, then correct the kit and repeat the affected exercise.
