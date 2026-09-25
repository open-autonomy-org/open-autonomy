# ADR 0012: Statements the owner publishes

Status: Proposed. Accepted only upon independent constitution review and merge of this record and its
implementation.

## Context and sources

Evidence Desk keeps a company's compliance program: its controls, evidence, and the audit reports and certificates it
holds. The kit's `soc2` template already relates the two (`COMPLIANCE.md`): the program lives in an Evidence Desk
workspace the owner keeps privately, never in the project's repository, because its evidence is confidential. Its
trust center (`evidence-desk trust build`) writes what the organization may say publicly, as a page and a row of
badges: one per document held (an auditor's report or a certificate, or a self-attestation labelled as one), and a
readiness badge for each framework no auditor's document covers. Nothing of it reaches the project's page today.

Source of authorization: the owner's coding conversation, September 24, 2026: "let's think about how evidence desk
will relate to open autonomy. Do we want to have an integration?"; "we can also have a compliance status badge";
"what we want to display is readiness and steps to readiness - compliant or certified requires the doc"; "we CAN say
certified IF we have the evidence"; "this does allow us to show a row of badges on both the open autonomy page and
potentially the github page"; "open autonomy's dashboard would gain a row for evidence desk", "or maybe
'compliance'"; "this is something to think carefully about because this is the first 'plugin' we're talking about".
The conversation has no public permalink; these quotations record scope, not independent approval. Everything past
them (the route, the key scope, the vocabulary, the lapse rule, the visibility default, the limits) is this author's
extrapolation.

What exists (source audit, same day): an automation says everything on the events door on a `narrate` key (ADR 0005).
The owner's side speaks on `steer` keys (the roadmap push, the operating state) and, signed in, through the page
(ADR 0011). An owner-side driver already publishes this way: the Jira driver reads the project's epics where the
credential is and pushes the roadmap on a `steer` key (`POST /v1/agent/roadmap`), which refuses an org's key. The
roadmap keeps every revision with its diff and serves them (`/roadmap/revisions`). The dashboard's pages are a closed
list (`DashPage`, `PAGES` in `dash/model.ts`, repeated with the panel gates in `page/serve.tsx`), each gated by a panel
of the owner's `dashboard:` word. The README widgets (`widgets.ts`) are Camo-safe 460px cards drawn from the same data
as the site. An account holds at most three live keys, and a key expires after 90 days unless the deployment says
otherwise.

## Decision

A **statement** is the owner's published word about the project, from a tool they run on their side, which the
platform shows and knows nothing about. It is ADR 0005's rule applied to one more kind of record: the tool speaks on
the SDK's wire; the platform reads nothing of it. "Plugin" names no new mechanism. Evidence Desk's compliance status
is the first statement.

- **The owner's side publishes.** `POST /v1/agent/statement { id, title, source, as_of, badges, body_md? }` on a
  project's `steer` key, beside the roadmap push. Refusals: `scope_required` for any other key, `not_a_project` for an
  org's key (as on the roadmap route), `invalid_statement` for a malformed or over-limit body, `statement_limit` for a
  sixth statement, `lapsed_on_arrival` for a badge whose `until` is already past, `invalid_statement` also for an `as_of` after today. A tool uses the owner's existing
  driver key, not a key of its own; rotating that key must reach every tool that holds it.
- **The platform knows no framework.** `id` matches `^[a-z][a-z0-9-]{0,31}$` and is the statement's address; `title`
  is its row's word ("Compliance"), refused if it names one of the dashboard's own pages; `source` is `{ name, url? }`,
  the tool the owner names, its `url` http(s) only; `as_of` and every `until` are `YYYY-MM-DD` dates; `badges`
  `[{ label, message, tone, until }]` with `tone` one of `positive | info | neutral | warning | negative`; `body_md`
  optional. The platform draws them in its own components, and the body through its escaping Markdown renderer
  (`mdToSafeHtml`); no markup, script or image from the tool reaches a page. The events door's redaction runs on every
  field.
- **Limits.** Five live statements per account (a withdrawn one does not count), eight badges per statement, a label of
  40 characters, a message of 60, a title of 24, a body of 8 KB. Over a limit is a refusal, never a truncation.
- **Every change is a revision.** A publication that differs from the live statement, and a withdrawal, are each a
  revision: when, the key's id, and what changed (badges added, removed or altered by label; title, source or body
  changed). A publication identical to the live statement is not a revision, as with the roadmap. Revisions are served
  at `GET /v1/accounts/:account/statements/:id/revisions`. A compliance claim is what a public audit trail is for.
- **Every badge lapses on its own date.** Every badge carries `until`, whatever its tone: the tone is the publisher's
  choice of colour and must not decide whether a claim can outlive its tool. The badge stands through that UTC day;
  after it, it is not drawn in the rail's row or the README widget, and the statement's page lists it as lapsed on
  that date. The platform checks the date at every read, so a tool that stops running, or an owner whose key expired,
  cannot leave a badge standing. The README widget is cached as the others are (five minutes, and GitHub's image
  proxy's own), so a lapsed badge leaves a README within that window rather than at midnight. The body is not a dated claim; the page and the widget both show "as of <as_of>".
- **Withdrawal.** `DELETE /v1/agent/statement/:id` on the same key removes the statement from the rail, the page and
  the widget, and is itself a revision; the same id may be published again later, continuing its revisions. Withdrawal is the key's act only:
  the page's one owner control stays the operating state (ADR 0011). Revoking or letting a key expire withdraws
  nothing: what was published stays the owner's dated word, and its badges lapse on their own.
- **The owner's word on who sees it.** Statements are one panel, `statements`, in the `dashboard:` word: public in the
  `roadmap`, `open` and `status` presets, team in `private`. Public by default because a statement exists only to be
  shown and only the owner's key publishes one. A closed panel answers 404 on the page, the widget and the read doors
  alike; a README widget of a private project therefore shows nothing, since GitHub fetches it signed out.
- **Where it shows, and whose word it is.** The rail lists statements below the dashboard's own pages under the heading
  "Stated by the owner", one row per statement, each opening `…/dashboard/statements/:id` (under `statements/`, so no
  id can shadow a fixed page): the badges, the lapsed ones, the body, and "Stated by the owner of <project> on
  <as_of>, from <source>". The platform attributes the statement to the owner and endorses nothing.
  `GET /v1/accounts/:account/statements/:id/badges.svg` is the badge row as a README widget (a new, badge-sized widget
  form); `GET /v1/accounts/:account/statements` lists the live statements as JSON.

What a claim rests on is the tool's rule. Evidence Desk's, in its code today: an audit report or certificate is claimed
only while its document is held with its hash, intact and in date; a self-attestation says self-attested; otherwise
the badge is readiness, a count of controls with evidence.

Extrapolation, this author's, for Evidence Desk's `trust publish`: it posts its trust center's badges, and only when
the workspace's `trust.json` publishes that section. Tones: an audit report or certificate is `positive`, a
self-attestation `info`, readiness `neutral`. `until`: a certificate's own expiry; an audit report's period end plus
one year (the usual reliance window, after which customers ask for a bridge letter), or its issue date plus one year
where it records no period; a self-attestation's issue date plus one year; readiness `as_of` plus 30 days, so a
stopped tool leaves no stale count. The body carries only what `trust.json` publishes; a list of controls not yet
ready discloses security gaps and is not published by default.

What a `steer` key does and does not protect: it is the owner's side because it is minted only by the claim file at
HEAD, the same authority as the roadmap and the pause. In a repository where an agent's pull request can land the claim
file, that agent can mint one; the boundary is then the owner's review of what lands, as it already is for the pause.
The route gives a steer key no power over money, the agent or the owner's bounds; what it adds is words on the
project's page, the kind of power the key already has over the roadmap it can replace.

## Alternatives and tradeoffs

- **A compliance feature in the platform** (an event type or page that knows SOC 2). Rejected: the platform would
  learn one tool's shape, as the task event once carried the Hermes board's lanes (ADR 0005), and each next tool
  would be another special case.
- **The agent's `narrate` key on the events door.** Rejected: it would let the automation make the organization's
  claims, and the confidential workspace is not in its reach anyway.
- **A key scope of its own** (`publish`, only for statements). Narrower than `steer`, which can also pause and replace the
  roadmap, but a new scope for one record type, and the three-key limit would make the owner choose between a
  driver and a tool. Worth revisiting if a second owner-side tool needs a key the owner is unwilling to share.
- **An org's statement shown on its projects.** SOC 2 usually covers an organization. Deferred: it needs a rule for
  what an org's word does on a project's page, which ADR 0010 gives only for the pause. Until then the owner publishes
  to each project.
- **Tool code or tool pages on the platform** (a script, an iframe, publisher HTML). Rejected: another party's code on
  the project page, and the page would stop being what the platform drew.
- **The tool's own badge files** (Evidence Desk's `badges/*.svg`). They stay for a trust center the organization
  hosts; a copy in a README does not lapse when the certificate does.

## Consequences

- Backend: the statement record with its revisions per account, the write and delete routes on `steer`, three public
  reads; the `statements` panel in `Visibility`, `PRESETS` and the `dashboard:` parser; the page route and its gate in
  `page/serve.tsx`; the rail rows and the page in `dash/`; the badge-row SVG in `widgets.ts`.
- SDK: `publishStatement()` and `withdrawStatement()` on a `steer` key, `statements()` and `statementRevisions()` to
  read, and the statement type; its README documents the wire. The steer scope's descriptions (`keys.ts`, the SDK
  README) name statements beside the roadmap and the operating state.
- Evidence Desk, in its own repository: `trust publish`, with the tones and dates above.
- Nothing here changes metering, credentials, key minting, the account tree or the balance hard-stop.

## Constitution review

- *Only the SDK is real.* Preserved: a statement arrives on the SDK's wire from wherever the owner runs the tool; the
  platform reads no file of it.
- *The platform shows; it does not steer.* Preserved: it draws what the owner published, enforces the owner's
  visibility and each claim's own date, and drives nothing.
- *Authority comes from the repository, not from a key.* Preserved: a `steer` key is minted by the claim file at HEAD;
  visibility is the committed `dashboard:` word; the key publishes within it and widens nothing.
- *Nothing in an agent's reach is a secret that matters.* Preserved: the agent's key cannot publish a statement; the
  owner's steer key stays on the owner's side, and what it could do there it could already do.
- *Every spend is metered; the ledger's settled cents are the only cost.* Untouched: a statement spends nothing.
- *Nothing here develops against a real API; no automated tests.* Verified by hand in the world: a synthetic Evidence
  Desk workspace publishes on a twin-minted steer key, and the row, the page, the widget, a lapsed badge, the revisions
  read, a withdrawal, and the refusals (a narrate key, an org's key, an over-limit body, a past `until`) and a closed
  panel are read on the running platform.
- *Out of scope: a treasury with rails, a page and a widget.* Preserved: a statement is a row on the page and a widget;
  the platform hosts no tool's code and knows no tool's domain.

This record cannot amend the constitution and does not need to.
