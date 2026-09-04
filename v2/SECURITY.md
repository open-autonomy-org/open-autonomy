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
- The platform (`platform/`): auth bypass, minting tokens beyond their bounds, spend-cap bypass,
  account or fund manipulation, webhook-signature bypass, storefront injection, and any way a
  sponsor's money could be spent on something other than the project's metered token usage.

**Out of scope**
- Vulnerabilities in third-party services (GitHub, the model provider, Cloudflare).
- Issues requiring a compromised maintainer machine or admin credentials.
- Self-XSS, or missing hardening headers without demonstrated impact.

## Trust model

The abuse and spend model is documented in `platform/README.md`. Reports that violate those
boundaries are especially valuable.

## Operating it yourself

open-autonomy is provided **AS-IS** (Apache-2.0, no warranty). If you deploy the platform, **you**
are responsible for the secrets, spend, and accounts you grant it.
