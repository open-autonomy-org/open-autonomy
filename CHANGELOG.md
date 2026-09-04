# Changelog

## Unreleased
- **The redesign.** The repository is Open Autonomy in four pieces, greenfield: the platform (`apps/platform`), the SDK (`packages/sdk`), the Hermes kit (`packages/kit-hermes`), the cookbooks, and this install's own boilerplate. The compiler lineage lives in `volter-ai/open-autonomy-compiler`.
- The platform's books carry over; its keys now verify by signature and expiry alone, so a redeploy loses no key, and a registry on the books lists, revokes and holds a rotated key's grace. Spend leaves through rails that name themselves on the audit trail (`model` live; cards and partners planned). The per-run token model, the run lanes, the proxy session capture and the fleet health monitor are gone.
- The development stream: sessions with a kind, an optional roadmap item and an optional outcome, several live at once; updates on items; spend attributed to the one live session at settle time; a session page and an item page on the site, live over Server-Sent Events.
- `@open-autonomy/sdk`: the roadmap model with a byte-stable codec (the platform's page parses through it), the stream client, the key helpers, and a README that shows the raw wire.
- The Hermes kit: `bun create open-autonomy <dir>` scaffolds a complete repository from its identity parameters; `adopt`, `check` and `upgrade` keep the kit-owned files current. The reporter is an SDK-to-SDK bridge (supercode's harness SDK in, the Open Autonomy SDK out) running as the stack's keyless third service beside the key valve. The model is the project's runtime config; the license is the project's file.
- The world runs the platform, the kit and the cookbook against twins of GitHub, Discord and the model gateway; `probe` proves the platform without an agent, `check` walks one roadmap item end to end.
