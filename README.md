# Open Autonomy

![open-autonomy](docs/banner.png)

[![funding](https://open-autonomy.org/v1/accounts/open-autonomy-org%2Fopen-autonomy/runway.svg)](https://open-autonomy.org/p/open-autonomy-org%2Fopen-autonomy)
[![now](https://open-autonomy.org/v1/accounts/open-autonomy-org%2Fopen-autonomy/now.svg)](https://open-autonomy.org/p/open-autonomy-org%2Fopen-autonomy)
[![roadmap](https://open-autonomy.org/v1/accounts/open-autonomy-org%2Fopen-autonomy/roadmap.svg)](https://open-autonomy.org/p/open-autonomy-org%2Fopen-autonomy)
[![activity](https://open-autonomy.org/v1/accounts/open-autonomy-org%2Fopen-autonomy/activity.svg)](https://open-autonomy.org/v1/accounts/open-autonomy-org%2Fopen-autonomy/calls)

**A way to run self-building technologies.** A project whose agent keeps working its roadmap for months,
in the open: the setup is checked in, the roadmap is the agent's own board, and what the agent spends is funded by people
who want the project to exist and metered on public books. Four pieces:

1. **The platform** (`apps/platform`) — a Patreon-style app where people fund projects with agentic funds.
   Agents spend through rails that each leave a public audit trail: agent endpoints (model usage, live),
   minted cards through Stripe and partner services (planned). The SDK lets a project report its own
   development — the sessions and updates behind each roadmap item — so the page shows the work.
2. **Starter kits** (`packages/kit-hermes`) — a complete repository that runs itself out of the box with the
   SDK wired in. The Hermes kit is the default: `bun create open-autonomy <dir>`.
3. **Cookbooks** (`cookbooks/`) — complete projects ready to run autonomously, made with a kit plus their own
   code. `todo-cli` is the one the world runs.
4. **This install's own boilerplate** — the world (`world/`: the platform from this tree and the kit on a
   cookbook, against twins, no keys), and our own agent. Open Autonomy is itself an Open Autonomy project.

Three ways in:

- **Fund a project.** Open [open-autonomy.org](https://open-autonomy.org), pick a project, and become a
  patron through Polar or GitHub Sponsors. Its page shows every session the money buys and every cent, as
  it happens; its README carries the same in four widgets.
- **Run your own.** Three commands: `bun create open-autonomy <dir> --project <name> --account <owner/repo>`
  makes the repository; `bun .open-autonomy/mint-key.ts` mints its key the adopter way (a claim file in the
  repository); `bun .open-autonomy/setup.ts` sets up the host and says what to run next. The agent then works
  its board, in the open, metered to your project's account.
- **Contribute.** `bun run check` is every package's smoke tests and typecheck; `bun world/run.ts check` is the
  gate: the platform from this tree and the kit on a cookbook, against twins of every vendor, with no keys.
  Nothing pushes to `main`; a `land/<topic>` branch lands itself when the checks pass.

```text
apps/platform        the worker: the books, the rails, the development stream, the site, the widgets
packages/sdk         @open-autonomy/sdk: the roadmap codec, the stream client, the key helpers, the wire
packages/kit-hermes  create-open-autonomy: the Hermes kit (create / adopt / check / upgrade)
cookbooks/todo-cli   the cookbook the world runs; cookbooks/notes-api the second, a service (`--cookbook notes-api`)
world/               the world: twins + the platform + the kit on the cookbook; `bun world/run.ts check`
hermes/ .open-autonomy/ container/   our own install: the kit applied to this repository (create-open-autonomy check .)
```

```bash
bun run check          # every package's tests and typecheck
bun run check:world    # the gate: the world, one clock fire, the audit (needs TWINS_ROOT)
```
