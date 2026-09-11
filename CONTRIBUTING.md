# Contributing

- Inspect command definitions before running them. Do not run automated test suites, test-running checks
  or test hooks. Source inspection and REPL-style manual feature verification are the review evidence.
- The world is where a change is exercised with no keys: `bun world/run.ts up` brings the twins, the real platform
  and the cookbook's agent stack up; then drive it — the page, the books, the board, the twins' ledgers — one action
  at a time (`world/README.md`). No gate stands over it.
- Nothing pushes to `main`. Push a `land/<topic>` branch; the landing workflow opens the pull request and merges
  it. No check stands between a branch and main. The agent's own work lands from `agent/<task id>` the same way.
- Deploys and admin operations go through GitHub workflows gated on the `production` environment's reviewer
  (`apps/platform/DEPLOY.md`). No machine holds a deploy or admin token.
- `hermes/`, `container/` and `.open-autonomy/` in this repository come from the Hermes kit
  (`create-open-autonomy upgrade .`); a kit change is made in `packages/kit-hermes/template` and applied.

## How code is written

The bar every diff is reviewed against, beside the constitution's invariants. Short on purpose; the reviewer reads it whole.

- **Language and tooling.** TypeScript on Bun everywhere; the worker on Cloudflare.
- **Shape.** Small modules with one job each, named for what they hold; a file's header says what it is for. No layer that only forwards.
- **Manual feature verification belongs to each develop agent.** Follow the no-automated-tests invariant
  in `CONSTITUTION.md`. Exercise the feature being added or changed through REPL-style manual usage,
  inspect the actual results and relevant failure cases, and report what happened in the handoff or PR.
  Do not write permanent test code, add test suites or commit tests to main. Reviewers verify this evidence
  and reject test code in the diff. Never invoke automated tests indirectly through checks or hooks.
- **Errors.** Fail loudly with the cause in the message, and say what was needed against what was available. No silent fallbacks.
- **Money.** The ledger's settled cents are the only cost; never a client-side estimate. Security-critical paths get the higher bar.
- **Docs.** Keep only durable project documentation, maintained in place; no rehearsal journals, session reports
  or temporary planning documents. Put change-specific verification evidence in the PR. Nothing documented twice;
  `bun scripts/check-docs.ts` holds every doc to paths and routes that exist.
- **Dependencies.** Add one only when writing it would be more code than reading it. Pin what you add.
- **History.** One change per commit, the task id first in the subject, signed as the agent.
