# Contributing

- Inspect command definitions before running them. Do not run automated test suites, test-running checks
  or test hooks. Source inspection and REPL-style manual feature verification are the review evidence.
- The world is where a change is exercised with no keys: `bun world/run.ts up` brings the twins, the real platform
  and the cookbook's agent stack up; then drive it — the page, the books, the board, the twins' ledgers — one action
  at a time (`world/README.md`). No gate stands over it.
- Nothing pushes to `main`. Push a `land/<topic>` branch (or `agent/<task id>` for agent work); the landing
  workflow opens its PR and arms auto-merge. Independent agent approval of the current head is required;
  changed diffs invalidate stale approval. Human approval is reserved for release. Never bypass review.
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

## Contributing and review

A person or coding agent working outside a dispatched Hermes task contributes through an ordinary PR.
Include scope sources, the current head, manual verification evidence and known dependencies in the PR.
PM discovers the contribution and coordinates its independent review; no kanban access, shared planning
document edit or separate handoff is required from the contributor. A Hermes worker already dispatched
on a native task uses that task's review lane as described in the develop skill. Being a coding agent,
or having access to Hermes, does not itself make a contributor a fleet worker.

Use a draft while contributor work is unfinished, and state what remains. Once the change is reviewable,
mark it ready for review. A pending upstream PR, merge dependency, runtime activation or human release
approval is not by itself a reason to keep reviewable work in draft. Record the dependency and which
action it blocks; PM coordinates that action while independent review can proceed. Review readiness
does not authorize merge, activation or release. Independent approval of the current head gates automatic
merge; human approval remains release-only. Authors never approve their own PRs or bypass these gates.

Report the observed state: draft, ready with review unconfirmed, review queued or running, or approved
but not yet merged. Claim queued or running review only when its native task state has been verified;
an open PR alone is not evidence that a reviewer has started.

## Architecture decisions

Material architecture decisions require an Architecture Decision Record (ADR) in
`docs/decisions/NNNN-short-title.md`: runtime topology, trust and credential boundaries, durable data
formats, service responsibilities, or major dependency choices. Consult the existing records before
changing those decisions. Keep records concise and decision-specific; routine implementation details
belong in code and the PR.

Each ADR records its status (Proposed, Accepted, Rejected or Superseded), context and decision,
alternatives and tradeoffs, consequences, original decision/evidence sources, and a constitution review
that cites the relevant clauses and explains compatibility. Link any records it supersedes.

The author links the ADR from the architecture-changing PR; the record and implementation may share
that PR. An independent agent reviews the decision against the current constitution and authorized
scope, then checks that the implementation follows it. Record that reasoning in the PR verdict. An
ADR becomes accepted only after that review and merge; an Accepted label in an unmerged file confers
no authority. Missing records, unresolved contradictions or constitutional violations require changes.
An ADR cannot amend or waive the constitution; a needed amendment follows the constitution's owner
authority before the proposal is reviewed again. Human release approval remains separate.

Preserve accepted decisions and their rationale. A change in direction proposes a new ADR, with links
between it and the superseded record; acceptance of the replacement supersedes the earlier decision.
Chat, agent instructions and PR comments supply evidence for that proposal, not a silent replacement
for the reviewed record. PM coordinates conflicting proposals and holds dependent work while the
conflict is unresolved; independent authorized work continues. Roadmap items link decisions rather
than duplicate them, and the changelog records notable landed outcomes. Do not invent retrospective
approval for existing architecture: distinguish observed history from a newly reviewed decision.
