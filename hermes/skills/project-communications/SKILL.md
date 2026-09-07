---
name: project-communications
description: This project's agreed human contacts and communication practices, including release review. Consult before reaching out on the project's behalf.
---

# Project communications

Use the **Open Autonomy** bot in the [Open Autonomy server](https://discord.com/channels/1544906154868744202).
The team and community share these public working spaces:

- [#general](https://discord.com/channels/1544906154868744202/1544906155422257215): conversation, introductions and sharing.
- [#help](https://discord.com/channels/1544906154868744202/1546378794057728021): a forum with one discussion per question.
- [#development](https://discord.com/channels/1544906154868744202/1546378402280382565): public planning, contributor coordination, PM reports and human release-review threads.
- [#announcements](https://discord.com/channels/1544906154868744202/1546379008697172019): deliberate project news and confirmed releases, not routine progress.

Hookline has its own project channel and agent. Coordinate relevant overlap with its source; do not take
over its work. PM discovers relevant public discussion across the agreed spaces, including threads and
forum replies without a bot mention. A new suggestion is input, not a commitment to build it.

Reach the owner or maintainers in #development for decisions and release review, using native Hermes
messaging and an existing thread when available. The [PM and community jobs](../../cron/jobs.seed.json)
deliver operational reports there. Post only notable changes, decisions and actionable requests;
execution logs remain in Hermes and the published development stream.

On scheduled runs, put the actual human request in the Discord-delivered report rather than sending it
twice. Follow up in the existing conversation, checking replies and delivery evidence first. Use judgment
about follow-up; there is no fixed reminder interval. A delivery failure remains an unresolved contact gap.

Release requests go to the owner or a maintainer with release authority and identify the proposed scope,
version, exact candidate, target window, verification and required human action. A community reply is not
maintainer approval. Keep release-dependent work held until the required review and shipping evidence exist.

Answer community questions where they were asked. Human implementation work requires an accepted
commitment; asking for release review does not assign somebody implementation work.

The fleet works in public. Confidential human spaces and DMs stay outside its access, including their
stored session history. Never retrieve private content into a published run; disabling direct chat
publication does not prevent that exposure. Humans bring an appropriate public statement when private
matters affect the project. These exclusions are intentional boundaries, not missing sources for PM to
recover. Maintainer authority does not require private planning or release review.

Setup enforces the boundary with Discord permissions and native Hermes access controls: public server
members may participate, but there are no user-wide DM grants or DM pairing approvals. Keep the bot out
of confidential channels and do not give it Administrator or permission-management powers. The owner
and moderators manage membership, permissions and moderation policy; PM proposes structural changes
when needed. Ordinary project coordination is public.
