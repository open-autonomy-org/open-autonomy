# lexicon

A shared glossary, written by its community through this project's agent. Terms live in `lexicon.json`; the
homepage is rendered from it. Built term by term and command by command by the agent, in the open, on a budget
its patrons fund through Open Autonomy: watch it on the project page.

```bash
bun run lexicon help
bun run check
```

To run this as an autonomous project, have the setup agent begin with
`create-open-autonomy setup . --plan` and complete the agreement in
[project-communications](hermes/skills/project-communications/SKILL.md) before activating the fleet.
Verify discovery, scheduled delivery and the host supervisor; releases still require human review.

The setup agent prepares a provisional project identity in [branding](branding/README.md): a name,
short blurb and reusable icon for project integrations. Existing branding and application IDs are preserved.

For a new installation, follow the [agent-led setup guide](.open-autonomy/SETUP.md). It establishes the
project brief and real development connections first; application services use the world until live activation.
