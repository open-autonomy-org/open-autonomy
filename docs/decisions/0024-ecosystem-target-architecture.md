# ADR 0024: Open Autonomy ecosystem target architecture

Status: Proposed for repository acceptance. The owner approved this target in the coding conversation on
2026-10-04; acceptance requires independent constitution review and merge. This record establishes responsibilities
and boundaries, not completion of every component or authorization to release it.

## Context and authority

The owner asked to make every part explicit to discover inconsistencies, gaps and duplication, then directed:
"let's lock this down as the target architecture unless you have questions". In the same conversation the owner
defined the autonomous running package as an engine primarily composed of Supercode IR with OA additions, an SDK
that is more specification than code, and the server accepting that protocol. Templates and creators instantiate
systems conforming to it. The two product surfaces are Workplace integration and project discovery/funding, with
reusable widgets. The official hosted backend supports the public product; an operator can self-host the reusable
backend. The owner explicitly distinguished external Supercode and its orchestration IR from OA's templates and
creator scripts. These conversation statements establish scope, not independent approval. No public permalink is
available; the original conversation is the source.

This is a responsibility map across products and deployments, not a requirement to split repositories or introduce
one npm package per box. It explains the constitution's platform, kits, cookbooks and own install in more detail
without changing that constitution. It supersedes no existing decision. The specific decisions linked below remain
authoritative for their interfaces and behavior; a conflict holds dependent implementation for review.

## Decision

### Structure and ownership

```text
External Supercode: IR, codecs, native interfaces, orchestration, Teams and UI libraries
                               |
Open Autonomy autonomous running package
  engine composition and OA additions | SDK specification and clients | core server
                               |
Open Autonomy instantiation tooling
  templates and cookbooks | create/adopt/upgrade | publication and host adapters
                               |
Owner's running project
  selected external runtime | project policy and native state | OA connection
                               |
                selected OA backend deployment
                 /                           \
      official OA cloud service          self-hosted service
      core + discovery/funding app       core + selected integrations
                 \                           /
Open Autonomy presentation and integrations
  Workplace integration | discovery/funding UI | shared views/widgets | CLI
         |
External RH2 Workplace and resource-owning viewers

Development: OA scenarios and opening data use external World and vendor twins.
```

The autonomous running package is a reusable composition. It is not an OA implementation of a generic harness or
orchestrator. Software authorship, service operation and ownership of an instance's records are separate:

| Component | OA builds or maintains | External or operator responsibility |
| --- | --- | --- |
| Engine composition | OA additions, capability selection and mappings into the project contract | Supercode owns its canonical IR, codecs, native interfaces and generic orchestration; the selected runtime executes work |
| SDK specification | Language-independent publication, reads, owner intent, authorization, errors and compatibility contract | An arbitrary implementation may speak the protocol without using OA's client or template |
| SDK clients and drivers | Reference client libraries and adapters from project/tracker records | Native systems own their records and tracker behavior |
| Core server | Authorized intake, publication history, revisions, streams, policy enforcement, treasury accounts, reservations, settled metering and spending rails | Deployment operator owns infrastructure operation and protected service credentials; vendors provide paid services |
| Templates and cookbooks | Instructions, skills, operating configurations and complete example projects | The owner chooses and operates the resulting system; the harness and orchestrator remain external |
| Creators and upgrades | Rendering, adoption, setup, lineage metadata and merging supplied-file changes | Project policy and owner-authored changes remain the project's; creation is not proof of runtime operation |
| Company records tooling | Generic register template, initialization/check and estate inventory; supplied manager/auditor rules | The organization owns its record repository, entries, classification, retention and declared machine roots; this is not an OA core record store |
| Runtime connection | Publisher, publication receipts, owner-control adapter, host credential handoffs and connection tooling, process keeper | Native scheduler/dispatcher owns work; host custodian owns credentials; external lifecycle and machine services own their resources |
| Hookline connection | Keeper-launched adapter from configured pull-request events to native agent/session messages | Hookline owns inbox delivery and Supercode owns mailbox/session access; receiving an event grants no new execution authority |
| Official hosted service | Deployment and operation of core server plus public application services and account connections | Cloud, identity and payment providers supply infrastructure and provider behavior; OA does not host project compute under this decision |
| Self-hosting product | Deployable core server and documented configuration | Operator chooses infrastructure, integrations and service operation, including storage, recovery and upgrades |
| Discovery/funding application | Listings, project presentation, sponsorship/giving flows, provider adapters and application-specific durable records | Payment providers process payments; treasury owns credited funds, reservations and settled spend |
| Workplace integration | Consented associations, books publication and controls, and alerts for conditions OA owns | RH2 owns workplace resources and permissions; Supercode's integration owns native orchestration conditions and live-session capabilities |
| Views, widgets and clients | OA projections, funding/progress widgets, embeds, public pages and operational CLI/admin clients | Reusable external UI components render supplied state; the resource owner enforces native access |
| Development assets | OA World configuration, synthetic opening data, model handlers and manual scenarios | World owns lifecycle/routing; external twins implement vendor substitution |

A system conforming to the SDK specification is a valid OA project. A supplied kit, a particular harness, use of
Supercode's runtime, a particular native tracker, or a particular programming language is not the admission gate.
Conformance includes authority, truthful publication and metered spending, not merely the shape of a JSON document.

### Engine and specification boundary

Supercode's operational IR is external. OA consumes it and adds only OA responsibilities. A template for Supercode's
orchestrator and its creator belong to OA; the orchestrator and its IR do not. OA must not duplicate upstream codecs,
generic scheduling, workflow dispatch or harness capability detection to make an instantiation work.
The native IR composition must apply and observe the selected runtime through its own model and public doors;
Hermes compatibility is an explicit boundary choice, not a permanent requirement to install Hermes for that path.

The SDK is the project's protocol contract, with client code as an optional implementation. Published OA views are
projections of native/IR records, not a second execution model. Mappings must name stable source identities,
attribution, omitted information and unsupported capabilities. A public projection is not assumed to be a lossless
export of operational state. Unknown records stay unknown; absence, elapsed time or a failed read never proves
completion. The native retained-event and publication-receipt responsibilities remain as decided in
[retained source publication](0016-retained-source-publication.md).

The server accepting the SDK is OA-owned software. It records the representation the project publishes and enforces
policy and treasury rules. The running system owns execution and applies authorized owner intent through its own
method. The server keeps desired and observed state distinct; a request is not an observed result. See
[ADR 0003](0003-operating-state-through-the-sdk.md) and [ADR 0010](0010-an-org-word-projects-inherit.md).

### Deployment and presentation boundary

The official cloud service and a self-hosted instance deploy the reusable server; they do not implement another IR
or treasury engine. The official service mounts the discovery/funding application around that server. Its human
account connections identify people using external identity providers; they do not replace those providers.

Each UI declares its data source and authorization boundary. The official discovery/funding UI and its backend
records use the official service. Compatible widgets and operational clients use their configured server. An
authenticated native Surface or session can be served by its resource-owning service directly into Workplace;
it does not require an OA cloud copy of the underlying files or transcript.

Workplace is external, not a generic UI OA builds. OA builds the integration and reusable views for OA facts. Books
and book conditions belong to OA's integration; native runs, workflow and their conditions belong to Supercode's.
Their integrations use public contracts and consented grants. Sharing a deployment or package does not merge
those responsibilities. Existing dashboard code is not authority to build a second workplace product.
[ADR 0018](0018-the-workplace-integration.md) governs the current linkage, controls and team-role adoption.
The [canonical Workplace mapping](../workplace-mapping.md) consolidates those associations with external
native arc/card/agent/session contracts and records current namespace and verification limits.

The core and discovery/funding app can share one Worker and storage infrastructure. Their logical ownership remains
separate: funding-provider subscriptions, checkout and discovery are application state; balances, holds and settled
spend are treasury state. A widget never settles or estimates a charge as authoritative cost.

### Record authority and identifiers

| Record | Authority and association |
| --- | --- |
| Native task, attempt, schedule, session and completion | The native system, represented through its external IR/interfaces; publication preserves source identifiers and references |
| Published history and projection | The selected OA server, as acknowledged publications; changing a projection does not change native execution |
| Owner policy and desired state | Verified owner authority through the existing repository-policy and scoped-control contracts; a credential cannot widen bounds |
| Observed operating state | The running system's evidence, published by its adapter |
| Funds, holds, captures and settled cost | One treasury authority for that monetary obligation; mirrored usage and statements do not settle it again |
| Offering, contract and work acceptance in RH2 | RH2 and its contracting parties; OA treasury receipts prove money operations, not work acceptance or seller payout |
| Workplace Room, membership, Conversation and grants | RH2; OA stores its consented association, not a competing workplace membership database |
| Live native resource | Its service or machine custodian; Workplace delegation is verified at the owning service |
| Credentials and secret values | Designated host/service custody; IR and public records carry references, not custody material |

These names identify different objects: identity-provider subject, RH2 principal/organization, OA project/account,
treasury account, native task/session and vendor credential account. Links must carry issuer/deployment and stable
identifiers where relevant; matching display names grant no authority. Sign-in follows
[ADR 0011](0011-people-sign-in-with-a-volter-identity.md); linked-team authority follows ADR 0018. There is no implied
universal account database, cross-deployment key acceptance or permission inheritance between products.

### Interfaces and failure ownership

| Flow | Interface and state owner | Required failure behavior |
| --- | --- | --- |
| Native change to OA publication | External retained source/index/transcript contracts, then SDK intake; adapter owns acknowledged cursors/receipts | A failed or ambiguous publication reconciles/replays by the contract; acknowledge after effects; no invented lifecycle end |
| Owner intent to runtime | Scoped SDK request, then adapter's native control door, then observed-state publication | Preserve desired/observed difference; an unavailable runtime leaves a visible outstanding request |
| Funding and spend | Provider-confirmed funding through application adapters; core treasury reservations and settlement | Ledger facts remain authoritative; reconcile ambiguous provider outcomes; never charge the same obligation twice |
| OA facts to Workplace | Consented integration formats and APIs; OA owns link/condition state, RH2 owns workplace state | Missing configuration or expired consent refuses/reports; replay stable identities; do not broaden grants |
| Native resource to viewer | External Teams/resource-owner contracts under workplace delegation | Enforce target, issuer and grants at the resource owner; a presentation component cannot grant access |
| Render to deployed project | Creator/upgrade lineage, then owner-run start/keeper and selected native runtime | Preserve project changes and report conflicts; lifecycle success and upgrades require their own evidence |

Each concrete protocol must define versions, ordering, replay identities, partial-success behavior, compatibility,
revocation, retention, migration and recovery in its owning contract. This record does not invent a global event
bus, shared transaction, synchronization daemon or identical retry guarantee across all protocols. The durable
partner hold/capture/release contract is [partner reservations](0016-partner-reservations.md), not the older
immediate-charge route. Credit conversion, work closing and payout remain explicit integration responsibilities.

## Existing implementation and remaining scope

Source baseline: repository main `be55319f` plus this architecture proposal, inspected on 2026-10-04. Code presence
below is not deployment evidence; the newly landed records keep their own review/evidence boundaries.

- The SDK and server are in [packages/sdk](../../packages/sdk/README.md) and
  [packages/backend](../../packages/backend/README.md). The backend currently also packages rendering and widgets;
  that packaging is not a separate conceptual responsibility.
- [create-open-autonomy](../../packages/kit-hermes/README.md) has the Hermes and IR kits, shared creator/upgrade
  machinery and host keeper. [ADR 0017](0017-the-ir-native-kit.md) and
  [ADR 0020](0020-the-company-skew-runs-lanes.md) govern the IR/company instantiation. Its directory name
  packages/kit-hermes does not mean every system is Hermes.
- **Current native-kit coupling:** the universal SDK target is not yet the company/IR kit's runtime behavior.
  The [keeper](../../packages/kit-hermes/keeper/start.ts) always invokes
  [applyAgent](../../packages/kit-hermes/base/.open-autonomy/agent.ts), which constructs Hermes extensions and uses
  `hermesDoor`; bare startup resolves `locateHermes` even for Claude Code/Codex profiles. Without Hermes it fails
  before a gateway starts. The [publisher](../../packages/kit-hermes/base/.open-autonomy/publisher.ts) still requires
  `hermes_home`/`HERMES_HOME`, loads `flavor: 'hermes'` and queries Hermes profiles/runs/session inventory alongside
  native worker sessions. OA owns the follow-up to remove this setup/publication coupling from its native IR path,
  using Supercode's owning model/doors and the selected runtime's inventory while preserving SDK receipts, policy
  and controls. [Supercode PR 1074](https://github.com/volter-ai/supercode/pull/1074) fixes Hermes codec fidelity;
  it does not remove this dependency. No decoupling implementation or runtime acceptance is claimed here.
- Kit `3.24.0` adds the company [records register](0022-the-records-register.md): generic tooling lives in
  [packages/kit-hermes/records](../../packages/kit-hermes/records/), while the organization's record repository holds
  its register and entries. [Hookline](../../packages/kit-hermes/base/.open-autonomy/hookline.ts) supplies the configured
  pull-request message adapter. The [company World](../../packages/kit-hermes/skews/company/world/README.md) supplies
  rehearsal configuration/opening data around the install's own start and selected external services. It is distinct
  from OA's cookbook scenario; neither rehearsal's source asserts that a live install is configured or verified.
- [ADR 0021](0021-the-pay-boundary.md) owns the paying runtime's treasurer executor and host-valve custody boundary.
  Bare mode supplies no pay port except a synthetic World rehearsal; a fleet supplies none. OA maintains this kit
  composition around native Hermes dispatch, without moving treasury authority or generic orchestration into it.
- [apps/platform](../../apps/platform/README.md) mounts the public application around the backend;
  [apps/self-host](../../apps/self-host/README.md) mounts the reusable backend. The Workplace integration, retained
  publisher and partner reservation code are present in this baseline. End-to-end coverage remains feature-specific.
- No separate universal OA-engine package, repository split, runtime rewrite or new schema is required by this ADR.
  Consolidating existing OA composition must follow this ownership map and the appropriate specific decisions.
- Self-host participation in official discovery/funding, cross-deployment publication and treasury federation are
  not decided here. No automatic replication, public listing, transfer of funds or acceptance of another deployment's
  keys is implied. A future integration must establish those contracts before enabling them.
- Deployment audience changes are separately proposed in [PR 857](https://github.com/open-autonomy-org/open-autonomy/pull/857)
  and [PR 859](https://github.com/open-autonomy-org/open-autonomy/pull/859). This ADR does not adopt their proposed
  private-by-default behavior or amend the constitution's public-books requirement. Dependent audience changes remain
  held for their own authority and review.

## Alternatives and tradeoffs

- Treat Hermes or Supercode as OA's engine implementation: hides external ownership and makes an instantiation the
  admission gate. Keep native implementations external and OA's project contract universal.
- Put hosting, discovery and treasury in one undifferentiated platform: obscures reusable core versus public-product
  state. Shared implementation/deployment is permitted with explicit responsibility boundaries.
- Rebuild Workplace in OA or make either product know the other's internal records: duplicates workplace authority.
  Use integrations and resource-owning viewers, preserving the existing specific contracts.
- Require a separately published package for every box: introduces packaging work without resolving ownership.
  Logical boundaries are binding; extraction requires its own evidence and decision where material.

Projections and acknowledged copies deliberately duplicate records for different purposes. Duplicated execution
semantics, authoritative monetary settlement or competing grants are not justified by a need to render a view.

## Consequences and constitution review

This is the target responsibility map for future work after repository acceptance. A change moving ownership,
trust, protocol meaning or deployment authority needs a reviewed ADR; feature work records actual implementation
and manual evidence rather than declaring the ecosystem finished. Existing detailed decisions stand.

- **Every spend is metered on public books; settled cents are the only cost.** Treasury retains every spend path,
  reservation and settled receipt. Application funding and external work measurements do not introduce a second
  charge. This record changes no audience or accounting policy.
- **Only the SDK is real.** Project development reaches OA views through the project contract. Supercode is an external
  integration capability, not a mandatory client library or a platform parser of harness files.
- **The platform shows; it does not steer.** Native systems execute work. OA records authorized owner intent and the
  system's observed response; Workplace and widgets do not become a dispatcher.
- **Authority comes from the repository, not a key.** Existing owner policy and bounds remain authoritative. Identity
  naming, linked workplace membership and delegated resource access retain their specific reviewed contracts.
- **Nothing in an agent's reach is a secret beyond its audience.** Host custody, explicit publication audiences and
  resource-owner enforcement stand. Connecting a view grants no broader credential or transcript access.
- **No automated tests; nothing develops against a real API.** This documentation-only decision adds no executable
  behavior, tests or deployment. Implementation claims require manual World evidence under the existing rules.
- **Out of scope.** OA composes external harnesses and provides kits, treasury and presentation. Its hosted backend
  is a deployed API/application service, not project-compute hosting, an OA agent framework or a workflow compiler.

Independent review must assess this map against the current constitution, the owner's scope and the linked
decisions. Owner approval in conversation is not a GitHub review, merge, release or deployment approval.
