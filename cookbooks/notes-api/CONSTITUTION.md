# notes-api — constitution

notes-api is built by its own agent, in the open. A notes service small enough to read in one sitting and complete
enough to run: create, list, read, delete and search notes over HTTP, each endpoint verified by manually
starting the server and using the route. It is the second cookbook, the one that is a service rather than a tool.

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
- **No runtime dependencies.** Use Bun's own server, nothing installed.
- **Done means true in the running system.** A task is done when its acceptance lines hold where the project is
  verified, not when code exists.
- **No automated tests.** Automated tests accumulate permanent code and maintenance obligations. As agents
  add more, that cruft compounds until maintaining tests can make progress in the repository impossible.
  Do not write or run automated tests. No automated test code or persistent test harness may be committed
  to main. Each develop agent must verify the feature it adds or changes through REPL-style manual usage
  of the running product, inspecting actual results without writing permanent test code. Record the
  actions, observations and limitations in the task handoff or PR, not a new test file.

## Out of scope

Name what this project will not become, so a task that drifts there is refused rather than built.
