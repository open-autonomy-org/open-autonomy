# @open-autonomy/sdk

The Open Autonomy SDK: the interface an automation implements to be a project, in both directions. Up, it
reports its own development (the sessions, the timeline, the agent's setup); down, it receives the owner's one
word of control, running or paused, and answers with what is true. Everything a project's page shows about its
agent comes through this wire and nothing through the platform reading a harness's files, so any substrate
can be a project: the Hermes kit and the file roadmap are starters, not the shape. Everything
here is one documented HTTP wire, shown raw below, so any language can do the same without this package.
The Hermes kit vendors it into a generated repository under `.open-autonomy/sdk/`; the kit's own host tools (the
valve that holds the key, the credential handoff, the Codex connection, the Volter Harness adapter) live beside it and are
documented in the kit's README.

```ts
import { OpenAutonomy } from '@open-autonomy/sdk';

const oa = new OpenAutonomy({ baseUrl: 'https://open-autonomy.org/v1', key: process.env.OPEN_AUTONOMY_KEY! });
const s = await oa.open({ key: 'a3f9c1d2', kind: 'run', source: 'board', item: 'add' });
await s.turns([{ role: 'assistant', tool: 'terminal', args: '{"command":"bun run check"}' }, { role: 'tool', tool: 'terminal', result: 'ok' }]);
await oa.update({ item: 'add', text: 'the store writes; the id counter next', session: s.key });
await s.end({ outcome: 'done', report: 'Done. add — committed 7d30729.', commit: '7d30729' });
```

## Implementer checklist

The SDK is the protocol a project implements, not a required TypeScript dependency or runtime. The
[ecosystem target](../../docs/decisions/0022-ecosystem-target-architecture.md) assigns native execution to the
running system and publication and treasury enforcement to its selected OA server. This checklist consolidates
the existing wire below; the server does not issue a conformance certificate or negotiate a capability set.

| Capability | Requirement and evidence |
|---|---|
| Account authority | Required. Connect to the selected deployment with a key for the intended account, proved by the existing GitHub repository claim. Committed owner policy and money bounds remain authoritative; possession of a key cannot widen them. |
| Metered spending | Required whenever project funds are spent. Use the configured rails and their settled receipts; local usage attribution or a widget is not another charge or an authoritative estimate. |
| Development publication | Required for information shown about development. Publish supported sessions, timeline items, setup and documents through this wire. Map native identities and evidence, state omissions and unsupported capabilities, and apply publication policy before intake; this is a projection, not an export of the complete native system. |
| Owner control | Required to claim control support. Read effective desired state, apply it through the system's own control door, and report observed state only when true. Name the scope of pause; an absent report stays unknown and an unavailable or unsupported control must not produce a success report. |
| Tracker drivers | Conditional on the chosen source. Preserve the driver's `CONFORMANCE` and its native reconciliation limits; an item projection does not itself update or complete a native task. |
| Funding, card and partner operations | Conditional on enabled integrations and the caller's authority. Provider checkout is application behavior; treasury receipts establish money operations, not work acceptance or seller payout. Use the partner reservation contract below when holding funds until work closes. |
| Owner statements and org control | Conditional on those features. Use the scoped owner routes; a narration key cannot publish the owner's word. An org's inherited pause remains distinct from a project's own request. |

For each implemented capability, retain source identity, attribution, publication receipts and the relevant native
evidence. Never infer an end, completion, authorization or successful control from silence, a failed read, an
elapsed interval or a missing record. A partial integration should describe what it supports and leaves unknown;
the wire has no `unsupported` operating-state value to substitute for `running` or `paused`.

### Versions and compatibility

| Version | What it identifies |
|---|---|
| HTTP `/v1` | The OA route namespace documented here; it is not an npm version or an automatic compatibility negotiation. |
| CloudEvents `specversion: "1.0"` | The event envelope accepted by intake; event `type` selects the OA operation. |
| Timeline `schema: "open-autonomy.timeline.v1"` | The SDK's normalized timeline format, distinct from the event envelope and the native source format. |
| Native IR and interface versions | External source contracts, consumed by the adapter. They do not become OA wire versions or require every project to use Supercode. |
| npm SDK version | The reference client's release, currently 4.0.0. An implementation in another language speaks the same wire without this package. |

Compatibility must be checked for the concrete operations in use against the selected server. Unknown event types
are refused with `unknown_event_type`; a wrong CloudEvents envelope is `invalid_cloudevent`. Do not assume that
changing a schema label enables a new server capability. Keep unsupported source fields in the native system or
describe their omission, rather than silently claiming a lossless mapping. No cross-deployment key acceptance,
publication replication or treasury federation is supplied by these version labels.

## The model

- **A session** is one agent conversation: a `kind` (`run` is a scheduled run, the funded work; `chat`
  anything else), the roadmap `item` it serves when known, a `source` (the schedule job's name, a channel).
  It opens, its turns append with an offset, and it ends with an optional outcome: a run has a verdict
  (`done` | `failed`), a chat does not. Several can be live at once.
- **An update** is a short progress note on an item, optionally from a session.
- **The operating state** is the one word of control, `running` or `paused`, in each direction. The owner requests it on
  a `steer`-scoped key; the automation reads the request, applies it through its own machinery (the platform names no
  method: not a scheduler, not a queue, not an interruption), and reports the state once it is true of itself. The
  platform keeps the request and the answer apart and shows both: unrequested means running, unreported means unknown.
  The Hermes kit's answer to `paused` is that the scheduled runs stop and a run in flight finishes; a channel still answers.
- **The timeline** is one normalized document per project: every item of work the project has done, is doing
  or intends, in one language, whatever holds it natively. An item has a tense, past, present or future, a
  status within it, when it entered each, the release that shipped it or will, who, its proof (a commit), and its
  links, typed and as many as the publisher knows: the ticket that asked, the issue, the pull request, the branch, the
  recording, the roadmap section. The page's views (a board, a list, the timeline by month, the past by release) are sorts and
  groupings over that one document, never edits: the platform shows, it does not steer. What a substrate keeps
  locally is its own business: the Hermes kit keeps its past in [CHANGELOG.md](../kit-hermes/skews/self-build/CHANGELOG.md), its present on the Hermes board
  with the sessions serving it, and its future in [ROADMAP.md](../kit-hermes/skews/self-build/ROADMAP.md); an engagement keeps all three in a client's
  tracker. Unifying those into the one language is the job of that substrate's SDK implementation, the reporter
  or a driver, and of nothing on the platform (owner ruling, 2026-09-08). A substrate publishes the whole document
  on the events door (`org.open-autonomy.timeline`, `timeline()`); the books keep it revisioned. The wire still
  calls the document the roadmap in its routes.

Spend is attributed by the platform: Hermes names its session on each model request, so overlapping sessions
each receive their own settled calls and cents and an item's page shows everything that touched it.

## Drivers

The platform holds one normalized roadmap per project, revisioned: who, when, from which source, what
changed. Substrates feed it: a reporter publishing its document on the events door, or an owner-side driver. `github-milestones` is the
repository's milestones, pulled on sync with no credential (`fromMilestones`); it is the only source the platform pulls. `jira` is the project's
epics, read owner-side where the credential is and pushed with `pushRoadmap` on a `steer`-scoped key
(`fromJira`). Each driver declares its conformance, what its tracker cannot express (`CONFORMANCE`), and a
reconcile plan carries a finished item back to the native side (`milestoneChanges`, `jiraChanges`). The
agent is tracker-blind: whatever the source, it works its own queue and narrates the item and its outcome.

| Route | What |
|---|---|
| `GET /v1/accounts/:account/roadmap` | the current revision: `revision`, `ts`, `source`, `by`, `roadmap`, `changes`, `conformance` |
| `GET /v1/accounts/:account/roadmap/revisions?limit=&before=` | the history, newest first; `next`, when there is more, is the `before` of the page after (`roadmapRevisionPage`) |
| `POST /v1/agent/roadmap` `{ source, roadmap, by? }` | an owner-side push on a `steer` key alone; an unchanged roadmap is not a revision. A substrate's own document goes through `POST /v1/agent/events` as `org.open-autonomy.timeline` |

## Rails

Money leaves an account only through a metered rail, and every rail leaves a record on the audit trail
naming itself. The model rail is a stock OpenAI or Anthropic SDK pointed at the platform. The two others
are bounded by the owner in `.open-autonomy/config.yaml` (the platform reads the bounds from the repository) and off until a bound is set:

| Route | What |
|---|---|
| `POST /v1/rails/card` `{ usd_cents, purpose? }` | a single-use virtual card minted against the balance (Stripe Issuing), bounded to the amount and the owner's merchant categories; returns the card's `id`, `last4`, expiry, and `number`/`cvc` where the issuer exposes them. A merchant's authorization is decided in real time, its capture settles as a `card` record (merchant, category, last4), and the card is retired |
| `GET /v1/keys/challenge?funder=<login>` → `POST /v1/keys/mint {funder, repo}` | a funder's key: the claim file in a repository the login owns proves the login (an organization's only in `<org>/.github`, where `scopes: ["steer"]` mints the org's steer key instead, ADR 0010); the key can only give |
| `POST /v1/grants/give` `{ to, usd_cents, note?, key?, for? }` (a give key) | grant credits from the funder's books to a project's, once per `key`; `for` may be `"any"`, `"model"`, `{models: [...]}`, or `{item: "id"}`, and absent means unrestricted |
| `GET /v1/funders/:login` | a funder's public books: credits to give (and how much of it is the org's bonus, for other people's projects), given, received; a flow with a project not listed where everyone looks carries `private: true` and no name, id, note or purpose, its amount kept |
| `POST /v1/patrons/checkout` `{ account: "@login", tier, interval: "once" }` | a funder buys a credit pack through Polar; the org matches a share as bonus credits |
| `POST /v1/rails/partner` `{ partner, usd_cents, unit?, quantity?, reference? }` | a partner service's metered charge, settled now as a `partner` record, for a partner the owner listed and within the amount the owner set |

Key scopes: `spend` (the model rail), `pay` (the card and partner rails), `narrate` (the events door: everything the automation says), `steer` (the owner's word: a roadmap push, the operating state, the owner's statements and spending freeze), and `give` (grant credits from the funder's own account). A key minted without
`scopes` carries spend and narrate; `POST /v1/keys/mint {account, scopes: ["steer"]}` mints a driver's key
that spends nothing.

## The wire

All narration is `POST /v1/agent/events` with the project's key as `Authorization: Bearer <key>`, a body
of one CloudEvents 1.0 event or a JSON array of them, applied in array order. The authenticated key selects
the account, not an event field. Secret-shaped text is redacted at intake; publication policy must still
exclude material that should not be sent. Read access follows the existing panel policy below; intake
does not provide a per-event audience field or safe custody for private transcripts or credentials.

```json
[{ "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "2026-09-04T00:20:11Z",
   "type": "org.open-autonomy.session.started", "subject": "<session key>",
   "data": { "session_kind": "run", "source": "board", "title": "…", "item_id": "add" } },
 { "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "…",
   "type": "org.open-autonomy.session.turns", "subject": "<session key>",
   "data": { "seq": 0, "item_id": "add", "turns": [
     { "ts": "…", "role": "user", "text": "…" },
     { "ts": "…", "role": "assistant", "tool": "terminal", "args": "{…}" },
     { "ts": "…", "role": "tool", "tool": "terminal", "result": "…" },
     { "ts": "…", "role": "assistant", "text": "…" } ] } },
 { "specversion": "1.0", "id": "t_add:review:0:approved", "source": "my-reporter", "time": "…",
   "type": "org.open-autonomy.item.update", "subject": "<item id>",
   "data": { "text": "review approved by the reviewer", "session": "<session key>" } },
 { "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "…",
   "type": "org.open-autonomy.agent.setup", "subject": "agent",
   "data": { "harness": "hermes", "persona": "…", "model": "zai/glm-5.3-flash", "schedule": [{ "name": "pm", "schedule": "every 60m" }], "skills": ["pm", "develop"], "setup_md": "…",
             "runtime": { "mode": "container", "kit": "2.11.0", "executor": "todo-cli-agent:local", "host": "workshop" } } },
 { "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "…",
   "type": "org.open-autonomy.agent.state", "subject": "agent",
   "data": { "state": "paused", "note": "scheduled runs paused: pm, community" } },
 { "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "…",
   "type": "org.open-autonomy.timeline", "subject": "project",
   "data": { "source": "hermes", "roadmap": { "schema": "open-autonomy.timeline.v1", "items": [] } } },
 { "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "…",
   "type": "org.open-autonomy.session.ended", "subject": "<session key>",
   "data": { "outcome": "done", "report": "…", "commit_sha": "7d30729", "item_id": "add", "ended_at": "…" } }]
```

The response is `{ ok, results: [{ id, ok, session | update | revision, idempotent?, unchanged?, error? }] }`;
the first failing event stops the batch. Replay behavior depends on the operation, as below.

### Delivery, identities and receipts

- Keep session keys stable within an account (nonempty, at most 200 characters, no `:`). A repeated start
  returns the existing session; turn replay uses `seq`, not the CloudEvents `id`. Use one serialized uploader
  per session, read `next_seq` after ambiguous results, and compare the acknowledged transcript before appending.
- Send at most 100 turns per event. The server normalizes turns and retains the latest 400, with `next_seq`
  tracking the offset beyond that tail. A lower starting offset is ignored as a replay without checking content;
  a higher offset is accepted as a gap. These are not server guarantees of contiguous or identical history.
  The reference client requires an acknowledged offset matching each submitted batch and throws if reconciliation is needed.
- Give an update a stable, nonblank event `id` of at most 200 characters, unique across that account's updates.
  Reusing it returns the first stored update, even if the new payload or item differs. Reuse it for the same
  effect only. Other event types do not acquire a universal deduplication guarantee from a CloudEvents `id`.
- A batch is not a transaction: earlier effects can remain when a later event fails. Returned operation refusals
  return accumulated `results`; envelope/type validation can instead return a top-level error after prior effects.
  Reconcile ambiguous outcomes using each operation's read and replay rules, not a new identity for the same effect.
- Setup and project documents replace their current representation. Timeline publications are whole documents
  with revision semantics; unchanged content/source is not a new revision. Observed state history records state
  changes. Partner and grant replay rules are their own contracts, not extensions of session offsets.

Do not advance local receipts on a refusal, incomplete acknowledgement or failed read. `send()` exposes HTTP
status, top-level errors and per-event results; network failures can throw without proving whether an effect
landed. The client does not automatically retry every operation. Persist acknowledged progress and reconcile
before retrying. Server-Sent Events resume session turns by offset and expose the retained transcript tail;
they are not a durable global event log or a full native transcript archive.
These behaviors are implemented by the [reference client](src/client.ts),
[event intake](../backend/src/stream.ts) and [ledger](../backend/src/ledger.ts).

The publication and control methods (`setup`, `docs`, `timeline`, `reportState`, `pushRoadmap`, `requestState`) answer
the same way: `{ ok, status, error? }`, the platform's error code when refused, plus what the write returned.

Intake refuses an invalid, expired or revoked credential with 401 `auth_failed`, and missing narration
scope with 403 `scope_required`. A top-level refusal uses `{ error: { code, ... } }`; an operation's result
can instead carry an error string. Read failures throw `ReadError(status, code)` in the reference client.
A closed panel returns 404 `not_open`, not proof that the native record is absent; `session()` returns
`undefined` for other 404 responses and throws for `not_open` and other failed reads. `update()` returns
the acknowledged update or `undefined`; session open, turns and end reject failed acknowledgements.

`Session.turns()` splits uploads into the wire's 100-turn batches and advances only after the server
acknowledges each offset. Rejected uploads and end events throw; a failed read is not a missing session.
The Hermes kit's `reporting.ts` adapter (a kit file beside this SDK, not part of it) consumes Volter Harness's message windows and explicit completion records, verifies the already-published prefix and saves acknowledged checkpoints. It never infers completion from silence. History changes that conflict with the append-only destination require reconciliation; they are not silently treated as new offsets.

Reads and related publication/owner routes:

Anonymous reads are subject to the panel policy below; the POST routes still require their stated scopes.

| Route | What |
|---|---|
| `GET /v1/accounts/:account/sessions?limit=&before=` | the stream, newest first, and `live`: the keys live now; `next`, when there is more, is the `before` of the page after, so a reader can take every session of a period (`sessions`) |
| `GET /v1/accounts/:account/sessions/:key` | one session with its transcript tail and `next_seq` |
| `GET /v1/accounts/:account/sessions/:key/events` | Server-Sent Events: `turn` (id = offset), `status`; `Last-Event-ID` resumes (`follow()` iterates them) |
| `GET /v1/accounts/:account` | the books: the balance, what came in and went out, the burn, the runway, the owner's bounds (`funding()`) |
| `GET /v1/accounts/:account/calls?limit=` | every metered call, newest first (`calls()`) |
| `GET /v1/accounts/:account/items/:item` | every session, update and settled cent on the item |
| `GET /v1/accounts/:account/items/:item/events` | Server-Sent Events: `item` on change, until nothing is live |
| `POST /v1/agent/events` with type `org.open-autonomy.project.docs` `{ about_md? }` | the project's document, from whatever file the substrate keeps: what it is (the page leads with the first paragraph) |
| `GET /v1/accounts/:account/events` | Server-Sent Events: `project` on change (the books, the live set, the roadmap revision, the operating state as `<desired>/<observed>`); stays open |
| `GET /v1/accounts/:account/state` | the operating state: `desired` `{ state, at, by, reason?, from? }` as the owner requested it, `observed` `{ state, at, note? }` as the automation last reported it; either absent until made. A project inherits its org's pause: while `@<owner>` is paused and the project's own word is not, `desired` is the org's with `from: "@<owner>"`, and the project's own record is beside it as `own` |
| `POST /v1/agent/statement` `{ id, title, source, as_of, badges, body_md? }` | a statement of the owner's (ADR 0012), on a project's `steer` key: a tool the owner runs (Evidence Desk's compliance status is the first) publishes its word about the project, shown in the dashboard's rail under "Stated by the owner", on its page and as a README badge row. The platform knows no framework: `badges` are `{ label, message, tone, until }` with `tone` one of `positive`, `info`, `neutral`, `warning`, `negative`, and every badge lapses after its `until` (a `YYYY-MM-DD`, UTC). At most five statements, eight badges each. Refused: `invalid_statement` (with the `field`), `lapsed_on_arrival`, `statement_limit`, `not_a_project` for an org's key. An identical publication is `unchanged: true`; any other, and `DELETE /v1/agent/statement/:id`, is a revision. `publishStatement`, `withdrawStatement`; `checkStatement` in `@open-autonomy/sdk/statements` checks one before sending |
| `GET /v1/accounts/:account/statements` · `…/statements/:id/revisions?limit=&before=` · `…/statements/:id/badges.svg` | the live statements (each with `badges` standing today and `lapsed` past their `until`), every change of one newest first (`next`, when there is more, is the `before` of the page after), and its badge row for a README; behind the owner's `statements` panel (public unless the project is private). `statements`, `statementRevisions`, `statementRevisionPage` |
| `POST /v1/agent/state` `{ state, reason? }` | the owner's word, `running` or `paused`, on a `steer` key: recorded, not applied; an unchanged word is `unchanged: true`. On an org's key (`@<org>`, minted through `<org>/.github`) it is the org's word, which every project of the org inherits |
| `GET /v1/accounts/:account/state/history?limit=&before=` | every request of the owner's word (who, when, why; `unchanged` when it asked for the state that already held; `from` the org when it was the org's word) and every change of state the automation reported, newest first, paged like the sessions (`stateHistory`). A project's history holds its org's requests; an org's own history is its steer key's to read |
| `GET /v1/orgs/:org` | an org at a glance: its own `desired`, its `bounds` (the `spend.limits` of `<org>/.github/.open-autonomy/config.yaml`, used by every project of the org together), and each project whose overview is open to everyone, with its effective `control`, its balance, burn, runway and funding only when its books are open to everyone, and its live sessions only when its sessions are. On the org's own steer key: every project of the org, with every figure |
| `GET /v1/accounts/:account` | the books: balance, spend, runway |
| `GET /v1/accounts/:account/calls?limit=&before=` | the audit trail, every metered spend, newest first |

Money travels with the books: a door open wider than the books answers without its `*usd_cents` figures to a viewer the books do not admit. Every read door of a project answers according to the owner's word on visibility (the `dashboard:` block of its `.open-autonomy/config.yaml`, a preset then a role per panel): the roadmap and an item are the `work` panel, the session list and the account's event stream the `sessions` panel, a session and its event stream the `transcripts` panel, the metered calls the `calls` panel, the funding figures and the runway and activity widgets the `books` panel, the now widget and the operating state the `overview` panel, the owner's statements and their badge rows the `statements` panel. A panel closed to the public answers 404 unless the request carries the project's own key or, on a deployment with a sign-in, a viewer on its roster whom the panel admits. The default preset, `roadmap`, keeps sessions, transcripts and the agent's setup to the team.

Keys, the adopter way: `GET /v1/keys/challenge?account=owner/repo` names a claim to commit to
`.open-autonomy-claim` on the default branch; `POST /v1/keys/mint {account, models?}` mints once the file
is at HEAD; `POST /v1/keys/rotate` with the current key mints a successor and leaves the old one a day of
grace, capped by its existing expiry. Rotation works with all three independent credential slots occupied.
Each slot permits one retiring predecessor: another rotation using that old key returns
`key_already_rotated` (409), and rotating its successor before the predecessor expires or is revoked
returns `rotation_grace_pending` (409). Normal minting still refuses a fourth independent credential.
A key's signature and expiry survive redeploys; authenticated routes also check the platform's registry,
which can revoke it or shorten its life, including rotation grace. Keys from another deployment are not
accepted merely because they name the same account.

## Team roster

For a project without a Workplace link, `team` in `.open-autonomy/config.yaml` is the shared public roster.
A linked project instead uses Workplace's verified seats and team roles; unlinking restores this committed roster
([ADR 0018](../../docs/decisions/0018-the-workplace-integration.md)). This does not replace the GitHub repository
claim or permit a key to widen committed bounds.
`parseTeamConfig(configText)` returns `{ members }`; `replaceTeamConfig(configText, team)` validates and
updates only that section, preserving other configuration. Import them from `@open-autonomy/sdk/team`
or the kit's vendored `.open-autonomy/sdk/team.ts`. The section contains a JSON value (valid YAML),
written by these helpers; do not convert it into YAML block mappings.

Each member has `id` (a stable record key), `name`, optional `github: { id, login }` and
`discord: { id, name }`, `scopes` and `source`. Platform IDs are decimal strings. Scopes are `owner`,
`direction`, `moderation` and `release-review`; an empty list is a contributor. Every record needs an
account and a source for the identity links and authority. A populated roster needs an owner with a
verified GitHub account. Empty seeded rosters grant nobody authority.

What a member gives is the member's own word, recorded beside their authority (ADR 0013); every field is optional and
nothing is assumed where it is absent. `roles` are the project's own names for the work they take on (up to ten,
lowercase with hyphens). `contributes` names what they give in the project's own words, the same form as roles:
`time`, and each resource they bring (a `machine` the project's Open Autonomy runs on, a `gpu`, a `domain`).
`availability` is `{ tz, windows }`: an IANA time zone and up to fourteen weekly windows `{ days, from, to }`, days
`mon`…`sun`, `HH:MM` with `from` before `to` (a window past midnight is two). A member who leaves is removed.

The platform reads this owner configuration from the repository, just as it reads funding bounds; a
narration key cannot replace it. `/:owner/:project/dashboard/team` resolves it through this SDK model. Owners can edit
one member at a time, sign in with GitHub and create a draft PR. The short-lived OAuth flow uses the
human's token only during the callback, never stores it, and never merges or writes the default branch.
GitHub asks for `public_repo` access for this action. The giving page retains its existing sign-in flow.
Current owner IDs and the configuration revision are rechecked before any write. Failed or abandoned
proposals leave the committed roster unchanged; inspect a partially created branch with the team prefix before retrying.

Authority changes need owner-authorized provenance even after merging. Native Discord access and GitHub
release protection are reconciled separately by the setup agent; a roster edit is not release approval.

## Seams

The project's `seams` section in `.open-autonomy/config.yaml` declares where people act
([ADR 0008](../../docs/decisions/0008-human-seams.md)): each seam's `id`, the roster `scope` that may act there, the `door`
its acts go through (`commit`, `code-host-gate` or `platform-key`; chat is never a door) and where its acts are
`record`ed, plus `vendor_accounts` (`id`, `vendor`, `account`) whose administrators are people in scope. It is a JSON
value like `team`. `parseSeamsConfig(configText)` returns the declaration or `null` when there is none, and refuses
unknown fields, any scope but `owner`, `direction` and `release-review` (moderation grants no decision authority)
and any other door. Import it from `@open-autonomy/sdk/seams` or
the kit's vendored `.open-autonomy/sdk/seams.ts`. `create-open-autonomy check` also reports a seam whose scope no roster
member holds.

### Partner reservations

A treasury-funded service can hold money until work closes through the account's **pay** key.
The payer is the key's account; body fields cannot select another account. Enable
`rails.partner.max_usd_cents` and list the service in `rails.partner.partners` in the owner's
committed `.open-autonomy/config.yaml`. A default developer key cannot use these doors.

| Door | Body | Result |
|---|---|---|
| `POST /v1/rails/partner/reservations` | `{ partner, key, reference, credits, usd_cents_per_credit, usd_cents, item? }` | hold funds without a charge |
| `GET /v1/rails/partner/reservations/:partner/:key` | — | the current immutable receipt for this payer |
| `POST /v1/rails/partner/reservations/:partner/:key/capture` | `{ credits, usd_cents }` | one bounded charge; release the unused remainder |
| `POST /v1/rails/partner/reservations/:partner/:key/release` | `{}` | release the full hold without charging |

Responses are `{ ok: true, reservation }`, or `{ ok: false, error, ...details }` with an HTTP
refusal status. The reservation includes `account`, `partner`, `recipient` (the service id),
`key`, `reference`, `request_id`, the original quote, `status` (`held`, `captured`, `released`),
`created_at`, and, after close, `closed_at` and captured cents/credits when applicable, or
`closed_by: "operator"` when the platform operator released an abandoned hold.
`request_id` joins the captured receipt to the project's public calls.

Credits, cents per credit and cents must be positive safe integers with an exact product:
10 credits at 2 cents per credit holds 20 cents. Capture uses the frozen rate and can charge
up to the held credits, once; 6 credits captures 12 cents and returns 8 cents to spendable funds.
Use release for zero-cost closure or cancellation. Conversion is explicitly agreed at supplier
enrollment; OA never assumes RH2's credit denomination. The work reference is required and
retained on the public charge; optional `item` attributes it to a published roadmap item.

The identity is `(account, partner, key)`; a caller key is 1–120 ASCII letters, digits, `.`, `_`,
or `-`, starting with a letter or digit. Use a stable Task/posting identity, never a fresh key
on retry. Identical creates or terminal replays return the existing receipt, including after
restart. A different quote/capture for the same identity returns 409 `key_conflict`; the opposite
terminal operation returns 409 `reservation_closed`. A GET with another account's key returns
404. Lost responses are reconciled by GET and retrying the same operation. Holds have no timeout;
UTC rollover, model reservation garbage collection, key rotation and worker restart retain them.
A new pay key for the same account can finish or read old holds. Disabling the rail prevents new
holds and still allows the payer to finish existing obligations. Outstanding holds continue to
count against the balance, envelopes and owner spend limits. They count against the global daily
capacity only on the UTC day they were made.

RH2 owns enrollment, buyer close/cancel authority, and deciding whether funding is grants-only,
prepaid or directly treasury-funded. Grants-only work never calls these doors; prepaid funding
must never be billed a second time. A capture meters the named service's charge; it does not
transfer funds to a seller or assert a seller payout. The older `POST /v1/rails/partner` remains
immediate and unkeyed; RH2’s legacy supplier consume door is not an OA route. See
[the lifecycle decision](../../docs/decisions/0016-partner-reservations.md).
