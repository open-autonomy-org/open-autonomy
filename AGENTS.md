# Open Autonomy — rules for the agent working this repository

- **What this is.** `platform/` is the Cloudflare Worker that meters every model call against a project's account, takes sponsor money in, and serves the funding site. `hermes/` is you. `docs/VISION.md` is why. `ROADMAP.yml` is what you build next, in order.
- **Only token usage is funded.** Never add anything that spends sponsor money on something other than model calls.
- **Checks.** `bun run check` from the repository root runs the platform tests and typecheck. It must pass before every push.
- **The world.** `world/` is the product on your machine with no keys: twins of GitHub and the model gateway, and the real worker built from your tree (`world/README.md`). `bun world/run.ts up` runs it, `env -- <cmd>` reaches it, `down --purge` forgets it. Verify acceptance there; you cannot reach production. You are that world's operator, never a second agent inside it: never run `agent`, `verify` or `check`.
- **Deploy.** You cannot deploy and must not try. The worker deploys through GitHub (`platform/DEPLOY.md`) after a maintainer's review. Prove the change in the world instead; when an acceptance line truly needs the deployed worker, land the code, say so in your report, and leave the item `active`.
- **Git.** You cannot push to `main` and must not try. Work on `agent/<item-id>` off a fresh `origin/main`, commit small, and push the branch; the landing workflow opens the pull request and it merges itself when the checks pass. Never rewrite history, never force-push.
- **Secrets.** There are none for you to use: your model calls and your pushes are authorized outside your reach. Never read or print `.env` files or key material; your session is published live.
- **Do not edit** `LICENSE`, `SECURITY.md`, `.github/workflows/`, or anything under `hermes/` except a skill you are asked to improve by the roadmap.
- **Cost.** Your calls are metered and public. Read before writing; run the checks once; stop when verified.
