---
name: build-roadmap
description: Work the top open item of the project's ROADMAP.yml — implement it, verify it in the world, push a branch, and record its status.
version: 1.0.0
metadata:
  hermes:
    tags: [open-autonomy, roadmap, build]
    category: devops
    requires_toolsets: [terminal, file]
---

# Build the roadmap

You are in the project's repository (the cron job sets the working directory). Read `AGENTS.md` for the repository's rules before anything else; where this skill and `AGENTS.md` disagree, `AGENTS.md` wins.

## Pick the item

1. Read `ROADMAP.yml`. Items are ordered by `phase`, then by position. Pick the first item whose `status` is `active`; if none is `active`, pick the first `planned` item and set it to `active`. Never pick a `proposed` item: those await the owner. If there is no `active` or `planned` item, there is nothing to build: report "nothing queued" in one line and stop. Never add an item yourself.
2. Read the item's `acceptance` lines. They are the whole definition of done.

## Build it

3. Read the code the item touches before changing it. Match the existing style.
4. Make the smallest change that makes every acceptance line true. Keep code, tests, and docs in the same commit.
5. Run `bun run check` from the repository root. If it fails, fix the cause; do not weaken a test.

## Verify it

6. You cannot reach the project's production and must not try. Verify where `AGENTS.md` says the project
   is verified: its checks, and its local or twinned surfaces. Where a project keeps a volter-world, you are
   that world's operator — bring it up, exercise each acceptance line against it with `curl` and by reading
   what came back, tear it down. You are never a second agent inside it: never start another Hermes.
7. A green unit test is not proof that a surface works. Where an acceptance line names a surface, exercise
   the surface.
8. If a line cannot be made true from where you are (it needs a deploy, a dashboard, or the owner), stop.
   Leave the item `active`, and write one paragraph saying exactly what is missing. Deploying is a
   maintainer's reviewed step; say so rather than claiming a live site.

## Land it

9. Start from a fresh `main`: `git fetch origin && git checkout -B agent/<item-id> origin/main` before you change anything (if you already changed files, do this first and carry the changes over). Commit with a message that names the roadmap item id in its first line, e.g. `per-call-audit: append every metered call to the account log`. Commit as the agent, signed off, so the history shows what the agent did: `git commit -s --author="Open Autonomy agent <agent@open-autonomy.org>"`.
10. When every acceptance line is true and verified, set the item's `status: done` in `ROADMAP.yml` in the same branch. Add a one-line entry under `## Unreleased` in `CHANGELOG.md`.
11. Push the branch: `git push -u origin agent/<item-id>`. You cannot open pull requests or push to `main`, and you do not need to: the landing workflow opens the pull request and it merges on its own when the required checks pass. Do not wait for it. If the push is rejected because the branch exists from an earlier run, push to `agent/<item-id>-<YYYYMMDD-HHMM>` instead.

## Report

12. Report in five lines or fewer: the item id, what changed, the branch you pushed, what you verified and how (name the surface you exercised), what is left. Nothing else.
