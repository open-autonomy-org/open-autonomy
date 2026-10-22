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

Preparation never edits the serving generation. A successor gets its own immutable kit/source inputs and private
runtime doors. Preparation, dependency installation and declaration validation finish while the predecessor serves.
Only a readiness receipt from the running successor permits a route change. One native writer holds each shared
store; a warm successor does not gain write authority by starting. An interrupted transition retains its predecessor
and its source inputs. A failed or unread readiness check never permits stopping the serving predecessor.

The Codex proxy is a host service with a lifetime independent of the board and keeper generations. Bare keepers
acquire its existing listener, identified by protocol, instance and a digest of the host Codex-home path. A missing
listener is started in a detached service process. A listener with an unread or different identity is preserved and
startup refuses; it is never killed to free the port. Initial adoption from a legacy stack-owned listener stages a
separate `--codex-proxy-port`, with the old generation retained for callers still using it. Board stop and restart
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
replacement by a board upgrade. An unsupported predecessor must be adopted without stopping its only serving route.

## Constitution compatibility for independent review

“The platform shows; it does not steer” and “Only the SDK is real”: the change concerns the owner-run kit/native
lifecycle, with no platform scheduler or new publication contract. “Authority comes from the repository”: generation
selection does not widen grants, change visibility or move custody. “Every spend is metered” and “The ledger's settled
cents are the only cost”: existing model and treasury rails are preserved. “Nothing in a public agent's reach is a
secret that matters”: proxy identity discloses no credential, and host Codex retains custody. “No automated tests” and
“Nothing here develops against a real API”: source inspection and recorded manual use of isolated product doors
supply implementation evidence. The independent reviewer must judge the complete implementation and its evidence;
this proposal alone proves no acceptance outcome.
