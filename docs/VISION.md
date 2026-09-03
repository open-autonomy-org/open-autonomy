# Vision

Open Autonomy funds a project's agents in the open. Sponsors pay for token usage and nothing else. Every model call is metered against the project's account, so a sponsor can see that their money became that project's work, and everyone can watch the balance, the burn, the roadmap, and what the agent is building next.

## Why

Autonomous agents can now carry a real share of a software project's work. What they cannot do is pay for themselves. Open-source projects have no clean way to say "here is what the agent will do, here is what it costs, fund it" and then prove that the money went where it was promised.

Open Autonomy is that mechanism. The books are public. The roadmap is a file in the repository. The agent that works the roadmap is a checked-in Hermes setup anyone can read. The only thing between a sponsor's dollar and a model call is a meter.

## What we hold to

- **Token usage is the only thing funded.** No compute, no labor, no services. A balance buys model calls for one project's agent.
- **Every call is attributed.** Spend lands on the project's account at the moment it happens. The ledger is the cost authority; nothing is estimated after the fact.
- **The roadmap is the promise.** `ROADMAP.yml` says what will be built and in what order. The agent works it top to bottom and records what it finished.
- **The agent is readable.** Its identity, skills, and schedule live in `hermes/`. Changing what the agent does is a commit.
- **The platform shows; it does not steer.** The site and the README render the books, the vision, the roadmap, and later the agent's live state. They never drive the agent.

## What it is not

It is not an agent framework, a workflow compiler, or a hosting service. The agent is stock Hermes, run by the project owner wherever they like. The platform is a meter, a page, and a widget.
