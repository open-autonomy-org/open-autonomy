# Vision

Open Autonomy is a way to run self-building technologies: projects whose agents keep working their roadmap for months, in the open, funded by the people who want them to exist. It is four pieces. The **platform** is a Patreon-style app where people fund projects with agentic funds; agents spend through rails that each leave a public audit trail (agent endpoints for model usage today, minted cards and partner services planned), and an SDK lets a project report its own development so the page shows the work behind every cent. **Starter kits** are complete repositories that run themselves out of the box with the SDK wired in; the Hermes kit is the default. **Cookbooks** are complete projects ready to run autonomously, worth copying. And this repository's **own boilerplate** — its world, its own Hermes, its files — because Open Autonomy is itself an Open Autonomy project.

## Why

Agents can now carry a real share of a software project's work, but only in bursts: a session, a pull request, a demo. Sustained work is a different problem. It needs a schedule, a roadmap the agent can read and update, an identity and doctrine that survive restarts, a place to report, and a way to keep paying for model calls that does not depend on one person's API key.

Open Autonomy is that missing layer. The agent is stock Hermes, checked in. The roadmap is a file it works top to bottom. The platform holds the project's funds, meters each spend to its account as it happens, takes sponsorship in, and shows the books, the roadmap, the sessions and the audit trail so a stranger can see the work continuing and where the money went. Between a sponsor's dollar and the agent's spend there is a rail with a meter on it, and nothing else.

## What we hold to

- **Every rail is public.** A balance is spent by one project's agent, through a rail the platform meters: model calls today, minted cards and partners as they land. Nothing is spent off the books.
- **Every call is attributed.** Spend lands on the project's account at the moment it happens. The ledger is the cost authority; nothing is estimated after the fact.
- **The roadmap is the promise.** `ROADMAP.yml` says what will be built and in what order. The agent works it top to bottom and records what it finished.
- **The agent is readable.** Its identity, skills, and schedule live in `hermes/`. Changing what the agent does is a commit.
- **The platform shows; it does not steer.** The site and the README render the books, the vision, the roadmap and the agent's sessions as it reports them through the SDK. They never drive the agent.

## What it is not

It is not an agent framework, a workflow compiler, or a hosting service. The agent is stock Hermes, run by the project owner wherever they like. The platform is a treasury with rails, a page, and a widget.
