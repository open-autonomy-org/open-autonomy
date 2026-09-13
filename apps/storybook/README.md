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

## The project: GitHub's frame, Kickstarter's campaign, Patreon's rhythm
One address per thing, tabs for its depths, roles deciding what you see and may do, never a second site:

| Address | What it is |
|---|---|
| `/` | the deployment's front: its projects as cards, the ones working now first; on the platform, Explore |
| `/name` | a GitHub login, org or person, one namespace: its projects, its grants pool, its giving books |
| `/owner/project` | Overview: the composed page below |
| `/owner/project/work`, `…/work/:item` | the timeline as a board (promised, in progress, shipped), one item |
| `/owner/project/sessions`, `…/sessions/:key` | the stream, live first; one transcript |
| `/owner/project/books` | money in with its givers, earmarks, the owner's bounds, every metered call |
| `/owner/project/agent` | who it is, how it runs, its state, the owner's one control |
| `/owner/project/team` | the roster |

Reserved top-level names: `give`, `v1`, `admin`, `settings`; `/explore` is `/` on the platform.

### Overview: what each panel owns

| Panel | Owns | Controls | Shortcuts |
|---|---|---|---|
| Top bar | the deployment: brand, Explore (platform) | | Become a patron → funding (deployments that take money) |
| Header | who the project is: avatar, name, tagline, who builds it, the one word on the agent, the balance (or the platform's patrons), runway | | the repository ↗ |
| Tabs | the depths, with counts | | each tab |
| The workshop | the live session and its latest turns; else the last run's own words, the next fire, thirty days of spend; else the pause; under it the recent runs as a feed | | Follow / Read the session; Every session → sessions |
| Next up · Recently shipped | five titles each | | the roadmap → work |
| Budget (side) | the balance, runway against the goal, put in and spent | | See the books → books |
| Cover, About, tiers, patrons (platform) | the campaign: the cover, the pitch, the tiers with other ways to give under a fold, the patrons wall | Join / Sponsor on GitHub / Give / Redeem | |

### Who sees what

`viewer` is public, giver, team or owner: an app's identity door names the login (the platform's GitHub sign-in); the project's own records say what it is to them, owner or team from the committed roster, giver from the books. A self-host has no door and serves the public view. `visibility` is the
owner's word, the `dashboard:` section of `.open-autonomy/config.yaml` beside the bounds, read with the rest of the
repository's config. Four presets: **roadmap** (the default when the block is absent: the roadmap and the books to
everyone, the sessions, transcripts and the agent to the team), **open** (everything public), **status** (transcripts
and books for givers, calls and the agent for the team), **private** (team and up). Whether a deployment takes money is
which app it mounts, never a setting; Books meters whatever funds the agent either way. On the platform,
visibility narrows the page, never the truth: the API is public reads. A private deployment is private by its own wall.

### States a story must cover

Running, working now, pause requested, paused by the owner, spending stopped, not yet funded; with patrons and
without; GitHub Sponsors and Polar; platform and self-hosted; each preset as each viewer; long titles.
