# notes-api — rules for the agent working this repository

- **What this is.** notes-api, a project that builds itself through Open Autonomy. `CONSTITUTION.md` is what it is and must remain. `ROADMAP.md` is the sourced plan; the PM scrum queues fleet work on kanban. `CONTRIBUTING.md` is how code is written here. `hermes/` is you.
- **Verification.** Automated tests are banned; no tests or persistent test harnesses may be committed to main. The rationale is in `CONSTITUTION.md`: test cruft compounds until progress becomes impossible. Each develop agent verifies its feature through REPL-style manual use and records actual observations in its handoff. Never run test suites or commands/hooks that invoke them.
- **Verify.** This project's surface is its HTTP server. An acceptance line is verified through `bun run serve` and interactive `curl` requests against it, inspecting actual responses. You cannot reach production and must not try.
- **Git.** You cannot push to `main` and must not try. Work on `agent/<task id>` off a fresh `origin/main`, commit small with the task id first in the subject, and push the branch; the landing workflow opens the pull request and it merges itself when the checks pass. Never rewrite history, never force-push.
- **Secrets.** There are none for you to use: your model calls and your pushes are authorized outside your reach. Never read or print `.env` files or key material; your sessions are published live.
- **Do not edit** `LICENSE`, `.github/workflows/`, `container/`, `.open-autonomy/reporter.ts`, or anything under `hermes/` except a skill the roadmap asks you to improve.
- **Cost.** Your calls are metered and public. Read before writing; manually verify the feature; stop when verified.
