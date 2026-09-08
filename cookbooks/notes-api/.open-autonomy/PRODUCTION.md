# Production: how a kit project ships

The agent lands code. PM proposes releases; a human reviews and authorizes publication. The platform never
holds a deploy credential, and neither does any machine an agent runs on. The service flow below uses
GitHub's own gates. Packages and local applications use the [artifact procedure](#packages-and-local-applications)
without requiring a hosted service.

## The shape

- **Landing is the agent's.** It pushes `agent/<task>` branches; the landing workflow opens the pull request and
  merges it. Nothing pushes `main` directly, maintainers included (`main-protected` ruleset: pull request required,
  no bypass).
- **The workflows are the owner's.** `.github/CODEOWNERS` names the owner for `/.github/`, and the `main` ruleset
  requires code-owner review, so a landing that touches a workflow waits for the owner while everything else lands
  with no review. The file that runs with a secret is never changed by the agent.
- **Production runs only from a human-cut tag.** A `production` environment with the owner as required reviewer,
  whose deployment branches are the tag pattern `deploy-v*` and nothing else, never `main`. Its secrets are the
  deploy credential and nothing more. A `deploy-tags-admin-only` tag ruleset lets only an org admin create such a
  tag. The deploy workflow fires on the tag (or a dispatch from it), so the workflow that holds the credential is
  always the one a human tagged.
- **The build says what it is.** The deploy stamps the commit into the artifact (Hookline: `HOOKLINE_VERSION` from
  `git rev-parse --short HEAD`, answered at `/api`), so the live service names its own commit.

## Setting it up, once per project

1. `.github/CODEOWNERS`: `/.github/ @<owner login>` (a user or a team; an org is not a code owner).
2. Ruleset `main-protected` on `refs/heads/main`: `pull_request` (0 approvals, code-owner review required),
   `non_fast_forward`, `deletion`; no bypass actors.
3. Ruleset `deploy-tags-admin-only` on `refs/tags/deploy-v*`: `creation`, `update`, `deletion`; bypass:
   OrganizationAdmin, always.
4. Environment `production`: required reviewer the owner; deployment branches "selected", one tag pattern
   `deploy-v*`; the deploy credential as an environment secret (never a repository secret); the account id as a
   repository variable.
5. `.github/workflows/deploy.yml`: `on: push: tags: ['deploy-v*']` and `workflow_dispatch`; `permissions:
   contents: read`; `environment: production`; egress allow-listed to GitHub, npm and the deploy target; actions
   pinned by SHA; no restored caches.

## PM release planning and human review

PM maintains the target release schedule in `ROADMAP.md`: scope, proposed version, target window, review
lead time, readiness criteria, dependencies and risks, with sources. It decides whether to accumulate changes,
prepare, defer or request review. Neither a merge, a version bump, main being ahead nor the target date triggers
production. Human review remains mandatory even for urgent fixes. PM follows the project's version policy;
a contributor's package version is a proposal until reconciled against the selected release.

For the kit's service review helper, use a stable `## <release-id>: <title>` section. Keep each of these
fields on one line; prose, completion criteria, dependencies, risks and citations can follow:

```text
Dispatch: hold
Release decision: accumulate | prepare | defer | request-review
Target version: <version under this project's release policy>
Target window: <target date or window, with timezone where relevant>
Review by: <review target leaving time before release>
Candidate: <full landed commit SHA once selected>
Scope: <included outcomes and any explicit exclusions>
Readiness: pending | ready-for-review
Readiness evidence: <links to scope completion, artifact/version consistency and checks>
Rationale: <why this release and timing, with sources>
Version rationale: <why this version, based on policy and published versions>
```

The alternatives above are choices, not literal field values. Early targets may be provisional; the PM must
resolve missing scope, version and review targets before requesting review. `request-review` requires
`ready-for-review` and a full candidate SHA already on main. Land the decision through the ordinary planning
PR. Keep the candidate fixed: the planning commit and later work may remain outside that release.

Then prepare `$HERMES_HOME/release-review.md` outside the checkout, with single-line fields and supporting
prose/links as needed:

```text
Release: <release-id in ROADMAP.md>
Plan: <full landed commit SHA containing that release decision>
Candidate: <same full candidate SHA as the plan>
Version: <same target version as the plan>
Verification: <candidate-specific results and source links>
Risks: <remaining risks and mitigations>
Human action: <review this proposal, then the exact authorized tag/publish/approval steps>
```

`bun .open-autonomy/maintain.ts ship` checks the pinned plan against the current release fields on main.
Accumulating, deferred, unready, missing or stale proposals cannot request review. Receipt/status notes and
unrelated later commits don't change the selected candidate or repeat an unchanged ask. Material release
field changes require a refreshed package and human review; prior approval does not extend to them. The
helper parks unleased requests superseded by the landed plan; a later PM decision starts a new review cycle
without treating a withdrawn card as completed or resetting native retry counters. Local package errors
prevent new requests but do not revoke a pending review still authorized by the plan. PM explains changes
in the original conversation and reconciles active execution. The setup agent records the owner's contact
agreement in the `project-communications` skill. PM follows that agreement using native Hermes messaging
or the existing GitHub tools, and checks the conversation before following up. Human release review
remains required; available credentials never choose the channel.

For a live service, the helper verifies that the selected candidate descends from the deployed commit. It
releases that candidate's shipping hold when live reports that exact commit, even if main is now ahead.
Unknown or divergent live history requires reconciliation. Native review still checks the task's acceptance;
PM updates changelog only with actual release evidence and preserves outstanding verification in roadmap.
For packages or other artifacts without a live service, PM uses their documented publication/review procedure
and that outreach policy; the live-service helper does not claim those artifacts have been published.

## Packages and local applications

A downloadable or local application need not have a hosted service. Do not add a live address or provision
production merely to use the service helper. `maintain.ts ship` reports that no live address is configured;
PM still owns release planning and reviewer outreach through the agreed communication skill.

1. Establish the artifact, version policy and distribution destination in the project's existing
   contributing instructions. Reuse its established policy; for a new product, PM proposes the missing
   choices and queues preparation work. The setup agent need not choose packaging before development.
2. Prepare the intended artifact from the selected landed candidate. Verify installation and the promised
   user workflow in the project's verification environment, using synthetic data. Record the exact build,
   checks and remaining risks in the release PR; inspect what the artifact contains before review.
3. Land the sourced roadmap release decision with scope, version, target window and candidate. PM contacts
   the agreed human reviewer with the exact artifact/candidate, verification, risks and publication steps.
   Keep the request and reply in that conversation; use native PM notes for pending follow-up. An absent
   service-review task does not remove the human gate or justify a second release ledger.
4. A human reviews and publishes the approved candidate through the agreed distribution channel, or
   approves its gated publication workflow. Configure any required publishing credential at that later
   step. A changed artifact, version or candidate needs renewed review; merging code does not publish it.
5. PM verifies the published version and artifact correspond to the approved candidate, citing the actual
   release record. Only then move its changelog entry out of Unreleased. Keep unresolved installation or
   adoption outcomes in the roadmap; lack of publication access leaves verification pending.

The CLI does not scaffold artifact publication workflows yet. Use this procedure with the existing
provider tools and the project's agreed policy; never substitute live-service status for release evidence.

## Shipping a service

```bash
git tag -a deploy-v<date> <sha> -m "<what ships>" && git push origin deploy-v<date>   # the owner, on a commit they read
```

The run waits for the reviewer; approving it is the second human act. Rolling back is tagging an earlier commit.
Secrets the service itself needs (webhook secrets, keys) are environment secrets the deploy workflow installs, so
they too are set by a human through the gate and never by the agent.
