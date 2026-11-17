#!/bin/sh
# The review World's opening data, then volter-org's ordinary start with its selected installed programs.
set -eu
bun "$VO_SCENARIO_DIR/seed.ts"
export GITHUB_API_URL="$GITHUB_TWIN_URL" GITHUB_TOKEN=world-bot
export HERMES_CODEX_BASE_URL="$CODEX_TWIN_URL/v1"
export SUPERCODE_HOME="$HOME/.config/supercode" ANTHROPIC_BASE_URL="$ANTHROPIC_TWIN_URL" ANTHROPIC_API_KEY=sk-twin
export OPEN_AUTONOMY_SUPERCODE_BIN="$VO_SUPERCODE_BIN" OPEN_AUTONOMY_ORCHESTRATOR_BIN="$VO_ORCHESTRATOR_BIN"
export SUPERCODE_ORCHESTRATOR_ENTRY="$VO_ORCHESTRATOR_BIN" SUPERCODE_CODING_BIN="$VO_CODING_BIN"
# The selected fleet SDK belongs to the same installed release (machine-supercode.ts).
export OPEN_AUTONOMY_HARNESS_SDK="$(dirname "$VO_SUPERCODE_SDK")"
exec bun "$VO_AGENT_PROJECT/.open-autonomy/start.ts" --project "$VO_AGENT_PROJECT" \
  --home "$VO_AGENT_HOME" --secrets "$VO_SECRETS" \
  --origin "https://github.com/$VO_ACCOUNT.git" --valve "$PORT"
