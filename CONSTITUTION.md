# Open Autonomy — constitution

Open Autonomy is a way to run self-building technologies: projects whose agents keep working their board for
months. Its engine (`packages/backend`) holds each project's funds, meters every spend as it happens, takes
money in, and shows the books, the roadmap, the sessions and the audit trail to the project's audience; it runs
private by default, its audience whoever its operator names. The public part is the **platform**: the engine
configured public, where projects work in the open, funded by the people who want them to exist, so a stranger
can see the work continuing and where the money went. Beside the engine and the platform are three pieces.
**Starter kits** are complete repositories that run themselves out of the box with the SDK wired in; the Hermes kit
is the first. **Cookbooks** are complete projects ready to run autonomously, worth copying. And this
repository's **own boilerplate**, because Open Autonomy is itself an Open Autonomy project.

What this project is and what it must remain. The opening paragraph is the north star and leads the project's
page; the invariants bind every task, and a review that finds one violated sends the work back whatever else it
got right. Changing this file is the owner's act, never a task's.

## Invariants

The invariants bind the engine wherever it runs. Where they say "public" they mean the deployment's audience:
everyone on the platform, the operator's named audience (a team, a client) on a private deployment, and nothing
is shown beyond it. Private is the engine's default; public is a deployment's configuration, the platform's.
A project's committed word narrows what its deployment shows, never widens it.

- **Every spend is metered on public books.** A balance is spent by one project's agent through a rail the
  engine meters: model calls, a minted card, a partner's charge. Nothing is spent off the books, and every
  spend names what it was for.
- **The ledger's settled cents are the only cost.** Spend lands on the project's account at the moment it
  happens. Nothing is estimated after the fact, client-side or otherwise.
- **Only the SDK is real.** Everything a page shows about a project's development — sessions, the roadmap, the
  board, the agent's setup, its documents — arrives through the SDK from whatever substrate the project runs.
  The engine reads from a repository only the owner's config and the proof of control, never a harness's
  file or a roadmap file. Hermes and its board are one starter the kit makes, not a shape the engine knows.
- **The engine shows; it does not steer.** Its pages and widgets render what was published and enforce the
  owner's bounds. They never drive an agent.
- **Authority comes from the repository, not from a key.** Bounds, the claim of control and the publish policy
  are the owner's committed word. A key can spend, pay, narrate, steer or give within them, never widen them.
- **Nothing in a public agent's reach is a secret that matters.** Every public agent's session is published live. An
  agent whose audience is the team or the owner knows only what that audience may, and its sessions are published
  only to it. Nothing in any agent's reach is a secret that matters beyond its audience, and every spend is on the
  public books; a key spends one project's balance and stops at zero; a treasurer's key alone may pay.
- **No automated tests.** Automated tests accumulate permanent code and maintenance obligations. As agents
  add more, that cruft compounds until maintaining tests can make progress in the repository impossible.
  Do not write or run automated tests. No automated test code or persistent test harness may be committed
  to main. Each develop agent must verify the feature it adds or changes through REPL-style manual usage
  of the running product, inspecting actual results without writing permanent test code. Record the
  actions, observations and limitations in the task handoff or PR, not a new test file.
- **Nothing here develops against a real API.** The twins are where every claim is exercised, by hand; a claim
  that cannot be exercised through a real path is not made.

## Out of scope

Open Autonomy is not an agent framework, a workflow compiler or a hosting service. The agent is a stock harness
(Hermes is the first), run by the project owner wherever they like; the kit renders its brain for the harness the
owner picks and never implements one; the engine is a treasury with rails, a page and a widget, and the platform
is that engine in public.
