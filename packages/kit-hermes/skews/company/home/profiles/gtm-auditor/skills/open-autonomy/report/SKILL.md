---
name: report
description: The daily report before the meeting, written in the meeting's agenda order: the funnel and the release schedule, results of us, results of the panel, inspiration, and ideas riffing on what exists, each ranked by ICE.
version: 1.0.0
---

# The report

Written after the day's audit and before the meeting; the meeting's agenda is this file, `<gtm.days>/<date>/report.md`,
committed to the install's repository. "We should come with ideas riffing on what exists."

Open with the latest strategic report's diagnosis and targets (`gtm.strategy_reports`), quoted with its date. Then, in
this order:

0. **The funnel.** Every live piece in `gtm.funnel` with its stage, its numbers and the next piece it leads to; per
   product, the counts at each stage, the conversion between stages and where people leak. Leads entering the CRM and
   leads becoming active users, per day, week and post, from the CRM's `events`; reach per day, week and post, from the
   collectors. Reach is the input and people in the CRM the output: give each post its leads per thousand reached. Then
   the release schedule: each upcoming delivery and the pieces it adds to the funnel; a release the funnel cannot fold
   in is raised here, before it ships. Carry the audit's failures forward by their owning cards.
1. **Results of us.** Each recent post against its card's expectation: its reach, its interactors (as a count; people
   only as CRM row ids) and its leads. A post with reach and no leads is a miss, and is called one.
2. **Results of the panel.** What the watched panel (`gtm.panel`) posted since the last report, from the research
   round's notes: the hits and the misses side by side, and the difference between them named. Seeing what does not
   work is how we know which part of what worked actually worked.
3. **Inspiration.** The news in our niche, and what the frontline saw working.
4. **Ideas** over every piece of the map: posts and series, landing pages, the sign-in and waitlist path, reaching back
   out to leads, adding a channel, and asks to strategy. Each with its funnel story and an ICE score (impact on the
   stage it moves, confidence from our numbers and the panel's, ease), ranked.

End with the calendar's state from the manager's last report: slots filled per channel for the coming days, and the
buffer. Every number names its source; one not collected says so.

Commit the file, then finish the round with `complete` and a summary naming the file.
