# The SOC 2 checklist

This project runs on Open Autonomy's `soc2` template. It stays auditable because the checks an auditor relies on stay
true as the system changes. This checklist names them.

- **In ADRs.** Every architecture decision record in this folder answers each item for the change it decides, under a
  `## SOC 2 checklist` heading, one line per item. The answer says how the item holds after the change, or why the
  change does not touch it. `create-open-autonomy check` refuses a record that leaves an item out.
- **In the internal audit.** The scheduled audit (the `internal-audit` skill) walks the same items against the system
  as it stands.

Each item names the control it keeps and the check or record that shows it. Evidence Desk collects the checks and
records named here; its control identifiers are the `soc2` control set's.

| Item | What must stay true | Kept for | Shown by |
|---|---|---|---|
| C1 Change path | Code reaches production only through a pull request with an approving review, merged under `main-protected` with no bypass; required status checks (the tests) pass before merge; production deploys only from a `deploy-v*` tag through the `production` environment. Review is two-staged (owner decision): agents review and merge each change, and a person holding `release-review` approves each release, an approval that covers every change the release ships | CHG-01, CHG-02, CHG-03 | the daily required-review, rule-bypass and protected-history checks; the change and deployment populations; production deployments matched to approved GitHub deployments |
| C2 Credentials | Every credential the system uses is a service credential no person holds, stored as an environment secret of the environment that uses it; issuing, rotating or revoking one is recorded under `records/credentials/` | AC-05 | the non-human access listing (each secret's last-set date against the recorded rotations); pipeline deploys made with a person's credential are exceptions |
| C3 Vendors | Every service the system depends on or sends data to is in the egress allow-list and, when people administer an account there, in `vendor_accounts` | VND-01, AC-04 | the vendors named by the import; roster completeness per vendor account |
| C4 Data | The record states which customer data the change stores or moves, where, encrypted how at rest and in transit, kept how long, and deleted how | CONF-01, CONF-02, AC-09 | the TLS and HTTPS checks; the system description's data section |
| C5 Availability | Each service answers a health endpoint that names its commit; an external monitor checks it and alerts a named owner; limits and capacity are stated | OPS-06, A1.1 | the monitor's history kept as evidence; incidents recorded under `records/incidents/` |
| C6 Backup and restore | Each durable store is backed up on a schedule, and a restore is tested at least each quarter and recorded under `records/restore-tests/` | OPS-05, A1.2, A1.3 | the restore-test records |
| C7 Logging and alerting | Security-relevant events are logged and retained; each alert reaches a named owner, and acknowledging it is recorded (an escalation under `records/escalations/`) | OPS-01, MON-01 | the escalation records; failing checks with no escalation are exceptions |
| C8 Access | The change says who and what gets access (people, agents, machines), with least privilege; each appears in the next access review's listing | AC-02, AC-03, AC-04 | access reviews; the non-human access listing |
| C9 Incidents and emergency changes | The change keeps a way to respond to an incident, and any path to production outside C1 is a break-glass change recorded under `records/break-glass/` | OPS-03, CHG-04 | incident and break-glass records; unapproved changes with no break-glass record are exceptions |
| C10 Evidence | The record names the Evidence Desk check or collection that will show the change keeps each item above, or says that none can and what evidence a person will add instead | MON-04 | the internal audit's records under `records/internal-audits/` |

**Where the evidence ends.** C1, C2, C3, C7, C9 and C10 answer findings of blind CPA reviews of a quarter run on this
template (Evidence Desk's `scenarios/globex-quarter`): unapproved merges and deploys outside the declared path, a
pipeline credential held by a person, alerts no one acknowledged, change evidence an auditor could not trace. C4, C5,
C6 and C8 extrapolate from the controls those reviews found with no evidence at all (availability, backups, data
handling). The cadences (quarterly restore test, weekly audit) are this template's defaults, not measured values.
