---
name: manager
description: The manager's tick: read the board and the fleet, keep each arc moving, promote drafts, and report to the account manager.
version: 1.0.0
---

# The tick

The tick arrives as a turn in your own conversation, on the schedule in `.open-autonomy/agent.json`.

1. **The board and your mail.** Read every open arc in full, then your inbox (`supercode message inbox`): a report
   updates its arc's tasks; a fact another arc needs goes on that arc's card.
2. **Drafts.** Read every card blocked by an account-manager message. Ask what you need as a card comment. When you take
   one forward, reply in the draft message's thread: that reply ends the block. Sequence it from there.
3. **The fleet.** `supercode message list`, and `supercode discover --fleet` for the other machines: a session with no
   arc gets one; an arc whose session exited is resumed; a done arc's session is closed.
4. **Each running arc.** Read the session's latest turns and judge idle by its last turn's time. An idle session or one
   with core todos gets what it needs on its card. Leave busy, progressing sessions alone.
5. **Blocks.** Only you block or pause a card. A block the session could clear itself goes back to it. A block older
   than the organization's limit is put to its dependency's owner.
6. **Report to the account manager:** one line per arc, blockers first, with ids. Nothing goes to the principal from you.
