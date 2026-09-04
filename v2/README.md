# Open Autonomy

**A way to run self-building technologies.** A project whose agent keeps working its roadmap for months,
in the open: the setup is checked in, the roadmap is a file, and what the agent spends is funded by people
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

```text
apps/platform        the worker: the books, the rails, the development stream, the site, the widgets
packages/sdk         @open-autonomy/sdk: the roadmap codec, the stream client, the key helpers, the wire
packages/kit-hermes  create-open-autonomy: the Hermes kit (create / adopt / check / upgrade)
cookbooks/todo-cli   the cookbook the world runs
world/               the world: twins + the platform + the kit on the cookbook; `bun world/run.ts check`
```

```bash
bun run check          # every package's tests and typecheck
bun run check:world    # the gate: the world, one clock fire, the audit (needs TWINS_ROOT)
```
