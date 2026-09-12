# The platform's pages, designed in Storybook

`bun run storybook` in this directory serves every page and part at http://localhost:6006, rendered from real
records captured from the live platform (`fixtures/`). Pages are server-rendered hono/jsx; a story renders one to
an HTML string. The source is `packages/backend/src/page/`: `theme.ts` (tokens and the one stylesheet), `parts.tsx`
(each panel), `project.tsx` (the project page). Nothing here is wired to the books until a page is adopted by the
router, so a design can move without the platform moving.

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

`viewer` is public, patron, team or owner. `visibility` is the owner's committed word (`dashboard:` in
`.open-autonomy/config.yaml`), with three presets: **open** (everything public), **status** (transcripts and books for
patrons, calls and the agent for the team), **private** (team and up). The deployment says whether it takes money;
without it there is no rail, no wall and no ask, and Books still meters whatever funds the agent. On the platform,
visibility narrows the page, never the truth: the API is public reads. A private deployment is private by its own wall.

### States a story must cover

Running, working now, pause requested, paused by the owner, spending stopped, not yet funded; with patrons and
without; GitHub Sponsors and Polar; platform and self-hosted; each preset as each viewer; long titles.
