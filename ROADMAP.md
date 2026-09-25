# open-autonomy roadmap

Sourced planning memory maintained by the Hermes PM scrum. Completed work belongs in `CHANGELOG.md` and Git history; this file keeps only outstanding outcomes and the next release decision.

## release-next: The next Release

Dispatch: hold
Release decision: defer
Scope: the standing Release pull request (`main` → `prod`) carries the books-backup removal and create-open-autonomy 3.19.0 beyond #788; the platform deployment version is recorded by the release workflow when the owner merges it.
Rationale: the last ship was #788, deploy-v2026.09.25.3 and create-open-autonomy 3.18.4, on September 25, 2026. Main now contains persistent automated-test code contrary to the constitution and a 420-commit interval with six direct pushes plus 40 merged PRs lacking exact-head independent App approval. Hold review until `main-review-provenance-2026-09` and `remove-persistent-tests` land; shipping remains the owner's approval and merge of the one Release ([ADR 0015](docs/decisions/0015-the-owner-ships-by-merging-to-prod.md)).

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

## main-review-provenance-2026-09: Prospectively repair the unreviewed main interval

Status: planned; 40 pull requests and six direct-main commits landed after the review rule was in force without exact-head independent GitHub App approval. Supported behavior stays supported, but the prospective review and architecture gates cannot be repaired retroactively.
Dispatch: fleet

Source: [full audit of `7ad0cab8..8fb0332e`](hermes:session/20260925_134916_80b19b); direct commits `18a3ded6`, `190cbf90`, `8f3b5292`, `d1607d27`, `afff30f0` and `3b9ba0e5`; no-approval PRs #650, #699, #700, #703–#706, #708, #710 and #711; owner-self-reviewed PRs #709, #713, #715, #717, #719, #722, #724, #745, #747, #749, #751–#754, #756–#764, #767–#769 and #771–#774.

Completion:
- Audit the landed changes as coherent stacks against their original authority, the constitution and current main; preserve authorship and separate supported behavior from defects.
- Prospectively revert and re-land every supported effect through fresh branches and exact-head GitHub App approval, preserving intervening main work and never describing the new evidence as retroactive approval.
- For constitution changes, obtain the verified owner's own approving GitHub review and a separate fresh-context App constitutional review. For material ADR stacks, obtain fresh-context constitution review of the record and implementation before calling the decision accepted.
- Confirm the intended final behavior and every reviewed head in main, with the main ruleset still requiring one approval and allowing no bypass.

## remove-persistent-tests: Remove automated test code from main

Status: planned; current main still carries persistent smoke suites, direct commit `d1607d27` changed one, and PR #798 added test-only Durable Object storage operations. PR #650 deleted a subset after two changes-requested verdicts, then merged from final head `ce053f3a` without approval; archived native task `hermes:task/t_bd642df6` therefore did not complete the correction.
Dispatch: fleet

Source: [CONSTITUTION.md](CONSTITUTION.md), [CONTRIBUTING.md](CONTRIBUTING.md), direct commit `d1607d27`, merged [PR #798](https://github.com/open-autonomy-org/open-autonomy/pull/798), merged [PR #650](https://github.com/open-autonomy-org/open-autonomy/pull/650), and the interval audit `hermes:session/20260925_134916_80b19b`.

Completion:
- Remove the persistent automated smoke suites and test-only helpers, scripts and dependencies without replacing them with another test harness; preserve production behavior and the books' durable data path.
- Manually exercise the affected giving, identity, ledger persistence, restart, pages and books-removal paths in the disposable World product path, recording actual observations in the handoff.
- Land only after fresh-context exact-head GitHub App approval. Do not run automated tests, test-running checks or hooks.

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

Status: planned; production is configured: the Volter identity sign-in secrets are installed and synced, and `/give/login` redirects to `id.volter.ai`. The live callback, gift and book entry are unverified, and ADR 0011 plus its implementation entered main without independent review.
Dispatch: hold

Source: [`give-auth.ts`](apps/platform/src/give-auth.ts), which takes the Volter sign-in path when its four secrets are present; [ADR 0011](docs/decisions/0011-people-sign-in-with-a-volter-identity.md); direct commits `d1607d27`, `afff30f0` and `3b9ba0e5`; owner-signed [PR #806](https://github.com/open-autonomy-org/open-autonomy/pull/806), exact-head App review 5320994313 and live HTTP 302 observation `hermes:task/t_b3c730dd`.

Completion:
- `main-review-provenance-2026-09` prospectively reviews and repairs the ADR 0011 implementation without calling that review retroactive.
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