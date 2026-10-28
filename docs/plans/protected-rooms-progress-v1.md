# Protected Rooms progress v1 — proposed contract

Status: proposed. Requires independent OA, native and RH2 PLAN passes before this new mechanism
implementation. Old schema1/2 operations and accepted v1/206 proof gain no capability.

## Authority, immutable baseline and one operation

Original retains the exact enrolled R.state path/identity, initial metadata, raw UTF8 state length,
SHA256 and **inline canonical base64 bytes** in the same root-protected operation outside N. Native
captures those bytes at fresh operation creation only after the actual selected child has
quiesced/drained/persisted before N. The complete budget is reserved before T/L/R effects. Native
then re-reads and requires exact initial bytes/metadata under complete real N exclusion. There is no protected manifest/file API,
operator-selected state path or writable exception beneath N. The raw baseline is never overwritten
or rebased to a later state. It remains retrievable after thaw changes its former public path.

The selected artifact declares progress protocol1, checkpoint protocol1 and the exact numeric bounds
below. Preparation, native selection and qualification must all require the declaration and full
reducer source closure. An old protocol2 artifact without this capability cannot be adapted or have
its receipt upgraded. Retained42286159 remains excluded.

Between N acquisition and availability of the original protected operation, the actual child stays
paused. Construction may read/validate its initial journal but does not append, effect, retire debt
or announce durable readiness. Original production reads the pre-N quiescence evidence; it cannot
ask for a fresh state-file persistence receipt under RO. Once original protected status binds the
same initial bytes/selection/config/invocation, native admits protected progress.

`program-progress-status` and `program-progress-append` use the existing actual ChildProcess/runner
IPC channel. Native checks actual process/delegate identity, selected/predecessor role, immutable
artifact/logical selection/config semantics, invocation, original operation, initial state digest,
current semantic admission revision and phase. Child JSON, an environment binding, PID, digest or
user file cannot supply that authority. The holder stores opaque bytes and chain/CAS; it does not
parse OA policy, run OA code, receive custody, or accept paths/commands/SQL/file operations.

The immutable program-state identity is `(operation, initialStateDigest, role, selection, artifact,
configDigest, invocation)`. Progress uses zero-based sequence, previous digest, canonical base64
payload and SHA256. The initial chain anchor hashes that complete identity and baseline digest.
Canonical base64 must decode exactly and re-encode identically; raw length and payload digest must
match. One existing acquire-kind transition `record-program-progress` appends to this original
operation, with expected protected revision and expected progress head. It never accepts a complete
replacement stream. The holder rejects truncation/rebinding/conflicting sequence reuse; a retry of
an identical committed event returns its original sequence/head. Native serializes append admission
with phase changes. Appends advance protected storage revision, not semantic recovery admission
revision; phase changes advance the latter separately.

A lost answer is resolved by exact protected operation/sequence/content status. No effect advances
until the exact durable entry is read back. Once checkpoint sealing begins, programProgress is frozen. nativeProgress remains available for
actual native terminal/phase evidence through the separately specified native FIFO handoff; a child
close cannot disappear because the OA head was sealed. No new stream, stale cache or new incarnation
settles an old intent. Loss or incompatible recovery authority leaves original controls/debt held.

## Deterministic typed replay and required await barriers

The fresh OA artifact owns one pure lossless `recovery-state.mjs` reducer, included in its immutable
file receipt. It validates the baseline's arc8/journal2 shape, UTF8/JSON/depth/duplicate-key rules,
selection identity and legacy debt before accepting events. Unsupported input refuses before any
effect. Native uses that **same exact receipt-bound export**, not a newer or independently invented
OA parser, in a separately retained unprivileged reducer child with no holder FD, to reproduce output
and compare the actual child's proposal. The holder-channel Node process never imports OA code;
the paired native protected-overlay contract in Supercode ADR0248 fixes launch/closure and native delta validation/crash behavior. This stays OA state policy
consumed by native through its own contract.

Replay preserves the raw token spans of every unrelated JSON field, including unknown numeric
lexemes and other selections' journal entries. It never JSON.parse/stringify-roundtrips unrelated
state. Only the selected `roomsRecovery` journal/subtree, exact owned `runSeats` keys and the finite
`roomsRecovery` protected-operation cursor can change. The cursor records operation/baseline/head;
output digest stays in protected native status, avoiding a self-referential file digest.

The payload grammar permits only these typed transitions:

1. **Initialize-selection**: validate or create this selection's journal identity/empty entry list;
   retain all older selection evidence and publisherLifecycle legacy intents byte-for-byte. An
   unresolved legacy/generic intent forbids effectful canonical recovery; no event deletes it.
2. **Append-journal-facts**: append one to16 inner OA entries with exact expected inner head,
   sequence/previous/content digest and the finite kind/schema allowlist in the normative writer inventory below. Old entries
   are immutable. Facts bind complete manifests before dispatch, exact terminal results and closure,
   admission/cut/plan/final inventory, native readiness, lineage and lifecycle/Z. A terminal result
   cannot change; repeated identical status/close observations use the existing fact and do not grow
   the journal. Current reading authority is rechecked live each time; cached facts grant nothing.
3. **Retire-owned-placement**: atomically append its disposition fact and remove just the named
   runSeats entry after verifying expected placement digest/owner, exact original effect identities,
   qualified terminal+closed disposition and source decision. Empty room containers may be removed
   as a derived consequence. Missing/equal already-committed state is idempotent only with its exact
   protected prior event; foreign/different state refuses. No generic object path/delete exists.
4. **Transfer-owned-lineage**: atomically append transfer facts and retire exact selected cache keys
   only after native's protected actual-predecessor acceptance matches the original offer. This is
   distinct from claiming absent original effects.
5. **Stage-predecessor-lineage**: the actual quiesced capable predecessor verifies current RH2 receipt
   authority and native's exact accepted offer under its allowed read-only role. Its proposed typed
   import appends that predecessor's room-lineage-import entry and adds only accepted exact runSeats
   records, matching expected absent/equal state and original field references. This is staged
   protected state, not ordinary startup or selected compensation authority. Native must retain the
   actual predecessor acceptance before this event. V1 requires selected/predecessor state targets
   to be the same exact enrolled R.state file; a different target refuses before effects.

Run-cache fact plus mutation and lineage import plus matching owned records are single committed
progress events, never independent in-memory changes followed by a later best-effort persist.
Construction, append/flush, recovery bind/provider closure/plan, room prepare/dispatch/observe/status/
close/dispose/reconcile, lineage offer/ack/import, run retirement/transfer, Z, lifecycle receipt,
quiesce/resume and their callers all become awaited barriers. Neither Promise creation nor an
in-memory append is durability. No following HTTP effect, debt retirement, receipt, Z or resume
acknowledgement crosses a failed/unreadable append. Generic `mutation-*` writes are not admitted in
held canonical recovery; the existing ordinary publisher lane keeps its original pre-N semantics.

## Concrete finite bounds and reservation

Fresh metadata advertises all bounds; they are supported-composition caps, not generic populated
support. Independent limits apply together; the tighter actual serialized budget always wins.

| Item | Maximum |
| --- | ---: |
| Fresh protected record schema | 3; no schema1/2 upgrade |
| Raw immutable OA baseline UTF8 | 2,097,152 bytes |
| Native initial safe typed inventory | 262,144 raw bytes |
| One raw canonical progress payload | 262,144 bytes |
| Sum of raw progress payload bytes | 2,097,152 bytes |
| OA progress events / inner facts per event | 512 / 16 |
| Native progress events / one payload / sum | 256 / 16,384 / 524,288 raw bytes |
| Native live children / all launches / effect IDs | 8 / 64 / 128 |
| Boot-admission attempts | Existing16; all reserved before effects |
| Retained operations / epoch selectors / source selectors | 16 / 64 / 64 per enrollment |
| Actual protected retention index | 65,536 bytes |
| Owner full terminal/status/inventory result | 196,608 bytes, enforced before effect |
| Complete distinct Room namespaces / exact placements | 32 / 16 |
| Complete native cards / finite candidate agents | 256 / 4,096 |
| Issuing provider owners | 2 |
| Raw forward checkpoint output | 4,194,304 bytes |
| Actual serialized protected record AND each private request/response | 8,384,512 bytes (8MiB−4096) |

The2MiB OA baseline base64 is at most2,796,204bytes. The2MiB OA progress split over512 events
has conservative base64 upper bound2,798,252bytes. The256KiB native safe inventory uses at most
349,528base64bytes;512KiB native progress over256events uses at most700,076base64bytes.
The combined base64 ceiling is6,644,060bytes, leaving1,740,452bytes of8MiB−4096 for actual
original/control/native event wrappers, all16 boot-admission records and pending debt, the ENTIRE
65,536-byte maximum retained index, lineage and checkpoint/seal/release/retirement debt.
The combined serialized operation PLUS retained index AND every actual request/response must fit
8,384,512bytes; the normal8MiB transport limit is not raised. Individual maxima do not promise
simultaneous support. Existing4MiB lineage is an independent maximum: combinations that do not fit
refuse. The index is a bounded lookup, not an extra history/blob allocation. No truncation or spill
is permitted. A4MiB checkpoint request base64 is5,592,408bytes; its actual full envelope must fit.
Protected state stores output length/digest and reconstructible intent, not a duplicate output blob.

Before the first relevant remote mutation, native/OA must inventory the whole finite admitted
manifest/placement/source cut, encode actual known bodies and compute a reservation for each
maximum remaining terminal/status/close/disposition/lineage/Z/receipt/checkpoint result under the
reviewed owner contracts. The holder checks the actual serialized current record and each reserved
successor form (including escaping, base64, hashes, numeric growth, every remaining event header
and response wrapper). It reserves the full completion budget, not merely current free bytes.
An owner contract without a finite enforced result/cardinality bound cannot be admitted by this
capability. Newly discovered effects, missing complete inventory, overflow or unsupported cardinality
refuse **before dispatch**. Reservation can be consumed only by its exact typed event; redundant
read/status retry facts consume no new space. Independent current-authority unreadability still
retains debt and may prevent completion. An admitted external effect followed by local I/O/lost
answer retains its already reserved intent and resolves by exact owner status; it is never relabelled
as no effect. Native phase/seal writes also require their completion reservation before admission.

The RH2 command request/namespace65,536-byte and64-operation limits alone do NOT prove this
reservation. The complete current predispatch basis, existing namespace receipts/inventory and
actual prospective full terminal/status/close body must be measured. Where a result includes later
mutable full rows, arbitrary field values or generated data not bounded by that basis, admission
requires a paired issuer-owned `finite-owner-results/v1` capability: exact result schema and maximum
196,608 serialized bytes, enforced atomically before the effect/retained receipt is committed.
Generated IDs/timestamps have fixed declared bounds; full changed rows and provenance/history are
included. An overlarge prospective result returns a bounded terminal no-effect before mutation.
A stale-basis or refusal reply must have the same enforced bound. Prior receipts are never truncated,
relabelled or dropped; an overlarge existing receipt/inventory refuses new recovery effects while
retaining that earlier debt. This is the new RH2 ADR0070 fresh wire2/storage207 proposal, requiring its own actual positive
source/runtime/retired-writer-floor qualification and expanded three-owner PLAN; accepted0069/0070
v1 proofs do not qualify it. It is not claimed in the current public runtime.

Each admitted command reserves its exact prospective retained result bound plus all future status,
close, full-inventory and native/OA disposition/lineage/head metadata, then checks the canonical full
program event with its wrappers fits262,144bytes.16 facts/event is a cardinality limit, not a promise
all can be batched at maximum size. If exact finite derivation or actual enforced owner cap is absent,
the new composition is unsupported before dispatch. A response becoming unreadable or malformed
still retains intent/debt and is resolved through original owner status; OA never discards truth
because a post-effect result exceeded its local buffer.

## Additional positive phase: fixed R.state forward checkpoint under N

Deferred post-thaw materialization alone is a safe refusal, not a complete ready path. This proposal
therefore adds an explicit **forward-state-checkpoint** phase, under expanded three-owner PLAN review. It is a new effect, not the existing declaration restore.

After exact selected compensation/committed close and durable Z/lifecycle receipt, and after native's
branch-specific declaration/source decision readback, keep T, physical N, ordinary L/start exclusion
and final reservations held. Stage any accepted predecessor lineage import while still quiesced.
Native atomically seals the progress headH; no more OA held-phase append is admitted. Both the actual
selected child and native's separately retained exact OA reducer child derive identical bounded output
from original baseline+H. Native verifies that all edits are the allowlisted typed forward effects,
all unrelated token spans are unchanged, target remains the same original R.state, output cursor
binds H and original identity, and the original branch/readback still qualifies. It persists the
checkpoint intent with exact initial/current metadata+digest, output digest/length and delta/head
bindings before OS publication. It keeps output deterministically reconstructible from protected
baseline/events; it does not persist a second arbitrary output authority.

The holder's NEW `materialize-program-checkpoint` transition accepts no target pathname. Its target
boundary ID/contained relative location/type/metadata was fixed by Original's actual enrolled state
reference at acquisition. The private request carries only same-operation/revision/head/intent and
bounded output bytes/digest. This dedicated transition has its own4MiB bound; the existing1MiB file /
4MiB total declaration-restoration primitive remains unchanged and cannot be used for this purpose.
No DB, card/Git/source document, credentials, arbitrary state target or whole image is writable.

While all public writers remain excluded by N, the holder ordinarily darkens/detaches public RO for
that backing, privately attaches the SAME backing RW beneath its root-private namespace, verifies
the exact fixed state file still has the checkpoint intent's expected CURRENT bytes/metadata
(initial bytes on the first publication, exact previous checkpoint output on an admitted retry) and no alias/symlink/hardlink,
publishes only the approved forward output with required full-sync/file/publication/parent durability,
reads back exact bytes/metadata and returns the whole boundary vector to complete verified public
RO. No public/ordinary RW interval occurs. Protected physical progress/unknowns are recorded before
and after every OS effect. Failure or unrelated current bytes leaves RO/dark recovery-required;
the old baseline is never restored as rollback. An output matching an already recorded checkpoint
is resolved by status/readback, not another materialization. If write completion is unknown, inspect
the fixed current file: exactbefore may retry only the same intent/output, exactafter may settle
completion, anything else refuses. Holder/node/helper loss is not authorization to thaw.

Only after durable checkpoint completion and complete verified RO can native authorize original T
release and N thaw in the existing order. Precommit still starts native predecessors before dependent
predecessors; committed recovery serves its selected branch. Actual child startup verifies checkpoint
file digest/cursor against protected original status and current native branch readiness, then loads
that forward state. It does not replay cached lineage mutations or write a new snapshot before those
checks. Changed bytes after thaw refuse readiness rather than being overwritten. No digest+rename
CAS is claimed. Ordinary service resumes through its existing custodian only after exact startup
acceptance; any still-required unqualified projection retains debt/final reservations.

ADR0080's “New committed rows are preserved; rollback does not restore database snapshots” remains
unchanged. Its prohibition on restoring stale integration caches is preserved: this is a new
forward publication at the unchanged current byte basis under actual physical exclusion. ADR0248
requires an explicit decision5a permitting only this one enrolled selected-program state target,
not an implied extension of declaration restoration. OA proves the lossless typed reducer/domain
facts; native original source owner proves same-operation N/branch/child/head/exact input and
independently replays the exact OA export; holder proves fixed-target containment, metadata,
physical exclusion and required durability/readback. None substitutes for another owner.

## Descendants, retention and proof obligations

Original OA/native baselines, both progress streams, checkpoint intent/result/cursor, native
retention selectors and accepted lineage remain
immutable in the same protected record after source/storage/final reservation retirement. V1 does
not garbage-collect them, expire them, compact them away or replace them from a user projection.
An exact later descendant reads only through its actual native owner/qualified channel and current
source/selection lineage; possession of the cursor is neither authority nor proof. A later fresh schema3 operation
may capture the forward current file as its own new immutable baseline but retains references to
original field effects and their original protected authority. It cannot erase/upgrade predecessor
history. Original authority unavailable means visible recovery debt, not restoration from a cache.

Qualification must use actual selected/predecessor programs, complete physically RO N, real protected
persistence, populated original effects and their actual issuing owners. Show baseline and all
unrelated source bytes unchanged until the single fixed forward phase; typed cache retirement/Z;
predecessor staged import; exact output/head agreement; fixed-target before/after/status; no public
RW interval; byte-preserved unrelated fields/large numeric lexemes; all writer modes in the inventory below;
every lost append/checkpoint/sync/readback answer; wrong child/role/phase/head/target/body; predispatch
capacity boundaries; owner/helper loss during private RW; and post-thaw changed state refusing
startup without overwrite. Empty or writable-state fixtures/component simulation qualify nothing.


## Explicit ownership and positive reader scope

OA's exact reviewed reducer is the sole semantic state owner under nativeADR0041/0032. Native only
coordinates original identity/head/phase/exclusion and validates the finite delta; holder fixed
publication is that state owner's narrow delegate, never a second config/projection policy writer.
NativeProgress, retained-native-status, phase-specific source/admission readers and their successful
normal-readiness/other-process/reboot path are defined in the paired native protected-overlay contract in Supercode ADR0248. Native boot provenance,
T/L/R and initial source cut remain immutable; authorized checkpoint delta/current physical and
native overlay heads are separate. A schema2 reader's deliberate mixed/released refusal is not
relabelled support. Shared completion reservation includes BOTH streams, boot debt, index and the
native FIFO seal before any relevant effect. OA child status is audience-filtered to its typed R
stream and safe controls/readiness; it sees no native custody/protected launch data.


## OA finite inner fact grammar and barriers


Only these schemas may enter held programProgress. Each is the existing full typed value in its
source owner with explicit schema/protocol, bounded lengths/cardinality and exact native identity;
unknown fields/kinds refuse before effects. Native stores opaque OA payload and does not own it.

| Source owner | Inner kinds / typed atomic changes | Required awaited caller chain |
| --- | --- | --- |
| recovery-journal.mjs:18–53 | initialize selected journal; sequence/head/immutable entries | Constructor becomes a read-only validator until protected admission; create/open/flush/append returns awaited durable protected result. `durable=true` follows exact status/readback, never Promise creation. |
| lifecycle.mjs:69–102,149–152,199 | lifecycle-receipt, native-readiness, lifecycle-resume | createLifecycle initialization → journal admission; request handle → quiesce/pause+joined drain → receipt; compensate/committed close → Z → receipt; native resume → exact readiness → journal barrier → resume acknowledgement. |
| lifecycle.mjs:183–192 | mutation-intent/result/unknown | These remain ordinary pre-N/post-handoff publisher facts only. Held canonical recovery never enters generic mutate; old unresolved generic intents retain debt and forbid effectful replay. |
| room-receipts.mjs:39,108,114,124,136–142,171,221 | room-manifest, room-dispatch, room-terminal, room-status, room-close-intent, room-close-result, room-closed, room-disposition, room-retained-lineage, room-lineage-import | prepare → full manifest barrier → dispatch barrier → actual owner result → observe/terminal barrier; status → observe barrier; close-intent → actual close → result → closed inventory barriers. dispose/reconcile/import return only after protected disposition/import. Identical status facts dedupe without weakening fresh authority checks. |
| recovery.mjs:29,111,197/247,224,273,300,307 | recovery-admitted, provider-closure, placement-disposition, inverse-plan, recovery-cut, recovery-final-inventories, recovery-Z | bind → current native/provider admission → complete closed earlier effects → cut/demand → finite inverse-plan → each Room step/disposition → final inventory → Z. Every append is awaited before the next external call or acknowledgement. |
| recovery.mjs:181–184,288–293 | run-cache-disposition + exact selected runSeats tombstone; run-lineage-transferred + exact selected cache retirement | Replace append/delete/persist split with one `retire-owned-placement` or `transfer-owned-lineage` protected event. The reducer applies fact and matching owned-key mutation atomically, with expected placement digest. No standalone delete/persist fallback. |
| lineage.mjs:68,80; recovery.mjs:314–319 | lineage-offer, lineage-acknowledgement; predecessor room-lineage-import + accepted runSeats addition | offer → actual capable predecessor validates every current owner receipt → native durable actual-child acceptance → candidate reads acceptance → transfer fact; staged predecessor import is protected before OA checkpoint. No local under-RO persistence claim. |

`room-disposition` and `room-retained-lineage` are the two values of room-receipts.mjs's dynamic
kind at171. They are finite allowlisted schemas, not arbitrary kind admission. Original Room
manifests, terminal facts and imports cannot be overwritten or collapsed into a zero-debt snapshot.

## OA main writer modes

All mutation paths must select a persistence mode centrally; changing only journal.persist is
insufficient. The advertised capability is absent until every path below is covered.

| Mode / source path | Before N | Held N / sealed checkpoint | After verified thaw and startup |
| --- | --- | --- | --- |
| main.mjs:204–244 load/flush/temp/fsync/rename/cleanup,5sec save timer,60sec retry | Ordinary strict save; drain timer and all in-flight flushes before immutable baseline. | File writer unavailable; typed protected reducer only. No temp creation/rename/rm/fsync-as-write beneath N; no late timer fallback. After H, no OA recovery append or snapshot write. | Verify exact checkpoint bytes/cursor/current protected branch before first ordinary mutation; then same owner resumes its existing tracked persistence. |
| Initialization/migration765–797; forced first-loop996; lifecycle constructor199 | Complete required migration and strict baseline save before N. | Read-only validation only. Unsupported migration/state shape refuses before effects. | Startup cannot silently migrate or write a ready snapshot before checkpoint/lineage validation. |
| Ordinary projects/agents/borrowed/runSeats/access/reposts/pending:306,393,415,429,472–542,614–618,656,673,816,840,850 | Existing publisher semantics with joined drain. | Excluded; recovery may change only its selected journal, exact owned runSeats and protected cursor. | Resume only after accepted branch/readiness; unrelated state is never restored from baseline. |
| Native/provider invalidation822; stream callbacks996–1038;429backoff1047 | Abort readers and join every drain/pending callback; settle strict persistence before baseline. | No stream/retry startup, late callback save or cursor-reset write. Unexpected callback marks admission unavailable in memory/qualified IPC and retains debt. | Normal source admission installs its own streams and persistence only after exact startup check. |
| Heartbeat890–901; log fstat/futimes; heartbeat tmp+rename | May use ordinary file under its writer owner. | Disable file heartbeat and stdout file futimes. Diagnostics only qualified pipe outside N, bounded memory or IPC; no N log metadata writes. | Existing own writer resumes after normal admission. |
| pause930–937; signals960–965; parent disconnect969–988; final shutdown1057–1059 | pause aborts and joins streams/draining, strict flush, then acknowledgement. | Quiesce/disconnect/signals retain durable protected lifecycle or visible unknown; never finally-flush state file. After H, only read-only park/join and native terminal evidence; no false exit0. | Ordinary shutdown flush applies only to this actual admitted writer and current forward state. |
| prepare.mjs195–202 immutable artifact writes; qualify.mjs50 receipt output | Preparation/qualification runs outside held recovery under their normal owners. | Never runs under held N; no staging or receipt output admitted. | Later separately owned preparation only, no upgrade of old receipt. |



## Required three-owner PLAN dependency

This new mechanism requires independent OA ADR0037, native ADR0248 and RH2 ADR0070 extension PLAN
passes before implementation. The issuer bound is proposed finite-owner-results/v1 on fresh wirev2
and separately qualified storage207 with actual retired writer floor207. Accepted0069/0070/v1/206
proofs supply none of this guarantee. Actual positive source/runtime/catalogue/predecessor/writer
qualification remains required; native/OA review cannot approve the third owner by implication.
