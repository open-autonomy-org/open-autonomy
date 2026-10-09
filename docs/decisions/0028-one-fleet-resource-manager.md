# 0028 — One resource manager serves the fleet

Status: Proposed, 2026-10-09; revisable by later work.

## Context

The company starter needs one maintainer conversation to share resource-management observations across enrolled
machines. Per-machine threshold probes remain useful, while separate maintainer sessions can drift in their
instructions and repeat each other's incident reports. The existing `health_alarms` enrollment option already
subscribes one host agent address across the fleet.

The proposed division of responsibility keeps the dispatcher on mechanical reminders, run closure and
continuation. The maintainer interprets resource and session evidence, consults retained incidents, and reports
confirmed outages without creating a second reminder timer.

## Decision

The company skew declares one standing `box-maintainer` main session on the install host, with `health_alarms`
enabled and no `every_machine` launch. Its hourly job files a fleet pass to that same mailbox; it starts no model
or agent per fire. Filing requires a native message receipt and uses an hourly idempotency key. The caller has an
eight-second budget to stay below the script limit; this is not a delivery deadline. The existing machine daemon
owns the request and its native wait, so caller timeout cannot kill a stopped session's delivery. An unconfirmed
fire exits nonzero, and a retry uses the same hourly key. No failed or pending delivery is called a successful wake.

The main session holds the shared memory and reads the existing machine records. Each machine keeps its probe,
thresholds, volumes and service definitions. Its alarms target the one retained maintainer address. The existing
maintenance pass retries health subscriptions at an unchanged revision, reading native main-session addresses
without opening another session. Fleet inspection and actions use published Supercode machine doors and the existing delegation; there is no credential fallback.

Disk clearing comes first. Once immediate reclamation is done, the maintainer inspects resource readings and exact
stalled operations, compares board assignments with native session/child activity, and reports confirmed outages
once to the manager. Quiet transcripts and unreachable doors do not establish idle or death. The dispatcher still
owns card state and session lifecycle; the maintainer does not create another reminder/restart loop. No run waits
on a maintainer grant, and high CPU readings alone license no kill.

Live dependencies and service installs are inspected before reclamation, including lazy imports and output paths of
running builds.
Unique work and credentials are preserved. Worlds retain their own lifecycle and cleanup doors.

Disk loss that exceeds observed writes or pagefile reclamation remains unexplained when the available door
cannot see the writer. Native counters retain their visibility limits; a large-file scan is incomplete evidence.
A cache that its consumer re-downloads is active and must not be repeatedly reclaimed. Host capacity readings
must use native host counters without starting a guest. Virtual-disk allocation and guest restart loops are
traced to their owning VM and session start commands before a repeated stop. These observations do not
authorize a credential or privilege fallback.

## Alternatives and consequences

Separate maintainers cannot share one main's memory and allowed divergent instructions across machines.
A new fleet watchdog would duplicate the existing probes and dispatcher timers. Both are unnecessary.

A remote machine whose daemon is down remains unreachable until it returns. One unavailable machine must not stop inspection or reclamation on reachable machines. The maintainer
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
