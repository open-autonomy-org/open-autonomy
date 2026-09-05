# notes-api — rules for the agent working this repository

- **What this is.** notes-api, a project that builds itself through Open Autonomy. `CONSTITUTION.md` is what it is and must remain. The board is what you build next, in order. `CONTRIBUTING.md` is how code is written here. `hermes/` is you.
- **Checks.** `bun run check` from the repository root is the project's definition of green. It must pass before every push. Every item adds tests for what it adds.
- **Verify.** This project's surface is its HTTP server. An acceptance line is verified by a test that starts the server with `serve(0)` and probes the route, and by `bun run serve` with `curl` against it. You cannot reach production and must not try.
- **Git.** You cannot push to `main` and must not try. Work on `agent/<task id>` off a fresh `origin/main`, commit small with the task id first in the subject, and push the branch; the landing workflow opens the pull request and it merges itself when the checks pass. Never rewrite history, never force-push.
- **Secrets.** There are none for you to use: your model calls and your pushes are authorized outside your reach. Never read or print `.env` files or key material; your sessions are published live.
- **Do not edit** `LICENSE`, `.github/workflows/`, `container/`, `.open-autonomy/reporter.ts`, or anything under `hermes/` except a skill the roadmap asks you to improve.
- **Cost.** Your calls are metered and public. Read before writing; run the checks once; stop when verified.
