# SOC 2 readiness

This project runs on Open Autonomy's `soc2` template: the self-build agent does the work, and people act only at the
seams declared in `.open-autonomy/config.yaml`, each recorded where the declaration says. That makes most of what an
auditor asks about readable from the repository instead of asked in surveys.

The compliance program itself lives in an [Evidence Desk](https://github.com/open-autonomy-org/evidence-desk)
workspace that the owner keeps in a private place of their choosing, never in this public repository: evidence such
as user listings and signed attestations is confidential.

From an Evidence Desk checkout (`bun install` once):

1. Once the owner is on the roster in `.open-autonomy/config.yaml`, create the workspace and read this project into
   it; the import takes the roster, seams, agents, schedules and production rules from `.open-autonomy/`:
   ```bash
   bun src/cli.ts init ~/__PROJECT__-soc2 --org "<organization>"
   bun src/cli.ts open-autonomy ~/__PROJECT__-soc2 import --repo <this checkout> --by <your roster id>
   ```
2. Answer the remaining scoping questions and adopt the control set (`bun src/cli.ts serve ~/__PROJECT__-soc2`), then
   import the project again: its declarations are recorded as evidence once controls are adopted.
3. Keep the workspace in a private GitHub repository the roster members can open pull requests to. Each person records
   the acts the workspace names them in (their onboarding, an access review's sign-off, a policy approval, an
   incident's closing) in a pull request they open, which is the seam's door for them: `bun src/cli.ts collect
   ~/__PROJECT__-soc2 attribution --repo <owner/workspace-repository> --by <your roster id>` checks each act was merged
   from a pull request its person opened, and `ci-template` runs that check daily with reminders of what each person
   owes, as issues assigned to them. Compare each declared vendor account's administrators with the roster:
   `bun src/cli.ts open-autonomy ~/__PROJECT__-soc2 completeness --account github --by <your roster id>` (it reads
   GitHub organization members; for an account owned by a person, pass its exported administrators with `--file` and `--generated-by`).
4. Enable the GitHub collector for this repository (`bun src/cli.ts collectors ~/__PROJECT__-soc2 github --enable --set
   org=__OWNER__ repos=__ACCOUNT__`) and run it on a schedule from the workspace's own private repository
   (`bun src/cli.ts ci-template ~/__PROJECT__-soc2`).
5. For each observation period, collect the acts recorded under `records/` and the roster's history:
   `bun src/cli.ts collect ~/__PROJECT__-soc2 seam-records --repo <this checkout> --period <start>..<end> --by <your roster id>`
   and the same with `roster-history`.
6. `bun src/cli.ts gaps ~/__PROJECT__-soc2` lists what is left; what remains after the steps above is what no
   repository can hold.

## Keeping the checks true as the system grows

The agents build the system, so SOC 2 readiness is kept by what they must do on every change, not by a one-off
setup:

- **The checklist.** [`docs/decisions/SOC2-CHECKLIST.md`](docs/decisions/SOC2-CHECKLIST.md) names the ten things an
  auditor relies on (change path, credentials, vendors, data, availability, backup and restore, logging and
  alerting, access, incidents and emergency changes, evidence). Each item says which control it keeps and what
  shows it.
- **The ADRs.** Every architecture decision record answers the checklist for its change, and
  `create-open-autonomy check` refuses one that leaves an item out.
  [ADR 0001](docs/decisions/0001-soc2-baseline.md) is the baseline the system grows into: a required test check,
  a health endpoint and monitor, and a service-held deploy credential before the first deploy; backups and a
  recorded restore test before the first customer data.
- **The internal audit.** The `internal-audit` job walks every item weekly against the system as it stands. It
  records each run under `records/internal-audits/` and opens an issue for each finding, which the PM queues.
- **The evidence.** Evidence Desk collects the audits and the restore tests as populations for the observation
  period: `collect seam-records` reads `records/restore-tests/` with the other seams, and `records/internal-audits/`
  with them.

Keep `.open-autonomy/config.yaml`'s `vendor_accounts` complete: every account whose administrators could act outside
the declared seams is a place an auditor will look. Recurring reviews that are a person's decision (access, risk,
incidents) are scheduled in the workspace's obligations. The CPA firm, a penetration test, an independent second
person for the reviews the owner cannot perform on themselves, and the observation period remain outside any template.
