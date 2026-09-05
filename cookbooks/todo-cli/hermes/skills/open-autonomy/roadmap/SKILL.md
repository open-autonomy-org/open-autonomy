---
name: roadmap
description: Read and record the project's ROADMAP.yml — the status grammar, what each status permits, how done is recorded.
version: 2.0.0
metadata:
  hermes:
    tags: [open-autonomy, roadmap]
    category: devops
    requires_toolsets: [terminal, file]
---

# The roadmap

`ROADMAP.yml` at the repository root is the owner's queue and the project page's source. Items are ordered
by `phase`, then by position. Each carries `id`, `status`, `title` and `acceptance` lines; the acceptance
lines are the whole definition of done.

- `planned`: queued. `active`: being worked. `done`: every acceptance line true and verified. `proposed`:
  awaits the owner's yes; never work it.
- You never add, remove or reorder an item, and never rewrite an acceptance line. Proposing is the
  owner's job. If an item cannot be finished from where you are, leave it `active` and say what is missing.
- Done is recorded on the same branch as the work: set the item's `status: done` and add a one-line entry
  under `## Unreleased` in `CHANGELOG.md`. Nothing else in the file changes.
- The task on your board names its item as `ROADMAP_ITEM=<id>`; the item's id is the branch name
  (`agent/<id>`) and the first word of the commit subject.
