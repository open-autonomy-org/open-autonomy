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
