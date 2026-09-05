# notes-api — constitution

notes-api is built by its own agent, in the open. A notes service small enough to read in one sitting and complete
enough to run: create, list, read, delete and search notes over HTTP, each endpoint with the test that starts
the server and probes it. It is the second cookbook, the one that is a service rather than a tool.

What this project is and what it must remain. Its opening paragraph is the project's north star and leads its
page; the invariants below bind every task, and a review that finds one violated sends the work back whatever
else it got right. Changing this file is the owner's act, never a task's.

## Invariants

- **The board is the promise.** What will be built, in what order, is filed by the owner. The agent works it and
  never invents work.
- **The agent is readable.** Its identity, skills and schedule live in `hermes/`; changing what it does is a
  commit anyone can read.
- **Every spend is on the books.** Every model call and every purchase is metered to this project's account on
  the platform and published, with what it was for.
- **One endpoint, one test; no dependencies.** bun's own server and test runner, nothing installed.
- **Done means true in the running system.** A task is done when its acceptance lines hold where the project is
  verified, not when code exists.

## Out of scope

Name what this project will not become, so a task that drifts there is refused rather than built.
