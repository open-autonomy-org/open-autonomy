# ADR 0014: Each agent and each channel has an audience, and an agent knows only what its audience may

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its first
implementation; proposed until both occur. The constitutional invariant it needed is amended, on the owner's approval
(below).

Amends [ADR 0013](0013-a-project-sustains-itself.md) (the community desk's outreach and asks) and the kit's
`project-communications`, `community` and `pm` skills as stated under Consequences.

## Context and sources

**Authorization.** The owner's coding conversation of September 25, 2026:
- "the communication agent needs to be 'team aware' and know WHO are in the channels they're posting in. We have to
  be careful about public vs private information";
- "we have to consider what is 'need to know' here";
- "exposing that information is fine as long as it's on a public open autonomy repo. But different visibility level
  still need to be set for different agents";
- "even for OA public repos, we still want internal team meetings";
- "(potentially, maybe a template or skew will be 100% open)";
- on a first draft that gave each profile an `audience` field: "wait why audience setting - isn't it just in the
  prompt".

**What exists** (this repository at `origin/main`, September 25, 2026):
- `CONSTITUTION.md`: "**Nothing in an agent's reach is a secret that matters.** Every session is published live".
  The kit's `project-communications`: "The fleet works in public. Any confidential human space stays outside its
  access, including private channels, DMs and stored session history", and "Disabling chat publication or asking PM
  to omit details does not protect content read by a published run."
- One level, then: every agent is a public agent, and a space people keep to themselves is simply out of every
  agent's reach. There is no agent that may take part in a team's own meeting.
- The platform already has an audience ladder, the owner's word on visibility (`dashboard:` in
  `.open-autonomy/config.yaml`): `public`, `giver`, `team` (the roster), `owner`, per panel, applied at every door
  (`admits`).
- The reporter's `publish` block: `runs`, `chats`, and `private` (session IDs, job IDs or job names never sent).
- Each Hermes profile is its own home: its own memory, sessions and cron store (the treasurer is one today).
- The roster names each member's verified platform accounts (`team` in the config; ADR 0013 adds roles and
  windows). Hermes's Discord tools include channel and member lookups (`discord_admin`).

## Decision

**Every agent has an audience, stated in its prompt.** Each agent of a project speaks for `public`, the `team` or the
`owner`: the widest audience that may learn what it knows. Its persona says which, and the project's
`project-communications` records the owner's word on it. A profile is the unit, because what an agent reads is in its
memory and its sessions; a public agent that reads team material has published it, whatever it is asked to omit.

**Two things are not the agent's to decide, and are not left to the prompt.** What it can read is the platform's own
permissions: the channels its Discord bot is in, the repositories its App is installed on. What is published of it is
the reporter's: `publish.private` names a profile whose sessions are never sent, as it already names jobs and sessions.

**Every channel's audience is who can read it.** `project-communications` records each agreed space and who it is
for. A space is `team` only while everyone who can read it is on the roster; the agent that runs setup, and the scrum
after a roster change, check that with the platform's own membership tools, and a space that fails or cannot be
checked is treated as public.

**Need to know.** An agent reads only channels, repositories and records whose audience is within its own, and says in
a channel only what that channel's audience may know. A `team` agent may take part in the team's own meeting space
and may post to a public channel only what it would say in public; a `public` agent never reads team material, so it
has none to leak. Moving something from a team space to the public is a deliberate public statement (the team's
agent writing it at public level, or a member), never a transcript or a summary made by the agent that read the team
space for a public channel.

**Publication follows the audience.** A public agent's sessions are published as today; a team or owner agent's are
named in `publish.private` and never sent. The books still count every cent any agent spends: money is public whatever
the agent's audience.

**Internal team meetings.** A project that wants them names a team space (a Discord channel whose members are all on
the roster, for example) and a `team` agent that takes part: the agenda, the notes, the follow-ups. What leaves the
meeting for the roadmap or a public channel is a public statement, as above.

**A fully open project has only public agents and no team space.** A skew or template may fix that: today's
behaviour, now stated as a choice.

**The constitutional invariant.** The owner approved this wording in their own review of the pull request that landed it
([#774](https://github.com/open-autonomy-org/open-autonomy/pull/774#pullrequestreview-5316717720), at 4929f5b6), and it
replaces the invariant in `CONSTITUTION.md` in the change that lands this record: "Nothing in a public agent's reach is
a secret that matters. Every public agent's session is published live. An agent whose audience is the team or the owner
knows only what that audience may, and its sessions are published only to it. Nothing in any agent's reach is a secret
that matters beyond its audience, and every spend is on the public books; a key spends one project's balance and stops
at zero; a treasurer's key alone may pay." No agent is given a non-public audience before this record's first
implementation lands.

Extrapolation, this author's (the owner named team awareness, need to know, per-agent visibility, internal meetings
and an open skew; not these particulars): the profile as the unit; the audience ladder reused from the dashboard;
checking a channel's audience by membership against the roster at setup and on roster changes; an unchecked
channel counting as public; non-public sessions sent nowhere as the first step.

**Open, decided by a later record:** publishing a team agent's sessions to the team on the platform (a session
visible to `team` viewers), rather than not at all; and how an owner-level agent differs from a team one in practice.

## Alternatives and tradeoffs

- **One agent with per-message redaction.** Rejected by the existing skill's own finding: what a published run read
  is published, whatever it omits in what it says.
- **Keep every agent public; people meet without agents.** Rejected by the owner: internal team meetings with agents
  are wanted even on public repositories.
- **An `audience` field on each profile in the agent setup.** Rejected by the owner: what an agent says is its
  prompt's; the two things the agent does not decide already have their doors (permissions, `publish.private`).
- **Name a channel's audience in configuration and never check it.** Rejected: a channel named `team` that someone
  outside the roster was added to is public in fact.
- **Check a channel's membership before every post.** Rejected as too costly and brittle for every run: membership
  changes with the roster and with setup, and that is when it is checked.

## Consequences

- The reporter's `publish.private` accepts a profile's name: none of that profile's sessions is sent.
- `project-communications` records each agreed space, who it is for, and which agent takes part; "The fleet works in
  public" becomes "The fleet's public agents work in public", with the rest of this record.
- A team agent's persona says it speaks for the team; `community` and `pm` post only in recorded spaces and never
  carry team material out.

## Verification

In the World: a Discord twin with a public channel and a team channel whose members are all on the roster; a `team`
profile that takes part in the team channel and a `public` community profile; the community profile refusing to read
the team channel; a stranger added to the team channel making its measured audience `public` and the team agent
refusing to post team material there; the reporter sending the public profile's sessions and none of the team
profile's; the books showing both profiles' spend.
