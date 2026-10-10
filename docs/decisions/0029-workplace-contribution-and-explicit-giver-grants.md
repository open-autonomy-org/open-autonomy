# ADR 0029: OA owns its Workplace contribution and requests giver grants explicitly

Status: Proposed by card t_7ac4a16a. Independent review and merge are required for acceptance.

## Context and sources

The owner's 2026-10-10 direction is that Workplace is a small chat-and-tasks core and Books belongs to OA's contribution. RH2's proposed ADR0041 (0b2d383) and company RFC0029 (329590c3) record that direction. [ADR0018](0018-the-workplace-integration.md) currently sends giver identities in Books snapshots, and [ADR0024](0024-ecosystem-target-architecture.md) gives OA ownership of its views and funding conditions. This proposal replaces only ADR0018's snapshot-derived giver authority.

## Decision

`packages/workplace`, named `@open-autonomy/workplace`, owns the desktop and phone Books pages, funding widgets, Cost control and Metered spend. Its client, server and mobile entrypoints implement Workplace's public host contribution contract. The package adapts the existing Books projection in `packages/backend/src/workplace.ts`, the ledger/flows/earmarks in `packages/backend/src/dash/app.tsx`'s Books view, and the runway/daily-spend/statement concepts in `packages/backend/src/widgets.ts`. It preserves RH2's established rendering and formats; a funding widget never invents a settlement or reads native orchestration state.

RH2 selects the package in the existing platform document at build time. An organization then installs the app whose existing manifest declares `contributions: ["@open-autonomy/workplace"]`. Compilation and installation are separate requirements. A base stack never imports these entrypoints. RH2 consumes a pinned Git checkout of this source package; publishing or deployment is not authorized by this card.

OA decides which proven giver identities qualify, and calls Workplace's generic `POST /api/v3/organizations/:org/role-grants` with `role`, `identity: {issuer, subject}` and a reason. The app requests `roles.grant` plus the actions of the organization's giver role; RH2 refuses a grant that would convey an action the app does not hold. An unknown identity yields no grant and is retried on the next tick after the person proves it. Duplicate grants are no-ops. Uninstalling the granting app removes the authority its grants supply. No giver identity is included in the new Books snapshot, and neither snapshot contents nor a view can grant authority.

Gifts remain durable historical qualifications, shared across all linked projects of the same organization. This change does not revoke a role when another linked project lacks that giver. Existing installations must be re-consented to the manifest's additional actions; an old token reports the refused role request on its existing link status rather than bypassing authorization.

## Alternatives and tradeoffs

Keeping giver inference inside Workplace hides OA policy in the core. Granting an unrestricted arbitrary role would escalate the app's authority. The explicit door keeps the judgment in OA and bounds the grant by the app's consent. Keeping the UI only inside RH2 obscures source ownership; the pinned OA source package introduces a checkout step but needs no package release or runtime import from OA's cloud.

## Consequences and constitution review

Treasury remains the sole authority for settled cents and public books (constitution's metering/public-books rule). The platform shows authorized projections and recorded control requests; it does not steer native work. RH2 remains the authority for workplace principals and grants (the SDK/authority clauses); matching display names grants nothing. All dependencies use public contracts and disposable World data for manual verification. No tests, production credentials, release or deployment are added. Review evidence belongs to the card and PRs, not this record.
