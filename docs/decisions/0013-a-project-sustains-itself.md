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
- "they're team members, they contribute their time, they run OA on their machines using their computer and
  subscription";
- "their resources are essentially credited to us without us having to worry about it - basically they're costs
  that don't count. Otherwise we would have to pay for them".

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
- **A project with no release has nothing to announce.** The community skill announces released versions only;
  Hookline has never released, and nothing asks PM to.
- **Nothing reaches a backer after they give.** A patron sees Polar's thanks page and their name on the wall.
  No report, update or thanks follows.
- **Work no integration reaches goes to "the team member who handles it"** (`front-door`, `project-communications`).
  Every member is a volunteer: that person may not exist, or may be away.
- **One project runs on one machine.** The board is Hermes's local store in the one home the one runtime serves,
  behind one dispatcher lock (`hermes-locks.mjs`). No record designs a second member's machine working the same
  project; ADR 0008's seams (roster, reviews, release, deploy) name no member running the agent.

## Decision

**A project is sustained by three contributions, and the agents work for all three.**

- **Members** give time, and run the project's agent on their own machines and subscriptions. Their resources are
  the project's for free and never count as its costs: every member lowers what the project must pay for. They are
  the first thing a project grows.
- **Backers** give money, and the money pays only for what no member donates: the platform's model rail while no
  member's machine is working, hosting, domains and partners through the rails.
- **Users** use it. Members and backers come from them.

A project is self-sustaining when its members carry its development and its backers cover the metered spend left.

**The agents read the numbers that say so.** A door (`community.ts reach`) reports, on the project's own record
each week: visitors and their referrers, stars, clones and downloads, first-time outside authors; patrons, their
monthly total and who left; members active and returning; the metered spend and how much of it backers cover. The
scrum reads it beside the board. The targets are in the project's own document, set by the owner.

**The front door is graded by a reader who has never seen it.** Before a change to what a user sees or does lands,
and at each release, a fresh-context agent receives only the README and must say what the project is, who it is
for, and reach a first success by following the quick start literally in the project's World. Each mismatch is a
finding the change fixes. The captures in the README come from that run.

**A release follows shipped change.** When a change a user can see has landed and the front door tells it truly,
PM prepares the release: the version, the notes in a user's words, the tag ready for its reviewer. A release is
what community announces.

**Community reaches out, not only back.**
- A weekly dev log from the week's real sessions and books: what shipped, what it cost, what is next. A project
  built by its agent on public books is the story, and it serves all three groups.
- The monthly backer report: what the money bought, the items shipped, the sessions, the spend, the runway; the
  backers named.
- Posts on the channels the agent reaches (Discussions, its chat channel, Pages). For channels it cannot reach
  (Hacker News, Reddit, lists, other communities), a post drafted in full and labelled as written by the project's
  agent, offered as help-wanted.

**Help-wanted replaces "the team member who handles it".** Work the agents cannot do is posted where members and
users see it, prepared so it costs its taker one decision: the exact values, the file, the drafted text. It is
never routed to the owner as a default, and nothing essential waits on one person: every seam that needs a person
has more than one who may act at it, and recruiting the second is a goal the scrum tracks.

**Asks are counted.** Each ask of a person is recorded with what it asked for and when it was answered. The door
reports asks per week and how long they waited; the scrum works to reduce both.

**Strategy owns the plan, community carries it out.** No new role: the strategy skill gains a sustain mandate
(which users, which channels, which asks), and community executes it on the agreed channels. The targets, the
cadences, the channels and which asks are allowed are in the project's own document, the owner's word; the agents
never edit them.

Extrapolation, this author's (the owner named the goal and the three contributions, not these particulars): the
weekly and monthly cadences; the contents of `community.ts reach`; the fresh-reader grade and where it runs; the
release trigger; help-wanted as the replacement; counting asks; strategy as the owner of the plan.

**Open, decided by a later record:** how members' machines share one project. Two shapes: members' machines as
workers of the project's one runtime (board tasks dispatched to the machine of their assignee), or each member
running the project's runtime with a board every runtime reads and claims from (the platform, per ADR 0005). The
member contribution in this record does not wait on it: a project's first member is its owner's machine today.

## Alternatives and tradeoffs

- **Buy reach** (ads, paid placement). Rejected: money spent on reach is not spent on the project, and a
  project's books would show its backers paying for its promotion.
- **Automate posting to every community.** Rejected: most forbid posts by bots, and one caught project costs every
  project on the platform its welcome. The agent drafts; a person posts, under their own name.
- **Show members' donated compute on the books in dollars.** Rejected by the owner's ruling: donated resources are
  not costs. The ledger's `consumed_usd_cents` stays the only cost; members are credited by name and by the work
  their machines delivered.
- **A growth agent beside PM and community.** Rejected: a new role for what strategy and community already own.

## Consequences

- `community`: the weekly look at the numbers; the dev log; the backer report; outreach and help-wanted posts;
  `poll` at a cadence the project's traffic warrants rather than every 5 minutes.
- `pm`: reads the numbers at scrum; prepares releases after shipped change; counts asks.
- `strategy`: the sustain mandate and the plan it produces.
- `front-door`: the fresh-reader grade replaces self-review; help-wanted replaces routing to a team member.
- `project-communications`: the channels, targets and allowed asks are recorded here as the owner's word.
- The kit gains `community.ts reach`. Whether a project's GitHub App may read traffic (views, clones, referrers)
  is to be measured before it is built; a count it cannot read is reported as unavailable, never guessed.
- The page's tiers keep stating the runway the money buys, from the metered burn.

## Verification

In the World: a project's `reach` report on a week of twin traffic, patrons and asks; the fresh-reader grade
failing on a README whose quick start does not work and passing once it does; a release prepared after a
user-visible change and announced; the backer report naming a twin patron. Live, on Hookline: the first week's
numbers, read by its scrum.
