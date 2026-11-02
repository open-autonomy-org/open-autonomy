# ADR 0016: Publish from retained native source events

Status: Proposed. Acceptance requires independent constitution review and merge.

## Context and sources

The locked mirrored ontology's C2 (Volter manager card `t_3371fdde`) replaces board polling and the
old reporter with published card, session, membership and agent changes. Its shared contract is
[the product-neutral ontology](https://github.com/volter-ai/volter/blob/main/contracts/ontology.md).
Supercode's implementation decision is
[ADR 0008](https://github.com/volter-ai/supercode/blob/wt/t_3371fdde-c2/docs/adr/0008-published-ontology-events.md).
The native workflow owns cards; this kit owns publication policy, acknowledged platform effects
and repository documents. A missing native record supplies no session end.

## Decision

The kit's `publisher.ts` consumes the public `supercode workflow events` door. `source-events.ts`
holds an app-owned card cache and acknowledged cursor. An initial snapshot establishes the
inventory; retained changes update it. Source replacement requests a new snapshot. The publisher
acknowledges after platform publication, so a crash repeats an idempotent effect. Existing transcript
receipts, continuation keys, privacy policy and platform identities survive this replacement.

Native sessions use the harness SDK's index and transcript subscriptions. Only native lifecycle
evidence supplies an end. A retry timer retries failed publication; it does not load a board.
Repository document notifications refresh committed `origin/main`, never substitute a working tree.
The platform's owner-control command still has its own cadence: it reads that command and native
schedule authority, with board candidates supplied by the retained cache.

The native stream is authorized by filesystem custody and is usable inside the existing executor.
Teams separately publishes the same source's Org events to consented app subscriptions. This does
not put platform credentials in native source state or give the platform authority over cards.

## Alternatives and tradeoffs

Periodic snapshots repeatedly read every board and can confuse discovery absence with completion.
Requiring a Teams installation for every local executor would change deployment and custody for
work that already has a native owner. The public native stream keeps that existing authority while
Teams provides the organization boundary for installed integrations. Cached snapshots occupy disk;
their file has the same private permissions as publication receipts.

## Consequences and constitution review

The kit and generated host entrypoints launch the publisher. The source cache and transcript
receipts remain app-owned; Supercode publishes no Open Autonomy policy. This follows the
constitution's “The platform shows; it does not steer” and repository-authority invariants:
the platform renders published state, and owner control continues through the existing explicit
native doors. Publication respects the public/team/owner audience policy. Ledger accounting,
spend authority and release approval are unchanged. Independent review must confirm these
boundaries and the complete C2 delivery before acceptance; this record claims no observed PASS.

## VO-3454: independent transcript delivery (proposed)

The publisher previously awaited each complete transcript reconciliation in
the board publication writer. One oversized Codex source therefore held every
later session and board acknowledgement behind its reconstruction and delivery.

Transcript work now runs in four independent lanes, each with its own public
harness SDK reader. A native session has at most one active reconciliation;
source changes retain one later pass for it. Board associations still commit
through the publication writer, which is released before transcript reads or
turn delivery. Per-session checkpoints, continuation keys and failure backoff
keep their existing semantics. Native reads have cancellation through shutdown
and no transcript-size deadline; another lane continues while a large source
is read. Shutdown aborts and joins active transcript work and closes every
reader before releasing publication ownership.

The alternative of concurrent promises through one serialized native reader
would retain the cross-session wait. Separate SDK readers keep native parsing
with Supercode and bounded concurrency with this publication adapter. This
changes no audience, spend authority, credentials or native lifecycle evidence
and follows the constitution's “The platform shows; it does not steer.” The
card's independent review judges this amendment; it is not an owner ruling.

## Coalesced, incremental passes (proposed)

Every session-index event, followed-transcript event and board delivery queued its own full pass (native
declarations, the whole board with every card's notes, every session, documents, timeline) behind the publication
writer, and each board delivery deep-copied and froze the whole card inventory twice. On the volter-org board (4,219
cards, 95 MB) a pass cost about 1 s of the publisher's main thread and a delivery 0.8-2.9 s, measured on copies of
its retained state; the trigger stream kept one core busy.

A change now marks what it touched (the board, a session, native declarations, documents) and asks for a pass.
Changes fold into one pass once their burst settles (one second after the latest, at most five seconds after the
first, the cadence of the board poll this record replaced); a board delivery runs its pass at once and acknowledges
its cursor after it, as before. A pass publishes what changed: the board's notes for the cards whose source rows
changed, the sessions whose descriptor, transcript, card or native record changed, documents when main may have
moved, the timeline when the board, a project's committed main (its CHANGELOG.md and ROADMAP.md) or its revision
interval did. The source validates and freezes a card once, when its frame arrives, and every later inventory shares
that immutable row. Keys, item IDs, association preflight of the whole observation, the observed-card view of a pass,
retained obligations and cursor acknowledgement are unchanged.

The session index is a session's only change signal. A transcript that grows or is rewritten changes its descriptor
(a Claude Code or Codex row's `updated_at_ms`, a Hermes row's `message_count`), and the index says it `updated`; read on the volter-org MacBook, one Codex home's index said 8
`updated` in 5 s across its 4 live sessions. The publisher no longer follows each published session as well. Those
follows were one more subscription per live session on the shared harness reader, and each opening read its source in
that reader's single harness serve. When this record's first coalesced release reached volter-org, the follow openings
passed their 30 s request timeout (54 times), each was reopened 5 s later while the serve still worked the abandoned
one, and the reader's subscription cap (800 refusals) and the serve's waiting-caller cap (121 refusals) filled, so every
pass's native reads were refused and board deliveries stopped committing. A transcript change marks its session and
native declarations; a session that appeared or left, or a change to the profiles' declarations, also marks documents,
since documents read the home's profiles, jobs and skills and committed main, never a transcript.
This changes no audience, spend authority, credentials or native lifecycle evidence.

## VO-3758: retained reader affinity and retirement (proposed)

Supercode's [ADR 0256](https://github.com/volter-ai/supercode/blob/main/docs/adr/0256-publisher-affinity-and-scan-store-admission.md)
places disposable native scan resources under one durable machine authority. The kit keeps
four readers and assigns each exact native locator to one reader generation across complete
reconciliations. An OA continuation key does not change that assignment. A busy assigned
source stays pending while other lanes drain; each native session still has one active pass
and one coalesced later pass. The board writer remains independent, and native waits retain
their existing unbounded same-lane semantics.

Descriptor removal, locator replacement and reader loss retire the affected whole reader
generation through the public SDK close door. Assignments remain held until its active work
has joined and close confirms retirement. Reappearing and surviving sources wait behind that
barrier. An uncertain close preserves the old assignments and cannot attest clean retirement.
The SDK composes its canonical machine resource provider; OA creates no private scan budget.

Ordinary shutdown joins every reconciliation, delivery, command, controller and native Source,
then obtains each serve's joined `harness.v1.sessions.scan_resources.retire_readers`
acknowledgement before closing its transport and releasing the OA writer lease. Transport
close may force an exit and cannot replace that acknowledgement. A publisher acknowledges
retirement on its private parent channel only after those joins succeed. The stack binds that
acknowledgement to the exact launched publisher generation and also observes its exit. The
install owner retains the complete stack result, bound to the exact install/source transaction,
before removing readiness state. A deadline or forced/unknown exit is failure, never an
acknowledgement. Source handover consumes this evidence; no administrative boolean can replace it.
An older stack's existing bounded stop still permits closed lifecycle adoption, but retains
an explicit unavailable retirement result. It cannot qualify the first resource grant. A
capable predecessor must supply its full receipt before its resources can be called retired.

The private inventory includes every publisher's actual stdio allocation hosts, read from that
host's capabilities reply, with its PID, canonical launch entry and implementation entry. A
retirement reply must match that exact observed host. Unknown/missing host identity leaves the
census incomplete. Confirmed publisher/host receipts fold into a monotonic count and SHA-256
chain, retaining the most recent 64 exact receipts. Up to 4,096 unresolved publisher generations
remain in the live inventory; none is evicted. At capacity only a new publisher/restart is
refused, while other services keep running. The stack's durable ready/retirement record carries
the summaries, so ordinary restarts do not grow in-memory history without limit.

The current kit inventory also names the exact tracked nonpublisher controller entries: the
prepared valve/hookline scripts and selected native orchestrator services. Unknown entries,
unacknowledged exited publishers and incomplete host snapshots keep the census incomplete.
This supplies process identities for the source owner's independent OS reading, never a claim
that an unlisted transient helper has retired or cannot allocate resources.

This extends the ordinary shutdown proof, without changing ADR 0027's separate dead-parent OA
writer recovery: recovery never infers that private SDK children have retired. OA item IDs,
session keys, continuations, checkpoints, audience rules and frozen attribution remain unchanged.
The public books and their writer custody stay with OA; native reconstruction and disposable
resource retirement stay with Supercode, following “The platform shows; it does not steer.”
Independent constitution and implementation review is required; this proposal claims no live proof.
