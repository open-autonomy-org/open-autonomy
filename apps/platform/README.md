# The official hosted service

Open Autonomy's official Cloudflare Worker mounts the reusable [backend](../../packages/backend/README.md)
with its discovery/funding application. The core accepts the SDK, retains published development records,
enforces policy and owns treasury settlement. The surrounding app offers listings, sponsorship, checkout,
giving and human account connections. It operates the API and site; owners operate their project's compute.

The [ecosystem architecture](../../docs/decisions/0024-ecosystem-target-architecture.md) defines these logical
boundaries and records its acceptance status. They can share one Worker and Durable Object. Application
funding records identify provider receipts; core balances, reservations and settled cents remain the one
monetary authority. Nothing is estimated client-side.

```text
src/index.ts      worker(app), with LimitLedger re-exported and patronage operations registered
src/app.tsx       application routes, page/viewer/identity extensions and monthly accrual
src/patronage.ts  application records and operations: sponsors, coupons, tiers, Polar products/checkouts and patrons
src/site.tsx      discovery, project funding presentation, funder/giving pages and shared-page slots
src/polar.ts      Polar checkout, thanks-page reconciliation and signed funding webhook
src/sponsors.ts   GitHub Sponsors webhook
src/give-auth.ts  Volter/GitHub identity connections for giving and owner actions
```

The backend also supplies reusable views/widgets and OA's consented integration with external RH2
Workplace. OA publishes books and book conditions there; Supercode's integration owns runtime conditions
and resource access. Linked projects open their Workplace Overview; the dashboard deliberately retains
owner controls and books ([ADR 0018](../../docs/decisions/0018-the-workplace-integration.md)). Neither
Workplace nor this application dispatches native work.

Everything below describes this deployment's implementation; release follows [DEPLOY.md](DEPLOY.md).
Code presence does not establish that a feature is deployed. A self-host mounts the same core without
this funding application; cross-deployment discovery/funding and treasury federation are undecided.

## Money

- `mint` puts money into an account (a sponsor, a coupon, an admin through the reviewed workflow);
  `grant` moves it down the tree; a metered rail takes it out. balance = in − out − consumed.
- **Model rail.** A stock OpenAI or Anthropic SDK pointed at this host, with the project's key,
  reaches the model gateway through a reservation held against the balance (the hard-stop) and the global
  daily rail (`MAX_GLOBAL_DAILY_USD_CENTS`, runaway safety), then settles to the gateway's reported cost in
  fractional cents. Every settled call is appended to the account's public audit trail
  (`/v1/accounts/:account/calls`).
- **The card rail.** `POST /v1/rails/card` mints a single-use virtual card (Stripe Issuing) against the
  balance, bounded to the amount and the owner's merchant categories from `.open-autonomy/config.yaml`
  (whose `models:` and `spend.limits` likewise bound the model rail: the models the project's funds may buy,
  whatever a key names, and the money, calls or tokens they may use over any window of minutes, hours or days,
  per model when named; the account's `bounds` shows each limit with what is used),
  holding a reservation. The issuer's real-time `issuing_authorization.request` is decided at
  `/webhooks/stripe` (a card this platform minted, unused, within amount and category); a capture settles the
  reservation as a `card` audit record naming the merchant, the category and the card's last4, and retires
  the card. A decline, by the platform or by the issuer's own controls, releases the reservation and
  retires the card. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and (for a twin) `STRIPE_API_BASE`.
- **The partner rail.** Durable reservations hold a bounded charge, then capture or release under stable
  partner identities; see [partner reservations](../../docs/decisions/0016-partner-reservations.md) and the
  [SDK wire](../../packages/sdk/README.md). The older `POST /v1/rails/partner` immediate-charge route remains
  for compatibility. Both enforce the owner's partner bounds and record settled charges on the books;
  a treasury receipt is not external work acceptance or seller payout.
- **Money in.** Three doors onto the same books. Grant credits: a funder (`@login`, proven either by a claim-file
  key that can only give or by GitHub OAuth on `GET /give`) holds credits the org gave them (or bought) and gives
  them to a project they believe in. An org admin passes Sponsors money on from the grants-pool source on that same
  page; `POST /v1/grants/give` remains the key-based door. On the project's books a grant is money in,
  `Granted by @login` on the page.
  A funder funds themself through the same Polar door (credit packs), and the org matches a share from its
  grants account as bonus credits that go only to projects the funder does not own (`GRANT_MATCH_PERCENT`).
  Then the two doors on every tier: GitHub Sponsors: its
  webhook keeps the recurring list and a monthly cron credits it. Polar, the merchant of record for direct
  patronage: `POST /v1/patrons/checkout {account, tier, interval}` opens a Polar checkout for the tier's
  product (monthly or once; the platform creates the products on first use), and a paid order mints to the
  account with the patron's name, once, from whichever arrives first of Polar's signed `order.paid` webhook
  at `/webhooks/polar` and the thanks page the patron lands on. Renewals are orders too. Coupons are bearer
  grants redeemed on the page or at `/v1/coupons/redeem`.

## Keys

A project's owner proves control of the repository by committing the claim `GET /v1/keys/challenge`
names to `.open-autonomy-claim`; `POST /v1/keys/mint` reads it back and mints. The key is
`base64url(claims).hmac` with `{kid, account, models, iat, exp}`; verification is the signature and the
expiry, so a key survives every redeploy and even a lost registry. The registry on the books lists keys,
revokes them (`POST /admin/keys/:kid/revoke`) and holds a rotated key's one-day grace; an entry can only
shorten a key's life. Three independent credential slots per account. Rotation atomically replaces a
slot and permits one predecessor during its grace period, without consuming a fourth slot. The old
key cannot rotate again; its successor can rotate after the predecessor expires or is revoked.
Revoking a successor does not free a slot while its predecessor remains usable. A legacy signed key
missing from the registry can rotate only when a slot is available; its grace is then registered too.
**Rotating `AGENT_PROXY_HMAC_SECRET` is the one
thing that invalidates every key at once.**

## The development stream

See `packages/sdk/README.md` for the wire. Sessions (kind, item, optional outcome), updates on items, and spend
attributed to the session each model call names; the page's item view shows everything that touched an item,
live while a session runs.

## Admin

Every admin route takes `x-admin-token` and is reached only through the `admin` GitHub workflow, which runs only on
the owner's own dispatch from `prod`: `status`, `reset-daily`, `accounts/:id/{mint,grant,accrue,sync,
profile,moderate,keys}`, `accounts/:id/sessions/:key` (DELETE), `coupons`, `keys/:kid/revoke`.

## Configuration

`wrangler.toml` holds the vars; secrets are `AGENT_PROXY_ADMIN_TOKEN`, `AGENT_PROXY_HMAC_SECRET`,
`MODEL_GATEWAY_API_KEY`, `GITHUB_SPONSORS_WEBHOOK_SECRET`, the giving page's `GITHUB_OAUTH_CLIENT_ID`,
`GITHUB_OAUTH_CLIENT_SECRET` and dedicated `GIVE_SESSION_HMAC_SECRET`; Volter identity uses
`VOLTER_ISSUER`, `VOLTER_CLIENT_ID` and `VOLTER_CLIENT_SECRET`; `GITHUB_TOKEN` with `read:org` is required
to expose the grants pool to signed-in organization admins (and is otherwise optional). The one Durable
Object is `LIMITS` (class `LimitLedger`); its state record is normalized on load, preserving supported older
records. Optional Workplace configuration is `WORKPLACE_URL`, `WORKPLACE_APP_ID`, `WORKPLACE_CLIENT_ID` and
`WORKPLACE_CLIENT_SECRET`; absence refuses linking. See [DEPLOY.md](DEPLOY.md).

```bash
bun run check   # typecheck; manually exercise behavior in the disposable World scenario
```
