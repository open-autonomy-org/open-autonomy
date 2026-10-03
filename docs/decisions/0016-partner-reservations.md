# ADR 0016: Partner reservations last until keyed capture or release

Status: Proposed; accepted only after independent constitution review and merge.

## Context and sources

Card `t_a7b6c9f2` and RH2 work-ontology's `t_62750a19` require Open Autonomy treasury holds for the full Task lifetime. Manager evidence `m-ce220924` and `m-e76bb82e` records the owner's order: grants ledger, OA treasury, then RH2 Polar. The existing partner route charges immediately, generates a fresh request ID, and has no replay contract. The model reservation expires after ten minutes and is cleared at UTC rollover.

## Decision

Add a partner reservation resource under `/v1/rails/partner/reservations`. Its identity is `(payer account, partner, caller key)`. POST creates one hold; GET by partner/key reconciles it; POST to its `capture` or `release` suffix ends it once. A hold never expires automatically, including at day rollover or worker restart. Terminal records remain durable and keys cannot be reused. Identical retries return the same receipt; changed create or capture payloads, capture-after-release and release-after-capture return conflict.

The payer is always the authenticated `pay` key's account, never a caller-selected account. A registered key must still belong to that account and carry pay authority. A rotated pay key of the same account can reconcile and finish prior holds. The owner must enable the partner rail, list the partner and set its maximum in the repository config. Creation checks those bounds and all existing funding, envelope and spend limits inside the ledger. Capture is bounded by the held amount. Disabling a rail stops new holds; it does not prevent releasing or settling an existing obligation within its original bound.

The recipient is the named partner service (RH2), recorded on the receipt and public spend; this rail accounts for the service's actual charge. It neither transfers credits to a seller account nor proves a seller payout. Supplier enrollment must identify the payer account, partner identity and a credit conversion before RH2 enables treasury-funded work. OA's wire is integer USD cents. RH2 sends explicit whole credits and `usd_cents_per_credit` with the hold; OA checks exact safe-integer multiplication and freezes that conversion in the receipt. Partial capture supplies whole credits at the frozen rate. OA never guesses a rate or accepts rounded fractional cents. The account's pay authority authorizes the quote within the owner's money bounds; enrollment and Task close authority remain RH2's responsibility. Grants-only Tasks never invoke this rail, and prepaid credits cannot be charged a second time.

The reserve, terminal receipt, balance, envelopes and public call record persist as one atomic multi-key storage write. Partner operations are serialized in the existing Durable Object; failed persistence reloads durable state. Persistent reservations use a marked variant of the existing balance/envelope reservation, preserving funding and envelope hard stops. UTC rollover drops only transient reservations. An outstanding hold always counts against its account's balance and envelopes. It counts against the platform's global daily rail on the UTC day it was made, and against the owner's monetary limits in each window that contains its creation; carried past those, it occupies neither, so one project's open Tasks never hold the platform's daily capacity or its own later windows. Its capture is settled spend of the day and windows it lands in. One held Task produces one settled call on capture, no call or charge on release.

## Alternatives and tradeoffs

- Reuse immediate partner settlement: cannot enforce the lifetime hold or keyed retries.
- Reuse model reservation expiry: allows the same funds to be spent while a Task is open.
- Introduce a supplier credential with cross-account debit authority: unnecessary wider trust boundary. RH2 enrolls an account-scoped pay key outside an agent's published session.
- Fix all RH2 credits globally to one cent: no owner ruling sets that conversion. Freeze an explicit enrollment quote instead.

An abandoned hold locks its account's funds until the payer releases it; the authenticated keyed read supports reconciliation. The operator's status lists every outstanding hold, and the operator can release one by its identity through the reviewed admin workflow, closing its receipt as released by the operator; the operator's daily reset takes today's holds off the global rail as rollover does. No timer guesses whether work ended.

## Constitution review (author analysis; independent verdict required)

- **Every spend is metered on public books; settled cents are the only cost.** Creation and cancellation charge nothing. A bounded capture atomically publishes actual cents with the supplier, work reference and frozen conversion.
- **Authority comes from the repository, not a key.** New holds require the committed partner allowlist and money bounds; the key cannot widen those bounds or choose another payer.
- **Nothing in an agent's reach is a secret that matters.** The default developer key lacks pay scope; no cross-account supplier secret is added.
- **The platform shows; it does not steer; only the SDK is real.** OA receives generic service references and quantities, no RH2 Task state or harness data. RH2 decides when its Task can close.
- **No automated tests; nothing develops against a real API.** Manual verification uses the existing World scenario; evidence belongs to the PR. No production release is performed.

Existing [runtime boundary](0001-runtime-boundary.md), [World scenario](0002-world-scenario.md), [SDK interface](0005-the-sdk-is-the-interface.md) and [owner release](0015-the-owner-ships-by-merging-to-prod.md) decisions stand. This record adds the partner lifecycle; it supersedes no accepted record.
