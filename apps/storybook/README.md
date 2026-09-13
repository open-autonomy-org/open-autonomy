# The platform's pages, designed in Storybook

`bun run storybook` in this directory serves every page at http://localhost:6006, rendered from real records
captured from the live platform (`fixtures/`). Pages are server-rendered hono/jsx; a story renders one to an HTML
string, so a story is the served page with the records held still.

## Three surfaces

**The landing page** (`Platform/Landing`, `apps/platform/src/page/landing.tsx`) is how an outsider meets a project:
Product Hunt's top over Kickstarter's campaign. No cover band (software has no honest picture for one) and no
tabs. The top is the icon, the name, the one line, the tags (owner, harness, model, schedule) and two buttons. The
hero is the media on the left and the money on the right: a dark poster of the agent at work (what it is doing this
minute or what it last did, its metered days as a bar chart, what it last shipped) beside Kickstarter's panel (a
month's patronage or the balance, the patrons' faces, days of runway against the owner's goal, the button). Below:
the story, the roadmap as one shipped/in-progress/ahead bar with next up and recently shipped, the patrons wall,
and the tiers pinned beside them. Money in is GitHub Sponsors and grant credits. Everything deeper is a link into
the dashboard, shown only to a viewer the owner admits there. It is the platform's alone; a self-host has no
landing page.

**The dashboard** (`Core/Dashboard`, `packages/backend/src/dash/`) is the work as the team reads it, built from
Supercode's UI kit (`@volter-ai-dev/supercode-ui`): the kit's session inventory and conversation carry the sessions
and a transcript, its workflow board carries the roadmap, its job details, runs and pause carry the schedule and
the owner's one control; `model.ts` projects the SDK's records into the kit's models, `app.tsx` is the Preact app
around them (the rail, the facts strip, the money, the roster) in the kit's own tokens, light and dark. The worker
renders the same tree and the browser hydrates it, where a live session's turns land as they are narrated. Its
scale and structure are its own, not the landing page's. The `dashboard:` block in `.open-autonomy/config.yaml` decides
which panels each role sees and whether the public sees any of it (`packages/backend/src/page/model.ts` holds the
presets: roadmap by default, open, status, private); a self-host serves this and nothing else.

**The front and a name's page** (`Core/Front`, `packages/backend/src/page/directory.tsx` and `account.tsx`): the
deployment's front (the grid of its projects, the ones working now first) and a GitHub login's page, org or
person, one namespace: what it owns here and what it gave. The platform puts its words and its patronage figures
into them through the core's slots; a self-host serves them bare.

| Address | What it is |
|---|---|
| `/` | the deployment's front: the platform's Explore; a self-host lists its projects |
| `/name` | a GitHub login, org or person: its projects, its grants pool, its giving books |
| `/owner/project` | the landing page (platform) |
| `/owner/project/dashboard` | the dashboard's Overview, then `…/dashboard/{sessions,board,books,agent,team}`, `…/sessions/:key`, `…/board/:item` |
| `/owner/project/about` | the project's document in full |

The landing page's and the dashboard's addresses are the design's; the router still serves the earlier project
page until the wiring lands.

### States a story must cover

Running, working now, pause requested, paused by the owner, spending stopped, not yet funded; with patrons and
without; platform and self-hosted; each preset as each viewer; a phone's width; long titles.
