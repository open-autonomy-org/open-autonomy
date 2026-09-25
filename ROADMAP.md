# open-autonomy roadmap

Sourced planning memory maintained by the Hermes PM scrum. Completed work belongs in `CHANGELOG.md` and Git history; this file keeps only outstanding outcomes and the next release decision.

## release-next: The next Release

Dispatch: hold
Release decision: accumulate
Scope: what `main` carries beyond `prod`, which the open Release pull request (`main` → `prod`) shows; PM names it
in a user's words when it requests review.
Rationale: releases ship through the one Release pull request, the owner's approval and merge
([ADR 0015](docs/decisions/0015-the-owner-ships-by-merging-to-prod.md)). The last ship was the platform's
deploy-v2026.09.25.2 and create-open-autonomy 3.18.0 with SDK 4.0.0, on September 25, 2026; `main` has accumulated
since.

## release-hardening: Prepare the replacement onboarding and backend artifacts

Status: independently reviewed PRs #624, #628 and #646 fix the 2.11.0/3.0.0/0.3.0 package shape, but replacement preparation is held while the Storybook advisory persists through the latest Security runs. The security workflow marks supply-chain changes human-required; no human correction commitment is recorded.
Dispatch: hold

Source: [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506), its failed [Security run](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34285712444), [PRs #518–#522](https://github.com/open-autonomy-org/open-autonomy/pull/522), the resolved `GHSA-rgj7-g3m4-5g8c` prerequisite in [PR #551](https://github.com/open-autonomy-org/open-autonomy/pull/551), the superseded artifact review `hermes:task/t_71c39b4b`, the retired stale-version task `hermes:task/t_85106ace`, merged [PR #624](https://github.com/open-autonomy-org/open-autonomy/pull/624), its atomic follow-up [PR #628](https://github.com/open-autonomy-org/open-autonomy/pull/628), and the advisory still present in PR #634 [Security run 34725807604](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34725807604).

Completion:
- Preserve PR #551's `sharp@0.35.4` remediation and confirm the Release's supply-chain scan remains green without weakening or editing the protected security workflow.
- Reconcile reviewed manifests at create-open-autonomy 2.11.0, `@open-autonomy/sdk` 3.0.0 and `@open-autonomy/backend` 0.3.0, upgrade this repository and every cookbook normally, and inspect all three package tarballs.
- Exercise the promised workflows manually in the World without invoking automated tests or test-running checks/hooks, hand off for independent review, and report the remaining Docker, delayed-review, live-GitHub and executable-provenance gaps. Do not publish, tag or deploy.

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

Status: implementation reviewed in the twin world; production configuration and verification are not evidenced. Owner-authored PR #652 added the three sign-in secrets to the existing production `sync-secrets` operation after exact-head independent App review. No human development-review gate was required; installing the production secrets is the owner's, gathered into a Release package's `Owner does`.
Dispatch: hold

Source: `hermes:task/t_abe517c5`, approved implementation `389ce3b1`, the candidate's [`give-auth.ts`](https://github.com/open-autonomy-org/open-autonomy/blob/6e4a12ba6a0422066ef4e5ea8fb0f51763d64997/apps/platform/src/give-auth.ts), and App-reviewed [PR #652](https://github.com/open-autonomy-org/open-autonomy/pull/652) at exact head `9b56f9cc` merged as `082869b0`.

Completion:
- The owner provisions the GitHub OAuth app and installs `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `GIVE_SESSION_HMAC_SECRET` as production secrets, asked once in a Release package's `Owner does`; no agent receives them.
- On the deployed service, a funder signs in, sees credits, makes one idempotent earmarked gift, and the project's public books show the matching envelope.

Risk: [PR #652](https://github.com/open-autonomy-org/open-autonomy/pull/652) merged signed owner head `9b56f9cc` as `082869b0` after App approval 5189447455, closing the workflow gap only. The production aliases still need maintainer provisioning, `sync-secrets` must run through an authorized production gate, and the live sign-in/giving check remains missing. The owner-cut `.12.2` deploy run is waiting and is not a PM-approved release candidate.

## seven-day-autonomy: Run seven days with no human act but release review and shipping

Status: owner-gated observation; its prerequisite implementations are reviewed, but current production and the start of the clock are not evidenced.
Dispatch: hold

Source: `hermes:task/t_f934d2a1`; prerequisite reviews `hermes:task/t_9427f376`, `hermes:task/t_8d0834f4` and `hermes:task/t_42194efa`.

Completion:
- After live-versus-landed status, owner outreach and self-upgrade are live for this project and Hookline, the owner starts the clock.
- Both projects then run for seven consecutive days in which the only human act is approving and merging the Release; everything a human must do reaches the owner in it, every kit release is adopted by PM, and every landed change is requested rather than merely noticed.
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