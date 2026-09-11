#!/bin/sh
# The scenario's opening data, then the application's ordinary foreground entrypoint.
set -eu
bun "$OA_SCENARIO_DIR/seed.ts"
export GITHUB_API_URL="$GITHUB_TWIN_URL" GITHUB_TOKEN=world-bot
export HERMES_CODEX_BASE_URL="$GATEWAY_TWIN_URL/v1"
export npm_config_registry="$NPM_REGISTRY_TWIN_URL"
exec bun "$OA_AGENT_PROJECT/.open-autonomy/start.ts" --project "$OA_AGENT_PROJECT" \
  --home "$OA_AGENT_HOME" --secrets "$OA_SECRETS" \
  --origin "$GITHUB_TWIN_URL/$OA_ACCOUNT.git" --valve "$PORT"
