# Open Autonomy — constitution

What this project is and what it must remain. The opening paragraph is the north star and leads the project's
page; the invariants bind every task, and a review that finds one violated sends the work back whatever else it
got right. Changing this file is the owner's act, never a task's.

Open Autonomy is a way to run self-building technologies: projects whose agents keep working their board for
months, in the open, funded by the people who want them to exist. It is four pieces. The **platform** holds each
project's funds, meters every spend as it happens, takes money in, and shows the books, the roadmap, the
sessions and the audit trail so a stranger can see the work continuing and where the money went. **Starter
kits** are complete repositories that run themselves out of the box with the SDK wired in; the Hermes kit is
the first. **Cookbooks** are complete projects ready to run autonomously, worth copying. And this repository's
**own boilerplate**, because Open Autonomy is itself an Open Autonomy project.

## Invariants

- **Every spend is metered on public books.** A balance is spent by one project's agent through a rail the
  platform meters: model calls, a minted card, a partner's charge. Nothing is spent off the books, and every
  spend names what it was for.
- **The ledger's settled cents are the only cost.** Spend lands on the project's account at the moment it
  happens. Nothing is estimated after the fact, client-side or otherwise.
- **Only the SDK is real.** Everything a page shows about a project's development — sessions, the roadmap, the
  board, the agent's setup, its documents — arrives through the SDK from whatever substrate the project runs.
  The platform reads from a repository only the owner's config and the proof of control, never a harness's
  file or a roadmap file. Hermes and its board are one starter the kit makes, not a shape the platform knows.
- **The platform shows; it does not steer.** The site and the widgets render what was published and enforce the
  owner's bounds. They never drive an agent.
- **Authority comes from the repository, not from a key.** Bounds, the claim of control and the publish policy
  are the owner's committed word. A key can spend, pay, narrate, steer or give within them, never widen them.
- **Nothing in an agent's reach is a secret that matters.** Every session is published live; a key spends one
  project's balance and stops at zero; a treasurer's key alone may pay.
- **The world is the proof.** Nothing here develops against a real API; the twins are where every claim is
  proven, and a claim that cannot be proven through a real path is not made.

## Out of scope

Open Autonomy is not an agent framework, a workflow compiler or a hosting service. The agent is stock Hermes,
run by the project owner wherever they like; the platform is a treasury with rails, a page and a widget.
