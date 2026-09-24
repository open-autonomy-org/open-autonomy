# ADR 0009: A project may pick another harness; Supercode's orchestrator runs it on the same Hermes home

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its
first implementation; proposed until both occur.

Amends [ADR 0007](0007-the-kit-ships-an-agent-setup.md) (its "Targets": `hermes` was the only target, and
offering the orchestrator waited on this record) and [ADR 0001](0001-runtime-boundary.md) (Hermes as the
native scheduler and coordinator), each as stated under Consequences. Supersedes neither.

## Context and sources

**Authorization.** The owner's coding conversations of September 23 and 24, 2026, in this repository (no
public permalink; the quotations record scope, not independent approval).
- September 23: "most of MY projects switch to supercode - for other people they probably are more
  comfortable with hermes"; the constitution as amended in
  [#706](https://github.com/open-autonomy-org/open-autonomy/pull/706): "the kit renders its brain for the
  harness the owner picks and never implements one."
- September 24: "I thought we were transfering the volter fleet to our orchestrator"; "okay let's get ready
  to do that - first test it with hookline and the company repo. See how it goes"; "only thing we don't do
  right now is start the whole fleet".
- On the home: "we should be identical to hermes if possible - ideally supercode orchestrator LOOKS identical
  to hermes if you were to look at it in the repo. Basically let supercode orchestrator have full compat with
  hermes"; "perhaps we should just support ALSO soul md? that way we produce agents claude AND soul md and
  they just all symlink? for transcripts we can just mirror them right? That way we can basically open our
  thing in hermes and vice versa"; "where ever it's an agent idiomatic version of something, use BOTH the
  idiomatic and hermes version (have the hermes version shadow the idiomatic)"; "let's complete everything".

**Supercode today** (v0.4.63, `@volter-ai-dev/supercode-orchestrator` 0.3.0). The orchestrator's home is a
complete Hermes home ([Supercode's work order](https://github.com/volter-ai/supercode/blob/main/docs/plans/hermes-compat.md),
rows 1–14 done):
- it holds Hermes's gateway lock and each bot token's lock, so Hermes and the orchestrator never serve one
  home at once;
- the persona and skills exist in both forms: `AGENTS.md` is the source and `SOUL.md` links to it; skills
  sit under `.agents/skills/`, with Hermes reading them through `skills.external_dirs`;
- the worker's model and endpoint come from the home's `model:`, and its tools are Hermes's own;
- each worker turn is mirrored into `state.db` through Hermes's `SessionDB`, and a conversation Hermes
  continued goes on in the worker;
- the board is Hermes's, dispatched by Hermes's own tick, which spawns the orchestrator's worker command
  through `HERMES_BIN`;
- the worker names its session on every model call (Codex `session-id`, Claude Code
  `x-claude-code-session-id`), and the platform books the call to it (#726).

## Decision

- **The pick.** `.open-autonomy/agent.json` names the harness the owner picks at its top level: `"harness":
  "codex"` (or `claude-code`). Absent, it is `hermes`, and nothing changes for that project. The package is
  otherwise unchanged: the same `inference`, `jobs` and `extensions.hermes`, applied through Hermes's own
  door into the same home.
- **The runtime.** For another harness, the kit's start runs Supercode's orchestrator
  (`supercode-orchestrator --root <home>`, on Node) where it ran `hermes gateway run`, on the same home. The
  applier adds `worker.harness` to each profile's `config.yaml`: this is the orchestrator's key, and Hermes
  keeps it.
- **The content.** Before any Hermes call, the start renders the persona and skills of `hermes/` in the
  workers' forms (`AGENTS.md`, with `SOUL.md` a link to it; `.agents/skills/<name>/`). It leaves `SOUL.md`
  and `skills/` out of the copy, and removes the home's own copies of the skills it renders.
- **The scheduler (ADR 0001).** For such a project, the orchestrator is the scheduler and coordinator. It
  runs the home's jobs from Hermes's `cron/jobs.json` and its conversations from Hermes's
  `platforms`/`.env`. The board stays Hermes's, dispatched by Hermes's own tick inside the orchestrator.
- **The image.** Bare mode only. The container executor and the fleet run Hermes, and they refuse a project
  that picks another harness, by name; that project starts on its own with `start.ts`.
- **The reporter.** Unchanged in what it reads: native Hermes through Supercode's SDK. The workers'
  sessions are mirrored into `state.db`, a mirrored fire keeps its job, and the board is Hermes's. The
  owner's pause and resume reach the running orchestrator's operator door, where a write to `jobs.json`
  would be lost.
- **The restart.** When main moves, the start asks the orchestrator to stop (SIGTERM). The orchestrator
  records each conversation's session to resume, and the stack restarts onto main, as it does after
  Hermes's drain.

## What this record extrapolates beyond the owner's words

The owner directed the move to the orchestrator, the pilot with Hookline and Volter's company repository,
and the home's full compatibility with Hermes. The following are this author's design, marked so:
- the key's name and place: `harness`, at the top of `agent.json`, one for all of a project's profiles;
- bare mode only, and refusal in the container and the fleet;
- the orchestrator's stop taken as a drain for the restart;
- the reporter reaching the orchestrator's operator door for pause and resume;
- rendering the workers' forms in the kit's start, before the applier.

What has run, and where the evidence stops. The following ran as bounded hand walks on scratch homes, with
the pinned Hermes's own functions, and not yet in a World:
- the dispatch tick spawned the worker command with Hermes's own argv, environment and workspace;
- the board tools through the door completed a task, as `hermes kanban show` reads it;
- the mirror and the Hermes handoff;
- Hermes's own tools on the door;
- the zone rule.

The kit's start with a picked harness has not run: its first run is proof step 2.

## Order of proof

Each step is a hand-run walk; a step that fails stops the ones after it.
1. The Supercode release (v0.4.63: the binary, `supercode-orchestrator` 0.3.0, the SDK 0.3.35), pinned by the
   host package.
2. Volter's company repository in a World, picking `codex`: the start renders the home, the orchestrator
   holds its lock, the daily job fires on the worker through the valve, the transcript opens under
   `hermes sessions`, and the reporter publishes it.
3. Hookline in a World, picking `codex`: a board task is dispatched, run, handed to review and merged.
4. The two projects on the orchestrator, bare, when the owner starts them; the rest of the fleet stays on
   Hermes.

## Alternatives and tradeoffs

- **A separate orchestrator folder beside the Hermes home.** Two homes, one for each runtime, would make
  "open it in Hermes and vice versa" a migration each time. The owner asked for one home.
- **Pick the harness per profile.** More than the pilot needs. A per-profile key can extend this record
  later.
- **Run the orchestrator in the container executor.** Its image, token scoping and supervision are not yet
  designed. The pilot runs bare, as Hookline does today.

## Consequences

- **ADR 0007, amended:** `hermes` is the default target, and a project may pick another harness (`harness`
  in `agent.json`), which the orchestrator runs on the same home. The applier and the package are unchanged.
- **ADR 0001, amended:** for a project that picks another harness, Supercode's orchestrator, not Hermes,
  is the native scheduler and coordinator, bare only; the valve, the reporter and the credential boundary
  are unchanged.
- **Nothing changes for a project that does not pick.** The kit's start, fleet and container behave as
  before.

## Constitution review (by the author; the independent review follows on the pull request)

- **Every spend is metered on public books.** Compatible. The worker's model route is the home's `model:`,
  through the valve by custody name. Each call carries the worker's own session header, which the platform
  books from its next deploy (#726). A provider the orchestrator cannot route (`openai-codex`) is refused by
  name at launch, never run on a default.
- **Only the SDK is real; the platform shows, does not steer.** Compatible: the reporter still reads through
  Supercode's SDK and publishes through Open Autonomy's; no platform-side runtime controller is added.
- **Authority comes from the repository.** Compatible: the pick is one committed key, and the content and
  setup render from `hermes/` and `agent.json` as before.
- **Nothing in an agent's reach is a secret that matters.** Compatible. The worker's environment carries
  the valve's stand-in, and each profile's Codex home holds no login. Bare mode's credential boundary is ADR
  0001's, unchanged.
- **No automated tests; nothing develops against a real API.** Compatible: each proof step is a hand-run
  walk in a World.
- **Out of scope.** Compatible: the kit implements no harness; Supercode's orchestrator runs stock Codex or
  Claude Code, and the kit only picks it.
