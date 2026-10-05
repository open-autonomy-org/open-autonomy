# ADR 0026: Setup, publication and owner control use the selected native runtime

Status: Accepted upon independent review and merge of the implementing PR; Proposed until those gates pass.
Independent architecture/constitution review, exact source review and scoped manual World evidence are required.
This record amends the Hermes-dependent setup and observation choices
in [ADR 0009](0009-another-harness-on-the-same-home.md) for the native path in
[ADR 0017](0017-the-ir-native-kit.md), preserving the explicit Hermes path.

## Context and evidence

The owner asked on 2026-10-05 to complete OA's native-kit decoupling and its publication identity follow-up. The
[ecosystem target](0024-ecosystem-target-architecture.md) makes an SDK-conforming runtime sufficient. Today a company
install selects a Claude/Codex worker but `agent.ts` still calls `hermesDoor`/`locateHermes`; `publisher.ts` loads
Hermes flavor, inventories Hermes jobs/profiles, and invokes `hermes kanban` for board control. Changing the gateway
alone leaves setup, observation and control coupled. This proposal fixes OA's adapter, not native codecs or engines.

The rendered host lock, rather than the older repository development lock, supplies the verification candidate:

| Published package | Exact version | Source Git head |
| --- | --- | --- |
| `@volter/supercode` | `0.5.141` | `a36daada0d3fe5af522dd535108ab92896e516d9` |
| `@volter/supercode-orchestrator` | `0.5.47` | `45fdfe5965dd7c64eb757892b72b208af74eacd6` |
| `@volter/supercode-harness-sdk` | `0.3.64` | `1e874224eaf40117405fd93b2121d5c3be6f1382` |

At proposal time, evidence was limited to read-only registry artifact inspection. Implementation verification now
uses exact packed candidates and manual World observations; the implementing PR supplies their hashes, outcomes
and remaining limits. This is scoped evidence, not acceptance of every runtime path. Pin the SDK exactly and align
the kit's development dependency with the rendered candidate; no broad dependency upgrade is proposed. The published orchestrator's
[applier door](https://github.com/volter-ai/supercode/blob/45fdfe5965dd7c64eb757892b72b208af74eacd6/sdk/orchestrator/apply/doors.mjs)
supports native jobs but has no inference read/write door. Its
[worker route](https://github.com/volter-ai/supercode/blob/45fdfe5965dd7c64eb757892b72b208af74eacd6/sdk/orchestrator/worker-route.mjs)
and [activation](https://github.com/volter-ai/supercode/blob/45fdfe5965dd7c64eb757892b72b208af74eacd6/sdk/orchestrator/activation.mjs)
consume specific native profile fields. Their historical Hermes names do not require a Hermes executable.

## Decision

### Explicit runtime selection and custody

Keeper chooses one runtime before setup and passes the same selection to every reporter, including tenant reporters.
The generated reporter configuration is `native_runtime: {kind: hermes | orchestrator, root: <absolute path>}`.
Worker harness is a separate choice: an orchestrator profile can run Claude Code or Codex. A kit record with `kit: ir`
selects orchestrator; existing Hermes layouts retain their declared gateway selection. Conflicting configuration
refuses startup. Standalone reporters with legacy `hermes_home`/`HERMES_HOME` retain the explicit Hermes adapter;
neither installed binaries nor a failed read select another runtime.

Hermes setup continues through its public applier door. Native setup uses the public `orchestratorDoor` for jobs and
the harness SDK's `orchestrationLoad({root, flavor: 'orchestrator'})`/`orchestrationSave` for configuration. It never
imports a Hermes home to make native setup work. Keeper retains process ownership; the native daemon, workflow
dispatcher, codecs, session capture and transports remain external. No new daemon or native scheduler is added.

### Native setup mapping and preflight

OA adds a narrow configuration adapter to the existing external applier. The applier keeps its per-home/profile/job
identity, adoption and three-way base/conflict rules. OA does not replace them with unconditional writes. Configuration
reads and writes load the owning public model, patch only the declared unit, save through the owning codec and read
back. All other profiles, typed worker fields, native residue, bindings, jobs and custody references remain intact;
the adapter never reads or returns vault contents and omits a vault replacement when saving.

The native declaration supports these exact mappings; arbitrary dotted configuration is refused:

| Declaration | Native model field / runtime use |
| --- | --- |
| Selected worker harness | `profile.worker.harness`; preserve existing worker fields; create a missing worker through the owning typed model |
| `inference.default` named model | `profile.residue.config.model.{default,provider,base_url,api_key,api_mode}` consumed by the native worker route |
| Endpoint / credential names | Literal `${NAME}` references in `base_url` / `api_key`; never resolve or publish their values |
| `agent.max_turns` | `profile.residue.config.agent.max_turns`; Claude launch limit or native Codex round-trip limit |
| `approvals.mode` | `profile.residue.config.approvals.mode`; native worker launch policy, `off` or `manual` |
| Declared jobs | Owning native job door, retaining its native IDs and update capability restrictions |

The native settings live under `extensions.orchestrator.config`. For existing native declarations only,
`extensions.hermes.config` can supply the same enumerated `worker.harness`, `agent.max_turns`, and `approvals.mode`
keys; conflicting duplicate declarations refuse. This is a bounded declaration compatibility mapping, not a generic
Hermes config parser. Native templates remove `memory.memory_enabled`: this candidate does not implement that
Hermes memory setting. An explicit unsupported setting refuses rather than being retained and called applied.

Default model route, named job model routes and an `unattended` pointer must use the same provider, endpoint,
credential reference and API mode for a profile; model names may differ. An unattended pointer equal to the default
is satisfied by the native profile route; a differing model is materialized as each otherwise-default job's explicit
model. No unused `cron.model` field is called applied. Delegation/fallback pointers or differing routes refuse.
The native worker route gives typed `worker.model` precedence over the profile default. A preserved unmanaged
`worker.model` that differs from the declared default therefore refuses preflight; equivalent values are allowed,
and the adapter never clears an unmanaged override to make a declaration appear effective. `worker.permission` is
a separate typed permission-prompt policy and remains preserved; `approvals.mode` names only the native launch
policy above. Conflicting declared launch policy and existing typed permission policy refuse rather than silently
changing that policy or claiming it was applied. Creation uses the owning model's documented defaults.
Claude supports the published custom/Anthropic routes; Codex supports its published custom/OpenAI/Codex-forward
routes. A declared route or turn limit unsupported by another worker refuses; OA does not infer support from a
binary's presence. Existing host-login and valve custody restrictions remain unchanged.

Before any profile configuration or job mutation, validate every profile, resolved parameter, config unit, model
route and planned job operation. In particular, native per-job toolsets refuse; updates to skills, repeat or
context_from refuse when the owning door cannot update them. Unknown declarations, malformed values, conflicting
live ownership and unsupported fields block startup before the gateway/dispatcher starts. Existing applier adoption
is limited to the declared matching jobs under its current contract; unmanaged records remain unmanaged. Public
load/save refusal or an uncertain mutation leaves startup failed and the retained applier base available for a
normal restart/reconciliation; no fallback door, invented harness or silent partial-success claim is allowed.

### Observation and authorized controls

One kit-local runtime adapter holds setup/observation/control selection. The native adapter loads native flavor and
reads native profiles/jobs/runs through public SDK doors; its setup names the actual runtime and selected worker,
and reads `home/README.md`. Skills use the public Agent Skills/selected-worker query with profile context, never
Hermes inventory as a substitute. Transcript observation uses the owning SDK's captured worker sessions and native
bindings/attempts. Missing attribution or verdict stays missing. Session keys, turn replay, publication audience,
account selection and treasury semantics do not change.

The pinned binary supports `runs.list` for orchestrator, while SDK `0.3.64`'s exported `RunHarnessId` union is stale
(even published `0.3.75` has that union). A single documented type bridge at the runtime adapter may pass the
verified native selector to the existing SDK method; it neither invents an RPC nor retries a different harness.
An unreadable or unsupported response remains a publication failure.

The filesystem-custody workflow stream remains the board source under
[ADR 0016](0016-retained-source-publication.md); Teams and RH2 are not prerequisites. Native saved-view membership
does not redefine task identity. OA association and receipt changes are independently specified in ADR 0027; this
adapter supplies selected runtime context and opaque native records without claiming native home/log attribution.

Owner pause/resume uses the native job SDK mutation door followed by native readback. Persist owned intent before
mutation, retain it on uncertain outcomes, and forget it only after readback proves resume or authoritative removal.
Resume applies only to jobs this adapter paused; independently disabled jobs remain disabled. Active attempts finish.

The shipped workflow does not expose a safe board-control round trip for this adapter. Per-card pause requires a real
manager session and closes a run that can become active between read and call. Global pause overwrites `root/ESTOP`;
global resume removes both that sentinel and `HOME/.hermes/ESTOP`, without owned-token or root-only removal. The
publisher does not impersonate a manager, change workflow roles, override caller context, create/edit pause files,
or invoke these unsafe controls. This is an external public-door gap, handed to the native manager, not permission
to implement another dispatcher in OA. Existing native pauses, permissions and attempts stay untouched.

For an install with a native workflow dispatcher, a requested pause applies supported job controls but remains
pending with an explicit board-control capability reason. The adapter never reports observed `paused` for that
request merely because the queue is empty or all scheduled jobs stopped. A job-only native install can report
`paused` after readable native readback shows no enabled jobs or live funded runs. A resume re-enables only its
owned jobs; it does not lift any board pause or claim that an unrelated native pause was lifted. Failed or uncertain
readback retains pending intent. Future safe board control requires review of an actual owning public contract.
Board IDs remain native IDs, separate from OA projection IDs; ambiguity is a refusal, never a guessed view match.
Hermes control remains its own adapter with the same truthful desired/observed rule. Merely viewing a Workplace
projection does not invoke any of these doors or grant execution authority.

### Owner controls without narrative enrollment

Keeper always launches the existing publisher process for the organization's owner controls. Missing publication
enrollment selects an explicit control-only mode: no source stream, board projection, notes, transcripts, setup or
documents are published. Declared but refused enrollment, adoption, source discovery or delivery remains a visible
narrative failure; it neither changes mode by guessing fresh custody nor disables owner controls. The control loop
starts before narrative initialization and uses its own serial queue, so an awaited source callback, historical
discovery or receipt retry cannot delay an owner's pause or resume. No new daemon is introduced.

The selected native orchestrator public CLI emits a structured newline-delimited JSON ready event only after its start completes, its public operator bridge listener is bound and any native restart replay is awaited. This is distinct from an inventory read or a prose log message. The pinned 0.5.47 implementation is bin/runtime.mjs (await orchestrator.start, awaited restart dispatch, then say ready), loop.mjs (await startBridge) and mcp/bridge.mjs (resolve only in server.listen callback). The once-mode ready event does not establish a live operator listener and cannot be used.

For its own bare native gateway child, keeper forwards stdout unchanged while parsing complete JSON lines. The pinned CLI can re-execute a direct daemon child under its required argv0. Keeper binds the public loaded event to its exact selected root and daemon PID, verifying through a bounded public OS parent-process query that this PID is either the directly owned gateway process or its one direct re-executed child. Only a non-once ready event for that same loaded root/PID, with the public daemon-ready fields and a fresh owning parent binding, permits it to launch the existing organization and enrolled tenant reporters. Unknown process metadata refuses readiness; this checks the owning launch chain rather than assuming numeric PID equality or accepting arbitrary descendants. Each stack gets a fresh readiness latch. Gateway exit or stack shutdown clears/refuses the latch; existing gateway lifecycle teardown still stops reporters. A malformed, foreign, mismatched, once-mode or absent event never enables the latch. There is no age, output substring, file read, inventory-empty or time-delay fallback. Other startup services and native brain lifecycle keep their existing ownership; Hermes startup ordering is unchanged. No new daemon, native codec or native readiness protocol is introduced.

The reporter's control loop still starts independently before its narrative enrollment, discovery and delivery; keeper delays launching that process only until its own native public mutation door has advertised availability. The event does not prove settlement of a previously accepted job effect or make the next mutation infallible. Durable version-2 per-job phases remain mandatory, and a later refusal/timeout stays unresolved. Native startup that cannot produce its ready contract remains visibly pending at keeper; adapters can delay that event under the owning runtime's startup contract. Standalone publishers do not own that child's event stream and must be started by their operator against an available selected runtime; they gain no inferred readiness or exception to unresolved-effect rules. OA does not classify native failure sentences as authoritative no-effect acknowledgements.

Manual acceptance must use the actual pinned owning CLI and installed keeper: owner desired paused before native startup, event root/PID readback, supported job pause through the SDK with positive completion and matching readback, no premature mutation phase, unchanged unrelated pause/books, normal shutdown and crash-recovery latch reset. Recovered pre-existing unresolved phases remain untouched; a fresh task-owned future job can prove the newly ordered startup without falsely reconciling earlier uncertainty.


Owner pause ownership has one canonical private file, `<reporter-state>.control.json`, with version 2, account,
logical API base, selected native runtime, `paused_jobs` and `paused_tasks`. On its first creation only, an existing
reporter version 2 or 3 may supply its validated native pause arrays. A version-3 seed must match the selected
account, logical API and runtime in its retained enrollment. Version 2 has no account/API/runtime provenance:
its seed relies on the owner's existing committed configuration and custody of that retained local state file
and selected root. This is an operator continuity assertion, not authenticated historical scope or detection of
unknown copies. Known conflicting or uncertain continuity refuses native effects pending explicit operator
reconciliation; copying a file alone supplies no authority. The seed records this basis and the retained reporter
digest; a fresh file records that no prior reporter existed. Once the control file exists, its sets are authoritative,
including empty sets: legacy arrays never re-seed cleared ownership. Initial-seed unknown versions, malformed
pause arrays, contradictory scope or uncertain ownership refuse native effects; they are never treated as absent
state. A valid scoped control file continues serving controls when independent narrative state is corrupt or
refused; a malformed or mismatched control file itself refuses native effects. Durable saves use the same private permissions and fsync/rename discipline as
publication state. Control-only operation never rewrites or upgrades reporter state, receipts, checkpoints,
enrollment, adoption or source-cache bytes. Narrative saves retain those historical pause fields without making
them another live ownership store.

The controller owns the existing `<reporter-state>.lock` directory. A narrative `PublicationStore` in that same
process may reuse an explicit lease whose state path, process identity and nonce match the lock; a boolean bypass
is insufficient. The store cannot release that external lease. Shutdown drains both queues and the native source
before the controller releases it. Standalone publication/adoption operators use the same lease protocol and refuse a concurrent live controller.
The same-executor kernel identity, crash-safe transition guard and proven-dead writer recovery are specified in
ADR 0027; uncertain or legacy ownership still requires operator reconciliation. There is no age-based takeover
or cross-host fencing, and recovery does not claim retirement of orphan read-only Source processes.

Every control pass freshly reads the owning public native schedule, configuration/bindings and run ledger before
native mutation and again as needed for readback. Unreadable or ambiguous authority retains the request as pending;
cached transcript discovery or an empty narrative board cannot establish observed pause. Active funded work may
finish and is never ended to satisfy the request. Hermes has no safe owner-authorized dispatcher pause/resume or quiescence readback door. Owner controls therefore
use only the selected runtime's public SDK configuration, jobs, runs and bindings; they do not poll its board CLI.
Their desired pause remains visibly pending when dispatcher authority is unavailable, and retained legacy task
ownership is not silently cleared. Removing board polling changes no supported mutation or observed operating-state
outcome and prevents that synchronous subprocess from blocking signal/control handling. Narrative Source inventory
retains its separate authorization and lifecycle. The pinned
Hermes `schedule_task` can end a task that becomes active after inventory was read, and its `promote_task` does not
accept a scheduled task. These public doors cannot implement the required safe pause/resume round trip. This
adapter therefore never schedules or promotes board tasks: it retains legacy `paused_tasks` ownership and reports
the missing capability as pending while applying supported job controls. It cannot infer dispatcher quiescence
from empty inventory or claim observed pause when dispatcher authority is unknown. The native dispatcher
capability restriction above is unchanged. Job resume forgets owned intent only after the current acknowledged effect and authoritative readback
prove resume; an unresolved earlier effect is never settled by an enabled or missing row, and an independently paused job is never resumed. Future board control for either adapter
requires independent review of a safe owning contract; no native board engine is changed here.

Native SDK job calls may remain accepted in a child after the OA publisher dies. A fresh enabled/disabled inventory is observation, not a barrier proving an older accepted opposite mutation finished. OA will not add a native fence, kill uncertain children, infer settlement from age, or invent a completed result.

The canonical owner-control sidecar becomes version 2, retaining its account/API/runtime scope, seed, paused_jobs and paused_tasks and adding pending_effects. Each entry contains a unique native job ID, optional native profile (null when unknown), action pause or resume, operation UUID and origin rpc or retained-ownership. One unresolved effect per job is allowed. Unknown versions, malformed phases or conflicting ownership refuse effects. Narrative checkpoints remain byte-for-byte independent.

Before each public job RPC, the controller durably records its rpc phase; a pause also records owned-job membership in that same save. Only the same currently executing call's positive SDK completion followed by authoritative matching public readback may clear that phase. A successful resume removes both the phase and owned-job membership in the same durable save. A failed/aborted call, mismatched or unreadable readback, crash, or save failure leaves the phase unresolved. Later passes and restarted processes never interpret inventory alone as settlement, retry that job's mutation, or submit the opposite action. They retain its ownership, continue supported controls for unrelated jobs and report the unresolved native effect explicitly. Observed paused is forbidden while any such phase remains.

Existing version-1 sidecars are validated with their original scope/seed rules, then migrated once to version 2. Each retained owned job is represented by an unresolved pause entry with origin retained-ownership, unknown profile and a new local operation identifier; this records uncertainty, not a historical RPC acknowledgement. A first seed from reporter v2/v3 follows the same rule for its retained paused_jobs. Empty ownership migrates with an empty phase set. The canonical version-2 file is thereafter authoritative, including empty sets; legacy narrative arrays cannot re-seed it. Retained paused_tasks remains independently pending under the missing safe board-control contract. A valid existing control sidecar remains independent of corrupt narrative.

Resolving an uncertain accepted job mutation requires an actual owning native settlement/barrier contract or explicit owner reconciliation with evidence. This change introduces neither a reconciliation bypass nor a new native protocol. Until that external capability exists, the affected job can remain pending while OA observation, controls for other jobs and narrative delivery continue.

An unfinished or stale execution record without authoritative completion stays unresolved. Its presence is
described as pending native execution readback, not as proof that a funded process is currently live; OA does not
manufacture finished_at or native completion.

## Alternatives and consequences

A launcher-only change leaves inference and observation broken. Installing Hermes for every native instance retains
the dependency being removed. Implementing another codec/scheduler or relaxing native decoding would move external
authority into OA. This decision instead composes declared fields into public owning APIs, with an explicit bounded
capability surface. Unsupported declarations may now fail earlier; template upgrades explain the native declaration
change, preserve owner edits, and never claim unsupported settings were applied.

## Constitution review and manual acceptance

Independent review must confirm the mapping and public doors before implementation. “Only the SDK is real” requires
all native observations and OA projections to cross their owning SDKs; “the platform shows; it does not steer” leaves
authorized intent application in the owner-run adapter. “Authority comes from the repository” preserves declared
routes, bounds and controls; “Every spend is metered on public books” keeps the existing valves/SDK receipts. The kit
implements no harness or workflow compiler. No constitution amendment, native migration, RH2 feature, deploy or
release is authorized here.

Manual evidence uses fresh caller-owned rendered IR/company and explicit Hermes instances, pinned published
dependencies, synthetic selected model/payment vendors and the real local OA platform in a World. Before installing
or running, review the selected vendors, pin the World CLI and assign lifecycle ownership. Prove no-Hermes native
startup; model/worker/job public readback and stable job IDs across restart; actual job/card execution and published
SDK sessions/settled receipts where the selected model twin supports them; native job pause/resume with unrelated
pauses preserved, and board-pause capability refusal with the original attempt and native pauses unchanged; desired
versus observed while an attempt is active. Exercise unsupported config/job
preflight, public mutation failure and retained restart recovery. Verify explicit Hermes still selects its own door.
Report actual failures and missing attribution/model coverage rather than fabricate runs or claims. Stop registered
consumers and tear down only the owned World. No automated tests or permanent proof harnesses are added or run.
