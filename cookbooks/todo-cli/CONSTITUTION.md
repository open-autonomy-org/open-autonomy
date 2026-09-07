# todo-cli — constitution

todo-cli is built by its own agent, in the open. A todo list command line tool, built item by item, small enough that
each task is one command and one test, and `bun run check` is the whole definition of done.

What this project is and what it must remain. Its opening paragraph is the project's north star and leads its
page; the invariants below bind every task, and a review that finds one violated sends the work back whatever
else it got right. Changing this file is the owner's act, never a task's.

## Invariants

- **The roadmap holds the plan.** The owner sets direction and constraints. The Hermes PM maintains sourced
  working notes in `ROADMAP.md`, reconciles contributions and decisions, and queues fleet work on kanban.
  Human implementation commitments require acceptance; human release review is mandatory.
- **The agent is readable.** Its identity, skills and schedule live in `hermes/`; changing what it does is a
  commit anyone can read.
- **Every spend is on the books.** Every model call and every purchase is metered to this project's account on
  the platform and published, with what it was for.
- **Done means true in the running system.** A task is done when its acceptance lines hold where the project is
  verified, not when code exists.
- **No automated test runs for more than thirty seconds.** All of them together, ever. Behavior is verified by
  driving the running system.

## Out of scope

Name what this project will not become, so a task that drifts there is refused rather than built.
