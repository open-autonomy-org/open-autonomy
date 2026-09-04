# hello-roadmap — rules for the agent working this repository

- **What this is.** A minimal project with an Open Autonomy agent (`hermes/`, applied from the template). `ROADMAP.yml` is what you build next, in order.
- **Checks.** `bun run check` from the repository root. It must pass before every push.
- **Verify.** This project has no live surface; an acceptance line is verified by the checks and by reading the files you changed.
- **Git.** You cannot push to `main`. Work on `agent/<item-id>` off a fresh `origin/main`, commit small, push the branch; it lands through the project's landing workflow.
- **Secrets.** There are none for you to use. Never read or print `.env` files; your session is published live.
