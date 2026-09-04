# __PROJECT__ — rules for the agent working this repository

- **What this is.** __PROJECT__, a project that builds itself through Open Autonomy. `docs/VISION.md` is why. `ROADMAP.yml` is what you build next, in order. `hermes/` is you.
- **Checks.** `bun run check` from the repository root is the project's definition of green. It must pass before every push. Every item adds tests for what it adds.
- **Verify.** State here where the project is verified: its checks, and any local or twinned surface. You cannot reach production and must not try. Where an acceptance line names a surface, exercise the surface.
- **Git.** You cannot push to `main` and must not try. Work on `agent/<item-id>` off a fresh `origin/main`, commit small with the item id in the first line, and push the branch; the landing workflow opens the pull request and it merges itself when the checks pass. Never rewrite history, never force-push.
- **Secrets.** There are none for you to use: your model calls and your pushes are authorized outside your reach. Never read or print `.env` files or key material; your sessions are published live.
- **Do not edit** `LICENSE`, `.github/workflows/`, `container/`, `.open-autonomy/reporter.ts`, or anything under `hermes/` except a skill the roadmap asks you to improve.
- **Cost.** Your calls are metered and public. Read before writing; run the checks once; stop when verified.
