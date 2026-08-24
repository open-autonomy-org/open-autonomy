# The issuing bridge

Reserve-gated Stripe Issuing cards for the unpartnered procurement tail — the third rung of
the rails ladder (first-party settlement → partner settlement → **bounded cards**). Design:
`RAILS-BRIDGE-BLUEPRINT` (company layer); financial architecture: `DEMO-AUTONOMOUS-ORG.md` §4.

**The invariant:** the treasury is causally upstream of every dollar.
- No treasury reserve → no card (mint refuses; unfunded 402 / banned 403 surface verbatim).
- No LIVE hold at authorization time → decline (`GET /v1/supplier/reserves/:id` must answer
  `held` inside the 2-second window; an unreachable treasury is a decline — fail-closed).
- No matched settle → incident (an orphan capture blows the minting fuse; only the admin
  token resets it).

## The flow

```
signed approval artifact (Ed25519, RH2 procurement approval — the bridge trusts the
signature, not the caller)
  → POST /v1/cards: treasury keyed reserve (rsv:issuing-bridge:<job_ref>)
  → float watermark gate (armed exposure ≤ FLOAT_WATERMARK_CENTS)
  → Stripe exact-amount single-use virtual card (idempotency-keyed on the reserve id)
  → CardRegistry Binding 'armed'
issuing_authorization.request → five-clause decision + atomic single-use latch
issuing_transaction.created (capture) → idempotent treasury settle (receipt = txn id)
  → card canceled → float decremented
janitor cron → expired armed cards: float restored, card canceled, hold released
```

Every failure path releases its hold: **no card, no exposure**.

## Rehearsal

`STRIPE_API_BASE` and `TREASURY_URL` are vars: a `volter-world` rehearsal points them at
the stripe twin (with its Issuing real-time-auth leg) and the oa-treasury twin — the whole
flow drills with zero real money. Live-fire flips two URLs and two secrets.

## Configuration

Secrets (`wrangler secret put …`): `STRIPE_KEY`, `STRIPE_WEBHOOK_SECRET`,
`TREASURY_SUPPLIER_TOKEN` (`sup.issuing-bridge.<secret>`), `ADMIN_TOKEN`.
Vars: `TREASURY_URL`, `STRIPE_API_BASE`, `APPROVAL_PUBKEY` (base64url raw Ed25519),
`FLOAT_WATERMARK_CENTS`, `CARD_EXPIRY_MARGIN_SECONDS`.

Supplier onboarding (once, treasury admin): register supplier `issuing-bridge` with
category `procurement`; set per-org exposure caps via `/admin/accounts/:id/supplier-cap`.

## Not yet built (blueprint PRs 5b-9)

The stripe-side transaction sweep (reconciler backfilling dropped webhooks + balance
cross-check), approval classes (RH2-side), rent accruals + the rate card (RH2-side), and
the rehearsal-week drill pack.
