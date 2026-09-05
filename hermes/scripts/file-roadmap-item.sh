#!/usr/bin/env bash
# The fire. Every six hours the schedule runs this script, which spends nothing: it reads ROADMAP.yml on
# the project's main, files the top open item on the agent's board once (the idempotency key is the item
# id, so a second fire while it is open finds the same task), and stops. The gateway's dispatcher runs the
# task as a worker session, the review lane verifies the handoff, and the reporter publishes both.
set -euo pipefail
cd "${WORKDIR:-/work/project}"
git fetch -q origin main
roadmap=$(git show origin/main:ROADMAP.yml)
pick() { printf '%s\n' "$roadmap" | awk -v want="$1" '/^  - id:/{id=$3} $0 ~ "^ *status: " want "$" {print id; exit}'; }
id=$(pick active); [ -n "$id" ] || id=$(pick planned)
if [ -z "$id" ]; then echo "nothing queued: every item on ROADMAP.yml is done or awaits the owner"; exit 0; fi
title=$(printf '%s\n' "$roadmap" | awk -v want="$id" '/^  - id:/{on=($3==want)} on && /^ *title:/{sub(/^ *title: */,""); print; exit}')
acceptance=$(printf '%s\n' "$roadmap" | awk -v want="$id" '/^  - id:/{on=($3==want)} on && /^      - /{sub(/^      - /,"- "); print}')
body=$(cat <<EOF
ROADMAP_ITEM=$id

$title

Acceptance (the whole definition of done):
$acceptance

Work it in this checkout on branch agent/$id off a fresh origin/main (the land skill). Make every
acceptance line true and verify it where AGENTS.md says the project is verified (the verify-in-world
skill where the project keeps a world). Set the item's status to done in ROADMAP.yml on the same
branch (the roadmap skill), commit signed as the agent naming the item id, push the branch, and hand
off with kanban_request_review naming the branch and the commit. Never wait for the landing. If a
line cannot be made true from here, kanban_block with exactly what is missing.
EOF
)
hermes kanban init >/dev/null 2>&1 || true
created=$(hermes kanban create "$title" --body "$body" --assignee default --workspace dir:/work/project \
  --idempotency-key "roadmap:$id" --created-by schedule --skill roadmap --skill land --skill test-driven-development --json)
task=$(printf '%s' "$created" | sed -n 's/.*"id": *"\([^"]*\)".*/\1/p' | head -1)
echo "filed $id as task ${task:-?}: $title"
