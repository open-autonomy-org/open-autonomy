# ADR 0013: A project sustains itself on members, backers and users, and reads the numbers that say so

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its
first implementation; proposed until both occur.

Amends the kit's `community`, `pm`, `strategy`, `front-door` and `project-communications` skills as stated under
Consequences. Supersedes nothing.

## Context and sources

**Authorization.** The owner's coding conversation of September 25, 2026:
- "you need to think about how it's generating a good enough front door and community engagement - remember
  this is a 'self building project' that has to attract users";
- "we have a development strategy - but we also need a gtm strategy, the point is to make it self-sustaining
  which means we NEED to gain new backers AND keep existing backers";
- "this also means the 'team' are volunteers"; "everyone on the team is a volunteer, even the owner";
- "their resources are essentially credited to us without us having to worry about it - basically they're costs
  that don't count. Otherwise we would have to pay for them";
- "members can contribute their time and machine - don't get into the detail about subscription, apps, etc. that
  differs with every app. The idea is that they are providing a substrate to run OA on AND they contribute their
  time. Now these could also vary so don't assume everyone will do everything - members have roles and
  contributions they do as well as expected availability windows";
- "study the soc2 template - don't necessarily adopt that but see how the way we work with team members can help
  them or how we can learn from them".

The ruling is recorded in `CLAUDE.md` (#756). This record is what follows from it for the kit.

**What exists** (measured September 25, 2026, on `open-autonomy-org/hookline` and `open-autonomy-org/open-autonomy`):

| | Hookline | Open Autonomy |
|---|---|---|
| Stars, forks | 0, 0 | 1, 0 |
| Unique visitors, 14 days (GitHub traffic) | 3 | 8, every referrer github.com |
| Releases | none | kit on npm |
| Issues and PRs by anyone outside the fleet | none (69 PRs, all `app/github-actions`) | none |
| Discussions | off | off |
| Patrons (project page) | none | none |
| Money in | $20.00, a grant from Open Autonomy | $533.39, granted |
| Metered burn, runway | $0.10/day, 187 days | $0.37/day, 1,316 days |

- **Nothing in the kit reads reach.** PM reads the board and the roadmap; community answers whoever spoke
  (`community.ts poll`, every 5 minutes on Hookline). No skill reads stars, visitors, referrers, users, patrons or
  members, so no agent can tell whether the project is gaining or losing anyone.
- **The front door is graded by its author.** Hookline's README opens on a sentence of 50 words and follows it with
  paragraphs on token semantics; it shows no image. Open Autonomy's leads with "Hermes PM maintains the sourced plan".
  The front-door skill (kit 3.6.0) sets the bar, and the agent that wrote the page judges it.
- **A project with no release has nothing to announce.** The community skill announces released versions only.
  PM already plans releases (`PRODUCTION.md`: a decision of accumulate, prepare, defer or request-review, and a
  review package naming the exact human steps); Hookline's `ROADMAP.md` holds `Release decision: accumulate`,
  `Target window: unset — no cadence agreed`. The machinery is there; no cadence was ever agreed.
- **Nothing reaches a backer after they give.** A patron sees Polar's thanks page and their name on the wall.
  No report, update or thanks follows.
- **Work no integration reaches goes to "the team member who handles it"** (`front-door`, `project-communications`).
  Every member is a volunteer: that person may not exist, or may be away.
- **One project runs on one machine.** The board is Hermes's local store in the one home the one runtime serves,
  behind one dispatcher lock (`hermes-locks.mjs`). No record designs a second member's machine working the same
  project; ADR 0008's seams (roster, reviews, release, deploy) name no member running the agent.

## Decision

**A project is sustained by three contributions, and the agents work for all three.**

- **Members** contribute their time, a machine (a substrate the project's Open Autonomy runs on), or both. What a
  machine brings is the project's for free and never counts as its cost: every machine lowers what the project must
  pay for. Members differ, and none is assumed to do everything: each has their roles, the contributions they make,
  and the windows they are expected to be available. Members are the first thing a project grows.
- **Backers** give money, and the money pays only for what no member donates: the rails' metered spend while no
  member's machine is running, hosting, domains and partners.
- **Users** use it. Members and backers come from them.

A project is self-sustaining when its members' machines and time carry its work and its backers cover the metered
spend left.

**The roster says what each member gives.** Beside each member's authority, the roster records their roles, the
contributions they make (their time in those roles, a machine), their expected availability windows, and when they
joined and left. It is the member's own word, recorded by an owner's change on the Team page or by the member's own
pull request merged after review; the agents read it and never infer it. A member's authority lapses the day after
they leave.

**The agents read the numbers that say so.** A door (`community.ts reach`) reports, on the project's own record
each week: visitors and their referrers, stars, clones and downloads, first-time outside authors; patrons, their
monthly total and who left; members and machines active and returning, and the roles no one available covers; the
metered spend and how much of it backers cover. The
scrum reads it beside the board. The targets are in the project's own document, set by the owner.

**The front door is graded by a reader who has never seen it.** Before a change to what a user sees or does lands,
and at each release, a fresh-context agent receives only the README and must say what the project is, who it is
for, and reach a first success by following the quick start literally in the project's World. Each mismatch is a
finding the change fixes. The captures in the README come from that run.

**A release follows shipped change.** The project's own document carries a release cadence, and PM's existing
release planning (`PRODUCTION.md`) prepares a release when a change a user can see has landed within it and the front
door tells it truly: the version, the notes in a user's words, the review package ready for a member holding
release review. A release is what community announces.

**Community reaches out, not only back.**
- A weekly dev log from the week's real sessions and books: what shipped, what it cost, what is next. A project
  built by its agent on public books is the story, and it serves all three groups.
- The monthly backer report: what the money bought, the items shipped, the sessions, the spend, the runway; the
  backers named.
- Posts on the channels the agent reaches (Discussions, its chat channel, Pages). For channels it cannot reach
  (Hacker News, Reddit, lists, other communities), a post drafted in full and labelled as written by the project's
  agent, offered as help-wanted.

**Asks go to a role, within its members' windows.** Work the agents cannot do goes to a member whose role covers it
and who is within their window, prepared so it costs one decision: the exact values, the file, the drafted text.
With no such member, it is posted as help-wanted where members and users see it. It is never routed to the owner as
a default, and nothing essential waits on one person: every seam that needs a person has more than one member whose
role covers it, and recruiting the second is a goal the scrum tracks.

**Asks are counted.** Each ask of a person is recorded with what it asked for and when it was answered. The door
reports asks per week and how long they waited; the scrum works to reduce both.

**Strategy owns the plan, community carries it out.** No new role: the strategy skill gains a sustain mandate
(which users, which channels, which asks), and community executes it on the agreed channels. The targets, the
cadences, the channels and which asks are allowed are in the project's own document, the owner's word; the agents
never edit them. The strategy never assumes a member does more than the roster says.

Extrapolation, this author's (the owner named the goal and the three contributions, not these particulars): the
weekly and monthly cadences; the contents of `community.ts reach`; the fresh-reader grade and where it runs; the
release trigger; routing asks by role and window, with help-wanted as the fallback; counting asks; strategy as the
owner of the plan; the roster as the home of roles, contributions and windows.

**Open, decided by a later record:** how several members' machines share one project's work. Today one machine runs
a project. The member contribution in this record does not wait on it: a project's first machine is its owner's.

## What the soc2 template teaches, and what it gains

The `soc2` skew and [Evidence Desk](https://github.com/open-autonomy-org/evidence-desk) already treat people as
people who act at declared seams (ADR 0008), and several of their mechanisms are what a volunteer team needs.

**Taken from it, for every project:**
- **What a person owes is derived, never journaled.** `evidence-desk obligations` computes what each person owes from
  their role and the last record of the act; `remind` keeps one issue per owed act assigned to its owner, closes it
  when met, and lists the acts no one owns in one shared issue. Asks here work the same way: derived from the roles
  and windows in the roster, one issue each, and the unowned ones in one help-wanted issue.
- **A member has a start and an end.** Evidence Desk's people register has `start_date` and `end_date`, and access is
  owed removed the day after the end. Volunteers join and leave; the roster records both, and a departed member's
  authority lapses on its own rather than waiting for someone to notice.
- **A periodic check-in, not a surprise audit.** An access review asks whether each person with access should still
  have it. For a volunteer team the same review asks each member whether their roles, contributions and windows are
  still true: it keeps the roster honest and is itself a moment to thank them and ask what would help.
- **Each person records their own act, and the record is their credit.** In the soc2 skew a person's act is a pull
  request they opened (`collect attribution`). The record that proves to an auditor who did what is the record that
  credits a member for it.
- **Onboarding per role.** Evidence Desk's forms are acknowledged per person at their start. A member taking a role
  gets that role's short guide: what it does, its doors, what they can expect of the agents. Quizzes, background
  checks and attestations stay in the soc2 skew; a volunteer project that asked for them would lose its volunteers.

**Given back to it:**
- The roster's roles, start and end dates feed Evidence Desk's import, so its people register is read from the project
  rather than typed into it.
- A member's declared window is the expectation an escalation's response time is judged against
  (`records/escalations/`: `received_at`, `responded_at`), rather than an unstated one.
- A member's machine is part of the system the project runs on: in the soc2 skew it is declared beside the
  `vendor_accounts`, with its member as its operator, so the auditor's question "where does this run and who can
  reach it" is answered from the repository.
- "Never let essential work wait on one person" and SOC 2's independent second person for reviews the owner cannot
  perform on themselves are the same recruit.

Extrapolation, this author's: every item above beyond what the two repositories already do.

## Alternatives and tradeoffs

- **Buy reach** (ads, paid placement). Rejected: money spent on reach is not spent on the project, and a
  project's books would show its backers paying for its promotion.
- **Automate posting to every community.** Rejected: most forbid posts by bots, and one caught project costs every
  project on the platform its welcome. The agent drafts; a person posts, under their own name.
- **Show what members' machines bring on the books in dollars.** Rejected by the owner's ruling: donated resources
  are not costs. The ledger's `consumed_usd_cents` stays the only cost; members are credited by name and by the work
  their time and machines delivered.
- **A growth agent beside PM and community.** Rejected: a new role for what strategy and community already own.

## Consequences

- `community`: the weekly look at the numbers; the dev log; the backer report; outreach and help-wanted posts;
  `poll` at a cadence the project's traffic warrants rather than every 5 minutes.
- `pm`: reads the numbers at scrum; prepares releases after shipped change; counts asks.
- `strategy`: the sustain mandate and the plan it produces.
- `front-door`: the fresh-reader grade replaces self-review; help-wanted replaces routing to a team member.
- `project-communications`: the channels, targets and allowed asks are recorded here as the owner's word; asks are
  routed by role and window.
- The roster (`team` in `.open-autonomy/config.yaml`, the SDK's team codec) gains each member's roles, contributions,
  availability windows, joined and left, under the same strict validation (SDK 3.7.0); the Team page shows and edits
  them. Every authority check reads only current members, and a populated roster keeps an owner with no `left`.
- The soc2 skew declares members' machines beside `vendor_accounts`; Evidence Desk's import reads the roster's roles
  and dates.
- The kit gains `community.ts reach`. Whether a project's GitHub App may read traffic (views, clones, referrers)
  is to be measured before it is built; a count it cannot read is reported as unavailable, never guessed.
- The page's tiers keep stating the runway the money buys, from the metered burn.

## Verification

In the World: a project's `reach` report on a week of twin traffic, patrons and asks; the fresh-reader grade
failing on a README whose quick start does not work and passing once it does; a release prepared after a
user-visible change and announced; the backer report naming a twin patron. Live, on Hookline: the first week's
numbers, read by its scrum.
