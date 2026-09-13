# open-autonomy roadmap

Sourced planning memory maintained by the Hermes PM scrum. Completed work belongs in `CHANGELOG.md` and Git history; this file keeps only outstanding outcomes and the next release decision.

## release-next: Publish the onboarding-ready autonomy operating model

Status: the 2.8.2 proposal is withdrawn. The operating-state work and SDK-interface replacement are now on main after independent review, including PR #628's atomic update-index follow-up. PR #639 wired the GitHub-addressed page design into the service, PR #640 added repository-derived viewer roles plus the owner's running/paused control, and PR #646 landed the kit-owned runtime at 2.11.0. The PR #638 and PR #644 planning-provenance corrections are complete through separately App-reviewed PRs #642/#643 and #647/#648. The verified owner later cut `deploy-v2026.09.12.1` at `7ad0cab8` before a landed ready PM request; its production run was cancelled. After PR #652 landed, the owner superseded it with `deploy-v2026.09.12.2` at `082869b0`; that run is waiting for production approval. Neither tag is the PM's selected candidate, and the waiting run must not be approved while artifact/runtime verification, the PR #622 provenance repair, the PR #639 test-code correction, review of PR #651's author-recorded approval and the Storybook advisory remain unresolved.
Dispatch: hold
Release decision: defer
Target version: deploy-v2026.09.15.1; create-open-autonomy 2.11.0; @open-autonomy/sdk 3.0.0; @open-autonomy/backend 0.3.0
Target window: deferred; reassess the previous 2026-09-15 18:00–22:00 EDT forecast after the named gates close
Review by: not set while deferred
Candidate: pending
Scope: GitHub-authenticated giving, live-versus-landed status and the unified past/present/future timeline in the service; the GitHub-addressed core pages, platform patronage slots, repository-derived viewer roles, owner-configured dashboard visibility and signed-in owner running/paused control now served by PRs #639 and #640; the reusable backend split and its first self-hosted Cloudflare deployment package, without a storage migration; the Hermes kit changes for owner outreach, idle upgrades, sourced scrum, release review, owner-requested running/paused state, kit-owned host-runtime materialization and runtime identity reporting; the repository-owned team roster and Team editor, shared integration branding and installed project GitHub App; reproducible fresh-project bootstrap, protected browser-to-storage credential capture, container-compatible runtime slugs, explicit model/funding choice and protected-branch-safe owner-policy/key setup; ADR 0001's host valve/reporter and transient installed-Codex app-server boundary for bare and containerized Hermes; and the SDK 3.0 interface-only surface, single automation-events reporting door and removal of platform knowledge of Hermes board/task structure. Giving-secret activation, real-money activation, deployment of a self-hosted instance and the seven-day observation are excluded.
Readiness: pending
Readiness evidence: the previously reviewed feature handoffs and onboarding evidence remain applicable, and `hermes:task/t_71c39b4b` established the superseded 2.8.2/2.4.1 artifact baseline. [PR #551](https://github.com/open-autonomy-org/open-autonomy/pull/551) resolved the `sharp` advisory prerequisite. [PR #597](https://github.com/open-autonomy-org/open-autonomy/pull/597) landed ADR 0001's reviewed host valve/reporter and installed-Codex boundary, publicly affirmed by the verified owner's [PR #594 closure](https://github.com/open-autonomy-org/open-autonomy/pull/594#issuecomment-5648467119). [PR #611](https://github.com/open-autonomy-org/open-autonomy/pull/611), [PR #618](https://github.com/open-autonomy-org/open-autonomy/pull/618) and [PR #624](https://github.com/open-autonomy-org/open-autonomy/pull/624) landed the operating-state terminology and ADR 0005 SDK-interface stack; PR #624's exact head `546af39f` received App [approval 5188123139](https://github.com/open-autonomy-org/open-autonomy/pull/624#pullrequestreview-5188123139). [PR #628](https://github.com/open-autonomy-org/open-autonomy/pull/628) then atomically joined each update record to its identity index at approved head `fff30cc4`, closing the remaining crash-consistency follow-up. [PR #646](https://github.com/open-autonomy-org/open-autonomy/pull/646) landed kit 2.11.0's reviewed runtime materialization at exact App-approved head `933c0cdd`. [PR #652](https://github.com/open-autonomy-org/open-autonomy/pull/652) landed the sign-in secret aliases after exact-head App approval 5189447455. Owner tags `deploy-v2026.09.12.1` and `.2` prove human tag creation, not a ready PM decision, artifact verification, production approval, publication or deployment.
Rationale: defer rather than ask for production approval after tags were cut ahead of the required landed PM decision. The earlier September 15 forecast can be reassessed only after the review, security, manual-runtime and artifact gates close; a tag or waiting deployment is not a shipping trigger.
Version rationale: service tags use dated `deploy-v*` identifiers. The owner-cut September 12 tags are not adopted as the release plan because their commits precede required corrections and candidate verification; the next proposed service version therefore remains the first September 15 sequence. Main contains kit 2.11.0, SDK 3.0.0 and backend 0.3.0; the SDK major records removal of host-tool binaries/package surface, while the kit's new runtime command and backend's relocated responsibilities warrant their minor increments. Registry publication, tags and manifest bumps remain evidence inputs, not authority to ship.

Readiness criteria and release gates:
- GitHub Land and Security succeed for the selected candidate, its promised workflows are manually exercised in the World without running test suites or test-running hooks, and the inspected package tarballs contain the intended 2.11.0, 3.0.0 and backend 0.3.0 artifacts.
- The review package names the exact candidate, versions, scope, risks and authorized tag commands.
- The completed owner tag actions do not replace the required landed PM decision: a maintainer must still review the eventual exact candidate, cut its authorized service/package tags and separately approve each production-environment run.
- The service deployment is verified separately from npm publication; neither is inferred from the other.

Dependencies and risks:
- The live `/healthz` response still does not name a commit, so production status for the latest deploy tag is not independently verifiable yet.
- The owner-created `deploy-v2026.09.12.1` tag points to `7ad0cab8`; its [run 34734644738](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34734644738) was cancelled without deployment. Superseding `deploy-v2026.09.12.2` points to PR #652 merge `082869b0`; [run 34736338191](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34736338191) is waiting for production approval. No PM-selected candidate, approved production run, package publication or deployment is evidenced.
- Docker UID isolation/token refresh and delayed-review native auto-merge remain unverified end to end after PR #493; candidate preparation must preserve these as explicit operational risks rather than claiming live proof.
- PR #496 fails closed when committed Hermes configuration cannot be loaded after an interrupted task, but Docker ownership transition remains statically reviewed and committed provenance for every executable runtime file is not established.
- Local Codex in the container is unverified: the start script's forwarding through the valve's Codex port has not yet carried one real model turn on a Docker host.
- Verified owner `yueranyuan` closed PR #594 with [comment 5648467119](https://github.com/open-autonomy-org/open-autonomy/pull/594#issuecomment-5648467119), affirming accepted ADR 0001 as the replacement for that superseded runtime proposal. This resolves the authority conflict recorded from PR #593; the remaining container turn and model-twin observations are verification risks, not scope authority gaps.
- Owner-authored PR #611 and ADR 0003 landed at approved head `fda82472`, bringing unpublished kit 2.9.0, SDK 2.5.0 and backend 0.2.0 manifests to main. The live-run pause window remains unexercised, and no package publication or deployment is implied.
- PR #624 and ADR 0005 landed at exact approved head `546af39f`; PR #628 landed the atomic update-index correction at exact approved head `fff30cc4`. The versions and effects are on main but remain unpublished and are not a release candidate until the replacement artifacts and remaining runtime observations are verified.
- Owner-authored PR #622 merged after the owner also submitted approval 5188012108; the landing workflow's bot PR identity does not make that review independent. Audit `hermes:task/t_ec574a74` prescribed a separately reviewed revert and re-land. The revert card `hermes:task/t_7e14afc2` is blocked before any edit on the required interactive approval for protected `CLAUDE.md`; release remains held.
- PRs [#629](https://github.com/open-autonomy-org/open-autonomy/pull/629), [#633](https://github.com/open-autonomy-org/open-autonomy/pull/633) and [#634](https://github.com/open-autonomy-org/open-autonomy/pull/634) merged the Storybook project, directory and account designs after exact-head App approval; owner-authored [PR #639](https://github.com/open-autonomy-org/open-autonomy/pull/639) then wired those page modules into the service at App-approved head `dd4bb90a`, and [PR #640](https://github.com/open-autonomy-org/open-autonomy/pull/640) landed the identity/owner controls at exact App-approved head `fab3f13f`. Security remains red through latest-landed PR #652 [run 34735871784](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34735871784); the unchanged lock still carries Storybook's transitive `@vitest/mocker` affected by `GHSA-82fw-gwwq-j7x9`. The supply-chain workflow marks dependency changes human-required; an eventual candidate that contains these merges needs a sourced correction and a green Security result.
- PR #631 correctly reverted PR #630's planning effect after exact-head App approval, but PR #632's exact re-land merged on owner-user review 5188429781 and PR #638 later repeated that prospective-gate failure on owner-user review 5188860405. The final correction preserved that history rather than claiming retroactive approval: [PR #642](https://github.com/open-autonomy-org/open-autonomy/pull/642) reverted the PR #638 planning effect after exact-head App approval 5188954102, and [PR #643](https://github.com/open-autonomy-org/open-autonomy/pull/643) restored the supported plan after exact-head App approval 5188970153. Both reviewed heads and merges are confirmed in main by `hermes:task/t_24d4e97a` and `hermes:task/t_86910157`.
- [PR #644](https://github.com/open-autonomy-org/open-autonomy/pull/644) landed the supported PR #640/provenance/test-audit reconciliation after owner-user approval 5189009032, before any App approval. The final correction preserves that history without claiming retroactive approval: PR #647 reverted the planning effect after exact-head App approval 5189058116, and PR #648 restored it after exact-head App approval 5189080348; `hermes:task/t_69f1f270` and `hermes:task/t_a52c5163` confirmed both merges in main.
- PR #639's reviewed implementation changed the persistent smoke-test files in both the platform and backend. Audit `hermes:task/t_9b2815cc` confirmed that the exact-head App approval assessed and accepted test-code edits contrary to the constitution's instruction to reject test code in a diff. The authorized page implementation remains landed. [PR #650](https://github.com/open-autonomy-org/open-autonomy/pull/650) is the deletion-only correction, but exact-head App reviews 5189216725 and 5189228869 requested changes because its platform edit left two references to the deleted `page` declaration; release remains held until the corrected head is manually verified, approved and merged.
- Owner-authored [PR #651](https://github.com/open-autonomy-org/open-autonomy/pull/651) restored settled Polar patrons to the wall without adding them to recurring accrual, but its sole exact-head App approval 5189264555 explicitly says it was recorded by the author rather than a fresh-context review. The landed effect is notable; independent-review compliance and any required prospective correction remain held for audit.
- The giving UI requires `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `GIVE_SESSION_HMAC_SECRET`; PR #652 put their aliases in the reviewed `sync-secrets` path, but production activation remains a separate held outcome until their approved installation and a live check are evidenced.

Sources: withdrawn candidates [`7f9ba08f`](https://github.com/open-autonomy-org/open-autonomy/commit/7f9ba08fb4b14ee50ae57195c8b0b312dbe9da4e) and [`ad41f1b5`](https://github.com/open-autonomy-org/open-autonomy/commit/ad41f1b5d97d14e1d3a620a9c8f46e159e2d4b45), [PR #449](https://github.com/open-autonomy-org/open-autonomy/pull/449), [PR #461](https://github.com/open-autonomy-org/open-autonomy/pull/461), [PR #463](https://github.com/open-autonomy-org/open-autonomy/pull/463), [PR #464](https://github.com/open-autonomy-org/open-autonomy/pull/464), [PR #465](https://github.com/open-autonomy-org/open-autonomy/pull/465), [PR #468](https://github.com/open-autonomy-org/open-autonomy/pull/468), [PRs #492–#496](https://github.com/open-autonomy-org/open-autonomy/pull/496), [PR #499](https://github.com/open-autonomy-org/open-autonomy/pull/499), [PR #500](https://github.com/open-autonomy-org/open-autonomy/pull/500), [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506), [PR #509](https://github.com/open-autonomy-org/open-autonomy/pull/509), [PRs #513–#515](https://github.com/open-autonomy-org/open-autonomy/pull/515), [PRs #518–#522](https://github.com/open-autonomy-org/open-autonomy/pull/522), [PR #652](https://github.com/open-autonomy-org/open-autonomy/pull/652), [`deploy-v2026.09.12.2`](https://github.com/open-autonomy-org/open-autonomy/tree/deploy-v2026.09.12.2), [Deploy platform run 34736338191](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34736338191), `hermes:task/t_71c39b4b`, [package release procedure](packages/kit-hermes/README.md), and [.open-autonomy/PRODUCTION.md](.open-autonomy/PRODUCTION.md).

## release-hardening: Prepare the replacement onboarding and backend artifacts

Status: independently reviewed PRs #624, #628 and #646 fix the 2.11.0/3.0.0/0.3.0 package shape, but replacement preparation is held while the Storybook advisory persists through the latest Security runs. The security workflow marks supply-chain changes human-required; no human correction commitment is recorded.
Dispatch: hold

Source: [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506), its failed [Security run](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34285712444), [PRs #518–#522](https://github.com/open-autonomy-org/open-autonomy/pull/522), the resolved `GHSA-rgj7-g3m4-5g8c` prerequisite in [PR #551](https://github.com/open-autonomy-org/open-autonomy/pull/551), the superseded artifact review `hermes:task/t_71c39b4b`, the retired stale-version task `hermes:task/t_85106ace`, merged [PR #624](https://github.com/open-autonomy-org/open-autonomy/pull/624), its atomic follow-up [PR #628](https://github.com/open-autonomy-org/open-autonomy/pull/628), and the advisory still present in PR #634 [Security run 34725807604](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34725807604).

Completion:
- Preserve PR #551's `sharp@0.35.4` remediation and confirm the selected candidate's supply-chain scan remains green without weakening or editing the protected security workflow.
- Reconcile reviewed manifests at create-open-autonomy 2.11.0, `@open-autonomy/sdk` 3.0.0 and `@open-autonomy/backend` 0.3.0, upgrade this repository and every cookbook normally, and inspect all three package tarballs.
- Exercise the promised candidate workflows manually in the World without invoking automated tests or test-running checks/hooks, hand off for independent review, and report the remaining Docker, delayed-review, live-GitHub and executable-provenance gaps. Do not publish, tag or deploy.

## review-provenance-repair: Restore independent pre-merge evidence for the PR622 policy

Status: corrective work is queued, but the first bounded revert is blocked before any edit because protected `CLAUDE.md` requires interactive owner approval. PR #622's clarification remains owner-authorized and constitution-compatible; the original development-review gate cannot be repaired retroactively.
Dispatch: fleet

Source: merged [PR #622](https://github.com/open-autonomy-org/open-autonomy/pull/622), owner self-review [5188012108](https://github.com/open-autonomy-org/open-autonomy/pull/622#pullrequestreview-5188012108), and independent post-merge audit `hermes:task/t_ec574a74`.

Completion:
- Revert only PR #622's two documentation lines on a fresh branch from current main; a fresh-context agent submits/read-backs exact-head GitHub App approval before that revert merges.
- Only after the reviewed revert lands, reapply the same owner-authorized wording on a second fresh branch; another fresh-context agent submits/read-backs exact-head GitHub App approval before the re-land merges.
- Confirm both reviewed heads in main and the final CLAUDE.md/CONTRIBUTING.md wording matches PR #622. Do not claim either later review retroactively approved the original merge; release remains held until this correction completes.

## pr639-test-policy-audit: Reconcile the served-page merge with the no-test invariant

Status: independent audit confirmed the PR #639 test-file changes violate the landing bar while the owner-authorized page implementation remains valid scope. A deletion-only correction is ready for fleet execution; it must preserve production code and use manual World observations instead of tests.
Dispatch: fleet

Source: owner-authored and signed [PR #639](https://github.com/open-autonomy-org/open-autonomy/pull/639), exact-head App [approval 5188895595](https://github.com/open-autonomy-org/open-autonomy/pull/639#pullrequestreview-5188895595), the actual changes to `apps/platform/test/smoke.test.ts` and `packages/backend/test/smoke.test.ts`, the no-automated-tests invariant in [CONSTITUTION.md](CONSTITUTION.md), and completed audit `hermes:task/t_9b2815cc`.

Completion:
- Delete only PR #639's added route/page assertions from `apps/platform/test/smoke.test.ts`; do not restore the deleted `/p/` assertions or alter production code, docs, manifests, scripts, other tests or harnesses.
- In `packages/backend/test/smoke.test.ts`, delete PR #639's added item assertion and 404 assertion plus the complete PR-added page loop whose header cannot be removed alone while leaving valid TypeScript; do not restore the deleted `/p/` assertions.
- Without running tests, checks or hooks, manually exercise the affected served-page paths in the disposable World product path and record actual responses. Require exact-head App review and merge ancestry for the deletion-only two-file diff; do not describe that review as retroactive approval of PR #639.

## pr651-review-audit: Reconcile the Polar patron-wall merge with independent review

Status: PR #651's owner-authorized patron-wall correction is on main, but its sole exact-head App approval says it was recorded by the author and was not a fresh-context review. The review gate therefore remains unresolved pending an independent audit of the actual landed diff and the smallest supported prospective correction.
Dispatch: fleet

Source: verified owner `yueranyuan` authored and signed [PR #651](https://github.com/open-autonomy-org/open-autonomy/pull/651); the PR merged as `7ad0cab8` from head `e34f5ba7` after App [approval 5189264555](https://github.com/open-autonomy-org/open-autonomy/pull/651#pullrequestreview-5189264555), whose body explicitly records that it was made by the author rather than a fresh-context reviewer.

Completion:
- Independently inspect PR #651's exact landed diff, authority, constitution fit and the original review body; determine whether the author-recorded App verdict violated the prospective gate.
- If correction is required, prescribe only the bounded revert/re-land needed to obtain fresh-context exact-head App review while preserving later main work and the supported patron-wall behavior.
- Do not submit a retroactive verdict, edit implementation, run automated tests/checks/hooks, release, tag, publish or deploy.

## local-codex-plain: The bare and containerized fleets look the same; the container forwards

Status: the verified owner publicly affirmed accepted ADR 0001 when closing the superseded PR #594, resolving the recorded authority conflict in favor of PR #597's host-service boundary. PR #624's relocated host-tool stack has now landed after review; acceptance remains held for the container turn and model-twin Responses proof.
Dispatch: hold

Source: the verified owner's [PR #593 ruling](https://github.com/open-autonomy-org/open-autonomy/pull/593#issuecomment-5628311527) was the original contrary public evidence. Accepted [ADR 0001](docs/decisions/0001-runtime-boundary.md) explicitly replaces that conflicting instruction and PR #594; verified owner `yueranyuan` then affirmed that replacement in [comment 5648467119](https://github.com/open-autonomy-org/open-autonomy/pull/594#issuecomment-5648467119). [PR #597](https://github.com/open-autonomy-org/open-autonomy/pull/597) is the merged implementation, approved at exact head `b13099c0`; merged [PR #624](https://github.com/open-autonomy-org/open-autonomy/pull/624) relocated the host tools between packages without changing the trust boundary.

Completion:
- Bare: both profiles use native Hermes `openai-codex` through the host valve and transient access from the installed Codex app-server; no login is copied into project or Hermes storage, a missing current computer login fails closed, and autonomous use has the required OS-user credential boundary.
- Container: Hermes receives only a stand-in credential and forwards through the host valve/Codex app-server boundary; the login never enters the executor. Prove one real turn in the managed container on a Docker host.
- The project-owned [World scenario](world/README.md) points the provider at its model twin through `HERMES_CODEX_BASE_URL`; a native agent turn passes through that endpoint.

## operating-state-sdk: The owner's running or paused word travels through the SDK

Status: owner-authored implementation and ADR 0003 landed in PR #611. Exact-head App review approved the source and manually exercised the ambiguous pause interruption; PR #624's reporter replacement has also landed after review. The live-run pause window remains outstanding.
Dispatch: hold

Source: verified owner `yueranyuan` authored and signed all three commits in merged [PR #611](https://github.com/open-autonomy-org/open-autonomy/pull/611); [ADR 0003](docs/decisions/0003-operating-state-through-the-sdk.md) separates the owner's desired state from the automation's observed state. The ADR's quoted private conversation is not used as authority evidence. [App review 5184632769](https://github.com/open-autonomy-org/open-autonomy/pull/611#pullrequestreview-5184632769) records the prior-head source defect; commit [`fda82472`](https://github.com/open-autonomy-org/open-autonomy/commit/fda82472abc290e8f5165082d4d44b2cf1003c0f) writes ownership ahead of the mutation. [Exact-head approval 5186028179](https://github.com/open-autonomy-org/open-autonomy/pull/611#pullrequestreview-5186028179) records the disposable World interruption, restart and owned-only resume observations; `hermes:task/t_fb86081f` confirms that head in main.

Completion:
- A `steer`-scoped owner request records `running` or `paused`; an arbitrary automation reads it through the SDK, applies it by its own method and reports the truth through the SDK, while the platform only records and displays desired versus observed state.
- The Hermes kit stops scheduled work without interrupting a live run, reports paused only when no job is enabled or running, and resumes exactly the jobs it paused; state survives reload and failures remain visible.
- Exercise the live-run pause window through the disposable World product path: while a run is active, a pause request remains visibly desired-paused/observed-running, the run finishes without interruption, then the reporter disables scheduled work and reports paused. Recheck this after the current reporter stack settles. Release, publication and deployment remain separate gates.

## give-auth-production: Activate and verify the signed-in giving page in production

Status: implementation reviewed in the twin world; production configuration and verification are not evidenced. Owner-authored PR #652 added the three sign-in secrets to the existing production `sync-secrets` operation after exact-head independent App review. No human development-review gate was required; production environment configuration and approval remain separate human actions.
Dispatch: hold

Source: `hermes:task/t_abe517c5`, approved implementation `389ce3b1`, the candidate's [`give-auth.ts`](https://github.com/open-autonomy-org/open-autonomy/blob/6e4a12ba6a0422066ef4e5ea8fb0f51763d64997/apps/platform/src/give-auth.ts), and App-reviewed [PR #652](https://github.com/open-autonomy-org/open-autonomy/pull/652) at exact head `9b56f9cc` merged as `082869b0`.

Completion:
- A maintainer provisions the GitHub OAuth app and installs `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `GIVE_SESSION_HMAC_SECRET` through a reviewed production authority path; no agent receives them.
- On the deployed service, a funder signs in, sees credits, makes one idempotent earmarked gift, and the project's public books show the matching envelope.

Risk: [PR #652](https://github.com/open-autonomy-org/open-autonomy/pull/652) merged signed owner head `9b56f9cc` as `082869b0` after App approval 5189447455, closing the workflow gap only. The production aliases still need maintainer provisioning, `sync-secrets` must run through an authorized production gate, and the live sign-in/giving check remains missing. The owner-cut `.12.2` deploy run is waiting and is not a PM-approved release candidate.

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