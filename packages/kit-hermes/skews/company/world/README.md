# The install's review World

The company install's rehearsal (company RFC 0026 decision 6): the install stood up from this checkout and the trees below, with twins of every
vendor, the real Open Autonomy platform and a rehearsal RH2. The Claude profiles (the manager, the account manager, the
coders, the reviewer, the box maintainer) go the install's own route: the org valve, the platform, and its model gateway
(the twins' Merge pack), so their calls are metered on the organization's key; the Codex profiles stay on the owner's
subscription route (the OpenAI twin). Each model's turns are scripted (`model/`), and nothing reaches production or a
real model.

## What it runs

| Source | What |
|---|---|
| this checkout | the install at the branch under review (`home/`, `.open-autonomy/`) |
| `OA_TREE` | open-autonomy at `main` (at or after 80847f05, the IR kit): the platform as a World service |
| `SUPERCODE_TREE` | supercode at `main` (at or after 06ff1ff4, the agent mailbox), or the branch under review, built: the start runs its `supercode` and orchestrator |
| `TWINS_ROOT` | the twin runtime and its older packs (GitHub, Anthropic, the Codex route's OpenAI) |
| `WORLD_SLACK_CLI`, `WORLD_MERGE_CLI`, `WORLD_OPENAI_CLI` | the twins' P3 packs (twin-packs-p3 on twin-world): Slack, the Merge gateway, OpenAI's Realtime voice |
| `VO_RH2_*` | the rehearsal RH2 (volter-ai/volter `rh2/runbooks/rehearsal`): the account Room, its call, its Slack conversation |

The World allows no real outbound connection (`runtime.network.egress: []`): a stray call to a real vendor is refused,
and every credential in it is synthetic.

`seed.ts` puts this checkout on the GitHub twin, sets each profile's route (Claude profiles on the gateway's catalogued
model, Codex profiles on the OpenAI twin), funds the account and mints its keys the adopter way; `agent.sh` then runs `.open-autonomy/start.ts`, the install's only start, and `enroll.sh` runs `.open-autonomy/enroll.ts` once the home is rendered, as the keep does after a move.

## Prepare and run

```bash
export WORLD_STATE_ROOT=/fast/disk/vorg      # outside this checkout
export OA_TREE=/path/to/open-autonomy        # at main
export SUPERCODE_TREE=/path/to/supercode     # at main, after: cargo build -p supercode-cli
export TWINS_ROOT=/path/to/twin
bun world/prepare.ts                          # prints the World commands
```

Install `.open-autonomy`'s dependencies through a tooling World first; boot downloads nothing. Native setup uses
the selected Supercode public model and job doors, so this IR scenario requires no Hermes executable or home.
`HERMES_HOME` remains a compatibility environment name for the selected instance root, not a runtime selector.
Native owner controls currently support scheduled jobs; a declared dispatcher pause remains pending because the
shipped public board controls cannot preserve active attempts and unrelated pauses. See OA ADR 0026.
`VO_MACHINE_B_SUPERCODE_BIN=/path/to/supercode` gives the second machine (`machine-b`) a supercode of its own, as a box
on another release has, with the Teams package that supercode finds beside itself (its checkout's `sdk/teams`, or its
install's); unset, it runs `SUPERCODE_TREE`'s. `VO_MACHINE_B_CUSTODIAN=<name>` has a member of that name (invited by the
owner) enroll machine-b, as a box someone else runs: the install reaches it only through the grants given on it.

## One board card, end to end

`world/operators/card.ts` creates one card with a fixed title (`model/card.ts`) on the install's board, assigned to the
coder on the World's machine, and prints the card, its PR and the GitHub twin's merge state; run again, it prints them
again. Everything between is the board's: it claims and launches the card; the coder's scripted turn commits, pushes
the card's branch and opens its PR; the board starts the review; the reviewer passes the PR head; the coder's next run
merges at that head and asks the manager for done; the manager completes the card at the reviewed head.

```bash
world attach <name> --root "$WORLD_STATE_ROOT" -- bun world/operators/card.ts
world tail <name> --root "$WORLD_STATE_ROOT" --no-follow
```

### An adopted session

`world/operators/native.ts` does the person's acts around a session the board did not start. `start` creates a held
card, checks out its branch where the board would, and starts Claude Code there in a terminal of the person's own (not
a daemon pane); `ask` is the owner's line to the manager, whose scripted turn adopts that session onto the card
(`workflow adopt`, the manager's verb). `work` asks the session to work the card, `end` ends it once the board has released it (its run
ended), and `show` prints the card, its PR and the twin's merge state. Supervision, review and close are the board's.

## The proofs, through the install's own doors

- **RFC 0021 rows 1–6:** the home rendered from `home/` (the organization's layer at the root, the named profiles, no
  stock persona); the manager's tick, the account manager's digest and the auditor's round as jobs (`tail`); a card
  tagged with a project publishes under that project once its key is in `<secrets>/projects/<owner>/<repo>/`; a review's
  session runs the `reviewer` profile.
- **RFC 0020 rows 1–24:** through `supercode agent`, `supercode message` (send, reply, delegate, threads) and the
  sessions' panes; a channel through `AgentMailboxBridge` over the RH2 twin; a call through `supercode voice run` with
  `agent:` set.
- **Native fleet routing:** the auditor's round as a job; each connector runs the machine-health probe. Recipient
  configs start empty. Enrollment subscribes the same host maintainer on both machines and opens one main on the
  install host. Inspect both machines' native agents, launches and subscriptions, then the host main's mailbox for
  machine-b's alarm. Labelled model stubs prove receipt only, not resource judgment or runaway intervention.

For late enrollment, prepare with `VO_MACHINE_B_AFTER_ENROLL=1`. Machine-b waits for
`$VOLTER_WORLD_DATA/enrollment.done` before connecting. After the first enrollment, create that marker and run
the existing maintenance pass again at the same revision. Its health-only enrollment must subscribe the retained
host agent on machine-b without opening a remote maintainer. Clear/raise a threshold through the native health
configuration door to observe a fresh alarm transition.

## An install's own scenarios

The kit renders this World with the install (`create-open-autonomy create`; `adopt` adds it to an install that predates
it), and from then on it is the install's, like the rest of `world/`. What an install changes for its own engagement: `world.config.json` (add a twin an engagement needs, such as Jira), `rh2/org.json` (the organization the
rehearsal RH2 applies), the scripted turns under `model/`, and `scenarios/`. Each `scenarios/*.ts` runs once the
install is seeded, in name order, with the World's environment. That is where an engagement's opening goes: its
client's tickets on the Jira twin, the client's repository as a snapshot on the GitHub twin, its synthetic client. A
process change carries its dry run in this World as evidence in its pull request, for its reviewer. A dry run is a walk
through the product's doors, never a required check.
