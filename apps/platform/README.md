# The platform

One Cloudflare Worker: the books, the rails, the development stream, the site. It holds each project's
funds in an account tree, meters every spend against its account as it happens, takes money in, carries
every session the project's agent works, and serves the funding site and the README widgets. The ledger's
`consumed_usd_cents` is the authoritative cost; nothing is estimated client-side.

```text
src/index.ts      the routes
src/ledger.ts     the Durable Object: accounts, the audit trail, the key registry, sessions, updates, items
src/keys.ts       claim-file keys: challenge, mint, rotate, list; verification by signature and expiry
src/proxy.ts      the model rail: OpenAI and Anthropic wires → the model gateway, reserve then settle
src/pricing.ts    reservation prices; settle uses the gateway's reported cost
src/stream.ts     the development stream's intake (CloudEvents) and its live channels (SSE)
src/site.tsx      the site: explore, the project page, the session page, the item page
src/stream-view.tsx  the spine (NEXT / NOW / DONE), the session and item pages, the Setup pane
src/widgets.ts    runway, now, roadmap and activity SVGs for a README
src/sync.ts       the docs sync: a project's page is its repository's mirror
src/sponsors.ts   the GitHub Sponsors webhook
src/polar.ts      money in through Polar: the tiers as products, the checkout, the thanks page, the webhook
src/runway.ts     the Bayesian runway estimate
```

## Money

- `mint` puts money into an account (a sponsor, a coupon, an admin through the reviewed workflow);
  `grant` moves it down the tree; a metered rail takes it out. balance = in − out − consumed.
- **Rails.** `model` is live: a stock OpenAI or Anthropic SDK pointed at this host, with the project's key,
  reaches the model gateway through a reservation held against the balance (the hard-stop) and the global
  daily rail (`MAX_GLOBAL_DAILY_USD_CENTS`, runaway safety), then settles to the gateway's reported cost in
  fractional cents. Every settled call is appended to the account's public audit trail
  (`/v1/accounts/:account/calls`).
- **The card rail.** `POST /v1/rails/card` mints a single-use virtual card (Stripe Issuing) against the
  balance, bounded to the amount and the owner's merchant categories from `.open-autonomy/config.yaml`,
  holding a reservation. The issuer's real-time `issuing_authorization.request` is decided at
  `/webhooks/stripe` (a card this platform minted, unused, within amount and category); a capture settles the
  reservation as a `card` audit record naming the merchant, the category and the card's last4, and retires
  the card. A decline, by the platform or by the issuer's own controls, releases the reservation and
  retires the card. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and (for a twin) `STRIPE_API_BASE`.
- **The partner rail.** `POST /v1/rails/partner` settles a partner service's metered charge now, for a
  partner the owner listed and within the amount the owner set, as a `partner` audit record naming the
  partner, the unit and the quantity.
- **Money in.** Three doors onto the same books. Grant credits: a funder (`@login`, proven by the claim file in a
  repository they own; a key that can only give) holds credits the org gave them (or bought) and gives them to a
  project they believe in — `POST /v1/grants/give`, or the form on the project's page; the org's own grants
  account gives through `admin.yml`. On the project's books a grant is money in, `Granted by @login` on the page.
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
shorten a key's life. Three active keys per account. **Rotating `AGENT_PROXY_HMAC_SECRET` is the one
thing that invalidates every key at once.**

## The development stream

See `packages/sdk/README.md` for the wire. Sessions (kind, item, optional outcome), updates on items, spend
attributed to the one live session at settle time; the page's item view shows everything that touched an
item, live while a session runs.

## Admin

Every admin route takes `x-admin-token` and is reached only through the `admin` GitHub workflow, gated on
the `production` environment's reviewer: `status`, `reset-daily`, `accounts/:id/{mint,grant,accrue,sync,
profile,moderate,keys}`, `accounts/:id/sessions/:key` (DELETE), `coupons`, `keys/:kid/revoke`.

## Configuration

`wrangler.toml` holds the vars; secrets are `AGENT_PROXY_ADMIN_TOKEN`, `AGENT_PROXY_HMAC_SECRET`,
`MODEL_GATEWAY_API_KEY`, `GITHUB_SPONSORS_WEBHOOK_SECRET` and optionally `GITHUB_TOKEN`. The one Durable
Object is `LIMITS` (class `LimitLedger`); its state record is normalized on load, so the books written by
an earlier worker carry over. See `DEPLOY.md`.

```bash
bun run check   # tests + typecheck (no network: an in-memory Durable Object and a fake gateway)
```
