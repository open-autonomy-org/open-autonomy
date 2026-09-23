# ADR 0007: The kit's brain is authored once, in Supercode's orchestration IR, and rendered per harness

Status: Proposed. Blocked on an owner amendment to the constitution's "Out of scope" (see the
constitution review below); it cannot be accepted until that amendment lands, and then only upon
independent constitution review and merge of this record with its first implementation.

Refines [ADR 0006](0006-the-kit-is-a-lineage.md) (base plus skews, upgrades as merges); supersedes
nothing. Touches [ADR 0001](0001-runtime-boundary.md), whose container mode runs native Hermes.

## Context and sources

Source of authorization: the owner's coding conversation of September 23, 2026, in this repository (no
public permalink; the quotations record scope, not independent approval): "supercode has a 'harness
agnostic orchestrator' with an IR right? That can compile into either hermes or openclaw or our own. Is that
right? And if so, can we set the template with that IR and compile INTO the 3 types?" After a source audit
was presented, the owner directed this record: "yes proceed".

What exists (source audit, same day; Supercode `main` at 4f05813f, this repository at 7e2c689f):

- **The IR.** Supercode's `docs/architecture/orchestrator.md` defines one typed value,
  `OrchestratorState`: profiles, each with a worker (any harness), a persona (`AGENTS.md`), channels,
  routes, access, expiry, cron jobs, webhook subscriptions, delivery obligations and bindings. Secrets
  are references, never values. Its codecs are Rust (`crates/interchange/src/orchestration/codec/`):
  Hermes both ways (`SOUL.md` ↔ `AGENTS.md`, `config.yaml`, `cron/jobs.json`), OpenClaw both ways (pinned
  `v2026.7.1-2`), and Supercode's own folder, which its orchestrator loop (`sdk/orchestrator`) runs with
  any harness as the worker. Every codec states a fidelity tier (byte or semantic); unmodelled fields
  ride as residue. The harness serves them as `harness.v1.orchestration.{load,save,compile,import,export}`
  (`crates/harness/src/harness_service.rs:111-116`).
- **What the IR does not model.** Skill content (a job names skills; the files are the worker's),
  loop features ("tools, memory provider, skill self-improvement … are the worker's", §10), and the board
  ("Kanban, peer sync, mobile nodes: not built", §10).
- **What is published.** `@volter-ai-dev/supercode` 0.4.36, already a dependency of every project's host
  package (`.open-autonomy/package.json`), carries the `orchestration.load`, `compile` and `import` door
  names in its binary; `export` and `save` were not found as literal strings, so whether the published
  build answers them is unverified. The orchestrator package (the loop, the adapters) is a private
  workspace package with no npm release (its README says so).
- **What the kit's brain is today.** Per skew: `SOUL.md`, skills under `hermes/skills/open-autonomy/`, a
  cron seed; in base: `hermes/config.yaml`, the treasurer profile, a Python model-provider plugin that routes
  the model through the valve (`hermes/plugins/model-providers/open-autonomy`), a Python seed hook
  (`hermes/hooks/seed`). The skills call Hermes's own CLI 20 times (`hermes kanban` ten, `hermes cron`
  seven, `hermes plugins` three). The host tools are Hermes-shaped: `start.ts` runs `hermes gateway run`,
  `maintain.ts` reads `hermes kanban`. The self-build skew runs on Hermes's kanban board and dispatcher;
  manage-project and manage-organization have no board and no dispatch (ADR 0006).

## Decision

- **One source, three renders.** The brain of the manage-project and manage-organization skews is
  authored once as an orchestration folder (the IR's own serialization: `AGENTS.md` persona, `config.yaml`
  with its worker and channels, `cron/jobs.json`, the treasurer profile) with its skills as files beside
  it. `create`/`adopt` take `--target hermes|openclaw|orchestrator` (default `hermes`) and `kit.json`
  records it. The kit renders the target by exporting the source through the harness's
  `orchestration.export` door and laying the skills where that target reads them. The kit never
  re-implements a codec.
- **self-build stays Hermes.** Its board and dispatcher have no IR noun. It is rendered as today and
  refuses any other target until the orchestrator has a board.
- **Skills speak verbs every target has.** A skill's `hermes cron …` call becomes the Supercode verb that
  reads the same record for every harness (`jobs`, `runs`), mounted for the worker. A skill that still
  needs a harness-only verb names its target and is excluded from the others.
- **What stays per target is small and named.** Each target has a model-provider stub that sends the
  model through the valve (so every spend stays on the project's rail), a start adapter, and a maintain
  adapter. The valve, the reporter, the SDK and the landing workflow stay one copy in base.
- **Upgrades do not change shape.** The three-way merge (ADR 0006, kit 3.1.0) runs on rendered files. The
  ancestor is the recorded version rendered for the recorded target. A project on `hermes` sees
  the same files it has today.
- **Order of proof, each through the World, by hand.** (1) Fact-finders: the published harness answers
  `orchestration.export` and `save`; the orchestrator package is released. (2) The `hermes` render of
  manage-project from the IR source is byte-identical to kit 3.1.0's render, so the nine fleet
  repositories see a zero-file upgrade. (3) manage-project on the `orchestrator` target, one profile and
  one cron, runs its daily scrum in a World and publishes through the reporter. (4) `openclaw` last.
  A step that fails stops the ones after it.

## What this record extrapolates beyond the owner's words

The owner asked whether the template can be written in the IR and compiled into three targets, and
directed this record. Everything in the Decision beyond that is this author's design:
- the split of self-build (Hermes-only) from the two board-free skews
- the `--target` flag and its default
- rewriting skills onto Supercode verbs
- the per-target stubs
- the order of proof.

The claim that Supercode's `jobs`/`runs` verbs can replace the skills' `hermes cron` calls for a Hermes
worker is unverified. Whether the reporter reads OpenClaw's and the orchestrator's sessions through the
same Supercode discovery it uses for Hermes is also unverified. Both are fact-finders, not findings.

## Alternatives and tradeoffs

- **Stay Hermes-only (the status quo).** Nothing to build; the kit stays one harness. Chosen if the
  constitution amendment is declined.
- **Three hand-kept templates.** Rejected: three copies of every skill drift, and every upgrade triples.
- **Compile at run time instead of render time.** Rejected: a generated repository is self-contained
  today (ADR 0006); a runtime compile would make every project depend on the orchestrator to start.
- **Extend the IR to model skills and the board first.** Not now: that is Supercode's roadmap. This record
  takes the IR as it is and leaves self-build out.

## Consequences

- `kit.json` gains `target`. A record without one is `hermes`.
- The kit's render depends on the published Supercode harness, a dependency the host package already has,
  now also at render time.
- A non-Hermes target needs its own executor image. ADR 0001's container mode ("native Hermes inside the
  World executor") holds for `hermes`. Another target amends ADR 0001 before it runs in a container.
- Nothing changes on the platform, the wire or metering: the platform reads no target. The spend invariant
  holds only if every target's model stub goes through the valve, and step (3) must show a metered spend
  on the project's ledger.

## Constitution review (by the author; the independent review follows on the pull request)

- **Every spend is metered on public books; the ledger's settled cents are the only cost.** Compatible
  only if each target's model stub routes through the valve. Step (3) must show a settled spend on the
  ledger before a target is offered.
- **Only the SDK is real; the platform shows, does not steer.** Compatible. The reporter publishes
  through the SDK whatever the harness, and the platform reads no target. The invariant already says
  "Hermes and its board are one starter the kit makes, not a shape the platform knows."
- **Authority comes from the repository; nothing in reach is a secret that matters.** Compatible. Bounds
  stay in `.open-autonomy/config.yaml`, the IR carries secrets only as references, and the valve keeps
  the key out of the agent's reach.
- **No automated tests; nothing develops against a real API.** Compatible. Each step of the order of
  proof is a hand-run walk in a World. Supercode's own codec tests are Supercode's.
- **Out of scope: CONFLICT.** "Open Autonomy is not an agent framework, a workflow compiler or a hosting
  service. The agent is stock Hermes, run by the project owner wherever they like." An `openclaw` or
  `orchestrator` target makes the agent something other than stock Hermes. Rendering through a
  compiler also brushes against "not … a workflow compiler", though the compiler is Supercode's, not this
  repository's. An ADR cannot amend the constitution. This record is blocked until the owner decides.
  The author's proposed wording, for the owner to accept, change or decline: "The agent is a stock
  harness (Hermes is the first), run by the project owner wherever they like; the kit renders its brain
  for the harness the owner picks and never implements one." If declined, this record is Rejected and the
  kit stays Hermes-only.
