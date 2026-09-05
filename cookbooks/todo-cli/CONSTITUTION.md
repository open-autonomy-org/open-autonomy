# todo-cli — constitution

What this project is and what it must remain. Its opening paragraph is the project's north star and leads its
page; the invariants below bind every task, and a review that finds one violated sends the work back whatever
else it got right. Changing this file is the owner's act, never a task's.

todo-cli is built by its own agent, in the open. A todo list command line tool, built item by item, small enough that
each task is one command and one test, and `bun run check` is the whole definition of done.

## Invariants

- **The board is the promise.** What will be built, in what order, is filed by the owner. The agent works it and
  never invents work.
- **The agent is readable.** Its identity, skills and schedule live in `hermes/`; changing what it does is a
  commit anyone can read.
- **Every spend is on the books.** Every model call and every purchase is metered to this project's account on
  the platform and published, with what it was for.
- **Done means true in the running system.** A task is done when its acceptance lines hold where the project is
  verified, not when code exists.

## Out of scope

Name what this project will not become, so a task that drifts there is refused rather than built.
