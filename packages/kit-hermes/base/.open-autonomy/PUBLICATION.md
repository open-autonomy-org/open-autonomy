# Source enrollment and publication recovery

The reporter publishes through OA's SDK; native execution remains native. Missing enrollment or uncertain
association leaves publication pending with its cause. It does not pause native work or silently select another
runtime. [ADR 0027](https://github.com/open-autonomy-org/open-autonomy/blob/main/docs/decisions/0027-oa-source-associations-and-publication-recovery.md)
owns the association/recovery contract. The organization publisher stays running for owner SDK controls even
without enrollment or when narrative initialization/delivery is refused. Missing enrollment selects control-only
operation; a declared malformed or conflicting enrollment remains an explicit narrative failure. Source reads,
notes, transcripts, setup and document publication require valid enrollment. Controls use their own queue;
a pending narrative request cannot delay supported native job pause/resume.
Narrative initialization retries failed stages in place; completed enrollment and discovery stages are retained.
HTTP requests have a bounded deadline and stop aborts in-flight narrative reads and delivery before draining the
publication queue. A lost response retains the exact pending publication request for receipt reconciliation.
Hermes pause does not defer queued paid board work: its public doors cannot safely pause and resume that work.
Retained `paused_tasks` from older 3.24 installs therefore remain pending; this adapter does not promote them.
The owner must resolve board dispatch through its owning runtime; OA reports that missing capability explicitly.

Use `publication-operator.ts` in this rendered host. It is separate from `enroll.ts`, which enrolls mail agents.
Run the door inside the owning World/executor, with the publisher stopped before enrollment, adoption or custody
changes. In an operator World the command prefix is `volter-world attach <world> --root <twins-checkout> --`.
The command reads only its named configuration/publication files; it calls no native or OA service, reads no
credentials, and cannot prove native continuity for the operator.

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
New local leases record the host, boot, process namespace and process start identity. A same-host successor can
recover a positively dead recorded owner under the kernel guard; a recycled PID cannot supply the prior identity.
Running, foreign, legacy or malformed ownership remains a refusal requiring explicit operator reconciliation.
`release-lock --config FILE --nonce NONCE --same-executor-stopped` uses the same recorded-identity proof;
the flag alone cannot establish an unknown executor or release a live owner. Age is not ownership evidence.
Keep the private guard, staged lock and retired lock evidence ignored alongside the canonical control sidecar.
Local lease recovery requires Bun FFI and readable public process identity on macOS or glibc Linux. An unsupported
host or unreadable identity refuses ownership; choose a supported host rather than treating uncertainty as absence.

Owner pause ownership lives in the private `<reporter-state>.control.json`, scoped to the account, logical API
and selected native runtime. On first creation, validated version-2 or version-3 reporter pause arrays may seed it;
version 3 must match retained enrollment. The exact reporter digest and the available custody basis are recorded.
Legacy version 2 has no historical account/runtime provenance, so its seed records that limitation. Once present,
the control file is authoritative even when its ownership arrays are empty; old reporter arrays never re-seed it.
Malformed control ownership or contradictory scope refuses native effects. Control-only operation preserves
reporter state and source-cache bytes, without enrollment or adoption. Narrative saves retain historical pause
fields without turning them into another live ownership store. Keep this sidecar private when configuring a
state path outside the generated `.open-autonomy` directory.

Control state version 2 also records `pending_effects` before each native pause/resume call. Only that same call's
positive acknowledgement followed by matching native readback clears its phase. A crash, abort or unknown response
leaves that job pending; a later inventory alone cannot prove the old accepted call finished. Other jobs can still
be controlled. Version-1 sidecar jobs and reporter-seeded owned jobs migrate as unresolved historical phases:
ownership is retained, but historical acknowledgement is not invented. Affected jobs cannot be retried or given an
opposite command, or establish observed pause, until actual settlement or explicit evidence reconciliation exists.
This adapter supplies no native fence or reconciliation bypass; the missing settlement door is an external gap.

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
