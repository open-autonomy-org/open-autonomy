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
rail on; `GITHUB_TOKEN` reads private repositories and raises the sync's rate limit. `GITHUB_API_BASE` and
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

The API is key-authenticated and the admin routes take the token; the pages (`/`, `/p/*`) are open to anyone
who can reach the worker. For a private deployment put an access policy in front of those two paths at the
edge (Cloudflare Access on the worker's route, an allow list of your people) and leave `/v1/*`, `/admin/*` and
`/webhooks/*` to their own authentication. The worker holds no notion of a viewer; that is the edge's job.

## What is not here

Patronage: GitHub Sponsors, Polar, grant credits, coupons, tiers, the patrons wall and the giving page are Open
Autonomy's app (`apps/platform/`), not the backend's. Everything else the public platform does, this does.
