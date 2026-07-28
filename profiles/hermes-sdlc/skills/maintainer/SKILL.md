---
name: maintainer
description: The kind:human actor in hermes-sdlc — the task spec a person is handed when the reviewer returns human-required or a change touches a human_required_path, and how they resolve it to resume the loop.
---

# Maintainer — the human seam of hermes-sdlc (a task spec for a person)

You are the **maintainer**: a `kind: human` actor. You are not an agent. No model runs this skill, no
Hermes swarm worker is spawned for you, and no substrate ever emits a job for you. You are **engaged**,
not launched — the difference matters, and it is the whole reason this actor exists as a declared role
rather than as a paragraph in someone's prompt.

## Why you are declared at all

A Hermes resident on the other end of a gateway channel and a person on the other end of a gateway
channel look identical to the loop: both are reached by posting a message, both answer whenever they
answer, and neither can be watched, cancelled, or hurried. The difference is that a resident can be
asked to try again and a person cannot be presumed to have finished.

So the seam is deliberately one-directional and never optimistic: the runner **parks** the ask and the
loop **stops advancing that item** until a verified resolution arrives. There is no timeout that
promotes an unanswered ask to `done`. If nobody answers, the item stays stuck, visibly — that is the
correct behavior, not a bug to be tuned away.

## When you are engaged

Two paths reach you, and only two:

1. **The reviewer returned `outcome: human-required`.** The standard review envelope
   (`open-autonomy.review.v1`) requires that outcome to carry a `humanTask` block naming three things:
   the `ask`, who it is `assignTo`'d, and the `completion` condition (`ac`, `via`, `check`). Read all
   three before doing anything. If the `completion.ac` is not something you can actually verify, say so
   and send it back — an unverifiable completion condition is a defect in the review, not a task for you.

2. **The change touches a `policy.box.risk.human_required_paths` entry.** These are the paths the loop
   is not allowed to auto-land a rewrite of: the harness that runs it, the skills that direct it, the
   validation it is graded by. An agent may propose a change to them; it may never certify one.

## What reaching you looks like

This profile runs on **Hermes**, whose seam for reaching you is a **blocked card**. A worker that needs
you calls `kanban_block` with kind `needs_input`; the card stops there and the kernel will not dispatch it
again until a person acts. Nothing times out, and no model can clear it for you — proven by running: the
card stayed blocked across three further dispatch ticks with nothing promoting it.

You will find asks by looking at the board:

```
hermes kanban list --json          # a blocked card is one waiting on a person
hermes kanban show <id> --json     # the ask, and the run history that led to it
```

If the install's operator runs a Hermes **gateway**, the same event is delivered to a real channel
(Slack, Discord, Telegram) as `⏸ Kanban <id> blocked <reason>` — that is where a chat notification comes
from. It is convenience, never the source of truth: the blocked card is.

## The result that resumes the loop

Do the thing the ask actually asks for, verify the stated `completion.ac` yourself, then:

```
hermes kanban unblock <id>
```

That returns the card to the board and the kernel dispatches it again. (There is no `runner.ts update` verb
here — the emitted `scripts/runner.ts` implements `launch`, `list`, `get` and `cancel` only.)

**One honest caveat, because the opposite was claimed here and it was wrong.** `kanban_unblock` is a member
of Hermes' `kanban` toolset, and Hermes offers it to any session in ORCHESTRATOR mode — a profile that
declares that toolset and is not scoped to a single card. The standing `pm` is exactly that. So a model
*can* technically clear a card that was blocked for you; nothing in the kernel prevents it. What stops it is
doctrine — the PM's skill never unblocks, and an issue labelled `human-required` is refused by it every
tick. Treat this seam as a strong convention backed by a fence, not as an authority boundary the machine
enforces. If that distinction matters for a given decision, say so on the card.

Three things you may legitimately do instead, all of which are better than a reluctant approval:

- **Send it back.** If the proposal is wrong, resolve the ask with a note saying why; the PM routes the
  item to rework. A `changes-requested` that came from a person is worth more than one from a model.
- **Refuse the framing.** If the ask presumes a decision that has not been made ("approve the retention
  change" when nobody chose the retention period), the answer is that the decision is missing.
- **Say the completion condition is unverifiable.** See above. This is the single most useful thing you
  can report, because it is invisible to every automated check in the loop.

## What you must never do

Do not mark an ask `done` because it has been sitting a while, because the reviewer sounded confident,
or because the evidence "looks like" what evidence usually looks like. Your `done` is the only claim in
this entire loop that no other component can second-guess, which is exactly why it has to be the one
claim that is always earned.
