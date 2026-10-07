# Source enrollment and publication recovery

The reporter publishes through OA's SDK; native execution remains native. Missing enrollment or uncertain
association leaves publication pending with its cause. It does not pause native work or silently select another
runtime. [ADR 0027](https://github.com/open-autonomy-org/open-autonomy/blob/main/docs/decisions/0027-oa-source-associations-and-publication-recovery.md)
owns the association/recovery contract. The organization publisher stays running for owner SDK controls even
without enrollment or when narrative initialization/delivery is refused. Missing enrollment selects control-only
operation; a declared malformed or conflicting enrollment remains an explicit narrative failure. Source reads,
notes, transcripts, setup and document publication require valid enrollment. Controls use their own queue;
a pending narrative request cannot delay supported native job pause/resume.
On orchestrator installs, keeper launches publishers only after its own selected daemon reports structured
readiness. A standalone publisher requires the selected runtime's owning public door to be available already.
This orders startup; it does not prove due-job or dispatcher quiescence, fence accepted native effects, or settle
a previously refused or unknown call. Retained effect phases remain pending under the ownership rules below.
Narrative initialization retries failed stages in place; completed enrollment and discovery stages are retained.
HTTP requests have a bounded deadline and stop aborts in-flight narrative reads and delivery before draining the
publication queue. A lost response retains the exact pending publication request for receipt reconciliation.
Hermes pause does not defer queued paid board work: its public doors cannot safely pause and resume that work.
Retained `paused_tasks` from older 3.24 installs therefore remain pending; this adapter does not promote them.
The owner must resolve board dispatch through its owning runtime; OA reports that missing capability explicitly.

Use `publication-operator.ts` in this rendered host. It is separate from `enroll.ts`, which enrolls mail agents.
Run the door inside the owning World/executor, with the publisher stopped before enrollment, adoption or custody
changes. In an operator World the command prefix is `volter-world attach <world> --root <twins-checkout> --`.
Enrollment/adoption reads only its named configuration/publication files and calls no native or OA service.
The control recovery commands additionally read the selected native runtime through its public SDK; they never
mutate native jobs or call OA services. No command can prove native continuity or prior-domain retirement for
the operator.

## Fresh enrollment

Read the selected native runtime's public workflow stream first. Its `data.board` selectors name owning backing
stores; newly created saved tag views are emitted through their shared backing store. Approve the actual backing
selectors, not the names of views. Explicitly name the selected runtime kind/root and its custody evidence:

```sh
bun .open-autonomy/publication-operator.ts enroll \
  --config .open-autonomy/config.yaml --kind orchestrator --root /actual/native/home \
  --backing-board default --operator owner \
  --statement 'This is the selected owned source; no retained publication state exists.' \
  --evidence '<reviewed custody reference>'
```

Repeat `--backing-board` for every approved independent backing store. The door allocates random OA contexts,
writes private `publication-private/<config-name>.custody.json`, and adds the `publication` declaration without replacing existing
configuration data. A block mapping retains its comments; a flow mapping is serialized from its parsed data and may
lose comments. Original bytes are retained privately as `<config-name>.before-enrollment.yaml` before either
enrollment write. The resulting YAML is validated before configuration/custody writes. Review/commit that declaration.
The root is an adapter location, not authenticated native
identity. Fresh enrollment refuses existing state/custody/ownership instead of overwriting it. If a stopped
operation wrote custody but not configuration, preserve it and reconcile that exact declaration explicitly;
do not delete it and allocate replacement contexts.

Each tenant needs its own configuration, account/API-bound custody and state. To observe the same owned source,
explicitly pass its declared `--source-context UUID` and matching repeated `--store-context UUID` values in the
same order as backing selectors. This shares association context only; an organization's custody declaration
cannot enroll a tenant account. Different account timelines have separate writer ownership.

## Retained legacy state

`status --config FILE` prints state versions/digests and local lock ownership, without transcript or note content.
Use `--state-file FILE`/`--cache-file FILE` when the reporter uses overrides; the defaults are its configured
`state_file` and that path plus `.board.json`.

For original version-2 reporter state and version-1 cache, use `prepare-adoption` with the same explicit runtime,
backing and operator arguments as fresh enrollment. It prepares configuration/custody and reports the exact input
digests. It leaves the old state intact and generates no item, note or session aliases. Supply a reviewed JSON
manifest with `version:1`, `account`, `apiBase`, `sourceContext`, `stores`, `operator`, `statement`, `evidence`,
`reporterDigest`, `cacheDigest`, and these explicit arrays:

- `items`: `{storeContext,nativeCardId,itemId}` for every retained cached association. The legacy adapter used
  raw card IDs; keep them. Duplicate/conflicting destinations refuse rather than merge history.
- `notes`: `{associationKey,kind,nativeEffectId,noteId,legacyKey,acknowledgement}`. The association key is SHA-256
  of UTF-8 `JSON.stringify(['oa.native-item',1,sourceContext,storeContext,nativeCardId])`. The effect ID must exist
  in retained native evidence: a safe-integer review ID encoded as its decimal string, or an opaque attempt ID.
  Preserve the old note ID and exact `noted` marker. Acknowledgement is a retained/positively observed full OA
  update receipt, or `{kind:'legacy-noted',key:legacyKey}` preserving suppression without claiming verified content.
- `sessions`: `{platformKey,nativeSessionId,associationKey?,itemId?,evidence}` for every retained checkpoint,
  retaining existing continuation keys and positively observed item bindings. Unknown attribution remains unknown.

Bounded `item()` reads can establish a positive receipt match, but cannot prove an older note absent. Replaying
an unknown note ID as a lookup could create it and is forbidden. Titles, current uniqueness, paths, view names
and opaque cursors are not alias evidence. Missing native review identity or ambiguous provenance stays pending.

```sh
bun .open-autonomy/publication-operator.ts adopt --config .open-autonomy/config.yaml \
  --kind orchestrator --root /actual/native/home --manifest publication-private/reviewed-adoption.json
```

Keep adoption/custody evidence in the ignored `publication-private/` directory. The template also ignores default
reporter/cache/lock/temp files and legacy/custody backups. Custom state locations must be outside the checkout or
have explicit private ignore rules; never commit source observations, transcripts or owner records. The association
configuration itself is committed owner authority.

This validates the exact inputs, preserves byte-identical `.legacy.json` backups and saves the adopted format.
The publisher then obtains a genuine full native snapshot. It retains old IDs, acknowledged notes, transcript
sequence/digest/end receipts, continuation counters and paused native IDs. Changed adoption inputs refuse.

## Ownership, moves and retries

One publisher owns a state directory and account timeline. Its owner controller holds the same private
`<reporter-state>.lock` in both control-only and narrative modes. The narrative store reuses an explicit verified
lease and cannot release it. Shutdown drains both queues and the native source before releasing ownership;
uncertain source retirement retains ownership and diagnostic evidence. The writer recovery below proves only that
the prior writer is dead; it does not prove an orphaned source reader retired. Reconcile retained source evidence
through the owning lifecycle. Local ownership does not fence another host;
never run a copied active state as another publisher. Stop the owner through its ordinary lifecycle door.
New local leases record the host, boot, process namespace and process start identity. A successor on the same
boot and process namespace can recover a positively dead recorded owner under the kernel guard, with the required
identity-basis comparison; a recycled PID cannot supply the prior identity. Linux machine-id is optional: a valid
read preserves machine-basis identity, otherwise a deterministic boot-basis diagnostic hash is used. Both
machine-basis records must match host hashes; boot-basis recovery uses exact kernel boot/namespace identity
within the exclusively owned local home. Neither basis establishes physical-host uniqueness. A different boot remains unknown and requires the explicit attested handoff
below. Machine IDs alone cannot distinguish a physical host from a clone.
Running, foreign, legacy or malformed ownership remains a refusal requiring explicit operator reconciliation.
`release-lock --config FILE --nonce NONCE --same-executor-stopped` uses the same recorded-identity proof;
the flag alone cannot establish an unknown executor or release a live owner. Age is not ownership evidence.
Keep the private guard, staged lock and retired lock evidence ignored alongside the canonical control sidecar.
Local leases require one executor's exclusively owned local home, Bun FFI, mandatory public boot/process identity
and successful kernel locking/file durability interfaces. Darwin arm64 and x86_64 use their documented public
symbol/ABI pairs and require a local mount; APFS is exercised, not required by name. Linux supports trusted public
glibc or musl providers, including conventional fixed providers for statically linked Bun; unreadable symbols or
unsafe library/parent ownership refuses. Machine-id is optional, kernel boot/PID-namespace/start metadata is not.
Recognized Linux local types are ext, XFS, Btrfs, tmpfs, ramfs, ZFS, OverlayFS, F2FS, NILFS2, JFFS2, ReiserFS
and bcachefs. OverlayFS read/write copy-up is included before guard inode comparison; real EXDEV or durability
failure refuses without a fallback copy. Filesystem type is not physical-local or exclusive-home proof.
Network/distributed/clustered filesystems, unknown FUSE types, shared homes and VM clones sharing one home remain
unsupported. Darwin arm64/APFS runtime evidence is distinguished from public x86_64/Linux source proofs and
labelled components; actual OS execution is recorded separately, never inferred from source compatibility.
Signal-permission failure alone supplies no dead-writer proof.

Owner pause ownership lives in the private `<reporter-state>.control.json`, scoped to the account, logical API
and selected native runtime. On first creation, validated version-2 or version-3 reporter pause arrays may seed it;
version 3 must match retained enrollment. The exact reporter digest and the available custody basis are recorded.
Legacy version 2 has no historical account/runtime provenance, so its seed records that limitation. Once present,
the control file is authoritative even when its ownership arrays are empty; old reporter arrays never re-seed it.
Malformed control ownership or contradictory scope refuses native effects. Control-only operation preserves
reporter state and source-cache bytes, without enrollment or adoption. Narrative saves retain historical pause
fields without turning them into another live ownership store. Keep this sidecar private when configuring a
state path outside the generated `.open-autonomy` directory.

Control state version 3 records `pending_effects` as prepared, invoked or acknowledged, retaining historical
uncertainty. Preparation is saved before invocation; a prepared phase can be cancelled after restart because no
call could have started. The current call's exact positive SDK completion is saved before readback. An acknowledged
phase retries fresh matching observation without reissuing the mutation, so a temporary read failure does not lose
completion. Exact correlated pre-execution InvalidParams may retract a refused call; error sentences and generic
unsupported errors never supply that evidence. An invoked call with an unknown response stays pending.

Version-2 unknown effects and older sidecar/reporter-owned jobs migrate without invented acknowledgement. The old
reporter saved pause membership before issuing its call, so membership alone cannot prove completion. Inventory,
age, direct SDK child exit and native stopped output cannot settle an old accepted daemon event or cold child.
Affected jobs cannot be retried or given an opposite command, or establish observed pause, until current positive
completion/readback or explicit evidence-backed owner reconciliation applies; other jobs continue independently.
Stop blocks new effects and aborts reads promptly, retaining the lease for at most ten seconds of already-issued
call completion/receipt persistence before SDK close. This drain is not a native settlement fence.

## Offline control reconciliation

Use this door only after stopping every publisher for this state and retiring the prior native effect writers or
conclusively settling their effects through the owning lifecycle. Evidence must cover publishers, SDK services,
CLI wrappers and cold/Hermes children, and the selected daemon/execution domain across prior generations. A
publisher stop, direct-child exit, `stopped` message, lease absence or current disabled row alone is insufficient.
The operator verifies scope and evidence bytes; full-domain retirement remains your explicit local-owner assertion,
which the canonical audit labels as such. It cannot fence an old accepted native action for you.

Read the fresh public SDK snapshot and exact phase/configuration/control digests while publishers are stopped:

```sh
bun .open-autonomy/publication-operator.ts control-status \
  --config .open-autonomy/config.yaml --kind orchestrator --root /actual/native/home
```

Status makes no state changes. It accepts existing version-1/2/3 control sidecars: old v2 operation IDs stay unchanged;
old v1 ownership receives deterministic local phase IDs bound to exact retained bytes, scope and job ID, without
inventing native identity or acknowledgement. Reconciliation saves the v3 migration and its audit together against
the original file digest, so an old-boot lease does not require a controller restart before handoff.
Status reports job IDs/profiles/enabled state, not job prompts or transcripts. Its complete
snapshot combines public orchestration, profile and job inventory with source/root coverage. Filtered, truncated,
unreadable or inconsistent inventory refuses; `absent_store` with a loader error cannot prove absence. Use the same
`--state-file FILE` override as the publisher where applicable.

Prepare a private version-1 JSON manifest under `.open-autonomy/publication-private/control-recovery/`. That directory,
its children and evidence files must belong to the operator, have no group/other permissions, and contain no symlinks.
Paths in `evidence` and each action's evidence references resolve relative to the manifest; all stay under that private
directory. Record concrete prior actor identities, lifecycle actions and retained receipts, without credentials.
The manifest has these exact fields:

```json
{
  "version": 1,
  "mode": "reconcile",
  "operator": "owner",
  "statement": "Describe the completed owning-domain retirement and exclusive local custody.",
  "scope": {"account": "owner/project", "apiBase": "https://open-autonomy.org/v1", "nativeRuntime": {"kind": "orchestrator", "root": "/actual/native/home"}},
  "configDigest": "<control-status configDigest>",
  "controlDigest": "<control-status controlDigest>",
  "inventoryDigest": "<control-status inventoryDigest>",
  "custody": {"exclusiveLocalHome": true, "priorEffectWriters": "retired-or-settled"},
  "selections": [{"operation": "<phase UUID>", "effectDigest": "<phase digest>", "id": "<native job ID>", "profile": null, "disposition": "retain-owned"}],
  "evidence": [{"path": "evidence/retirement.json", "digest": "<exact file SHA-256>"}],
  "actions": [{"id": "owning-retirement", "door": "<actual owning lifecycle door>", "action": "<actual actions and actor/domain identities>", "evidence": ["evidence/retirement.json"]}],
  "coverage": {"publishers": ["owning-retirement"], "sdkServices": ["owning-retirement"], "nativeCliChildren": ["owning-retirement"], "executionDomain": ["owning-retirement"]}
}
```

One action may cover multiple groups only if its retained evidence actually covers each one. The custody fields are
assertions supported by those concrete actions and receipts, not a risk-acceptance flag. Keep each selected native
ID/profile exactly as status reports it: RPC origin with null profile means the known default profile, while
retained-ownership origin with null profile is historical unknown identity. Only the latter may use one unique ID
across complete all-profile inventory under the owner assertion. `retain-owned` accepts one exact
currently disabled job as present OA-owned intent. `relinquish` drops ownership for one existing job; it does not resume
that job. `relinquish-absent` requires complete all-profile SDK inventory without that exact known ID/profile; an
unknown historical profile requires the ID absent across every profile. A different-profile caller job is unchanged.
Unselected phases,
ownership and all retained board tasks remain unchanged. This door cannot reconcile `paused_tasks` through unsafe
promotion or invent native acknowledgements for legacy intent.

```sh
bun .open-autonomy/publication-operator.ts reconcile-controls \
  --config .open-autonomy/config.yaml --kind orchestrator --root /actual/native/home \
  --manifest .open-autonomy/publication-private/control-recovery/reviewed.json
```

The entire plan, evidence and snapshot must pass before lease acquisition/handoff; the operator checks them again
under the writer lease. Duplicate/unknown phases, changed digests, ambiguous native rows, incomplete scope or a live
writer refuse. It never calls native mutation verbs. Exact original control bytes and the manifest are backed up
privately; an atomically saved canonical reconciliation record is the applied boundary. A prepared audit or backup
alone is not applied. Success requires the canonical write's durable acknowledgement. If that write throws after
publication, output reports an unconfirmed attempt: canonical bytes/audit may already have changed. Preserve its
original backup and inspect the actual file before retry; never assume rejection means unchanged state. Review the
canonical audit before restarting the publisher to apply ordinary current intent.

If a supported old lease remains from another boot, additionally include
`"leaseHandoff":{"nonce":"<old nonce>","ownerDigest":"<exact owner.json SHA-256>","stateFile":"/absolute/reporter-state.json"}`.
The same full-domain retirement and exclusive-local-home evidence is required. Under the kernel guard this preserves
the exact old record in quarantine and publishes a new verified writer identity; a same-boot live owner still refuses.
Explicit owner-evidenced Linux handoff can bridge machine-id availability/basis changes or two boot-derived identities
across boots; it retains the same full-domain evidence and exact record/config/control packet. Foreign machine-basis
identities, malformed/unsupported records or homes have no override; cross-namespace handoff is unsupported. The operator
rechecks all inputs after handoff.
If custody transfers but later reconciliation fails, output distinguishes that handoff from unapplied control changes;
retain its private audit and rerun status against the actual retained state. Never delete a lock to make it pass.

If the retained supported lease exists but its canonical control sidecar was never created, status reports an explicit
`controlAbsence:{"kind":"absent-control","file":"/absolute/reporter-state.json.control.json"}` token and a null
control digest. This is missing state, not fresh ownership or historical acknowledgement. To recover only custody,
use the same full scope/snapshot/retirement-evidence manifest with `mode:"lease-handoff-only"`, `controlDigest:null`,
that exact `controlAbsence` token, `selections:[]` and mandatory `leaseHandoff`.

The same custody-only mode also supports VALID PRESENT canonical controls with zero pending phases. Use the exact
`controlDigest` SHA from status, omit `controlAbsence`, and keep `selections:[]` plus mandatory `leaseHandoff`.
Retained paused ownership and existing audits stay unchanged: no pending phases does not mean no owned jobs.
The shared scoped parser must accept the retained state; legacy declarations of reconciliation history, malformed
state or nonempty phases refuse custody-only handoff. Nonempty phases use `reconcile-controls` instead.
The operator retains an exact private control backup before transfer and binds its digest/path in the performed audit.
No constructor, migration, synthetic phase or control write occurs. Both variants use this command:

```sh
bun .open-autonomy/publication-operator.ts handoff-controls \
  --config .open-autonomy/config.yaml --kind orchestrator --root /actual/native/home \
  --manifest .open-autonomy/publication-private/control-recovery/reviewed-handoff.json
```

For the absence variant, the guard must prove actual ENOENT for the named sidecar; a dangling symlink or unreadable
path refuses. For present controls it verifies the exact retained digest. The operator
rechecks the selected absence or exact present digest/zero-phase proof and every scope/evidence/snapshot input after
handoff, writes a durable private performed-handoff audit, and reports custody-only completion. It creates no control sidecar, ownership, native acknowledgement or
narrative state; present control bytes, pause memberships and audits remain byte-identical. A later ordinary publisher
loads unchanged existing controls or seeds missing state conservatively under its existing retained-intent rules.
If a post-handoff check or performed-audit write fails, custody may already have changed; the diagnostic distinguishes
that from unapplied controls and labels any performed-audit publication without a durable acknowledgment as unconfirmed.

## Continued observation and delivery

Controls use fresh native schedule, configuration/binding and run readbacks. Active work may finish. The pinned
native and Hermes adapters lack a safe board pause/resume contract, so queued board intent stays pending;
controls never schedule/promote board tasks or infer dispatcher quiescence from empty inventory. Supported job
resume applies only to owned intent without an unresolved phase and forgets it after the current acknowledged call
and authoritative readback. It never lifts an unrelated pause.

For an explicitly reviewed move/rebinding, retain account/API/source/store context IDs and every association.
Increment custody `generation` by one, naming exact stopped prior `previous:{custodyDigest,reporterDigest,cacheDigest}`
and positive continuity evidence. Pending obligations must be settled first. A different copied source needs fresh
contexts/state; unknown replacement never automatically adopts the original source's history.

Pending source observations and exact redacted requests are durable before effects. Notes retry their original
identity/content/time and verify the returned full receipt; conflicting content under an old ID refuses. Timeline
delivery follows its note receipts. The source cursor commits only afterward. Session attribution is frozen before
publishing; current workspace uniqueness cannot adopt unknown historical association. A rejected weak late
candidate leaves an existing unbound session unbound while its transcript continues. Transcript keys and per-batch
receipts remain separate from board cursor acknowledgement. Source absence supplies no completion or session end.
