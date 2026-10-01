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
    manager's) and `box-maintainer` (the hourly pass a job; one instance per machine);
  - `workflow.yaml`, the board IR: one board for the organization, one review per arc started by the dispatcher, a
    review naming its reviewer profile, drafts blocked by a message.
- **The start runs the whole install, and nothing else does.** For a project whose agent content is `home/`, the start
  copies that folder into the home (in the workers' forms, as ADR 0009 does for `hermes/`), runs the orchestrator on
  it, and, where the home declares `workflow.yaml`, runs its board's dispatcher (`workflow serve`) as one of its
  services, stopped and restarted with the rest. *(Running the dispatcher from the start is this record's reading of
  RFC 0021's "started only through its own start".)*
- **The reporter publishes per project account** (RFC 0021 decision 10). In an organization (its config names
  `organization.projects`), the board is the timeline: every card, whoever works it; the cards ahead are the roadmap and
  the done ones the changelog, and no `ROADMAP.md` or `CHANGELOG.md` is read. A card publishes under its primary project
  (its tenant), and a session under the card it serves. A project this install publishes for has its key in the
  install's own custody, `<secrets>/projects/<owner>/<repo>/agent.env`, served on its own valve port to its own reporter;
  a project without one, and a session serving no card, stay on the organization's page. *(The key's place is this
  record's choice: a project's own install keeps its key where the fleet reads it, and RFC 0021 decision 2 has the new
  install publish for a project only once that install is retired, so placing the key here is the takeover.)*

- **The start declares the install's mail agents** (Supercode ADR 0008; RFC 0020 decisions 3, 17, 24 and 25).
  `agent.json` names each agent with a mailbox under `agents`: the profile its main session runs, its program (`claude`
  or `codex`), its idle time and whether it is the owner's account manager. On every start, the start runs `supercode
  agent declare <name> --open <program>`, which opens the main session once in a pane on this machine (headful) and
  keeps it across starts. An agent with `channel.rh2` has its account Room carried to its mailbox by `supercode-orchestrator
  agent-channel`, a service of the start that restarts like the reporter, reaching RH2 with `<secrets>/rh2.env`. The
  Room is found by its key; where the organization declares its Rooms (its org document), the account Room is declared
  there, and the channel opens one only when given the principal to open it for. *(This record's choices: the setup as
  the place agents are named, and the org document as the account Room's home where one exists.)*

## Consequences

- A `company` install starts with `agent.json` naming its harness, so it is never mistaken for a Hermes project.
- The Hermes skews, their renders and their upgrades are byte for byte what they were.
- Not in this record: Hermes's and OpenClaw's export of an IR home with its loss report, which is Supercode's
  (`supercode orchestration export`); and cost attributed to a card's primary project, which RFC 0021 places in a
  statement published from the owner's side, not in the reporter.
