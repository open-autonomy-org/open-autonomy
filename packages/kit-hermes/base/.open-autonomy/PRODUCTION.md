# Production: how a kit project ships

The agent lands code. PM proposes releases; a human reviews and authorizes publication. The platform never
holds a deploy credential, and neither does any machine an agent runs on. The service flow below uses
GitHub's own gates. Packages and local applications ship through the same Release without requiring a hosted
service.

## The shape

- **Landing follows independent agent review.** The developer pushes `agent/<task>`; the landing workflow
  opens a PR and arms auto-merge. A separate reviewer approves the current PR head after constitution,
  scope and manual feature verification review. Changed diffs invalidate stale approvals. All code,
  including workflows, follows this process; there is no CODEOWNERS or human development-review gate.
  Nothing pushes `main` directly, maintainers included (`main-protected`: PR required, no bypass).
- **Credentials stay outside development.** Agents and development code do not receive production keys;
  the host valve supplies scoped development access. The owner's approval of the Release gates when
  production credentials may be used, rather than each merge to main.
- **Production runs only from `prod`, which the owner merges.** One standing pull request from `main` to `prod` gathers
  what ships; it merges only once the owner approves it, and nothing else moves `prod`. A `production` environment
  admits `prod` alone, never `main`; its secrets are the deploy credential and nothing more. The deploy workflow fires
  on a push to `prod` and records each deploy as a `deploy-v<date>.<n>` tag, so the workflow that holds the credential
  is always one the owner shipped
  ([ADR 0015](https://github.com/open-autonomy-org/open-autonomy/blob/main/docs/decisions/0015-the-owner-ships-by-merging-to-prod.md)).
- **The build says what it is.** The deploy stamps the commit into the artifact (Hookline: `HOOKLINE_VERSION` from
  `git rev-parse --short HEAD`, answered at `/api`), so the live service names its own commit.

## Setting it up, once per project

1. No CODEOWNERS files (including root, `.github/` and `docs/` locations).
2. Ruleset `main-protected` on `refs/heads/main`: `pull_request` (1 approving agent review, stale approvals
   dismissed on push, code-owner review disabled), `non_fast_forward`, `deletion`; no bypass actors.
   Enable repository auto-merge and allow the landing workflow to open PRs.
3. Ruleset `prod-protected` on `refs/heads/prod`: `pull_request` (one approval, required from an `owners` team whose
   only member is the owner; stale approvals dismissed; merge commits only), `non_fast_forward`, `deletion`; no bypass.
   `.github/workflows/ship.yml` keeps the `main` → `prod` pull request open.
4. Environment `production`: deployment branches "selected", `prod` alone; the deploy credential as an environment
   secret (never a repository secret); the account id as a repository variable. A workflow that moves money runs
   only on the owner's own dispatch (`if: github.triggering_actor == '<owner>'`).
5. `.github/workflows/deploy.yml`: `on: push: branches: [prod]` and `workflow_dispatch`; `permissions:
   contents: read`; `environment: production`; egress allow-listed to GitHub, npm and the deploy target; actions
   pinned by SHA; no restored caches; a separate job with `contents: write` records the `deploy-v*` tag.

## Releasing

Two kinds of pull request, never confused. Pull requests into `main` are the agents' own: written, independently
reviewed and merged by agents, and never routed to a person. The Release is the one standing pull request titled
Release, from `main` to `prod`: whatever has landed on `main` compounds onto it, and it is the owner's. There is no
other release pull request and no candidate to pin: the owner's approval covers the diff the Release shows, and a
later push to `main` dismisses it.

PM keeps `main` releasable and decides when the Release is ready. The roadmap carries one release section, a stable
`## <release-id>: <title>` whose single-line `Release decision:` is `accumulate` while changes compound, `defer` when
PM holds them back, and `request-review` when the Release is ready, with its scope and rationale, sourced. Neither a
merge, a version bump nor a date ships anything.

When PM requests review, it writes `$HERMES_HOME/release-review.md`, outside the checkout:

```text
Release: <the release section's id>
Scope: <what this Release ships, in a user's words>
Verification: <results on main's head, with source links>
Risks: <what remains, and how it is contained>
Owner reads: <each money or auth diff in the Release, by file, or none>
Owner does: <what only the owner may do, such as a repository setting, with its exact values, or none>
```

and runs `bun .open-autonomy/maintain.ts ship`. It writes that package as the Release's description and mentions the
owner on it, once per Release pull request (a package written before the last Release merged is refused as stale):
the only time the owner is contacted, so everything on the Release is finished, verified and reviewed before it. The
owner reads the Release and merges it; the merge runs the production workflows (`deploy.yml` for a service, and
any publish workflow the project keeps for its packages, on the same push to `prod`). PM never deploys, tags or
publishes. After the merge, PM verifies what shipped (the live service reports the shipped commit; the new versions
are published) and only then moves changelog entries out of Unreleased. A project without a live service ships its
packages the same way.

## Shipping a service

The owner reads the standing `main` → `prod` pull request and merges it with a merge commit; that is the one human
act, and the deploy follows. Rolling back is a reviewed revert on `main`, shipped the same way.
Secrets the service itself needs (webhook secrets, keys) are environment secrets the deploy workflow installs, so
they too are set by a human through the gate and never by the agent.
