# ADR 0030: Native setup maps the worker fields, memory switch and harness login that existing homes declare

Status: Proposed, 2026-10-17. Amends the "Native setup mapping and preflight" table of
[ADR 0026](0026-selected-native-runtime-adapters.md); every other part of ADR 0026 stands.

## Context and evidence

A company install made by kit 3.20 (the native path of [ADR 0017](0017-the-ir-native-kit.md)) declares, under
`extensions.hermes.config`, settings that kit 3.20's orchestrator setup door wrote to the native profile:
`worker.cwd`, `worker.home`, `worker.surface`, `worker.reasoning_effort` (typed worker fields) and
`memory.memory_enabled` (config residue). Its Claude Code profiles run on the harness's own login as
[ADR 0009](0009-another-harness-on-the-same-home.md) (amended 2026-10-02) records it: `credential: "harness-login"`,
no endpoint, no provider. Kit 3.26's native setup (ADR 0026) accepts only `worker.harness`, `agent.max_turns` and
`approvals.mode`, and requires a Claude Code model to name provider custom or anthropic, so it refuses that home's
setup before any gateway starts. ADR 0026 recorded that "this candidate does not implement" `memory.memory_enabled`;
that statement was about orchestrator 0.5.47.

What the current native runtime reads (supercode source at 71510fdd6 and 3e8f68f7e, read, not run):

| Setting | Native field | Consumer |
| --- | --- | --- |
| `worker.cwd` | `WorkerSpec.cwd` (default `.`) | `activationCwd` and the board worker's folder |
| `worker.home` | `WorkerSpec.home`, `profile` or `user` | `activationEnv`/`userHomeArguments`; `user` only for Claude Code (`USER_HOME_HARNESSES`) |
| `worker.surface` | `WorkerSpec.surface`, `headless` or `pane` | board dispatch (`surface`) |
| `worker.reasoning_effort` | `WorkerSpec.reasoning_effort` | board dispatch, Codex lanes only (`model_reasoning_effort`) |
| `memory.memory_enabled` | `residue.config.memory.memory_enabled` (the profile's `config.yaml`) | `materializeAgentHome` copies it into the agent home; the memory snapshot and memory tool read it through Hermes's `load_config` |

The Claude Code route (`worker-route.mjs`): no provider runs the plain launch, which in the user's home
(`worker.home: user`) is that user's own login; provider anthropic with no endpoint is the user's login for a worker in
the profile's home (`ownLogin`), and is refused at launch for a worker in the user's home. The applier writes a
provider-less model as `model.provider: ''` (`hermesConfig`), which is what kit 3.20 wrote and its applier base records.

## Decision

The native declaration also supports these exact mappings, from `extensions.orchestrator.config` or, for existing
declarations, `extensions.hermes.config` (ADR 0026's duplicate and conflict rules unchanged):

| Declaration | Native model field |
| --- | --- |
| `worker.cwd` | `profile.worker.cwd`, a relative path inside the profile (no leading `/`, no `..` segment, as `decode_worker` reads it) |
| `worker.home` | `profile.worker.home`, `profile` or `user`; `user` refuses for a worker other than Claude Code |
| `worker.surface` | `profile.worker.surface`, `headless` or `pane` |
| `worker.reasoning_effort` | `profile.worker.reasoning_effort`, one lowercase word; refuses for a worker other than Codex |
| `memory.memory_enabled` | `profile.residue.config.memory.memory_enabled`, a boolean |

A worker field is applied only where this machine's supercode saves it. The harness service answers
`capabilities().orchestration.worker_fields` (supercode d9c92add1 and later); an older service, which omits the
answer, writes every typed field but `reasoning_effort` (its `encode_config` never wrote it, though `decode_worker`
reads it, so a save dropped it). A declared field the service does not save is withheld from the applier: never
written, never stamped as applied, and said in the start output ("worker.reasoning_effort xhigh is declared for
coder-codex; this machine's supercode does not save it yet, so it is not applied; update supercode"). The start does
not fail on it; under kit 3.20 it never took effect either. A typed worker field read back absent is its codec default (`.`, `profile`, `headless`), since the codec omits a default
on save. A missing worker is created as the profile's declared harness. The settings stay in the applier's existing
`setting.<key>` units, so a home's retained applier base carries over unchanged.

A Claude Code model with no provider, no endpoint, base URL or placeholder key, and `credential: harness-login` is the
anthropic route on the harness's own login, derived rather than required. Where the profile declares `worker.home:
user` the declaration goes to the applier unchanged (no provider, the user's own login in the user's home); otherwise
its models are given provider anthropic (the native own-login route in the profile's home). A kit 3.20 harness-login
Claude Code profile that declares no `worker.home` therefore moves from the `model.provider: ''` kit 3.20 wrote to
`anthropic`: its `inference.default` unit acts on the first start. That is a fix: with `''` in the profile's home the
worker's `CLAUDE_CONFIG_DIR` is the profile's own, where it is not logged in (`activationEnv`). Preflight refuses a Claude
Code worker in the user's home whose route is provider anthropic with no endpoint, since the native route would refuse
it at launch. A provider-less Claude Code model that names an endpoint still refuses: it names provider custom.

Unknown settings, malformed values and other routes still refuse before any native effect, as ADR 0026 decides.
A live worker the declaration does not govern and the runtime refuses at launch (a Codex worker with `worker.home:
user` left in its `config.yaml`) is named as a warning in the start output, not refused: the start did not fail on it
before, and it is not this declaration's to change.

The applier writes one unit at a time, `inference.default` before the settings, so a profile can briefly hold a route
and worker home its end state does not (provider anthropic before `worker.home` leaves `user`). No launch reads it in
between: the keeper applies the setup before it starts this start's gateway, board and channel processes, the
preflight checks the declared end state of every unit, and a start that stops between units fails before any of them,
the next start's plan completing the remaining units first.

## Alternatives and consequences

Having `upgrade` rewrite each home's settings was rejected: every setting has a native field the runtime reads, so a
rewrite would only move them, and removing the memory switch would turn a declared `false` into the runtime default.
Requiring `provider: anthropic` on harness-login models was rejected: for a worker in the user's home the native route
refuses that combination, and kit 3.20 never wrote it.

Kit templates may declare these settings again; this record does not change any template. Board-dispatched Codex
lanes get the reasoning effort; a Codex conversation launch does not read it in the current runtime. A setting the
current home holds but no longer declares stays as the applier's `still-live` row and is not changed here.

## Constitution compatibility for independent review

"Every spend is metered on public books" and "The ledger's settled cents are the only cost": no rail, route or spend
path is added; the harness-login route is ADR 0009's existing one, and an endpoint route still names its provider.
"Authority comes from the repository": the mapping applies only what the repository's `agent.json` declares and
refuses what it cannot apply. "Nothing in a public agent's reach is a secret that matters": no credential is read or
written. "Only the SDK is real" and "The platform shows; it does not steer": publication and the platform are
untouched. "No automated tests": evidence is source reading, typecheck and the install's manual start; no harness is
added. This status confers no approval; the independent review judges the record and its implementation together.
