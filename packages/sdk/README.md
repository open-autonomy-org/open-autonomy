# @open-autonomy/sdk

The Open Autonomy SDK: how a project reports its own development to the platform, and the roadmap model
every kit writes. Everything it does is one documented HTTP wire, shown raw below, so any language can do
the same without this package. The Hermes kit vendors it into a generated repository under
`.open-autonomy/sdk/`.

```ts
import { OpenAutonomy } from '@open-autonomy/sdk';

const oa = new OpenAutonomy({ baseUrl: 'https://open-autonomy.org/v1', key: process.env.OPEN_AUTONOMY_KEY! });
const s = await oa.open({ key: 'cron_build-roadmap_20260904_0020', kind: 'run', source: 'build-roadmap', item: 'add' });
await s.turns([{ role: 'assistant', tool: 'terminal', args: '{"command":"bun run check"}' }, { role: 'tool', tool: 'terminal', result: 'ok' }]);
await oa.update({ item: 'add', text: 'the store writes; the id counter next', session: s.key });
await s.end({ outcome: 'done', report: 'Done. add — committed 7d30729.', commit: '7d30729' });
```

## The model

- **A session** is one agent conversation: a `kind` (`run` is a scheduled run, the funded work; `chat`
  anything else), the roadmap `item` it serves when known, a `source` (the schedule job's name, a channel).
  It opens, its turns append with an offset, and it ends with an optional outcome: a run has a verdict
  (`done` | `failed`), a chat does not. Several can be live at once.
- **An update** is a short progress note on a roadmap item, optionally from a session.
- **The roadmap** is `ROADMAP.yml` in the project's git. This package reads it into a typed shape and writes
  it back byte for byte (`parseRoadmap`, `serializeRoadmap`, `withStatus`, `renderRoadmap`); the platform's
  page parses through the same code. There is no write API: the file in git is the only roadmap surface.
  Adapters that mirror it to a tracker are what the shape is for.

Spend is attributed by the platform: a metered call settles on the one session live at that moment, so
an item's page shows every session, update and settled cent that touched it.

## Drivers

The platform holds one normalized roadmap per project, revisioned: who, when, from which source, what
changed. Drivers feed it. `file` (the default) is ROADMAP.yml pulled on sync. `github-milestones` is the
repository's milestones, pulled on sync with no credential (`fromMilestones`). `jira` is the project's
epics, read owner-side where the credential is and pushed with `pushRoadmap` on a `steer`-scoped key
(`fromJira`). Each driver declares its conformance, what its tracker cannot express (`CONFORMANCE`), and a
reconcile plan carries a finished item back to the native side (`milestoneChanges`, `jiraChanges`). The
agent is tracker-blind: whatever the source, it works ROADMAP.yml and narrates the item and its outcome.

| Route | What |
|---|---|
| `GET /v1/accounts/:account/roadmap` | the current revision: `revision`, `ts`, `source`, `by`, `roadmap`, `changes`, `conformance` |
| `GET /v1/accounts/:account/roadmap/revisions?limit=` | the history, newest first |
| `POST /v1/agent/roadmap` `{ source, roadmap, by? }` | an owner-side push; needs the `steer` scope; an unchanged roadmap is not a revision |

## Rails

Money leaves an account only through a metered rail, and every rail leaves a record on the audit trail
naming itself. The model rail is a stock OpenAI or Anthropic SDK pointed at the platform. The two others
are bounded by the owner in `.open-autonomy/config.yaml` (`parseRailsConfig`) and off until a bound is set:

| Route | What |
|---|---|
| `POST /v1/rails/card` `{ usd_cents, purpose? }` | a single-use virtual card minted against the balance (Stripe Issuing), bounded to the amount and the owner's merchant categories; returns the card's `id`, `last4`, expiry, and `number`/`cvc` where the issuer exposes them. A merchant's authorization is decided in real time, its capture settles as a `card` record (merchant, category, last4), and the card is retired |
| `POST /v1/rails/partner` `{ partner, usd_cents, unit?, quantity?, reference? }` | a partner service's metered charge, settled now as a `partner` record, for a partner the owner listed and within the amount the owner set |

Key scopes: `spend` (the rails), `narrate` (the stream), `steer` (a roadmap push). A key minted without
`scopes` carries spend and narrate; `POST /v1/keys/mint {account, scopes: ["steer"]}` mints a driver's key
that spends nothing.

## The wire

All narration is `POST /v1/agent/events` with the project's key as `Authorization: Bearer <key>`, a body
of one CloudEvents 1.0 event or a JSON array of them, applied in order. Secret-shaped text is redacted at
intake; everything accepted is public.

```json
[{ "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "2026-09-04T00:20:11Z",
   "type": "org.open-autonomy.session.started", "subject": "<session key>",
   "data": { "session_kind": "run", "source": "build-roadmap", "title": "…", "item_id": "add" } },
 { "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "…",
   "type": "org.open-autonomy.session.turns", "subject": "<session key>",
   "data": { "seq": 0, "item_id": "add", "turns": [
     { "ts": "…", "role": "user", "text": "…" },
     { "ts": "…", "role": "assistant", "tool": "terminal", "args": "{…}" },
     { "ts": "…", "role": "tool", "tool": "terminal", "result": "…" },
     { "ts": "…", "role": "assistant", "text": "…" } ] } },
 { "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "…",
   "type": "org.open-autonomy.item.update", "subject": "<item id>",
   "data": { "text": "…", "session": "<session key>" } },
 { "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "…",
   "type": "org.open-autonomy.session.ended", "subject": "<session key>",
   "data": { "outcome": "done", "report": "…", "commit_sha": "7d30729", "item_id": "add", "ended_at": "…" } }]
```

`seq` is the offset of the first turn in the session's own order: a retry or a reconnect that replays
offsets already applied is ignored (`idempotent: true` in that event's result), so a reporter that restarts
reads the session back and continues from its `next_seq`. The response is `{ ok, results: [{ id, ok,
session | update, idempotent?, error? }] }`; the first failing event stops the batch.

Public reads, no key:

| Route | What |
|---|---|
| `GET /v1/accounts/:account/sessions?limit=` | the stream, newest first, and `live`: the keys live now |
| `GET /v1/accounts/:account/sessions/:key` | one session with its transcript tail and `next_seq` |
| `GET /v1/accounts/:account/sessions/:key/events` | Server-Sent Events: `turn` (id = offset), `status`; `Last-Event-ID` resumes |
| `GET /v1/accounts/:account/items/:item` | every session, update and settled cent on the item |
| `GET /v1/accounts/:account/items/:item/events` | Server-Sent Events: `item` on change, until nothing is live |
| `GET /v1/accounts/:account` | the books: balance, spend, runway |
| `GET /v1/accounts/:account/calls?limit=&before=` | the audit trail, every metered spend, newest first |

Keys, the adopter way: `GET /v1/keys/challenge?account=owner/repo` names a claim to commit to
`.open-autonomy-claim` on the default branch; `POST /v1/keys/mint {account, models?}` mints once the file
is at HEAD; `POST /v1/keys/rotate` with the current key mints a successor and leaves the old one a day of
grace. A key is verified by its signature and expiry alone, so it survives every redeploy; the platform's
registry can only revoke it or shorten it.
