# todo-cli

A todo list command line tool, built item by item by this project's agent. It exists to iterate on the
Open Autonomy template quickly: each roadmap item is one command and one test, small enough for one run,
and `bun run check` is the whole definition of done. The PM maintains sourced ROADMAP.md notes and queues fleet work on kanban; watch it
on the project page.

```bash
bun run todo --help
bun run check
```

To run this as an autonomous project, have the setup agent begin with
`create-open-autonomy setup . --plan` and complete the agreement in
[project-communications](hermes/skills/project-communications/SKILL.md) before activating the fleet.
Verify discovery, scheduled delivery and the host supervisor; releases still require human review.

The setup agent prepares a provisional project identity in [branding](branding/README.md): a name,
short blurb and reusable icon for project integrations. Existing branding and application IDs are preserved.
