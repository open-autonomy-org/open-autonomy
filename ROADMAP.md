# open-autonomy roadmap

Sourced planning memory maintained by the Hermes PM scrum. Completed work belongs in `CHANGELOG.md` and Git history; this file keeps only outstanding outcomes and the next release decision.

## release-next: Publish the onboarding-ready autonomy operating model

Status: the 2.8.2 proposal is withdrawn after its unchanged lockfile began failing the required supply-chain scan; replacement hardening is blocked on a patched Cloudflare dependency release.
Dispatch: hold
Release decision: prepare
Target version: deploy-v2026.09.10.1; create-open-autonomy 2.8.3; @open-autonomy/sdk 2.4.2
Target window: 2026-09-10 18:00–22:00 EDT
Review by: 2026-09-10 12:00 EDT
Candidate: pending
Scope: GitHub-authenticated giving, live-versus-landed status and the unified past/present/future timeline in the service; the 2.7–2.8 Hermes kit changes for owner outreach, idle upgrades, sourced scrum and release review; the repository-owned team roster and Team editor, shared integration branding and installed project GitHub App; reproducible fresh-project bootstrap, protected browser-to-storage credential capture, container-compatible runtime slugs, explicit model/funding choice and protected-branch-safe owner-policy/key setup; fail-closed local Codex selection while its isolated host-sidecar/container runtime remains future work; and the SDK subscription-stream, credential and timeline-wire changes. Giving-secret activation, real-money activation and the seven-day observation are excluded.
Readiness: pending
Readiness evidence: the previously reviewed feature handoffs and onboarding evidence remain applicable, and `hermes:task/t_71c39b4b` established the superseded 2.8.2/2.4.1 artifact baseline. [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506) replaced setup's copied Codex OAuth credential with the installed native runtime, but its signed-in-home activation timed out and its Security check failed because the unchanged lockfile now audits one high-severity `sharp` advisory, `GHSA-rgj7-g3m4-5g8c`. [PR #509](https://github.com/open-autonomy-org/open-autonomy/pull/509) then closed the unsafe host-execution path: local selection is retained but activation now fails closed until an isolated runtime exists. [PRs #513–#514](https://github.com/open-autonomy-org/open-autonomy/pull/514) added direct protected capture and immediate provider verification for displayed credentials, and [PR #515](https://github.com/open-autonomy-org/open-autonomy/pull/515) implemented the owner-directed unified timeline; both now need inclusion in the renewed artifacts. `hermes:task/t_85106ace` confirmed that current `wrangler@4.130.0` resolves `miniflare@5.20260908.0-alpha`, which still pins vulnerable `sharp@0.35.2`; the September 8 recheck found the published chain unchanged, so no owning dependency can yet supply the required `sharp >=0.35.4`. A replacement candidate needs that upstream release, a green supply-chain scan, coherent package versions and renewed artifact/runtime verification.
Rationale: do not ask a maintainer to approve an artifact whose dependency lock now fails the repository's required security gate, or publish 2.8.2 after its setup behavior was materially replaced on main. The September 10 window remains a forecast, not a shipping trigger, and is at risk until Cloudflare publishes the patched dependency chain with enough time for remediation and fresh review.
Version rationale: service tags use dated `deploy-v*` identifiers, so the replacement forecast moves to the next unused September 10 sequence. The unpublished kit and SDK each need a patch increment because PR #506 changed both the setup artifact and the SDK's exported runtime support after the reviewed 2.8.2/2.4.1 candidate. Registry publication, tags and manifest bumps remain evidence inputs, not authority to ship.

Readiness criteria and release gates:
- `bun run check` and `bun scripts/check-supply-chain.ts` pass for the selected candidate, and the package tarballs contain the intended 2.8.3/2.4.2 artifacts.
- The review package names the exact candidate, versions, scope, risks and authorized tag commands.
- A maintainer must still review the exact candidate and explicitly approve both human-cut tags and their production-environment runs.
- The service deployment is verified separately from npm publication; neither is inferred from the other.

Dependencies and risks:
- The live `/healthz` response still does not name a commit, so production status for the latest deploy tag is not independently verifiable yet.
- The installed GitHub App exposes PR, review, workflow, tag and release evidence; no replacement candidate, maintainer approval, release run or matching release tag exists yet.
- Docker UID isolation/token refresh and delayed-review native auto-merge remain unverified end to end after PR #493; candidate preparation must preserve these as explicit operational risks rather than claiming live proof.
- PR #496 fails closed when committed Hermes configuration cannot be loaded after an interrupted task, but Docker ownership transition remains statically reviewed and committed provenance for every executable runtime file is not established.
- PR #509 prevents local Codex from exposing the operator's host, but the intended host sidecar/container executor, disconnect behavior, real subscription authentication, in-container Hermes callbacks and host-side reporting remain unimplemented or unverified.
- The giving UI requires `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `GIVE_SESSION_HMAC_SECRET`; production activation remains a separate held outcome until their approved installation and a live check are evidenced.

Sources: withdrawn candidates [`7f9ba08f`](https://github.com/open-autonomy-org/open-autonomy/commit/7f9ba08fb4b14ee50ae57195c8b0b312dbe9da4e) and [`ad41f1b5`](https://github.com/open-autonomy-org/open-autonomy/commit/ad41f1b5d97d14e1d3a620a9c8f46e159e2d4b45), [PR #449](https://github.com/open-autonomy-org/open-autonomy/pull/449), [PR #461](https://github.com/open-autonomy-org/open-autonomy/pull/461), [PR #463](https://github.com/open-autonomy-org/open-autonomy/pull/463), [PR #464](https://github.com/open-autonomy-org/open-autonomy/pull/464), [PR #465](https://github.com/open-autonomy-org/open-autonomy/pull/465), [PR #468](https://github.com/open-autonomy-org/open-autonomy/pull/468), [PRs #492–#496](https://github.com/open-autonomy-org/open-autonomy/pull/496), [PR #499](https://github.com/open-autonomy-org/open-autonomy/pull/499), [PR #500](https://github.com/open-autonomy-org/open-autonomy/pull/500), [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506), [PR #509](https://github.com/open-autonomy-org/open-autonomy/pull/509), [PRs #513–#515](https://github.com/open-autonomy-org/open-autonomy/pull/515), `hermes:task/t_71c39b4b`, [package release procedure](packages/kit-hermes/README.md), and [.open-autonomy/PRODUCTION.md](.open-autonomy/PRODUCTION.md).

## release-hardening: Prepare the replacement onboarding artifacts

Status: blocked upstream until a published Wrangler/Miniflare dependency chain uses `sharp >=0.35.4`; recheck before releasing the existing fleet task.
Dispatch: hold

Source: [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506), its failed [Security run](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34285712444), `GHSA-rgj7-g3m4-5g8c`, the superseded artifact review `hermes:task/t_71c39b4b`, and the upstream dependency finding in `hermes:task/t_85106ace`.

Completion:
- Update the transitive `sharp` dependency through its owning package so `bun scripts/check-supply-chain.ts` is green without weakening or editing the protected security workflow.
- Advance create-open-autonomy to 2.8.3 and `@open-autonomy/sdk` to 2.4.2, upgrade this repository and every cookbook normally, and inspect both package tarballs.
- Exercise fresh setup and prove that the generated entrypoint refuses explicit or profile-selected local Codex before starting fleet processes. Preserve the isolated-runtime outcome below as unclaimed rather than bypassing the guard with a host-level activation.
- Run the canonical root check, hand off for independent review and report the remaining Docker, delayed-review, live-GitHub and executable-provenance gaps. Do not publish, tag or deploy.

## local-codex-isolation: Run local Codex without exposing the operator's host

Status: activation fails closed; the intended isolated runtime is not implemented or end-to-end verified.
Dispatch: hold

Source: [PR #509](https://github.com/open-autonomy-org/open-autonomy/pull/509), which landed the safety guard and recorded the remaining boundary.

Completion:
- Hermes, its workspace and every agent tool run inside the container while a host sidecar retains the installed Codex authentication and connects only the bounded model/runtime surface.
- Executor disconnects fail without host fallback; the container cannot read operator files or credentials.
- The operator's actual subscription proves native initialization, account access and one bounded turn, followed by in-container PM/worker tools and host-side reporting. Synthetic providers and empty Codex homes do not establish activation.

Dependency: the current machine could not start the Docker World with 448 MiB available against its 2048 MiB requirement, so the required isolation proof needs a capable verification environment before fleet dispatch.

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