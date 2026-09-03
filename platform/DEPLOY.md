# Deploying and administering the platform worker

The worker holds the crown jewels: the admin token, the HMAC secret, the model gateway key, and the
books (Durable Objects). Every privileged operation on it goes through GitHub, waits for the
`production` environment's required reviewer, and uses secrets that exist only in that environment
and in Cloudflare. No machine holds a deploy token or the admin token, and the agent's machine holds
nothing that matters even if its session logs are read live, which they are.

## Deploy

`.github/workflows/deploy.yml` runs in the `production` environment on a `deploy-v*` tag or on a
manual dispatch of `main`:

```bash
gh workflow run deploy.yml -R open-autonomy-org/open-autonomy        # deploy main now
git tag deploy-v0.1.x && git push origin deploy-v0.1.x               # or a promotion tag
# → the run pauses on the production gate → a maintainer approves → wrangler deploys with the scoped token
```

Then the live proof: the worker's routes and the rendered site, not the green run. Rollback is a
re-dispatch of the previous commit, or the Cloudflare dashboard's deployment rollback.

What the gate consists of, provisioned on `open-autonomy-org/open-autonomy`:

- the `production` environment: a required reviewer, and a deployment policy admitting only `deploy-v*` tags;
- the `deploy-tags-admin-only` ruleset (no bypass actors): only admins create, move or delete a `deploy-v*` tag;
- `main` requires the `ci` and `security` checks;
- environment secrets `CLOUDFLARE_API_TOKEN` (Workers edit, this account) and `AGENT_PROXY_ADMIN_TOKEN`; the
  repository variable `CLOUDFLARE_ACCOUNT_ID`;
- egress locked to GitHub, npm, `api.cloudflare.com` and `open-autonomy.org`, so no secret can leave to another host.

## Administer

`.github/workflows/admin.yml` is the only admin surface. Dispatch it with an `op`, wait for the reviewer:

| op | what it does |
|---|---|
| `status` | the ledger's limits and counters |
| `mint` | add balance to `account` from the platform's own funding (idempotent on `key`) |
| `grant` | move balance from `account` to `to` (idempotent on `key`) — how an adopter gets funded |
| `sync` | re-read `account`'s docs and metadata from its repo now |
| `sync-admin-token` | install the environment's `AGENT_PROXY_ADMIN_TOKEN` as the worker's secret |

```bash
gh workflow run admin.yml -R open-autonomy-org/open-autonomy -f op=grant -f account=open-autonomy-org/open-autonomy -f to=someone/project -f amount_usd_cents=500 -f key=grant-someone-2026-09
```

Rotating the admin token: generate a value, set it with `gh secret set AGENT_PROXY_ADMIN_TOKEN --env production`,
then dispatch `sync-admin-token`. The value passes through the maintainer's shell once and is kept nowhere else.

Coupons are deliberately not issued here: a coupon code is a bearer for money, and a public repository's
run logs and inputs are public. Adopters are funded by grant.

## Security model

- **Allowlist wall.** Nothing deploys or administers from CI without a dispatch by someone with write access,
  or a tag only an admin can push; a `GITHUB_TOKEN` pushed tag would not trigger the workflow anyway.
- **Human gate.** The environment's required reviewer approves each run before any secret is used.
- **Containment backstop, outside the trust loop.** The proxy routes every model call through the model
  gateway, which is prepaid: the loaded balance is a hard ceiling the worker cannot raise. Worst case from
  any compromise is that balance, plus a rollback. `MODEL_GATEWAY_API_KEY` is the only provider secret.
- **The agent cannot reach any of this.** It pushes `agent/*` branches with a repository-scoped deploy key that
  cannot dispatch workflows, open pull requests, or cut a `deploy-v*` tag; `land.yml` opens its pull request and
  auto-merge lands it only when `ci` and `security` pass. Its model key stays outside its container
  (`hermes/README.md`).
- **Maintainer caveat.** A maintainer whose machine holds a full-scope GitHub token can both dispatch and
  approve. If that matters, approve from a second device or account.

## Worker secrets

`AGENT_PROXY_ADMIN_TOKEN`, `AGENT_PROXY_HMAC_SECRET`, `MODEL_GATEWAY_API_KEY`, `GITHUB_SPONSORS_WEBHOOK_SECRET`.
The worker is named `volter-agent-model-proxy` in `wrangler.toml`; its Durable Objects hold the books, so the
name stays. `open-autonomy.org` is attached to it as a custom domain in the Cloudflare dashboard.
