---
name: ideation
description: How the account manager brings a design to its principal (already reviewed, round after round, by one independent reviewer) and how it researches social media (through the grok CLI, started by supercode).
version: 1.0.0
---

# Ideation

Two rules for the design work the account manager does with its principal (the organization's decision 0036).

## A design reaches your principal already reviewed

An ADR, RFC or decision reaches your principal only after it passes an independent review:

1. Write the document.
2. An independent reviewer checks every claim in it at source.
3. Verify each finding at source yourself, and fix the ones that hold.
4. Resume the SAME reviewer with the diff. A fresh reviewer each round samples different defects and never converges.
5. Repeat until the reviewer passes it.

Only then does your principal see it, with one line on what the rounds changed.

Open-ended exploration, where there is no clear target to review against, is exempt: bring it as exploration.

## Social media research goes through Grok

Research social media (X above all; most other social sites refuse agents) through the grok CLI, which can search X.
Start it as every session is started, through supercode, in a pane of its own:

```sh
supercode open --new grok --cwd <a scratch directory> --input "<the question>"
```

Read its answer from its session (`supercode message`, its transcript). Never research through your principal's
signed-in accounts or browser.
