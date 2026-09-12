# ADR 0005: The SDK is the interface and nothing else

Status: Proposed. Accepted only upon independent review against the constitution and merge of this
record with its implementation.

## Context and sources

After ADR 0003 gave the SDK its one word of control, the owner asked whether the SDK was "as close to
perfect as it can be" and, on the review's findings, said "go" (coding conversation, September 12, 2026;
no public permalink; these quotations record scope, not independent approval). The bar the owner had
set the day before: the SDK is what an arbitrary automation implements to be a project, "a few points
of integration at exactly the right level of abstraction", with tasks and sessions as the reporting
spine and the platform's abstractions kept simple.

Against that bar the package was not there. It mixed three audiences: the automation's interface (the
client, the timeline codec), the owner's tooling (drivers, the roster model, four hand-rolled parsers
of `.open-autonomy/config.yaml`) and host tooling with no part in the interface (the valve, the
credential handoff and browser capture, the Codex app-server connection, the Supercode adapter). Its
one dependency was Supercode's harness SDK, Hermes machinery inside the universal package. The
timeline reached the platform through a route of its own that accepted either a narrate or a steer
key, while everything else the automation says went through the events door. The `item.task` event
carried the Hermes board's lanes, attempts, review verdicts and handoffs, although the constitution
says the board is one starter the kit makes, not a shape the platform knows. Client writes answered
inconsistently: some a bare boolean, some a status and an error code.

## Decision

- **One door up, one door down.** Everything the automation says travels on the events door,
  `POST /v1/agent/events`, on a `narrate` key: sessions, updates, the agent's setup, the project's
  documents, the operating state and now the timeline (`org.open-autonomy.timeline`, subject
  `project`). Everything the owner says travels on `steer` keys: `POST /v1/agent/roadmap` (an owner-side
  driver's push) and `POST /v1/agent/state`. A narrate key is refused on the roadmap route; the valve,
  which holds the agent's key, no longer forwards it.
- **Every write answers alike.** `{ ok, status, error? }`, the platform's error code when refused,
  whether the refusal came before any event was read (no key, a wrong scope) or in an event's result,
  plus whatever the write returned (a revision, an update record).
- **The package is the interface.** `@open-autonomy/sdk` keeps the client, the timeline codec and
  drivers, the roster model and the key helpers, and depends on nothing. Its README is the wire any
  language can speak. It publishes no binary.
- **The host tools are the kit's.** The valve, the credential handoff, the Codex connection and the
  Supercode adapter are kit-owned files under a generated repository's `.open-autonomy/`, beside the
  vendored SDK, run with Bun from the checkout, exactly where the bare start script already ran the
  valve from (`.open-autonomy/sdk/valve.ts` before, `.open-autonomy/valve.ts` now). Their dependency
  (Supercode) was already declared in that directory's own `package.json`.
- **The owner's config is the platform's to read.** The parsers of the owner's committed bounds (the
  rails, the models, the spend limits, the roadmap source) are the backend's (`packages/backend/src/config.ts`).
  The roster model stays in the SDK because the platform's page and the kit's scrum both read it; it is
  a shared model of the owner's committed word, like the timeline codec.
- **The board is not a shape the platform knows.** The `item.task` event is gone. A task's lane is the
  timeline item's status, its attempts are the sessions serving the item, and what the timeline cannot
  say, a review's verdict and an attempt's handoff, is a progress note on the item, the update the wire
  already has, published once each by the kit's reporter and remembered in its state file. The item
  page's board panel went with the event. `agent.setup` stays as it is: already flat; what remains
  Hermes-flavored there is vocabulary, not structure.
- **One name for one thing.** The books' exhausted-balance flag is `exhausted`, no longer a second
  meaning of `paused` (landed separately as the first step of this change).

## Alternatives and tradeoffs

- Keep the roadmap route as the narration door for the timeline. Rejected: two doors for what the
  automation says, with one of them accepting the owner's key too, is the kind of seam an implementer
  has to be told about. The route name stays `roadmap` (owner ruling of 2026-09-08 on the wire's word).
- Keep the host tools in the SDK as separate exports. Rejected: an implementer of the interface in
  another language would still be handed a package whose largest files and only dependency are one
  kit's machinery.
- Keep `item.task` and slim it. Rejected: nothing in it survives the question "what does the timeline
  and the item's sessions not already say?" except two notes, and the wire already has notes.
- A separate `@open-autonomy/host` package for the tools. Not now: the kit already vendors and refreshes
  files into every generated repository through `upgrade`; a second package would be a second path to
  keep coherent for the same files.

## Consequences

- SDK 3.0.0: the exports `./rails`, `./credentials`, `./codex-auth`, `./reporting` and the two binaries
  are gone; `./roadmap`, `./client`, `./drivers`, `./team` remain. Kit 2.10.0 refreshes generated
  repositories; this repository's own install and the todo-cli cookbook are refreshed in the same change.
  Backend 0.3.0 reads the owner's config through its own module.
- An installed reporter older than this change still publishes sessions to a platform newer than it; its
  timeline push goes to the roadmap route and is refused until the install is upgraded, which the reporter
  logs. A platform older than this change refuses the new timeline event type until it is deployed; the
  deploy is a human-cut tag, as always.
- Automated tests that covered the moved code are deleted rather than moved, per the constitution; the
  backend smoke file is left exactly as main has it.
- Nothing here changes metering, credentials, the account tree, the balance hard-stop or what the agent can
  reach: the valve ran from the checkout before and runs from the checkout now.

## Relationship to earlier records

[ADR 0001](0001-runtime-boundary.md) stands: the valve and the reporter stay on the host, outside the
agent's credential boundary; this record moves their source files between packages, not between trust
domains, and the bare start script spawned them from the checkout before and after. [ADR 0002](0002-world-scenario.md)
stands: verification is an ordinary World scenario, used here. [ADR 0003](0003-operating-state-through-the-sdk.md)
stands and is completed by this record: the two-way interface it began now has one door in each direction.

## Constitution review

- *Only the SDK is real.* Strengthened: the timeline, like everything else the page shows, arrives on the
  one narration door; the platform reads no harness file and knows no board.
- *The platform shows; it does not steer.* Preserved: the platform records the owner's steer and shows
  the automation's answer; the steer door is the owner's alone and the agent's valve cannot reach it.
- *Authority comes from the repository, not from a key.* Preserved: a narrate key can no longer replace
  the roadmap through the owner's route; the owner's bounds are read from the repository by the platform's
  own parser.
- *Nothing in an agent's reach is a secret that matters.* Preserved: the key stays in the valve, on the host.
- *No automated tests.* Followed: tests deleted, none added, none run; verification is by hand in the
  world at the exact head, recorded in the pull request.
- *Every spend is metered; the ledger's settled cents are the only cost.* Untouched.
