# @open-autonomy/sdk

The Open Autonomy SDK: the interface an automation implements to be a project, in both directions. Up, it
reports its own development (the sessions, the timeline, the agent's setup); down, it receives the owner's one
word of control, running or paused, and answers with what is true. Everything a project's page shows about its
agent comes through this wire and nothing through the platform reading a harness's files, so any substrate
can be a project: the Hermes kit and the file roadmap are starters, not the shape. Everything
here is one documented HTTP wire, shown raw below, so any language can do the same without this package.
The Hermes kit vendors it into a generated repository under `.open-autonomy/sdk/`; the kit's own host tools (the
valve that holds the key, the credential handoff, the Codex connection, the Supercode adapter) live beside it and are
documented in the kit's README.

```ts
import { OpenAutonomy } from '@open-autonomy/sdk';

const oa = new OpenAutonomy({ baseUrl: 'https://open-autonomy.org/v1', key: process.env.OPEN_AUTONOMY_KEY! });
const s = await oa.open({ key: 'a3f9c1d2', kind: 'run', source: 'board', item: 'add' });
await s.turns([{ role: 'assistant', tool: 'terminal', args: '{"command":"bun run check"}' }, { role: 'tool', tool: 'terminal', result: 'ok' }]);
await oa.update({ item: 'add', text: 'the store writes; the id counter next', session: s.key });
await s.end({ outcome: 'done', report: 'Done. add — committed 7d30729.', commit: '7d30729' });
```

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
  locally is its own business: the Hermes kit keeps its past in `CHANGELOG.md`, its present on the Hermes board
  with the sessions serving it, and its future in `ROADMAP.md`; an engagement keeps all three in a client's
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
| `GET /v1/accounts/:account/roadmap/revisions?limit=` | the history, newest first |
| `POST /v1/agent/roadmap` `{ source, roadmap, by? }` | an owner-side push on a `steer` key alone; an unchanged roadmap is not a revision. A substrate's own document goes through `POST /v1/agent/events` as `org.open-autonomy.timeline` |

## Rails

Money leaves an account only through a metered rail, and every rail leaves a record on the audit trail
naming itself. The model rail is a stock OpenAI or Anthropic SDK pointed at the platform. The two others
are bounded by the owner in `.open-autonomy/config.yaml` (the platform reads the bounds from the repository) and off until a bound is set:

| Route | What |
|---|---|
| `POST /v1/rails/card` `{ usd_cents, purpose? }` | a single-use virtual card minted against the balance (Stripe Issuing), bounded to the amount and the owner's merchant categories; returns the card's `id`, `last4`, expiry, and `number`/`cvc` where the issuer exposes them. A merchant's authorization is decided in real time, its capture settles as a `card` record (merchant, category, last4), and the card is retired |
| `GET /v1/keys/challenge?funder=<login>` → `POST /v1/keys/mint {funder, repo}` | a funder's key: the claim file in a repository the login owns proves the login; the key can only give |
| `POST /v1/grants/give` `{ to, usd_cents, note?, key?, for? }` (a give key) | grant credits from the funder's books to a project's, once per `key`; `for` may be `"any"`, `"model"`, `{models: [...]}`, or `{item: "id"}`, and absent means unrestricted |
| `GET /v1/funders/:login` | a funder's public books: credits to give (and how much of it is the org's bonus, for other people's projects), given, received |
| `POST /v1/patrons/checkout` `{ account: "@login", tier, interval: "once" }` | a funder buys a credit pack through Polar; the org matches a share as bonus credits |
| `POST /v1/rails/partner` `{ partner, usd_cents, unit?, quantity?, reference? }` | a partner service's metered charge, settled now as a `partner` record, for a partner the owner listed and within the amount the owner set |

Key scopes: `spend` (the rails), `narrate` (the events door: everything the automation says), `steer` (the owner's word: a roadmap push, the operating state). A key minted without
`scopes` carries spend and narrate; `POST /v1/keys/mint {account, scopes: ["steer"]}` mints a driver's key
that spends nothing.

## The wire

All narration is `POST /v1/agent/events` with the project's key as `Authorization: Bearer <key>`, a body
of one CloudEvents 1.0 event or a JSON array of them, applied in order. Secret-shaped text is redacted at
intake; everything accepted is public.

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

`seq` is the offset of the first turn in the session's own order: a retry or a reconnect that replays
offsets already applied is ignored (`idempotent: true` in that event's result), so a reporter that restarts
reads the session back and continues from its `next_seq`. An update's event `id` is its identity when the publisher
chooses one: the same id again answers with the record already held (`idempotent: true`), so a note survives a lost
acknowledgement or a restart without doubling; an update sent without a chosen id is a new update each time. The response is `{ ok, results: [{ id, ok,
session | update, idempotent?, error? }] }`; the first failing event stops the batch.

Every write the client makes (`setup`, `docs`, `timeline`, `reportState`, `pushRoadmap`, `requestState`) answers
the same way: `{ ok, status, error? }`, the platform's error code when refused, plus what the write returned.

`Session.turns()` splits uploads into the wire's 100-turn batches and advances only after the server
acknowledges each offset. Rejected uploads and end events throw; a failed read is not a missing session.
The Hermes kit's `reporting.ts` adapter (a kit file beside this SDK, not part of it) consumes Supercode's message windows and explicit completion records, verifies the already-published prefix and saves acknowledged checkpoints. It never infers completion from silence. History changes that conflict with the append-only destination require reconciliation; they are not silently treated as new offsets.

Public reads, no key:

| Route | What |
|---|---|
| `GET /v1/accounts/:account/sessions?limit=` | the stream, newest first, and `live`: the keys live now |
| `GET /v1/accounts/:account/sessions/:key` | one session with its transcript tail and `next_seq` |
| `GET /v1/accounts/:account/sessions/:key/events` | Server-Sent Events: `turn` (id = offset), `status`; `Last-Event-ID` resumes |
| `GET /v1/accounts/:account/items/:item` | every session, update and settled cent on the item |
| `GET /v1/accounts/:account/items/:item/events` | Server-Sent Events: `item` on change, until nothing is live |
| `POST /v1/agent/events` with type `org.open-autonomy.project.docs` `{ about_md? }` | the project's document, from whatever file the substrate keeps: what it is (the page leads with the first paragraph) |
| `GET /v1/accounts/:account/events` | Server-Sent Events: `project` on change (the books, the live set, the roadmap revision, the operating state as `<desired>/<observed>`); stays open |
| `GET /v1/accounts/:account/state` | the operating state: `desired` `{ state, at, by, reason? }` as the owner requested it, `observed` `{ state, at, note? }` as the automation last reported it; either absent until made |
| `POST /v1/agent/state` `{ state, reason? }` | the owner's word, `running` or `paused`, on a `steer` key: recorded, not applied; an unchanged word is `unchanged: true` |
| `GET /v1/accounts/:account` | the books: balance, spend, runway |
| `GET /v1/accounts/:account/calls?limit=&before=` | the audit trail, every metered spend, newest first |

Keys, the adopter way: `GET /v1/keys/challenge?account=owner/repo` names a claim to commit to
`.open-autonomy-claim` on the default branch; `POST /v1/keys/mint {account, models?}` mints once the file
is at HEAD; `POST /v1/keys/rotate` with the current key mints a successor and leaves the old one a day of
grace, capped by its existing expiry. Rotation works with all three independent credential slots occupied.
Each slot permits one retiring predecessor: another rotation using that old key returns
`key_already_rotated` (409), and rotating its successor before the predecessor expires or is revoked
returns `rotation_grace_pending` (409). Normal minting still refuses a fourth independent credential.
A key is verified by its signature and expiry alone, so it survives every redeploy; the platform's
registry can only revoke it or shorten it.

## Team roster

The project's `team` section in `.open-autonomy/config.yaml` is the shared public roster.
`parseTeamConfig(configText)` returns `{ members }`; `replaceTeamConfig(configText, team)` validates and
updates only that section, preserving other configuration. Import them from `@open-autonomy/sdk/team`
or the kit's vendored `.open-autonomy/sdk/team.ts`. The section contains a JSON value (valid YAML),
written by these helpers; do not convert it into YAML block mappings.

Each member has `id` (a stable record key), `name`, optional `github: { id, login }` and
`discord: { id, name }`, `scopes` and `source`. Platform IDs are decimal strings. Scopes are `owner`,
`direction`, `moderation` and `release-review`; an empty list is a contributor. Every record needs an
account and a source for the identity links and authority. A populated roster needs an owner with a
verified GitHub account. Empty seeded rosters grant nobody authority.

The platform reads this owner configuration from the repository, just as it reads funding bounds; a
narration key cannot replace it. `/:owner/:project/dashboard/team` resolves it through this SDK model. Owners can edit
one member at a time, sign in with GitHub and create a draft PR. The short-lived OAuth flow uses the
human's token only during the callback, never stores it, and never merges or writes the default branch.
GitHub asks for `public_repo` access for this action. The giving page retains its existing sign-in flow.
Current owner IDs and the configuration revision are rechecked before any write. Failed or abandoned
proposals leave the committed roster unchanged; inspect a partially created branch with the team prefix before retrying.

Authority changes need owner-authorized provenance even after merging. Native Discord access and GitHub
release protection are reconciled separately by the setup agent; a roster edit is not release approval.
