# ADR 0036: Project Rooms can settle a retained leave intent offline

Status: Proposed. Documentation only; typed PLAN PASS and independent constitution review are
required before implementation. Neither this proposal nor the merged implementation of
[ADR 0035](0035-project-rooms-program-receipts.md) establishes this new capability.

## Context and evidence sources

VO-3773's populated complete-generation recovery reached the correct refusal in the Rooms owner:
an unanswered conditional leave remains in the publisher's version-1 mutation journal, so the
candidate cannot acknowledge compensation and the native owner retains its reservation. The
actual program at full OA revision `0da04c17ea898758409ae1487972e8f327b3a9e6`, merged in
[PR 966](https://github.com/open-autonomy-org/open-autonomy/pull/966), marks retained intents
unknown on startup and refuses compensation before its placement callback while any remain.
It has no supported settlement command. Restarting it after clearing a transport fault cannot
make progress. This is an owner recovery gap, not evidence that the debt should be discarded.

The immutable selected artifact and its logical lifecycle binding identify that old program.
Executing a repaired program in its place would change the artifact/binding inside the retained
native transaction. It cannot claim to be the old program or invent an old-program acknowledgement.

The independent source set for this proposal is OA's complete Rooms lifecycle and placement
implementation at that revision; [ADR 0031](0031-serving-install-handovers.md); ADR 0035; and
[Supercode ADR 0243](https://github.com/volter-ai/supercode/blob/main/docs/adr/0243-card-run-sessions-in-project-rooms.md),
its prepared-program amendment and six-case proof plan. The actual World refusal, interrupted
runner recovery, cleared-fault repeat and safe offline retention are supplied with this PR's
evidence. They demonstrate retention, not successful settlement or qualified populated recovery.

RH2's examined Room leave door accepts a principal and expected seater. It exposes no request
idempotency key, request-status receipt, expected session or expected seat version. Its SQL guard
matches an active seat by seater alone. A delayed old leave could therefore remove a later seat
made by that same app. An absent seat, an unchanged seater, process death, a client timeout, or a
second successful leave alone cannot prove that the original request has become terminal.

## Decision

### A separate publisher command, with the old selection retained

Add one explicit offline recovery command to the Rooms publisher's immutable closure. It runs
only under the connection custodian's existing local authority, after all bound writers and their
restart owners have stopped. It settles only the eligible conditional leave intents below. It
does not project the board, serve IPC as the old module, or coordinate a native transition.

The invocation names a private, durable recovery plan and both exact artifact receipts: the old
selected program whose state is being repaired and the independently reviewed recovery executable.
The recovery receipt binds the new full source revision, complete executable/file vector and
supported old journal/program capability. This authority is explicit compatibility support in the
new owner code, not a capability retroactively attributed to the old receipt. Published metadata
must distinguish the offline command from IPC compensation and all-placement withdrawal.

Before effects the plan binds all of the following, with exact values rather than inferred paths:

- The canonical existing connection/config/state paths, connection and app principal, organization,
  product origin, board source, unchanged config digest and exact initial state-file digest.
- The retained native transaction, exact selected and predecessor program-selection receipts and
  digests, and independently read uncommitted source decision/reservation. The publisher reads
  those facts only to refuse a mismatched or committed transaction; the native owner still decides it.
- The old artifact receipt and full original lifecycle binding of every named intent, including
  its original generation. The logical selection is computed exactly as the old program computes
  it: SHA-256 of its canonical binding with only generation omitted. It is distinct from the native
  program-selection receipt digest. Neither hash nor the old binding is recomputed using the new
  recovery artifact. The retained run-placement owner must equal that exact old logical selection.
- Each exact intent ID, operation bytes/signature, matching run-placement record and source-qualified
  native session. The complete retained intent is preserved in the recovery audit before disposition.
- The stopped-writer and exclusive-home evidence, terminal-request evidence and selected disposition
  described below. Custody values are neither included in the plan/audit nor copied or regenerated.

A mismatched artifact, binding, signature, path, source decision, state/config digest or session
refuses before mutation. No legacy unknown state is adopted by current uniqueness or a pathname.

### Exclusive local maintenance, before the first state write

The existing native lifecycle door stops the exact runner and its children first. The custodian
also retires every supervisor that could restart them and retains their exact command, process
incarnation and stop/readback evidence. A quiesced live child is still a writer and is ineligible.
The command neither kills another process nor silently disables a service to manufacture this proof.

The recovery command acquires an exclusive local lock for the canonical connection/state before
reading mutable state, keeps it for its entire lifetime, and rechecks the exact stopped process
incarnations, home custody and retained input digests under that lock before every disposition.
Held, unreadable, foreign or ambiguous ownership refuses. A PID's reuse is not proof that its
earlier owner still lives or that a new owner may be killed. Stale lock recovery requires positive
owner-incarnation retirement; an age or absent socket cannot release it. Mandatory locking and
identity facilities must refuse when unavailable, rather than silently weaken exclusion.

The old program does not participate in this new lock protocol. The lock excludes recovery
writers; exclusive stopped-home custody and stopped restart owners supply the old-writer fence.
A process scan alone is not that fence. If the custodian cannot exclude another start throughout
maintenance, this door is unsupported and refuses. Shared/copied homes or a foreign machine are
not automatically qualified. Final input/process readback and durable audit precede lock release.

### Only independently terminal, exact conditional leaves are eligible

The first implementation supports only a recorded POST to one exact Room's ordinary leave door,
with exactly the recorded principal and expected seater equal to this app. A corresponding retained
run-placement record must bind that principal, Room, exact old logical selection and native session.
Joins, receive/session rewrites, Room creation/rules, uploads and other mutations remain unknown;
there is no generic replay, JSON edit, "clear unknown" or caller-selected arbitrary operation.

Before reissuing even this narrow command, independently establish that the original request can
no longer apply. Eligible evidence is either an authoritative terminal receipt correlated to the
exact original request, or independently verifiable terminal non-dispatch evidence bound to that
exact intent and operation. An operator's assertion, a client error code or a recording alone is
not that proof. The command validates the evidence and its provenance; uncertain or uncorrelated
evidence refuses. A definitive failure may settle the old request's uncertainty without claiming
the run placement has been removed.

The current public RH2 door supplies no such correlated status/fence for a generally lost request.
This proposal adds none and cannot recover that case. In the retained World case, the transport
fault intercepted the exact leave before upstream dispatch; its exact source, invocation and raw
audit can support a non-dispatch proof only if independently verified and bound by the reviewed
recovery contract. That fixture-specific fact cannot be generalized to a production HTTP503.
If source/runtime evidence cannot establish non-dispatch or a terminal outcome, the fixture stays
held too. A future public request fence/receipt needs RH2's own decision and review.

After terminal proof, obtain a fresh complete board/Task role-demand reading and exact public
Room/session/seater readback using the existing installation's custody. No unresolved role demand
may be interpreted as absence. For the supported retry, the current seat must still carry the
retained native session, be owned by the expected app, and have no current role demand. A changed
session, seater, principal representation or authority, an unavailable Room/roster, a role seat,
an absent seat or insufficient visibility retains the intent for a separately proved disposition.
The command never uses an absent-seat reading to declare an unknown remote write settled.

With these fences held, durably record the one exact recovery attempt before dispatching the
ordinary expected-seater leave with the existing grant. Require a successful concrete product
acknowledgement and an independent subsequent Room reading confirming that the exact owned seat
is gone, while role/person/borrowed placements and receive settings remain correct. Revalidate
the terminal proof, session/custody fences and local inputs before accepting the disposition.
A changed or ambiguous reading, a refused leave, lost answer or failed persistence remains debt.
The second request's success is not a substitute for the original request's terminal proof.

### Settlement is not compensation or a source decision

Persist and re-read the original intent, old binding, recovery executable identity, terminal proof,
guarded attempt/acknowledgement and independent readback in an owner audit. Write the disposition
atomically with file and directory durability, preserving every unrelated current state field.
An interruption must leave either the old unknown debt or a durable exact disposition recoverable
under the same plan. A lost recovery answer is resolved from this retained audit and readback;
it never permits blindly issuing another mutation. A conflicting current state refuses. Any audit
snapshot preserves evidence only; it is never copied over current state to perform rollback.

Only the individually proved intent is removed from the old journal. Run-placement records,
native obligations and reservation remain owed. Do not write a compensated/zero-debt receipt,
forge the old child's generation, change the old journal version or recast the new executable as
the old selected program. Existing old-program state keys and bindings remain readable unchanged.

After the command exits and releases its lock, the existing native owner resumes the same journal
and starts its same immutable selected program in recovery-only mode. That program rechecks the
current board/roles and completes its ordinary compensation through product doors, with its own
exact old-selection acknowledgement. Only then may native recovery restore and verify source,
read back native predecessors, restart dependent predecessors and release the reservation, in
ADR 0031/0243's order. A new recovery artifact is not installed into this in-progress selection.
Future selection of new program bytes is a separately prepared, qualified complete transaction.

## Existing decision dispositions

| Existing decision | Proposed disposition |
| --- | --- |
| OA ADR 0035: durable intents and unknown effects prevent zero debt | **Extends the publisher's supported recovery command; preserves the debt rule.** Individually proved settlement is a new explicit owner act, never blanket clearing or retroactive old-program capability. All unsupported/ambiguous effects remain debt. |
| OA ADR 0035: exact immutable artifacts and lifecycle acknowledgements | **Preserves immutable identity.** New reviewed code repairs compatible old state offline under a distinct receipt. The old selected artifact/binding stays unchanged and later supplies its own compensation acknowledgement. |
| OA ADR 0031: one writer, exact native source decision and restoration before predecessor restart | **Adds a stopped-writer maintenance prerequisite; preserves native ownership/order.** The command changes no source ledger, selection, reservation, config, custody or native journal. It cannot make a committed transaction eligible for compensation. |
| Supercode ADR 0243: "A process exit, forced stop, aborted fetch or absent seat read alone does not prove an unknown remote write settled" | **Preserves without exception.** Exact terminal-request proof plus guarded acknowledged settlement and independent readback are required; same-app absence alone remains insufficient because the public leave door has no request/session fence. |
| Supercode ADR 0243: compensation only through the connection owner; "A different recovery design requires revising this plan before coding it" | **Proposes one explicit specialization requiring typed PLAN PASS.** The new publisher command is not old IPC compensation or a second selector. Native recovery remains held, then resumes that same old program/transaction after eligible intent settlement. The native ADR must link this reviewed specialization before dependent implementation is accepted. |
| Supercode ADR 0243 decision 4: preserve role, independent/person and unrelated run demand | **Preserves.** Fresh full demand and exact session/seater reads precede any retry. Role or changed-session cases refuse in this narrow command; independent seats/settings are read back rather than rewritten. |
| OA/RH2 consent and connection custody | **Preserves.** Only existing app credentials and product doors are used. The command cannot add grants, replace an installation, copy custody or change namespace. |

## Alternatives and consequences

Installing repaired bytes into the old native selection would violate its exact artifact/receipt
identity. Giving the native runner Room-specific interpretation would move policy to the wrong
owner. Unconditionally replaying guarded leaves still admits the delayed same-app-seat race.
Discarding debt after process exit or an absent roster would permit an incapable predecessor to
restart while old effects remain possible. A new connection or copied snapshot would abandon the
existing obligation. All are rejected.

The narrow offline command can settle only independently terminal, unchanged-session leaves.
General transport ambiguity, changed session/authority, incompatible state or unproved exclusion
still blocks recovery. That limit is intentional and visible. A public correlated request fence
could broaden safe recovery later through its own owner; this proposal neither invents that
capability nor claims a general liveness guarantee.

## Constitution assessment and manual proof plan

"Only the SDK is real" and "The platform shows; it does not steer": this is an existing publisher's
maintenance act over consented external product doors. It adds no platform scheduler, native
execution owner or connection selector. "Authority comes from the repository": a plan/receipt
declares compatible code and exact existing custody; it grants no new permission. "Nothing in a
public agent's reach is a secret that matters": no token is printed, copied or added to evidence.
Public books and settled-cost rails remain unchanged. "No automated tests" and "Nothing here
develops against a real API": implementation evidence will be manual isolated World use only.
Independent constitution review must judge this proposal and its exact implementation separately.

After typed PLAN PASS, implement under the existing OA Rooms task, then request its exact pushed
head review. Before that review, manually demonstrate eligible non-dispatch settlement on the
retained populated journal; refusal for uncorrelated/actually ambiguous effects, changed sessions,
another seater, role demand, held/unknown writers, changed inputs and incompatible old artifacts;
lost recovery answers and persistence interruption; and independently preserved role/person/borrowed
seats. Resume the old immutable program's actual compensation, read zero debt, and capture source
restoration before predecessor restart and reservation release. Preserve failed takes and exact
raw/source mappings. Failure to settle any prerequisite remains a named open obligation.

The parent native proof packet may retain its completed independent cases with this populated
recovery prerequisite explicitly unresolved. No new door is implemented or exercised by this PR;
no populated-recovery, release, fleet cutover or Workplace Acceptance PASS is claimed.
