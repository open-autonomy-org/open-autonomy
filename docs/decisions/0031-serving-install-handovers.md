# ADR 0031: A serving generation survives install preparation and handover

Status: Proposed. This card's proposal, subject to the board's independent constitution review and merge.

## Context and sources

VO-3578 records the owner's question on 2026-10-22: “why does every upgrade cause an outage”. Its three acceptance
outcomes require a serving board, connector, mail and Codex proxy throughout an upgrade, including successor failure.
The incident sources are volter-ai/volter-org commits 3499ba5b, 5628b00b and ea80b16c, each changing decisions.md.
They describe observed failures, rather than new owner-locked architecture decisions. In particular the board's
process tree included its model proxy, so stopping the board removed the model needed to finish its own upgrade.

This proposal amends the stop-and-restart lifecycle in ADRs 0001, 0017 and 0026. Runtime scheduling, board writer
authority, machine transport and mail remain native Supercode responsibilities. The kit prepares its own artifacts
and coordinates native lifecycle doors; it does not implement a second scheduler or machine transport.

## Decision

Preparation never edits the serving generation. Kit dependencies install in a new detached project worktree and a
receipt binds its exact revision, kit, runtime inputs and complete native source selection. The retained kit owner
validates that receipt rather than fetching or installing during activation. Its stack can stop and restart while the
native board owner and host Codex proxy remain independently serving. The native machine owner reserves every board,
connector/mail generation and kit before transferring authority. Only exact activated/serving receipts permit the
atomic source commit (or the complete retained npm release decision). Published kits bind the same machine-owned
retained closure instead of a global npm directory that installation can replace. One writer holds each shared store. A timed-out candidate never gains authority by starting.

Before commit, failure restores the previous source ledger before predecessor products restart. Retained databases
keep all committed rows; rollback never copies old storage over them. Board storage-code changes and mail schema changes
refuse before transfer until a compatible protocol is qualified. Finalization after commit is idempotent cleanup of
that completed selection, retained in the recovery journal when incomplete.

The Codex proxy is a host service with a lifetime independent of the board and keeper generations. Bare keepers
acquire its existing listener, identified by protocol, instance and a digest of the host Codex-home path. A missing
listener is started in a detached service process. A listener with an unread or different identity is preserved and
startup refuses; it is never killed to free the port. A legacy stack-owned listener is never silently adopted. First-adoption preparation can stage a separate
`--codex-proxy-port`; changing a live model endpoint belongs to that separately permitted adoption. Board stop and restart
signals do not stop the host proxy. Its implementation comes from the kit package, and its authentication still
uses the installed Codex's transient app-server door. No login is copied, refreshed outside Codex or printed.

An overlapping successor and retained rollback are generations of the machine's one coherent release, not separately
pinned per-install native dependencies (D215/D217). Activation and rollback must name the complete kit/source/native
generation. Retirement names exact owned identities; it never sweeps a process tree that can contain a host service.
Release permission remains separate from implementation and review. A source proof cannot claim the card's
released-pin MacBook outcome; that acceptance remains open until the authorized release and recorded readback.

## Alternatives and consequences

Stopping first leaves no serving route when any startup step fails, as the source incidents demonstrate. A watchdog
that eventually restarts the predecessor still leaves an outage. Keeping the proxy as a board child makes its model
endpoint share that outage. An independently identified listener preserves in-flight model streams across board
restarts; later proxy implementation upgrades require their own host-service handover, rather than incidental
replacement by a board upgrade. A predecessor without this protocol needs one separately permitted stop/start. Its complete candidate inputs are
prepared before stopping anything; refusal preserves the legacy services. The operator retains the exact legacy
commands, restores the source before restarting them on failure, and records the interruption. The MacBook continuity
proof comes afterward, between two released pins both carrying the protocol. Hermes, privilege-separated `--as` and
Windows kit stacks retain their existing startup path and refuse inclusion in the native kit handover without their
own readiness protocol.

## Constitution compatibility for independent review

“The platform shows; it does not steer” and “Only the SDK is real”: the change concerns the owner-run kit/native
lifecycle, with no platform scheduler or new publication contract. “Authority comes from the repository”: generation
selection does not widen grants, change visibility or move custody. “Every spend is metered” and “The ledger's settled
cents are the only cost”: existing model and treasury rails are preserved. “Nothing in a public agent's reach is a
secret that matters”: proxy identity discloses no credential, and host Codex retains custody. “No automated tests” and
“Nothing here develops against a real API”: source inspection and recorded manual use of isolated product doors
supply implementation evidence. The independent reviewer must judge the complete implementation and its evidence;
this proposal alone proves no acceptance outcome.

## Node source and published bindings

VO-2160 replaces Supercode's Rust command with Node. Preparation therefore binds `binding: node`, the exact
`supercode.js` source-file receipt and the graph's Node executable, rather than assuming a native build output.
Kit readers use the selected source owner's lossless graph codec; snapshots preserve the original declaration text.
The source transaction restores the exact previous bytes before restarting predecessor products. A retained published
v4 receipt identifies `program_kind: node` and its selected program; its `native` field remains only the established
control protocol's pathname alias. A kit selects that complete retained closure. Runtime and program admission do not
change D215/D217, release authority, privacy grants, custody or the separately permitted first adoption.
