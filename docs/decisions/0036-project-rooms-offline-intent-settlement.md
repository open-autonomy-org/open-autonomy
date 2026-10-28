# ADR 0036: Project Rooms can record a terminal no-effect leave outcome offline

Status: Proposed. The narrow no-effect plan and paired live-custody amendment passed typed plan
review; source acceptance still requires independent constitution and implementation review.
Neither this proposal nor the merged implementation of [ADR 0035](0035-project-rooms-program-receipts.md)
establishes a qualified successful recovery capability.

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

The paired native proposal is the offline-settlement amendment to ADR 0243 at
[Supercode `153b6f664eaefaebbe32d4fe6acb5e18afa4be1d`](https://github.com/volter-ai/supercode/blob/153b6f664eaefaebbe32d4fe6acb5e18afa4be1d/docs/adr/0243-card-run-sessions-in-project-rooms.md#proposed-amendment-settle-an-eligible-retained-intent-while-its-owner-is-stopped)
in [PR 2534](https://github.com/volter-ai/supercode/pull/2534). PLAN finding F1 returned the earlier
proposal because its new expected-seater leave could remove a changed-session seat. This revision
and that exact native revision form the proposed decision set; the review request must name both
exact pushed revisions. Neither a pushed commit nor this cross-link approves implementation.

RH2's examined Room leave door accepts a principal and expected seater. It exposes no request
idempotency key, request-status receipt, expected session or expected seat version. Its SQL guard
matches an active seat by seater alone. A delayed old leave could therefore remove a later seat
made by that same app. An absent seat, an unchanged seater, process death, a client timeout, or a
second successful leave alone cannot prove that the original request has become terminal.
Even after that proof, a fresh session or role-demand read is not a remote fence: a principal
can change S0 to S1 through its own door while the seater stays the app, or role demand can
arrive before a new leave. A later read cannot undo that wrong removal.

## Decision

### A separate publisher command, with the old selection retained

Add one explicit offline recovery command to the Rooms publisher's immutable closure. It runs
only under the connection custodian's existing local authority, after all bound writers and their
restart owners have stopped. It records only a conclusively terminal no-effect outcome for an
original conditional leave attempt. It sends no recovery leave or other remote mutation, projects
no board state, serves no old-module IPC, and neither resumes compensation nor coordinates a
native transition. New effectful retries are explicitly unsupported by this proposal.

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

### Proposed amendment: consume live native maintenance custody

The passed no-remote-mutation scope above remains unchanged. Native task `t_b2b063ab` proposes
an additional prerequisite in [Supercode ADR 0243 at `5c5aeef6311a6eefa81dd391458e2072a8d0e7d0`](https://github.com/volter-ai/supercode/blob/5c5aeef6311a6eefa81dd391458e2072a8d0e7d0/docs/adr/0243-card-run-sessions-in-project-rooms.md):
the native owner supplies a qualified live maintenance lease/channel for the exact canonical
home, connection, state, retained transaction, selected program and predecessor. This paired
amendment needs its own typed PLAN PASS before either repository implements the protocol.
It does not treat the existing runner lock or a list of stopped PIDs as restart exclusion.

The native owner must gate every bound writer and every supported start/restart admission path
before granting custody, retire the exact earlier process incarnations, and retain a durable
maintenance hold. OA's separate recovery executable consumes that authority; it does not emulate
the native gate, retire its owners, or create its own equivalent from operator assertions,
World ownership, process scans, a sealed file or an absent socket. Unknown admission coverage,
an incompatible native runtime or an unqualified lease refuses before state disposition.

OA holds and validates the live lease/channel throughout its invocation, including the complete
mutable-input reading, audit preparation, state replacement, final audit and exact readback. Its
existing local lock still excludes other offline recovery invocations; it cannot substitute for
the native fence. OA checks the lease's exact identity and continued validity before each write
and through final readback. Loss, expiry, a changed generation or an unknown answer stops further
writes and retains uncertainty; it never manufactures a successful disposition from the last
observed lease state. A lost channel leaves the native durable hold in place. Normal release of
the lease likewise leaves a recovery-required native barrier: it authorizes no automatic start,
compensation, source restoration or reservation release.

The ordering is mandatory: the native durable hold is acquired before OA reads mutable inputs;
it survives channel or native-owner loss, excludes every bound admission path across each
check-to-write interval, and cannot be released until the exact OA invocation is terminal and
its audit and readbacks are complete. A lease check alone does not supply exclusion. If OA loses
the lease while persistence is already in flight, the result remains audit uncertainty under
that retained hold; the loss cannot authorize a competing writer or a restart. The native owner
alone resolves or releases the retained hold under its exact-invocation recovery contract.
The paired contract's exact version, binding, qualification and refusal semantics require review
before any positive implementation or fixture proof; wire fields remain source/declaration authority.
Manual evidence must cover attempted starts/restarts while the lease is held, lease/channel loss
at each durable boundary, changed bindings, and release with the native recovery barrier retained.
OA task `t_2ca9da74` owns consumption and publisher durability; native `t_b2b063ab` owns the live
gate, admission coverage and durable hold. Until that contract is implemented and qualified, the
offline command has no successful disposition path and the retained intent and placement debt stay.

### Only the original request's proved terminal no-effect outcome is eligible

The first implementation supports only an original recorded POST to one exact Room's ordinary
leave door, with exactly the recorded principal and expected seater equal to this app. The retained
run-placement record must bind that principal, Room, exact old logical selection and native session.
The command may record that original attempt as terminal without effect only when independently
verified evidence proves it did not dispatch, or an authoritative receipt correlated to that exact
request proves a terminal failure with no effect. The proof must cover the original attempt's
whole lifetime: no effect occurred, no work remains pending, and no deferred or later dispatch
can apply it. An HTTP status alone, operator assertion, client timeout,
recording alone or uncorrelated audit is insufficient. Uncertain or uncorrelated evidence refuses.

Authoritative successful/effected outcomes, generally lost or delayed requests, partly applied
effects and outcomes not proved to have no effect remain unsupported and retain the original
intent. Joins, receive/session rewrites, Room creation/rules, uploads and other mutation kinds are
also unsupported. There is no generic replay, arbitrary JSON edit, "clear unknown", or new leave
request, including when terminal no-effect evidence is valid and a fresh roster appears eligible.

The present public RH2 door supplies no correlated request-status receipt for a generally lost
request. This proposal adds none. In the retained World, the transport fault intercepted the exact
leave before upstream dispatch; its exact source, invocation and raw audit can prove non-dispatch
only if independently verified and bound by the reviewed recovery contract. That fixture-specific
fact cannot be generalized to a production HTTP503. If that proof is unavailable, the fixture
stays held too.

Fresh Room/session/seater and board/Task role-demand observations are never treated as exclusion
fences. S0 may become S1 with the same seater, role demand may arrive after an observation, and a
person or another app may replace a placement. The maintenance command sends no remote mutation
in any of those interleavings and changes no seat, session, role, receive setting or placement
debt. A future effectful retry requires its own RH2-owned atomic guard or verifiable remote
exclusion, together with a contract fencing changes to independently owned role demand. An
expected session alone cannot fence a new board/Task assignment. Neither facility is added or
attributed to the existing product by this proposal.

### Settlement is not compensation or a source decision

Persist and re-read the complete original intent, old binding, recovery executable identity and
verified terminal no-effect proof in an owner audit. Record that the original attempt had no
effect; do not record a successful leave. Write the disposition atomically with file and directory
durability, preserving every unrelated current state field. An interruption must leave either
the original unknown intent or a durable exact no-effect disposition recoverable under the same
plan. A lost local answer resolves only from that audit and exact state readback. Failed persistence
or conflicting state retains uncertainty and never permits a remote retry. An audit snapshot
preserves evidence only; it is never copied over current state to perform rollback.

Only the individually proved terminal no-effect intent is removed from the old journal.
Run-placement records, native obligations and reservation remain owed and unchanged. Do not write
a compensated/zero-debt receipt, forge the old child's generation, change the old journal version
or recast the new executable as the old selected program. Existing old-program state keys and
bindings remain readable unchanged.

The maintenance command exits and releases its lock without starting another program. Any later
native recovery is a separate act by the existing native owner using the same journal and immutable
selected program in recovery-only mode. Its existing compensation still needs its own current
board/role reading, product acknowledgements and safety proof. Removing uncertainty about one
no-effect request strengthens none of that old code's session or demand guards and establishes
no race-free compensation or populated-recovery capability. If those prerequisites cannot be
proved, run-placement debt and the native reservation remain held. Only the old program's own
valid compensation acknowledgement can permit source restoration, native predecessor readback,
dependent predecessor restart and reservation release, in ADR 0031/0243's order. A new recovery
artifact is never substituted into this in-progress selection. Future selection of new program
bytes is a separately prepared, qualified complete transaction.

## Existing decision dispositions

| Existing decision | Proposed disposition |
| --- | --- |
| OA ADR 0035: durable intents and unknown effects prevent zero debt | **Extends only local recording of a terminal no-effect original request.** The exact proof resolves that attempt's uncertainty, never its run-placement obligation. Successful/effected, ambiguous and unsupported outcomes remain debt. |
| OA ADR 0035: exact immutable artifacts and lifecycle acknowledgements | **Preserves immutable identity.** New reviewed code repairs compatible old state offline under a distinct receipt. The old selected artifact/binding stays unchanged; any later compensation requires that program's own separately proved acknowledgement. |
| OA ADR 0031: one writer, exact native source decision and restoration before predecessor restart | **Adds a stopped-writer maintenance prerequisite; preserves native ownership/order.** The command changes no source ledger, selection, reservation, config, custody or native journal. It cannot make a committed transaction eligible for compensation. |
| Supercode ADR 0243: "A process exit, forced stop, aborted fetch or absent seat read alone does not prove an unknown remote write settled" | **Preserves without exception.** Independently verified exact original terminal no-effect proof is mandatory. No new leave is sent; current absence, session, seater or role observations cannot replace the proof. |
| Supercode ADR 0243: compensation only through the connection owner; "A different recovery design requires revising this plan before coding it" | **Proposes one explicit specialization requiring typed PLAN PASS.** The local command is neither old IPC compensation nor a selector or restart controller. Native recovery stays held unless separately qualified; a later attempt retains the same old program/transaction. The paired native revision must be reviewed before dependent implementation is accepted. |
| Supercode ADR 0243 decision 4: preserve role, independent/person and unrelated run demand | **Preserves by sending no recovery mutation and retaining all placement debt.** Session/demand changes after observation remain untouched; a later old-program compensation act is separately unqualified by this proposal. |
| RH2 ordinary leave: remove only an active seat with the expected seater | **Unchanged and insufficient for an exact-session retry.** This proposal neither extends that generic door nor claims its seater guard fences session/version or external role-demand changes. Any future effectful retry requires its own product-owned decision and review. |
| OA/RH2 consent and connection custody | **Preserves.** Only existing app credentials and product doors are used. The command cannot add grants, replace an installation, copy custody or change namespace. |

## Alternatives and consequences

Installing repaired bytes into the old native selection would violate its exact artifact/receipt
identity. Giving the native runner Room-specific interpretation would move policy to the wrong
owner. Unconditionally replaying guarded leaves still admits the delayed same-app-seat race.
Discarding debt after process exit or an absent roster would permit an incapable predecessor to
restart while old effects remain possible. A new connection or copied snapshot would abandon the
existing obligation. All are rejected.

The narrow offline command can record only an independently proved original terminal no-effect
outcome. It cannot remove a placement or complete compensation. General transport ambiguity,
effected outcomes, incompatible state or unproved local exclusion remain held. A product-owned
request/seat fence and a role-demand exclusion contract could broaden safe recovery in a future
proposal; this one neither invents them nor claims a general liveness guarantee.

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
head review. Before that review, manually demonstrate exact original non-dispatch/no-effect
disposition on the retained journal, with the run-placement debt and every unrelated state field
unchanged. Record refusals for uncorrelated, actually ambiguous, successful/effected or partial
outcomes, held/unknown writers, changed inputs and incompatible old artifacts; record lost local
answers and persistence interruption without a remote retry.

For F1, observe S0, change it to S1 through the principal's product door while retaining the same
app seater, then invoke maintenance. Separately, introduce current role demand after a no-role
observation and before maintenance. Record that neither interleaving sends a recovery leave,
both changed placements and receive settings survive, and all run-placement debt remains. An
explicit request to perform a new retry must refuse before outbound dispatch even when original
terminal no-effect proof is valid. Include person/borrowed replacements and independent reads;
a post-effect refusal is never counted as preservation.

The maintenance proof claims no old-program compensation, zero placement debt, source restoration
or predecessor restart. Proving those through the unchanged old selected program and native
owner remains a separate open obligation; any stronger session/demand safety requirement absent
from that program retains the reservation until separately designed and reviewed. Preserve every
failed take and exact raw/source mappings.

The candidate supplies the separate source-only preparation entry
`packages/workplace/rooms/prepare-offline.mjs` and the immutable offline `--plan` entry. Its
maintenance metadata currently declares no supported native custody protocol or terminal-evidence
profile, so it refuses before mutable product-input reads or any state/audit write. A source
scaffold does not qualify either prerequisite; positive disposition requires their actual reviewed
implementations and independently qualified evidence.

The parent native proof packet may retain its completed independent cases with this populated
recovery prerequisite explicitly unresolved. No populated-recovery, release, fleet cutover or
Workplace Acceptance PASS is claimed.
