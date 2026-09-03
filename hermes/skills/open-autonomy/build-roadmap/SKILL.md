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

1. Read `ROADMAP.yml`. Items are ordered by `phase`, then by position. Pick the first item whose `status` is `active`; if none is `active`, pick the first `planned` item and set it to `active`. Never pick a `proposed` item: those await the owner.
2. Read the item's `acceptance` lines. They are the whole definition of done.

## Build it

3. Read the code the item touches before changing it. Match the existing style.
4. Make the smallest change that makes every acceptance line true. Keep code, tests, and docs in the same commit.
5. Run `bun run check` from the repository root. If it fails, fix the cause; do not weaken a test.

## Verify it live

6. Where an acceptance line names a live surface (the deployed worker, the site, the README widget), verify it on that surface: `curl` the worker route, fetch the page, look at the result. A green test is not proof that the surface works.
7. If a line cannot be made true from inside this repository (it needs a secret, a dashboard, or the owner), stop. Leave the item `active`, and write one paragraph in your report saying exactly what is missing.

## Land it

8. Commit with a message that names the roadmap item id in its first line, e.g. `per-call-audit: append every metered call to the account log`. Commit directly on `main` and push. No branches, no pull requests.
9. When every acceptance line is true and verified, set the item's `status: done` in `ROADMAP.yml` in the same push. Add a one-line entry under `## Unreleased` in `CHANGELOG.md`.

## Report

10. Report in five lines or fewer: the item id, what changed, what you verified and how, what is left. Nothing else.
