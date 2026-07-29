#!/usr/bin/env bash
# The hermes-sdlc LIVE rig: a throwaway repo + an isolated Hermes home, wired exactly as a real install.
#
# This exists because everything about this profile was proven per-seam and nothing was ever proven running.
# A rig you can stand up in one command is what makes "run it and watch what breaks" cheap enough to do
# repeatedly — which is the only thing that has ever found the defects that matter here (the empty
# $ZTRACK_ISSUE, the scratch-dir reviewer, the fabricated "pr": 4, the stale block reason).
#
# ISOLATION IS THE POINT, and it is not optional:
#   - Its own HERMES_HOME. Never the operator's ~/.hermes: this creates profiles, cron jobs and a kanban
#     board, and pointing that at a live home would schedule real workers against real work.
#   - Secrets are SYMLINKED, never copied — an API key must not end up in a scratch dir that gets rm -rf'd
#     into a backup, and a copy silently goes stale when the operator re-auths.
#   - Its own git repo, so a worker's commits and worktrees cannot touch anything you care about.
#
# Usage:
#   scenarios/hermes-sdlc/live/rig.sh up          # build everything, print the paths
#   scenarios/hermes-sdlc/live/rig.sh down <dir>  # tear it all down
set -euo pipefail

OA_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HERMES_VENV_PY="${HERMES_VENV_PY:-$HOME/.hermes/hermes-agent/venv/bin/python}"
REAL_HERMES_HOME="${REAL_HERMES_HOME:-$HOME/.hermes}"
# Sonnet 5 for live runs: the operator's standing instruction, and the rig must not silently inherit
# whatever the real home's default happens to be (it is opus today, which costs several times more per
# card for work this loop does not need it for).
RIG_MODEL="${RIG_MODEL:-claude-sonnet-5}"
# Direct Anthropic API by default. A BARE model id is required here — `anthropic/claude-sonnet-5` is an
# OpenRouter-style route and a direct-API provider rejects it.
RIG_PROVIDER="${RIG_PROVIDER:-anthropic}"
#
# THE MODEL/PROVIDER MUST BE FINAL BEFORE install.py RUNS. Hermes pins each cron job to the global inference
# config it was created under and REFUSES to run an unpinned job whose config has since drifted
# ("Skipped to prevent unintended spend: global inference config drifted since this job was created").
# That is a good guard and a real operational trap: change the model on a live install and every standing
# actor silently stops firing — loud in the job log, invisible on the board — until the installer is re-run
# (it reconciles the jobs by name) or each job is pinned by hand.

die() { echo "rig: $*" >&2; exit 1; }

up() {
  local root
  root="$(mktemp -d /tmp/oa-live-XXXXXX)"
  local repo="$root/repo" home="$root/hermes-home"
  mkdir -p "$repo" "$home"

  [ -x "$HERMES_VENV_PY" ] || die "no Hermes venv python at $HERMES_VENV_PY (set HERMES_VENV_PY)"
  [ -f "$REAL_HERMES_HOME/config.yaml" ] || die "no $REAL_HERMES_HOME/config.yaml to derive model/provider from"

  # ---- the isolated Hermes home ----
  # config.yaml is COPIED (it is not a secret, and each generated profile config is a full replacement of
  # it, so the rig must carry the operator's real provider block) but with the model pinned to Sonnet 5.
  "$HERMES_VENV_PY" - "$REAL_HERMES_HOME/config.yaml" "$home/config.yaml" "$RIG_MODEL" "$RIG_PROVIDER" <<'PY'
import sys, yaml
src, dst, model, provider = sys.argv[1:5]
cfg = yaml.safe_load(open(src, encoding="utf-8")) or {}
# ASSIGNED, not merged: a stale `base_url` from the operator's config (an OpenRouter route, say) silently
# overrides the provider chosen here and the run fails as a model/provider mismatch.
cfg["model"] = {"default": model, "provider": provider}
open(dst, "w", encoding="utf-8").write(yaml.safe_dump(cfg, sort_keys=False))
PY

  # ---- credentials ----
  # Preference order, and the first one that answers wins:
  #   1. CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY / OPENROUTER_API_KEY already exported — the operator
  #      is telling us which account to bill, so write exactly that into the rig's OWN .env.
  #   2. the Claude Code credential on disk (~/.claude/.credentials.json) — "my default claude".
  #   3. fall back to symlinking the operator's real ~/.hermes/.env.
  # Written to the RIG's own .env, at 0600, never by writing through a symlink into the real home.
  local wrote_env=""
  for var in CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_API_KEY OPENROUTER_API_KEY; do
    if [ -n "${!var:-}" ]; then
      ( umask 077; printf '%s=%s\n' "$var" "${!var}" > "$home/.env" )
      wrote_env="$var (from the environment)"
      break
    fi
  done
  if [ -z "$wrote_env" ] && [ -f "$HOME/.claude/.credentials.json" ]; then
    if "$HERMES_VENV_PY" - "$HOME/.claude/.credentials.json" "$home/.env" <<'PY'
import json, os, sys
src, dst = sys.argv[1], sys.argv[2]
tok = (json.load(open(src)).get("claudeAiOauth") or {}).get("accessToken")
if not tok:
    sys.exit(1)
fd = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    f.write("CLAUDE_CODE_OAUTH_TOKEN=%s\n" % tok)
PY
    then wrote_env="CLAUDE_CODE_OAUTH_TOKEN (from ~/.claude/.credentials.json)"; fi
  fi
  if [ -z "$wrote_env" ]; then
    # Secrets: SYMLINKED. A copied credential outlives its usefulness and its owner's intent.
    [ -e "$REAL_HERMES_HOME/.env" ] && ln -s "$REAL_HERMES_HOME/.env" "$home/.env"
    wrote_env="symlink -> $REAL_HERMES_HOME/.env"
  fi
  [ -e "$REAL_HERMES_HOME/auth.json" ] && ln -s "$REAL_HERMES_HOME/auth.json" "$home/auth.json"
  RIG_CREDENTIAL="$wrote_env"

  # ---- the throwaway repo ----
  cd "$repo"
  git init -q
  git config user.email "rig@open-autonomy.local"
  git config user.name "oa-live-rig"
  printf '# live rig\n\nA throwaway repository for proving the hermes-sdlc loop.\n' > README.md
  git add -A && git commit -qm "initial commit"

  # ztrack must be REPO-LOCAL: its CLI resolves `node_modules/.bin/ztrack` by walking up from cwd, which is
  # also how it resolves from inside a worker's isolated worktree.
  printf '{\n  "name": "oa-live-rig",\n  "private": true,\n  "type": "module"\n}\n' > package.json
  npm install --silent --no-audit --no-fund ztrack@1.4.0 >/dev/null 2>&1 || die "npm install ztrack failed"
  npx --no-install ztrack init --preset simple-sdlc >/dev/null 2>&1 || die "ztrack init failed"
  git add -A && git commit -qm "chore: ztrack simple-sdlc tracker"

  # ---- compile + install the profile, exactly as a real install does ----
  cd "$OA_REPO"
  # Compiling INTO A GIT WORKTREE produces a reviewable install CANDIDATE rather than writing files: the
  # CLI refuses `--force` there ("every replacement must remain visible in the reviewed candidate commit")
  # and prints `install-candidate=<sha>`, which a second `accept` step lands. The rig plays the reviewing
  # agent — that two-phase flow IS the real install path, so the rig must exercise it, not route around it.
  local candidate
  candidate="$(bun bin/autonomy-compile.ts hermes-sdlc hermes "$repo" 2>/dev/null | sed -n 's/^install-candidate=//p' | tail -1)"
  [ -n "$candidate" ] || die "compile produced no install candidate — run \`bun bin/autonomy-compile.ts hermes-sdlc hermes $repo\` to see why"
  bun bin/open-autonomy.ts accept "$candidate" --target "$repo" >/dev/null \
    || die "accepting install candidate $candidate failed"
  cd "$repo"
  [ -f hermes/install.py ] || die "install candidate accepted but hermes/install.py is missing"
  HERMES_HOME="$home" "$HERMES_VENV_PY" hermes/install.py 2>&1 | sed 's/^/  /'
  git add -A && git commit -qm "chore: compiled hermes-sdlc" 2>/dev/null || true   # accept already committed the candidate

  cat <<EOF

rig up.
  root:   $root
  repo:   $repo
  home:   $home
  model:  $RIG_MODEL (provider $RIG_PROVIDER)
  creds:  $RIG_CREDENTIAL

  board:      HERMES_HOME=$home hermes kanban list --json
  gateway:    cd $repo && HERMES_HOME=$home hermes -p pm gateway run
  one tick:   cd $repo && HERMES_HOME=$home/profiles/pm hermes cron tick
  sweep:      HERMES_HOME=$home/profiles/pm $HERMES_VENV_PY $home/profiles/pm/scripts/oa-attention-sweep.py
  teardown:   $0 down $root
EOF
}

down() {
  local root="${1:-}"
  [ -n "$root" ] || die "usage: rig.sh down <root>"
  case "$root" in /tmp/oa-live-*) ;; *) die "refusing to remove $root — not a rig root (/tmp/oa-live-*)";; esac
  # Kill anything still running out of this root BEFORE deleting it, matched on the root PATH so no process
  # outside this rig can ever match. Never a bare pkill.
  pkill -f "$root" 2>/dev/null || true
  # A worker's worktrees hold no state the rig needs; the whole root goes.
  rm -rf "$root"
  echo "rig down: $root removed"
}

# Seed ONE real, verifiable issue. Separate from `up` so the rig can be stood up and inspected before any
# work exists, and so a proof can re-seed without rebuilding everything.
#
# The AC SHAPE IS NOT FREE-FORM and getting it wrong costs a confusing hour: the simple-sdlc preset requires
# `- [ ] <id> v<N> <text>` plus an indented `- status:` line. A plain markdown checkbox parses as an AC with
# no `version`, and every later `ztrack ac patch` then refuses with "does not parse against the grammar" —
# so a worker cannot record evidence on an issue that was authored casually. `ztrack issue scaffold` prints
# the canonical shape.
seed() {
  local repo="${1:-}"
  [ -n "$repo" ] || die "usage: rig.sh seed <root>/repo"
  cd "$repo"
  local body; body="$(mktemp)"
  cat > "$body" <<'EOF'
Add a small script that prints this repository's name, so the loop has a real, verifiable change to carry.

## Acceptance Criteria

- [ ] dev/01 v1 `scripts/greet.sh` exists in the repository and is executable
  - status: pending
- [ ] dev/02 v1 running `bash scripts/greet.sh` prints exactly `oa-live-rig`
  - status: pending
EOF
  # `oa-approved` is the day-one dispatch fence (policy.dispatch.allow_label): a `ready` issue WITHOUT it is
  # ineligible, so seeding without the label is how you prove the fence, not a mistake to avoid.
  ztrack issue create --title "Add a greet script" --body-file "$body" --state ready --label oa-approved
  rm -f "$body"
  ztrack check
  git add -A && git commit -qm "chore: seed the rig's first issue"
  echo "seeded. Run a PM tick to file it."
}

case "${1:-}" in
  up) up;;
  seed) shift; seed "$@";;
  down) shift; down "$@";;
  *) die "usage: rig.sh up | rig.sh seed <repo> | rig.sh down <root>";;
esac
