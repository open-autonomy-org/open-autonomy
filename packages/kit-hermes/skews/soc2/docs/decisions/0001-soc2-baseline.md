# 0001: The SOC 2 baseline this system grows into

Status: Accepted (shipped with the `soc2` template)

## Context

This project is built by agents from the `soc2` template, and it has to be auditable for SOC 2 from its first
production deploy. The template does not build the application. Instead it sets the architecture every change must
keep, so that the checks an auditor relies on hold as the system grows. [SOC2-CHECKLIST.md](SOC2-CHECKLIST.md) lists
those checks.

## Decision

The system reaches each item of the checklist no later than the change that first needs it:

- **Before the first production deploy:**
  - a test suite that runs as a required status check on `main` (C1);
  - a health endpoint that names the deployed commit, and an external monitor on it that alerts the owner (C5);
  - the deploy credential as a `production` environment secret held by a service account, not a person (C2).
- **Before the system first stores customer data:**
  - the data record of C4;
  - a backup schedule for each store;
  - a first restore test recorded under `records/restore-tests/` (C6).
- **With each new vendor, store, credential or access path:** the matching item, answered in that change's ADR.
- **Continuously:** the internal audit re-checks every item weekly and records what it finds.

## Alternatives

- **Building a reference application into the template.** Rejected: most of it would not fit the project it is laid
  over.
- **Checking only at audit time.** Rejected: the blind reviews show that gaps found then cannot be repaired for the
  period already observed.

## Consequences

- Early changes carry more records.
- An ADR that leaves an item unanswered does not pass `create-open-autonomy check`.
- A gap found by the internal audit becomes an issue the PM queues, before an auditor finds it.

## SOC 2 checklist

- C1 Change path: established here; required checks and the `deploy-v*` path before the first deploy.
- C2 Credentials: the deploy credential is a service account's environment secret from the start.
- C3 Vendors: the template's egress allow-list and `vendor_accounts` are the starting list.
- C4 Data: answered by the first change that stores customer data.
- C5 Availability: health endpoint and monitor before the first deploy.
- C6 Backup and restore: backups and a recorded restore test before customer data is stored.
- C7 Logging and alerting: alerts reach the owner; acknowledgements are escalation records.
- C8 Access: roster, agents and machines, reviewed each quarter.
- C9 Incidents and emergency changes: the `records/` seams of ADR 0008.
- C10 Evidence: the internal audit and Evidence Desk's collectors named in the checklist.

## Sources

- [SOC2-CHECKLIST.md](SOC2-CHECKLIST.md)
- Open Autonomy ADR 0008, human seams
- Evidence Desk `scenarios/globex-quarter` and its blind reviews
