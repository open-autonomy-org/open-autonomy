# ADR 0027: OA source associations and publication recovery

Status: Proposed. Independent constitution/design review precedes implementation; exact source review,
manual World evidence and merge precede acceptance. This record grants no migration or runtime acceptance.

## Context and evidence

The owner authorized OA's native-runtime and publication follow-ups after the ecosystem delivery. This record
owns the publication follow-up in [ADR 0025](0025-source-qualified-associations-and-replay.md), within the
[ecosystem boundary](0024-ecosystem-target-architecture.md) and
[retained-publication decision](0016-retained-source-publication.md). It does not adopt the deferred Supercode
PR 1090 or RH2 PR 316 protocols. Their designs remain historical external evidence, not an OA dependency.

The kit's actual rendered dependency is `@volter/supercode-orchestrator` 0.5.47 in
[the host manifest](../../packages/kit-hermes/base/.open-autonomy/package.json). Its public workflow stream
supplies backing-board/card, publication ID and sequence, plus an opaque continuation cursor. It exposes no
stable native home/log identity. Newly created boards are saved tag views over one task store; native enumeration
emits the backing store once. Existing independent backing stores remain readable. Neither a view name, a path,
nor decoding the cursor proves that two records or copied stores share native identity. The repository root's
older dependency lock is not evidence about this rendered artifact; manual verification names the actual pin.

[The cache](../../packages/kit-hermes/base/.open-autonomy/source-events.ts) currently keeps `board:card.id` and
drops publication attribution. [The publisher](../../packages/kit-hermes/base/.open-autonomy/publisher.ts) uses raw
card IDs for items and account-wide review/handoff note IDs. A refused `update()` can return `undefined` without
throwing, allowing its source cursor to advance. First matching attempts can also misattribute sessions when
distinct stores reuse IDs. This proposal changes OA associations and delivery, never native records or execution.

## Decision

### Explicit enrollment and custody

The owner's reporter configuration gains this block, required for the corrected reporter association format.
If it is absent, this reporter refuses publication with an explicit enrollment-required cause; it does not fall
back to raw-card identities, generate fresh contexts or adopt retained history silently. This publication-only
refusal does not prevent keeper/native execution from continuing under its existing authorization. These are
OA-issued association identifiers, not native identifiers or grants:

```yaml
publication:
  source_context: "<lowercase UUID v4>"
  stores:
    - { context: "<lowercase UUID v4>", backing_board: "<exact public data.board>" }
  custody: "<relative path to private custody JSON>"
  adoption: "<optional relative path to private adoption JSON>"
```

The owner enrolls the selected native runtime through its existing public configuration/door, generating fresh
random context UUIDs and committing the association configuration. No path hash or automatic current-uniqueness
enrollment is permitted. `source_context` identifies this OA adapter's selected custody context; each store
`context` identifies an explicitly approved backing-store association inside it. `backing_board` is an exact,
opaque public stream selector, not a universal task namespace. A saved-view name must not be enrolled in its
place. Selectors and UUIDs must be unique, nonempty and well formed; every observed backing store must have an
enrolled selector before any publication from the inventory. Unknown stores block that publication, rather than
being ignored or allocated another identity. This is one selected native stream, not a new multi-home service.

`custody` is required and names a local, non-symlink JSON file, resolved beside the reporter configuration; its
relative path must stay within that directory. No remote fetch occurs. Its exact shape is
`{version:1,generation,account,apiBase,sourceContext,stores,nativeRuntime,operator,statement,evidence,previous?}`,
where `stores` repeats the configured `{context,backing_board}` entries, `nativeRuntime` repeats the selected public
`{kind,root}` declaration, and `operator`, `statement` and `evidence` are nonempty strings supplied by the custodian.
This is an explicit assertion under existing filesystem authority, not a cryptographically authenticated native
identity. Initial generation is 1 without `previous`; the publisher validates equality with configuration and
persists the exact declaration/digest before receiving publication obligations. New enrollment requires both state
files to be absent; retained files require the adoption procedure below. The logical base is the configured
platform's `/v1` endpoint, including its path; a forwarding valve's
temporary transport address is recorded separately and is not a backend reassignment. Credentials are never
recorded, decoded or used as provenance. Configuration equality checks the declaration; it cannot prove that a
backing store has not been replaced beneath it. The operator must stop the publisher before moving, replacing,
importing or restoring source/state and explicitly attest continuity or enroll a distinct context. Unexpected
context changes and uncertain custody refuse startup; identical paths, IDs, titles or cursors cannot resolve them.

Moving the same owned source and its OA state together can retain its contexts through an explicitly reviewed
custody declaration after teardown. It increments generation by one and supplies
`previous:{custodyDigest,reporterDigest,cacheDigest}` for the exact stopped prior files. Startup validates those
digests and unchanged account/API/context IDs/association bindings before persisting the next declaration; a
lost acknowledgement retries that same declaration, not another increment. This continuity operation permits a
changed selected runtime root or backing selector only when explicit evidence accounts for it. Unknown copies,
inconsistent declarations, stale inputs, unsatisfied pending delivery or destination reassignment refuse before
effects. The next stream starts with a full snapshot, retaining old cursor evidence and bindings. A copied source
intended as a genuinely separate publication requires fresh contexts and fresh state; it cannot reuse active
receipts. No automatic rename, replacement or second copy of old history occurs. Native provenance beyond the public contract remains an upstream
gap. This adapter cannot detect an unreported indistinguishable replacement and makes no such guarantee.

Each tenant reporter enrolls its own account/API-bound custody declaration and private state. It may explicitly
share the selected source/store context IDs when observing that same owned source, but copying an organization's
custody declaration unchanged does not enroll another account. Missing tenant enrollment affects that reporter's
publication, not the project's existing native execution.

### One association for every OA projection

Let `J` be JavaScript `JSON.stringify` on the specified array without Unicode normalization,
and `H` be lowercase hexadecimal SHA-256 of the supplied UTF-8 string (or exact bytes for retained-file digests).
The private association key is
`H(J(['oa.native-item',1,source_context,store.context,card.id]))`. Native values remain opaque and unchanged.
For a new association, its OA item ID is `oa_` plus that hash, within the existing eighty-character item alphabet.
The stored binding contains the full tuple and item ID; hash equality without full-tuple equality is a refusal.
An adopted association uses its existing item ID instead. No title, status, current uniqueness or board view
membership participates. One task observed through several saved views resolves to the same backing association.

Timeline items, native review/handoff notes and session item references all obtain their item ID from this one
resolver before publication. The native card ID and backing selector remain separately available to existing
native controls; an OA item ID is never a native scheduling argument. Repository-document identities and existing
folding policy remain unchanged; duplicate destination IDs or conflicting aliases are detected before effects.

New note IDs are `oan_` plus
`H(J(['oa.native-note',1,associationKey,kind,nativeEffectId]))`, where `kind` is `review` or `handoff` and the effect
ID is the public native review ID or attempt ID respectively. Published 0.5.47 exposes review IDs as native
integers and attempt IDs as strings. A review ID must be a nonnegative safe integer and is encoded losslessly as
its canonical decimal string; attempt IDs remain their exact nonempty opaque strings. Keep the original public
ID/type in evidence; reject unsafe or nonintegral numbers instead of inventing an ID. A changed
payload under the same effect ID is a visible conflict, not another note. Missing stable effect identity needs an
exact adopted alias or remains pending; array position, verdict, timestamp and text are not identity substitutes.

### Explicit legacy adoption

Existing source-cache version 1 and reporter-state version 2 are never treated as fresh enrollment. Before an
upgrade can publish, the owner supplies one private adoption document, reviewed with its concrete provenance.
It contains `version:1`, the account/logical API base, source/store contexts and selectors, operator custody
statement/evidence references, SHA-256 digests of the exact retained cache/reporter bytes, and these entries:

- `items`: `{storeContext,nativeCardId,itemId}` retaining each existing public item binding.
- `notes`: `{associationKey,kind,nativeEffectId,noteId,legacyKey,acknowledgement}` preserving original aliases.
  The acknowledgement is either the full retained/publicly observed `UpdateRecord`, or
  `{kind:'legacy-noted',key}` naming an exact marker in the retained `noted` set. The latter preserves suppression
  only; it is not a verified body receipt and cannot justify a new alias or replay an unknown request.
- `sessions`: `{platformKey,nativeSessionId,associationKey?,itemId?}` with exact retained checkpoint/continuation
  references and positive existing session binding evidence where available. Missing association stays unknown.

All entries must fit the enrolled context, agree with retained state and existing positive public evidence, and
have no many-to-one ambiguity or conflicting destination IDs. Operator custody evidence establishes which retained
files/source were previously used; matching current records alone does not. Unknown legacy ownership refuses
activation before effects. Adoption does not invent old request bodies, timestamps, publication IDs or sequence
values missing from those formats. Full transcript checkpoints, continuation counts, paused native IDs, old note
markers and aliases survive unchanged. A backup of the exact legacy bytes is retained privately.

Adoption is recorded once with its input digests in the new state. Restart never reapplies it; changed inputs or
an attempted second adoption refuse. After adoption, the source obtains a genuine full native snapshot by omitting
`--after` once, retaining the old cursor as legacy evidence. Snapshot completion validates all associations before
effects; this is stream resynchronization, not board polling. Missing historical records remain retained aliases,
not evidence of completion. Explicit later custody/rebinding review is separate from this one-time format upgrade.

### Private state, serialization and source acknowledgement

Reporter state advances to version 3, preserving every existing field and adding `publication` with:

```text
enrollment: {version:1, account, apiBase, sourceContext, stores,
             selectedRuntime, custody, adoptionDigest?}
associations: [{key, tuple, itemId}]
noteAliases: [{associationKey, kind, nativeEffectId, noteId, legacyKey?, acknowledgement}]
sessionBindings: [{platformKey, nativeSessionId, associationKey?, itemId?, evidence}]
pending: [{obligationId, kind, associationKey?, wire, wireDigest, expected, sourceObservation}]
receipts: [{obligationId, wireDigest, result}]
```

The cache advances to version 2. It retains the enrolled source context and rows
`{publicationId,sequence,board,card}`, with original nonempty public publication ID, nonnegative safe-integer
sequence, nonempty backing selector and opaque card ID. Cache row keys use `J([storeContext,card.id])`, never
delimiter concatenation. It also retains committed cursor and a pending complete observation/candidate
cursor. Snapshot rows stay staged until a genuine `snapshot_end`; incomplete snapshots never replace inventory.
Each live observation is saved before its effects. Cursor values remain opaque positions, never association IDs.
Unknown state versions, malformed rows or an enrollment mismatch fail loudly without overwriting state.

The callback interface is `changed(snapshot: SourceSnapshot): Promise<void>` where the readonly snapshot contains
`sourceContextId`, complete attributed card rows and `proposedCursor`. It carries no asserted native home/log.
The cache retains the pending observation until the callback finishes. The resolver preflights the entire relevant
inventory, then persists association bindings and prepared obligations before sending. An interrupted upgrade or
event retries those exact obligations; it does not recalculate successful effects under new IDs. Completed receipts
are persisted before the cache commits cards/cursor and clears the pending observation. A stop in either file write
window recovers by receipt/obligation identity. Resync preserves pending obligations and mappings while obtaining
the next full snapshot; source absence does not fabricate a task or session end.

One publisher owns the state and selected account timeline. State writes, source callbacks, retry delivery and
session-binding changes run through one serial queue. Private files/directories use modes 0600/0700; durable saves
write and fsync a temporary file, rename it, then fsync its parent before acknowledgement. A local exclusive lock
directory contains an owner nonce and process identity; another owner refuses. No age-based lock theft occurs.
Uncertain ownership needs verified teardown and explicit operator release. This fences one local state directory,
not two hosts: concurrent independent writers for the same account timeline are unsupported and must be prevented
by the owner. Copies of active state are not another lease. No identity service or daemon is introduced.

### Prepared requests and concrete receipt checks

For a new note, redact the full source note text first, then apply the kit's existing `slice(0,2000)` text bound.
Prepare one `updateEvent()` with its resolved item, stable note ID, nonempty resulting text, optional valid session
and fixed valid ISO timestamp. Apply the SDK's public redaction helper described below before retaining the
request/expected content; never retain an unredacted note request when the shared helper can normalize it.
If redaction would change a session reference,
refuse the association rather than invent another session key. Missing native time is stamped once when
the obligation is prepared, never again on retry. Store `wire = JSON.stringify([event])`,
`wireDigest = H(wire)`, and `expected = {account,item_id,id,text,session?,ts}` before any HTTP call.
The expected timestamp is ISO-normalized; future/invalid native timestamps use the preparation timestamp so the
existing server does not silently substitute a different time. `obligationId` is the stable note ID. On recovery,
validate the retained bytes/digest and serialize their parsed event through SDK `send()` identically to `wire`.
No trusted digest or new field is sent to the server.

The existing public write door is `POST /v1/agent/events`, exposed by `OpenAutonomy.send()`. It returns HTTP status,
top-level outcome and per-event results; successful update results include the full
`{id,account,item_id,ts,text,session?}` record. Require successful HTTP/top-level/per-event outcome and exactly one
matching update receipt, including all expected fields. First-write-wins ID replay returns that existing record
without server payload comparison: `idempotent:true` alone is insufficient. A mismatch is a visible association
or payload conflict. A refusal, missing result, invalid JSON or transport uncertainty retains the obligation and
candidate cursor. Persist the verified full receipt before clearing the pending obligation. A landed write whose
response was lost retries its original request and verifies the returned indexed record; no duplicate is created.

`OpenAutonomy.update()` currently hides refusal details and may return `undefined`; the adapter uses `send()` for
this checked delivery. No generic SDK/backend receipt route or storage extension is required. Intake currently
applies [redactDeep](../../packages/backend/src/redact.ts) to event data before ledger normalization, so raw
unredacted content is not the expected receipt representation. The smallest generic SDK addition is a public
`redaction` module exporting the existing pure `redactSecrets`/`redactDeep` policy, and an exported
`normalizeRoadmap(unknown): Roadmap | undefined` in `sdk/roadmap` containing the existing ledger normalizer.
Relocate these existing implementations rather than copying a second regex/normalization policy. Backend
imports/re-exports them unchanged; it retains redaction at intake before text clipping or roadmap normalization,
validation, defaults and receipt behavior. This adds backwards-compatible pure SDK exports, no dependency,
authority or server negotiation. The kit's vendored SDK receives the same helpers. Older callers and wire formats
continue unchanged. A future different normalization policy may produce a visible receipt conflict; matching npm
versions alone never prove authority or native provenance.

`item(account,itemId)` exposes only
the latest hundred notes/sessions; a positive exact match is evidence, but absence cannot prove missing history.
There is no harmless public update-by-ID lookup. POST replay is permitted only for a proved prepared obligation;
using it to discover an unknown legacy ID could create a note and is forbidden.

Timeline publication is also a persisted single-event obligation using the existing timeline CloudEvent type,
subject `project` and `{source,roadmap,by}` payload. Preserve the existing source/by values and document normalization.
Prepare and verify the expected model through public `normalizeRoadmap(redactDeep(roadmap))`. Before sending,
check that normalization preserves every resolved item ID and item count; a transformed identity or omitted
inventory is a refusal rather than silent reassociation. Redact `by` before its existing eighty-character bound;
validate the unchanged source against its existing lowercase forty-character alphabet. An omitted `by` is derived
from the authenticated key ID by the server, so no client expectation about that value is invented. The current
publisher explicitly supplies `reporter`; its value is preserved.
Its `expected` records `{source,by?,roadmap}` and its obligation ID is `oat_` plus `H(wire)`.
Send one obligation at a time, after its prerequisite note receipts. Require the existing successful revision or
unchanged result; a returned revision must agree with the expected source and normalized document. For a new
revision its explicitly supplied `by` must also match; the existing unchanged contract compares document/source and may retain the
earlier revision's `by`, which is recorded as returned without claiming this request replaced it. Persist
the complete returned result with the exact request digest. The complete document remains ordered behind
its pending predecessor, so an older retry cannot overwrite a newer local observation. This does not add server
compare-and-swap, universal event-ID replay or multi-writer protection. A batch is not transactional: if batching is
used elsewhere, already applied prefixes remain applied; this adapter uses one effect per checked request.

### Frozen session attribution and existing transcript recovery

Before constructing a transcript publisher, resolve all native attempt/session matches, rather than choosing the
first. A unique positive native session-to-task relation resolves through the item association. A workspace match
alone cannot adopt legacy history. Ambiguous matches remain unknown; a conflicting known relation refuses that
session's publication. Public `session(account,key)` returns its item binding and retained transcript tail;
`sessions(account,limit,before)` supports pagination when positive legacy binding evidence needs enumeration.
An inaccessible read is unknown, not absence. Verify a known existing `item_id` against the frozen local binding
before any start/turn/end. Verify that SDK redaction leaves each item/session reference unchanged as well.
Preserve it unchanged; a conflict refuses instead of rewriting it through `ended`.
An absent item binding may be added only with positive native attribution and explicit persisted binding evidence,
never by current uniqueness. Persist each new/final binding before sending it.

Keep platform session keys, continuation suffixes, turn offsets, per-batch sequence/digest/end checkpoints,
publication policy and treasury attribution unchanged. Retained checkpoint evidence survives the state upgrade;
the existing transcript tail alone cannot verify an arbitrarily old prefix. A source with a colliding native
session key must not attach to another source's existing session; without proved continuity it remains a visible
unsupported conflict, not a new key scheme. Transcript obligations/checkpoints are separate from board-source
acknowledgement: acknowledging a board cursor does not claim all sessions were delivered. Only existing native
lifecycle evidence supplies an end; this record does not authorize new end inference or transcript rewriting.

## Alternatives, ownership and acceptance

Qualifying every ID by a saved-board view duplicates one native task. Deriving source identity from paths/cursors
pretends to supply missing native provenance. Adopting the external migration would broaden this OA correction.
Keeping explicit adapter custody and durable local associations avoids those changes, at the cost of operator
enrollment and visible refusal where old provenance or native capabilities are missing.

Implementation belongs in the kit's association helper, source cache, publication adapter and transcript binding
integration, with the pure SDK normalizers and canonical SDK documentation clarifying current replay/receipt limits.
Core service ownership, routes, scopes, normalization behavior and receipt storage remain unchanged. The native-runtime record owns runtime selection/setup;
neither record silently changes the other's configuration or shared files. Exact implementation must preserve
audience, native controls, repository-document folding and existing transcript reconciliation.

Manual acceptance in the ordinary disposable World must exercise the actual pinned native public workflow and OA
SDK: one task in multiple saved views; explicitly enrolled independent stores with equal card IDs; exact legacy
adoption retaining item/note/session IDs; unknown/ambiguous adoption refusal before effects; failed and uncertain
note delivery followed by restart and exact receipt recovery; same-ID/different-payload refusal; timeline failure
after a note lands; incomplete snapshot/resync recovery; and transcript continuation with a preserved item binding.
Copy/restore/context changes must refuse until explicit custody/adoption, with no native work changed. Cases
requiring unavailable native creation/import/session doors remain named limitations, never injected event evidence.
Different reviewers assess the proposed contract and exact source/manual evidence. No feature PASS is claimed here.

## Constitution assessment

- **Only the SDK is real:** public native doors feed an OA-owned adapter; all public effects and evidence use OA
  SDK contracts. The backend learns no native store layout or harness-file identity.
- **The platform shows; it does not steer:** associations/recovery narrate existing work. Native IDs/authority,
  controls, runtime execution and Workplace permissions are unchanged.
- **Every spend on public books; settled cents only:** existing account/session keys and treasury receipts stay
  intact; no duplicate treasury, charge estimate or spend route is introduced.
- **Repository authority and audience:** committed enrollment declares a projection context, not a grant;
  filesystem custody and publication privacy remain existing boundaries. Private state contains no new credentials.
- **No automated tests; nothing develops against a real API:** this proposal is documentation only. Subsequent
  claims require manual real-path use inside the World and independent review, never a retained test harness.
