# todo-cli

The canonical Open Autonomy reference project: a small todo CLI whose agent develops it one command at a time.
The PM maintains sourced ROADMAP.md notes and queues fleet work on kanban. Verify behavior by manually running
commands against a disposable `TODO_FILE` and reading the output. `bun run check` only compiles the CLI and the
HTTP example; compilation does not establish that an acceptance line holds.

```bash
bun run todo --help
bun run check
```

One generated project carries the setup, board, community, team and release scenarios. Follow the
[World operator guide](../../world/README.md) to run them with synthetic vendors. Fresh-install verification uses
a disposable project made by the kit; additional generated cookbook copies are unnecessary.

The focused [notes HTTP example](examples/notes-http.ts) retains the service behavior from the retired notes-api
cookbook without another agent installation. Start it through the World with
`PORT=8080 bun examples/notes-http.ts`, then register that URL with `volter-world app-url`.
It serves `GET /healthz`, `POST /notes` with a JSON `text`, `GET /notes` (optional case-insensitive `?q=`),
`GET /notes/:id`, and `DELETE /notes/:id`. Invalid notes return 400; missing notes return 404.
Its notes live in memory and reset when the process stops. Inspect responses with curl, then stop the process.

To run this as an autonomous project, have the setup agent begin with
`create-open-autonomy setup . --plan` and complete the agreement in
[project-communications](hermes/skills/project-communications/SKILL.md) before activating the fleet.
Verify discovery, scheduled delivery and the host supervisor; releases still require human review.

The setup agent prepares a provisional project identity in [branding](branding/README.md): a name,
short blurb and reusable icon for project integrations. Existing branding and application IDs are preserved.

For a new installation, follow the [agent-led setup guide](.open-autonomy/SETUP.md). It establishes the
project brief and real development connections first; application services use the world until live activation.
