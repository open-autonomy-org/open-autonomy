---
name: funnel-audit
description: The daily funnel audit: walk every live path as a visitor, run every checklist item against its pass bar, check the measuring system itself, then ask "can you think of anything?" and record the answer.
version: 1.0.0
---

# The funnel audit

Runs first each day, before the report. Its output is the day's audit file, `<gtm.days>/<date>/audit.md`, committed to
the install's repository.

1. **The checklist.** Read `gtm.checklist`. Each item names its door and its pass bar. Run every item, in order, and
   record for each: pass or fail, the reading, and its source (a URL with its time, a table row, a command's output).
   Never skip an item because it passed yesterday.
2. **Walk every live path as a visitor.** For each path in `gtm.funnel` (post link → landing page → demo or try →
   sign-in, waitlist or follow → the CRM row appearing): open each link with `?ref=fleet` added, signed in nowhere, and
   follow it to its end. Record where it stalls, what is slow, a link that does not resolve, a page not indexed, and a
   link to a private repository the release hold (`gtm.release_hold`) does not allow.
3. **The landing pages' key numbers** against yesterday and the week, from the analytics collector's rows.
4. **The measuring system itself.** For every collector in `gtm.collectors`: it ran today, no day is missing since it
   was built (name each missing day), and its counts reconcile with its neighbours' (a star in the GitHub collector is a
   `starred` event in the CRM). The fleet's own visits are excluded.
5. **"Can you think of anything?"** Ask it of yourself in earnest, about the whole funnel, and record the answer, "nothing"
   included. A finding worth checking again is proposed to the manager as a new checklist item, with its door and bar.
6. **Findings.** Every failure is named with the card that owns it, or proposed to the manager as a funnel-fix card. A
   break on a live path is sent to the manager at once, not left for the report.

Commit the file, then finish the round with `complete` and a summary naming the file and the count of failures.
