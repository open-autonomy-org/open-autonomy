#!/bin/sh
# The install's enrollment on the World's machine, as the deployer runs it after a move: once the start has rendered the
# home (ready.ts), .open-autonomy/enroll.ts declares the mail agents and registers the checkout. The start itself only
# starts and stops processes. This service then answers on its port, which is how the World reads a service as up.
set -eu
export SUPERCODE_HOME="$HOME/.config/supercode"
export OPEN_AUTONOMY_SUPERCODE_BIN="$VO_SUPERCODE_BIN" OPEN_AUTONOMY_ORCHESTRATOR_BIN="$VO_ORCHESTRATOR_BIN" SUPERCODE_ORCHESTRATOR_ENTRY="$VO_ORCHESTRATOR_BIN"
export OPEN_AUTONOMY_HARNESS_SDK="$(dirname "$VO_SUPERCODE_SDK")"
until bun "$VO_SCENARIO_DIR/ready.ts"; do sleep 2; done
bun "$VO_AGENT_PROJECT/.open-autonomy/enroll.ts" --project "$VO_AGENT_PROJECT" --home "$VO_AGENT_HOME" || echo "enroll: some acts failed; see above"
echo "enroll: done"
exec bun -e 'Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT), fetch: () => new Response("enrolled\n") })'
