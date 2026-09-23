# ADR 0007: The kit authors content and spec; the harness is reached through Supercode's doors

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its
first implementation; proposed until both occur.

Amends [ADR 0006](0006-the-kit-is-a-lineage.md) (what the board-free skews' brains carry; what `kit.json`
records) and [ADR 0001](0001-runtime-boundary.md) (which harness the runtime runs), each as stated under
Consequences. Supersedes neither.

## Context and sources

**Authorization.** The owner's coding conversation of September 23, 2026, in this repository (no public
permalink; the quotations record scope, not independent approval).
- The owner asked whether Supercode's harness-agnostic IR "can compile into either hermes or openclaw or our
  own", and "can we set the template with that IR and compile INTO the 3 types?", and directed this record
  ("yes proceed").
- Its constitution review found "The agent is stock Hermes" in conflict. The owner amended it ("yes amend";
  [#706](https://github.com/open-autonomy-org/open-autonomy/pull/706)): "The agent is a stock harness (Hermes
  is the first) … the kit renders its brain for the harness the owner picks and never implements one."
- The first probe of the IR showed it mixed what an author declares with what a harness observes. The owner
  then directed a step back ("what the IR should be - it is a universal representation right?"). The
  resulting split was accepted in Supercode as architecture ("keep going"):
  [content, spec, status](https://github.com/volter-ai/supercode/blob/main/docs/architecture/content-spec-status.md).
  An author writes content and spec; only a harness writes status, and operators and the agent write it
  through the harness's own verbs; `apply` is the one door from spec to status.

**What exists.** Source audit and measurements, same day; this repository at 13a18c29, Supercode `main` at
e4321d9d.

**Supercode's doors, each executed on Hermes 0.21.0 and independently reviewed.** Not in a published release
until the one after `v0.4.39`: 0.4.39 was cut before the second review's fixes.
- `supercode jobs apply --spec <file>`:
  - reconciles a declared, name-keyed job set through Hermes's own `cron create|edit|pause`;
  - creates what is missing and edits only declared fields that differ;
  - never deletes or resumes; reports drift, unnamed jobs and refusals;
  - matches only the addressed store (the root home or `--profile`);
  - converges on re-apply after Hermes's normalization.
- `jobs create|update` take `--skill`, `--workdir`, `--pin-model`, `--pin-provider`, `--repeat`.
- `supercode jobs notepad <id> [--key K] [--set=V|--delete]` reads a job's durable key-value notepad from
  Hermes's `cron/notepad.db`. It writes through `hermes cron notepad` and answers from the re-read store.
- The uniform job row (`jobs list|get`) carries `last_delivery_error` and `next_run_at`, so a missed run (a
  past `next_run_at`) and a failed delivery are readable without Hermes's CLI.
- `supercode model-route apply` sets Hermes's `model:` route through `hermes config set`. The key is written
  only as `${NAME}`.
- Each door refuses on a harness that does not answer it. Today OpenClaw and the orchestrator refuse the
  notepad and the model route.

**The kit today.**
- The board-free skews (manage-project, manage-organization) seed their jobs from `hermes/cron/jobs.seed.json`
  through the Python seed hook (`base/hermes/hooks/seed`). They use only `name`, `prompt`, `schedule` and
  `skills`. The hook also:
  - pins each job's model and provider to `config.yaml`'s route;
  - falls back to `local` delivery when a named platform has no credential;
  - seeds webhook routes, which no skew declares.
- Self-build's seeds add `monitor_script`, which `jobs apply` does not cover, and self-build runs on Hermes's
  board.
- The board-free skews' skills make five Hermes CLI calls:
  - two read the schedule's health (`hermes cron list`, `runs`, `incidents`);
  - three read or write the PM's cursor in the job's notepad.
- The Python model-provider plugin (`base/hermes/plugins/model-providers/open-autonomy`) is not a route. It
  names the active Hermes session on every model request (`build_extra_body` → `session_id`) so the
  platform attributes spend to sessions. The route itself is plain config.
- Both executor images install Supercode (`container/Dockerfile*`: `/opt/agent/.open-autonomy/node_modules/.bin/supercode`).

## Decision

- **Content and spec, nothing else.** The kit writes a project's content and its spec. The harness's state is
  status, reached only through Supercode's doors.
  - Content: the persona, skills, and harness plugins such as the session-attribution plugin, as files.
  - Spec: its declared jobs and model route.
- **The board-free skews declare their jobs as a spec.** manage-project and manage-organization ship
  `.open-autonomy/jobs.json`, a `jobs apply` spec with the same four fields, in place of their
  `jobs.seed.json`. `start.ts` applies it through `supercode jobs apply` before the gateway serves. Its report
  goes to the start log. The seed hook no longer creates their jobs.
- **Their skills speak Supercode's verbs.**
  - The two health lines use `supercode jobs list` and `runs list`. A failed fire is a failed status, a
    missed run is a past `next_run_at`, and a failed delivery is `last_delivery_error`.
  - The three cursor lines use `supercode jobs notepad`.
  - After this, nothing in these skews calls Hermes's CLI.
- **The model route stays declared where each harness reads it.** For Hermes that is `config.yaml`, laid from
  base as today (seeded once, the project's own). A target whose harness takes its route through
  `model-route apply` gets it declared there. Jobs carry no model pin: an unpinned Hermes job follows the
  configured model.
- **Targets follow Supercode.** `create`/`adopt` take `--target hermes` (the default and, for now, the only
  value), and `kit.json` records it. The kit offers another target only when Supercode's doors that these
  skews use (`jobs apply`, `jobs notepad`, `jobs list`/`runs list`, `model-route apply`) answer for that
  harness, measured, not assumed. The kit implements no harness and no codec. Supercode's orchestration
  export is not used: the doors replace it.
- **self-build keeps its seed hook and Hermes's CLI.** Its board and its monitor jobs have no door yet. It
  renders as today, only for `hermes`.
- **Order of proof.** Each step is a hand-run walk in a World, and a step that fails stops the ones after it.
  1. A Supercode release after 0.4.39, pinned by the host package, whose doors answer as recorded above.
  2. A disposable manage-project project on this change.
     - Its start applies the spec, and `jobs list` shows the `pm` job with its skills.
     - A scrum run reads and advances its cursor through `supercode jobs notepad`.
     - Nothing it runs calls `hermes cron`.
  3. `create-open-autonomy upgrade --fleet` takes the nine board-free repositories onto it.
     - Each keeps its live `pm`/`cycle` job: `apply` matches it by name, and the seed hook made it with the
       same fields.
     - Each keeps its cursor: the notepad is the same store.
  4. Another target, when Supercode's doors answer for it.

## What this record extrapolates beyond the owner's words

The owner asked whether the template can be written once and rendered for three harnesses, amended the
constitution to allow it, and accepted the content/spec/status split in Supercode. The following are this
author's design:
- Using Supercode's doors instead of its orchestration export.
- The spec file and `start.ts` applying it.
- Leaving self-build on its seed hook.
- Dropping the per-job model pin.
- The target flag's gating on measured doors.
- The order of proof.

Unverified:
- That an unpinned Hermes job follows `config.yaml`'s model. Hermes's `cron edit --model` help says an
  empty pin "follow[s] cron.model / config".
- That a skill running in the executor reaches Supercode's CLI with the same `HERMES_HOME`.
- That applying a spec over a job the seed hook made reports it `unchanged`: the seed hook wrote a pinned
  model and a workdir, which the spec does not declare and `apply` leaves alone.

## Alternatives and tradeoffs

- **Render through Supercode's orchestration export (this record's first draft).** Rejected on measurement:
  - the export reads and writes a harness's runtime shape, which refused the kit's declared jobs;
  - it has no notepad and no route;
  - it re-encodes configs and drops their comments.
  The doors reconcile declarations through each harness's own verbs instead.
- **Keep the seed hook for the board-free skews.** It works for Hermes only. The doors make the same
  reconcile harness-neutral, and the hook stays only where no door exists yet (self-build).
- **A second kit per harness.** Rejected: every skill and upgrade would be kept twice, and the amended
  constitution has one kit render for the harness the owner picks.

## Consequences

- **ADR 0006, amended:**
  - The board-free skews' job seeds become `jobs apply` specs.
  - Their skills lose Hermes's CLI.
  - `kit.json` gains `target` (`hermes` when absent), and the `kit` field keeps its value.
  - The seed hook, the model-provider plugin and the treasurer profile stay in base as Hermes content.
- **ADR 0001, amended:** unchanged for `hermes`, bare and container. Another target runs only after an ADR
  0001 amendment names its scheduler, its executor image and its reporter's source. That need not wait on
  the doors; it waits on that target being offered at all.
- **The host package's Supercode pin moves to the release in step (1).** Both executor images already
  install it.
- **Nothing changes on the platform, the wire or metering.** The platform reads no target, and every model
  call still goes through the valve.

## Constitution review (by the author; the independent review follows on the pull request)

- **Every spend is metered on public books; the ledger's settled cents are the only cost.** Compatible. The
  model route stays the valve's (`config.yaml` for Hermes, a `${NAME}` key reference through `model-route
  apply` elsewhere), and the session-attribution plugin stays.
- **Only the SDK is real; the platform shows, does not steer.** Compatible. The reporter still publishes
  through the SDK, and the platform reads no target.
- **Authority comes from the repository.** Compatible. The spec is a committed file, and bounds stay in
  `.open-autonomy/config.yaml`.
- **Nothing in an agent's reach is a secret that matters.** Compatible. The spec and the route carry no
  credential values; `model-route apply` refuses credentials in a URL and writes only `${NAME}`.
- **No automated tests; nothing develops against a real API.** Compatible. Each proof step is a hand-run walk
  in a World.
- **Out of scope (as amended in #706).** Compatible. The agent is a stock harness, and the kit declares
  content and spec and never implements a harness or a codec. Supercode's doors are its tools.
