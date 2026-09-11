# ADR 0002: Local Worlds use actual capacity and backend limits

Status: Proposed. Acceptance requires independent review and merge. The owner subsequently
authorized implementation and a local Evidence Desk recovery pilot; that authorization does
not constitute acceptance of this ADR or a general package release. The corresponding World
architecture change and its implementation are reviewed together upstream.

## Context and authority

On September 11, 2026, the owner asked why Evidence Desk would not start, challenged the World
reservation system, and requested: “design the good solution.” This author has no public link
to that conversation. The owner's subsequent “go” authorized implementation and local recovery,
not production deployment or disruption of other runs.

The observed failure was `16384 MiB required, 4506 MiB available`. Its installed operator
runtime, `@volter/twin-world@0.1.7`, subtracts full declared storage peaks from current free
space. The current World checkout at `2a9cf124f08a2e4435193c85543e6942e553c55e` retains that
formula. At inspection, the SSD had 11,162 MiB free, other claims totaled 4,608 MiB, and the
safety deduction was 2,048 MiB. Evidence Desk's 16 GiB is a configured executor allowance,
not measured twin data. Its launcher retries unsuccessful startup every 30 seconds.

World instance directories measured about 4.2 MiB under `oa-scrum` and 820 KiB under
`volter-work/twin-world`; three OA verification World directories totaled about 80 MiB.
The shared Docker VM occupied about 31 GiB on the host. Docker was unreachable, so per-volume
usage and free capacity inside the VM were not established. These are incident measurements,
not defaults, benchmarks, or a complete host disk inventory.

The present system mixes four independent facts: a branch's stored history, an executor's
resource consumption, lifecycle ownership, and a hypothetical capacity promise. It enforces
only admission bookkeeping. It neither reserves physical bytes nor caps future writes. Files
already written reduce free space while the full peak claim is still deducted.

## Decision

A local World owns a branch and the services serving it. It does not schedule hypothetical
machine capacity. Remove local aggregate disk and memory admission claims. Preserve branch
sharing, service ownership, process cleanup, registered consumers, and parent retention.

Use three existing kinds of mechanism, with distinct responsibilities:

| Concern | Authority | World responsibility |
| --- | --- | --- |
| Stored branch history | World storage | Share immutable history; record local changes; retain parents |
| Available storage and consumption | Filesystem or service backend | Inspect actual targets; report measurements and their limits |
| Execution limits | OS/container backend | Apply and verify explicit supported limits; report unsupported limits |

The machine's service manager continues to own restart policy. No host scheduling daemon,
dynamic reservation ledger, eviction controller, or automatic worktree cleanup is introduced.
An independently selected managed host may provide enforceable capacity guarantees; local
World semantics do not pretend to provide them.

Scope follows the caller's deployment contract, not `mode: local` or network exposure: a
served/hosted World can use the same `upWorld` implementation today. The next major local
release must audit all callers (CLI, branch/checkout, foreground run, served-world and host).
Hosted consumers remain pinned until their own admission contract is reviewed; no dependency
bump silently removes an operator's configured hosting bounds. This proposal neither designs
that scheduler nor adds a second admission implementation to the local runtime.

This refines “World owns container creation, resources and shutdown” in
[ADR 0001](0001-runtime-boundary.md): resources means backend handles and explicit enforced
limits, not a cooperative peak scheduler. It preserves that record's execution, credential,
reporter and service-manager boundaries. Conflicts with World architecture's current admission
contract must be resolved upstream before implementation; this OA record cannot waive it.

## Startup and runtime behavior

1. Acquire the existing lock for this World identity and generation. Resolve whether startup
   resumes a branch or creates one. Unfinished cleanup or consumers of the same instance still
   prevent unsafe replacement. Unrelated instances' lifecycle problems do not block startup.
2. Inspect required backends and storage destinations through World-owned service operations.
   An unavailable required Docker endpoint fails as `backend-unavailable`, before trying to
   create its container. Do not bypass routing, switch contexts, or start a different daemon.
3. Validate the paths that will actually be written, including mount identity when a specific
   mounted volume is configured. A missing external mount must not silently become a directory
   on the system disk. Persist the startup intent durably before creating owned services.
   Failure to persist it stops startup. Existing state is never truncated by a probe.
4. For an operation with a known additional byte requirement, compare it with available space
   on its actual destination immediately before the operation. Include known staging and
   destination writes; check separate filesystems separately. Unknown requirements remain
   unknown. Compressed download size is not an exact installed size. A previous installation's
   size can be shown as an estimate, never converted into a mandatory reservation.
5. Start only the configured services, verify readiness and requested enforceable limits, then
   publish the live instance. No scan of other Worlds' directory trees is needed to start one.
   Dependency installation and image preparation stay explicit setup operations; startup does
   not hide them behind an invented peak claim.

There is no universal per-World disk floor or percentage multiplier. Optional host low-space
warnings are host policy, evaluated against actual free space, not promises per branch. A host
that deliberately configures a write prohibition must name that policy in a refusal. It is
not a default local World guarantee and must not prevent status, cleanup or data export.

Preflight is advisory about future capacity: other processes can write immediately afterward.
World does not promise an operation will fit because a check passed. Filesystem failures
(`ENOSPC`, quota exhaustion, read-only mount, permissions) retain their actual cause and path.
Use the existing atomic state/history protocols and checked I/O errors; never acknowledge a
stored mutation whose durable write failed. On startup failure, rollback only owned effects.
During service failure, retain the last valid branch state and report the service as failed.
Do not manufacture teardown success if a receipt or durable metadata cannot be written.
This is not a new power-loss durability guarantee: retain and report the storage backend's
existing durability mode. Partial append recovery and metadata-publication failure are explicit
acceptance cases; where the existing implementation cannot preserve its stated contract, fix
that path before claiming migration ready rather than relying on the former reservation.

## Limits and storage boundaries

An executor's CPU, memory, process and temporary-filesystem limits remain in its backend's
native configuration. Setup verifies effective values and records their enforcement scope.
Do not infer such limits from old `resources` fields. Native processes with no OS boundary
are reported as unbounded; World does not add a sampling-and-killing substitute.

For Docker, distinguish container writable layer, named volumes, shared images, and the VM's
backing filesystem. A root-layer quota does not imply that `/opt/data` or `/work/project` is
limited. An explicitly requested unsupported quota fails setup with the uncovered mount and
backend capability. Do not silently label a declaration “enforced,” invent a portable quota,
or migrate storage to a different filesystem as an incidental repair.

Where there is no supported quota, report that storage as unbounded. The operator can choose
a backend with quotas or accept ordinary host filesystem capacity. Docker's availability and
guest capacity are separate from the Mac's free space. If guest capacity is unobservable,
show it as unknown; let real backend operations establish success or failure without assuming
host free space is a measurement of guest free space.

## Inspection without fictional totals

Keep the existing `status`, `doctor`, `resources` and `prune` entrypoints. Redefine the next
major version's `resources` output as inventory, not promises. Version its JSON output; do
not repurpose `reserved` or `available` numeric fields so old consumers silently misread them.

Fast inspection reports instance identity, owner, consumers, backend readiness, explicit limits,
and filesystem capacity. A proposed `resources --usage` option requests a bounded, cancellable
scan; ordinary startup and status never recursively scan the SSD. Every measurement includes
its scope, source, timestamp, units and completeness. The detailed report distinguishes:

- Branch data, checkpoints and immutable payloads; operational logs separately from history.
- Executor checkouts and named volumes, where the backend exposes them.
- Shared images, caches and VM backing storage, once at their actual shared scope.
- Filesystem available bytes, reported once for each identifiable capacity domain.

Logical bytes, filesystem-allocated bytes and reclaimable bytes are separate quantities.
Deduplicate hard-linked inodes within a scan. Ordinary `du`/block counts cannot establish
exclusive physical ownership of APFS clones; mark it unknown. Docker guest data and its VM
disk are nested views, not additive totals. Sparse image virtual size is not host allocation.
Deleting guest files does not promise immediate host-space recovery. Shared parent data is
not reclaimable while a descendant retains it. Partial/unsupported measurements are never zero.

No attempt is made to apportion shared storage equally between Worlds or subtract measured
usage from a new synthetic allowance. That would rebuild the scheduler with less reliable
numbers. A filesystem's free-space report is the authority for currently available bytes.

## Ownership and cleanup after removing claims

Separate lifecycle state from capacity bookkeeping before deleting admission code. Keep durable
startup intents, service identities, generation checks, consumer records and teardown receipts.
Treat PIDs as observations, not durable identity or proof of ownership. Retain the existing
task cleanup process where it protects caller-loss handling. A process whose only purpose is
to keep a numeric reservation alive can disappear once no supported reader depends on it.

Failed cleanup blocks reuse and pruning of the affected World; it does not subtract hypothetical
bytes or poison every World on the machine. Inspection reports the unresolved owned resources.
Corrupt ownership metadata means that instance cannot be safely replaced or removed. Corrupt
obsolete capacity metadata is diagnostic, not a machine-wide admission failure.
Legacy claim files combine capacity with owner/holder identities and `cleanupPending`. They
are not obsolete merely because the numeric fields are obsolete. Migrate those lifecycle
facts into the authoritative instance record before retiring the claim. An unreadable combined
record stays intact for diagnosis; absent independent ownership/teardown evidence, quarantine
the identifiable affected instance from replacement or deletion. Do not infer its services
are gone, retire its holder, or erase the record to make migration pass. If identity cannot be
established, report that limitation and authorize no cleanup from that record.

`down` stops owned compute and retains state. `run` retains its existing verified teardown on
completion/caller loss. `prune` remains an explicit preview/apply operation for successfully
stopped eligible state, subject to consumers and parent references. No deletion based merely
on age, apparent inactivity, disk pressure, or an exited admitting CLI. Persistent volumes,
other actors' worktrees, caches and shared images are outside incidental World pruning.

## Failure reporting and the existing supervisor

Persist a concise condition with the World identity, failing operation, backend/path, observed
capacity if available, timestamp and retry classification. Do not store secrets or whole envs.
CLI failure stays nonzero; a blocked start is never reported as a successful World.
If saving that condition fails (including full/read-only storage), preserve the original cause
and the condition-write error on stderr with a nonzero exit. Do not claim the condition was
saved, replace the primary error with a logging error, or rely on a writable disk to report it.

Transient backend failures use the installed service manager's bounded restart policy.
Configuration/permission errors and confirmed capacity exhaustion become operator-visible
blocked conditions. No 30-second capacity retry loop. For service managers unable to classify
exit causes, setup must choose their native bounded retry behavior, or disable automatic retry
and require an explicit restart; do not add a new polling daemon or misuse exit zero as success.
This capability must be verified for the actual launchd/systemd integration before migration.
The reporter continues publishing only through the established SDK path; it is not a runtime
controller. Operator diagnostics remain available even when the product stack cannot start.

## Migration and implementation sequence

1. Land the upstream World decision and detach lifecycle identity/cleanup from numerical claims.
   Preserve current cleanup semantics in this step. Change the source architecture contract,
   CLI/config reference, and generated operator guidance together.
2. Release a new major local runtime with no aggregate admission. Accept old config `resources`
   as deprecated, non-enforced metadata with a visible warning; new configs omit it. Never
   reinterpret a former peak request as an OS limit. Remove synthetic capacity fields from
   the versioned report, preserving ownership inventory and diagnostics.
3. Pin that reviewed runtime in the OA kit. Setup checks backend capabilities and native restart
   policy. Preserve existing effective container limits and volume identities. Add detailed
   usage reporting independently; accurate recursive attribution is not a prerequisite for
   removing the broken arithmetic.
4. Migrate an installation at a controlled stop boundary: inspect consumers, quiesce its own
   launcher, finish/stop its own work, and obtain successful teardown using its old runtime.
   Pin all of that installation's lifecycle commands and launcher to the new version before
   resuming the same persistent data. Preserve raw legacy records until migration succeeds.
   Resume through the product's resumable `world up` API or an explicitly verified SDK path
   with `keepState: true`; the lower-level operator `up`/`run` starts fresh and is not a
   migration-resume primitive. Reusing Docker volumes alone does not preserve twin history.
   Verify branch identity/history and volume IDs before and after the first resumed start.
   Unresolved cleanup holds that installation's migration; it does not authorize a forced stop.
5. Other installations can continue under their pinned old runtime. New local startup neither
   reads their claims as capacity nor modifies them. No dual-version ownership of one instance
   is supported. Old executables cannot be made to honor a new marker they never implemented:
   managed entrypoint replacement and removal of stale auto-start paths are mandatory migration
   checks, not a claimed backward-compatible guarantee. Downgrade requires another clean stop.

Evidence Desk is the first migration candidate, not a reason to stop unrelated Worlds. Its
16 GiB declaration disappears from admission, but its existing container limits remain. Inspect
the unavailable Docker backend and the actual guest volumes through World operations before
declaring it ready. Reuse its home/checkout volumes and branch state. Do not recreate or purge
them. Clearing the old admission error alone does not prove a usable executor.

## Alternatives and tradeoffs

Lowering Evidence Desk's number fixes only one symptom and leaves arbitrary coupled claims.
Subtracting measured usage from each peak still requires reliable attribution of shared/cloned
storage and retains an unenforced scheduler. A global quota daemon would introduce a new host
product. Enforcing quotas or reclaim policies where a backend supports them is useful, but is
not a prerequisite for cheap local branching.

Removing admission gives up the existing cooperative peak promise; that promise was not an
allocation or enforcement boundary. Simultaneous local work may exhaust capacity. Known-size
checks reduce avoidable failures, backend limits constrain supported resources, and durable
write/cleanup semantics preserve honest failure. This design does not guarantee availability
against arbitrary host processes or unbounded native workloads.

## Manual acceptance for implementation

These are future acceptance exercises, not completed verification and not an automated suite.
Use synthetic data, owned scratch storage and real World commands; never fill the shared SSD.
Record actual observations in the implementation PR, not persistent harness files.

- Start two small Worlds without resource declarations. An unrelated large legacy claim or
  malformed legacy capacity record does not affect them. Verify real vendor SDK reads/writes.
- Fork populated local history; confirm shared parent references and successful branch-local
  writes. Repeated inspection changes neither state nor last-use timestamps.
- Inject startup failure and uncertain teardown. Confirm same-instance replacement/prune stay
  blocked, unrelated startup works, and caller-loss cleanup still retires only owned services.
- On an owned constrained filesystem/backend, exercise failed durable writes and insufficient
  known-size setup capacity. Observe truthful failure, intact prior state, and no fake success.
- Exercise read-only paths, missing mounts and unavailable Docker; verify the specific cause
  and nonzero status. Observe the installed service manager's actual bounded/no-retry behavior.
- Verify a configured executor memory limit and each writable mount's reported quota coverage.
  Unsupported explicitly required limits fail setup; unbounded storage is labeled accurately.
- Inspect shared blobs/images and a VM-backed volume. No summed nested totals or guaranteed
  reclaim estimate from ordinary file-size accounting; interrupted scans report incomplete data.
- Migrate one stopped legacy installation while another remains active. Verify unchanged volume
  identity/history, no old auto-start path, no disturbance of the other run, and retained rollback
  information. Resume Evidence Desk only after both World and executor readiness succeed.

## Sources and constitution review

Primary implementation evidence, at the World commit named above:
[admission](https://github.com/volter-ai/twin/blob/2a9cf124f08a2e4435193c85543e6942e553c55e/packages/world-runtime/src/resources.ts),
[lifecycle](https://github.com/volter-ai/twin/blob/2a9cf124f08a2e4435193c85543e6942e553c55e/packages/world-runtime/src/runtime.ts),
[branching](https://github.com/volter-ai/twin/blob/2a9cf124f08a2e4435193c85543e6942e553c55e/packages/world-core/src/fork.ts),
[blob sharing](https://github.com/volter-ai/twin/blob/2a9cf124f08a2e4435193c85543e6942e553c55e/packages/world-core/src/shared-blob-index.ts).
Docker documents its [CPU/memory controls](https://docs.docker.com/engine/containers/resource_constraints/),
[storage-driver-dependent writable-layer options](https://docs.docker.com/reference/cli/docker/container/run/),
and [shared/unique image reporting](https://docs.docker.com/reference/cli/docker/system/df/).
These capabilities do not establish quota support for Evidence Desk's current named volumes.

Against the current [constitution](../../CONSTITUTION.md):

- **Every spend is metered / settled cents are the only cost:** filesystem measurements are
  operational capacity, never billing estimates. Existing spending rails are unchanged.
- **Only the SDK is real / the platform shows; it does not steer:** no platform scheduler or
  parallel publication path; World/operator inspection and the native service manager stay local.
- **Authority comes from the repository:** committed config and reviewed installation own backend
  limits. This proposal neither widens credentials nor claims acceptance of conflicting records.
- **Nothing in an agent's reach is a secret that matters:** preserve ADR 0001's trusted host
  boundary; no Docker socket, protected credential files or host control enters the executor.
- **No automated tests / nothing develops against a real API:** acceptance is manual, in owned
  Worlds with synthetic data. Design inspection has not run test suites or vendor mutations.

Independent review is required before acceptance. Implementation evidence must separately prove
cleanup preservation, data durability, actual backend limit coverage and migration compatibility.
