# ADR 0015: The owner ships by merging one pull request from main to prod

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

**One standing pull request from `main` to `prod` is what ships.** A workflow keeps it open; it grows as `main` moves,
so changes compound until the owner reads the whole diff there and merges it with a merge commit.

**The owner's approval ships it.** The `prod` ruleset allows no update to `prod` but a merged pull request approved by
the `owners` team, whose only member is the owner, with no bypass; stale approvals are dismissed when `main` moves. The
`production` environment admits `prod` alone and asks for no second approval.

**A push to `prod` ships.** The platform deploys and the commit is tagged `deploy-v<date>.<n>`; every package version
not yet on npm is published, and a new kit version is recorded as a `release-v<version>` tag and GitHub release. The
tags stay, as the record of what shipped when. `admin.yml` is dispatched from `prod`.

Extrapolation, this author's (the owner named the merge, the compounding pull request and the tags): tags as the record
rather than a second trigger; the release publishing on the same merge; the admin workflow dispatched from `prod`;
merge commits only (the repository allows no squash or rebase merge, so `prod`'s history stays `main`'s).

## Alternatives and tradeoffs

- **Keep tags and the environment's approval.** Rejected by the owner: two acts per ship, and nothing to read but a
  compare page.
- **Restrict updates to `prod` to an org admin.** Tried first and replaced: GitHub shows that merge to the owner as
  "Merge without waiting for requirements to be met (bypass rules)", a ship that reads as breaking a rule (the owner:
  "why would you send this to me like this"). A required reviewer is the ordinary approve-then-merge.
- **CODEOWNERS for `prod`.** Rejected: it is read from the base branch, and `main`'s would flow into `prod`.

## Consequences

- `.github/workflows/ship.yml` (new) keeps the pull request open, every fifteen minutes and by hand (merges to `main`
  are the landing workflow's pushes, which start no workflow); `deploy.yml` and `release.yml` run on a push to
  `prod` and record their tags; `apps/platform/DEPLOY.md`, `CLAUDE.md` and the kit's README say so.
- Repository settings, applied after this lands: a `prod` branch at the commit last deployed; a `prod-protected`
  ruleset (deletion, non-fast-forward, and a pull request approved by the `owners` team, merge commits only, no
  bypass); the `production` environment's deployment branches `prod` alone, its required reviewer removed; the
  tag ruleset keeps `update` and `deletion` for org admins and no longer restricts `creation`, so the workflows can
  record their tags (GitHub refuses its Actions app as a bypass actor on an organization's ruleset).
- Without the environment's approval, nothing but the owner's own dispatch may run `admin.yml`: its job runs only when
  `github.triggering_actor` is the owner, so the project's App (whose manifest grants `actions: write`) and a
  workflow's token, both able to dispatch it, never load the admin token or choose its inputs. A redeploy dispatched
  from `prod` ships only what the owner already merged. `land.yml` opens and arms pull requests against `main` alone.
- The record tags are records, not triggers: anyone who may push may create one, so a record can be forged, but only
  an org admin may move or delete one once made. Nothing runs on a tag; what shipped is `prod`'s history and the
  deploy runs.
- The kit's production door (`setup.ts`, `PRODUCTION.md`) keeps tags until this has shipped here; a later change
  carries it to generated projects.

## Constitution review

The constitution's owner acts are unchanged in kind: the owner still reads what ships and ships it; secrets still run
only in a workflow the owner shipped, never on `main`.

## Verification

After the settings: `ship.yml` opens the pull request on the next push to `main`; an agent's attempt to push to `prod`
is refused; the owner's merge deploys, tags `deploy-v<date>.<n>` and publishes any new version, and the platform's
`/healthz` answers from the new commit.
