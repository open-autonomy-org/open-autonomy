---
name: review
description: Review a handoff against the repository's STANDARDS.md and the task's acceptance lines — approve, or send it back naming the lines.
version: 3.0.0
metadata:
  hermes:
    tags: [open-autonomy, kanban, review]
    category: devops
    requires_toolsets: [terminal]
---

# Review

You review one handoff. `kanban_show` gives you the task, its acceptance lines, and the handoff naming the
branch and the commit. You decide whether it is done.

1. `git fetch origin` and read the diff: `git diff origin/main...origin/agent/<task id>`.
2. Read `STANDARDS.md`. It is the repository's coding standards, the bar the diff is held to. Where it is silent,
   `AGENTS.md` speaks.
3. For each acceptance line: is it made true by this diff, and does the handoff say how that was verified? A line
   verified nowhere is not done.
4. For the diff: does it meet `STANDARDS.md`? Is anything added that no acceptance line asked for, tests
   included?
5. Verdict, through the lane's own tools: approve when every line is true and the diff meets the standards, in
   one paragraph naming what you checked; otherwise send it back naming each failing line or standard, nothing
   else. You never edit code and never push.
