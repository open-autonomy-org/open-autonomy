# The platform's pages, designed in Storybook

`bun run storybook` in this directory serves every page and part at http://localhost:6006, rendered from real
records captured from the live platform (`fixtures/`). Pages are server-rendered hono/jsx; a story renders one to
an HTML string. Nothing here is wired to the router yet, so a design can move without the platform moving.

## The core and an app around it

Two story trees, because two things exist. **Core** is exactly what a self-hosted deployment serves: the source is
`packages/backend/src/page/` (`theme.ts` the one stylesheet, `model.ts` roles, visibility and the slot contract,
`parts.tsx` each panel, `project.tsx` the shell and Overview, `tabs.tsx` Work, Item, Sessions, Session, Books, Agent).
The core knows givers (the books), team and owner (the roster) and everyone else. It knows nothing about patrons,
tiers, sponsors, coupons or Explore, and carries no code for them switched off.

**Platform** is the same pages with the platform's additions entering through the core's slots: the source is
`apps/platform/src/page/patronage.tsx` (the ask, the tiers, subscribers on the wall, subscriptions in Money in,
Explore in the bar). Which code ships is decided by which package a deployment mounts, at build time, as
`apps/self-host` and `apps/platform` already do. There is no deployment flag.

| Slot | Where | The platform puts |
|---|---|---|
| `nav` | the top bar | Explore |
| `cta` | the top bar | Become a patron |
| `meta` | the hero's facts line | patrons, per month (the core shows the balance instead) |
| `side` | top of Overview's side column | the tiers |
| `main` | cards after Overview's main column | |
| `wall`, `wallTitle` | more chips on the givers wall, and its name | subscribers and sponsors, "Patrons" |
| `moneyIn` | rows in Books' money in | subscriptions |
| `give` | Books | its own give doors |
| `styles` | after the core's stylesheet | its own CSS, a constant of the app, built from the core's tokens |

A slot is additive and inside the core's layout: an app cannot remove, reorder or rewrite what the core shows.

## The project: GitHub's frame, Kickstarter's campaign, Patreon's rhythm
One address per thing, tabs for its depths, roles deciding what you see and may do, never a second site:

| Address | What it is |
|---|---|
| `/explore` | the deployment's front (platform); a self-host with one project lands on it |
| `/owner` | an org: its projects, its grants pool, its sponsors |
| `/login` | a person: a funder's books |
| `/owner/project` | Overview: the composed page below |
| `/owner/project/work`, `…/work/:item` | the timeline as a board (promised, in progress, shipped), one item |
| `/owner/project/sessions`, `…/sessions/:key` | the stream, live first; one transcript |
| `/owner/project/books` | money in with its givers, earmarks, the owner's bounds, every metered call |
| `/owner/project/agent` | who it is, how it runs, its state, the owner's one control |
| `/owner/project/team` | the roster |

Reserved top-level names: `explore`, `give`, `v1`, `admin`, `settings`.

### Overview: what each panel owns

| Panel | Owns | Controls | Shortcuts |
|---|---|---|---|
| Top bar | the deployment: brand, Explore (platform) | | Become a patron → funding (deployments that take money) |
| Hero | who the project is: cover, avatar, name, tagline, who builds it, the one word on the agent, patrons and per month (or the balance), runway | | the repository ↗ |
| Tabs | the depths, with counts | | each tab |
| About | the lead paragraph | | Read more → about |
| The workshop | the live session and its latest turns; else the last run's own words, the next fire, thirty days of spend; else the pause; under it the recent runs as a feed | | Follow / Read the session; Every session → sessions |
| Next up · Recently shipped | five titles each | | the roadmap → work |
| Patrons | the wall: everyone who put money in | | |
| Funding (side) | patronage per month or the balance, runway against the goal, three numbers | Become a patron → tiers | See the books → books |
| Become a patron (side) | tiers; one door per kind; other ways to give under a fold | Join / Sponsor on GitHub / Give / Redeem | |

### Who sees what

`viewer` is public, giver, team or owner: giver from the books, team and owner from the roster. `visibility` is the
owner's word, proposed as a `dashboard:` section in `.open-autonomy/config.yaml` beside the bounds; the platform does
not read it yet, so every deployment renders `open` today. Three presets: **open** (everything public), **status** (transcripts and books for
givers, calls and the agent for the team), **private** (team and up). Whether a deployment takes money is
which app it mounts, never a setting; Books meters whatever funds the agent either way. On the platform,
visibility narrows the page, never the truth: the API is public reads. A private deployment is private by its own wall.

### States a story must cover

Running, working now, pause requested, paused by the owner, spending stopped, not yet funded; with patrons and
without; GitHub Sponsors and Polar; platform and self-hosted; each preset as each viewer; long titles.
