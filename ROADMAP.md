# open-autonomy roadmap

Sourced planning memory maintained by the Hermes PM scrum. Completed work belongs in `CHANGELOG.md` and Git history; this file keeps only outstanding outcomes and the next release decision.

## release-next: Publish the onboarding-ready autonomy operating model

Status: the 2.8.2 proposal is withdrawn after its unchanged lockfile began failing the required supply-chain scan; replacement hardening is blocked on a patched Cloudflare dependency release.
Dispatch: hold
Release decision: prepare
Target version: deploy-v2026.09.10.1; create-open-autonomy 2.8.3; @open-autonomy/sdk 2.4.2; @open-autonomy/backend 0.1.0
Target window: 2026-09-10 18:00–22:00 EDT
Review by: 2026-09-10 12:00 EDT
Candidate: pending
Scope: GitHub-authenticated giving, live-versus-landed status and the unified past/present/future timeline in the service; the reusable backend split and its first self-hosted Cloudflare deployment package, without a storage migration; the 2.7–2.8 Hermes kit changes for owner outreach, idle upgrades, sourced scrum and release review; the repository-owned team roster and Team editor, shared integration branding and installed project GitHub App; reproducible fresh-project bootstrap, protected browser-to-storage credential capture, container-compatible runtime slugs, explicit model/funding choice and protected-branch-safe owner-policy/key setup; local Codex as plain Hermes with the container forwarding the subscription; and the SDK subscription-stream, credential and timeline-wire changes. Giving-secret activation, real-money activation, deployment of a self-hosted instance and the seven-day observation are excluded.
Readiness: pending
Readiness evidence: the previously reviewed feature handoffs and onboarding evidence remain applicable, and `hermes:task/t_71c39b4b` established the superseded 2.8.2/2.4.1 artifact baseline. [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506) replaced setup's copied Codex OAuth credential with the installed native runtime, but its signed-in-home activation timed out and its Security check failed because the unchanged lockfile now audits one high-severity `sharp` advisory, `GHSA-rgj7-g3m4-5g8c`. [PR #509](https://github.com/open-autonomy-org/open-autonomy/pull/509) then closed the unsafe host-execution path: local selection is retained but activation now fails closed until an isolated runtime exists. [PRs #513–#514](https://github.com/open-autonomy-org/open-autonomy/pull/514) added direct protected capture and immediate provider verification for displayed credentials, and [PR #515](https://github.com/open-autonomy-org/open-autonomy/pull/515) implemented the owner-directed unified timeline. [PRs #518–#520](https://github.com/open-autonomy-org/open-autonomy/pull/520) separated the reusable `@open-autonomy/backend`, proved application state survives load/restart/export, and added a bare self-hosted deployment; the owner approved PR #520's package-release workflow change, which is not candidate release approval. [PRs #521–#522](https://github.com/open-autonomy-org/open-autonomy/pull/522) verified the installed Codex control plane against a signed-in account and selected model without a turn, and documented that native database preparation can exceed setup's three-minute wait. All need inclusion in renewed artifacts. `hermes:task/t_85106ace` confirmed that current `wrangler@4.130.0` resolves `miniflare@5.20260908.0-alpha`, which still pins vulnerable `sharp@0.35.2`; the September 9 recheck found the published chain unchanged while `sharp@0.35.4` remains available, so no owning dependency can yet supply the patch. A replacement candidate needs that upstream release, a green supply-chain scan, coherent package versions and renewed artifact/runtime verification.
Rationale: do not ask a maintainer to approve an artifact whose dependency lock now fails the repository's required security gate, or publish 2.8.2 after its setup behavior was materially replaced on main. The September 10 window remains a forecast, not a shipping trigger, and is at risk until Cloudflare publishes the patched dependency chain with enough time for remediation and fresh review.
Version rationale: service tags use dated `deploy-v*` identifiers, so the replacement forecast moves to the next unused September 10 sequence. The unpublished kit and SDK each need a patch increment because setup and exported SDK behavior changed after the reviewed 2.8.2/2.4.1 candidate. The new backend has no registry release and starts at 0.1.0 under its package manifest. Registry publication, tags and manifest bumps remain evidence inputs, not authority to ship.

Readiness criteria and release gates:
- `bun run check` and `bun scripts/check-supply-chain.ts` pass for the selected candidate, and the package tarballs contain the intended 2.8.3, 2.4.2 and backend 0.1.0 artifacts.
- The review package names the exact candidate, versions, scope, risks and authorized tag commands.
- A maintainer must still review the exact candidate and explicitly approve both human-cut tags and their production-environment runs.
- The service deployment is verified separately from npm publication; neither is inferred from the other.

Dependencies and risks:
- The live `/healthz` response still does not name a commit, so production status for the latest deploy tag is not independently verifiable yet.
- The installed GitHub App exposes PR, review, workflow, tag and release evidence; no replacement candidate, maintainer approval, release run or matching release tag exists yet.
- Docker UID isolation/token refresh and delayed-review native auto-merge remain unverified end to end after PR #493; candidate preparation must preserve these as explicit operational risks rather than claiming live proof.
- PR #496 fails closed when committed Hermes configuration cannot be loaded after an interrupted task, but Docker ownership transition remains statically reviewed and committed provenance for every executable runtime file is not established.
- Local Codex in the container is unverified: the start script's forwarding through the valve's Codex port has not yet carried one real model turn on a Docker host.
- The giving UI requires `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `GIVE_SESSION_HMAC_SECRET`; production activation remains a separate held outcome until their approved installation and a live check are evidenced.

Sources: withdrawn candidates [`7f9ba08f`](https://github.com/open-autonomy-org/open-autonomy/commit/7f9ba08fb4b14ee50ae57195c8b0b312dbe9da4e) and [`ad41f1b5`](https://github.com/open-autonomy-org/open-autonomy/commit/ad41f1b5d97d14e1d3a620a9c8f46e159e2d4b45), [PR #449](https://github.com/open-autonomy-org/open-autonomy/pull/449), [PR #461](https://github.com/open-autonomy-org/open-autonomy/pull/461), [PR #463](https://github.com/open-autonomy-org/open-autonomy/pull/463), [PR #464](https://github.com/open-autonomy-org/open-autonomy/pull/464), [PR #465](https://github.com/open-autonomy-org/open-autonomy/pull/465), [PR #468](https://github.com/open-autonomy-org/open-autonomy/pull/468), [PRs #492–#496](https://github.com/open-autonomy-org/open-autonomy/pull/496), [PR #499](https://github.com/open-autonomy-org/open-autonomy/pull/499), [PR #500](https://github.com/open-autonomy-org/open-autonomy/pull/500), [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506), [PR #509](https://github.com/open-autonomy-org/open-autonomy/pull/509), [PRs #513–#515](https://github.com/open-autonomy-org/open-autonomy/pull/515), [PRs #518–#522](https://github.com/open-autonomy-org/open-autonomy/pull/522), `hermes:task/t_71c39b4b`, [package release procedure](packages/kit-hermes/README.md), and [.open-autonomy/PRODUCTION.md](.open-autonomy/PRODUCTION.md).

## kit-rehearsal: Every project rehearses its own method in a world

Status: planned
Dispatch: fleet
Scope: the rehearsal engine is in the template (`.open-autonomy/rehearsal/`, kit-owned): the world's front door, the
seed onto the GitHub twin, the backend copy, the Actions runner, the brain's stack from a clean environment, and the
story runner with its acts, conditions and static scenario checks. What remains: `create` seeds a starter
`rehearsal/` (a world of the project's chosen channels, a scenario scaffold, one story, a hooks file); the Peak
engagement is re-adopted onto it and its hand-written copies deleted; this repository's own `world/` becomes an
instance of it, which is the proof the machinery is general.
Completion:
- a fresh `create-open-autonomy create` yields a project whose `run.ts up` brings a world and whose one seeded story passes
- `peak-autonomy` runs its three stories on the kit's engine, with only its world, scenario, stories and hooks its own
- `world/run.ts` is the kit's rehearsal with the cookbook as the project
Rationale: the machinery was written three times (the product's world, the engagement's rehearsal, and nothing in the
template). Every defect found in one copy was invisible to the others.

## release-hardening: Prepare the replacement onboarding and backend artifacts

Status: blocked upstream until a published Wrangler/Miniflare dependency chain uses `sharp >=0.35.4`; recheck before releasing the existing fleet task.
Dispatch: hold

Source: [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506), its failed [Security run](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34285712444), [PRs #518–#522](https://github.com/open-autonomy-org/open-autonomy/pull/522), `GHSA-rgj7-g3m4-5g8c`, the superseded artifact review `hermes:task/t_71c39b4b`, and the upstream dependency finding in `hermes:task/t_85106ace`.

Completion:
- Update the transitive `sharp` dependency through its owning package so `bun scripts/check-supply-chain.ts` is green without weakening or editing the protected security workflow.
- Advance create-open-autonomy to 2.8.3 and `@open-autonomy/sdk` to 2.4.2, preserve the new `@open-autonomy/backend` at its initial 0.1.0, upgrade this repository and every cookbook normally, and inspect all three package tarballs.
- Run the canonical root check, hand off for independent review and report the remaining Docker, delayed-review, live-GitHub and executable-provenance gaps. Do not publish, tag or deploy.

## local-codex-plain: The bare and containerized fleets look the same; the container forwards

Status: landed; the container forwarding awaits one turn on a Docker host, and a project rehearsal awaits the model twin's Responses door.
Dispatch: hold

Source: the owner's ruling that the non-containerized fleet is plain Hermes and containerization forwards everything, one merely safer than the other. [PR #509](https://github.com/open-autonomy-org/open-autonomy/pull/509) had made the container a precondition of the native path instead.

Completion:
- Bare: `provider: openai-codex` in both profiles runs on the computer's login, the Codex CLI's adopted into Hermes's store on the first start; a computer without one cannot start.
- Container: the start script forwards through the valve's Codex port with a stand-in credential in the home's auth store; the login never enters the agent. Proven by one turn in the managed container on a Docker host.
- A world points the provider at its model twin through `HERMES_CODEX_BASE_URL`; the rehearsal engine sets it and a story passes on it.

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