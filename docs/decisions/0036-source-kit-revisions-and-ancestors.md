# ADR 0036: Source kits name exact revisions and render their own ancestors

Status: Proposed; independent constitution review and merge are required for acceptance.

## Context and sources

ADR 0006 makes upgrade a three-way merge with the kit the project took as its ancestor. Its package-version
identity works for immutable public releases. Source development can contain several revisions at one package
version, and a selected newer source commit can carry an earlier package version. Version equality then selects
the wrong ancestor and maintenance can skip a real source change. Importing an ancestor into the current process
also gives historical source code the current source environment rather than its own.

VO-3843 manager event 281445 authorizes exact source revisions at one package version, including the transition
from source 377cdf29 (kit 3.26.22) to reviewed main (kit 3.26.21). No version-22 backport is required. This record
extends ADR 0006's identity rule for source mode; its lineage, ownership and merge rationale remain intact.

## Decision

A source render records `sourceRevision`, the full Git commit of its clean owning source checkout, alongside the
package version, skew and project parameters. Source validation requires the tracked native kit and exact SDK
from that same checkout, a clean tree and the SDK resolution into that checkout. New source checks compare both
revision and version. Source upgrades follow the explicitly selected revision regardless of package-version
ordering. Public-package defaults continue to discover releases and compare versions through the registry.

The source cache explicitly retains each recorded revision with its kit and SDK source links. Its directory key
is the recorded full commit. Older version-only records require an explicit version-keyed cache entry; the entry
is validated as one clean owning checkout at that version, including both source links and dependency resolution.
It supplies the otherwise missing source identity. Neither a version match with the current kit nor the registry
may substitute for that ancestor. A missing, dirty, incomplete or mismatched ancestor refuses before project writes.

An ancestor renders in a private child of the existing Bun runtime with its own validated source root in its
environment. The parent does not alter its global environment or import historical renderers into its module graph.
The child returns rendered bytes; only the current engine owns the merge and writes. This isolates same-version,
newer-version and older-version ancestors alike, including historical engines that enforce source selection.

The kit's source validator owns source identity and cache admission once. Generated maintenance calls that owner
from the selected source; it does not copy the validator. Maintenance, fleet upgrades, checks and runtime admission
use the same source identity rather than their own version-only shortcuts. Source maintenance discovers its target
from the selected source, names revision-specific branches, and lets the canonical upgrade validate the ancestor
before writing. This changes no activation door: idle-gated preparation, retained generations and machine-wide
activation remain owned by ADR 0031 and Supercode.

## Alternatives and consequences

Bumping or backporting a package version for every source change hides the missing revision identity and leaves
same-version consumers unsafe. Rendering a version-only record with today's engine can erase the ancestor's real
changes. Importing historical code while temporarily replacing process environment races concurrent operations.
Running a private Bun child costs one process per historical render but preserves that renderer's actual contract
without a second implementation. Historical version-only cache links remain an operator's explicit ancestry claim;
the original record cannot prove an identity it never recorded. New records remove that ambiguity.

## Constitution compatibility for independent review

“Authority comes from the repository”: the selected exact source remains the owner's explicit input; no platform
scheduler, credentials, visibility or spend authority changes. “Only the SDK is real” and “The platform shows;
it does not steer”: kit rendering remains local owner-run preparation, outside publication authority. “Every spend
is metered” and “The ledger's settled cents are the only cost”: model and treasury rails are unchanged. “No automated
tests” and “Nothing here develops against a real API”: source reading and bounded manual use supply evidence;
this PR performs no consumer adoption, World lifecycle, activation, package publication or deployment. The
independent reviewer must assess the decision and implementation before acceptance.
