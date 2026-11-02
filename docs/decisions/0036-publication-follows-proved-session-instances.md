# ADR 0036: Publication follows proved instances of one native session

Status: Proposed. Independent constitution and plan review precedes implementation;
exact source review and manual World evidence precede acceptance and adoption.

## Context and sources

VO-3758 (`t_04ae4f10`, task `t_a63dc399`) needs a card's conversation to survive
a machine change. Supercode's reviewed [ADR 0257](https://github.com/volter-ai/supercode/blob/03f6c74dec64f32c66b785caf796f9ddcf546408/docs/adr/0257-card-machine-changes-continue-their-session.md)
proposes a fresh source-qualified native instance of the same durable session,
with immutable ownership and a committed active-instance generation. It does
not by itself establish that OA's acknowledged transcript matches that instance.

The OA source baseline is `db104baee4037627a9db8bfdf7bc6cb5d77bdaee`.
[publication.ts](../../packages/kit-hermes/base/.open-autonomy/publication.ts)
freezes a platform key to one native ID and rejects another. Its journal replaces
a binding by platform key. [reporting.ts](../../packages/kit-hermes/base/.open-autonomy/reporting.ts)
checks the published wire prefix, and ordinary rewritten history can end the old
publication and start a continuation key. Neither behavior qualifies a machine
move which must keep its existing published identity. This proposal changes the
kit's native adapter and private publication state only. The parked retention
and publisher-affinity work is outside this change.

## Decision and responsibilities

Supercode owns stopping, capturing, materializing, activating and resuming native
instances. OA consumes a versioned public SDK continuity receipt; it neither
reads native private stores nor drives those effects. The receipt identifies
the canonical session, operation and monotonic generation, exact old and new
source/machine/native-instance tuples, final source revision and artifact
manifest digest, and committed activation decision. The adapter reads back the
receipt from its selected native source and checks its current family pointer.
Pending preparation, a matching raw ID, copied bytes, a path or a timestamp
cannot establish continuity. An unavailable or ambiguous read remains pending.

The kit's native adapter exposes this receipt and exact instance locators to
the publisher through its existing public SDK connection. Its selected source,
enrolled source/store contexts, account/logical API, publication audience and
positive card association must agree with the retained binding. A receipt grants
no access and cannot change custody. Changing the selected runtime root or
publication custody still requires ADR 0027's explicit procedure; a session's
remote native instance alone does not change that configuration.
The first alias must positively bind the retained original to the receipt's
exact old source-qualified tuple through existing binding/adoption evidence and
public native readback. A legacy binding's raw native ID alone cannot supply
that provenance; missing evidence leaves the alias pending.

The publication store retains the original `nativeSessionId` and binding evidence,
adding an ordered alias chain. Each entry retains the full receipt and digest,
predecessor, operation, generation, exact instance and reconciliation status.
Only a committed, prefix-verified alias is the transcript read target. Same-key
recovery returns the existing entry; changed receipt contents, skipped or
conflicting generations and a second successor remain visible conflicts.
Never replace the frozen original with the new ID. Preserve every existing
platform key and continuation suffix, item/association binding, note alias,
account/API and treasury attribution, continuation count, acknowledged offset,
prefix digest, end checkpoint and pending publication receipt. Existing ended
publications stay ended. No historical alias is inferred for old copied sessions.

The transcript publisher reconciles the actual destination transcript at the
receipt's captured revision through the same wire conversion, redaction,
clipping, tool-result and timestamp rules used for OA publication. It streams
the acknowledged prefix, checks retained checkpoint digests and every available
remote tail receipt, and accounts for any already prepared or uncertain batch
before appending. A value-lossless native codec is insufficient if that wire
prefix changes. Missing old-prefix evidence, a short/divergent prefix or an
advancing inconsistent destination stays pending with exact conflict evidence.
It cannot take the ordinary `SourceRewritten` path, mint a continuation key,
end the old publication or resend acknowledged history to make the move pass.
Ordinary non-migration rewrite behavior is unchanged.

Retain alias intent durably before changing a transcript reader. Reconciliation
records the receipt/revision, checkpoint and wire-policy identity it checked;
a changed checkpoint or receipt invalidates it before append. Lost answers
recover that same alias and existing publication obligations. Migration source
retirement is an instance event, never a canonical session completion. Source
absence, a stopped source run or an activation gap cannot generate an OA end.
Only the public canonical lifecycle or already qualified completion evidence
can end the continued published session.

The existing four transcript lanes keep their independent SDK readers. Work for
one canonical session and its aliases is serialized within one lane, with an
exact reader-replacement barrier before destination reads. Other lanes, board
acknowledgement and the independent owner-control queue continue. Only the
publisher parent owns narrative state and OA effects. Shutdown aborts and joins
the actual old and new readers before clean lease release; unknown retirement
is retained, never treated as successful cleanup. There is no migration-wide
OA scheduler, second writer or new platform backend dependency.

## Private format and generation admission

Reporter state advances from version 3 to version 4 with versioned alias entries
and journal changes. Every existing field is preserved; the source cache keeps
its current version unless implementation changes its representation, which
then requires its own explicit version/admission. A journal's base digest,
replay, durable fsync/rename, private modes and sole-writer lease remain binding.
Missing, torn, unsupported or conflicting retained evidence refuses effects;
opening state is not permission to discard it or enroll afresh.

Ordinary version-4 writes require the retained kit owner to admit the actual
candidate and retained rollback generation, their exact native inputs, private
format and alias behavior. Both must retain and enforce alias holds and unknown
outcomes, including after restart and state/journal folding. Generic JSON
preservation or an npm version match is insufficient. Rollback keeps all newly
committed rows, never an older state-file snapshot. A version-3 predecessor
which ignores aliases cannot be retained for this adoption. First qualify a
capable pair with alias issuance closed; if that cannot use the existing
handover protocol, propose and review its bootstrap before changing live state.
No invented readability declaration, silent conversion or legacy fallback opens
the gate. Native board/session admission and OA admission are separate.

## Qualification bootstrap: review before implementation

The first behavioral proof cannot depend on its own successful receipts. This
amendment proposes distinct, scope-limited bootstrap authority; independent plan
and constitution review must pass before its code or first effects. Existing
ordinary admission stays closed. Bootstrap never produces a pretend ordinary
qualification, a `qualified` flag, environment bypass or caller-supplied proof.

The native retained qualification owner creates a fresh exclusive closure as a
declared service of the ordinary World. World owns resources, network policy,
startup and purge; this owner retains authority and operation recovery within
its closure, not another World lifecycle or scheduler. It creates a loopback
Teams server/team using the real local bootstrap, two machine/native homes and
registered roots, and an isolated native board. OA's scenario supplies its real
platform and isolated account through actual bootstrap/enrollment API doors.
Those doors and native/model compatibility are prerequisites to demonstrate,
not permission to insert database rows or invent identities. No production API,
live context, existing store or production conversation is imported or changed.

The owner locks and durably retains its realm ID, reviewed owner-source digest,
exact prepared serving/rollback selections and runtimes, directory identities,
server/team/source/machine/incarnation identities, roots, board and allowed
operation keys. OA additionally binds account/logical API, audience, publication
state and original native provenance. Effect/state paths stay in the closure;
imported state, symlink escapes and unowned endpoints refuse before effects. Distinct
pathnames alone do not qualify a rollback: both actual prepared generations must
serve and enforce the other's newly committed holds and unknown outcomes.

Each retained domain owner receives a distinct bootstrap capability over its
owned authenticated IPC channel and delegates only to its exact child. Files
and environment variables can locate that channel but cannot mint authority.
Every forward authorization checks the actual intent, selected bytes, realm,
store and resource identities against the locked scope. Normal journal, custody,
credential, native-receipt, writer and effect fences still execute. The ordinary
unscoped doors must refuse even inside the closure. OA's capability permits its
own publication writes only; it cannot authorize a native migration. Restart
revalidates the same retained scope and selections before further issuance.

World enrollment uses synthetic credentials and real local platform/Teams
bootstrap doors, protected storage and scoped expiring child credentials;
none is printed or borrowed from production.
World's `stripEnv: ["*"]` and synthetic model handlers remain binding. A separate
real native-model proof needs a supported selection/delegation door for an
existing sign-in; without it that proof stays open. No new sign-in, copied auth
file or real-model credential injection into World supplies the missing door.

First create an authorized conversation through native doors and publish its
actual history through the OA SDK. Then perform a real keyed native move and
read its origin, final capture, materialization and activation through the public
SDK. Only those receipts may start OA alias reconciliation. Observe the same
key, association, acknowledged prefix and new suffix. At genuine durable phase
boundaries activate the candidate, roll back to the capable predecessor, restart
the retained owners and fold/replay the journal over the same committed state.
Native proof also reconstructs real published board documents across applicable
backings and demonstrates held dispatch/adoption/wake/input/restore fences.
Neither owner restores an old snapshot, repeats destination issuance or revives
the retired source. Other OA lanes and board acknowledgement keep progressing.

Make an observer outcome genuinely uncertain by ending its client transport
after dispatch while the keyed owner continues; read status under the original
key instead of replaying mutation. No injected timeout, failure receipt, native
acknowledgement, transcript or remote tail establishes behavior. Mismatches and
unknown effects/readers close new issuance and retain recovery obligations;
failure provides no PASS. Settle through the original owners and native doors.

Proof records bind the realm/owner digest, exact artifact/format/native inputs,
keys and digest-addressed activation, rollback, restart, reconstruction and
unknown-status readings. They grant no live access, adoption or release. An
independent review must accept a later exact-pair qualification declaration;
ordinary owners then revalidate their actual selections. Bind the receipt index
in the complete install/source receipt, outside the behavior digest to avoid a
self-hash cycle. Changed behavior or inputs invalidate affected evidence. Node qualifies neither
Worker nor Windows; source proof does not meet released-pin Acceptance.

After exact owned sessions, readers and operations settle, revoke child keys,
disconnect/remove disposable enrollments and read back revocation. Stop owned
services, retain sanitized evidence and a scope-retirement tombstone, then use
World's `down --purge` for its resources. Unknown outcomes retain their original
keys and cleanup obligations; deletion cannot manufacture a retirement receipt.

Implementation owners are the native qualification/server generation owner
(new), native board/machine admission and retained generation owners, and their
existing migration effect guards. In OA, `keeper/install-owner.ts` owns the
prepared pair and IPC delegation; proposed `.open-autonomy/publication-admission.ts`
validates scoped authority. `prepare-install.ts`/`publication-inputs.ts` bind exact
inputs; `publisher.ts` receives authority; `publication.ts` guards v4 writes.
`native-runtime.ts`, `native-continuity.ts` and `reporting.ts` remain public SDK
consumers. `publication-operator.ts` separately owns explicit original-provenance
adoption and unknown-reader recovery. `world/prepare.ts`, `world/opening.ts`,
`world/seed.ts` and manual operators own scenario enrollment/content, not fake
native effects. Missing doors stay open work before bootstrap qualification.

## Disposition of existing decisions

These citations describe OA at the exact baseline above; no proposed record
label is treated as proof of acceptance or as an owner override.

| Existing decision and constraint | Disposition |
| --- | --- |
| [0002](0002-world-scenario.md): World owns lifecycle/environment; synthetic credentials and model handlers, no real-model mode | **Complies.** The qualification owner is a declared World service; actual platform/bootstrap APIs supply isolated state. No inherited credentials, second rehearsal lifecycle or production calls. Existing-auth native proof remains a separate prerequisite. |
| [0005](0005-the-sdk-is-the-interface.md): “The package is the interface”; host tools belong to the kit | **Complies.** Kit adapters consume public native receipts and publish through OA SDK. No harness dependency enters the universal OA protocol or backend. |
| [0024](0024-ecosystem-target-architecture.md): native systems own task/session execution; OA owns acknowledged publication | **Complies.** Native move authority remains external. An alias is publication evidence, never a control grant or a scheduler. |
| [0016](0016-retained-source-publication.md): independent publication lanes/checkpoints, sole board writer and joined shutdown | **Complies.** Serialize aliases per canonical session inside one existing lane, retain independent lanes and queues, and join the exact readers before clean shutdown. No source absence supplies an end. |
| [0025](0025-source-qualified-associations-and-replay.md): “Keep OA session keys, transcript-turn replay, continuation behavior and treasury attribution unchanged” | **Complies.** Retain keys, all checkpoints, obligations and attribution; verify actual wire prefixes before append. An unqualified move is a pending conflict rather than an automatic rewrite continuation. |
| [0027](0027-oa-source-associations-and-publication-recovery.md), frozen session attribution: “Keep platform session keys, continuation suffixes, turn offsets, per-batch sequence/digest/end checkpoints, publication policy and treasury attribution unchanged” | **Updates only the single-native-ID restriction.** Receipt-proved instance aliases retain the frozen original and every listed invariant. Existing custody, legacy adoption, exact delivery, writer recovery and unknown-child rules remain. |
| [0031](0031-serving-install-handovers.md): coherent complete generation; changes “refuse before transfer until a compatible protocol is qualified”; rollback keeps committed rows | **Updates first-qualification authority only.** A separately reviewed owner may authorize real proof effects solely in its new isolated closure before ordinary qualification exists. Ordinary/live transfer remains closed until the actual pair qualifies. Complete kit/native coordination, one writer, exact retirement and rollback retaining new rows remain binding. |

No quoted owner decision or constitutional invariant is contradicted. This
OA0027 and OA0031 amendments need independent review; the native plan's pass
does not approve them. OA0005/0024 retain native/publication boundaries;
OA0016/0025 retain independent lanes, acknowledged identity and replay.

## Alternatives, consequences and verification

Replacing the original native ID loses evidence. A fresh OA key duplicates
history and attribution. Matching IDs, timestamps or conversation text guesses
provenance. Reusing ordinary rewrite continuations hides a failed prefix check.
Retained, receipt-proved aliases preserve identity at the cost of a visible
pending state when a codec or source cannot prove the required prefix.

Implementation belongs in the kit's native connection/adapter, publication
store and journal, transcript integration and retained kit admission. Update
the kit's publication documentation and source-bound dependency receipts with
the code. No platform route, treasury rail, native scheduler or owner-control
contract changes. This plan adds no executable support or runtime PASS.

Manual World verification uses actual native SDK and OA SDK doors: publish an
authorized conversation, move it through the native machine-change door, read
the public continuity receipt and unchanged OA key/item/acknowledged prefix,
then publish only new turns. Exercise a genuinely uncertain existing operation
through restart and exact-key recovery; a divergent/unsupported prefix must
remain pending without end, new key or append. Read the same alias hold after
candidate activation, retained rollback, owner restart and journal folding,
with independent lanes still progressing. No injected receipts, fabricated
history, automated tests or production API calls establish these outcomes.
Native features or World doors not yet available remain explicit open work.

## Constitution review

- **Every spend is metered; settled cents are the only cost.** Existing session,
  account and treasury identities remain; no charge route or estimate is added.
- **Only the SDK is real.** Public native receipts feed a kit adapter and all OA
  effects use the OA SDK. The platform learns no native private layout.
- **The platform shows; it does not steer.** OA observes a native decision and
  reconciles publication; native controls and scheduling remain external.
- **Authority comes from the repository.** Committed enrollment and audience
  remain binding. A receipt cannot widen custody, bounds or permissions.
- **Nothing in an agent's reach is a secret beyond its audience.** Alias records
  contain provenance rather than credentials; existing private modes and
  publication policy apply to both old and new instances.
- **No automated tests; nothing develops against a real API.** Source review and
  manual product use in the ordinary disposable World provide evidence. This
  documentation-only proposal makes no runtime, release or adoption claim.
