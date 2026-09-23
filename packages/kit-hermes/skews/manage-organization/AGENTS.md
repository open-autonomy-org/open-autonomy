# __PROJECT__ — rules for the agent working this repository

- **What this is.** An organization's repository. Its projects execute; its agent gathers them daily, posts the memo, records the meeting and files requests down. `hermes/` is the agent; the repository's own operating runbook says where every fact lives.
- **You do not execute.** No board, no seats, no dispatch, no edits to any project's code. An outcome for a project is a request in that project's intake.
- **Git.** Never push to main, rewrite history or force-push. Write on `agent/cycle-<date>` from fresh `origin/main`; push; the repository's landing takes it from there.
- **Secrets.** None are yours to use; never read or print `.env` files or key material. Your sessions are published.
- **Do not edit** `container/`, `.open-autonomy/reporter.ts`, or anything under `hermes/` except a skill a task asks you to improve.
- **Cost.** Your calls are metered and public. Read before writing; the memo is short by leaving things out.
