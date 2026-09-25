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

**Supercode today** (v0.4.66, `@volter-ai-dev/supercode-orchestrator` 0.3.1). The orchestrator's home is a
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
  "claude-code"` on Open Autonomy's model rail, or `"codex"` on the owner's ChatGPT subscription
  (`provider: openai-codex`, through the valve's Codex forward: the worker holds no login). Absent, it is `hermes`,
  and nothing changes for that project. The package is
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
- **The image.** The container executor runs the picked harness too (amended below). The fleet runs one Hermes
  gateway for every project and refuses a project that picks another harness, by name.
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

The pilot of Volter's company repository ran next: bare, from a local mirror of its repository, with its
own platform key on the test platform (`autonomy.voltertest.xyz`).
- **Works.** The kit's start rendered the home and applied the setup with `worker.harness`. The orchestrator
  held the home, its daily job fired through the live operator door, and Claude Code ran it on
  `zai/glm-5.3-flash` through the valve and the platform. Hermes's approval rule judged each shell command.
  The reporter published both fires as `cycle` sessions, from the mirrors.
- **Found and fixed** in Supercode v0.4.66:
  - a job's second fire failed every save (two routing entries for one session key);
  - a denial reached the worker as "denied in the channel", and the model retried variants 120 times; it now
    gets Hermes's own words;
  - `agent.max_turns` did not cap Claude Code.
- **Measured.** Codex cannot use Open Autonomy's rail:
  - the gateway answers `/v1/responses` in its own stream, not OpenAI's;
  - Codex's MCP tools go as a `namespace` tool, which the model refuses.
- **Measured, and the owner's to decide.** The platform settles an Anthropic-wire call (Claude Code's) from
  its reservation table, because the gateway reports no cost on that wire (Merge documents it: the Anthropic
  surface's usage "carries no `cost` field"). For `zai/glm-5.3-flash` the table's $0.50 per million input
  tokens is 33.3 times the gateway's $0.015, and a cached token, which the gateway charges $0.003, is billed
  at the same $0.50, 166.7 times more:
  - one call on Hookline's key (11 new, 4,416 cached, 3 output tokens) was booked 0.22135¢; the gateway charged
    0.0013563¢ for the same tokens on the chat wire (0.0066555¢ uncached);
  - the pilot's two fires: $4.74 of the company's $10 on the test platform, where its daily cap stopped them.

  Until the platform settles that wire at a real cost, a Claude Code worker on this rail is booked far above
  Hermes on the same model. The books are overstated, not understated: the hard stop holds.

Hookline's pilot then ran the board on production (`open-autonomy.org`), bare, from a local mirror, with its
platform key only (its two jobs paused through the live door):
- Hermes's own dispatch tick claimed a board task and spawned the orchestrator's worker command.
- Claude Code called `kanban_complete` with the summary the task asked for, and the task was done on its
  first run in 9 seconds.
- The worker exited, and its run was mirrored into `state.db` tagged `kanban`.
- The platform booked each of the run's three calls to that same session id, from Claude Code's own session
  header: 5.4¢ at the table rate.

Open Autonomy's own agent then ran the same way on its `openai-codex` route (orchestrator 0.3.2, 0.3.3 for MCP trust): a board
task was done by a Codex worker on the owner's ChatGPT subscription, through the valve's Codex forward, with
a Codex home that holds no login. Its first two runs showed one more thing to carry over: Codex's app-server
rejects an MCP call nobody approves. Hermes gates an MCP tool only on a server configured `trust:
untrusted` (unset is full trust), so the Codex home approves the orchestrator's door and the profile's
full-trust servers, a relayed call to an untrusted server's tool is asked in a conversation and denied with
nobody present (orchestrator 0.3.3), and a shell command still goes to Hermes's rule.

Not yet run: a scheduled fire that completes successfully (the company's key is at its daily cap, and the
owner's pause holds Hookline's and Open Autonomy's jobs, which the reporter applied through the orchestrator's
door within seconds: that path is proven).

## Order of proof

Each step is a hand-run walk; a step that fails stops the ones after it.
1. The Supercode release (v0.4.66: the binary, `supercode-orchestrator` 0.3.1, the SDK 0.3.35), pinned by the
   host package.
2. Volter's company repository in a World, picking `claude-code`: the start renders the home, the orchestrator
   holds its lock, the daily job fires on the worker through the valve, the transcript opens under
   `hermes sessions`, and the reporter publishes it.
3. Hookline in a World, picking `claude-code`: a board task is dispatched, run, handed to review and merged.
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
  is the native scheduler and coordinator, bare or in the container executor (amended below); the valve, the
  reporter and the credential boundary are unchanged.
- **A project that does not pick keeps Hermes**, with two changes that reach it too. Every project moves to
  the new host pins, including the applier its Hermes start already uses (the orchestrator package, 0.2.2 to
  0.3.1); no Hermes-mode start on the new pins is recorded yet. And the start now treats a runtime that exits
  0 after it asked for a restart as a drain (it restarts onto main, exit 75), where a Hermes gateway's exit 0
  used to end the stack with 1.

## Constitution review (by the author; the independent review follows on the pull request)

- **Every spend is metered on public books.** Compatible, with a known overstatement. The worker's model
  route is the home's `model:`, through the valve by custody name. Each call carries the worker's own
  session header, which the platform books (#726). A provider the orchestrator cannot route is refused by
  name at launch, never run on a default. `openai-codex` is the owner's own subscription through the valve's
  Codex forward, which spends no project funds (ADR 0001). Claude Code's Anthropic-wire calls were settled
  from the reservation table (measured above); #731 settles them at the gateway's own per-token prices from
  its next deploy. The ledger stays authoritative, and the hard stop holds.
- **Only the SDK is real; the platform shows, does not steer.** Compatible: the reporter still reads through
  Supercode's SDK and publishes through Open Autonomy's; no platform-side runtime controller is added.
- **Authority comes from the repository.** Compatible: the pick is one committed key, and the content and
  setup render from `hermes/` and `agent.json` as before.
- **Nothing in an agent's reach is a secret that matters.** Compatible. The worker's environment carries
  the valve's stand-in, and each profile's Codex home holds no login. Bare mode's credential boundary is ADR
  0001's, unchanged.
- **The ledger's settled cents are the only cost; nothing is estimated.** Not met on the Anthropic wire at
  this record's writing: there the ledger settles from the reservation table, an estimate (measured above).
  The fix is the platform's own (a separate change settling that wire at the gateway's per-token prices),
  and shipping it is the owner's, as every money change is.
- **No automated tests; nothing develops against a real API.** In tension, and said so. No automated tests
  were run or added. But the two pilots ran on real APIs, not in a World: the company repository's on the
  test platform, Hookline's on production, both on the owner's direction ("first test it with hookline and
  the company repo"), each bounded (the company's by its daily cap, Hookline's to one board task). They
  are operations of the owner's own projects, not development against a real API. The World walks this
  record's proof calls for (steps 2 and 3) have not run.
- **Out of scope.** Compatible: the kit implements no harness; Supercode's orchestrator runs stock Codex or
  Claude Code, and the kit only picks it.

## Amendment: another harness in the container executor

**Authorization.** The owner's coding conversation of September 24, 2026. On where the agents run: "I thought they
were all supposed to run in the same container as a fleet - that was a part of the design right"; on the order of
work, "we can just focus on getting things working with codex first"; on the recommendation that follows, "do it";
and on its bounds, "don't start up the whole fleet though - we don't want to spend all those tokens right now".

**Decision.** Container mode runs a project that picks another harness: the kit's start runs Supercode's
orchestrator inside the executor, where it ran `hermes gateway run`, with the picked harness as each profile's
worker, the home on the executor's volume. For Codex the model goes through the host valve's Codex forward
(`host.docker.internal`), as for Hermes on `openai-codex`: the executor holds no login. The start renders the
persona and skills in the workers' forms inside the executor with the kit's own `renderContainerWorkerForms`. The
image carries Hermes and a pinned Codex CLI, so container mode takes `hermes` or `codex` and refuses any other
harness by name. The fleet is
unchanged.

Codex's own sandbox cannot run in the executor, and it was also a gate: Codex asked before escaping it and the
orchestrator answered with Hermes's approval rule. Codex 0.156.1 takes no policy that asks before every command from
its config: with `approval_policy = "untrusted"` in `config.toml` its app server refuses to start ("no longer
supported", measured). The per-command gate is one layer up: the app server's `thread/start` accepts
`approvalPolicy: "untrusted"` with full access and then asks before each command
(`item/commandExecution/requestApproval`). Supercode passes it from harness SDK 0.3.41 and CLI 0.4.80
(`approval_policy` on a runtime's start and resume), and orchestrator 0.4.1 starts a Codex worker with it wherever the
profile keeps Hermes's approvals (`approvals.mode` unset or not `off`). So the sandbox is off in every profile's Codex
home in the executor, and a profile that keeps approvals, the treasurer that pays among them, is asked before every
command, each answered by Hermes's rule. Measured on CLI 0.4.80 with a Codex home at full access: without the
policy a command ran unasked; with it, Codex asked, a `decline` ended the command `declined`, and it did not run.

**Measured** (Hookline, on its production platform key, its bare agent stopped for the run so one agent served
the project; the image built from this kit on the pinned Hermes, Colima, orchestrator 0.3.12 then 0.3.13):
- The orchestrator ran in the executor as `hermes`, Discord connected, both jobs loaded, the workers' forms
  rendered; a PM fire started `codex app-server` in the executor on `gpt-5.6-sol` through the valve's forward.
- With Codex's sandbox on, every command failed ("sandbox namespaces are unavailable") and the run still ended
  `succeeded` having done nothing. With `sandbox_mode = "danger-full-access"` in the profile's Codex home the
  same fire made 18 tool calls: it read the board, main and GitHub through the App valve, and advanced its
  checkpoints.
- Hermes's image puts a privilege-dropping shim ahead of its Python launcher; the orchestrator read only the
  first and found no Hermes, so the board went undispatched and sessions unmirrored. Orchestrator 0.3.13 walks
  every `hermes` on PATH; with it the board dispatches in the executor.

Where this ran, plainly: on Hookline's production platform key, its Discord and its GitHub, not in a World. That is
in tension with the constitution's "nothing here develops against a real API" and with verifying in the World; it
follows the owner's direction to pilot on Hookline ("first test it with hookline and the company repo") and was
bounded to one project and two PM fires. The start ran as written (`start.ts --container` with this kit's
`container.ts`); the runtime around it was prepared by hand, not by `create-open-autonomy runtime`: the image
built with `docker build`, the executor started with the kit's `executor.ts`, the first clone made through the
GitHub valve as SETUP.md describes, and the bare agent's home state copied onto the home volume.

**Not yet run:** a World run of any of this; a mirrored session published by the reporter from the executor; a
board task end to end there; a gated profile's run in the executor. Also open: nothing restarts a container
runtime onto a moved main or a landed kit (the bare start polls main; container mode has no counterpart, for
Hermes as for the orchestrator).

**This author's extrapolation, not the owner's words:** turning Codex's sandbox off in the executor rather than
granting the executor the namespaces, and keeping it where approvals are on; refusing every harness but Hermes and
Codex in the executor; a stop asked for a restart counted as the drain (exit 75), as the bare start counts it;
rendering the workers' forms with the image's copy of the kit.

