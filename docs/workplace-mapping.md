# Open Autonomy ↔ Workplace mapping

This is OA's canonical integration map, consolidating existing contracts rather than defining another
ontology. The company [work ontology](https://github.com/volter-ai/volter/blob/main/contracts/ontology.md)
owns shared meaning; [OA ADR 0018](decisions/0018-the-workplace-integration.md) owns OA's consented
Workplace connection, and [ADR 0022](decisions/0022-ecosystem-target-architecture.md) owns ecosystem
responsibilities and records its acceptance status. Product decisions and public interfaces remain
authoritative for implementation.

Source inspection: 2026-10-04, OA `26783a7e` and RH2 integration candidate `1f010ad8`. “Implemented” below
means code is present; it does not establish a release, a live installation or completed World acceptance.
The company ontology specifies a target and explicitly distinguishes it from shipped behavior.

## Associations, not shared identities

| Source object | Workplace association | Contract and implementation owner |
| --- | --- | --- |
| OA project/account, such as `owner/repository`, at a selected backend deployment | One consented RH2 organization; many OA projects may link to the same organization | OA's [Workplace adapter](../packages/backend/src/workplace.ts) keeps each project link. One installation token for that deployment's registered app is stored per Workplace base URL and organization, shared by linked projects; relinking replaces it |
| Native live arc | RH2 Room, placed on the Floor selected by its first configured floor tag | RH2's installed [Arcs → Rooms app](https://github.com/volter-ai/runhuman-2/blob/main/apps/rh2/docs/adr/0033-arcs-to-rooms-app.md) owns the map and placement. Room access follows RH2 roles and Floor grants |
| Native card, including an arc card | RH2 Task; a child card links to its arc's Task, and optionally its Room | RH2's installed [Cards → Tasks app](https://github.com/volter-ai/runhuman-2/blob/main/apps/rh2/docs/adr/0035-cards-to-tasks-app.md) owns source-qualified card-to-Task mappings. It can run without the Rooms app. The native board is the writer of mirrored fields; RH2 does not write them back |
| Stable native agent principal | One RH2 agent principal, seated where its work requires | RH2's installed [Agents → Room agents app](https://github.com/volter-ai/runhuman-2/blob/main/apps/rh2/docs/adr/0034-agents-to-room-agents-app.md) owns the association; a new session does not create a new agent identity |
| Agent's current native main session | The existing RH2 seat is rebound to a resource-owner-issued session view binding | Teams owns the native binding door; RH2 owns the seat and Conversation. Consent with `sessions.access` and the session owner's authority are required; a Room or an OA publication grants no native session access |
| OA books and book conditions | Project books snapshot, freeze controls and role-targeted alerts in the linked organization | OA's adapter owns publication and condition reconciliation; RH2 owns presentation and control requests. Native run/workflow conditions belong to Supercode's integration |

An OA project is not universally an arc or a Room. A company install can work on several projects through
its selected lanes; each project may publish to its own OA account. The [company template example](../packages/kit-hermes/README.md)
distinguishes OA's reusable skew from an owner's running organization instance. Neither Workplace nor an IR
kit is required for every conforming OA project.

IDs are opaque and local to their owning product. The integrations keep association maps and replay state;
core products do not interpret another product's IDs. Preserve the issuer/deployment, team/source/board and
stable local ID needed to distinguish records. A display name, matching account spelling or shared session
label proves neither identity nor authority.

## Authority and controls

Native tasks, attempts, schedules, sessions and completion remain native records. OA stores acknowledged
published projections and authoritative treasury facts: funding credited to its accounts, reservations,
captures and settled costs. RH2 owns its organization, people, Rooms, Conversations, Tasks, grants and
work-contract acceptance. Its mirror is not another treasury, and an OA payment receipt is not work acceptance
or seller payout. Live session/resource access is enforced by the owning service under the consented grants.

Read-only rendering, explicit control requests and delegation of team authority are separate capabilities.
Rendering alone grants neither control nor roster authority. The full consented link in ADR 0018 currently
includes books controls and adoption of the linked team roster. Without authorized user interaction, connecting
Workplace leaves native schedules, execution and OA publication, funding and spending rules unchanged.
Viewers, access checks, bindings and mirrors present existing state or mediate access; they grant no new
autonomous work authority. Explicit controls use the existing contracts. Visualizer availability does not
change native execution or treasury semantics; its loss impairs the integration's views and requests.

The current OA integration accepts only Workplace `freeze`/`unfreeze` books controls naming the linked
project. A freeze refuses new spending reservations on the account's rails; it does not pause native work.
OA's separate [operating-state contract](decisions/0003-operating-state-through-the-sdk.md) records desired
state, applies it through the native control adapter, and publishes observed state. In the Hermes adapter,
pause disables scheduled work, allows in-flight work to finish and leaves channel conversations responsive.
An accepted request remains distinct from evidence that it took effect.

## Linked team and funding identities

For a linked project, OA reads RH2's declared seats and proven identities into a cached roster on its
quarter-hour integration tick. An `admin` seat or `owner` team role maps to OA owner scope; another team role
maps to team scope; a seat without a team role conveys neither. OA matches the viewer's verified issuer and
subject, not the person's name. This roster replaces the project's `team:` configuration while linked;
unlinking removes the cached roster and returns to that configuration. It does not create native machine or
session permissions. See [roster and link implementation](../packages/backend/src/workplace.ts) and
[viewer authorization](../packages/backend/src/page/model.ts).

A successful personal gift through the official app, signed in with Volter, records the giver's proven
issuer/subject against their funder account. OA includes those identities in the books snapshot so Workplace
can associate them with its `giver` role. GitHub-only sign-in and funder-key gifts do not establish that
association. A funding contribution does not confer owner/team authority or native access. The
[giving adapter](../apps/platform/src/app.tsx) records the gift; Workplace owns its roles and grants.

## Current limits and migration

OA's link, shared installation, books, alerts, roster and freeze-control code is present. Missing deployment
configuration refuses with `workplace_not_configured`; missing or expired installation consent reports a
failed sync and requires relinking. Local unlink removes OA's association; the RH2 admin separately uninstalls
the app there. Registered app IDs in source do not prove a released deployment or synced service credentials.
RH2's three native mapping apps are implemented in source; reliable replay and actual Teams/RH2/native
integration still require their independent review and World evidence.
Current apps also create RH2 Task, agent-principal and books-snapshot projections, beyond embedded views;
these copies do not acquire native execution or treasury authority.

Agent/session binding requires native attribution. [Supercode ADR 0013](https://github.com/volter-ai/supercode/blob/main/docs/adr/0013-agents-own-identity-sessions-and-memory.md)
records that Hermes's current own loop records no launch agent, so its sessions remain unbound. OA publication
or a Workplace Room does not establish that attribution or imply a main-session binding.

Source namespaces are not yet preserved everywhere. OA's [native event cache](../packages/kit-hermes/base/.open-autonomy/source-events.ts)
uses `board:card.id`, while its [published item adapter](../packages/kit-hermes/base/.open-autonomy/publisher.ts)
still uses the raw card ID. RH2's [Cards → Tasks map](https://github.com/volter-ai/runhuman-2/blob/main/bots/cards-tasks/main.mjs)
uses a source-qualified card ID, but the [Room keys](https://github.com/volter-ai/runhuman-2/blob/main/bots/arcs-rooms/main.mjs)
and [agent/Room associations](https://github.com/volter-ai/runhuman-2/blob/main/bots/agents-rooms/main.mjs) derive
normalized, truncated keys from raw IDs. Same-ID records from different sources/boards can therefore collide
in these narrower projections. [Proposed ADR 0023](decisions/0023-source-qualified-associations-and-replay.md) describes
preserving existing associations and replay identities; migration remains pending its owning contract reviews
and implementation evidence before source-qualified mappings can be claimed throughout.
Upstream [Teams publication](https://github.com/volter-ai/supercode/blob/main/sdk/teams/board-events.mjs) also
allocates a source per board home and publishes `source:card.id`; board metadata downstream cannot recover a
same-ID head already overwritten or refused at that upstream boundary.

This map adds no audience default, cross-organization sharing rule, account federation or treasury replication
decision. Current public-books policy and the OA dashboard's owner controls and books remain as decided.
