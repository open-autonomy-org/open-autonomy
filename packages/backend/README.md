# The reusable backend

The OA-owned server accepting the [SDK project protocol](../sdk/README.md): authorized publication,
retained history and revisions, live streams, repository policy, owner intent and observed operating state,
and the treasury's accounts, reservations and settled spending rails. A conforming project can use any
language, client or native runtime. The server records published representations; the project's runtime
owns execution and applies authorized intent.

[ADR 0022](../../docs/decisions/0022-ecosystem-target-architecture.md) defines the ecosystem boundaries and
its acceptance status. The [official service](../../apps/platform/README.md) and
[self-hosted deployment](../../apps/self-host/README.md) mount this same backend. Both host the backend
service; project compute remains with its owner. Rendering and widgets currently share this package with
the core server, without making presentation another treasury or execution authority.

```text
src/routes.ts       worker(app): request/schedule handler, core routes and extension interfaces
src/ledger.ts       LimitLedger Durable Object: accounts, holds, settled audit records, keys, publication and revisions
src/keys.ts         repository claim, mint, rotation and registry checks
src/proxy.ts        OpenAI/Anthropic model wires: reserve, call the gateway, settle its reported cost
src/pricing.ts      reservation prices, never authoritative settled cost
src/rails.ts        card rail and immediate partner-charge compatibility route
src/partner.ts      durable partner hold/capture/release protocol
src/stream.ts       SDK CloudEvents intake and live SSE channels
src/page/           shared pages, brand, viewer roles and page composition
src/dash/           owner controls, books and development views
src/widgets.ts      funding, progress, activity and statement SVGs
src/sync.ts         repository metadata and owner configuration; development records arrive through the SDK
src/workplace.ts    OA books/link/control/alert integration with external RH2 Workplace
```

## Core, application and integration state

The treasury owns balances, reservations, captures and settled spend. Operator minting and grants move
funds on those books. Funding-provider subscriptions, checkout records, coupons, tiers and discovery
belong to the surrounding application: provider-confirmed receipts use core ledger operations to credit
funds, rather than implement another balance or settlement engine.

The supported extension points are exported from `src/index.ts`:

- `worker(app)` tries `App.route` before core routes. `App.scheduled` adds application work to the clock;
  the backend retains its Workplace and repository-sync schedules.
- `LimitLedger.extend` registers named operations at module load. Extensions can store their own records
  beside the core, using `LedgerCore.storage` or extension state keys. Core normalization preserves opaque
  extension state; it does not own its semantics.
- `App.page` (`PageApp`) supplies directory/account slots, the project landing view and viewer resolution;
  `App.identity` begins human authorization. `configurePage` supplies branding and `configureSync` sets the
  repository admission policy. Mounting `worker()` alone supplies no human sign-in door.

These are logical responsibilities in one Worker and Durable Object, not a requirement for a physical
split. Neither an app extension nor a widget bypasses repository bounds or becomes the authority for cost.
The ledger's settled cents are the only cost; every spend remains on public books.

## Workplace and views

OA's integration links a project to RH2 Workplace by consent, publishes books and their conditions, and
accepts the supported spending-freeze control. RH2 owns workspace resources, membership and grants;
Supercode's separate integration owns native runtime conditions and live resources. A linked project
opens its Workplace Overview, while the OA dashboard retains owner controls and books as
[ADR 0018](../../docs/decisions/0018-the-workplace-integration.md) specifies. No link is required to use
the backend; missing integration configuration refuses its link operations.

Pages, SDK reads and widgets obey committed panel visibility. Public reads can be anonymous; restricted
reads admit the project's key, the organization's scoped authority or an authorized application viewer.
The bare deployment resolves browser viewers as public. This does not adopt proposed changes to default
audiences; see ADR 0022 for the separate unresolved proposals.

## The wire

[The SDK reference](../sdk/README.md) owns routes, payloads, scopes and publication semantics, including
`/v1/agent/events`, roadmap and state, model/card/partner rails, account reads and owner controls.
`/admin/*` requires the operator token; card webhooks verify the issuer. Storage recovery, credential
custody and upgrades are deployment responsibilities, documented in the self-hosting guide.
