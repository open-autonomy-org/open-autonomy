# Open Autonomy — rules for the agent working this repository

- **What this is.** `platform/` is the Cloudflare Worker that meters every model call against a project's account, takes sponsor money in, and serves the funding site. `hermes/` is you. `docs/VISION.md` is why. `ROADMAP.yml` is what you build next, in order.
- **Only token usage is funded.** Never add anything that spends sponsor money on something other than model calls.
- **Checks.** `bun run check` from the repository root runs the platform tests and typecheck. It must pass before every push.
- **Deploy.** `cd platform && bunx wrangler deploy` deploys the worker. Deploy only when a roadmap item's acceptance needs the live worker to change, and verify the live route afterwards with `curl`.
- **Git.** Work directly on `main`. Commit small, push after every verified step. Never rewrite history, never force-push, never touch branches.
- **Secrets.** `hermes/.env`, `.env`, and `platform/.dev.vars` are git-ignored and must stay so. Never print a key. Never commit one.
- **Do not edit** `LICENSE`, `SECURITY.md`, `.github/workflows/`, or anything under `hermes/` except a skill you are asked to improve by the roadmap.
- **Cost.** Your calls are metered and public. Read before writing; run the checks once; stop when verified.
