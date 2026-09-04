# todo-cli — rules for the agent working this repository

- **What this is.** A todo list CLI in TypeScript on bun, with an Open Autonomy agent (`hermes/`, applied from the template). `ROADMAP.yml` is what you build next, in order. `src/cli.ts` is the program; `test/` is its proof.
- **Checks.** `bun run check` from the repository root runs the tests; the project has no dependencies to install. It must pass before every push. Every item adds tests for what it adds; keep `HELP` in `src/cli.ts` naming every command.
- **Verify.** This project has no live surface. An acceptance line is verified by a test that exercises the command through `main()` and by running the command yourself with `bun run todo …` and reading its output. State is one JSON file at `$TODO_FILE` (default `./todo.json`); tests use a temp file.
- **Git.** You cannot push to `main`. Work on `agent/<item-id>` off a fresh `origin/main`, commit small with the item id in the first line, push the branch; it lands through the project's landing rule when the checks pass.
- **Secrets.** There are none for you to use. Never read or print `.env` files; your session is published live.
