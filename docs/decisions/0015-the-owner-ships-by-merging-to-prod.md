# ADR 0015: The owner ships by merging one pull request from main to publish

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its
implementation; proposed until both occur.

## Context and sources

**Authorization.** The owner's coding conversation of September 25, 2026, on the approval page of a waiting deploy:
"actually instead of approve for deployment - perhaps what we should do instead is do merge to prod to deploy - tag
also required. That way we can actually review and the PR can be added to so that multiple releases can compound -
that would make it easier in general for everyone I think".

**What exists** (this repository at `origin/main`, September 25, 2026): the platform deploys on a `deploy-v*` tag and
the packages publish on a `release-v*` tag; an agent cuts the tag, the `production` environment (the owner as
required reviewer, admitting those tag patterns and no branch) holds the run until the owner approves it on its page.
The owner reads the change on a compare page no one keeps, and each tag ships one fixed commit.

## Decision

**One standing pull request from `main` to `publish` is what ships.** A workflow keeps it open; it grows as `main`
moves, so changes compound until the owner reads the whole diff there and merges it with a merge commit. The workflow
never merges it and never pushes to `publish`.

**The owner's approval ships it.** `publish` is the dedicated publication branch. The `publish-protected` ruleset
allows no creation of or update to `publish` but a merged pull request approved by the `owners` team, whose only member
is the owner, and only that team bypasses it; stale approvals are dismissed when `main` moves. The owner's merge is the
explicit publication authorization. The `production` environment admits `publish` alone and asks for no second
approval.

(Amended by [ADR 0033](0033-npm-releases-apart-from-the-site.md): npm packages are released from reviewed `main` at
the commit the manager permitted, never through `publish`; the site and docs still ship only from `publish`.)

**Publication runs only from `publish`.** Only a push to `publish` deploys the platform (tagging the commit
`deploy-v<date>.<n>`) and publishes the docs, and every package version not yet on npm is published only from a
checkout of `publish` (`scripts/npm-publish-missing.sh`, recording a new kit version as a `release-v<version>` tag and
GitHub release). `main` is never published: a merge to `main`
never advances `publish` and never triggers publication. The tags stay, as the record of what shipped when.
`admin.yml` is dispatched from `publish`.

Extrapolation, this author's (the owner named the merge, the compounding pull request and the tags): tags as the record
rather than a second trigger; the release publishing on the same merge; the admin workflow dispatched from `publish`;
merge commits only (the repository allows no squash or rebase merge, so `publish`'s history stays `main`'s).

## Alternatives and tradeoffs

- **Keep tags and the environment's approval.** Rejected by the owner: two acts per ship, and nothing to read but a
  compare page.
- **Restrict updates to `publish` to an org admin.** Tried first and replaced: GitHub shows that merge to the owner as
  "Merge without waiting for requirements to be met (bypass rules)", a ship that reads as breaking a rule (the owner:
  "why would you send this to me like this"). A required reviewer is the ordinary approve-then-merge.
- **CODEOWNERS for `publish`.** Rejected: it is read from the base branch, and `main`'s would flow into `publish`.

## Consequences

- `maintain.ts ship`, which PM runs every pass through the project's App, keeps the pull request open. A scheduled
  workflow did at first, and was removed: merges to `main` start no workflow, and GitHub ran its fifteen-minute schedule
  not once in the two hours after the first ship. `deploy.yml` and `pages.yml` run only on a push to `publish`,
  and `deploy.yml` records its tag; `scripts/npm-publish-missing.sh` publishes only from a checkout of `publish` and
  records the kit's; `apps/platform/DEPLOY.md` and `CLAUDE.md` say so.
- Repository settings: a `publish-protected` ruleset (creation, deletion, non-fast-forward, and a pull request
  approved by the `owners` team, merge commits only; the `owners` team alone bypasses, so only the owner creates
  `publish`); the `production` and `github-pages` environments' deployment branches `publish` alone, the
  `production` environment's required reviewer removed; the
  tag ruleset keeps `update` and `deletion` for org admins and no longer restricts `creation`, so the workflows can
  record their tags (GitHub refuses its Actions app as a bypass actor on an organization's ruleset).
- Without the environment's approval, nothing but the owner's own dispatch may run `admin.yml`: its job runs only when
  `github.triggering_actor` is the owner, so the project's App (whose manifest grants `actions: write`) and a
  workflow's token, both able to dispatch it, never load the admin token or choose its inputs. A run dispatched
  from `publish` runs only what the owner already merged. `land.yml` opens and arms pull requests against `main` alone.
- The record tags are records, not triggers: anyone who may push may create one, so a record can be forged, but only
  an org admin may move or delete one once made. Nothing runs on a tag; what shipped is `publish`'s history and the
  deploy runs.
- The kit's production door (`setup.ts`, `PRODUCTION.md`, `maintain.ts ship`) kept tags until this had
  shipped here; kit 3.19.0 carries it to generated projects.

## Constitution review

The constitution's owner acts are unchanged in kind: the owner still reads what ships and ships it; secrets still run
only in a workflow the owner shipped, never on `main`.

## Verification

After the settings: `maintain.ts ship` opens the pull request while `main` is ahead of `publish`; an agent's attempt to
create or push to `publish` is refused; a merge to `main` starts no publication; the owner's merge deploys, tags
`deploy-v<date>.<n>` and publishes any new version, and the platform's
`/healthz` answers from the new commit.
