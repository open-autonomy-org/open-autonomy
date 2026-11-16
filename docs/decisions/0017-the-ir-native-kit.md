# ADR 0017: The IR-native kit: a `company` skew whose home is Supercode's native folder, run only through its own start

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its first
implementation; proposed until both occur.

Amends [ADR 0006](0006-the-kit-is-a-lineage.md) (a second kit on the same lineage engine) and
[ADR 0009](0009-another-harness-on-the-same-home.md) (the board's dispatcher is the start's, where the home declares
one). Supersedes neither.

## Context and sources

**Authorization.** The owner locked the design in Volter's company repository on 2026-09-30:
`volter-ai/volter` `company/rfcs/0021-one-open-autonomy-install-for-the-org.md` ("get everything locked down") and
`company/rfcs/0022-the-process-auditor-and-the-box-maintainer.md` ("okay now let's lock down the design for these").
The owner's lines it rests on, from RFC 0021: "I think making a new template for this is perfectly reasonable btw";
"it's actually one OA install using the orchestration IR that compiles into supercode + the various default files or
checkouts that may be needed + anything that needs to be setup for the reporter"; "perhaps we can start having a group
of templates of open autonomy which are just in supercode IR, that allows people to compile into any system"; "also I
already said we should be doing general IR not hermes"; "do we actually want to have a 'root profile'? What is that
for?".

**What exists** (this repository's `main` at 4365baf5; Supercode `main` at dacec23b):
- One kit, `hermes`, in `packages/kit-hermes`: `base/` and four skews, rendered by one engine (`src/kit.ts`) whose
  record is `.open-autonomy/kit.json`. The agent's content is `hermes/`, applied into a Hermes home by the start.
- ADR 0009: where `.open-autonomy/agent.json` picks another harness, the start runs Supercode's orchestrator on the same
  home. The board stays Hermes's, ticked inside the orchestrator.
- Supercode's orchestrator IR (`docs/architecture/orchestrator.md`): the home is the IR's wire form, a folder shaped
  like a Hermes home: the root is the `default` profile, `profiles/<name>/` the others, each with `config.yaml`,
  `AGENTS.md` and `cron/jobs.json`; a root `workflow.yaml` declares the board (Supercode ADR 0001, the board IR), run by
  `supercode-orchestrator workflow serve --root <home>`.
- RFC 0021's finding: Volter's manager board ran from a home rendered by nothing (its dispatcher started by hand, its
  root holding Hermes's stock persona).

## Decision

- **A second kit on the same engine.** `create-open-autonomy` renders two kits: `hermes` (its four skews, unchanged)
  and `ir`, whose first skew is `company` (RFC 0021 decision 3). A skew names its kit; the record says which
  (`"kit": "ir"`), and `check` and `upgrade` work for both, the ancestor rendered by the version that wrote it.
  *(One package rather than two is this record's choice: RFC 0021 moves the Hermes skews into the IR kit later, each
  proven by a round trip, so they share one engine and one release from the start.)*
- **The IR kit's base is the Hermes kit's base without its `hermes/` folder**: the valve, credentials, the container
  stack, the landing workflow, the reporter, the vendored SDK and the start. Its agent content is `home/`, the IR's
  native folder, kit-owned except the skills a project adds outside `home/skills/open-autonomy/`.
- **The `company` skew's home** (RFC 0021 decisions 4 and 5; RFC 0022):
  - the root is the organization's layer only: its instructions, default permissions, the valve's address and shared
    skills. No card is assigned to it and nobody runs as it;
  - named profiles, each its job: `manager` (its tick a job), `account-manager` (its digest a job; its owner instance a
    named profile until agents are their own layer), a `coder` parent with `coder-codex` and `coder-claude` children
    differing only in harness, `reviewer`, `auditor` (a job `every: 1h`, read-only, a model family apart from the
    manager's) and `box-maintainer` (the hourly pass a job; one main session across enrolled machines);
  - `workflow.yaml`, the board IR: one board for the organization, one review per arc started by the dispatcher, a
    review naming its reviewer profile, drafts blocked by a message.
- **The start runs the install's processes, and nothing else does.** The keeper is the kit package's
  (`create-open-autonomy`'s `keeper/start.ts`), which the project's `.open-autonomy/start.ts` imports from the installed
  package rather than carrying a copy; it starts, keeps and stops processes, and restarts the stack when
  `maintain.ts restart` asks (D138 step 8), never fetching main to decide that itself. Who moves an install: the
  deployer pass, `maintain.ts restart`, which the host schedules beside the start (SETUP.md, "Keep the install on main":
  a launchd or cron job every ten minutes, or a project's keep job). It requests the restart when main moved the stack's
  files or the kit landed, and enrolls each new revision. The kit ships the pass and the instruction to schedule it,
  not a daemon of its own. For a project whose agent content is `home/`, the start
  copies that folder into the home (in the workers' forms, as ADR 0009 does for `hermes/`), runs the orchestrator on
  it, and, where the home declares `workflow.yaml`, runs its board's dispatcher (`workflow serve`) as one of its
  services, stopped and restarted with the rest. That serve is the board's only dispatcher: the orchestrator runs no
  dispatch round (supercode D138 step 7), and a second round beside it is harmless. Chat-platform subscriptions are
  told by the agent mailbox (supercode D140). No lock is involved. *(Running the dispatcher from the start is this record's reading of
  RFC 0021's "started only through its own start".)*
- **The reporter publishes per project account** (RFC 0021 decision 10). In an organization (its config names
  `organization.projects`), the board is the timeline: every card, whoever works it; the cards ahead are the roadmap and
  the done ones the changelog, and no `ROADMAP.md` or `CHANGELOG.md` is read. A card's tags are its projects (a project's
  tag is its `tag`, e.g. `rh2`, else its account or repository name): it shows in every project it is tagged with, and a
  session publishes under the card it serves, in its primary project (its first tag); under the orchestrator a session is a worker's, found in its
  profile's own config home (`<profile>/claude-code`, `<profile>/codex`), and serves the card whose workspace it runs in.
  A project this install publishes for has its key in the
  install's own custody, `<secrets>/projects/<owner>/<repo>/agent.env`, served on its own valve port to its own reporter;
  a project without one, and a session serving no card, stay on the organization's page. *(The key's place is this
  record's choice: a project's own install keeps its key where the fleet reads it, and RFC 0021 decision 2 has the new
  install publish for a project only once that install is retired, so placing the key here is the takeover.)*

- **The install declares its mail agents, and the keeper does not** (Supercode ADR 0008; RFC 0020 decisions 3, 17,
  24 and 25; Volter's decision record D138 step 8: the keeper only starts and stops processes).
  `agent.json` names each agent with a mailbox under `agents`: the profile its main session runs, its program (`claude`
  or `codex`), its idle time and whether it is the owner's account manager. `.open-autonomy/enroll.ts`, run by the
  deployer pass once per revision the stack runs (below), reconciles existing mailbox metadata with
  `supercode agent declare <name> --folder <profile> --harness <program>`, and registers the checkout in this machine's
  workspace map. Enrollment and its retries carry no launch or main-role-selection intent: they preserve the
  mailbox's recorded main, Teams binding and the session's immutable ownership and lineage. The owner deliberately
  bootstraps a missing mailbox through the native `supercode agent declare <name> --open <program> --folder <profile>`
  door. A missing declaration refuses with that actionable command; a failed revision remains retryable without
  opening, resuming or replacing a main. An agent requesting `every_machine` (RFC 0022 decision 7) is read through
  each online machine's native agent-record door. An absent remote declaration is reported for deliberate opening
  on that machine; periodic enrollment opens no remote command or agent pane. Each machine's own enrollment
  reconciles its metadata. An agent with health alarms subscribes its retained mailbox address on online machines;
  `--health-only` reads declarations and reconciles those subscriptions without changing mailbox metadata or roles.
  These acts are Teams' and the machine daemon's to own (D137; D138 step 5), and enroll.ts goes when they do.
  The retained Volter-org keeper log read on 2026-11-16 (VO-3843) names the full-enrollment failure for revision
  `810eae66`: box-maintainer's main `01a14b9d-26b2-7672-93be-a02f5c3f055b` had an end the daemon had not read,
  so declaration refused a second writer; one pass also reports Teams server backoff for the other profiles.
  Failure left that revision unrecorded and repeated the template's unconditional `declare --open`. A later
  enrolled/running pair both read `bcb11f448716b12b01a424777caf05819197a072`; the log does not establish that full
  enrollment still fails. Retrying enrollment is reconciliation, never the owner's deliberate opening. An
  agent hears a Workplace Room's lines once the Workplace's join command brings it in (runhuman-2 ADR 0063: the
  organization's document for its standing Rooms, Project Rooms for a project's); the start runs no Room channel.
  *(This record's choice: the setup as the place agents are named.)*

- **The owner's usage statement** (RFC 0021 decisions 7 and 10). Every model call goes through the organization's key,
  so the spend is the organization's calls, each booked to the session that made it. `.open-autonomy/usage.ts`, a tool
  the owner runs, codes a call to a project when that project's reporter published its session (read through the
  project's key) and publishes the organization's "Usage" statement (ADR 0012) with the owner's steer key
  (`<secrets>/steer.env`): a line per project this install publishes for, and the organization's overhead (every call
  serving no card: the manager's tick, the account manager's digest, the auditor's round, the mail agents' own
  sessions) as its own line. *(The statement as the overhead line's surface is this record's choice, where
  the record places cost attribution on the owner's side.)*

## Consequences

- A `company` install starts with `agent.json` naming its harness, so it is never mistaken for a Hermes project.
- Hermes skews keep their own home shapes and lifecycle. The shared enrollment contract applies to every skew.
- Not in this record: Hermes's and OpenClaw's export of an IR home with its loss report, which is Supercode's
  (`supercode orchestration export`); and cost attributed to a card's primary project, which RFC 0021 places in a
  statement published from the owner's side, not in the reporter.
