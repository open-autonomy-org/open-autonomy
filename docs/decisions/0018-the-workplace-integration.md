# ADR 0018: The Workplace integration: a project linked to its organization's workspace by consent, its books' conditions raised there as alerts

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its first
implementation; proposed until both occur.

## Context and sources

**Authorization.** The owner locked the design in Volter's company repository on 2026-10-01:
`volter-ai/volter` `company/rfcs/0024-volter-workplace-and-the-organization-as-code.md` ("okay cool, anyway first lock
down our earlier discussion"). The owner's lines it rests on: "My aim is to replace the OA dashboard with workplace";
"almost everything is the same it seems, and we would just add the 'funding' integration"; "expect inputs in formats
rather than specifically calling each other (or if they do call each other it is through integrations)"; "well the
integration should be surfacing alerts on their own too right"; "so it's not that alerts reach into the system but
rather each sub systems have their own alerts that go up to the alerts system".

**What exists** (this repository's `main` at 0841076b; runhuman-2 branch `wt/t_4007dd5b`):
- The dashboard's "Needs attention" (`packages/backend/src/dash/app.tsx`, `attentionOf`) reads the books' conditions
  from the project's view and shows them to whoever opens the page; nothing reaches anyone who does not.
- Volter Workplace (RH2) installs apps by consent (RFC 0014): an organization's admin allows a registered app from its
  install page and is sent back with a one-time code the app trades, with its client secret, for its token there
  (`POST /api/v3/automation/apps/oauth/access`). Workplace's alerts (`src/commands/alerts.ts`) are raised and cleared by
  the subsystem that owns the condition, under a stable key, for one of the organization's roles.

## Decision

1. **A project links to one workspace through Workplace's app install.** This deployment registers one app in Workplace
   (its id and client in `WORKPLACE_APP_ID`, `WORKPLACE_CLIENT_ID`, `WORKPLACE_CLIENT_SECRET`, at `WORKPLACE_URL`), asking
   for `alert.raise`, `books.publish` and `organization.read` (`apps/platform/workplace-app.json` is its registration). The project's owner asks for a link with the steer key
   (`POST /v1/accounts/:account/workplace/link`, `{ "role" }`), opens the install page the answer names, and the
   workspace's admin consents there. The return (`GET /workplace/callback`) carries a state signed here, so a code can
   only complete the link its owner started. The books keep the link under the project in the ledger's storage, through
   operations the integration registers (`LimitLedger.extend`), never in the core's state.
2. **The books' conditions are raised as alerts, for the role the owner named.** Spent out, not yet funded, runway under
   a third of its goal, a spending limit at 80% or more, a spending freeze (its own or its org's), a pause asked for and
   not yet taken, and the org's pause: the
   same facts the dashboard reads, each under a stable key. Every quarter hour each link is brought in step: a standing
   condition is raised (a repeat is a no-op there), one that ended is cleared. The keys raised are kept on the link, so an
   ended condition is always cleared. No person is named here; the workspace's roles say who.
3. **The books are published there, and a spending freeze asked there is taken here.** Every tick publishes the
   project's books in the workspace's `books` format (standing, put in, given out, spent, balance, burn and runway against
   its goal, earmarks, spending caps with their use, the owner's statements, the daily metered spend) and works the
   controls asked of them. The one control is the **spending freeze**, the owner's words "a spending freeze, which could be
   combined with spending caps": a cap of zero on every rail, kept on the account (`freeze`), checked by `reserve` before
   anything else, so no model call, card or partner charge is reserved while it stands. It is the project's own or its
   org's (an org's freeze holds every project of the org), set by the owner (`POST /v1/agent/freeze` on a steer key) or by
   the workspace through the link, and lifted the same way. It is not the agent's pause, which stops the process.
4. **Without the configuration the doors refuse** (`workplace_not_configured`), as the card rail does without Stripe. A
   deployment that never links runs as before.

The runs' conditions (failed runs, no scheduled run, proposed items) are supercode orchestration's, raised by its own
integration (RFC 0024 C8), not here.

A linked project's page is the workspace's Overview (RFC 0025 decision 8): `/<owner>/<project>` redirects there, and the
dashboard stays the owner's controls and the books' depths. A person who gives signed in with Volter is recorded against
their funder name (`@login` → the Volter issuer and subject), and the books snapshot lists the project's givers by that
identity, so the workspace seats them in its `giver` role without a second sign-up. A giver who gave with a GitHub
sign-in or a funder key is not named; they give as before.

## Consequences

- A project's owner, and anyone the workspace's role names, is told where they work when money runs short, without
  opening the dashboard.
- The installation's token lasts as Workplace's app tokens do (90 days); an expired link reports so on the link and is
  linked again by its owner.
- Changing a cap stays an edit of the project's `config.yaml`; the workspace shows the caps and their use, and freezes.
