# 0033. npm releases apart from the site

Status: proposed by VO-3760 on the account manager's ruling (m-95dae376), revisable by later cards.

## Context

Every open-autonomy package release needed a push to `publish` (ADR 0015). That push fires `deploy.yml`, which deploys
open-autonomy.org, and `publish-protected` asks the owners team to approve it. An npm release therefore forced a public
site deploy, so the owner's npm carve-out could not be used. The owner: "for the npms, we can carve out an exception to
allow public release IF we have the keys sweep" (owner-rulings), and "we don't publish things that aren't finished
unless I ask for it ... (publishing npm is different since there is a reason)". supercode's packages already ship apart
from any site.

## Decision

1. **npm publication never touches `publish`.** `scripts/npm-publish-missing.sh` publishes from a clean checkout of
   one commit, named in full (`VOLTER_NPM_RELEASE_COMMIT`), which `origin/main` contains: reviewed main only, at the
   head the manager permitted.
2. **Its safeguards are unchanged**: the release scan of the shipped lockfiles, one pack per version from git's files,
   every tarball installed fresh, the keys sweep over every file of every tarball, npm's integrity read back, and a
   `release-v<version>` tag and GitHub release for a new kit version. Any failure publishes nothing.
3. **The site and the docs still ship only from `publish`** (ADR 0015): `deploy.yml` and `pages.yml` are unchanged.

## Consequences

An npm release is the manager's permission plus the keys sweep, with no site deploy and no owners-team approval. A
release that also needs the site still goes through the owner's Release pull request.
