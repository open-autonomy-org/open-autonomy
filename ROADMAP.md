# open-autonomy roadmap

Sourced planning memory maintained by the Hermes PM scrum. Completed work belongs in `CHANGELOG.md` and Git history; this file keeps only outstanding outcomes and the next release decision.

## release-next: Publish the onboarding-ready autonomy operating model

Status: preparing a replacement onboarding candidate; the previous candidate was withdrawn before approval after two protected-branch setup defects were confirmed.
Dispatch: hold
Release decision: prepare
Target version: deploy-v2026.09.09.1; create-open-autonomy 2.8.2; @open-autonomy/sdk 2.4.1
Target window: 2026-09-09 18:00–22:00 EDT
Review by: 2026-09-09 12:00 EDT
Candidate: pending
Scope: GitHub-authenticated giving and live-versus-landed status in the service; the 2.7–2.8 Hermes kit changes for owner outreach, idle upgrades, sourced scrum and release review; the repository-owned team roster and Team editor, shared integration branding and installed project GitHub App; reproducible fresh-project bootstrap, explicit model/funding choice and protected-branch-safe owner-policy/key setup; and the SDK 2.4.1 subscription-proxy reliability repair. Giving-secret activation, real-money activation and the seven-day observation are excluded.
Readiness: pending
Readiness evidence: the previously reviewed feature handoffs and onboarding evidence remain applicable, and post-candidate setup improvements landed in [PR #492](https://github.com/open-autonomy-org/open-autonomy/pull/492), [PR #493](https://github.com/open-autonomy-org/open-autonomy/pull/493) and [PR #494](https://github.com/open-autonomy-org/open-autonomy/pull/494), all with successful landing and security checks. A replacement candidate, protected-branch setup repair, 2.8.2 artifact and candidate-specific check are still required.
Rationale: [PR #494](https://github.com/open-autonomy-org/open-autonomy/pull/494) identified two remaining Git defects, confirmed in pinned source: owner-rule setup switches away from its temporary branch and can read a vanished local `CODEOWNERS`, while key minting commits a claim then pushes the protected current branch directly. The post-candidate setup behavior also needs a new kit patch version. With no human approval recorded for `ad41f1b5d97d14e1d3a620a9c8f46e159e2d4b45`, withdrawing that request and allowing a day for repair and renewed review is safer than shipping a known-broken onboarding path.
Version rationale: service tags use dated `deploy-v*` identifiers, so the replacement window uses the next unused September 9 sequence; the kit advances from unpublished 2.8.1 to patch 2.8.2 for compatible setup reliability fixes, while SDK 2.4.1 remains the landed patch. Registry publication, tags and manifest bumps are evidence inputs, not authority to ship.

Readiness criteria and release gates:
- `bun run check` passes for the selected candidate and the package tarballs contain the intended 2.8.2/2.4.1 artifacts.
- The review package names the exact candidate, versions, scope, risks and authorized tag commands.
- A maintainer must still review the exact candidate and explicitly approve both human-cut tags and their production-environment runs.
- The service deployment is verified separately from npm publication; neither is inferred from the other.

Dependencies and risks:
- The live `/healthz` response still does not name a commit, so production status for the latest deploy tag is not independently verifiable yet.
- The installed GitHub App exposes PR, review, workflow, tag and release evidence; no maintainer approval, release run or newer release tag was found for the withdrawn candidate.
- Docker UID isolation/token refresh and delayed-review native auto-merge remain unverified end to end after PR #493; candidate preparation must preserve these as explicit operational risks rather than claiming live proof.
- The giving UI requires `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `GIVE_SESSION_HMAC_SECRET`; production activation remains a separate held outcome until their approved installation and a live check are evidenced.

Sources: withdrawn candidate [`ad41f1b5`](https://github.com/open-autonomy-org/open-autonomy/commit/ad41f1b5d97d14e1d3a620a9c8f46e159e2d4b45), [PR #449](https://github.com/open-autonomy-org/open-autonomy/pull/449), [PR #461](https://github.com/open-autonomy-org/open-autonomy/pull/461), [PR #463](https://github.com/open-autonomy-org/open-autonomy/pull/463), [PR #464](https://github.com/open-autonomy-org/open-autonomy/pull/464), [PR #465](https://github.com/open-autonomy-org/open-autonomy/pull/465), [PR #468](https://github.com/open-autonomy-org/open-autonomy/pull/468), [PR #492](https://github.com/open-autonomy-org/open-autonomy/pull/492), [PR #493](https://github.com/open-autonomy-org/open-autonomy/pull/493), [PR #494](https://github.com/open-autonomy-org/open-autonomy/pull/494), [package release procedure](packages/kit-hermes/README.md), and [.open-autonomy/PRODUCTION.md](.open-autonomy/PRODUCTION.md).

## setup-git-bootstrap: Make setup safe on protected main

Status: ready to repair two confirmed setup paths before selecting the replacement release candidate.
Dispatch: fleet

Source: [PR #494](https://github.com/open-autonomy-org/open-autonomy/pull/494) and pinned source at `481d3d47588b4d3cf54048029a4d1d37523dc85c` in `packages/kit-hermes/src/setup.ts` (`stepOwnerRules`) and `.open-autonomy/mint-key.ts`.

Completion:
- Owner-rule setup can create or resume its landing branch, wait for the intended `CODEOWNERS` on `origin/main`, and verify it without depending on a working-tree file removed by switching branches; reruns reconcile an existing branch/PR instead of attempting to recreate it.
- Initial key minting lands the platform claim on the protected default branch through the repository's normal landing path, waits for that exact claim, and only then mints; it never pushes directly to protected `main`, while rotation remains unchanged.
- The kit advances to 2.8.2, the repository and cookbooks are upgraded normally, `bun run check` passes, and the protected-branch paths are exercised in the world as far as its GitHub twin supports them; any native GitHub behavior the twin lacks is reported explicitly.

Dependency: the replacement `release-next` candidate cannot be selected until this outcome is reviewed and landed.

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