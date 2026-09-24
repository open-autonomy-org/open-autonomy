# ADR 0012: Reports an owner-side tool publishes

Status: Proposed. Accepted only upon independent constitution review and merge of this record and its
implementation.

## Context and sources

Evidence Desk keeps a company's compliance program: its controls, evidence, and the audit reports and
certificates it holds. Its trust center (`evidence-desk trust build`) already writes what the organization may say
publicly, as a page and a row of badges: one per document held (an auditor's report or a certificate, or a
self-attestation labelled as one), and a readiness badge for each framework no auditor's document covers. The
workspace itself is confidential and never sits in a project's repository (`COMPLIANCE.md`).

Source of authorization: the owner's coding conversation, September 24, 2026: "let's think about how evidence desk
will relate to open autonomy. Do we want to have an integration?"; "we can also have a compliance status badge";
"what we want to display is readiness and steps to readiness - compliant or certified requires the doc"; "we CAN say
certified IF we have the evidence"; "this does allow us to show a row of badges on both the open autonomy page and
potentially the github page"; "open autonomy's dashboard would gain a row for evidence desk", "or maybe
'compliance'"; "this is something to think carefully about because this is the first 'plugin' we're talking about".
The conversation has no public permalink; these quotations record scope, not independent approval. Everything past
them (the route, the key scope, the vocabulary, the visibility default, the expiry rule) is this author's
extrapolation, marked below.

What exists (source audit, same day): an automation says everything on the events door on a `narrate` key; the owner
says everything on `steer` keys (ADR 0005). An owner-side driver already publishes on the owner's side: the Jira
driver reads the project's epics where the credential is and pushes the roadmap on a `steer` key
(`POST /v1/agent/roadmap`), which the agent never holds. The dashboard's rail is a fixed list of pages, each gated by
a panel of the owner's `dashboard:` word. The README widgets (`widgets.ts`) are Camo-safe SVGs drawn from the same
data as the site. The core "knows nothing an app adds around it" (`page/model.ts`), and the constitution names Hermes
and its board "one starter the kit makes, not a shape the platform knows".

## Decision

A plugin is a tool that publishes to the platform; the platform runs none of its code. Its first shape is a
**report**: an owner-side tool's statement about the project, shown as a row in the dashboard's rail, a page, and a
badge row for a README.

- **The owner's side publishes.** `POST /v1/agent/report { id, title, source, as_of, badges, body_md? }` on a `steer`
  key, the same door the Jira driver uses. A `narrate` key is refused: the agent narrates its own work and never
  makes a claim about the organization on the organization's page. The platform keeps each report's latest
  revision with who and when, exactly as it keeps the roadmap's.
- **The platform knows no framework.** A report has an `id` (its row's address), a `title` (its row's word, e.g.
  "Compliance"), a `source` `{ name, url? }` it is attributed to, an `as_of` date, `badges`
  `[{ label, message, tone, until? }]` with `tone` one of `positive | info | neutral | warning | negative`, and an
  optional markdown body. The platform draws them in its own components and its own colours; no markup, script or
  image from the publisher reaches a page.
- **A claim lapses on its own date.** A badge with `until` is not shown after that day, whether or not the
  publisher runs again. A certificate's expiry is in the document; a tool that stops running must not leave the claim
  standing.
- **The owner's word on who sees it.** Reports are one panel, `reports`, in the `dashboard:` word: public in the
  `roadmap`, `open` and `status` presets, team in `private`. A closed panel answers 404 on the page, the badges and
  the read door alike.
- **Where it shows.** Each report is a row in the rail after the fixed pages, titled by the report, opening its page:
  the badges, the body, and "Reported by <source> on <as_of>". `GET /v1/accounts/:account/reports/:id/badges.svg` is
  the badge row as a README widget; `GET /v1/accounts/:account/reports` the reports as JSON.

What the claim rests on is the publisher's rule, not the platform's. Evidence Desk's rule, already in its code: an
audit report or certificate is claimed only while the document is held with its hash, intact and in date; a
self-attestation says self-attested; without either, the badge is readiness, and the body lists the steps still
open. Extrapolation, this author's: Evidence Desk gains `trust publish`, which posts the same badges its trust
center builds, with the readiness steps as the body, on a `steer` key the owner mints once and keeps with the
workspace.

## Alternatives and tradeoffs

- **A compliance feature in the platform** (an event type or page that knows SOC 2). Rejected: the platform would
  learn one tool's shape, as the task event once carried the Hermes board's lanes (ADR 0005). The next plugin would be
  another special case.
- **Publishing on the events door with the agent's `narrate` key.** Rejected: an autonomous agent could then put
  "SOC 2 certified" on a public page. The confidential workspace is not in the agent's reach anyway.
- **A narrate key the owner's config names as a report's publisher.** It would work, but adds a new gate and a new
  config noun. The `steer` scope already means the owner's side.
- **Plugins as code or embedded pages** (a script, an iframe, publisher HTML). Rejected: third-party code on the
  project page, and the page would stop being what the platform drew.
- **Badges hosted by the tool** (Evidence Desk's own `badges/*.svg`). They stay available for a trust center the
  organization hosts. They are not the project page's row, and a copy with no expiry stays in a README after the
  certificate lapses.

## Consequences

- The backend gains one record per report per account (latest revision, who, when), one write route on the `steer`
  scope and two public reads; the `dashboard:` word gains one panel. The valve forwards nothing new; the agent never
  calls the route.
- The SDK gains `report()` on a `steer` key and the report type; its README documents the wire.
- The rail gains a row per report and the widgets gain one SVG. Sizes are bounded: a few reports per account, a few
  badges per report, short strings, a body of a few kilobytes.
- Evidence Desk gains `trust publish` (in its own repository). Nothing here changes metering, credentials, the account
  tree or the balance hard-stop.

## Constitution review

- *Only the SDK is real.* Preserved: a report arrives on the SDK's wire from wherever the owner runs the tool; the
  platform reads no file of it.
- *The platform shows; it does not steer.* Preserved: the platform draws what the owner published and enforces the
  owner's visibility and each claim's own date; it drives nothing.
- *Authority comes from the repository, not from a key.* Preserved: a `steer` key is minted by the claim file at HEAD;
  visibility is the committed `dashboard:` word; the key publishes within it and widens nothing.
- *Nothing in an agent's reach is a secret that matters.* Preserved: the agent's key cannot publish a report; the
  owner's key stays with the owner-side tool.
- *Every spend is metered; the ledger's settled cents are the only cost.* Untouched: a report spends nothing.
- *Nothing here develops against a real API; no automated tests.* The change is verified by hand in the world: a
  synthetic Evidence Desk workspace publishes through a twin-minted `steer` key, and the row, the page, the widget, a
  lapsed badge and a closed panel are read on the running platform.
- *Out of scope: a treasury with rails, a page and a widget.* Preserved: a report is a row on the page and a widget;
  the platform hosts no plugin's code and knows no plugin's domain.

This record cannot amend the constitution and does not need to.
