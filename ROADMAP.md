# open-autonomy roadmap

Sourced planning memory maintained by the Hermes PM scrum. Completed work belongs in `CHANGELOG.md` and Git history; this file keeps only outstanding outcomes and the next release decision.

## release-next: Publish the onboarding-ready autonomy operating model

Status: final onboarding candidate ready for maintainer review; this is a proposal, not release authority.
Dispatch: hold
Release decision: request-review
Target version: deploy-v2026.09.08.1; create-open-autonomy 2.8.1; @open-autonomy/sdk 2.4.1
Target window: 2026-09-08 18:00–22:00 EDT
Review by: 2026-09-08 12:00 EDT
Candidate: ad41f1b5d97d14e1d3a620a9c8f46e159e2d4b45
Scope: GitHub-authenticated giving and live-versus-landed status in the service; the 2.7–2.8 Hermes kit changes for owner outreach, idle upgrades, sourced scrum and release review; the repository-owned team roster and Team editor, shared integration branding and installed project GitHub App; reproducible fresh-project bootstrap with a pinned Bun/runtime requirement and project-local TypeScript; and the SDK 2.4.1 subscription-proxy reliability repair. Giving-secret activation, real-money activation and the seven-day observation are excluded.
Readiness: ready-for-review
Readiness evidence: reviewed handoffs for `hermes:task/t_abe517c5`, `hermes:task/t_9427f376`, `hermes:task/t_8d0834f4` and `hermes:task/t_42194efa`; onboarding changes and their twin/live setup evidence in [PR #461](https://github.com/open-autonomy-org/open-autonomy/pull/461), [PR #463](https://github.com/open-autonomy-org/open-autonomy/pull/463) and [PR #464](https://github.com/open-autonomy-org/open-autonomy/pull/464); the reproduced 20-second quiet-stream repair in [PR #465](https://github.com/open-autonomy-org/open-autonomy/pull/465); and the isolated packed-kit bootstrap, frozen install, project-local compiler and current-kit world lifecycle proof in [PR #468](https://github.com/open-autonomy-org/open-autonomy/pull/468). PR #468's Security and landing workflows succeeded, and the final candidate-specific root check passed with Bun 1.3.10 after installing its locked dependencies. Exact source is the fixed [candidate](https://github.com/open-autonomy-org/open-autonomy/commit/ad41f1b5d97d14e1d3a620a9c8f46e159e2d4b45).
Rationale: the previous proposal omitted the final bootstrap repair required to make a fresh adopter's declared check reproducible rather than dependent on a global compiler. Replacing it before human review keeps one coherent onboarding cut; main remains beyond [`deploy-v2026.09.06.4`](https://github.com/open-autonomy-org/open-autonomy/tree/deploy-v2026.09.06.4) and the published kit 2.6.0, while the autonomy observation cannot begin until the new behavior is live.
Version rationale: service tags use dated `deploy-v*` identifiers and the next unused September 8 sequence is `.1`; the kit manifest is 2.8.1 after the planning-model changes, and SDK 2.4.1 is the landed patch. Registry publication, tags and manifest bumps are evidence inputs, not authority to ship.

Readiness criteria and release gates:
- `bun run check` passes for the selected candidate and the package tarballs contain the intended 2.8.1/2.4.1 artifacts.
- The review package names the exact candidate, versions, scope, risks and authorized tag commands.
- A maintainer must still review the exact candidate and explicitly approve both human-cut tags and their production-environment runs.
- The service deployment is verified separately from npm publication; neither is inferred from the other.

Dependencies and risks:
- The live `/healthz` response still does not name a commit, so production status for the latest deploy tag is not independently verifiable yet.
- The installed GitHub App now exposes PR, review, workflow, tag and release evidence; no maintainer approval, release run or newer release tag was found for this candidate.
- The giving UI requires `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `GIVE_SESSION_HMAC_SECRET`; production activation remains a separate held outcome until their approved installation and a live check are evidenced.

Sources: candidate [`ad41f1b5`](https://github.com/open-autonomy-org/open-autonomy/commit/ad41f1b5d97d14e1d3a620a9c8f46e159e2d4b45), [PR #449](https://github.com/open-autonomy-org/open-autonomy/pull/449), [PR #461](https://github.com/open-autonomy-org/open-autonomy/pull/461), [PR #463](https://github.com/open-autonomy-org/open-autonomy/pull/463), [PR #464](https://github.com/open-autonomy-org/open-autonomy/pull/464), [PR #465](https://github.com/open-autonomy-org/open-autonomy/pull/465), [PR #468](https://github.com/open-autonomy-org/open-autonomy/pull/468), [package release procedure](packages/kit-hermes/README.md), and [.open-autonomy/PRODUCTION.md](.open-autonomy/PRODUCTION.md).

## give-auth-production: Activate and verify the signed-in giving page in production

Status: implementation reviewed in the twin world; production configuration and verification are not evidenced.
Dispatch: hold

Source: `hermes:task/t_abe517c5`, approved implementation `389ce3b1`, and the candidate's [`give-auth.ts`](https://github.com/open-autonomy-org/open-autonomy/blob/6e4a12ba6a0422066ef4e5ea8fb0f51763d64997/apps/platform/src/give-auth.ts).

Completion:
- A maintainer provisions the GitHub OAuth app and installs `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `GIVE_SESSION_HMAC_SECRET` through a reviewed production authority path; no agent receives them.
- On the deployed service, a funder signs in, sees credits, makes one idempotent earmarked gift, and the project's public books show the matching envelope.

Risk: the current `sync-secrets` workflow does not name these three secrets. No human implementation commitment is recorded, so this remains held rather than assigned.

## seven-day-autonomy: Run seven days with no human act but release review and shipping

Status: owner-gated observation; its prerequisite implementations are reviewed, but current production and the start of the clock are not evidenced.
Dispatch: hold

Source: `hermes:task/t_f934d2a1`; prerequisite reviews `hermes:task/t_9427f376`, `hermes:task/t_8d0834f4` and `hermes:task/t_42194efa`.

Completion:
- After live-versus-landed status, owner outreach and self-upgrade are live for this project and Hookline, the owner starts the clock.
- Both projects then run for seven consecutive days in which the only human acts are cutting an approved tag and approving its run; every human block reaches the owner, every kit release is adopted by PM, and every landed change is requested rather than merely noticed.
- A kit defect filed during the observation ends it and starts a new seven-day window after correction. Evidence is the published sessions, board history and release/deploy runs.

Dependency: `release-next` must ship and be verified before the owner starts the observation.

## real-money-live: Real money flows on open-autonomy.org

Status: current owner-gated outcome; code paths are proven against twins, but no real transaction is evidenced.
Dispatch: hold

Source: `hermes:task/t_33aac5e5`; the deferral from grant-credit v2 is recorded in commits [`8ad2a7fa`](https://github.com/open-autonomy-org/open-autonomy/commit/8ad2a7fa7c31782f16c57b445e168d29b33d70cd) and [`3075a32b`](https://github.com/open-autonomy-org/open-autonomy/commit/3075a32b952d4da0651dadb04c87089b9ca00c35).

Completion:
- The owner establishes a Polar organization and the org's live Stripe account with Issuing, installs the tokens and webhook secrets through the reviewed admin workflow, and enrolls the webhook endpoints.
- One real patronage lands on this project's books through Polar, its payout reaches the org, the Issuing balance is funded from it, and this install's agent makes one real bounded purchase recorded on the public audit trail.

The owner has not committed to a date. Preserve this hold until the identity, bank and production evidence exist.