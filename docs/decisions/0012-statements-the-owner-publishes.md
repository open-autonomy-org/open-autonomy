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
  project's `steer` key, beside the roadmap push; an org's key is refused, as on the roadmap route. A `narrate` key is
  refused. A tool uses the owner's existing driver key, not a key of its own.
- **The platform knows no framework.** `id` matches `^[a-z][a-z0-9-]{0,31}$` and is the statement's address; `title`
  is its row's word ("Compliance"); `source` is `{ name, url? }`, the tool the owner names; `as_of` a date; `badges`
  `[{ label, message, tone, until? }]` with `tone` one of `positive | info | neutral | warning | negative`; `body_md`
  optional. The platform draws them in its own components; no markup, script or image from the tool reaches a page.
  The events door's redaction runs on every field.
- **Limits.** Five statements per account, eight badges per statement, a label of 40 characters and a message of 60,
  a title of 24, a body of 8 KB. Over a limit is a refusal, never a truncation.
- **Every revision is kept.** Each publication is a revision with who (the key), when and what changed, served at
  `GET /v1/accounts/:account/statements/:id/revisions`, exactly as the roadmap's are. A compliance claim is what a
  public audit trail is for.
- **A claim lapses on its own date.** A `positive` badge must carry `until`; the others may. `until` is a UTC date and
  the badge stands through that day. After it, the badge is not drawn in the rail's row or the README widget, and the
  statement's page lists it as lapsed on that date. The platform checks the date at every read, so a tool that stops
  running, or an owner whose key expired, cannot leave a claim standing. The body carries no claim the platform can
  date; the page shows it under "as of <as_of>".
- **Withdrawal.** `DELETE /v1/agent/statement/:id` on the same key removes the statement from the rail, the page and
  the widget; its revisions stay on the read door. Revoking or letting a key expire withdraws nothing: what was
  published stays the owner's dated word, and its positive claims lapse on their own.
- **The owner's word on who sees it.** Statements are one panel, `statements`, in the `dashboard:` word: public in the
  `roadmap`, `open` and `status` presets, team in `private`. Public by default because a statement exists only to be
  shown and only the owner's key publishes one. A closed panel answers 404 on the page, the widget and the read doors
  alike; a README widget of a private project therefore shows nothing, since GitHub fetches it signed out.
- **Where it shows, and whose word it is.** Each statement is a row in the rail after the fixed pages, titled by the
  statement, opening `…/dashboard/statements/:id` (under `statements/`, so no id can shadow a fixed page): the badges,
  the lapsed ones, the body, and "Stated by the owner of <project> on <as_of>, from <source>". The platform attributes
  the statement to the owner and endorses nothing. `GET /v1/accounts/:account/statements/:id/badges.svg` is the badge
  row as a README widget (a new, badge-sized widget form); `GET /v1/accounts/:account/statements` lists them as JSON.

What a claim rests on is the tool's rule. Evidence Desk's, in its code: an audit report or certificate is claimed only
while its document is held with its hash, intact and in date; a self-attestation says self-attested; otherwise the
badge is readiness and the body lists the steps still open. Extrapolation, this author's: Evidence Desk gains
`trust publish`, posting its trust center's badges with the readiness steps as the body. Its audit-report badge,
which has no expiry today, is given `until` one year after the report's period ends, the usual reliance window after
which customers ask for a bridge letter; a certificate's `until` is its own expiry.

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
- SDK: `publishStatement()` and `withdrawStatement()` on a `steer` key and the statement type; its README documents
  the wire.
- Evidence Desk, in its own repository: `trust publish`, and `until` on its audit-report badges.
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
  Desk workspace publishes on a twin-minted steer key, and the row, the page, the widget, a lapsed badge, a refused
  narrate key, a withdrawal and a closed panel are read on the running platform.
- *Out of scope: a treasury with rails, a page and a widget.* Preserved: a statement is a row on the page and a widget;
  the platform hosts no tool's code and knows no tool's domain.

This record cannot amend the constitution and does not need to.
