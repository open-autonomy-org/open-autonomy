# @open-autonomy/sdk

The Open Autonomy SDK: how a project reports its own development to the platform, and the roadmap model
every kit writes. Everything a project's page shows about its agent comes through this wire — the sessions,
the roadmap, the board, the agent's setup — and nothing through the platform reading a harness's files, so
any substrate can be a project: the Hermes kit and the file roadmap are starters, not the shape. Everything
here is one documented HTTP wire, shown raw below, so any language can do the same without this package.
The Hermes kit vendors it into a generated repository under `.open-autonomy/sdk/`.

```ts
import { OpenAutonomy } from '@open-autonomy/sdk';

const oa = new OpenAutonomy({ baseUrl: 'https://open-autonomy.org/v1', key: process.env.OPEN_AUTONOMY_KEY! });
const s = await oa.open({ key: 'a3f9c1d2', kind: 'run', source: 'board', item: 'add' });
await s.turns([{ role: 'assistant', tool: 'terminal', args: '{"command":"bun run check"}' }, { role: 'tool', tool: 'terminal', result: 'ok' }]);
await oa.update({ item: 'add', text: 'the store writes; the id counter next', session: s.key });
await s.end({ outcome: 'done', report: 'Done. add — committed 7d30729.', commit: '7d30729' });
```

## Owner-side credential handoff

The standalone `open-autonomy-credentials` command receives secrets into the runtime host's protected
storage without needing a repository checkout. It is a local tool, not a hosted platform vault.
The setup agent owns provider configuration and browser navigation. This tool owns the secret handoff;
it prints only the entry/callback address or a saved-path receipt, never the credential. Do not pass secrets as
command arguments or inspect the entry page after a person has filled it.

```sh
open-autonomy-credentials receive --out /protected/project/provider-token
open-autonomy-credentials receive --out /protected/project/github-app.json --github-app owner/repo
```

The default receiver serves a password input in the normal browser and saves its text verbatim.
The GitHub adapter instead receives a manifest callback and exchanges its temporary code for the app
credential. Give the printed callback URL and state to the browser agent for GitHub registration.
Creation saves the credential immediately, before installation. That completes the saver’s job. It
does not generate manifests, create or install apps, configure integrations, or verify installation.
The browser agent completes the existing app’s installation. When the valve uses an app key without an
installation ID, it discovers that repository’s installation through GitHub and obtains its scoped
access token. Existing credentials with an installation ID remain supported. No key-file editing is needed.

Use a destination outside every Git checkout. New files are owner-only and never overwrite an existing
file. The receiver binds only to loopback and expires
after ten minutes. If the browser is on another machine, the operator must establish an authorized SSH
tunnel to that loopback port. Do not expose the receiver publicly.

For a credential displayed on a page, `capture` transfers one selected field through the existing
normal-browser controller directly to the protected receiver. No provider-specific scraper, clipboard,
new browser connection, or manual paste is needed:

```sh
open-autonomy-credentials capture --out /protected/project/provider-token \
  --browser http://127.0.0.1:<controller-port> --holder <existing-session> \
  --page https://provider.example/app/token --selector '#token' --field value
```

Discover the existing controller and bind the intended tab using the setup agent's browser skill first.
`--browser` is that controller's loopback HTTP origin (with its existing `/eval` interface), never a CDP
endpoint. The browser and this command must run on the same host. `--page` must match the tab's complete
URL at capture time, without query parameters or fragments; HTTPS is required except on loopback.
Choose the field within the credential-labeled section using safe DOM metadata, never by returning its
value to the agent. A lone Copy button can belong to an app ID or permissions calculator.
`--field value` reads a visible input/textarea; `--field text` reads a visible leaf text element.
Use `--field direct-text` when the credential is one direct text node beside child controls such as
Copy/Reset buttons. It excludes descendants and refuses multiple nonempty direct text nodes.
Ambiguous, hidden, empty or masked fields fail without saving. The operation verifies the page at the
moment it reads the field, posts directly from the browser controller to protected storage, and returns
only a receipt. Raw browser errors and page logs are never forwarded by the command. Treat selectors as
public metadata: never put a credential in a selector or any command argument. A receipt proves data
transfer, not that the chosen field is a valid credential. Verify it immediately with the provider’s native
connection check and expected app/resource identity before recording success or leaving/reloading the
page. Retain the one-time display until verification succeeds so a wrong selector can be corrected
without regenerating the credential.

Capture is for an authorized integration's displayed credential, never account session tokens or cookies.
It requires permission under the active browser policy; explicit owner authorization can narrow an
otherwise blanket restriction to this protected operation. It does not navigate, reveal/reset tokens,
or bypass CAPTCHA or MFA. Reconcile the existing page and destination after any failed/uncertain attempt;
never rotate a key merely to retry capture. Manual `receive` remains available when capture is not
supported or authorized. Downloads and remote-browser capture are not implemented.

Secret-producing host tools can share `checkCredentialDirectory` from `@open-autonomy/sdk/credentials`.
It validates an absolute directory outside Git and returns its resolved path without creating it.

The Hermes kit also vendors the same command as `.open-autonomy/sdk/credentials.ts`; invoke it with Bun
when using a checkout's bundled tools. The credential destination remains outside the checkout.

## The model

- **A session** is one agent conversation: a `kind` (`run` is a scheduled run, the funded work; `chat`
  anything else), the roadmap `item` it serves when known, a `source` (the schedule job's name, a channel).
  It opens, its turns append with an offset, and it ends with an optional outcome: a run has a verdict
  (`done` | `failed`), a chat does not. Several can be live at once.
- **An update** is a short progress note on an item, optionally from a session.
- **The timeline** is one normalized document per project: every item of work the project has done, is doing
  or intends, in one language, whatever holds it natively. An item has a tense, past, present or future, a
  status within it, when it entered each, the release that shipped it or will, who, its proof (a commit), and its
  links, typed and as many as the publisher knows: the ticket that asked, the issue, the pull request, the branch, the
  recording, the roadmap section. The page's views (a board, a list, the timeline by month, the past by release) are sorts and
  groupings over that one document, never edits: the platform shows, it does not steer. What a substrate keeps
  locally is its own business: the Hermes kit keeps its past in `CHANGELOG.md`, its present on the Hermes board
  with the sessions serving it, and its future in `ROADMAP.md`; an engagement keeps all three in a client's
  tracker. Unifying those into the one language is the job of that substrate's SDK implementation, the reporter
  or a driver, and of nothing on the platform (owner ruling, 2026-09-08). The wire still calls the document the
  roadmap in its routes.

Spend is attributed by the platform: Hermes names its session on each model request, so overlapping sessions
each receive their own settled calls and cents and an item's page shows everything that touched it.

## Drivers

The platform holds one normalized roadmap per project, revisioned: who, when, from which source, what
changed. Substrates feed it: a reporter publishing its board, or a driver. `github-milestones` is the
repository's milestones, pulled on sync with no credential (`fromMilestones`); it is the only source the platform pulls. `jira` is the project's
epics, read owner-side where the credential is and pushed with `pushRoadmap` on a `steer`-scoped key
(`fromJira`). Each driver declares its conformance, what its tracker cannot express (`CONFORMANCE`), and a
reconcile plan carries a finished item back to the native side (`milestoneChanges`, `jiraChanges`). The
agent is tracker-blind: whatever the source, it works its own queue and narrates the item and its outcome.

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
| `GET /v1/keys/challenge?funder=<login>` → `POST /v1/keys/mint {funder, repo}` | a funder's key: the claim file in a repository the login owns proves the login; the key can only give |
| `POST /v1/grants/give` `{ to, usd_cents, note?, key?, for? }` (a give key) | grant credits from the funder's books to a project's, once per `key`; `for` may be `"any"`, `"model"`, `{models: [...]}`, or `{item: "id"}`, and absent means unrestricted |
| `GET /v1/funders/:login` | a funder's public books: credits to give (and how much of it is the org's bonus, for other people's projects), given, received |
| `POST /v1/patrons/checkout` `{ account: "@login", tier, interval: "once" }` | a funder buys a credit pack through Polar; the org matches a share as bonus credits |
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
   "data": { "session_kind": "run", "source": "board", "title": "…", "item_id": "add" } },
 { "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "…",
   "type": "org.open-autonomy.session.turns", "subject": "<session key>",
   "data": { "seq": 0, "item_id": "add", "turns": [
     { "ts": "…", "role": "user", "text": "…" },
     { "ts": "…", "role": "assistant", "tool": "terminal", "args": "{…}" },
     { "ts": "…", "role": "tool", "tool": "terminal", "result": "…" },
     { "ts": "…", "role": "assistant", "text": "…" } ] } },
 { "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "…",
   "type": "org.open-autonomy.item.update", "subject": "<item id>",
   … }
   { "type": "org.open-autonomy.item.task", "subject": "<item id>",
     "data": { "task_id": "…", "lane": "review", "attempts": [{ "id": "1", "profile": "default", "status": "review_requested", "summary": "…" }], "reviews": [{ "verdict": "requested" }], "handoff": { "summary": "…" } } }
   { "type": "org.open-autonomy.agent.setup", "subject": "agent",
     "data": { "harness": "hermes", "persona": "…", "model": "zai/glm-5.3-flash", "schedule": [{ "name": "file-roadmap-item", "schedule": "every 360m" }], "skills": ["roadmap", "land"], "setup_md": "…" }
   "data": { "text": "…", "session": "<session key>" } },
 { "specversion": "1.0", "id": "…", "source": "my-reporter", "time": "…",
   "type": "org.open-autonomy.session.ended", "subject": "<session key>",
   "data": { "outcome": "done", "report": "…", "commit_sha": "7d30729", "item_id": "add", "ended_at": "…" } }]
```

`seq` is the offset of the first turn in the session's own order: a retry or a reconnect that replays
offsets already applied is ignored (`idempotent: true` in that event's result), so a reporter that restarts
reads the session back and continues from its `next_seq`. The response is `{ ok, results: [{ id, ok,
session | update, idempotent?, error? }] }`; the first failing event stops the batch.

`Session.turns()` splits uploads into the wire's 100-turn batches and advances only after the server
acknowledges each offset. Rejected uploads and end events throw; a failed read is not a missing session.
The `./reporting` adapter consumes Supercode's message windows and explicit completion records, verifies
the already-published prefix and saves acknowledged checkpoints. It never infers completion from silence.
History changes that conflict with the append-only destination require reconciliation; they are not
silently treated as new offsets. Privacy policy accepts standard YAML lists and rejects malformed values.

Public reads, no key:

| Route | What |
|---|---|
| `GET /v1/accounts/:account/sessions?limit=` | the stream, newest first, and `live`: the keys live now |
| `GET /v1/accounts/:account/sessions/:key` | one session with its transcript tail and `next_seq` |
| `GET /v1/accounts/:account/sessions/:key/events` | Server-Sent Events: `turn` (id = offset), `status`; `Last-Event-ID` resumes |
| `GET /v1/accounts/:account/items/:item` | every session, update and settled cent on the item |
| `GET /v1/accounts/:account/items/:item/events` | Server-Sent Events: `item` on change, until nothing is live |
| `POST /v1/agent/events` with type `org.open-autonomy.project.docs` `{ about_md? }` | the project's document, from whatever file the substrate keeps: what it is (the page leads with the first paragraph) |
| `GET /v1/accounts/:account/events` | Server-Sent Events: `project` on change (the books, the live set, the roadmap revision); stays open |
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

## The valve

`open-autonomy-valve`, the package's one binary, is a credential-injecting sidecar for the project's key: the key
lives in a file only the valve reads, the agent is pointed at the valve's address with the literal word `valve`
as its key, and the valve adds the real bearer at the edge. It forwards the model routes, the narration routes
(`/v1/agent/events`, `/v1/agent/roadmap`), the rails and public reads of the account, and refuses the rest, so an
agent whose output is public never possesses the one credential that spends its sponsors' money.

```bash
open-autonomy-valve --key ~/.config/open-autonomy/agent.env:8787 --key ~/.config/open-autonomy/treasurer.env:8788
```

One port per key file; each file re-read when it changes; `/healthz` on each port names the key's expiry.

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
narration key cannot replace it. `/p/:account/team` resolves it through this SDK model. Owners can edit
one member at a time, sign in with GitHub and create a draft PR. The short-lived OAuth flow uses the
human's token only during the callback, never stores it, and never merges or writes the default branch.
GitHub asks for `public_repo` access for this action. The giving page retains its existing sign-in flow.
Current owner IDs and the configuration revision are rechecked before any write. Failed or abandoned
proposals leave the committed roster unchanged; inspect a partially created branch with the team prefix before retrying.

Authority changes need owner-authorized provenance even after merging. Native Discord access and GitHub
release protection are reconciled separately by the setup agent; a roster edit is not release approval.

The local subscription valve (`--codex <port>`) obtains an access token from the installed Codex
app-server's `getAuthStatus` RPC for each request. Codex owns storage and refresh, including
`CODEX_HOME` and its credential-store configuration. Both container and bare Hermes receive only
a stand-in credential. Account changes apply to the next request; logout fails closed. The valve
never copies a login, writes the Codex auth file, accepts a project token file, or publishes RPC diagnostics.
