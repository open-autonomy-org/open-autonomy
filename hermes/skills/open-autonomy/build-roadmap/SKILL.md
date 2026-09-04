---
name: build-roadmap
description: Work the top open item of ROADMAP.yml in the Open Autonomy repository — implement it, verify it, push to main, and record its status.
version: 1.0.0
metadata:
  hermes:
    tags: [open-autonomy, roadmap, build]
    category: devops
    requires_toolsets: [terminal, file]
---

# Build the roadmap

You are in the Open Autonomy repository (the cron job sets the working directory). Read `AGENTS.md` for the repository rules before anything else.

## Pick the item

1. Read `ROADMAP.yml`. Items are ordered by `phase`, then by position. Pick the first item whose `status` is `active`; if none is `active`, pick the first `planned` item and set it to `active`. Never pick a `proposed` item: those await the owner. If there is no `active` or `planned` item, there is nothing to build: report "nothing queued" in one line and stop. Never add an item yourself.
2. Read the item's `acceptance` lines. They are the whole definition of done.

## Build it

3. Read the code the item touches before changing it. Match the existing style.
4. Make the smallest change that makes every acceptance line true. Keep code, tests, and docs in the same commit.
5. Run `bun run check` from the repository root. If it fails, fix the cause; do not weaken a test.

## Verify it in the world

You cannot reach production and must not try. You have something better: `world/` is the whole product on
your machine — the real worker, local twins of GitHub and the model gateway, no keys (`world/README.md`).

6. Bring it up: `bun world/run.ts up`. That is the twins and the platform worker built from your working
   tree, seeded and keyed. It prints the platform's URL, and `bun world/run.ts env -- <cmd>` runs anything
   with the world's environment (`$PLATFORM_URL`, `$GITHUB_TWIN_URL`, `$OPENAI_TWIN_URL`).
7. Exercise every acceptance line that names a live surface against that world: `curl` the worker's route,
   fetch the page and read what came back, look at the SVG, post a receipt on the world's key if the line is
   about receipts. A green unit test is not proof that a surface works.
8. You are the operator of that world, never a second agent inside it. Do not run `bun world/run.ts agent`,
   `verify` or `check`: those start another Hermes, which is a maintainer's gate for the agent stack itself,
   not something you can do from inside your own run. If an acceptance line is about the agent's own
   runtime, it is verified against the attached stack by a maintainer; say so and leave the item `active`.
9. Tear it down when you are finished: `bun world/run.ts down --purge`.
10. If a line cannot be made true even in the world (it needs the deployed worker, a dashboard, or the
    owner), stop. Leave the item `active`, and write one paragraph saying exactly what is missing. Deploying
    is a maintainer's reviewed step; say so rather than claiming the live site.

## Land it

11. Start from a fresh `main`: `git fetch origin && git checkout -B agent/<item-id> origin/main` before you change anything (if you already changed files, do this first and carry the changes over). Commit with a message that names the roadmap item id in its first line, e.g. `per-call-audit: append every metered call to the account log`. Commit as the agent, signed off, so the history shows what the agent did: `git commit -s --author="Open Autonomy agent <agent@open-autonomy.org>"`.
12. When every acceptance line is true and verified in the world, set the item's `status: done` in `ROADMAP.yml` in the same branch. Add a one-line entry under `## Unreleased` in `CHANGELOG.md`.
13. Push the branch: `git push -u origin agent/<item-id>`. You cannot open pull requests or push to `main`, and you do not need to: the landing workflow opens the pull request and it merges on its own when the required checks pass. Do not wait for it. If the push is rejected because the branch exists from an earlier run, push to `agent/<item-id>-<YYYYMMDD-HHMM>` instead.

## Report

14. Report in five lines or fewer: the item id, what changed, the branch you pushed, what you verified **in the world** and how (name the surface you exercised), what is left. Nothing else.
