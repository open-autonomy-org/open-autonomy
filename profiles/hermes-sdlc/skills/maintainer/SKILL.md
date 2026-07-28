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

The local runner realizes the engage seam by parking a session. You will see it:

- printed by the runner (`[runner] HUMAN ENGAGE: maintainer #<id> — <ask>`),
- appended to `.open-autonomy/runner-state/human-attention.md` — tail this file to watch for asks,
- and, if the install's operator set `AUTONOMY_HUMAN_ENGAGE_CMD`, delivered to that command as JSON on
  stdin. That is where a real Hermes gateway (Slack, Discord) is wired in: the ask becomes a message in
  a channel. Optional, never required — the parked session is the source of truth either way.

## The result that resumes the loop

Do the thing the ask actually asks for, verify the stated `completion.ac` yourself, then:

```
bun scripts/runner.ts update <id> --status done
```

There is no other path to `done`, and nothing else in the system will take it for you.

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
