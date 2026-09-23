# This organization's agent

This is a Hermes home for an organization: persona, the `organization` skill, the treasurer profile,
configuration and one daily job. There is no develop skill, no kanban and no dispatcher; the
organization's executors are its projects, each with a PM of its own.

The daily cycle has three parts in one run. Gather: for each project named under `organization.projects`
in `.open-autonomy/config.yaml`, read its git since the cursor the notepad keeps for it, its roadmap and
changelog, its timeline, sessions and books on the platform, and the organization's channel since the
last memo. Meeting: read the owner's answers under yesterday's memo, record each outcome where this
repository keeps it (a target change as a numbered decision, work on a project page, a pending question
back on the agenda), and file each outcome that touches a project as an authorized request in that
project's intake under the organization's roster identity. Memo: post one message in the organization's
channel with the fixed shape the skill names, ending with the agenda, the decisions that need the owner
today.

Runtime state lives in Hermes: sessions and the job notepad (one git cursor per project, the channel
cursor, coverage gaps). The reporter publishes the agent's sessions to the organization's account.

The setup agent writes the organization's communication agreement in
`skills/project-communications/SKILL.md`, an organization-owned skill that kit upgrades preserve; the
channel the memo posts to is named there and nowhere else.
