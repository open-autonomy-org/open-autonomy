#!/bin/sh
# The GTM manager's clock (docs/decisions/0020): a no_agent job's script, run by the orchestrator on the profile's
# schedule. It wakes the GTM manager's own session, the board's manager (the first agent address in the board's
# params.managers), with the tick: one request to Supercode's session service from a named sender, since a job is no
# session and a session's own `message send` from another config home cannot see the manager's live session.
# HERMES_HOME is this profile's folder, inside the home whose workflow.yaml is the board.
board="${HERMES_HOME:?}/../../workflow.yaml"
to=$(grep -o "sc:[^'\" ]*:agent:[^'\" ]*" "$board" | head -1)
[ -n "$to" ] || { echo "clock: the board names no manager agent in $board" >&2; exit 1; }
request="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"harness.v1.sessions.message\",\"params\":{\"locator\":{\"harness\":\"agent\",\"session_id\":\"${to##*:agent:}\"},\"text\":\"GTM MANAGER TICK\",\"from_name\":\"gtm-clock\",\"subject\":\"tick\"}}"
answer=$({ printf '%s\n' '{"jsonrpc":"2.0","id":0,"method":"harness.v1.capabilities","params":{}}' "$request"; sleep 10; } | supercode harness serve 2>/dev/null | grep '"id":1' | head -1)
printf '%s' "$answer" | grep -q '"delivered_to_bus":true' || { echo "clock: the tick was not delivered to $to: $answer" >&2; exit 1; }
echo "tick sent to $to"
