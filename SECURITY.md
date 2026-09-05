# Security Policy

open-autonomy operates a metered model-token and funding platform that handles real money. We take
security seriously and welcome responsible disclosure.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue or PR.

- **Preferred:** GitHub private vulnerability reporting — the repository's **Security** tab →
  **Report a vulnerability** (GitHub Security Advisories).
- We aim to acknowledge within 3 business days and to share a remediation timeline after triage.

Include: the affected component, reproduction steps, impact, and any proof-of-concept.

## Scope

**In scope**
- The platform (`apps/platform/`): auth bypass, minting tokens beyond their bounds, spend-cap bypass,
  account or fund manipulation, webhook-signature bypass, storefront injection, and any way a
  sponsor's money could be spent on something other than the project's metered token usage.

**Out of scope**
- Vulnerabilities in third-party services (GitHub, the model provider, Cloudflare).
- Issues requiring a compromised maintainer machine or admin credentials.
- Self-XSS, or missing hardening headers without demonstrated impact.

## Trust model

Every boundary below is a claim the code makes and a test or a world line proves. `scripts/check-docs.ts`
verifies each `proof:` names a line that exists (`smoke` — `apps/platform/test/smoke.test.ts`; `world` —
`world/probe.ts`, `world/verify.ts`, `world/stack.ts`), so a claim cannot outlive its proof. Reports that
cross one of these boundaries are especially valuable.

- **A key is a signed claim file.** `base64url(claims).hmac`: it verifies by signature and expiry alone, so
  it survives every redeploy, and a forged or altered key is refused. The registry can only shorten a key's
  life (revoke, or a rotation's grace). proof: smoke "survives a redeploy; refusals"; proof: world "the key
  spent again after the books were re-read"; proof: world "the old key is refused after its grace".
- **A key spends only what it names.** Its models are in its claims; a model outside them is refused (403);
  an unfunded account is refused before any model is reached. proof: smoke "a forged key, a model outside
  the key, an unfunded account, admin without the token".
- **Key scopes.** `spend` reaches the rails; `narrate` the development stream and the roadmap the substrate
  works; `steer` an owner-side roadmap push. A steer key spends nothing, and a key that only spends can neither
  narrate nor steer. proof: smoke "a steer key spends nothing; a key that only spends cannot narrate or steer a
  roadmap".
- **The balance hard-stop and the daily rail.** Every spend reserves before it runs and settles to the
  reported cost; at zero balance, or over the global daily cap, the platform refuses. proof: smoke "books and
  keys: money in, a key by claim file, a metered call on both wires, the audit trail".
- **The rails are bounded by the owner, not the agent.** A card is single-use, bounded to its amount and the
  owner's merchant categories, decided in real time, retired on capture; a decline releases its
  reservation; a partner the owner did not list cannot settle. proof: smoke "a card minted within the bound,
  approved in real time, settled on capture and retired; a decline releases"; proof: world "the wrong
  category and an unlisted partner were refused".
- **Grant credits move only from a funder's own books.** A funder's key proves their GitHub login through the
  claim file in a repository they own and can only give; a grant over the credits they hold is refused, and a
  give key can neither spend nor narrate. proof: smoke "over the credits refused; a give key cannot spend";
  proof: world "over the credits and spending were refused".
- **The org's matching bonus spreads, never returns.** A funder's bonus credits can be given only to projects
  the funder does not own, and the org matches only from what its grants account holds. proof: smoke "bonus_only_for_others";
  proof: world "the bonus went only to another project, the refusal named it".
- **Webhooks are signed.** Stripe's, Polar's and GitHub Sponsors' events are accepted only with a valid
  signature within their window; a forged event moves nothing. proof: smoke "a forged webhook, an unlisted
  partner"; proof: world "a forged event was refused".
- **The key valve, and the keyless reporter.** Inside a project's stack only the valve holds the key; it
  forwards the model routes, the narration route, the rails and public reads, never key management or admin
  routes. The reporter holds no key. The agent's environment says `OPEN_AUTONOMY_KEY=valve`, and every
  session's turns are published, so nothing in the agent's reach is a secret that matters. proof: smoke
  "secrets never reach the books".
- **Admin goes through GitHub.** Every admin route needs the admin token, which lives only in the
  `production` environment (and in the worker); `.github/workflows/admin.yml` is the only caller, and its
  reviewer approves each run. proof: smoke "admin without the token".
- **The books can be restored, only whole and only by admin.** An export is every entry; an import into a
  non-empty worker is refused unless the reviewed caller says replace. proof: smoke "exported whole, restored
  over a wiped worker, the same"; proof: world "restored over the wiped worker".
- **What the agent can read.** The agent reads its own account's public routes and nothing privileged; the
  world's egress is sealed, so anything it reached for outside the twins would be refused loudly. proof:
  world "egress sealed".

## Operating it yourself

open-autonomy is provided **AS-IS** (Apache-2.0, no warranty). If you deploy the platform, **you**
are responsible for the secrets, spend, and accounts you grant it.
