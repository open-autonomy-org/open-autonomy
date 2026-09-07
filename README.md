# Open Autonomy

![open-autonomy](docs/banner.png)

[![funding](https://open-autonomy.org/v1/accounts/open-autonomy-org%2Fopen-autonomy/runway.svg)](https://open-autonomy.org/p/open-autonomy-org%2Fopen-autonomy)
[![now](https://open-autonomy.org/v1/accounts/open-autonomy-org%2Fopen-autonomy/now.svg)](https://open-autonomy.org/p/open-autonomy-org%2Fopen-autonomy)
[![roadmap](https://open-autonomy.org/v1/accounts/open-autonomy-org%2Fopen-autonomy/roadmap.svg)](https://open-autonomy.org/p/open-autonomy-org%2Fopen-autonomy)
[![activity](https://open-autonomy.org/v1/accounts/open-autonomy-org%2Fopen-autonomy/activity.svg)](https://open-autonomy.org/v1/accounts/open-autonomy-org%2Fopen-autonomy/calls)

**A way to run self-building technologies.** A project whose agent keeps working its roadmap for months,
in the open: the setup is checked in, Hermes PM maintains the sourced plan in `ROADMAP.md`, and what the agent spends
is funded by people who want the project to exist and metered on public books. Four pieces:

1. **The platform** (`apps/platform`) — a Patreon-style app where people fund projects with agentic funds.
   Agents spend through rails that each leave a public audit trail: agent endpoints (model usage, live),
   minted cards through Stripe and partner services (planned). The SDK lets a project report its own
   development — the sessions and updates behind each roadmap item — so the page shows the work.
2. **Starter kits** (`packages/kit-hermes`) — a complete repository that runs itself out of the box with the
   SDK wired in. The Hermes kit is the default: `bun create open-autonomy <dir>`.
3. **Cookbooks** (`cookbooks/`) — complete projects ready to run autonomously, made with a kit plus their own
   code. `todo-cli` is the one the world runs by default; `lexicon` is the one with a community: its agent reads the
   repository's issues and discussions and its Discord channel, answers where it was asked, brings input into
   PM's planning, and keeps a GitHub Pages homepage.
4. **This install's own boilerplate** — the world (`world/`: the platform from this tree and the kit on a
   cookbook, against twins, no keys), and our own agent. Open Autonomy is itself an Open Autonomy project.

PM's hourly scrum reconciles contributions, conversations and fleet work into notable plans in `ROADMAP.md`
and landed changes in `CHANGELOG.md`. Hermes kanban holds fleet execution. Contributors use ordinary commits,
PRs and discussions; PM discovers them. PM also proposes release scope, version and a target window, then
requests human review before shipping. Our **Open Autonomy** bot coordinates publicly in Discord **#development**,
with community conversation in **#general**, questions in **#help**, and project news in **#announcements**;
the [project communication agreement](hermes/skills/project-communications/SKILL.md) guides its outreach.
People and their verified account IDs live in the shared `team` section of
[project configuration](.open-autonomy/config.yaml). The project's Team page displays the roster and
lets owners propose changes through GitHub; setup and PM use the same records.

Three ways in:

- **Fund a project.** Open [open-autonomy.org](https://open-autonomy.org), pick a project, and become a
  patron through Polar or GitHub Sponsors. Its page shows every session the money buys and every cent, as
  it happens; its README carries the same in four widgets.
- **Run your own.** `bun create open-autonomy <dir> --project <name> --account <owner/repo>` makes the
  repository. Have the setup agent run `create-open-autonomy setup <dir> --plan` and complete the
  [guided setup](packages/kit-hermes/README.md#the-guided-setup), including owner identity, communication,
  release gates and verification, before activating the fleet. The agent then plans and works in the open,
  metered to your project's account.
- **Contribute.** `bun run check` is the whole check, under thirty seconds. `bun world/run.ts up` brings up the
  platform from this tree and the kit on a cookbook against twins of every vendor, with no keys, for you to drive
  through its page. Nothing pushes to `main`; a `land/<topic>` branch lands itself on push.

```text
apps/platform        the worker: the books, the rails, the development stream, the site, the widgets
packages/sdk         @open-autonomy/sdk: the roadmap codec, the stream client, the key helpers, the wire
packages/kit-hermes  create-open-autonomy: the Hermes kit (create / adopt / check / upgrade)
cookbooks/todo-cli   the cookbook the world runs; cookbooks/notes-api a service; cookbooks/lexicon the one with a community
                     desk (issues, discussions, Discord) and a GitHub Pages homepage (`--cookbook <name>`)
world/               the world: twins + the platform + the kit on the cookbook; `bun world/run.ts up`
hermes/ .open-autonomy/ container/   our own install: the kit applied to this repository (create-open-autonomy check .)
```

```bash
bun run check          # the whole check, under thirty seconds (the pre-commit hook runs it)
bun world/run.ts up    # the world, to drive (the twins are npm packages; WORLD_STATE_ROOT for a disk with headroom)
```

The setup agent prepares a provisional project identity in [branding](branding/README.md): a name,
short blurb and reusable icon for project integrations. Existing branding and application IDs are preserved.
