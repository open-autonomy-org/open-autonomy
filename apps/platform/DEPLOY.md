# Deploying the platform

Deploys and admin operations happen through GitHub only, and only from a human-cut tag: the `production`
environment admits `deploy-v*` and `release-v*` tags and nothing else (never `main`), so the workflow that holds a
secret is always the one a human tagged, never the one the agent last landed. `deploy.yml` runs on a `deploy-v*`
tag, `release.yml` on a `release-v*` tag, and `admin.yml` (money and key operations) is dispatched with
`--ref <the latest deploy-v* tag>`; each waits for the environment's required reviewer, who approves it on the run's page (Actions → the waiting run → Review deployments). Cutting a tag is the
human's act (`git tag deploy-v<date> <sha> && git push origin deploy-v<date>`; the tag ruleset lets only an org
admin create one), and the approval is the second. No machine holds a deploy or admin token, and no agent can
cut a tag.

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
`GITHUB_SPONSORS_WEBHOOK_SECRET`; and the giving page's OAuth app credentials `GITHUB_OAUTH_CLIENT_ID`,
`GITHUB_OAUTH_CLIENT_SECRET` plus its dedicated cookie-signing `GIVE_SESSION_HMAC_SECRET` (GitHub refuses secret names
that start with `GITHUB_`, so the environment holds those three under `SPONSORS_WEBHOOK_SECRET`, `OAUTH_CLIENT_ID` and
`OAUTH_CLIENT_SECRET`; the sync installs them under the worker's names). Every one is held as a
`production` environment secret and a Worker secret. `admin.yml` installs the admin token with `sync-admin-token`
and the money paths with `sync-secrets` (it installs whichever are set). The cardholder's billing address is the var `ISSUING_BILLING_ADDRESS_JSON` in `wrangler.toml`; with it
unset the card rail refuses. `/admin/status` reports `owed_usd_cents`, every account's balance summed: what the
Issuing balance and the gateway account must cover.

The scope-free funder OAuth token proves only the login. The separate `GITHUB_TOKEN` Worker secret needs
`read:org` when organization admins are to pass on the grants pool; it alone reads the signed-in login's role.

## The cutover to this worker

The worker this replaces verified keys against per-key state that a deploy could lose, and issued keys
whose claims name the account as `repo`. This worker's keys name it `account`. A key from before the
cutover is refused, so each project mints once more, the adopter way: `bun .open-autonomy/mint-key.ts`
(the claim file, then the mint) and a restart of its key valve. After that, keys survive every deploy.

The migration in `wrangler.toml` deletes the per-key Durable Object class the earlier worker used; nothing
this worker needs was in it.

## Verify

Before a deploy that touches metering, keys, the docs sync or the stream: bring the world up and drive the change
through its page (follow the [World guide](../../world/README.md)). After:
`curl https://open-autonomy.org/healthz`, the project page, and one metered call on the project's key
showing up at `/v1/accounts/<account>/calls`.
