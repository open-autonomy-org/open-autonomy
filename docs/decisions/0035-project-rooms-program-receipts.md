# ADR 0035: Project Rooms prepares and compensates its own program

Status: Proposed; implementation follows the independently passed amendment to Supercode ADR 0243. OA acceptance remains subject to independent review and merge.

[ADR 0036](0036-project-rooms-offline-intent-settlement.md) proposes an additional owner command for
recording an original leave request's independently proved terminal no-effect outcome while the
selected program is stopped. It sends no recovery mutation and retains every run-placement debt.
The immutable program described here does not implement that command or gain stronger session or
role-demand guards from it. Unknown/effected outcomes and separately unproved compensation remain
held; the additional local door requires its own plan and source reviews.

## Context and decision

[Supercode ADR 0243](https://github.com/volter-ai/supercode/blob/main/docs/adr/0243-card-run-sessions-in-project-rooms.md),
amendment reviewed in PR 2534, adds the Rooms program to the complete native generation in
[OA ADR 0031](0031-serving-install-handovers.md). The installed version-5 program cannot withdraw
the candidate's additional run placements. Merely preserving unknown state keys cannot qualify recovery.

The publisher's `packages/workplace/rooms/prepare.mjs` reads a full Git revision's complete runtime
closure and both consent manifests into a new immutable artifact. Its exact-byte `artifact.json`
receipt binds source, files, entrypoint and lifecycle capability. Existing differing artifacts refuse.
Preparation never selects or starts a program and never copies state, config or custody.

The runtime metadata separately declares the command withdrawal capability: protocol 1, `--disconnect`,
scope `all-owned-placements`. The command conditionally removes owned role and run seats, preserves
independent seats, and refuses completion while unanswered product effects or run debt remain. Exact
version 5 declares no such capability and is ineligible for native command withdrawal.

The existing connection owner supplies its child with a transaction, connection/app, artifact digest,
canonical config/state paths and fresh child generation over the existing Node IPC parent channel.
The program verifies its immutable closure and reports loaded and source-admitted readiness separately
from placement debt. Status and lifecycle controls echo that exact binding. Native admission and
generation/source commit remain Supercode's responsibility; no publisher service or config writer is added.

Before every product mutation, including existing-seat receive/session rewrites and file uploads,
the publisher durably writes and re-reads an intent. A missing remote acknowledgement remains unknown
debt across restart. Quiesce stops new work and joins outstanding bounded writes; signals use the same
path. Recovery-only startup loads state and IPC without projection. Compensation obtains a fresh complete
board reading and current Task/agent role demand, then conditionally withdraws only the exact selection's
run effects. Current role seats and their receive requirement survive; independent/person-owned seats
and receive settings remain with their owners. Unknown effects, unresolved demand, failed persistence
or refused cleanup prevent a zero-debt receipt. No old state or database snapshot is restored.

The exact legacy revision and three file digests are explicit compensation capability. An isolated,
measured direct-program transition must precede `qualify.mjs`: its sealed evidence binds the exact pair,
persisted compensation acknowledgement, raw recording/map and predecessor readback against current
state. Preparation never emits qualification. The native owner requires this separate receipt before
admitting that pair; independent review judges what the recording establishes.

## Alternatives, consequences and constitution compatibility

`--disconnect` also removes role placements and cannot serve as compensation. Process exit, aborted
fetches and absent-seat reads cannot settle unknown remote writes. Restarting an incapable predecessor
would strand cleanup; failed recovery therefore retains the native reservation instead. The exact version-5 predecessor also removes another app's non-role
agent and rewrites an independently seated role agent's differing receive setting. Compensation therefore
refuses before cleanup while a current roster would expose either act; it identifies that principal
and keeps recovery held. Borrowed session seats and independently seated agents whose current
role/receive survives the predecessor remain eligible.

“Only the SDK is real” and “The platform shows; it does not steer”: the publisher projects existing
native records through consented Workplace doors, with no scheduling or native runtime ownership.
“Authority comes from the repository”: receipts do not widen either manifest's grants. Custody, identity,
namespace and state remain with the existing connection. No monetary rail changes. “No automated tests”
and “Nothing here develops against a real API”: source inspection and manual isolated World use provide
the implementation evidence; this decision itself claims no completed release or recovery proof.
