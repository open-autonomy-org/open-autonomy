# Deploying the platform

Deploys and admin operations happen through GitHub only: `deploy.yml` on a human-cut `deploy-v*` tag or a
manual dispatch, `admin.yml` for money and key operations, both gated on the `production` environment's
required reviewer. No machine holds a deploy or admin token.

## What survives a deploy

- **The books.** Every account, balance, sponsor, coupon, flow, the audit trail, the sessions and the
  updates live in the `LimitLedger` Durable Object, whose class name and binding are unchanged, so the
  state carries over. The state record is normalized on load: fields an earlier worker kept and this one
  does not are dropped; money is never touched.
- **Keys.** A key verifies by its signature and its own expiry. The registry on the books only lists,
  revokes and shortens; a deploy that lost it would change nothing about which keys work. The one thing
  that invalidates every key is rotating `AGENT_PROXY_HMAC_SECRET`. Do not.

## Secrets (set once with `wrangler secret put`, never in the repository)

`AGENT_PROXY_ADMIN_TOKEN`, `AGENT_PROXY_HMAC_SECRET`, `MODEL_GATEWAY_API_KEY`, optionally `GITHUB_TOKEN`; and the
money paths' `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`GITHUB_SPONSORS_WEBHOOK_SECRET`. Every one is set as a `production` environment secret and installed by
`admin.yml`: `sync-admin-token` for the admin token, `sync-secrets` for the money paths' (it installs whichever
are set). The cardholder's billing address is the var `ISSUING_BILLING_ADDRESS_JSON` in `wrangler.toml`; with it
unset the card rail refuses. `/admin/status` reports `owed_usd_cents`, every account's balance summed: what the
Issuing balance and the gateway account must cover.

## The cutover to this worker

The worker this replaces verified keys against per-key state that a deploy could lose, and issued keys
whose claims name the account as `repo`. This worker's keys name it `account`. A key from before the
cutover is refused, so each project mints once more, the adopter way: `bun .open-autonomy/mint-key.ts`
(the claim file, then the mint) and a restart of its key valve. After that, keys survive every deploy.

The migration in `wrangler.toml` deletes the per-key Durable Object class the earlier worker used; nothing
this worker needs was in it.

## Verify

Before a deploy that touches metering, keys, the docs sync or the stream: `bun world/run.ts check`. After:
`curl https://open-autonomy.org/healthz`, the project page, and one metered call on the project's key
showing up at `/v1/accounts/<account>/calls`.
