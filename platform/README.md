# The Open Autonomy platform (`agent-model-proxy`)

**The books of Open Autonomy**, as one Cloudflare Worker. This package holds a funded project's
**books and its money
boundary**:

- **The funding-account tree** — every project and named root is an account; mint/grant/consume
  with a hard conservation invariant (total minted = total consumed + total still held).
- **The model proxy** — every model call an agent makes goes through here on a project key; the proxy's
  settlements are the only debits on the books.
- **The public funding storefront** — snapshots, runway SVGs, sponsor/coupon plumbing, the
  explore/project pages (open-autonomy.org).


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
- `GET /v1/accounts/:id/runway.svg`, `.../now.svg`, `.../roadmap.svg`, `.../activity.svg` — public, Camo-safe SVG
  widgets for that account's README: balance and runway; the live job or the schedule and last run; the roadmap's
  stations; calls, spend per day and the last call.
- `GET /v1/keys/challenge?account=owner/repo` → the claim code for today; commit it as `.open-autonomy-claim`
  on the default branch. `POST /v1/keys/mint {account, models?}` → reads the file back through raw GitHub and
  mints a **standing key** (no per-run cap; bounded by the account balance + the global daily cap; ≤ 3 per
  account). `POST /v1/keys/rotate` with the current key as bearer → a fresh key; the old one lives one more day.
- `POST /v1/agent/events` (bearer: the project's standing key; the account is the key's own) — the agent-side
  reporter's narration of a run: `{kind:'started', key, title?, job_name?, item_id?, started_at?}`,
  `{kind:'turns', key, turns:[{role, text?, tool?, args?, result?, ts?}], item_id?}` (appended, bounded),
  `{kind:'finished', key, status:'done'|'failed', report?, commit_sha?}`. `GET /v1/accounts/:id/jobs` lists the
  receipts (and `current`, the job in flight); `GET .../jobs/:key` is one job with its transcript.
  `DELETE /admin/accounts/:id/jobs/:key` drops a mis-narrated receipt. `platform/scripts/agent-reporter.ts` is
  the reporter (reads the Hermes home through supercode's harness protocol; `--install` for launchd).
- `GET /v1/accounts/:id/calls?limit=50&before=<cursor>` — public, the account's **audit trail**: every metered
  model call (time, run, actor, model, tokens, cost), newest first, durable and never evicted. `next` is the
  cursor for the following page.
- `GET /v1/funding`, `/v1/funding/{runway,roadmap,activity}.svg`, `/v1/funding/calls` — aliases for `DEFAULT_FUNDING_ACCOUNT`.
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
  -d '{"amount_usd_cents":5000,"from":"open-autonomy-org/open-autonomy","sponsor":{"login":"acme","name":"ACME Cloud","tagline":"infra for builders"}}'
curl -X POST https://<proxy-host>/v1/coupons/redeem -d '{"code":"SPON-XXXX-XXXX-XXXX","account":"volter-ai/some-project"}'
```


## Secrets

```bash
bunx wrangler secret put AGENT_PROXY_ADMIN_TOKEN
bunx wrangler secret put AGENT_PROXY_HMAC_SECRET
bunx wrangler secret put MODEL_GATEWAY_API_KEY        # the ONLY provider key — all model spend routes here
bunx wrangler secret put GITHUB_SPONSORS_WEBHOOK_SECRET
```

**Single provider.** Every model settles through the model gateway — it speaks **both**
wires, so the proxy shares its native routes on each side: the Anthropic
`/v1/messages` (→ the gateway's `/v1/messages`) and the OpenAI
`/v1/chat/completions` (→ the gateway's `/v1/chat/completions`). A `vendor/slug`
id (e.g. `deepseek/deepseek-v4-flash`) passes through; a bare id is mapped to its
vendor slug (`gpt-4o` → `openai/gpt-4o`, `claude-sonnet-4-6` →
`anthropic/claude-sonnet-4-6`). The gateway reports the real cost and the proxy
settles against it, reserving `MODEL_GATEWAY_RESERVE_USD_PER_MTOK` (default 30) up
front and truing it down; a price-table entry only tightens the reservation.

Routing everything through one **prepaid** provider is deliberate: the loaded
the model gateway credit balance is the hard ceiling on all model spend — the one limit a
compromised proxy can't raise (it lives at the model gateway, not in the worker). There is
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
