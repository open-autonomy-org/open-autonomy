# Self-hosting the backend

This directory is a deployment: the Open Autonomy backend (`packages/backend/`) mounted bare in your own
Cloudflare account. It has the books, the keys, the rails, the development stream, the timeline and a page
per project. It has no door onto money in from the public and no explore page: an operator mints a project's
budget, and `/` lists the deployment's projects. A private company runs this; so does anyone who wants the
open product without patronage.

Copy this directory, or point a checkout at it. `src/index.ts` is the whole worker; `wrangler.toml` names the
Durable Object and the plain configuration.

## Deploy

```bash
bun install
cd apps/self-host
bunx wrangler secret put AGENT_PROXY_ADMIN_TOKEN      # the operator's token for /admin/*: mint, grant, export, import
bunx wrangler secret put AGENT_PROXY_HMAC_SECRET      # signs every key; never rotate it, that invalidates every key
bunx wrangler secret put MODEL_GATEWAY_API_KEY        # your account at the model gateway MODEL_GATEWAY_URL names
bun run deploy
```

Optional secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `ISSUING_BILLING_ADDRESS_JSON` turn the card
rail on; `GITHUB_TOKEN` reads private repositories (the backend admits them; only the public platform refuses
them) and raises the sync's rate limit. `GITHUB_API_BASE` and
`GITHUB_RAW_BASE` point the claim-file proof and the sync at a GitHub Enterprise; the proof of control is a file
in the project's repository and needs a GitHub of some kind.

## The first project

```bash
H=https://<your worker>
curl -s -X POST -H "x-admin-token: $ADMIN" -H 'content-type: application/json' -d '{"amount_usd_cents":10000}' "$H/admin/accounts/<org>%2F<repo>/mint"
curl -s "$H/v1/keys/challenge?account=<org>/<repo>"     # commit the claim it names to .open-autonomy-claim, then
curl -s -X POST -H 'content-type: application/json' -d '{"account":"<org>/<repo>","models":["<model id>"]}' "$H/v1/keys/mint"
```

The project's agent runs the Hermes kit as anywhere (`create-open-autonomy`), with `platform:` in its
`.open-autonomy/config.yaml` set to this worker. Every session and every settled cent lands on its page here.

## Who may look

The engine is private by default: with no `AUDIENCE` named, its pages (`/`, `/<name>`, `/<owner>/<project>`) and
the read doors under `/v1/accounts` show nothing, and a project is read only through its own key. Name the
deployment's audience in `wrangler.toml`:

- `AUDIENCE = "public"`: everyone who reaches the worker, as on the Open Autonomy platform.
- `AUDIENCE = "access"`: whoever Cloudflare Access admits. Put an Access application on the worker's hostname (an
  allow list of your people) and bypass applications on `/v1/*`, `/admin/*` and `/webhooks/*` so those keep their
  own authentication, then set `ACCESS_TEAM_DOMAIN` (`<team>.cloudflareaccess.com`) and `ACCESS_AUD` (the
  application's audience tag). The worker verifies Access's signed token (its header, or its `CF_Authorization`
  cookie on the bypassed paths) on every request, so nothing is shown on a header alone.

Within the audience, each project's `dashboard:` word in `.open-autonomy/config.yaml` says who sees which panel;
the books and every metered call are always the audience's.

## What is not here

Patronage: GitHub Sponsors, Polar, grant credits, coupons, tiers, the patrons wall and the giving page are Open
Autonomy's app (`apps/platform/`), not the backend's. Everything else the public platform does, this does.
