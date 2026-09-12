# The platform's pages, designed in Storybook

`bun run storybook` in this directory serves every page and part at http://localhost:6006, rendered from real
records captured from the live platform (`fixtures/`). Pages are server-rendered hono/jsx; a story renders one to
an HTML string. The source is `packages/backend/src/page/`: `theme.ts` (tokens and the one stylesheet), `parts.tsx`
(each panel), `project.tsx` (the project page). Nothing here is wired to the books until a page is adopted by the
router, so a design can move without the platform moving.

## The project page: what each panel owns

The page is one screen for a stranger deciding whether to fund, a patron checking in, or the owner glancing. Every
detail is a link away. A control lives with the panel that owns its job; a shortcut names its home.

| Panel | Owns | Controls | Shortcuts (home elsewhere) |
|---|---|---|---|
| Top bar | the deployment: brand, Explore | | Become a patron → the funding card |
| Hero | who the project is: cover, avatar, name, tagline, one word on the agent (running, working now, pause requested, paused, spending stopped, not yet funded), patrons, per month, runway | | the repository ↗ |
| About | what the project is: its lead paragraph | | Read more → `/p/:account/about` |
| Right now | what the agent is doing this minute: the live run, else the last run and the next fire, else the schedule; a pause, when the owner said so | | Every session → `/p/:account/sessions` |
| Next up | what is intended: up to five items, titles and a status word, in progress first | | the roadmap → `/p/:account/roadmap` |
| Recently shipped | what landed: up to five, newest first, with release and when | | all shipped → `/p/:account/roadmap?view=releases` |
| Patrons | who pays: the wall | | |
| Funding (side) | the money: patronage per month or the balance, runway against the goal, received and spent | Become a patron (→ tiers) | the books → `/p/:account/books` |
| Become a patron (side) | how to give: the tiers, one button per door (Polar checkout per tier, or GitHub Sponsors once), and under "Other ways to give", grant credits and a coupon | Join / Sponsor on GitHub / Give / Redeem | |
| Foot | the sub-pages | | the books, roadmap, sessions, the agent, team |

What left the page, and where it lives now: acceptance lines (the item page), the timeline's views (`/roadmap`),
session transcripts (`/sessions`), the agent's setup (`/setup`), envelopes, bounds, the gift feed and every metered
call (`/books`), the changelog (nowhere: what shipped is the timeline's past). The page never reloads under the
reader; numbers update in place.

## States a story must cover

Running, working now (a live run), pause requested (a run finishing), paused by the owner, spending stopped
(balance at zero), not yet funded (no money, no runs, no roadmap); with patrons and without; GitHub Sponsors and
Polar; long titles.
