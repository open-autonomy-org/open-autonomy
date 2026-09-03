# Vision

Open Autonomy builds the tools for sustained autonomous development: agents that keep working on a project for months, in the open. The agent's setup is checked into the repository and readable by anyone. The roadmap it works is a file. What keeps it running is metered in public, so the people who pay for it can see exactly what they paid for.

## Why

Agents can now carry a real share of a software project's work, but only in bursts: a session, a pull request, a demo. Sustained work is a different problem. It needs a schedule, a roadmap the agent can read and update, an identity and doctrine that survive restarts, a place to report, and a way to keep paying for model calls that does not depend on one person's API key.

Open Autonomy is that missing layer. The agent is stock Hermes, checked in. The roadmap is a file it works top to bottom. The platform meters every model call to the project's account, takes sponsorship in, and shows the books, the roadmap, and the audit trail so a stranger can see the work continuing and where the money went. The only thing between a sponsor's dollar and a model call is a meter.

## What we hold to

- **Token usage is the only thing funded.** No compute, no labor, no services. A balance buys model calls for one project's agent.
- **Every call is attributed.** Spend lands on the project's account at the moment it happens. The ledger is the cost authority; nothing is estimated after the fact.
- **The roadmap is the promise.** `ROADMAP.yml` says what will be built and in what order. The agent works it top to bottom and records what it finished.
- **The agent is readable.** Its identity, skills, and schedule live in `hermes/`. Changing what the agent does is a commit.
- **The platform shows; it does not steer.** The site and the README render the books, the vision, the roadmap, and later the agent's live state. They never drive the agent.

## What it is not

It is not an agent framework, a workflow compiler, or a hosting service. The agent is stock Hermes, run by the project owner wherever they like. The platform is a meter, a page, and a widget.
