# Self-hosting the reusable backend

This directory mounts `worker()` from [the reusable backend](../../packages/backend/README.md) in an
operator's Cloudflare account: publication, policy, treasury, keys, rails, streams, shared views and widgets.
`src/index.ts` re-exports `LimitLedger`; `wrangler.toml` declares its `LIMITS` binding, SQLite-class migration,
asset directory and schedules. It hosts the backend, not project compute.

The bare mount has no funding-provider checkout, giving-page sign-in or patronage application. An operator
mints budgets, and the shared front lists projects admitted by their visibility. To add application services,
use the backend's existing extensions. [ADR 0024](../../docs/decisions/0024-ecosystem-target-architecture.md)
records the responsibility map and acceptance status; self-host participation in official discovery/funding,
replication and treasury federation remain undecided. Keys and funds belong to this deployment.

## Configure and deploy

These are operator instructions, not permission for a repository agent to deploy. Development and manual
verification use [World](../../world/README.md) with synthetic vendors. Keep service credentials in deployment
custody, outside project checkouts and public sessions.

From a checkout with workspace dependencies installed, configure the Worker through the operator's own
Cloudflare account:

```bash
cd apps/self-host
bunx wrangler secret put AGENT_PROXY_ADMIN_TOKEN
bunx wrangler secret put AGENT_PROXY_HMAC_SECRET
bunx wrangler secret put MODEL_GATEWAY_API_KEY
bun run deploy
```

The admin token protects `/admin/*`; the HMAC secret signs project keys. Keep the signing secret stable
across redeploys: changing it invalidates every outstanding key. `MODEL_GATEWAY_URL` selects the model
gateway; its service key stays at the backend. `deploy` builds the shared browser assets before deploying
and records the source commit. Check the Durable Object binding/migration and both configured schedules
when adapting the manifest; they are part of the backend deployment.

Optional card configuration is `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
`ISSUING_BILLING_ADDRESS_JSON`. Absent configuration refuses the rail. Repository access uses `GITHUB_TOKEN`
when required; the bare backend permits private repositories when accessible, whereas the official app
sets its admission policy to refuse them. `GITHUB_API_BASE` and `GITHUB_RAW_BASE` select GitHub Enterprise
endpoints for claim proof and configuration reads. A project still proves repository control.

Optional Workplace integration uses `WORKPLACE_URL`, `WORKPLACE_APP_ID`, `WORKPLACE_CLIENT_ID` and
`WORKPLACE_CLIENT_SECRET`, with a registered callback for this deployment. Follow
[ADR 0018](../../docs/decisions/0018-the-workplace-integration.md): linking needs the owner's steer key and
workspace-admin consent. Missing configuration refuses linking; repository settings alone do not prove
that a live installation or its protected credentials exist.

## Connect a project

A starter is optional. To generate the IR/company layout, for example:

```bash
bun create open-autonomy my-company --project my-company --account owner/company --skew company
```

For the default Hermes layout omit `--skew company`; `adopt` adds missing starter files to an existing
repository. Set `platform:` in the generated `.open-autonomy/config.yaml` to this Worker's origin, then
follow the kit's generated setup guide for the selected runtime. Its host key tool requests the repository
claim and writes a minted token directly to protected host custody:

```bash
bun .open-autonomy/mint-key.ts --models <model-id> --out ~/.config/open-autonomy/owner/company/agent.env
```

If it prepares `.open-autonomy-claim`, land that file on the default branch through the project's normal
review path and rerun. The tool does not commit or push. Its `--rotate` mode updates the same protected
file; the valve rereads it. Agents use the valve's stand-in credential, not the host's real key.

The operator separately funds the account through `POST /admin/accounts/:account/mint` with
`x-admin-token` and `{ "amount_usd_cents": 10000 }`. Encode `owner/repo` as one route segment. Minting a
key grants no budget, and a key cannot widen the committed model or spending bounds.

A system using no kit can speak [the SDK wire](../../packages/sdk/README.md) directly: obtain the claim
from `GET /v1/keys/challenge?account=owner/repo`, land it, and securely receive the result of
`POST /v1/keys/mint`. Send publication to this server's `/v1/agent/events` with `narrate` authority and model
calls through its metered rail with `spend` authority. Keep native identities and truthful lifecycle facts;
conformance includes authorization, repository policy and metered spending. A JSON shape alone is not
conformance. Host adapters remain responsible for acknowledged publication/replay and native owner control.

## Who may read

The bare Worker supplies no human identity/viewer door: browser viewers are public, even behind an edge
login. Pages at `/`, `/<name>`, `/<owner>/<project>` and dashboard tabs show only panels admitted by the
committed configuration. The current default exposes overview, work and books; sessions, transcripts and
agent setup require team authority. This guide does not adopt a proposed private-by-default change or
alter the constitution's public-books requirement.

Account API reads and widgets can be anonymous where their panels are public. Restricted reads return
`not_open` (404) unless admitted by a matching project key, the organization's steer authority, or a viewer
provided by an app extension. Mutation routes require their specific scopes; claim and mint routes use
repository proof; `/admin/*` takes the operator token; provider webhooks verify provider authentication.
There is no blanket rule that every `/v1/*` route requires a key.

An operator can add an edge access policy over pages and assets, but that neither identifies an OA owner
nor grants team access inside the bare Worker. Leave machine API and webhook paths reachable under their
own authentication, or explicitly configure cooperating clients for the chosen edge policy. Human sign-in
and role-aware browser controls require an application identity/viewer extension. Compatible widgets and
`oa` clients point to this backend; linking Workplace does not copy native sessions or grant their access.

## Operation and recovery

The operator owns deployment, protected credentials, storage, upgrades and recovery. `/healthz` reads the
Durable Object under a bound and reports the baked source commit; `/admin/status` exposes ledger status
and outstanding partner holds. Operator release of an abandoned partner hold is part of the
[reservation protocol](../../docs/decisions/0016-partner-reservations.md), not deletion of accounting history.

Redeploying with the same storage binding and signing secret preserves supported state; the ledger
normalizes older state on load. This is not a complete backup or migration facility. There are no public
admin export/import routes in this mount, no documented cross-deployment restore guarantee and no automatic
replication. Plan recovery with the infrastructure provider, preserve all ledger and extension storage
(including consented Workplace installation credentials), and reconcile money operations before resuming
spending after an uncertain outcome. Publication history is a projection, not the native system's archive.
