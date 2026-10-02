---
name: research
description: The research and collection round: run the day's collectors and confirm what they wrote, read the news and the watched panel's recent posts, and research social media more widely through the grok CLI.
version: 1.0.0
---

# Research and collection

Runs through the day on its card's interval. Its notes go to `<gtm.days>/<date>/research.md`, appended per run and
committed to the install's repository.

1. **Collection.** For each collector in `gtm.collectors` that runs from this round (its `run: round`), run its
   command; for each that runs on its own schedule, read its last run. Record, per collector: when it ran, the rows it
   wrote, and its error if it failed. A collector backfills what its source still keeps; a day it could not backfill is
   named as lost. Collectors are the only writers of the CRM besides its deletion door; you never write to it yourself.
2. **The news.** What moved in the niche since the last run, each item with its link and date: releases, launches,
   discussions worth a take. Name an item that could carry a post, with the angle.
3. **The watched panel.** For each account in `gtm.panel`, its posts since the last run: what each was (format, hook),
   its numbers, and whether it hit or missed for that account. The panel is read through the frontline's captures where
   it records them; otherwise through the grok CLI, never a signed-in browser.
4. **Wider research** on social media goes through the grok CLI, started through supercode in a pane of its own:
   `supercode open --new grok --cwd <a scratch directory> -- "<the question>"`. Read its answer from its session.

Nothing here is copied about a person beyond what the report needs; another person's post is described, not stored.
Finish the round with `complete` and a summary: the collectors' rows written, and the items worth a card.
