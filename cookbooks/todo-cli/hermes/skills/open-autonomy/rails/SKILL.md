---
name: rails
description: Spend beyond model calls through the platform's rails — a single-use card or a partner charge — only for an acceptance line that needs it, within the owner's bounds, naming the purpose.
version: 2.0.0
metadata:
  hermes:
    tags: [open-autonomy, rails, spending]
    category: devops
    requires_toolsets: [terminal]
---

# The rails

Your model calls are one rail. Two more reach the same books through the key valve at
`$OPEN_AUTONOMY_BASE_URL` (`http://valve:8787/v1` inside the stack), bounded by the owner in
`.open-autonomy/config.yaml` under `rails:`; a rail the owner left at `0` refuses.

- Spend through a rail only when an acceptance line cannot be made true without it (a domain, a
  service's minutes), for the smallest amount that does it, naming the purpose. Every settlement is
  public on the project's audit trail and on the item's page, with the merchant or partner.
- **A card**: `POST /v1/rails/card {"usd_cents": <n>, "purpose": "<why>"}` mints a single-use virtual card
  bounded to the amount and the owner's merchant categories; the answer carries its `id`, `last4`,
  expiry and, where the issuer exposes them, `number` and `cvc`. Pay the merchant once; the authorization
  is decided in real time against the bound and the category, and the capture settles under your session.
  Never write the number anywhere that persists.
- **A partner**: `POST /v1/rails/partner {"partner": "<id>", "usd_cents": <n>, "unit": "<unit>",
  "quantity": <q>, "reference": "<their id>"}` settles a listed partner's metered charge now.
- A refusal (`rail_not_configured`, `over_bound`, `category_not_allowed`, `partner_not_allowed`) is the
  owner's decision: say what the line needed and stop; never work around it.
