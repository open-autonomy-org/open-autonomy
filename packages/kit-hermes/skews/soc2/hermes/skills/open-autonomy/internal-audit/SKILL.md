---
name: internal-audit
description: The project's internal audit. On its schedule, check the system as it stands against every item of the SOC 2 checklist and the accepted ADRs, record the result under records/internal-audits/, and open an issue for each finding.
version: 1.0.0
metadata:
  hermes:
    tags: [open-autonomy, soc2, audit]
    category: assurance
    requires_toolsets: [terminal]
---

# Internal audit

The agents build this system, and the SOC 2 checklist (`docs/decisions/SOC2-CHECKLIST.md`) is what they must keep
true while they do. This audit is how the project knows they did. It catches a gap weeks before a CPA would find
it, while it can still be fixed. You audit the system; you do not fix it. A finding becomes an issue, and the PM
queues the fix as ordinary fleet work.

Read the current main's `CONSTITUTION.md`, `docs/decisions/` (the checklist and every accepted ADR),
`.open-autonomy/config.yaml` (the roster, `seams`, `vendor_accounts`), `.github/workflows/`, `records/` and the
previous audit under `records/internal-audits/` before acting.

## What to check

For each item C1 to C10, judge the system at the current `main` commit, not the plans:

- **C1 Change path.** Deploy workflows run only on `deploy-v*` tags or a dispatch from one, through `production`.
  CI runs the tests on pull requests. No workflow pushes to `main`. Where you can read the repository's rulesets
  through the tools you have, confirm `main-protected` has no bypass actors and requires the test check. Where you
  cannot, say so.
- **C2 Credentials.** Every secret a workflow reads is an environment secret of the environment that uses it. No
  workflow or code reads a personal token. Each credential issued since the last audit has a record under
  `records/credentials/`.
- **C3 Vendors.** Every host in each workflow's egress allow-list, and every external service the code calls,
  belongs to a vendor in the vendor list. Every account people administer is in `vendor_accounts`.
- **C4 Data.** Every store of customer data in the code has an ADR answering C4.
- **C5 Availability.** Each deployed service has a health endpoint that names its commit. An ADR names its monitor
  and who it alerts.
- **C6 Backup and restore.** Each durable store has a backup named in an ADR. The newest record under
  `records/restore-tests/` is no older than a quarter.
- **C7 Logging and alerting.** An ADR names where security-relevant events are logged and who alerts reach.
- **C8 Access.** Access granted since the last audit to people, agents or machines is named in an ADR or on the
  roster.
- **C9 Incidents and emergency changes.** Every change that reached `main` outside a reviewed pull request has a
  record under `records/break-glass/`. Every open incident has a status update within the last week.
- **C10 Evidence.** Every ADR has its `## SOC 2 checklist` answered (`create-open-autonomy check` reports those that
  do not).

## What to record

Add `records/internal-audits/<date>-internal-audit.json` in a pull request through the ordinary landing flow:

```json
{"kind": "internal-audit", "id": "<date>-internal-audit", "at": "<ISO time>", "commit": "<main's full SHA>",
 "items": [{"item": "C1", "status": "pass | finding | not applicable", "detail": "<what you read, with paths>"}],
 "findings": ["<one line per finding, with the issue number>"]}
```

Every item appears, including those that pass: an auditor tests that each one was looked at. Open one issue per
finding, titled `Internal audit <date>: C<n> <short finding>`, naming the files that show it. If an issue from an
earlier audit is still open, reference it rather than opening a new one. A finding the owner decides to accept is
the owner's to record, as a comment by their verified account on that issue; you do not close it yourself.

Never put secrets, customer data or personal information in the record or the issues: the repository is public.
