# ADR 0007: The kit's brain is authored once, in Supercode's orchestration IR, and rendered per harness

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its
first implementation; proposed until both occur.

Amends [ADR 0006](0006-the-kit-is-a-lineage.md) (what base holds; what `kit.json` records; fleets) and
[ADR 0001](0001-runtime-boundary.md) (which harness the runtime runs), each as stated under Consequences.
Supersedes neither.

## Context and sources

Source of authorization: the owner's coding conversation of September 23, 2026, in this repository (no
public permalink; the quotations record scope, not independent approval). The owner asked: "supercode has
a 'harness agnostic orchestrator' with an IR right? That can compile into either hermes or openclaw or our
own. Is that right? And if so, can we set the template with that IR and compile INTO the 3 types?" A
source audit was presented, and the owner directed this record: "yes proceed". Its constitution review
found the Out of scope sentence "The agent is stock Hermes" in conflict. The owner amended it ("yes
amend"; [#706](https://github.com/open-autonomy-org/open-autonomy/pull/706)) to: "The agent is a stock
harness (Hermes is the first), run by the project owner wherever they like; the kit renders its brain for
the harness the owner picks and never implements one."

What exists. Source audit, same day, with Supercode `main` at 4f05813f and this repository at 13a18c29.

**The IR.**
- Supercode's `docs/architecture/orchestrator.md` defines one typed value, `OrchestratorState`. It holds
  profiles, and each profile has:
  - a worker (any harness) and a persona (`AGENTS.md`)
  - channels, routes, access and expiry
  - cron jobs, webhook subscriptions, delivery obligations and bindings.
- Secrets are references in the model (§1 rule 3).
- The codecs are Rust (`crates/interchange/src/orchestration/codec/`):
  - Hermes, both ways (`SOUL.md` ↔ `AGENTS.md`, `config.yaml`, `cron/jobs.json`)
  - OpenClaw, both ways, pinned to `v2026.7.1-2`
  - Supercode's own folder, which its orchestrator loop (`sdk/orchestrator`) runs with any harness as the
    worker.
- Every codec states a fidelity tier (byte or semantic). Unmodelled fields ride as residue.

**The doors.**
- The harness serves six doors, `harness.v1.orchestration.{load,save,compile,decompile,import,export}`
  (`crates/harness/src/harness_service.rs:111-116`).
- `compile` reads a harness's home into a state (`OrchestrationCompileParams{from, home}`). What the owner
  called "compile INTO" a harness is `export`/`decompile`.
- The binary of `@volter-ai-dev/supercode` 0.4.36, already a dependency of every project's host package,
  contains all six door names. Whether it answers them has not been run.

**What is unreleased.** The orchestrator package (the loop and the adapters) is a private workspace package
with no npm release.

**What the IR does not model.**
- Skill content: a job names skills, but the skill files are the worker's.
- Loop features: "tools, memory provider, skill self-improvement … are the worker's" (§10).
- The board: "Kanban, peer sync, mobile nodes: not built" (§10).

**Secrets on export.** Supercode's README says a Hermes export inlines secret values ("inline in a Hermes
export because that is where Hermes reads them") and refuses a reference the vault cannot resolve. The
kit's `base/hermes/config.yaml` instead carries interpolations (`${OPEN_AUTONOMY_BASE_URL}`,
`${OPEN_AUTONOMY_KEY}`), which the running stack fills with the valve's address and a dummy key.

**What the kit's brain is today.**
- Each skew has a `SOUL.md`, skills under `hermes/skills/open-autonomy/` and a cron seed.
- Base has:
  - `hermes/config.yaml` and the treasurer profile
  - a Python model-provider plugin that routes the model through the valve
    (`hermes/plugins/model-providers/open-autonomy`)
  - a Python seed hook (`hermes/hooks/seed`).
- The skills' `SKILL.md` files call Hermes's CLI 15 times: `hermes kanban` 7 and `hermes cron` 8. All seven
  `kanban` calls and three of the `cron` calls are in self-build. The two board-free skews make five calls,
  all `hermes cron`: manage-project's pm ×3 and manage-organization's organization ×2.
- The host tools are Hermes-shaped: `start.ts` spawns `hermes gateway run`, and `maintain.ts` reads
  `hermes kanban`.
- The self-build skew runs on Hermes's kanban board and dispatcher. manage-project and
  manage-organization have no board and no dispatch (ADR 0006).

**Who would feel a change.** Nine repositories run the board-free skews on kit 3.1.0: the organization and
eight of its projects. The fleet definition in `~/.local/state/open-autonomy/fleets/volter/fleet.json`
lists them, and `volter-ai/volter`'s `ROADMAP.md` ("The organization runs itself") tracks them.

## Decision

- **One source, rendered per target.**
  - The brain of manage-project and manage-organization is authored once in the kit package, as an
    orchestration folder per skew: the IR's own serialization, holding the `AGENTS.md` persona,
    `config.yaml` with its worker and channels, `cron/jobs.json` and the treasurer profile. Its skills are
    files beside it.
  - `create` and `adopt` take `--target hermes|openclaw|orchestrator` (default `hermes`), and `kit.json`
    records it.
  - The kit renders a target by passing the source through the harness's `export` door. It lays the
    skills where that target reads them: `hermes/` for Hermes as today, the OpenClaw state layout for
    OpenClaw, and an `orchestrator/` folder in the project for the orchestrator. That last is never the
    project root, where the seeded repository `AGENTS.md` lives.
  - The kit never implements a codec. The compiler is Supercode's. Open Autonomy calls it and remains
    not a workflow compiler.
- **The rendered files carry interpolations, never values.** The render has no vault: at render time
  the key belongs to the valve, and nothing else holds one. Every credential in the source is a reference
  that a render must emit as the target's own interpolation. For `hermes` the files that carry them, the
  profiles' `config.yaml` (the default's and the treasurer's), are laid from base and never exported (see
  step (2)). For the other targets, if the
  `export` door can only inline a value or refuse, Supercode needs an export mode that
  emits interpolations. That mode is a precondition of step (1) below, and the kit never works around it.
- **self-build stays Hermes.** Its board and dispatcher have no IR noun. It renders as today and refuses
  any other target until the orchestrator has a board.
- **Skills speak verbs every target has.** The five `hermes cron` calls in the board-free skews are of two
  kinds (measured in step (1)).
  - Two check the schedule's health, one per skew (`hermes cron list`, `runs` and `incidents`, for missed
    scrums or cycles and delivery errors). They become Supercode's `jobs list` and `runs list`, which read
    the same records for every harness:
    - a failed fire is a fire whose status failed;
    - a missed run leaves no fire, and shows as a job whose uniform `next_run_at` is past;
    - a delivery error lives only in the harness's own record (the `source` that `jobs get` returns
      verbatim). No uniform field carries it, so it is a gap beside the notepad below.
    This applies to the `hermes` render too, so all targets share one skill text.
  - Three use the job's notepad (`hermes cron notepad <job> get|set …`). Two read the cursor and one
    writes coverage. The whole cursor discipline rests on the notepad, not only those three lines: the
    cursor advances in `pm/SKILL.md` and `organization/SKILL.md`, and both skews' `SOUL.md`/`README.md`
    name the notepad as runtime state. No Supercode verb and no IR noun holds per-job memory. Until a
    cross-harness home for the cursor exists (a Supercode job-notepad verb over every target's store, or
    the PM carrying its cursor in its own landed commits), these lines stay Hermes's, and the board-free
    skews render only for `hermes`. That home, and a uniform delivery error, are preconditions of any
    other target.
- **Metering is per worker harness, not per target.** A target that runs "any harness" as its worker
  (the orchestrator) needs the valve route for each worker harness it may run.
  - `create` refuses a worker harness that has no route through the valve.
  - The Codex-subscription path (ADR 0001: Hermes's native `openai-codex` provider) exists only for Hermes.
  - Every other target spends on the platform's model rail through the valve until a route for that
    harness is built.
- **What stays per target is small and named.** Each target has:
  - a model stub per worker harness
  - a start adapter
  - a maintain adapter.
  The valve, the reporter, the SDK and the landing workflow stay one copy in base.
- **Upgrades keep their shape.** The three-way merge (ADR 0006, kit 3.1.0) runs on rendered files, and
  the ancestor is the recorded version rendered for the recorded target.
- **Order of proof**, each step a hand-run walk. A step that fails stops the ones after it.
  1. **Fact-finders.** Measured on 2026-09-23 with the published `@volter-ai-dev/supercode` 0.4.36, on a
     scratch manage-project render (never committed): `import` from its Hermes home, then `export` back
     to Hermes, then a file-by-file comparison.
     - **Answered, yes:** the published harness answers `import` and `export`. The `${…}` interpolations in
       both profiles' configs come back as literal strings and the vault stays empty, so no
       interpolation-emitting export mode is needed. Both personas return byte-identical. Both configs are
       re-encoded, confirming step (2)'s placement.
     - **Answered, with a correction:** the codec accepts only Hermes's runtime job shape. It refused the
       kit's seed, first for a missing `id` and then for the string schedule `"every 24h"` ("expected an
       object"). See the jobs placement in step (2).
     - **Answered, partly:** the published CLI's `jobs list` reads a Hermes home's jobs, and `runs list`
       reads fires. It has no `incidents` verb and no job notepad. Its uniform job row carries
       `next_run_at` and `last_status` but no delivery error. See "Skills speak verbs every target has".
     - **Open:** whether the reporter reads the orchestrator's sessions through the same Supercode
       discovery it uses for Hermes. This needs the orchestrator running a worker, so it is measured
       with step (3).
     - **Open, and held:** releasing the orchestrator package. No target but `hermes` can run the
       board-free skews until the job-notepad verb exists, so releasing it now would publish a runtime
       nothing can use.
  2. **The `hermes` render matches today except for the named lines.** From the IR source, it must differ
     from kit 3.1.0's render only in the two skill lines that move to Supercode verbs. Four things the
     kit controls keep the rest identical:
     - The source's jobs are in the IR's (Hermes's runtime) shape: an `id` and a parsed schedule. The
       kit's `hermes/cron/jobs.seed.json` is the kit's own format, which the seed hook turns into runtime
       jobs through Hermes. So the kit writes the seed from the source's jobs: each entry's name, prompt,
       schedule display and skills. It does not lay the exported `cron/jobs.json`.
     - The source for a Hermes render declares no worker, so the codec adds no `worker`, `expiry` or `home`
       key to `config.yaml`.
     - Each profile's persona source (the skew's `SOUL.md` and the treasurer's) is that `SOUL.md` text
       verbatim, so the `AGENTS.md` → `SOUL.md` rename returns the same bytes.
     - No profile's `config.yaml` is taken from the export. The codec re-encodes a config it did not read
       from a Hermes home, dropping comments. For the `hermes` target the kit lays every profile's config
       from base as it does today: `hermes/config.yaml` and `hermes/profiles/treasurer/config.yaml`, both
       seeded once and the project's own (ADR 0006). Their `${…}` interpolations
       (`OPEN_AUTONOMY_BASE_URL`, `OPEN_AUTONOMY_KEY`, `OPEN_AUTONOMY_PAY_URL`) never pass through the
       export.
     Any other difference fails this step and is fixed at its cause, in the kit's placement or in
     Supercode's codec; the bar is never widened to admit it. The comparison is a manual diff that is never
     committed. For each of the nine repositories, the upgrade is an ordinary three-way merge of those
     two lines.
  3. **manage-project on the `orchestrator` target**, once the cursor's cross-harness home and a uniform
     delivery error exist (see "Skills speak verbs every target has"), with one profile and one cron, runs its daily scrum
     in a World. It publishes through the reporter, and a settled spend appears on the project's ledger.
  4. **`openclaw` last.**

## What this record extrapolates beyond the owner's words

The owner asked whether the template can be written in the IR and compiled into three targets, directed
this record, and amended the constitution to let the kit render for the harness the owner picks.
Everything in the Decision beyond that is this author's design:
- the split of self-build (Hermes-only) from the two board-free skews
- the `--target` flag, its default and the output locations
- interpolation-only renders
- rewriting skills onto Supercode verbs
- per-worker metering stubs
- laying both profiles' configs from base for `hermes`
- writing `jobs.seed.json` from the source's jobs instead of laying the exported file
- reading a missed run from the uniform `next_run_at`
- the two candidate homes for the cursor (a Supercode job-notepad verb, or the PM carrying its cursor in
  its own landed commits)
- the order of proof.

Step (1) was measured as recorded there. What remains unverified: its two open items (reporter discovery,
the package release) and the preconditions it produced (the cursor's cross-harness home, a uniform delivery
error).

## Alternatives and tradeoffs

- **Stay Hermes-only.** Nothing to build, and the amended constitution still allows it. It leaves the kit
  unable to render for the harness the owner picks.
- **A second kit per harness**, in the sense of the constitution's opening "the Hermes kit is the first".
  Rejected: every skill and every upgrade would be kept twice. The amended Out of scope has one kit render
  for the chosen harness.
- **Keep Hermes's own CLI in the `hermes` render and Supercode verbs elsewhere**, making a byte-identical
  `hermes` render possible. Rejected: two skill texts per skew is the drift this record removes. Five lines
  change once instead.
- **Compile at run time instead of at render time.** Rejected: a generated repository is self-contained
  (ADR 0006), and every project would depend on the orchestrator to start.
- **Extend the IR to model skills and the board first.** Not now. That is Supercode's roadmap, so this
  record takes the IR as it is and leaves self-build out.

## Consequences

- **ADR 0006, amended:**
  - The model-provider plugin leaves base and becomes a per-target, per-worker stub.
  - The treasurer profile moves into the IR source.
  - `kit.json` gains `target`, and a record without one is `hermes`.
  - The `kit` field keeps its value `hermes` as the lineage's name. This record does not rename it, and
    renaming it is a separate decision, since every existing record carries it.
  - A fleet stays one Hermes gateway: a fleet's projects share one target, `hermes`, until a target's own
    multiplexing is proven.
- **ADR 0001, amended in both of its modes:**
  - For `hermes`, bare and container, it stands unchanged.
  - For any other target, its "Hermes remains the native scheduler and coordinator" and "the reporter
    reads native Hermes" do not hold.
  - That target runs, bare or in a container, only after an ADR 0001 amendment names its scheduler, its
    executor image and its reporter's source.
- **Render-time dependency.** The kit's render depends on the published Supercode harness, a package the
  host package already carries.
- **No change on the platform.** Nothing changes on the platform, the wire or metering, and the platform
  reads no target.

## Constitution review (by the author; the independent review follows on the pull request)

- **Every spend is metered on public books; the ledger's settled cents are the only cost.** Compatible
  only through per-worker valve stubs: `create` refuses a worker harness without one, and step (3) must
  show a settled spend on the ledger.
- **Only the SDK is real; the platform shows, does not steer.** Compatible. The reporter publishes
  through the SDK whatever the harness, and the platform reads no target. Step (1) checks that the
  reporter can read the orchestrator's sessions.
- **Authority comes from the repository.** Compatible. Bounds stay in `.open-autonomy/config.yaml`.
- **Nothing in an agent's reach is a secret that matters.** Compatible only if renders carry
  interpolations and never a value, which the Decision requires and step (1) verifies. No credential value
  lands in the committed tree under any target (the `orchestrator` target adds its `orchestrator/` folder,
  whose files carry references only).
- **No automated tests; nothing develops against a real API.** Compatible. Each proof step is a hand-run
  walk in a World, and the step (2) diff is a manual comparison that is never committed.
- **Out of scope (as amended in #706).** Compatible:
  - "The agent is a stock harness … the kit renders its brain for the harness the owner picks and never
    implements one": the kit renders and implements no harness.
  - "Not … a workflow compiler": the compiler is Supercode's, called as a door.
  - The opening paragraph's "the Hermes kit is the first" reads as the kit's name and first harness,
    consistent with keeping `kit: hermes` until a rename decision.
