# open-autonomy roadmap

Sourced planning memory maintained by the Hermes PM scrum. Completed work belongs in `CHANGELOG.md` and Git history; this file keeps only outstanding outcomes and the next release decision.

## release-next: The next Release

Dispatch: hold
Release decision: accumulate
Scope: what `main` carries beyond `prod`, which the standing Release pull request (`main` → `prod`) shows; PM names it in a user's words when it requests review.
Rationale: releases ship through the one Release pull request, the owner's approval and merge ([ADR 0015](docs/decisions/0015-the-owner-ships-by-merging-to-prod.md)); the last ship was #788, deploy-v2026.09.25.3 and create-open-autonomy 3.18.4, on September 25, 2026; `main` has accumulated since.

## review-provenance-repair: Restore independent pre-merge evidence for the PR622 policy

Status: planned; the revert and re-land are dispatchable (CODEOWNERS gates only `CONSTITUTION.md` and itself). PR #622's clarification remains owner-authorized and constitution-compatible; the original development-review gate cannot be repaired retroactively.
Dispatch: fleet

Source: merged [PR #622](https://github.com/open-autonomy-org/open-autonomy/pull/622), owner self-review [5188012108](https://github.com/open-autonomy-org/open-autonomy/pull/622#pullrequestreview-5188012108), and independent post-merge audit `hermes:task/t_ec574a74`.

Completion:
- Revert only PR #622's two documentation lines on a fresh branch from current main; a fresh-context agent submits/read-backs exact-head GitHub App approval before that revert merges.
- Only after the reviewed revert lands, reapply the same owner-authorized wording on a second fresh branch; another fresh-context agent submits/read-backs exact-head GitHub App approval before the re-land merges.
- Confirm both reviewed heads in main and the final CLAUDE.md/CONTRIBUTING.md wording matches PR #622. Do not claim either later review retroactively approved the original merge.

## pr651-review-audit: Reconcile the Polar patron-wall merge with independent review

Status: planned; PR #651's owner-authorized patron-wall correction is on main, but its sole exact-head App approval says it was recorded by the author and was not a fresh-context review. The review gate therefore remains unresolved pending an independent audit of the actual landed diff and the smallest supported prospective correction.
Dispatch: fleet

Source: verified owner `yueranyuan` authored and signed [PR #651](https://github.com/open-autonomy-org/open-autonomy/pull/651); the PR merged as `7ad0cab8` from head `e34f5ba7` after App [approval 5189264555](https://github.com/open-autonomy-org/open-autonomy/pull/651#pullrequestreview-5189264555), whose body explicitly records that it was made by the author rather than a fresh-context reviewer.

Completion:
- Independently inspect PR #651's exact landed diff, authority, constitution fit and the original review body; determine whether the author-recorded App verdict violated the prospective gate.
- If correction is required, prescribe only the bounded revert/re-land needed to obtain fresh-context exact-head App review while preserving later main work and the supported patron-wall behavior.
- Do not submit a retroactive verdict, edit implementation, run automated tests/checks/hooks, release, tag, publish or deploy.

## local-codex-plain: The bare and containerized fleets look the same; the container forwards

Status: planned; accepted ADR 0001 and its host-service boundary are on main; acceptance is held for one real container turn and the model-twin Responses proof.
Dispatch: hold

Source: accepted [ADR 0001](docs/decisions/0001-runtime-boundary.md); its implementation is [PR #597](https://github.com/open-autonomy-org/open-autonomy/pull/597), with the host tools relocated by [PR #624](https://github.com/open-autonomy-org/open-autonomy/pull/624).

Completion:
- Bare: both profiles use native Hermes `openai-codex` through the host valve and transient access from the installed Codex app-server; no login is copied into project or Hermes storage, a missing current computer login fails closed, and autonomous use has the required OS-user credential boundary.
- Container: Hermes receives only a stand-in credential and forwards through the host valve/Codex app-server boundary; the login never enters the executor. Prove one real turn in the managed container on a Docker host.
- The project-owned [World scenario](world/README.md) points the provider at its model twin through `HERMES_CODEX_BASE_URL`; a native agent turn passes through that endpoint.

## operating-state-sdk: The owner's running or paused word travels through the SDK

Status: planned; the mechanism is implemented (ADR 0003; the pause covers the board since kit 2.11.16, and every request of the word is kept and served since SDK 3.5.0); the live-run pause window is unexercised.
Dispatch: hold

Completion:
- Exercise the live-run pause window through the disposable World product path: while a run is active, a pause request remains visibly desired-paused/observed-running, the run finishes without interruption, then the reporter disables scheduled work and reports paused.

## give-auth-production: A funder gives through the signed-in page in production

Status: planned; production is configured: the Volter identity sign-in secrets are installed and synced, and `/give/login` redirects to `id.volter.ai`
Dispatch: hold

Source: [`give-auth.ts`](apps/platform/src/give-auth.ts), which takes the Volter sign-in path when its four secrets are present ([ADR 0011](docs/decisions/0011-people-sign-in-with-a-volter-identity.md)).

Completion:
- On the deployed service, a funder signs in, sees credits, makes one idempotent earmarked gift, and the project's public books show the matching envelope.

## seven-day-autonomy: Run seven days with no human act but release review and shipping

Status: planned; owner-gated observation; its prerequisite implementations are reviewed, but current production and the start of the clock are not evidenced.
Dispatch: hold

Source: `hermes:task/t_f934d2a1`; prerequisite reviews `hermes:task/t_9427f376`, `hermes:task/t_8d0834f4` and `hermes:task/t_42194efa`.

Completion:
- After live-versus-landed status, owner outreach and self-upgrade are live for this project and Hookline, the owner starts the clock.
- Both projects then run for seven consecutive days in which the only human act is approving and merging the Release; everything a human must do reaches the owner in it, every kit release is adopted by PM, and every landed change is requested rather than merely noticed.
- A kit defect filed during the observation ends it and starts a new seven-day window after correction. Evidence is the published sessions, board history and release/deploy runs.

Dependency: `release-next` must ship and be verified before the owner starts the observation.

## real-money-live: Real money flows on open-autonomy.org

Status: planned; current owner-gated outcome; code paths are proven against twins, but no real transaction is evidenced.
Dispatch: hold

Source: `hermes:task/t_33aac5e5`; the deferral from grant-credit v2 is recorded in commits [`8ad2a7fa`](https://github.com/open-autonomy-org/open-autonomy/commit/8ad2a7fa7c31782f16c57b445e168d29b33d70cd) and [`3075a32b`](https://github.com/open-autonomy-org/open-autonomy/commit/3075a32b952d4da0651dadb04c87089b9ca00c35).

Completion:
- The owner establishes a Polar organization and the org's live Stripe account with Issuing, installs the tokens and webhook secrets through the reviewed admin workflow, and enrolls the webhook endpoints.
- One real patronage lands on this project's books through Polar, its payout reaches the org, the Issuing balance is funded from it, and this install's agent makes one real bounded purchase recorded on the public audit trail.

The owner has not committed to a date. Preserve this hold until the identity, bank and production evidence exist.