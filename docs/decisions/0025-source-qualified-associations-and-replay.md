# ADR 0025: Source-owned identities and retained OA publication

Status: Proposed. OA publication boundaries only; independent constitution review and merge are required before
acceptance. External migration designs are preserved and deferred, not prerequisites for the OA ecosystem target
in [ADR 0024](0024-ecosystem-target-architecture.md). No migration implementation, activation or release is claimed.

## Context and sources

The owner clarified on 2026-10-04 that Workplace is OA's UI layer with access involved: without a person pressing
authorized controls, the project continues normally. This does not remove the current RH2 Task, agent or books
projections. [ADR 0018](0018-the-workplace-integration.md) retains consented controls and team-role adoption; the
[canonical mapping](../workplace-mapping.md) retains the integration's current behavior and capability limits.

Earlier inspection considered board-qualified identities to distinguish same-ID records in separate native stores.
[Supercode ADR 0015](https://github.com/volter-ai/supercode/blob/main/docs/adr/0015-tasks-carry-creator-sponsor-and-tags.md)
and its [public workflow implementation](https://github.com/volter-ai/supercode/blob/main/sdk/orchestrator/board/cli.mjs)
now specify newly created boards as saved tag views over one organization task store. The same task in several
views keeps one native identity; view membership cannot define another task identity. Existing independently stored
boards remain readable. Their provenance, ID generation and import policies are external native responsibilities,
not decisions for OA to infer or repair by adding a board slug to every task ID.

The broader publication/replay designs in [Supercode PR 1090](https://github.com/volter-ai/supercode/pull/1090) and
[RH2 PR 316](https://github.com/volter-ai/runhuman-2/pull/316) are preserved and deferred to their owning products.
Their proposed encoding, inventory, revision, adoption and durable-state protocols are not adopted by this OA
record. Native identity issues have been handed to the native product's manager. This OA architecture delivery
adds no resolver implementation or dependency on completing that cross-repository migration.

## Proposed decision

### Native authority and OA associations

The company [work ontology](https://github.com/volter-ai/volter/blob/main/contracts/ontology.md) remains canonical.
Native tasks, agents, attempts, schedules, sessions and completion belong to their native system. OA owns the
association of a published item, note or session with that source under the selected OA backend/account context.
RH2 owns its Task/Room/agent associations and workplace grants. No shared identity database, daemon, orchestration
engine or universal project-to-arc mapping is introduced.

Use stable identities and provenance supplied by the owning public contract. Multiple saved views of one task must
not create several task identities. Genuinely distinct records in separate sources or retained independent stores
need native provenance that distinguishes them; matching raw IDs, titles, view names or current uniqueness are not
proof. Retain relevant source context without turning presentation membership into native identity. Missing native
agent/session attribution stays unknown, including Hermes's current unbound own-loop sessions.

### OA publication and replay responsibility

OA's kit remains responsible for its [native source cache](../../packages/kit-hermes/base/.open-autonomy/source-events.ts),
[publication adapter](../../packages/kit-hermes/base/.open-autonomy/publisher.ts) and
[transcript reconciliation](../../packages/kit-hermes/base/.open-autonomy/reporting.ts).
The [retained-publication contract](0016-retained-source-publication.md) governs acknowledged native cursors and
OA effects through their public SDKs. Teams or RH2 installation is not required for a local OA publisher.
The current adapter's raw-card item and review/handoff note IDs can collide when genuinely distinct native records
reach one OA account. Correcting that projection remains an OA-owned follow-up, preserving existing IDs and receipts;
it does not require implementing the deferred native/RH2 migration as part of this architecture delivery.

Timeline items, session item attribution and review/handoff notes must consistently refer to the same proven
association. Preserve existing public item IDs, historical notes, session references and acknowledged receipts.
OA item IDs must satisfy the existing eighty-character alphabet/bound; note identities remain account-wide under
the existing update contract. A future adapter correction needs its own reviewed owning details before changing
IDs, retained state or recovery behavior; the deferred board-qualified resolver draft supplies no such authority.

Retain and reconcile pending OA publications through existing intake/replay contracts. A failed or ambiguous write
is not an acknowledgement; an inaccessible or bounded public read does not prove missing history. Do not guess
legacy provenance, silently replace an associated destination or append a second copy of an acknowledged note.
Keep OA session keys, transcript-turn replay, continuation behavior and treasury attribution unchanged. Source
absence supplies no session end or task completion. These remain OA responsibilities even while upstream native
identity and external migration work are deferred.

### Scope and acceptance

This record changes no execution, schedules, funding/spend rules, audience, federation, organization model or
resource grants. Rendering, bindings and mirrors grant no new autonomous work authority; authorized controls keep
the existing contracts. Native and RH2 migration implementation belongs in those products and is not a gate on
accepting the OA responsibility map. Any later OA resolver work must use the actual native identity contract,
preserve destination history and receive independent design/source review and manual World evidence.

## Alternatives and consequences

Defining task identity from every board/view would duplicate one native task and couple OA to presentation layout.
Guessing identity across independent stores would misattribute history. Keeping source authority external and OA
associations local avoids both; unresolved provenance can leave a projection pending without changing native work.
This documentation correction claims no migration runtime acceptance, release or deployment.

## Constitution assessment for independent review

- **Only the SDK is real:** OA consumes public native contracts and publishes through its SDK; core does not parse
  harness files, native stores or view layouts.
- **The platform shows; it does not steer:** association/replay preserves projection truth and existing controls,
  without adding native execution authority.
- **Every spend on public books; settled cents only:** preserve account, session/item attribution and receipts;
  introduce no second treasury, estimate or charge.
- **Repository authority, secrets and audience:** identity mapping does not widen owner bounds, roster authority,
  source/session grants or publication policy. Custody remains with the existing owner.
- **No automated tests; no real-API development:** this is a prose-only scope correction. Any subsequent behavior
  claim requires manual disposable-World evidence and a different reviewer's exact-candidate verdict.
