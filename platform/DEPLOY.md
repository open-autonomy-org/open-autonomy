# Deploying the platform worker

The worker holds the crown jewels: the admin token, the HMAC secret, the model gateway key, and the
books (Durable Objects). This is how it gets deployed and why that is safe.

## Two paths

**Maintainer, direct.** From a machine logged into the Cloudflare account:

```bash
cd platform && bunx wrangler deploy      # bun run check (tests + typecheck) before, live proof after
cd platform && bunx wrangler rollback    # the previous version, instantly
```

This is how the worker is deployed today. Live proof is the proof: the deployed worker and the rendered
site, not local tests alone. Anything touching metering, keys or the docs sync also runs the whole-stack
twin world first (see the repo's working notes).

**Tag-gated, reviewed.** `.github/workflows/deploy.yml` fires only on a human-cut `deploy-v*` tag and runs
in the `production` environment:

```bash
git tag deploy-v0.1.x && git push origin deploy-v0.1.x
# → the run pauses on the production gate → a maintainer approves → wrangler deploys with the scoped token
```

What that gate consists of, all provisioned on `open-autonomy-org/open-autonomy`:

- the `production` environment: a required reviewer, and a deployment policy admitting only `deploy-v*` tags;
- the `deploy-tags-admin-only` ruleset: only admins can create, move or delete a `deploy-v*` tag;
- the environment secret `CLOUDFLARE_API_TOKEN` (scoped to Workers edit on this account) and the repository
  variable `CLOUDFLARE_ACCOUNT_ID`;
- egress locked to GitHub, npm and `api.cloudflare.com`, so the deploy token cannot leave to another host.

## Security model

- **Allowlist wall.** Nothing deploys from CI without a tag only an admin can push, and a `GITHUB_TOKEN`
  pushed tag would not trigger the workflow anyway.
- **Human gate.** The environment's required reviewer approves each tagged deployment.
- **Containment backstop, outside the trust loop.** The proxy routes every model call through the model
  gateway, which is prepaid: the loaded balance is a hard ceiling the worker cannot raise. Worst case from any
  compromise (a leaked key, a bad deploy, a forged sponsorship) is that balance, plus an instant rollback.
  `MODEL_GATEWAY_API_KEY` is the only provider secret.
- **Local machine caveat.** A maintainer's machine that holds a full-scope GitHub token can both push the tag
  and approve the deployment, and can deploy directly. The gate defends against CI-side agents and outsiders,
  not against a compromised maintainer session. If that matters, approve from a second device or account.

## Secrets

Worker secrets (`bunx wrangler secret put <NAME>` from `platform/`; `bunx wrangler secret list` shows which
are set): `AGENT_PROXY_ADMIN_TOKEN`, `AGENT_PROXY_HMAC_SECRET`, `MODEL_GATEWAY_API_KEY`,
`GITHUB_SPONSORS_WEBHOOK_SECRET`. Rotate the admin token with `platform/scripts/rotate-admin-token.ts`.

The worker is named `volter-agent-model-proxy` in `wrangler.toml`. Its Durable Objects hold the books, so
the name stays; `open-autonomy.org` is attached to it as a custom domain in the Cloudflare dashboard, and the
`workers.dev` address is the same worker.
