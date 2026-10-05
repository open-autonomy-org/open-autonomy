# Source enrollment and publication recovery

The reporter publishes through OA's SDK; native execution remains native. Missing enrollment or uncertain
association leaves publication pending with its cause. It does not pause native work or silently select another
runtime. [ADR 0027](https://github.com/open-autonomy-org/open-autonomy/blob/main/docs/decisions/0027-oa-source-associations-and-publication-recovery.md)
owns the association/recovery contract.

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

One publisher owns a state directory and account timeline. Local lock ownership does not fence another host;
never run a copied active state as another publisher. Stop the owner through its ordinary lifecycle door.
`release-lock --config FILE --nonce NONCE --same-executor-stopped` only releases a recorded process proven absent
in that same executor/PID namespace; running or uncertain owners refuse. Age is not ownership evidence.

For an explicitly reviewed move/rebinding, retain account/API/source/store context IDs and every association.
Increment custody `generation` by one, naming exact stopped prior `previous:{custodyDigest,reporterDigest,cacheDigest}`
and positive continuity evidence. Pending obligations must be settled first. A different copied source needs fresh
contexts/state; unknown replacement never automatically adopts the original source's history.

Pending source observations and exact redacted requests are durable before effects. Notes retry their original
identity/content/time and verify the returned full receipt; conflicting content under an old ID refuses. Timeline
delivery follows its note receipts. The source cursor commits only afterward. Session attribution is frozen before
publishing; current workspace uniqueness cannot adopt unknown historical association. Transcript keys and per-batch
receipts remain separate from board cursor acknowledgement. Source absence supplies no completion or session end.
