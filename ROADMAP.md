# open-autonomy roadmap

Sourced planning memory maintained by the Hermes PM scrum. Completed work belongs in `CHANGELOG.md` and Git history; this file keeps only outstanding outcomes and the next release decision.

## release-next: Publish the onboarding-ready autonomy operating model

Status: the 2.8.2 proposal is withdrawn. The `sharp` advisory is remediated, the verified owner's closure of PR #594 publicly affirms accepted ADR 0001 over the superseded runtime proposal, and the operating-state implementation has landed. Replacement artifact preparation remains held while the owner-authored PR #618–#621 stack receives independent review and its package/wire changes stabilize.
Dispatch: hold
Release decision: prepare
Target version: deploy-v2026.09.15.1; create-open-autonomy 2.10.0; @open-autonomy/sdk 3.0.0; @open-autonomy/backend 0.3.0
Target window: 2026-09-15 18:00–22:00 EDT
Review by: 2026-09-14 12:00 EDT
Candidate: pending
Scope: GitHub-authenticated giving, live-versus-landed status and the unified past/present/future timeline in the service; the reusable backend split and its first self-hosted Cloudflare deployment package, without a storage migration; the Hermes kit changes for owner outreach, idle upgrades, sourced scrum, release review and owner-requested running/paused state; the repository-owned team roster and Team editor, shared integration branding and installed project GitHub App; reproducible fresh-project bootstrap, protected browser-to-storage credential capture, container-compatible runtime slugs, explicit model/funding choice and protected-branch-safe owner-policy/key setup; ADR 0001's host valve/reporter and transient installed-Codex app-server boundary for bare and containerized Hermes; and, if PR #618–#621 pass review, the SDK 3.0 interface-only surface, single automation-events reporting door and removal of platform knowledge of Hermes board/task structure. Giving-secret activation, real-money activation, deployment of a self-hosted instance and the seven-day observation are excluded.
Readiness: pending
Readiness evidence: the previously reviewed feature handoffs and onboarding evidence remain applicable, and `hermes:task/t_71c39b4b` established the superseded 2.8.2/2.4.1 artifact baseline. [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506) replaced setup's copied Codex OAuth credential with the installed native runtime, but its signed-in-home activation timed out and its Security check failed because the unchanged lockfile then audited `GHSA-rgj7-g3m4-5g8c`. [PRs #513–#515](https://github.com/open-autonomy-org/open-autonomy/pull/515) added protected credential capture and the unified timeline. [PRs #518–#522](https://github.com/open-autonomy-org/open-autonomy/pull/522) separated the reusable backend, added self-hosting and exercised installed Codex control-plane discovery. [PR #551](https://github.com/open-autonomy-org/open-autonomy/pull/551) pinned `sharp@0.35.4` and resolved the advisory prerequisite. [PR #597](https://github.com/open-autonomy-org/open-autonomy/pull/597) merged the exact-head-approved ADR 0001 host valve/reporter and installed-Codex app-server boundary; the verified owner's later [PR #594 closure](https://github.com/open-autonomy-org/open-autonomy/pull/594#issuecomment-5648467119) publicly affirms that accepted replacement. [PR #611](https://github.com/open-autonomy-org/open-autonomy/pull/611) merged exact-head-approved ADR 0003 and the operating-state wire at kit 2.9.0, SDK 2.5.0 and backend 0.2.0; only its live-run pause window remains to exercise. The proposed PR #618–#621 stack has green Land/Security and top-stack World observations, but no exact-head review, retains a forbidden backend test edit and lacks the review-verdict/handoff product-path observation. No replacement tarballs or fixed candidate exist.
Rationale: do not ask a maintainer to approve 2.8.2 after its setup behavior and package boundaries were materially replaced, or select a candidate before the current owner-authored stack passes exact-head review and artifact verification. The September 15 window preserves review lead time; it remains a forecast, not a shipping trigger, and slips if those reviews or artifacts remain open.
Version rationale: service tags use dated `deploy-v*` identifiers, so the forecast remains the first September 15 sequence. Main now contains the unpublished kit 2.9.0, SDK 2.5.0 and backend 0.2.0 operating-state manifests. PR #620 proposes kit 2.10.0, SDK 3.0.0 and backend 0.3.0; the SDK major is appropriate only if review accepts removal of its host-tool binaries and package surface, while the kit/backend minor increments carry their relocated responsibilities. Registry publication, tags and manifest bumps remain evidence inputs, not authority to ship.

Readiness criteria and release gates:
- `bun run check` and `bun scripts/check-supply-chain.ts` pass for the selected candidate, and the package tarballs contain the intended 2.10.0, 3.0.0 and backend 0.3.0 artifacts.
- The review package names the exact candidate, versions, scope, risks and authorized tag commands.
- A maintainer must still review the exact candidate and explicitly approve both human-cut tags and their production-environment runs.
- The service deployment is verified separately from npm publication; neither is inferred from the other.

Dependencies and risks:
- The live `/healthz` response still does not name a commit, so production status for the latest deploy tag is not independently verifiable yet.
- The installed GitHub App exposes PR, review, workflow, tag and release evidence; no replacement candidate, maintainer approval, release run or matching release tag exists yet.
- Docker UID isolation/token refresh and delayed-review native auto-merge remain unverified end to end after PR #493; candidate preparation must preserve these as explicit operational risks rather than claiming live proof.
- PR #496 fails closed when committed Hermes configuration cannot be loaded after an interrupted task, but Docker ownership transition remains statically reviewed and committed provenance for every executable runtime file is not established.
- Local Codex in the container is unverified: the start script's forwarding through the valve's Codex port has not yet carried one real model turn on a Docker host.
- Verified owner `yueranyuan` closed PR #594 with [comment 5648467119](https://github.com/open-autonomy-org/open-autonomy/pull/594#issuecomment-5648467119), affirming accepted ADR 0001 as the replacement for that superseded runtime proposal. This resolves the authority conflict recorded from PR #593; the remaining container turn and model-twin observations are verification risks, not scope authority gaps.
- Owner-authored PR #611 and ADR 0003 landed at approved head `fda82472`, bringing unpublished kit 2.9.0, SDK 2.5.0 and backend 0.2.0 manifests to main. The live-run pause window remains unexercised, and no package publication or deployment is implied.
- Verified-owner commits in stacked PRs [#618–#621](https://github.com/open-autonomy-org/open-autonomy/pull/621) propose kit 2.10.0, SDK 3.0.0 and backend 0.3.0 plus material wire/responsibility changes. Land/Security pass, but exact-head reviews are pending in `hermes:task/t_76e970b3`, `hermes:task/t_115575ae`, `hermes:task/t_e93e9c81` and `hermes:task/t_7acecc4b`; the cumulative branches modify a persistent backend test, and PR #621 explicitly lacks manual review-verdict/handoff publication evidence.
- The giving UI requires `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `GIVE_SESSION_HMAC_SECRET`; production activation remains a separate held outcome until their approved installation and a live check are evidenced.

Sources: withdrawn candidates [`7f9ba08f`](https://github.com/open-autonomy-org/open-autonomy/commit/7f9ba08fb4b14ee50ae57195c8b0b312dbe9da4e) and [`ad41f1b5`](https://github.com/open-autonomy-org/open-autonomy/commit/ad41f1b5d97d14e1d3a620a9c8f46e159e2d4b45), [PR #449](https://github.com/open-autonomy-org/open-autonomy/pull/449), [PR #461](https://github.com/open-autonomy-org/open-autonomy/pull/461), [PR #463](https://github.com/open-autonomy-org/open-autonomy/pull/463), [PR #464](https://github.com/open-autonomy-org/open-autonomy/pull/464), [PR #465](https://github.com/open-autonomy-org/open-autonomy/pull/465), [PR #468](https://github.com/open-autonomy-org/open-autonomy/pull/468), [PRs #492–#496](https://github.com/open-autonomy-org/open-autonomy/pull/496), [PR #499](https://github.com/open-autonomy-org/open-autonomy/pull/499), [PR #500](https://github.com/open-autonomy-org/open-autonomy/pull/500), [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506), [PR #509](https://github.com/open-autonomy-org/open-autonomy/pull/509), [PRs #513–#515](https://github.com/open-autonomy-org/open-autonomy/pull/515), [PRs #518–#522](https://github.com/open-autonomy-org/open-autonomy/pull/522), `hermes:task/t_71c39b4b`, [package release procedure](packages/kit-hermes/README.md), and [.open-autonomy/PRODUCTION.md](.open-autonomy/PRODUCTION.md).

## release-hardening: Prepare the replacement onboarding and backend artifacts

Status: the security prerequisite landed in PR #551. The obsolete 2.8.3/2.4.2 artifact card is retired; replacement preparation stays held until PR #618–#621 review resolves the intended 2.10.0/3.0.0/0.3.0 package shape and the remaining runtime observations.
Dispatch: hold

Source: [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506), its failed [Security run](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34285712444), [PRs #518–#522](https://github.com/open-autonomy-org/open-autonomy/pull/522), the resolved `GHSA-rgj7-g3m4-5g8c` prerequisite in [PR #551](https://github.com/open-autonomy-org/open-autonomy/pull/551), the superseded artifact review `hermes:task/t_71c39b4b`, the retired stale-version task `hermes:task/t_85106ace`, and the current PR #618–#621 review scopes.

Completion:
- Preserve PR #551's `sharp@0.35.4` remediation and confirm the selected candidate's supply-chain scan remains green without weakening or editing the protected security workflow.
- Reconcile reviewed manifests at create-open-autonomy 2.10.0, `@open-autonomy/sdk` 3.0.0 and `@open-autonomy/backend` 0.3.0, upgrade this repository and every cookbook normally, and inspect all three package tarballs.
- Run the canonical root check, hand off for independent review and report the remaining Docker, delayed-review, live-GitHub and executable-provenance gaps. Do not publish, tag or deploy.

## local-codex-plain: The bare and containerized fleets look the same; the container forwards

Status: the verified owner publicly affirmed accepted ADR 0001 when closing the superseded PR #594, resolving the recorded authority conflict in favor of PR #597's host-service boundary. Acceptance remains held for the container turn, model-twin Responses proof and review of the current host-tool relocation stack.
Dispatch: hold

Source: the verified owner's [PR #593 ruling](https://github.com/open-autonomy-org/open-autonomy/pull/593#issuecomment-5628311527) was the original contrary public evidence. Accepted [ADR 0001](docs/decisions/0001-runtime-boundary.md) explicitly replaces that conflicting instruction and PR #594; verified owner `yueranyuan` then affirmed that replacement in [comment 5648467119](https://github.com/open-autonomy-org/open-autonomy/pull/594#issuecomment-5648467119). [PR #597](https://github.com/open-autonomy-org/open-autonomy/pull/597) is the merged implementation, approved at exact head `b13099c0`; PR #620 proposes relocating the same host tools between packages without changing the trust boundary.

Completion:
- Bare: both profiles use native Hermes `openai-codex` through the host valve and transient access from the installed Codex app-server; no login is copied into project or Hermes storage, a missing current computer login fails closed, and autonomous use has the required OS-user credential boundary.
- Container: Hermes receives only a stand-in credential and forwards through the host valve/Codex app-server boundary; the login never enters the executor. Prove one real turn in the managed container on a Docker host.
- The project-owned [World scenario](world/README.md) points the provider at its model twin through `HERMES_CODEX_BASE_URL`; a native agent turn passes through that endpoint.

## operating-state-sdk: The owner's running or paused word travels through the SDK

Status: owner-authored implementation and ADR 0003 landed in PR #611. Exact-head App review approved the source and manually exercised the ambiguous pause interruption; the native review scope confirmed approved-head ancestry on main. The live-run pause window remains outstanding and current reporter changes in PR #619–#621 are still under review.
Dispatch: hold

Source: verified owner `yueranyuan` authored and signed all three commits in merged [PR #611](https://github.com/open-autonomy-org/open-autonomy/pull/611); [ADR 0003](docs/decisions/0003-operating-state-through-the-sdk.md) separates the owner's desired state from the automation's observed state. The ADR's quoted private conversation is not used as authority evidence. [App review 5184632769](https://github.com/open-autonomy-org/open-autonomy/pull/611#pullrequestreview-5184632769) records the prior-head source defect; commit [`fda82472`](https://github.com/open-autonomy-org/open-autonomy/commit/fda82472abc290e8f5165082d4d44b2cf1003c0f) writes ownership ahead of the mutation. [Exact-head approval 5186028179](https://github.com/open-autonomy-org/open-autonomy/pull/611#pullrequestreview-5186028179) records the disposable World interruption, restart and owned-only resume observations; `hermes:task/t_fb86081f` confirms that head in main.

Completion:
- A `steer`-scoped owner request records `running` or `paused`; an arbitrary automation reads it through the SDK, applies it by its own method and reports the truth through the SDK, while the platform only records and displays desired versus observed state.
- The Hermes kit stops scheduled work without interrupting a live run, reports paused only when no job is enabled or running, and resumes exactly the jobs it paused; state survives reload and failures remain visible.
- Exercise the live-run pause window through the disposable World product path: while a run is active, a pause request remains visibly desired-paused/observed-running, the run finishes without interruption, then the reporter disables scheduled work and reports paused. Recheck this after the current reporter stack settles. Release, publication and deployment remain separate gates.

## sdk-interface-only: The SDK is the automation interface, not its host machinery

Status: verified-owner commits are open as the stacked PR #618–#621 series. Review is pending; the top branch reports World observations for the new event/SDK/package shape but not the review-verdict/handoff update path.
Dispatch: hold

Source: signed owner commits at [PR #618](https://github.com/open-autonomy-org/open-autonomy/pull/618), [PR #619](https://github.com/open-autonomy-org/open-autonomy/pull/619), [PR #620](https://github.com/open-autonomy-org/open-autonomy/pull/620) and [PR #621](https://github.com/open-autonomy-org/open-autonomy/pull/621); exact-head review scopes `hermes:task/t_76e970b3`, `hermes:task/t_115575ae`, `hermes:task/t_e93e9c81` and `hermes:task/t_7acecc4b`.

Completion:
- Reserve `paused` for the owner's operating state and call a funded balance spent to zero `exhausted` without changing the ledger's spending behavior.
- Carry automation reporting, including the timeline, through the events door; keep roadmap mutation on the owner's steer-only door and return truthful status/error receipts for every client write.
- Keep SDK 3.0 to the public automation interface, codecs, drivers, roster and key helpers; relocate host tools to the kit and owner-config parsing to the backend without weakening credential, runtime or publication boundaries.
- Remove the platform's Hermes-shaped task/board record: item status is the lane, sessions are attempts, and review verdicts/handoffs arrive exactly once as restart-durable item updates. Exercise that path manually in the World.
- Satisfy the ADR process for the material wire/package/platform-responsibility changes and remove all persistent automated test code or test edits from the proposed diff before exact-head approval.

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