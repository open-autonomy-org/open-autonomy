# 0028 — One resource manager serves the fleet

Status: Proposed by card `t_4be99b39`, 2026-10-09; revisable by later work.

## Context and evidence

The owner chose one maintainer across machines to share memory and use Supercode's remote command doors.
His line `956a9f3e` at 09:08:56Z on 2026-10-09 adds resource extremes, unnecessary hangs and outages of sessions
expected to work. Lines `7dedf21f`, `17c74abd` and `b6d1ccf2` precede that choice; their ids were supplied on
the card by the manager from account-manager message `m-69c02481` and owner-rulings commit `8bad20df`.
The owner also keeps disk clearing primary (2026-10-07), immediate and silent (`u-3210e9e0`); incidents go only
to the manager. Owner line `0d902b48`, 09:12:39Z, calls the dispatcher a “jira bot” that coordinates actions “in a dumb way”
(manager correction from `m-b78bc6f8`, owner-rulings `4bffcf8b`). The duty split below is this proposal
and the manager's interpretation, not additional quoted words from the owner.

This proposes replacing the topology of company RFC 0022 decisions 7–8. Its threshold probes remain per machine.
The existing `health_alarms` enrollment option already subscribes one host agent address across the fleet.
The dispatcher work in supercode #1378 and volter-org #77 retains mechanical reminders, run closure and continuation,
including one retained unknown-turn notice. The maintainer consults that notice instead of mailing it twice.

## Decision

The company skew declares one standing `box-maintainer` main session on the install host, with `health_alarms`
enabled and no `every_machine` launch. Its hourly job files a fleet pass to that same mailbox; it starts no model
or agent per fire. Filing requires a native message receipt, uses an hourly idempotency key, and fails within
ten seconds if the mailbox does not answer. No failed delivery is called a successful wake.

The main session holds the shared memory and reads the existing machine records. Each machine keeps its probe,
thresholds, volumes and service definitions. Its alarms target the one retained maintainer address. Fleet inspection
and actions use published Supercode machine doors and the existing delegation; there is no credential fallback.

Disk clearing comes first. Once immediate reclamation is done, the maintainer inspects resource readings and exact
stalled operations, compares board assignments with native session/child activity, and reports confirmed outages
once to the manager. Quiet transcripts and unreachable doors do not establish idle or death. The dispatcher still
owns card state and session lifecycle; the maintainer does not create another reminder/restart loop. No run waits
on a maintainer grant, and high CPU readings alone license no kill.

Live dependencies and service installs are inspected before reclamation, including lazy imports and output paths of
running builds. Recorded failures deleting sites-world's install and Twenty37's output inform this shared persona.
Unique work and credentials are preserved. Worlds retain their own lifecycle and cleanup doors.

The desktop report on card notice `m-220f41cf` records disk loss beyond pagefile reclamation, an unidentified
writer behind an admin boundary, and repeated deletion of a cache its consumer re-downloads. The persona keeps
that writer unknown, uses platform-native counters with explicit visibility limits, and stops cycling the live
cache. This evidence establishes a diagnostic gap, not a cause or authority to escalate.

## Alternatives and consequences

Separate maintainers cannot share one main's memory and allowed divergent instructions across the three machines.
A new fleet watchdog would duplicate the existing probes and dispatcher timers. Both are unnecessary.

A remote machine whose daemon is down remains unreachable until it returns; the owner explicitly chose this
tradeoff. One unavailable machine must not stop inspection or reclamation on reachable machines. The maintainer
reconciles alarm subscriptions when a new or returning machine is reached.

Removing `every_machine` prevents future duplicate launches but cannot close already running maintainers or rewrite
their health recipients. After reviewed merge and normal published adoption, the install operator retains the host
main, retires the remote role sessions through native doors, reconciles each health config/subscription without
removing unrelated readers, and reads back the sole role. Until that happens, live consolidation is unproven.

## Constitution compatibility for independent review

“The platform shows; it does not steer”: this changes the owner-run starter's profile and scheduled mailbox fire,
not the platform. “Authority comes from the repository”: machine doors keep their existing grants; no fallback or
new privilege is introduced. “Only the SDK is real”: the platform's publication path is untouched. Metering and
settled-cost invariants are unchanged; the scheduler starts no inference. “No automated tests” and “Nothing here
develops against a real API”: manual isolated product-door evidence is required, and no test harness is added.
The board's independent review judges this proposal and implementation together; this status confers no approval.
