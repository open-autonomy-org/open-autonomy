# ADR 0036: Fleet and coding programs have separate owners

Status: Proposed for VO-3843; independent constitution/source review and merge
remain required before acceptance.

## Context and sources

Supercode's [ADR 0265](https://github.com/volter-ai/supercode/blob/supercode-harness-only/docs/adr/0265-supercode-is-the-fleets-harness.md)
defines it as the fleet's harness. The manager's rulings on VO-3843 preserve
called coding functionality in the private `volter-ai/supercode-agent` product
and require volter-org to consume installed releases, with its installation
switched alongside the fleet. The kit currently obtains both owners from one
machine's Supercode source lock. That gives coding execution to the fleet and
makes an installation's SDK authority depend on a serving source checkout.

## Decision

The kit selects two existing external programs. Installed `supercode` owns
board commands/events, identity, native session discovery/read/activity, Teams,
machine health and the work ledger. Installed `supercode-agent` owns the called
applier, coding orchestration gateway, jobs, runs, profile application and
channel adapters. Each program resolves its public packages from its own exact
release closure. The fleet never forwards coding calls, and the kit copies no
codec, runtime or scheduler. Explicit Hermes runtime selection stays explicit.

Keeper passes both selections to its existing children. The publisher reads
native sessions through the fleet SDK and coding configuration/control through
the Agent SDK. The board owner remains the installed fleet board, while the
coding gateway's own loaded/ready events retain their root/PID readiness
contract. A failed or unavailable door never selects the other product.
Enrollment reads declared home identity through Fleet's public Teams helper,
and joins each native command and its output, including explicit cancellation.
Keeper preparation waits for its owned readiness event or child exit, and explicit
shutdown joins the children it started. Elapsed startup or command time does
not turn pending native work into failure or completed cleanup. Existing
caller-selected publication observation windows stay observation contracts.
Neither ordinary package lookup nor work-ledger loading imports a serving
fleet source tree. Explicit existing World/review selections remain owned
candidate inputs, rather than being inferred from a source lock.

An explicitly named `SUPERCODE_CODING_BIN` source package may declare an exact
`workspace:<version>` dependency. Only that prefix is normalized: each package
is resolved from that same selected package and its actual version must match
the declared exact version. Ordinary installed selection still requires the
manifest's exact version pin. An explicitly named native packed program may instead declare a `file:` npm archive. The existing native archive reader supplies that archive's own exact package name and version, which must match the dependency resolved from the selected program; npm or pnpm retains archive integrity ownership. A source archive is never compared to a version string or selected from an ambient graph. OA and RH2 source images retain explicitly named,
separate Fleet and Agent source contexts; each native workspace is installed
and built by pnpm. No serving-source inference selects either product.

The provider's Node and final PATH remain its own: Peak's Termfleet provider,
for example, keeps Node 24. Fleet and Agent use the existing
`SUPERCODE_NODE_BIN` selection, with their Node runtime installed separately
at `/opt/supercode-node/bin/node` in executor images. Native install/build
commands select that runtime only for their own command environment. The kit
invokes the selected package's actual JavaScript entry with that interpreter,
never a package-manager shell shim or an invented launcher. Host imports keep
the host's package selections. Executor commands resolve Fleet, Agent and Node
inside that executor through the same installed-package resolver before the
host constructs their literal argv; a host path never selects an executor
program. Executor inspection is read-only native work under the existing
container process owner's stdin lease. That owner reaps the remote process
and joins its command/output closure, including explicit cancellation, before
inspection returns its selections.

The same native-work ownership applies throughout the shared kit: hookline's
mail RPC, container home/treasurer preparation and maintenance commands await
their native result and all owned output/child closure. Container and fleet
readiness follow their health/IPC result, actual child failure or explicit
shutdown; progress and retry cadence set no failure time. Shutdown snapshots
admitted preparation before cancellation, joins its results with native
closure and retains every failure except that owner's explicit cancellation.
Hookline acknowledges a frame only on the socket that received it; reconnecting
cannot transfer that frame's acknowledgment to a replacement socket. Host Codex
startup and authentication follow native replies or failure, including protocol
EOF while a request is pending, with cancellation joining the owned process. Every startup authentication acquisition takes its stack owner's cancellation signal; shutdown aborts it before joining admitted preparation. The keeper and any adopter-owned bare stack preserve that same ownership. HTTP authentication and refresh use their request's signal, including the upstream response, so a disconnected caller leaves no detached authentication work. Setup's subscription step is the CLI acquisition owner: its termination handlers exist only while that acquisition is admitted, abort the same native request and remain installed until Codex process closure is joined. The existing CLI failure path exits after that join; cancellation starts no later setup step.
Owner-control shutdown cancels its reads and submitted mutation observation,
preserves unknown effects and joins the admitted work
before its lease can close. Selected runtime calls introduce no default SDK
deadline; an explicitly selected API observation window keeps its existing
meaning. TERM-to-KILL pacing may request cleanup but cannot report departure
or release ownership before the exact native child closes.

Custom adopters keep their own publication lifecycle. When an adopter accepts
the shared board stream, its acknowledgment joins the admitted projection,
including a projection already in progress; a busy observer or caught delivery
failure cannot acknowledge a cursor. Startup observation and shutdown share
the same native reader custody, so cancellation joins discovery, publication
and transcript follows before the process exits.
Each startup selects its active publisher implementation. A custom publisher
with a caller remains owned by its adopter; an uncalled duplicate implementation
is removed alongside the cutover.

The backend dashboard and its Storybook use Agent's shared UI package for
session lists, conversations, workflow projections and job/run controls.
Their state still comes from OA's published SDK records, with existing
visibility and owner-intent rules. Agent owns the reusable rendering code;
OA owns its projection and page composition. This adds no runtime or voice
implementation to OA.

Prepared kit generations bind the selected Agent closure in their existing
receipt and runtime identity, alongside their native machine selection. A
candidate cannot substitute an ambient coding program during activation.
The machine and kit retain their current coordinated reservation, rollback and
retirement doors. Joint release preparation precedes the one fleet/kit/org
switch. Existing archived kits and working program pins keep their original
bytes and meaning; this change does not rewrite their historical records.

The shared kit template is the source of installation changes. Volter-org
receives them through `create-open-autonomy upgrade`, preserving its manager
profile, role prompts, workflow and agent declaration. Its active start imports the selected kit keeper, so the cutover selects the current source-built keeper and its exact SDK while retaining the older archived kit and SDK bytes. A project-owned archive pin cannot keep the active keeper on the earlier combined program boundary. It keeps no competing
design record in the installation repository.

Upgrade ancestors retain their original source declarations. Historical kits
that declared `@open-autonomy/sdk` as `workspace:*` resolve the SDK from the
same exact owning Git commit, with both tracked package trees unchanged and
the prepared SDK link pointing into that checkout. This allowance applies only
to the versioned ancestor cache. Current source still requires its exact SDK
pin. A retained archive is not relabelled as a different source release.

A source-mode upgrade renders and merges source; it never resolves the new kit
version from a public registry to refresh an adopter lock. The kit archive
contains the installer, so its integrity cannot be finalized during its own
render. A changed source-mode host manifest leaves lock preparation explicit:
after the final source commit is packed, the adopter runs its existing
`install-runtime.ts --update-lock --lockfile-only --runtime-package <artifacts>`
door with the exact local kit and SDK artifacts. That installer owns candidate
archive validation and registry-neutral integrity. Existing published-mode
resolution stays with its existing package-manager door.

The company World's `world/voice.ts`, `world/room-call.mjs` and
`world/owner.ts call` are rehearsal stories, not a user feature. Manager ruling
268242 on VO-3843 removes their standalone voice runner, fabricated call-thread
state, model turns and service configuration. Production Room voice stays the
fleet's delegated session voice through RH2's authorized endpoint. The World's
DM remains on the installed public `@volter/teams/browser-channel` export.

The dashboard backend selects the current Agent and its public Fleet closure
from native `sources/supercode-agent` and `sources/supercode-fleet` Git pins
inside the root pnpm workspace. Historical independent source contexts keep
their versions through exact version-scoped overrides. No source package is
selected from a serving machine graph.

## Existing decisions

- [ADR 0024](0024-ecosystem-target-architecture.md): updates the external
  Supercode package owner to Fleet or Agent according to the responsibilities
  above. Complies with OA's SDK projections, external execution and reusable
  views. [ADR 0018](0018-the-workplace-integration.md)'s consented Workplace
  linkage, existing dashboard controls and resource ownership remain intact.
- [ADR 0006](0006-the-kit-is-a-lineage.md): complies with whole-file templates,
  project-owned seeded World scenarios and the existing three-way upgrade.
- [ADR 0001](0001-runtime-boundary.md),
  [ADR 0007](0007-the-kit-ships-an-agent-setup.md),
  [ADR 0009](0009-another-harness-on-the-same-home.md) and
  [ADR 0017](0017-the-ir-native-kit.md): update the external coding package owner
  to Agent. Preserve the selected worker, one compatible home, content forms,
  setup-before-gateway order, SDK publication, native gateway lock and the
  independently owned Fleet board. The container image installs both exact
  selected machine releases; its coding gateway runs Agent's own entry.
- [ADR 0021](0021-the-pay-boundary.md): complies with the separate treasurer
  executor, original paying-key custody, shared board data and native Hermes
  treasurer. Changing the installed coding owner moves no pay authority.
- [ADR 0026](0026-selected-native-runtime-adapters.md): updates the package and
  program owner of coding doors; preserves explicit runtime selection, public
  APIs, setup preflight, exact home/profile/job identity, applier three-way
  custody, original effect receipts and unknown-outcome ownership. Fleet
  observations remain separate from coding mutations.
- [ADR 0030](0030-native-setup-maps-what-existing-homes-declare.md): complies with
  declared worker/config mappings, native capability readback and withheld
  unsupported fields. Agent provides those owning APIs; the kit invents no
  replacement fields or native-write path.
- [ADR 0031](0031-serving-install-handovers.md): preserves complete immutable
  generations, one writer, preparation before activation, coordinated native
  reservation and rollback, exact serving receipts and host Codex custody.
  Adds the Agent closure to the existing kit receipt. Machine source ledgers
  still describe source preparation; they no longer select ordinary kit SDKs.

## Alternatives and consequences

Keeping a source-lock import would keep the installation coupled to a serving
checkout. Keeping coding calls on the fleet would contradict its provider's
boundary. Independent package lookup without a retained generation binding
would let an ambient upgrade change a prepared candidate. Selecting each
owner's installed release preserves its existing interfaces and custody at
the cost of staging both releases before this kit can activate.

## Constitution compatibility for independent review

“Only the SDK is real” keeps observations on their owning public SDKs.
“The platform shows; it does not steer” leaves execution in the external
owner-run programs. “Authority comes from the repository” preserves declared
runtime, profile and publication policy, without adding grants or clearing
unknown effects. “Every spend is metered” and “The ledger's settled cents are
the only cost” leave valves, treasury and native receipts unchanged. No key
is read or copied. “No automated tests” and “Nothing here develops against a
real API” require source review and a final manual World/candidate proof;
this proposal claims no run, release or live installation outcome.
