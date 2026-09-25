# ADR 0016: A project's direction comes from the owner's meeting, or from a north star

Status: Proposed. Accepted only upon independent constitution review and merge of this record with its first
implementation; proposed until both occur.

Amends [ADR 0006](0006-the-kit-is-a-lineage.md) (a fourth skew) and the kit's `strategy` and `pm` skills as stated
under Consequences.

## Context and sources

**Authorization.** The owner's coding conversation of September 25, 2026:
- "I thought the idea was that we were supposed to have regular meetings with the owner in the owner channel during
  which we would discuss what happened and settle on strategy and new roadmap etc.";
- "ultimately, it's fine for us to have the strategy drive itself as well - but only if the northstar is super clear
  (for instance, create a todo app that has feature parity with all others)";
- "basically that would be a skew I think";
- on the PM: "the idea is to manage the roadmap, obviously bugs and regressions are on the roadmap".

ADR 0006 records the meeting in the owner's words: the organization's job "would be to communicate in a channel still
daily with a concise but complete memo with the meeting agenda — that meeting is the heart of the job of the
organization. The results of that meeting are then filtered down to the projects and their PMs take action
redirecting the roadmap as needed."

**What exists** (this repository at `origin/main`, September 25, 2026):
- `manage-organization` runs the daily memo and meeting for the projects its `organization.projects` names. Only
  `volter-ai` has one (vgai-engine, twin, game-benchmarks, browser-substrate, supercode); its last completed cycle was
  September 17. `open-autonomy-org` has none, so this project, Hookline and Evidence Desk hold no meeting.
- `self-build` carries a `strategy` skill whose activation and authority the owner sets in `project-communications`;
  with no agreement it waits to be asked. No project recorded one, so strategy has never run here or on Hookline. On
  September 25 Hookline's PM ran nine times and each time found "no authorized product outcome to queue".
- The PM records authorized requests and, since #812, queues bugs and regressions itself; it never invents new
  capability.

## Decision

**Direction has two sources, and a project has exactly one of them.**

1. **The owner's meeting** (every project by default). An organization agent covers the project; its daily memo, in
   the owner's channel, carries what happened and the agenda; the owner's answers in that thread are the meeting; each
   outcome that touches a project is filed as an authorized request in that project's intake, and its PM lands it on
   the roadmap. Strategy prepares proposals for the agenda and lands nothing on its own.
2. **A north star** (the `north-star` skew). The project's constitution states one north star that can be checked: what
   done means and against which sources (for example, feature parity with the named leading todo apps, the list
   refreshed from primary sources). Strategy keeps a sourced gap table against it, runs whenever the PM's board has
   nothing authorized to dispatch, and lands the next outcome that closes a gap, through an ordinary reviewed pull
   request. When the table has no gap it says so in the meeting's channel and adds nothing.

Either way, bugs and regressions are the PM's, and the owner can always direct.

**open-autonomy-org gets an organization agent** covering this project, Hookline and Evidence Desk, in a space whose
audience is the owner or the team ([ADR 0014](0014-each-agent-speaks-to-an-audience.md)).

Extrapolation, this author's (the owner named the meetings, a self-driving strategy under a clear north star, and that
the latter is a skew): one source of direction per project; the meeting as the default; the north star in the
constitution; a gap table as strategy's record; the board running dry as the only trigger; strategy landing outcomes
itself under the north star; an organization agent for open-autonomy-org and its three projects.

## Alternatives and tradeoffs

- **Strategy on request (today).** Rejected by the evidence: nobody asks, and a project idles once its board empties.
- **Strategy on a fixed schedule.** Rejected: a schedule adds scope on a clock, not because a gap or a decision calls
  for it; the meeting already has a cadence and the north star has a trigger.
- **The PM fills an empty board from the constitution.** Rejected by the PM skill's own rule and by the owner:
  managing the roadmap is not inventing it.
- **A north star in configuration.** Rejected: what the project is for belongs in its constitution, which the owner
  alone amends.

## Consequences

- `packages/kit-hermes/skews/north-star/` (new): self-build plus a constitution with a `North star` section, a strategy
  job whose trigger is an empty board, and the strategy skill's authority set to land outcomes under the north star.
  The todo-cli cookbook becomes a north-star project.
- The `strategy` skill loses on-request activation: in a meeting-driven project it prepares agenda proposals; in a
  north-star project it runs on the trigger above. `project-communications` no longer records a strategy agreement.
- `open-autonomy-org/.github` (or a new organization repository) runs `manage-organization` with this project,
  Hookline and Evidence Desk; the owner names the channel.
- The `volter-ai` organization agent's failed cycle is repaired so its meeting runs.

## Constitution review

The owner's acts are unchanged: direction is the owner's, given in the meeting or once, in a north star the owner wrote
into the constitution. No agent gains authority to widen a north star.

## Verification

In the World: a meeting-driven project whose memo lists the day's landings and an agenda item from strategy, an
owner answer that becomes a roadmap outcome through the PM; a north-star todo-cli whose empty board starts strategy,
which lands a gap-closing outcome that the fleet builds, and which reports no gap once the table is green.
