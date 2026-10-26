# Deploying the platform

Deploys and admin operations happen through GitHub only. Deploys and publication run only on a push to `publish`,
the dedicated publication branch, which moves only on the owner's explicit publication authorization; a merge to
`main` never advances `publish` and never triggers publication. The `production` environment admits `publish` alone
(never `main`), so the workflow that holds a secret is always one the owner authorized, never the one the agent last
landed. The PM's `maintain.ts ship` keeps one pull request open from `main` to `publish`; it grows as `main` moves, so
changes compound until the owner reads the whole diff and merges it (a merge commit, so `publish` never drifts from
`main`). `ship` never merges it and never pushes to `publish`. The `publish-protected` ruleset allows no creation or
update of `publish` but a merged pull request that the `owners` team (the owner) has approved, and only that team
bypasses it: the owner's merge is the publication authorization. On a push to `publish`,
`deploy.yml` deploys the platform and tags the commit `deploy-v<date>.<n>`. npm packages are released apart from the site:
every package version not yet on npm is published from a clean checkout of the commit the manager permitted, on
reviewed `main`, by `scripts/npm-publish-missing.sh` (packed once, keys-swept, that tarball uploaded; ADR 0033), which
records a new kit version as a `release-v<version>` tag and GitHub release, and never pushes `publish`.
`admin.yml` (money and key operations) is dispatched `--ref publish`. No machine holds a deploy or admin token, and no
agent can advance `publish`.

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
