# ADR 0037: Fresh Rooms generations close their original effects before recovery release

Status: Proposed for VO-3773 (`t_7ad9a306`, OA `t_2ca9da74`, native `t_34940ac5`).
Requires independent PLAN and constitution review before affected implementation. It adds no capability
to an old selection, qualifies no runtime or source boundary, and authorizes no release or live action.

## Context, sources and required outcome

The card requires: “A session adopted onto a card is seated in that card's project Room while the
card's run works in it, and leaves the Room when the link ends, read on the owner's Workplace.” It
also requires “Released as one cutover with the Workplace and the machine pins that carry it.”
This decision concerns exact linked-session removal and recovery of that complete cutover. It does
not authorize a general Teams, Cards or provider redesign.

Current `packages/workplace/rooms/lifecycle.mjs` retains an unanswered mutation intent and refuses
compensation while one remains. `main.mjs`'s `currentRoleCards` refreshes a Teams projection;
`compensateRunPlacements` then resolves role demand and sends expected-seater joins/leaves. Neither
a complete event snapshot nor that expected seater excludes an unprojected native role/run, a
later lifecycle change, a replacement session, or an earlier provider write arriving after cleanup.
The current mutable journal also removes an intent after an ordinary typed HTTP refusal; a new
receipt reader must never mistake a committed-but-unreadable outcome for terminal no effect.

[ADR 0031](0031-serving-install-handovers.md) preserves the native source decision, committed rows,
complete generation reservations and source restoration before predecessor restart.
[ADR 0035](0035-project-rooms-program-receipts.md) binds the exact selected program, durable intents
and its own compensation acknowledgement. The separately proposed
[ADR 0036 at OA `98f6021e9f2b8a573a55908ca642d79f4dfd0466`](https://github.com/open-autonomy-org/open-autonomy/blob/98f6021e9f2b8a573a55908ca642d79f4dfd0466/docs/decisions/0036-project-rooms-offline-intent-settlement.md)
supports only an original request's proved terminal no-effect offline disposition. It sends no
remote mutation, clears no placement debt, cannot be rebound to a new lease, and does not supply a
successful populated compensation capability. That pending source is an explicit paired input,
not a claim that current main implements or accepts it.

The native proposal is
[Supercode ADR 0248 at reviewed `c6e8b1db9d728c7a040a23d13a84c9ebdf7067aa`](https://github.com/volter-ai/supercode/blob/c6e8b1db9d728c7a040a23d13a84c9ebdf7067aa/docs/adr/0248-dedicated-canonical-source-storage.md),
including its exact storage, protocol and 42-field dispositions. Its native PLAN passed; its new
Teams and RH2 owner decisions still require their own paired PLAN passes. RH2's separately accepted
[ADR 0069](https://github.com/volter-ai/runhuman-2/blob/e664a0e1e3eaf824226c87f3562e37d58125b56c/apps/rh2/docs/adr/0069-conditional-room-commands-keep-their-original-effects-and-terminal-receipts.md)
proposes atomic Room effects and terminal receipts. It does not close a distinct provider write.
This OA proposal cannot supply either missing protocol by accepting a caller's JSON assertion.

## Decision

### Keep each existing owner and immutable program

The existing Rooms publisher owns its placement history, intent journal, exact Room operation
manifests and durable acknowledgement. Its existing connection custodian owns config/state/custody;
the native source/machine owner owns the actual source decision, N exclusion, local L admission,
recovery phases and final reservations. Teams owns T's selected identity/ended cut. RH2 owns R's
current representation, authority, provenance and atomic effect/status/close. OA changes no native
source bytes, registry, source ledger, machine pin, installation, credentials or Teams lifecycle.

Only a **fresh capable complete composition** may select this protocol. `prepare.mjs` must bind the
full immutable program closure and versioned lifecycle capabilities; `qualify.mjs` must independently
bind the actual candidate/predecessor pair and observed recovery outcomes. Preparation is never
qualification. The selected runtime's artifact, logical selection and transaction remain unchanged
through recovery. An older selection that lacks any required owner capability refuses. There is no
adapter that runs new bytes as the old child, upgrades its receipt, or edits its advertised capability.
Retained transaction `42286159` is not an implementation or proof target.

### Admit an exact recovery invocation through the existing parent channel

Extend the existing versioned Node IPC lifecycle, rather than add an OA daemon or public recovery
endpoint. The selected program verifies its exact immutable binding and the current native parent's
phase admission. Public files, a digest, stopped PIDs or an operator's assertion cannot manufacture
that admission. The native owner must provide the actual live phase channel and protected operation
status through their reviewed contract; absence, incompatibility or loss retains debt.

Persist an append-only recovery record bound to the native operation/source decision, exact selected
and predecessor artifacts, logical selection, connection/namespace/config semantics, original
invocation, and N/T/L/R control identities. The journal records immutable manifests before dispatch,
raw terminal dispositions and their exact server identities, local persistence/readback progress,
branch and acknowledgement. No custody bytes appear in it. Source/declaration digests identify
inputs; they neither decide authority nor replace the actual owner's hold. Conflicting reuse refuses;
lost answers resolve by exact status. An invocation cannot be rebound to a replacement lease.

### Establish a complete source and earlier-effect cut

The native owner first acquires N over the complete canonical source/config/registry vector and
fixes the finite potentially positive native-declared agent IDs **before** applying the ended filter.
Teams T must atomically pin just their identity existence and ended predicate and return the cut.
Missing/ambiguous IDs refuse. Unrelated declarations, parent/profile/name/main/session ownership and
activity remain admitted; none selects this inverse. OA never emulates Teams' commit exclusion.

Native L closes local new-batch admission and joins/inventories every admitted writer/request under
the actual Agents and Cards actors. The reviewed RH2 source control seals the enrolled writer epoch,
blocks late unknown first batches and stale reopen controls, and returns its fixed complete catalogue.
Every original relevant provider batch must resolve and close irreversibly. Local manifests for
never-admitted batches need the server's actual sealed-epoch exclusion. OA accepts this exact
owner-bound closure, not a GET, a publisher exit, a timeout or a Room-only close. A legacy unenveloped
request, missing original batch, secret-issuance uncertainty, unavailable retirement or incomplete
catalogue leaves recovery held. No per-native-edit RH2 call or native parser is added to OA/RH2.

### Compute a finite effect-specific inverse

From the actual held native source cut, compute the complete positive project/lead/role/run union
and each exact native session S under the declared source semantics. Apply only T's exact ended
predicate. Preserve every unresolved positive obligation; absence of a projected Task, work field,
catalogue item or principal is not absence of demand. Do not run `currentSessionOf`, rank a newer main
or carrier, promote/demote identity, infer a person's custody or select from current activity.

Use RH2's complete authorized atomic basis to match each positive S to the actual existing
registration-qualified representation, work, current standing and full affected placement closure.
Unresolved or ambiguous representation refuses; compensation creates no replacement representation.
Preserve independent/person seats and current role/run contributions, including their receive and
Conversation requirements. Only the original selected program's proved owned field effects are
eligible for reduction. Equal-value borrowing is not ownership; ABA, replacement incarnation,
foreign provenance, changed session/seater or independent takeover must be preserved/refused through
the product-owned original-effect chain. A local placement cache never grants that ownership.

Each Room step binds the complete RH2 basis, exact expected field vector, requested reduction and
original effect identities in a new immutable body-complete namespace before its first dispatch.
If a response supplies an ID needed by another body, durably resolve that step, then create a new
batch; never mutate an earlier manifest or retry a different body under its ID. A stale/expired
basis yields its exact terminal no-effect outcome. A fresh basis may support a new deliberate step
only after the old step is resolved; all namespaces remain in the invocation's closure inventory.

Binding/turn/activity rankings, main-hold/cache clocks and physical process liveness are excluded
from this inverse's selectors, under ADR0248's 42 explicit dispositions. If an implementation
consumes any excluded timed selector, it refuses until the real owners provide a reviewed
effect-time/common-clock validity contract. RTT, an old `now` or a filesystem freeze is no such
contract. RH2 enforces its own current authority and deadline at its effect.

### Preserve terminal truth and publish branch-specific Z

An effect reply, status and close must be interpreted through the exact versioned RH2 contract.
Keep applied, original-effect-absent, terminal no-effect, never-admitted and unknown distinct.
An ordinary HTTP status or a hidden/unreadable receipt never proves no effect. Renewed credentials
grant no new actor identity, and a loss of current reading authority retains recovery debt. OA must
not clear an intent from a generic non-408 4xx classification on this capable path.

The actual issuing owner closes **every** original relevant provider namespace under its own
installed actor; OA closes its own original and inverse Room namespaces. Both include
admitted-but-unanswered and locally never-sent manifested operations. OA neither borrows Agents/Cards
custody nor claims their namespace as its own. Persist and re-read the exact owner-bound final
inventories, source-epoch seal/closure and placement disposition before publishing durable Z to the parent. Preserve raw
original receipts and prior uncertainty rather than replacing them with a zero-debt snapshot.
The public acknowledgement exposes only currently authorized safe references/digests; the journal
never extends RH2 reading authority. Partial multi-Room progress remains explicit debt until the
whole fixed inventory is terminal and every required result is readable and verified.

**Before source commit:** actual selected-program compensation, all relevant provider/Room closure
and OA's exact durable Z precede native finite declaration restoration and previous-source readback.
**After source commit:** close and acknowledge the exact committed branch and finalize its selected
serving composition. Do not run rollback inverse/restoration, restart predecessors, or fabricate a
compensation receipt. Native alone classifies the source decision; unknown remains held.

Z does not thaw a source or release a reservation. Only after exact Z and branch-specific source
decision/readback may native durably authorize/status original T release and physical N thaw.
Those retire only those concrete controls. Local custody release does not remove `recovery_required`,
ordinary L/start exclusion or final source/machine/dependent reservations. Precommit then restores
native predecessors before dependent predecessors/readiness; the committed branch completes its
committed serving/finalization phase. Final reservations and the recovery marker retire only after
the complete branch outcome/readiness. A later failure resumes only that remaining lifecycle phase;
it never reuses the released cut, old compensation or a closed namespace. Ordinary admitted publishers
receive a new qualified epoch/batches, not reopened old identities.

### Explicit capable-predecessor lineage handoff

The fresh artifact declares lifecycle protocol 2, arc state 8/journal 2, compensation protocol 2
(`original-field-effects`) and owner/Room/lineage protocol 1. Its file closure contains every imported
module. Transport bindings remain protocol 1 Node IPC. The retained parent alone provides recovery
status, the held native/Teams cut, issuing-provider closure and ordered branch readiness.

A legacy version 5 predecessor cannot inherit surviving owned run demand; that case retains debt.
For an exact predecessor that separately advertises lineage protocol 1, retain the full positive
role/run union and its actual original field chain. The selected child first performs and closes
its required guarded reductions, then returns a durable `lineage-pending` offer rather than Z.
That offer binds the original operation/admission revision, source decision, invocation, N/T/L/R,
actor/config semantics, both exact artifact/selection identities, every immutable manifested body
and current closed receipt, and the exact active original-effect references for each retained
placement. The complete offer is bounded to 4 MiB inside the private 8 MiB protocol; overflow refuses.

Native records only an offer returned by its actual retained selected ChildProcess. It asks the
actual exact quiesced capable predecessor to validate it, without granting ordinary startup.
That predecessor reads the offer through `recovery-lineage-offer`, independently reads every
namespace through its own current RH2 installation, and returns its exact acceptance/inventory
digest. Native persists that actual-child acceptance in the single protected original operation
and reads it back. A predecessor does not claim persistence from a local write beneath a held
read-only backing or from a separate policy journal. `recovery-lineage-ack` exposes only that
original protected acknowledgement; absent or unreadable acceptance keeps the candidate pending.

Only after the candidate reads the exact native-persisted acceptance, rechecks current closure
and original admission, may its Z bind the offer and acceptance digests. Release and readiness
remain separate native phases. On later admitted precommit startup, the predecessor reads the
original offer/acceptance again, verifies current receipt reading, and durably imports precisely
the accepted original references before ordinary projection. It neither reopens their namespaces
nor claims equal-valued or foreign fields. A new inverse uses new immutable namespaces while RH2
continues to enforce the original actor, incarnation and field-owner chain. The committed branch
does not perform a predecessor handoff or rollback inverse.

The provider capsule also binds a separate current `representations` read to the exact held seal,
complete paginated catalogue digest and current partition generation. Native session names come
from the qualified provider work reference (`native`); the Workplace session address is its own
registration-qualified `{id,team}` reference. Every held positive role/run must resolve in that
current map. Missing, ambiguous, stale or unreadable representations remain positive unresolved
debt; a projected absence never proves that demand ended.

## Dispositions, alternatives and consequences

| Decision or existing path | Disposition |
| --- | --- |
| ADR0031 source-first restoration, committed rows and reservation until predecessor serves | **Complies.** OA supplies its prerequisite acknowledgement; native retains source branch, finite restoration/readback and ordered admission. Physical/T release is not final retirement. |
| ADR0035 exact artifact, one parent, unknown debt and own compensation | **Updates for newly selected capable programs only.** Add exact receipt-driven effect reduction/closure and branch-specific durable acknowledgement. Old capabilities/bytes/placement debt remain unchanged. |
| Pending exact ADR0036 original no-effect offline command and audit/lease history | **Preserves that command without extension.** It sends no mutation and retains placement debt. This new effectful protocol belongs to the fresh selected program, never the offline command or a rebound old audit. |
| Current `currentRoleCards`/expected-seater compensation and generic typed-4xx intent removal | **Retires their use as proof of this new capability.** Keep old selections immutable and unavailable for populated recovery; the fresh capable path must use held source truth, exact atomic original-effect reductions and explicit receipt dispositions. |
| OA ADR0024 native integration/placement/RH2 separation; native ADR0032/0041 connection writer and custody | **Complies.** Existing owners exchange bounded control/acknowledgement; no second projection/config writer, credential inventory, source parser or scheduler. |
| Native ADR0243/0248 and all42 source dispositions | **Complies with the exact paired proposal**, contingent on its actual implemented/qualified N/T/L owners. Missing or changed fields refuse rather than silently broaden the inverse. |
| Teams ADR0070 sole allow/deny table and bookkeeping | **Complies.** OA receives no Teams permission from native records and invents no consent/admin gate. Current Teams and RH2 standing remain with those products. |
| RH2 ADR0069 and the required provider-batch/source-control amendment | **Consumes only exact reviewed capable contracts.** Current reading authority, original field lineage, terminal tombstones and server late-request exclusion remain RH2-owned. A Room-only plan/pass cannot establish provider closure. |

A fresh roster plus a second leave can remove a replacement session or independent new role. A
local stopped writer cannot exclude a delayed remote request. Replacing the old executable would
break immutable selection; snapshot rollback would destroy accepted rows/history. A global team
freeze has no required scope. The selected alternative accepts explicit unavailability while any
owner, current authority, original lineage or terminal acknowledgement is missing; no TTL or forced
release is supplied by OA. Availability recovery uses the original owners' qualified transfer and
phase status, never a new permission or a forged acknowledgement.

## Constitution review and implementation obligations

“Only the SDK is real” and “The platform shows; it does not steer”: this changes the existing
publisher/native lifecycle, not platform steering or substrate parsing. “Authority comes from the
repository, not from a key”: exact selection/config and current product authority remain distinct;
receipts cannot widen grants. The audience/secret invariant is preserved by current-read projection
and secret-free control metadata. No spend rail changes. “No automated tests” and “Nothing here
develops against a real API”: verification uses recorded manual product-door operation in isolated
Worlds with synthetic vendors and actual selected programs; source checks establish only text.

Required manual observations after all paired PLAN passes: positive populated exact candidate and
predecessor recovery; held native role/run with projection withheld; already committed/unprojected
Teams end and a later selected end; permitted unrelated reparent/declaration/main/activity changes;
same-seater S0→S1 and ABA/independent receive/Conversation ownership; delayed first/known provider
batches and stale epoch-open; each lost effect/close/status/local persistence acknowledgement;
current authority/read narrowing; clock thresholds crossed with unchanged inverse; owner/channel
loss at every durable phase; precommit source-first and committed-only recovery; and failures after
T/N release that resume lifecycle without replaying compensation. Show exact preserved committed
rows, independent/person/role effects, full namespace closure, readiness and final retirement.
Refusal or an empty path alone does not qualify this capability.

The implementation plan remains on the card: OA `t_2ca9da74` owns immutable artifact/state/closure/Z;
native `t_0dddb9de`/`t_34940ac5` own enrollment and ordered admission; `t_7a920bdc` owns Teams T and
`t_2a4ea3f7` RH2 provider closure. Independent review must judge each exact paired source and the
final composition before qualification. No privileged component runs on the owner's desktop or
any live host under this proposal; future privileged proof is confined to a disposable macOS VM.
No source/custody migration, first adoption, serving pin, release or whole-arc Acceptance follows
from this docs-only decision.
