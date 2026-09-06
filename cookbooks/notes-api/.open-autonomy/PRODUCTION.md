# Production: how a kit project ships

The agent lands code. A human decides what goes live. The platform never holds a deploy credential, and neither
does any machine an agent runs on. This is how that is arranged on GitHub, with nothing but GitHub's own features;
the reference project (`open-autonomy-org/hookline`) runs exactly this.

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

## Shipping

```bash
git tag -a deploy-v<date> <sha> -m "<what ships>" && git push origin deploy-v<date>   # the owner, on a commit they read
```

The run waits for the reviewer; approving it is the second human act. Rolling back is tagging an earlier commit.
Secrets the service itself needs (webhook secrets, keys) are environment secrets the deploy workflow installs, so
they too are set by a human through the gate and never by the agent.
