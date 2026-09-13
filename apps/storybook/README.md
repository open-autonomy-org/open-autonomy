# The platform's pages, designed in Storybook

`bun run storybook` in this directory serves every page and part at http://localhost:6006, rendered from real
records captured from the live platform (`fixtures/`). Pages are server-rendered hono/jsx; a story renders one to
an HTML string. The same modules serve the site: `packages/backend/src/page/serve.tsx` routes them, so a story is the served page with the records held still.

## The core and an app around it

Two story trees, because two things exist. **Core** is exactly what a self-hosted deployment serves: the source is
`packages/backend/src/page/` (`theme.ts` the one stylesheet, `model.ts` roles, visibility and the slot contract,
`parts.tsx` each panel, `project.tsx` the shell and Overview, `tabs.tsx` Work, Item, Sessions, Session, Books, Agent).
The core's project page is a dashboard: what the agent is doing, what it shipped, what the books hold and how
long it lasts, who is on the team. Money on it is a budget someone put in. It knows nothing about patrons, givers,
tiers, sponsors, coupons, a pitch or Explore, and carries no code for them switched off.

The core also has the deployment's front (`directory.tsx`: the grid of its projects, the ones working now first) and a
name's page (`account.tsx`: a GitHub login, org or person, one namespace: what it owns here and what it gave).

**Platform** is the same pages with the platform's additions entering through the core's slots: the source is
`apps/platform/src/page/patronage.tsx` (the ask, the tiers, subscribers on the wall, subscriptions in Money in,
Explore in the bar; on the front, its pitch and its patrons; on a name's page, the door to buy credits or sponsor). Which code ships is decided by which package a deployment mounts, at build time, as
`apps/self-host` and `apps/platform` already do. There is no deployment flag.

| Slot | Where | The platform puts |
|---|---|---|
| `nav` | the top bar | Explore |
| `cta` | the top bar | Become a patron |
| `cover` | above the header | the project's cover image |
| `meta` | the header's facts line | patrons, per month (the core shows the balance instead) |
| `lead` | top of Overview's main column | About: the project's pitch |
| `side` | top of Overview's side column | the tiers, the patrons wall |
| `main` | cards after Overview's main column | |
| `moneyIn` | rows in Books' money in | subscriptions, grants from funders |
| `give` | Books | its own give doors |
| `styles` | after the core's stylesheet | its own CSS, a constant of the app, built from the core's tokens |

A slot is additive and inside the core's layout: an app cannot remove, reorder or rewrite what the core shows. The
front and a name's page have their own, smaller contracts:

| Page | Slot | The platform puts |
|---|---|---|
| front | `front` | its words above the figures: "Fund a project that builds itself." (the core says "Projects") |
| front | `stripe` | more figures: patrons; granted, by how many funders or from whose pool |
| front, name | `card` | a project's facts line by account: patrons, per month (the core shows the balance) |
| name | `meta`, `main`, `side` | Sponsor on GitHub for the org that owns the listing; Buy credits to give on a person's own page |

## Two surfaces, two purposes

**The landing page** (`Platform/Landing`, `apps/platform/src/page/landing.tsx`) is how an outsider meets a project:
Kickstarter's campaign with GitHub's proof. One page, no tabs. It owns the cover and the name, the pitch, the ask and
the tiers, the promises (the roadmap as next up and recently shipped), the backers, and one dark strip of proof
that the thing is alive: the agent's one word, what it is doing this minute or what it last did, what it last
shipped, that every cent is metered. Everything deeper is a link into the dashboard, shown only to a viewer the
owner admits there. It is the platform's alone; a self-host has no landing page.

**The dashboard** (`Core/Dashboard`, `packages/backend/src/dash/index.tsx`) is the work as the team reads it: an app
shell with a rail of panels, a top strip of the facts that matter every minute (the word, the balance, the runway,
today's spend), and pages: Overview (now, spend, recent runs, the board's shape, the agent with the owner's control),
Sessions and one session's transcript, the Board, the Books with every metered call, the Agent, the Team. Its scale
and structure are its own, not the landing page's. The `dashboard:` block decides which panels each role sees, and
whether the public sees any of it; a self-host serves this and nothing else.

| Address | What it is |
|---|---|
| `/` | the deployment's front: the platform's Explore; a self-host lists its projects |
| `/name` | a GitHub login, org or person: its projects, its grants pool, its giving books |
| `/owner/project` | the landing page (platform) |
| `/owner/project/dashboard` | the dashboard's Overview, then `…/dashboard/{sessions,board,books,agent,team}`, `…/sessions/:key`, `…/board/:item` |
| `/owner/project/about` | the project's document in full |

The dashboard's addresses are the design's; the router still serves the earlier tabbed page until the wiring lands.

### States a story must cover

Running, working now, pause requested, paused by the owner, spending stopped, not yet funded; with patrons and
without; GitHub Sponsors and Polar; platform and self-hosted; each preset as each viewer; long titles.
