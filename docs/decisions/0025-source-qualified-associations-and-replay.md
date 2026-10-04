# ADR 0025: Source-qualified associations and replay

Status: Proposed. Design only; independent architecture and constitution review and merge are required before
acceptance. No migration implementation, activation, production adoption or release is authorized by this record.

## Context and sources

The owner clarified on 2026-10-04 that Workplace is OA's UI layer with access involved: without a person pressing
authorized controls, the project continues normally. This is runtime invariance, not a request to remove the existing
RH2 Task, agent or books projections. [ADR 0018](0018-the-workplace-integration.md) retains its consented controls and
team-role adoption; [ADR 0024](0024-ecosystem-target-architecture.md) retains product ownership. The
[canonical mapping](../workplace-mapping.md) describes current associations and capability limits. This proposal
supersedes neither record and changes no native execution, treasury, audience, federation or organization policy.

Source inspection on 2026-10-04 found three connected correctness gaps:

- Teams' board publisher allocates one source per native home but identifies a task as `source:card.id`, with board
  slug only in metadata. Its server's resource-head key and revision guard can collapse or refuse same-ID cards on
  different boards before RH2 reads them. A downstream board-aware map alone cannot repair that loss.
- The publisher's initial snapshot skips child and completed cards; its single maximum sequence for a home compares
  independent board logs. A high-sequence board can conceal a lower-sequence board's closed-card change.
- RH2's apps retain narrower card/Room/agent keys; OA caches `board:card.id` but publishes raw card IDs and raw-ID note
  and session references. Normalized/truncated keys can collide. OA rejects duplicate timeline IDs as a whole and
  accepts item IDs only matching `[A-Za-z0-9][A-Za-z0-9._-]{0,79}`; update identities are account-wide.

These are association and projection failures. Native records remain authoritative; correction must preserve their
IDs and behavior and the destination IDs, history, grants and acknowledged receipts already associated with them.

## Proposed decision

### Identity and ownership

The company [work ontology](https://github.com/volter-ai/volter/blob/main/contracts/ontology.md) remains canonical.
The tuples below identify integration associations, not new native Task or Agent definitions:

| Association | Source identity | Destination context |
| --- | --- | --- |
| Native card → RH2 Task; live arc → Room | Teams origin, team ID, source ID, native board slug, native card ID | RH2 origin and organization ID |
| Native agent → RH2 agent principal | Teams origin, team ID, stable native agent ID | RH2 origin and organization ID |
| Native card → OA item | Selected native source/home identity, board slug, native card ID | OA backend origin and account |

Agent identity is never board- or source-scoped: the same agent on several boards remains one RH2 principal. A main
session change rebinds an existing seat only under the native owner's access contract; it creates no agent identity.
Missing native attribution remains pending, including Hermes's current unbound own-loop sessions. An OA project is
not universally an arc, board or Room. Origins, identifiers and source selection come from the configured owning
contracts; names, paths, case folding or apparent uniqueness are not identity proof.

Integration apps own their association records and resolver contract. RH2's three apps implement the same contract
in their own private state/configuration; they may consume the same reviewed read-only adoption manifest. No central
identity database, daemon, shared execution runtime or core interpretation of outside IDs is introduced. State is
versioned and fenced to its source and target deployment context; a changed origin, team, organization, backend,
account or selected native source refuses silent reuse and requires explicit, reviewed adoption.

### Teams publication and inventory

Supercode owns the producer, published-event server and connector contracts. Retain one Teams source per home;
creating a source per board would consume the machine's existing sixteen-source allowance. Version 2 identifies a
task resource with a bounded, opaque board/card-derived ID under that source's required prefix. Derive the suffix
from a domain-separated hash of an unambiguously encoded, versioned tuple; retain raw board/card IDs and namespace
version in metadata and verify them when resolving. No delimiter concatenation, title matching, slug normalization
or truncation of the raw identity substitutes for that tuple. Validate the ID against the owning API's bounds before
publication; a stored hash collision with a different tuple refuses rather than overwriting it.

Publication event IDs and idempotency keys must include the namespace version and qualified resource identity,
beside the existing issuer/team/source and native publication identity. Reusing a legacy event ID with a changed
resource or body would produce `idempotency_conflict`; do not rewrite old events or signed webhook receipts.

The version-2 baseline is a complete authoritative inventory from the public native workflow stream, including
child, completed, archived and removed heads needed for reconciliation. Consumers retain their existing selection
rules: inventory completeness does not replay historical closed arcs into new operational Rooms, seats or work.
Projection eligibility follows the current contract and trusted existing association. Track positions per native board and log
identity, using the native stream's inventory and cursor contract; never compare independent board sequences with
a home-wide maximum. Persist inventory, namespace version, replay positions and outstanding delivery obligations
so interruption resumes deterministically. A partial snapshot is not a committed baseline. Source reset, changed
native log or board inventory, retention loss and refusal require an explicit resync; absence alone is not completion.

The owning producer contract must specify how native log incarnations map to monotonic published revisions. A reset
cannot silently reuse a resource/revision pair already acknowledged by Teams, treat a conflicting old head as success,
or attach a recreated source to existing associations without retained provenance or explicit adoption. Correcting
this publication boundary does not change native IDs, mutate native boards or reconstruct unavailable history.

### Existing associations and legacy heads

Adopt an existing destination only from exact retained provenance or an explicit operator mapping of the complete
source tuple and destination context to its existing ID. Record that evidence with the association. Current unique
names, matching titles, a single current board or `rooms[0]` are insufficient: legacy Room/agent state omitted source
or board, and legacy Task state omitted board. Collapsed legacy events may have destroyed the missing evidence.

Adoption preserves Room IDs and existing Room keys, Task IDs and correlation IDs, agent principal IDs, seats,
Conversations including DMs, session bindings, grants, OA item IDs, historical notes and session references. New
associations use bounded deterministic hash keys in the destination's permitted alphabet and length, with the full
tuple retained for verification. A duplicate or closed destination key does not justify selecting the first result,
creating a replacement, merging records or assigning history to another card. Ambiguous rows remain visibly pending
without destination effects until exact evidence or an operator's reviewed mapping resolves them.

Task parent and blocker references resolve through the same canonical board namespace unless the native contract
explicitly names another board. Room links and agent seats resolve the adopted Room association rather than
recomputing its old key. Independent optional links remain separately retained delivery obligations.

Teams' latest resource heads outlive the seven-day event log; time does not retire legacy aliases. Keep legacy heads
and acknowledged history read-only. Upgraded consumers dual-read legacy and version-2 publication, coalescing only
through exact app-owned alias associations. Once a version-2 state for a tuple is observed, legacy replay cannot
overwrite it. A legacy alias that ambiguously names several tuples stays blocked. Neither log pruning nor a new
snapshot proves that an ambiguous destination is safe to reuse or replace.

Permission-bound legacy resource IDs remain scoped aliases only where the exact association is proven. Check their
issuer, source/board, target and resource-owner grants on access; neither alias resolution nor a changed resource-ID
prefix grants a consumer additional source, board or session access. Migration does not widen prefix/resource
permissions. A source-ID change changes no native identity, execution behavior or access authority.

Each app durably records desired projection effects and identity/adoption state before acknowledging a cursor;
acknowledged destination receipts and retry identities survive interruption. Recovery reconciles an ambiguous
public-door outcome before retrying, preserving existing pending-delivery behavior. This is not a cross-product
transaction or a promise to recover history the owning service no longer retains.

### OA publication

OA's publisher owns its source-to-public-item resolver; the backend remains substrate-independent. Preserve adopted
public item IDs so existing notes, ended sessions and spend attribution continue to refer to the same item. New
tuples receive stable safe hash IDs within the existing eighty-character item contract. Apply that resolver to the
timeline, every session/item attribution and review/handoff notes. Domain-separated note identities include the
qualified source tuple and native review/attempt identity, within the existing update-ID bound; retain aliases to
already acknowledged legacy note IDs so cutover does not append them again.

Keep OA session keys, transcript-turn replay, publication receipts, core schemas and treasury semantics unchanged.
The existing [retained-publication contract](0016-retained-source-publication.md) still governs native source
acknowledgement and OA receipts. Unresolved provenance blocks the affected projection without inventing completion,
changing native schedules or granting autonomous work authority.

### Cutover and recovery

1. Inventory affected producer and consumer installations, source/target contexts, persisted state and destination
   associations. Known consumers include RH2's three mapping apps, Teams' generic `PublishedEvents` connector cache
   and local readers, direct event-stream clients and consented signed-webhook subscribers. Unknown subscribers are
   an activation blocker, not assumed compatible because they accept opaque IDs.
2. Upgrade all affected consumers to version-aware identity resolution, durable adoption/pending state and exact
   legacy coalescing before enabling the producer. Verify the signed-webhook delivery path and connector snapshots
   as well as direct streams. No native/UI audience or permission grant changes accompany this upgrade.
3. Review adoption evidence/manifests and preserve the original state for diagnosis. Stage the complete version-2
   inventory and per-board positions durably. Publish with stable version-2 identities and resume after interruption;
   persist the cutover's phase so restart cannot mix a partial baseline with an acknowledged live cursor.
4. Reconcile both namespaces through the adopted associations, then retain legacy aliases as read-only compatibility
   records. Do not rewrite event logs, receipt bodies or destination history. A producer rollback cannot make legacy
   state authoritative again for an already observed version-2 tuple; stop publication or resume through the same
   version-aware recovery contract. No downgrade that silently reinterprets versioned state is permitted.

The exact wire encodings, durable format and recovery operations must be recorded and reviewed in their owning
Supercode and RH2 contracts before activation. This OA proposal establishes required boundaries and preservation;
it does not unilaterally accept changes to another product's API.

## Alternatives and tradeoffs

- Qualify only RH2/OA maps: leaves upstream head collapse, inventory omission and replay gaps intact.
- Allocate one source per board: consumes a bounded machine resource and needlessly changes source lifecycle.
- Rename native IDs or rebuild destination records: changes native identity or loses history, grants and receipts.
- Guess legacy provenance from names/current uniqueness, or share a new identity service: grants unjustified
  associations or duplicates product authority. Exact local adoption is slower and may require an operator.

Opaque hash keys are less readable and need retained tuple metadata. Complete inventories and compatibility state
cost storage and delivery capacity; normal rate limits and refusal handling still apply. Ambiguity may prevent
projection until adoption, but preserving unknown state is safer than silently attributing another record's history.

## Evidence and independent review

Source observations, not deployment or migration claims: Supercode `420c127a`, RH2 integration `1f010ad8`, and OA's
current architecture branch on 2026-10-04. The source contracts are
[native workflow inventory/cursors](https://github.com/volter-ai/supercode/blob/main/sdk/orchestrator/board/event-stream.mjs),
[Teams board publication](https://github.com/volter-ai/supercode/blob/main/sdk/teams/board-events.mjs),
[resource/revision enforcement](https://github.com/volter-ai/supercode/blob/main/sdk/volter-teams/server/published-events.mjs),
[resource heads/webhook delivery](https://github.com/volter-ai/supercode/blob/main/sdk/volter-teams/server/migrations/015.mjs),
[retention](https://github.com/volter-ai/supercode/blob/main/sdk/volter-teams/server/core.mjs),
[connector event cache](https://github.com/volter-ai/supercode/blob/main/sdk/teams/machine-events.mjs),
[RH2 Rooms](https://github.com/volter-ai/runhuman-2/blob/main/bots/arcs-rooms/main.mjs),
[RH2 Tasks](https://github.com/volter-ai/runhuman-2/blob/main/bots/cards-tasks/main.mjs),
[RH2 agents/seats](https://github.com/volter-ai/runhuman-2/blob/main/bots/agents-rooms/main.mjs),
[OA source cache](../../packages/kit-hermes/base/.open-autonomy/source-events.ts),
[OA publisher](../../packages/kit-hermes/base/.open-autonomy/publisher.ts) and
[OA intake/updates](../../packages/backend/src/ledger.ts). The owner's original conversation supplies scope;
it has no public permalink and is not independent acceptance. The mapping's linked native/RH2 ADRs remain authoritative.

After design review, implementation requires REPL-style acceptance in disposable Worlds: same-ID cards on two
boards in a home and two sources; isolated rename/close/reopen/links/seats; one agent across boards and main-session
changes; preexisting child/completed inventory and skewed log sequences; exact legacy adoption preserving all IDs,
history and receipts; ambiguous/closed duplicate keys refusing effects; source/native reset, interruption during
cutover and replay without duplicates; target-context mismatch refusing; and OA distinct items, notes and session
references under the existing ID bounds. Explicit negative cases must refuse tuple/hash mismatches and legacy
alias/prefix/resource grants that would add source, board or session access. Inventory cutover must create no Rooms
or seats for historical closed, unmapped arcs. No such migration acceptance is claimed by this documentation-only proposal.

Constitution assessment proposed for independent review:

- **Every spend on public books; settled cents only:** preserve treasury accounts, settlement and attribution; no
  second charge, replica authority or off-book spend. Audience policy is unchanged.
- **Only the SDK is real:** native records reach OA only through their public stream and OA's SDK; no core parser of
  native databases, harness files or another product's IDs is added.
- **The platform shows; it does not steer:** correction changes projection identity/replay, not execution. Workplace
  controls retain existing explicit authority; mirrors gain no autonomous work authority.
- **Authority comes from the repository, not a key:** adoption resolves association, never widens owner bounds,
  organization roles or resource grants. Existing ADR 0018 consent and roster authority stand.
- **Secrets and audience:** mapping/evidence contains opaque IDs and custody references, never secret values;
  native/session access remains enforced by the resource owner. No new sharing or audience default is decided.
- **No automated tests; nothing develops against a real API:** no implementation, tests or production operation in
  this proposal. Subsequent claims require manual World evidence and independent review of the exact candidate.
- **Out of scope:** generic workflow/Teams changes remain external; OA owns its adapters, treasury and presentation,
  without a new harness, orchestration engine or hosted project compute.
