# Open Autonomy Treasury (`agent-model-proxy`)

**The books of Open Autonomy**, as one Cloudflare Worker. This package holds a funded project's
**books and its money
boundary**:

- **The funding-account tree** — every project and named root is an account; mint/grant/consume
  with a hard conservation invariant (total minted = total consumed + total still held).
- **The generic supplier API** — authorized external billers (compute hosts, labor marketplaces,
  media renderers, …) post itemized debits and two-phase reserve/settle holds against accounts,
  under per-supplier scoped credentials, category grants, and account-set exposure caps.
- **The model proxy** — bounded per-run model tokens for semi-untrusted agent runs; the proxy's
  own settlements are just supplier #0 (`model-proxy`, category `model`) on the same books.
- **The public funding storefront** — snapshots, runway SVGs, sponsor/coupon plumbing, the
  explore/project pages (open-autonomy.org).
- *(Planned, not built: an issuing bridge that turns treasury reserves into bounded single-use
  cards — the reserve/settle primitive here is its foundation.)*


**Versioning.** The package version (`package.json`, currently `0.1.0`) versions the **HTTP API
surface**, semver-style: additive endpoints/fields bump minor, breaking changes to a published
route bump major. The worker deploy itself is versioned by `deploy-v*` tags (see `DEPLOY.md`);
the two are independent. The package stays in-repo at `platform/` — the package
boundary is this README + the API surface, not a repo split.

## API

- `GET /healthz`
- `POST /admin/runs/mint`
- `POST /admin/runs/:run_id/revoke`
- `GET /admin/runs/:run_id`
- `GET /v1/runs/:run_id`
- `POST /anthropic/v1/messages`
- `POST /openai/v1/chat/completions`
- `POST /openai/v1/responses`

## Funding: a tree of accounts

Funding is a **tree of accounts** (every repo slug + named roots like `volter`). An account's spendable
`balance = granted_in − granted_out − consumed`, on three operations:

- **mint** — new credits enter at a node (real money). The only thing that increases the total.
- **grant** — credits move between accounts (transfer; conserves the total).
- **consume** — agent spend leaves the system (paid to the model provider), debiting that project's account.

Invariant: **total minted = total consumed + total still held.** Volter mints the root, open-autonomy
grants down to its testbeds, and each project spends its own balance and hard-stops at zero.

Endpoints:

- `POST /admin/accounts/:id/mint` — money in at `:id`. Body `{ amount_usd_cents, key?, sponsor? }`. Idempotent on `key`.
- `POST /admin/accounts/:id/grant` — transfer from `:id`. Body `{ to, amount_usd_cents, key? }`. Refused if `:id` lacks the balance.
- `POST /admin/accounts/:id/accrue` — mint `:id` with its active recurring sponsors' monthly total. Body `{ key }`. Also fired by the monthly cron.
- `GET /v1/accounts/:id` — public funding snapshot (balance, granted in/out, consumed, burn, runway, sponsors).
- `GET /v1/accounts/:id/runway.svg` — public, Camo-safe runway SVG for that account's README.
- `GET /v1/funding` + `GET /v1/funding/runway.svg` — aliases for `DEFAULT_FUNDING_ACCOUNT`.
- `POST /webhooks/github-sponsors` — GitHub Sponsors webhook (HMAC-verified, no token); maintains the
  `DEFAULT_SPONSOR_ACCOUNT`'s recurring-sponsor list and mints one-time gifts.
- `POST /admin/coupons` / `GET /admin/coupons` — issue/list **coupons** (bearer/deferred grants).
- `POST /v1/coupons/redeem` — redeem a coupon into an account. Body `{ code, account }`.

**Enforcement / rollout.** Spend is hard-stopped on the account balance only when
`ENFORCE_ACCOUNT_BALANCE=true`. Default is `false` so the model can be deployed and the tree
bootstrapped (mint root, grant to active repos) BEFORE the gate turns on — otherwise every unfunded
repo would stop the instant this ships. Bootstrap with `bun platform/scripts/fund-bootstrap.ts`, verify balances,
then flip the var.

**Coupons** decouple granting funding from paying: issue a coupon for a sponsor's committed amount (with
their logo/tagline), hand them the code; redemption mints (or, with `from`, grants from an issuer
account) into the recipient and puts them on the README. Money is settled out-of-band.

```bash
# fund the tree (root + grants down), idempotent
MODEL_PROXY_URL=... MODEL_PROXY_ADMIN_TOKEN=... bun platform/scripts/fund-bootstrap.ts
# issue + redeem a coupon
curl -X POST https://<proxy-host>/admin/accounts/volter/mint -H "x-admin-token: $TOK" -d '{"amount_usd_cents":50000}'
curl -X POST https://<proxy-host>/admin/coupons -H "x-admin-token: $TOK" \
  -d '{"amount_usd_cents":5000,"from":"volter-ai/open-autonomy","sponsor":{"login":"acme","name":"ACME Cloud","tagline":"infra for builders"}}'
curl -X POST https://<proxy-host>/v1/coupons/redeem -d '{"code":"SPON-XXXX-XXXX-XXXX","account":"volter-ai/some-project"}'
```

## Suppliers: the generic debit API

A **supplier** is any authorized external biller — a compute host charging machine-seconds, a labor
marketplace charging per assignment, a media renderer, a landlord's rent-accrual bot. Suppliers are
strangers to the treasury: an admin creates a registry entry with a display identity, an
**allowed-category list**, and a scoped bearer credential; from then on the supplier can post debits
against accounts, and nothing more. The proxy's own inline model settlements go through the same
debit path as built-in **supplier #0** (`model-proxy`, category `model`), so the books itemize every
spend path identically.

**Cost categories:** `model | machine-seconds | labor | media | rent | procurement | other`.

**Registry (admin, `X-Admin-Token`):**

- `POST /admin/suppliers` — body `{ id?, name, url?, categories }`. Returns the supplier plus its
  bearer token `sup.<id>.<secret>` **exactly once** (only a hash is stored; re-issue via rotate).
- `GET /admin/suppliers` — list (never exposes secrets).
- `POST /admin/suppliers/:id/rotate` — new token; the old one dies immediately.
- `POST /admin/suppliers/:id/revoke` — terminal; create a new supplier to re-admit.
- `POST /admin/accounts/:id/supplier-cap` — body `{ supplier, max_usd_cents, window_days? }` (null/0
  amount clears). The **supplier-scoped exposure cap**: this supplier's in-flight held reserves plus
  its rolling spend over the window (default 30 days) against this account may not exceed the cap.

**Supplier operations (`Authorization: Bearer sup.<id>.<secret>`):**

- `POST /v1/supplier/consume` — one-shot itemized debit. Body
  `{ account, amount_usd_cents, category, item, job_ref?, receipt_ref?, key }`. Idempotent on `key`
  (a **refused** attempt does not burn the key). Refused when the category is outside the supplier's
  grant (403), the account is banned (403), the exposure cap would be exceeded (402), or — with
  `ENFORCE_ACCOUNT_BALANCE=true` — when the account lacks spendable balance (402; the same rollout
  flag semantics as the model path: enforcement off = bootstrap phase, spend is allowed through).
- `POST /v1/supplier/reserve` — phase 1 of the two-phase debit: hold funds. Body
  `{ account, amount_usd_cents, category, item, job_ref?, ttl_seconds?, key? }` → `{ reserve_id, … }`.
  A held reserve **counts against spendable balance for every spend path** (supplier and model alike)
  until settled, released, or TTL-expired (default TTL 1h, max 7d — expired holds release
  automatically and can no longer settle). A `key` makes the reserve idempotent: a retried create
  returns the same hold. This is the primitive for long-running machine spawns and the future
  issuing bridge: secure the money first, bill the true cost at the end.
- `POST /v1/supplier/settle` — phase 2. Body `{ reserve_id, amount_usd_cents, receipt_ref? }` with
  amount ≤ the held amount; the remainder releases immediately. Idempotent: re-settling reports the
  original settlement instead of double-debiting.
- `POST /v1/supplier/release` — body `{ reserve_id }`; frees the full hold, consumes nothing.
  Idempotent on closed reserves.
- `GET /v1/supplier/reserves/:id` — the supplier's own view of a reserve (status, amounts, expiry).

Every settled/consumed cent lands in the account's `consumed_by_category` breakdown and in the flow
ledger with `{ supplier, category, item, job_ref?, receipt_ref? }` — so `GET /v1/accounts/:id` can
answer "N% inference / M% execution / K% labor" and the activity feed shows who billed what for what.
`GET /v1/accounts/:id` also now reports `reserved_usd_cents` (in-flight holds) and
`spendable_usd_cents` (balance − reserved).

```bash
# admin: register a supplier and cap its exposure against one account
curl -X POST https://<proxy-host>/admin/suppliers -H "x-admin-token: $TOK" \
  -d '{"id":"acme-machines","name":"ACME Machines","categories":["machine-seconds"]}'   # → token sup.acme-machines.…
curl -X POST https://<proxy-host>/admin/accounts/volter-ai%2Fsome-project/supplier-cap -H "x-admin-token: $TOK" \
  -d '{"supplier":"acme-machines","max_usd_cents":5000,"window_days":30}'
# supplier: hold → settle the true cost (remainder releases)
curl -X POST https://<proxy-host>/v1/supplier/reserve -H "authorization: Bearer $SUPPLIER_TOKEN" \
  -d '{"account":"volter-ai/some-project","amount_usd_cents":800,"category":"machine-seconds","item":"vm-large spawn","job_ref":"job-42","ttl_seconds":7200,"key":"spawn-42"}'
curl -X POST https://<proxy-host>/v1/supplier/settle -H "authorization: Bearer $SUPPLIER_TOKEN" \
  -d '{"reserve_id":"rsv:acme-machines:spawn-42","amount_usd_cents":512,"receipt_ref":"rcpt-9f"}'
```

GitHub Sponsors funding needs **no GitHub token**: set `GITHUB_SPONSORS_WEBHOOK_SECRET`, add the webhook
in the org's Sponsors dashboard (URL `/webhooks/github-sponsors`, JSON, same secret); the monthly cron
(`[triggers] crons`) accrues recurring sponsorships (GitHub sends no per-renewal event).

Embed the runway in a README:

```markdown
[![funding](https://<proxy-host>/v1/funding/runway.svg)](https://github.com/sponsors/<org>)
```

Admin routes require:

```text
X-Admin-Token: $AGENT_PROXY_ADMIN_TOKEN
```

Model routes require:

```text
Authorization: Bearer $MODEL_PROXY_TOKEN
```

## Secrets

```bash
bunx wrangler secret put AGENT_PROXY_ADMIN_TOKEN
bunx wrangler secret put AGENT_PROXY_HMAC_SECRET
bunx wrangler secret put OPENROUTER_API_KEY        # the ONLY provider key — all model spend routes here
bunx wrangler secret put GITHUB_SPONSORS_WEBHOOK_SECRET
```

**Single provider.** Every model settles through OpenRouter — it speaks **both**
wires, so the proxy shares its native routes on each side: the Anthropic
`/v1/messages` (→ OpenRouter `/api/v1/messages`) and the OpenAI
`/v1/chat/completions` (→ OpenRouter `/api/v1/chat/completions`). A `vendor/slug`
id (e.g. `deepseek/deepseek-v4-flash`) passes through; a bare id is mapped to its
vendor slug (`gpt-4o` → `openai/gpt-4o`, `claude-sonnet-4-6` →
`anthropic/claude-sonnet-4-6`). OpenRouter reports the real cost and the proxy
settles against it, reserving `OPENROUTER_RESERVE_USD_PER_MTOK` (default 30) up
front and truing it down; a price-table entry only tightens the reservation.

Routing everything through one **prepaid** provider is deliberate: the loaded
OpenRouter credit balance is the hard ceiling on all model spend — the one limit a
compromised proxy can't raise (it lives at OpenRouter, not in the worker). There is
no first-party `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` anymore; delete them from the
Cloudflare secrets if previously set.

`MODEL_PRICES_JSON` should be set for production so model pricing can be
updated without code changes. Shape:

```json
{
  "claude-sonnet-4-6": { "provider": "anthropic", "input_usd_per_mtok": 3, "output_usd_per_mtok": 15 },
  "gpt-5-mini": { "provider": "openai", "input_usd_per_mtok": 0.25, "output_usd_per_mtok": 2 }
}
```

The built-in table is only a deployment bootstrap. Keep production pricing in
Worker vars.

The fallback table lives in `src/model-prices.ts`. Current defaults are based
on the public provider pricing pages:

- OpenAI API pricing: https://openai.com/api/pricing/
- Anthropic Claude API pricing: https://docs.anthropic.com/en/docs/about-claude/pricing

## Spend And Rate Limits

The proxy enforces limits in two layers:

- `RunBudget` Durable Object: per-run spend, request count, revocation, and
  immutable run contract.
- `LimitLedger` Durable Object: global daily spend plus active/daily run limits
  by actor, repo, and issue.

Default Worker vars:

```text
MAX_RUN_USD_CENTS=500
MAX_RUN_REQUESTS=200
MAX_ACTIVE_RUNS_GLOBAL=10
MAX_ACTIVE_RUNS_PER_REPO=3
MAX_ACTIVE_RUNS_PER_ACTOR=1
MAX_RUNS_PER_REPO_PER_DAY=500
MAX_RUNS_PER_ACTOR_PER_DAY=200
MAX_RUNS_PER_ISSUE_PER_DAY=50
MAX_GLOBAL_DAILY_USD_CENTS=5000
```

`/admin/runs/mint` refuses requested per-run caps above `MAX_RUN_USD_CENTS` or
`MAX_RUN_REQUESTS`. Provider calls reserve against both `RunBudget` and
`LimitLedger`; if either reservation fails, the request does not reach the
provider.

Admin operators can inspect the current ledger without exposing run tokens:

```bash
curl -H "x-admin-token: $AGENT_PROXY_ADMIN_TOKEN" \
  "$MODEL_PROXY_URL/admin/limits/status"
```

The response includes the UTC `day_key`, active run counters, daily run counters
by actor and issue, and global consumed/reserved cents.

## Local Check

```bash
bun run check:agent-proxy
```
