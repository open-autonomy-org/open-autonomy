# open-autonomy roadmap

Sourced planning memory maintained by the Hermes PM scrum. Completed work belongs in `CHANGELOG.md` and Git history; this file keeps only outstanding outcomes and the next release decision.

## release-next: Publish the onboarding-ready autonomy operating model

Status: the 2.8.2 proposal is withdrawn. The operating-state work and SDK-interface replacement are now on main after independent review, including PR #628's atomic update-index follow-up. PR #639 has also wired the GitHub-addressed page design into the service. Candidate preparation remains held on artifact/runtime verification, the separately reviewed PR #622 provenance repair, prospective review repair for PR #644's planning reconciliation, a further correction after PR #638 repeated PR #632's owner-review merge, independent audit of PR #639's test-file changes against the no-automated-tests invariant, and the Storybook dependency advisory still reported by Security.
Dispatch: hold
Release decision: prepare
Target version: deploy-v2026.09.15.1; create-open-autonomy 2.10.0; @open-autonomy/sdk 3.0.0; @open-autonomy/backend 0.3.0
Target window: 2026-09-15 18:00–22:00 EDT
Review by: 2026-09-14 12:00 EDT
Candidate: pending
Scope: GitHub-authenticated giving, live-versus-landed status and the unified past/present/future timeline in the service; the GitHub-addressed core pages, platform patronage slots and owner-configured dashboard visibility now served by PR #639; the reusable backend split and its first self-hosted Cloudflare deployment package, without a storage migration; the Hermes kit changes for owner outreach, idle upgrades, sourced scrum, release review and owner-requested running/paused state; the repository-owned team roster and Team editor, shared integration branding and installed project GitHub App; reproducible fresh-project bootstrap, protected browser-to-storage credential capture, container-compatible runtime slugs, explicit model/funding choice and protected-branch-safe owner-policy/key setup; ADR 0001's host valve/reporter and transient installed-Codex app-server boundary for bare and containerized Hermes; and the SDK 3.0 interface-only surface, single automation-events reporting door and removal of platform knowledge of Hermes board/task structure. Giving-secret activation, real-money activation, deployment of a self-hosted instance, PR #640's still-unlanded identity/owner controls and the seven-day observation are excluded.
Readiness: pending
Readiness evidence: the previously reviewed feature handoffs and onboarding evidence remain applicable, and `hermes:task/t_71c39b4b` established the superseded 2.8.2/2.4.1 artifact baseline. [PR #551](https://github.com/open-autonomy-org/open-autonomy/pull/551) resolved the `sharp` advisory prerequisite. [PR #597](https://github.com/open-autonomy-org/open-autonomy/pull/597) landed ADR 0001's reviewed host valve/reporter and installed-Codex boundary, publicly affirmed by the verified owner's [PR #594 closure](https://github.com/open-autonomy-org/open-autonomy/pull/594#issuecomment-5648467119). [PR #611](https://github.com/open-autonomy-org/open-autonomy/pull/611), [PR #618](https://github.com/open-autonomy-org/open-autonomy/pull/618) and [PR #624](https://github.com/open-autonomy-org/open-autonomy/pull/624) landed the operating-state terminology and ADR 0005 SDK-interface stack; PR #624's exact head `546af39f` received App [approval 5188123139](https://github.com/open-autonomy-org/open-autonomy/pull/624#pullrequestreview-5188123139). [PR #628](https://github.com/open-autonomy-org/open-autonomy/pull/628) then atomically joined each update record to its identity index at approved head `fff30cc4`, closing the remaining crash-consistency follow-up. No replacement tarballs, fixed candidate, maintainer approval, publication or deployment exist yet.
Rationale: do not ask a maintainer to approve 2.8.2 after its setup behavior and package boundaries were materially replaced. The September 15 window preserves review lead time for the now-landed stack, artifact preparation and governance correction; it remains a forecast, not a shipping trigger, and slips if those gates remain open.
Version rationale: service tags use dated `deploy-v*` identifiers, so the forecast remains the first September 15 sequence. Main now contains kit 2.10.0, SDK 3.0.0 and backend 0.3.0; the SDK major records removal of host-tool binaries/package surface, while the kit/backend minor increments carry their relocated responsibilities. Registry publication, tags and manifest bumps remain evidence inputs, not authority to ship.

Readiness criteria and release gates:
- GitHub Land and Security succeed for the selected candidate, its promised workflows are manually exercised in the World without running test suites or test-running hooks, and the inspected package tarballs contain the intended 2.10.0, 3.0.0 and backend 0.3.0 artifacts.
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
- PR #624 and ADR 0005 landed at exact approved head `546af39f`; PR #628 landed the atomic update-index correction at exact approved head `fff30cc4`. The versions and effects are on main but remain unpublished and are not a release candidate until the replacement artifacts and remaining runtime observations are verified.
- Owner-authored PR #622 merged after the owner also submitted approval 5188012108; the landing workflow's bot PR identity does not make that review independent. Audit `hermes:task/t_ec574a74` prescribed a separately reviewed revert and re-land. The revert card `hermes:task/t_7e14afc2` is blocked before any edit on the required interactive approval for protected `CLAUDE.md`; release remains held.
- PRs [#629](https://github.com/open-autonomy-org/open-autonomy/pull/629), [#633](https://github.com/open-autonomy-org/open-autonomy/pull/633) and [#634](https://github.com/open-autonomy-org/open-autonomy/pull/634) merged the Storybook project, directory and account designs after exact-head App approval; owner-authored [PR #639](https://github.com/open-autonomy-org/open-autonomy/pull/639) then wired those page modules into the service at App-approved head `dd4bb90a`. Security remains red through PR #639 [run 34730089702](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34730089702); the unchanged lock still carries Storybook's transitive `@vitest/mocker` affected by `GHSA-82fw-gwwq-j7x9`. The supply-chain workflow marks dependency changes human-required; a candidate that contains these merges needs a sourced correction and a green Security result.
- PR #631 correctly reverted PR #630's planning effect after exact-head App approval, but PR #632's exact re-land merged as `577eb2be` on owner-user review [5188429781](https://github.com/open-autonomy-org/open-autonomy/pull/632#pullrequestreview-5188429781) with no pre-merge App approval. The first new corrective revert, [PR #637](https://github.com/open-autonomy-org/open-autonomy/pull/637), received exact-head App approval 5188803803 before merge. Its re-land [PR #638](https://github.com/open-autonomy-org/open-autonomy/pull/638) then repeated the defect: head `2c6dd33d` merged as `05c1042b` after only owner-user approval 5188860405. Native task `hermes:task/t_92658377` refused to claim the prospective gate. Release remains held for another separately App-reviewed bounded revert and re-land that preserve PR #639 and later work.
- [PR #644](https://github.com/open-autonomy-org/open-autonomy/pull/644) then landed the supported PR #640/provenance/test-audit reconciliation after owner-user approval 5189009032, before any App approval. Native reviewer `hermes:task/t_e00c99e3` refused to claim the prospective gate. Its content remains supported, but release and test-cleanup dispatch are held for a separately App-reviewed bounded revert and re-land.
- PR #639's reviewed implementation changed the persistent smoke-test files in both the platform and backend. The exact-head App review states that no tests ran but approved those test-code edits, contrary to the constitution's instruction to reject test code in a diff. The page implementation remains landed historical fact; independent audit and a sourced bounded correction are required before it can enter a release candidate.
- The giving UI requires `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `GIVE_SESSION_HMAC_SECRET`; production activation remains a separate held outcome until their approved installation and a live check are evidenced.

Sources: withdrawn candidates [`7f9ba08f`](https://github.com/open-autonomy-org/open-autonomy/commit/7f9ba08fb4b14ee50ae57195c8b0b312dbe9da4e) and [`ad41f1b5`](https://github.com/open-autonomy-org/open-autonomy/commit/ad41f1b5d97d14e1d3a620a9c8f46e159e2d4b45), [PR #449](https://github.com/open-autonomy-org/open-autonomy/pull/449), [PR #461](https://github.com/open-autonomy-org/open-autonomy/pull/461), [PR #463](https://github.com/open-autonomy-org/open-autonomy/pull/463), [PR #464](https://github.com/open-autonomy-org/open-autonomy/pull/464), [PR #465](https://github.com/open-autonomy-org/open-autonomy/pull/465), [PR #468](https://github.com/open-autonomy-org/open-autonomy/pull/468), [PRs #492–#496](https://github.com/open-autonomy-org/open-autonomy/pull/496), [PR #499](https://github.com/open-autonomy-org/open-autonomy/pull/499), [PR #500](https://github.com/open-autonomy-org/open-autonomy/pull/500), [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506), [PR #509](https://github.com/open-autonomy-org/open-autonomy/pull/509), [PRs #513–#515](https://github.com/open-autonomy-org/open-autonomy/pull/515), [PRs #518–#522](https://github.com/open-autonomy-org/open-autonomy/pull/522), `hermes:task/t_71c39b4b`, [package release procedure](packages/kit-hermes/README.md), and [.open-autonomy/PRODUCTION.md](.open-autonomy/PRODUCTION.md).

## release-hardening: Prepare the replacement onboarding and backend artifacts

Status: the independently reviewed PR #624/PR #628 stack fixes the 2.10.0/3.0.0/0.3.0 package shape, but replacement preparation is held while the Storybook advisory persists through PR #634's Security run. The security workflow marks supply-chain changes human-required; no human correction commitment is recorded.
Dispatch: hold

Source: [PR #506](https://github.com/open-autonomy-org/open-autonomy/pull/506), its failed [Security run](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34285712444), [PRs #518–#522](https://github.com/open-autonomy-org/open-autonomy/pull/522), the resolved `GHSA-rgj7-g3m4-5g8c` prerequisite in [PR #551](https://github.com/open-autonomy-org/open-autonomy/pull/551), the superseded artifact review `hermes:task/t_71c39b4b`, the retired stale-version task `hermes:task/t_85106ace`, merged [PR #624](https://github.com/open-autonomy-org/open-autonomy/pull/624), its atomic follow-up [PR #628](https://github.com/open-autonomy-org/open-autonomy/pull/628), and the advisory still present in PR #634 [Security run 34725807604](https://github.com/open-autonomy-org/open-autonomy/actions/runs/34725807604).

Completion:
- Preserve PR #551's `sharp@0.35.4` remediation and confirm the selected candidate's supply-chain scan remains green without weakening or editing the protected security workflow.
- Reconcile reviewed manifests at create-open-autonomy 2.10.0, `@open-autonomy/sdk` 3.0.0 and `@open-autonomy/backend` 0.3.0, upgrade this repository and every cookbook normally, and inspect all three package tarballs.
- Exercise the promised candidate workflows manually in the World without invoking automated tests or test-running checks/hooks, hand off for independent review, and report the remaining Docker, delayed-review, live-GitHub and executable-provenance gaps. Do not publish, tag or deploy.

## review-provenance-repair: Restore independent pre-merge evidence for the PR622 policy

Status: corrective work is queued, but the first bounded revert is blocked before any edit because protected `CLAUDE.md` requires interactive owner approval. PR #622's clarification remains owner-authorized and constitution-compatible; the original development-review gate cannot be repaired retroactively.
Dispatch: fleet

Source: merged [PR #622](https://github.com/open-autonomy-org/open-autonomy/pull/622), owner self-review [5188012108](https://github.com/open-autonomy-org/open-autonomy/pull/622#pullrequestreview-5188012108), and independent post-merge audit `hermes:task/t_ec574a74`.

Completion:
- Revert only PR #622's two documentation lines on a fresh branch from current main; a fresh-context agent submits/read-backs exact-head GitHub App approval before that revert merges.
- Only after the reviewed revert lands, reapply the same owner-authorized wording on a second fresh branch; another fresh-context agent submits/read-backs exact-head GitHub App approval before the re-land merges.
- Confirm both reviewed heads in main and the final CLAUDE.md/CONTRIBUTING.md wording matches PR #622. Do not claim either later review retroactively approved the original merge; release remains held until this correction completes.

## review-provenance-repair-pr632: Restore independent pre-merge evidence for the PR632 planning re-land

Status: the first new corrective revert landed through PR #637 after exact-head App approval, but PR #638's re-land merged after only owner-user approval 5188860405. The content is restored, but the prospective gate failed again; another bounded, separately App-reviewed revert and re-land are ready for fleet execution. The owner-user reviews remain historical evidence, not agent approval.
Dispatch: fleet

Source: merged [PR #632](https://github.com/open-autonomy-org/open-autonomy/pull/632), owner-user review [5188429781](https://github.com/open-autonomy-org/open-autonomy/pull/632#pullrequestreview-5188429781), independent post-merge audit `hermes:task/t_4a892dbb`, exact-head App-approved corrective [PR #637](https://github.com/open-autonomy-org/open-autonomy/pull/637), owner-user review [5188860405](https://github.com/open-autonomy-org/open-autonomy/pull/638#pullrequestreview-5188860405) on merged [PR #638](https://github.com/open-autonomy-org/open-autonomy/pull/638), and the refusal to claim that gate in `hermes:task/t_92658377`.

Completion:
- Preserve PR #637's valid exact-head App review and PR #638's owner-user review with their actual scopes; neither repairs PR #632 retroactively, and PR #638 does not satisfy its own prospective gate.
- From fresh current main, reverse only PR #638's re-land effect while preserving PR #639 and every later change; a fresh-context agent submits and reads back exact-head GitHub App approval before the revert merges.
- Only after that reviewed revert lands, reverse the new corrective commit on a second fresh branch, restoring the supported current planning state without dropping intervening work; another fresh-context agent submits and reads back exact-head GitHub App approval before the re-land merges.
- Confirm both new reviewed heads in main. Do not describe either review as retroactive approval of PR #632 or PR #638; release remains held until both corrections land.

## pr639-test-policy-audit: Reconcile the served-page merge with the no-test invariant

Status: PR #639 is owner-authorized and landed after exact-head App approval, but its diff changes persistent automated smoke-test code. The reviewer explicitly did not run tests yet approved the test-file changes. A bounded independent audit must determine the supported correction before release; this is review of landed work, not new page scope.
Dispatch: fleet

Source: owner-authored and signed [PR #639](https://github.com/open-autonomy-org/open-autonomy/pull/639), exact-head App [approval 5188895595](https://github.com/open-autonomy-org/open-autonomy/pull/639#pullrequestreview-5188895595), the actual changes to `apps/platform/test/smoke.test.ts` and `packages/backend/test/smoke.test.ts`, and the no-automated-tests invariant in [CONSTITUTION.md](CONSTITUTION.md).

Completion:
- Independently inspect PR #639's complete diff, exact-head review and current main against the constitution and contribution rules; do not run any automated test, check or hook.
- State whether the modified persistent test code violates the landing bar and identify only the smallest sourced correction that preserves the authorized page behavior and later work without inventing broader cleanup scope.
- If correction is required, return exact bounded steps for PM dispatch. Do not edit code, submit a retroactive review, release, tag, publish or deploy in the audit task.

## review-provenance-repair-pr644: Restore independent pre-merge evidence for the PR644 reconciliation

Status: PR #644's planning content is supported, but it merged after owner-user approval 5189009032 and before the required GitHub App review. A separately App-reviewed bounded revert and re-land are ready for fleet execution; the original owner-user review remains historical evidence, not agent approval.
Dispatch: fleet

Source: merged [PR #644](https://github.com/open-autonomy-org/open-autonomy/pull/644), owner-user [review 5189009032](https://github.com/open-autonomy-org/open-autonomy/pull/644#pullrequestreview-5189009032), and native refusal `hermes:task/t_e00c99e3`.

Completion:
- From fresh current main, reverse only PR #644's ROADMAP.md/CHANGELOG.md effect while preserving every later change; a fresh-context agent must use the configured GitHub App API door—not `gh` or any owner credential—and read back `open-autonomy-bot[bot]` approval on the exact head before merge.
- Only after that reviewed revert lands, reverse the new corrective commit on a second fresh branch, restoring the supported current planning state without dropping intervening work; another fresh-context agent must use the App door and read back exact-head App approval before merge.
- Confirm both reviewed heads and merges in main. Do not describe either review as retroactive approval of PR #644; release and the PR #639 test-code implementation remain held until this correction completes.

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