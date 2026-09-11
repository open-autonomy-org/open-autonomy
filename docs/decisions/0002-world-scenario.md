# ADR 0002: Rehearsal is an ordinary World scenario

Status: Accepted upon independent constitution approval and merge of this record and implementation; proposed until both occur.

## Context and sources

The owner directed “make it happen” on September 11, 2026 after asking why rehearsal
cannot simply be a World scenario. The coding conversation has no public permalink.
The kit had acquired a second lifecycle manager and a story interpreter, copied into
every generated project, although World already manages services, resources, environment,
readiness and shutdown. A project should supply scenario content, as a program supplies
code to its execution environment, without implementing another environment manager.

## Decision

OA's `world/` owns its opening data, model handlers, vendor activity and manual operators.
The cookbook is the unmodified application under observation. Generated projects receive
World tooling but no OA rehearsal engine; they author their own scenarios beside their apps.

The World config declares the native agent as its last service. Its foreground command
seeds through vendor and platform APIs, then executes the ordinary kit start entrypoint.
World owns its process group, logs, resources, startup readiness and teardown. The config uses
`stripEnv: ["*"]` with explicit paths and a synthetic home; World excludes all inherited caller
variables while preserving its own injection. One native
Hermes schedule observation supplies the app-specific readiness criterion. All per-instance
homes, clones and synthetic keys live inside World data, so normal purge removes them.
The scenario renderer only resolves source paths and produces a file of model handlers.
Operators use ordinary World commands; there is no separate lifecycle verb set or story DSL.

Keep the explicit OA simulation of GitHub Actions: GitHub Twin stores PRs, reviews and checks
but does not execute workflow compute. This scenario service compiles the exact PR head and
reports its actual result through GitHub APIs. It does not replace native Hermes scheduling.

[ADR 0001](0001-runtime-boundary.md) remains in force: ordinary start.ts still owns the
application's valve, reporter and Hermes children, including its native upgrade restart.
This change adds no real-model mode or credential bypass. Rehearsal uses synthetic credentials.

## Alternatives and consequences

Publishing a shared rehearsal runner would preserve the unnecessary abstraction. Moving
OA's scheduler or story interpreter into World would couple generic infrastructure to one app.
Keep app-specific seed sequencing and manual actions as scenario code instead.

The JSONL interpreter and assertion stories are removed; manual usage is documented in the
World guide. No compatibility runner is kept. Kit upgrade retires only known engine source
files, respecting explicit divergences and leaving unrelated files and runtime state alone.
Preparation requires an existing dependency installation and pinned Hermes; boot does not
install tools, bypass the World's network configuration or kill unknown port holders.

## Constitution review

- **No automated tests:** remove persistent story assertions and verify manually in a World.
- **Nothing develops against a real API:** seed and operator mutations use the synthetic
  vendor doors; model judgment remains in file handlers. World owns network configuration.
- **Only the SDK is real / the platform shows:** preserve native Hermes and the existing
  SDK reporter. Add no board parser to the platform and no new scheduler.
- **Every spend is metered / settled cents:** preserve platform funding and metered rails.
- **Authority comes from the repository:** scenario configuration does not alter deployed
  policy or grant release authority. Independent review is required before acceptance.
- **Nothing in an agent's reach is a secret that matters:** scenario homes and credentials
  are synthetic. No real login acquisition or imported project credentials are introduced.

The independent reviewer must assess implementation, manual lifecycle evidence and preserved
scenario behavior against these clauses before approving the exact head.
