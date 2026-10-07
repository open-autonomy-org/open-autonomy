---
name: strategy
description: The daily strategic report. Read the whole day at its sources (commits, boards, sessions, the go-to-market lane's audit, report and meeting, CRM events, the account manager's channels, the books) and what moved outside; write what happened, what moved and what we now do, with targets, the share between the lanes, the roadmap's ranking, a ruling on every ask and the release hold; have it judged; asking nobody.
version: 1.0.0
---

# The strategic report

Your daily job runs after the day ends. Its configuration is `strategy:` in `.open-autonomy/config.yaml`: where the
day's record is written (`strategy.daily`, a folder of the organization's record), the go-to-market installs to read
(`strategy.lanes`: each one's repository and its board's address), the CRM's path (`strategy.crm`), the cursors' file
(`strategy.cursors`), and the judge's command (`strategy.judge`).

## 1. Read the day, at its sources

Advance from the cursors (one per project, per board and per source), and move each only after the report is written.

- **Inside:**
  - each project's commits since its cursor (`organization.projects`; `git log` on a fresh fetch);
  - this install's board: the cards that moved, their verdicts and the sessions behind them (`supercode workflow`,
    the session transcripts);
  - each go-to-market board, read-only through its address (`strategy.lanes[].board`), and that lane's day files (its
    audit, report and meeting) from a fresh clone of its repository;
  - the frontline's captures and the live sessions, as that lane's files record them;
  - CRM events, read with `sqlite3 -readonly` at `strategy.crm`: leads entering, leads becoming active users, per
    product and post (people only as row ids);
  - the account manager's channels and the principal's conversations, read in their threads
    (`supercode message threads`);
  - the books (the organization's statements on its platform).
- **Outside:** what moved in the market: the watched panel, the news, competitors' releases. Social media through the
  grok CLI, started through supercode in a pane of its own (`supercode open --new grok --cwd <a scratch directory> --
  "<the question>"`), never a signed-in account. Re-read the strategy's rule "never compete where a service exists and
  is complete" against what you find.

A source you could not read is a gap: name it in the report, and go on with your best call.

## 2. Write the report

`<strategy.daily>/<date>.md` in the organization's record, whose only writer for that file is this job. Three parts:

1. **What happened inside.** Each result explained by its cause; what does not fit included.
2. **What moved outside.** Threats and opportunities, each with its evidence and link. Name at least one, or say why
   none moved.
3. **What we now do:**
   - the diagnosis of the main obstacle (one paragraph), and whether it changed: a change is a numbered decision (§4);
   - the targets for the next day and week, per lane, each a commitment registered before its period in the project's
     Results section where the organization keeps targets;
   - the share between the lanes;
   - the product roadmap's ranking: the boards' next cards in order, each naming what it moves;
   - a ruling on every ask raised to strategy since the last report (from both boards and the meeting);
   - the release hold: which private repositories the go-to-market lane may point to.

Every number names its source. Unknown is not zero.

## 3. The judge

Start the judge (`strategy.judge`, another model family's non-interactive session, such as `codex exec`) with the
report and the raw numbers it rests on: the CRM counts, the collectors' rows, the boards' events. It reads the numbers
against your story and answers whether the story holds. Write its verdict into the report, under its own heading. Where
it disagrees, its disagreement stands in the report beside your answer; you never edit its words.

## 4. Decisions

A change of direction, positioning or priority lands as the record's next numbered decision, citing what changed and why
the old diagnosis no longer holds, keeping the text it changes. Before it reaches the principal:

1. Write it.
2. An independent reviewer checks every claim in it at source.
3. Verify each finding at source yourself; fix the ones that hold.
4. Resume the SAME reviewer with the diff. A fresh reviewer each round samples different defects and never converges.
5. Repeat until it passes. Then it lands, and the report links it.

## 5. Publish

Commit the report (and any decision) to the record from this install's clone, push, and send its link to the account
manager and to each lane's manager. Then move the cursors.
