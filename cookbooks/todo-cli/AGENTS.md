# todo-cli — rules for the agent working this repository

- **What this is.** A todo list CLI in TypeScript on bun, with an Open Autonomy agent (`hermes/`, applied from the template). `ROADMAP.md` is the sourced planning memory, maintained by the PM scrum; the kanban holds fleet execution; `CONTRIBUTING.md` is how code is written here. `src/cli.ts` is the program;
- **Verification.** Automated tests are banned; no tests or persistent test harnesses may be committed to main. The rationale is in `CONSTITUTION.md`: test cruft compounds until progress becomes impossible. Each develop agent verifies its feature through REPL-style manual use and records actual observations in its handoff. Never run test suites or commands/hooks that invoke them.
- **Verify.** This project has no live surface. An acceptance line is verified by running the command yourself with `bun run todo …` and reading its output. State is one JSON file at `$TODO_FILE` (default `./todo.json`); manual verification uses a disposable synthetic file.
- **Git.** You cannot push to `main`. Work on `agent/<task id>` off a fresh `origin/main`, commit small with the task id first in the subject, push the branch; it lands through the project's landing rule when the checks pass.
- **Secrets.** There are none for you to use. Never read or print `.env` files; your session is published live.
