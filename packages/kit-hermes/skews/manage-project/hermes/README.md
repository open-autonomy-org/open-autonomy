# This project's agent

This is a Hermes home for a project people build: persona, the `pm` skill, the treasurer profile,
configuration and the cron seed. There is no develop skill, no kanban and no dispatcher here; execution is
people's and hand-run sessions', discovered through Git and the reporter.

The PM runs one scrum a day over `ROADMAP.md` (notable present/future intentions, one section each with
Status and Completion lines) and `CHANGELOG.md` (notable changes landed on main, one line each with its
commit). It reads main since its cursor, the pull requests, issues and discussions, the agreed channels and
the sessions the reporter followed; reconciles what landed against what the roadmap asked; names what is
stalled and asks the person who owns it; records explicit authorized requests, including an organization's
request filed in this project's intake; and keeps a sourced release proposal for human review. A quiet day
leaves both documents unchanged.

Runtime state lives in Hermes: sessions and the PM cron notepad (the main cursor, the source checkpoints,
coverage gaps and unresolved pointers). The reporter publishes the PM's sessions, the timeline from the two
documents, and the seats it follows under `seats:` in `.open-autonomy/config.yaml`.

The setup agent writes the owner's communication agreement in `skills/project-communications/SKILL.md`, a
project-owned skill that kit upgrades preserve. Verified people and their scoped authority live once in
`team` in `.open-autonomy/config.yaml`. Maintainers alone cut tags, approve and deploy; the PM prepares the
review package and asks.
