---
name: gtm-manager
description: The GTM manager's tick: the board and mail, the rounds kept, the calendar's slots counted, reviewed posts held for their live session, follow-ups from traction, the release hold copied, the meeting's decisions turned into cards, and the report to the account manager.
version: 1.0.0
---

# The tick

The tick arrives as a turn in your own conversation, on the schedule in `.open-autonomy/agent.json`. Read `gtm:` in
`.open-autonomy/config.yaml` first; every path below is named there.

1. **The board and your mail.** Read every open card in full, then your inbox (`supercode message inbox`). A report
   updates its card; a fact another card needs goes on that card.

2. **The rounds.** Each round is a recurring card assigned to the `gtm-auditor` profile, its round named in its title.
   Keep exactly one open of each, and create any that is missing:
   - `funnel audit` (`--every 24h`), timed to finish before the report;
   - `report` (`--every 24h`), timed to finish before the meeting;
   - `research and collection` (`--every` the interval `gtm.collection_every` names, 4h when it names none).

   `supercode workflow create "<round>" --assignee gtm-auditor --workspace worktree:<the install's repository> …`,
   then `supercode workflow set <id> every <interval>`; a round commits its day file in that worktree. A round that
   missed its day is a finding for the next audit; never run a round yourself.

3. **The calendar.** Until the organization's calendar runs, the slots are counted from the cards: a post card names its
   slots as lines `Slot: <date> <channel id> #<n> <time>`. For each of the coming days in `gtm.horizon_days` (3 when it
   names none), count, per channel in the channels file whose state is `live`, the slots filled against the channel's
   `slots`.
   - An open slot goes to the ranked card with the best expected funnel movement for that channel's audience: name it on
     that card. A slot a card cannot fill well stays open and is named in your report; it is never filled for its own
     sake.
   - **Low buffer:** fewer filled slots ahead than `gtm.buffer_floor` (one day's worth when it names none) is an
     emergency: tell the account manager now, in one line with the counts, and file a card to find news worth a take.
   - A channel whose state is `frozen` gets no slots; a `signed-out` one is named in your report.

4. **Reviewed posts wait for their slot.** When a post card's review passes (its reviewer's done request reaches you),
   check its verdict names the PR head and every changeset's content hash. Then block it on its slot:
   `supercode workflow block <card> "waits for its slot's live session" --waiting-on <message>`, where the message is
   yours to the live session (`gtm.live_session`) naming the card, its slots and the changesets' hashes.
   - When the live session reports a slot's live URL, tick that slot on the card with the URL. A slot whose time passed
     unposted is marked skipped; a frozen channel's, frozen.
   - When every slot is ticked, skipped or frozen, unblock the card with what arrived. The implementer merges its pull
     request and names the reviewed and the pushed content hashes; then accept the card (`complete`) with its verdict and
     every URL.

5. **Traction opens follow-ups.** Read the latest report's per-post numbers. A post above its card's expectation opens
   cards in order: reply duty for its next live session first, then the next chapter of its story.

6. **The release hold.** Copy the release hold (the private repositories the lane may point to) from strategy's latest
   report, where `gtm.strategy_reports` names it, into `gtm.release_hold`, and commit it. A report with no hold leaves the
   file as it is; say so in your report.

7. **The meeting.** After the day's meeting, read its decisions where `gtm.days` keeps them. File one card per decision
   that makes something, each with its funnel story, its ICE score and the meeting's line as its source. A decision that
   needs the product's core is an ask to strategy: a card on this board naming the gap, which the account manager carries.

8. **Report to the account manager:** one line per card, blockers first, then the calendar's counts per channel for the
   coming days, the buffer, and the rounds' last runs. Nothing goes to the principal from you.
