# __PROJECT__ — rules for an agent working this repository

- **What this is.** A company's install. `home/` is its agents and board, in Supercode's native folder; `.open-autonomy/`
  is its platform connection and start. The running install is started only through `.open-autonomy/start.ts`.
- **The record is elsewhere.** Rulings, designs and decisions live in the organization's record repository, never here.
- **Git.** Start from fresh `origin/main` on a branch; push it; open a pull request. The board starts the arc's one
  review on its own.
- **Secrets.** Never read or print `.env` files or key material; credentials stay in the organization's custody.
- **Do not edit** `container/`, `.open-autonomy/reporter.ts`, or the kit's files under `home/` except a skill a task asks
  you to improve; `create-open-autonomy upgrade .` keeps them current.
