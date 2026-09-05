#!/bin/sh
# The bridge's three processes, as the agent's uid so the socket and the reporter's cursor are the agent's.
#   ssh-agent   the deploy key from /secrets/deploy_key, its socket at /run/bridge/ssh-agent.sock (a volume the agent
#               mounts); absent, pushes are the agent's own problem and the bridge says so
#   valve       /secrets/agent.env on :8787 (the developer's key), /secrets/treasurer.env on :8788 (the treasurer's,
#               the only one that pays), each when present
#   reporter    keyless, beside the valve; if either process dies the bridge ends and compose restarts it
set -eu
uid="${AGENT_UID:-501}"; gid="${AGENT_GID:-20}"
as_agent() { setpriv --reuid="$uid" --regid="$gid" --clear-groups "$@"; }
mkdir -p /run/bridge && chown "$uid:$gid" /run/bridge
if [ -f /secrets/deploy_key ]; then
  install -m 600 -o "$uid" -g "$gid" /secrets/deploy_key /tmp/deploy_key
  rm -f /run/bridge/ssh-agent.sock
  as_agent ssh-agent -a /run/bridge/ssh-agent.sock >/dev/null
  SSH_AUTH_SOCK=/run/bridge/ssh-agent.sock as_agent ssh-add -q /tmp/deploy_key && echo "bridge: ssh-agent holds the deploy key at /run/bridge/ssh-agent.sock"
  rm -f /tmp/deploy_key
else
  echo "bridge: no /secrets/deploy_key — the agent cannot push until one is there (container/README.md)"
fi
keys=""
[ -f /secrets/agent.env ] && keys="$keys --key /secrets/agent.env:8787"
[ -f /secrets/treasurer.env ] && keys="$keys --key /secrets/treasurer.env:8788"
[ -n "$keys" ] || { echo "bridge: no key file in /secrets (agent.env, treasurer.env) — mint one: bun .open-autonomy/mint-key.ts"; exit 1; }
# shellcheck disable=SC2086
as_agent bun /opt/bridge/sdk/valve.ts $keys &
valve=$!
OPEN_AUTONOMY_BASE_URL=http://127.0.0.1:8787/v1 HERMES_HOME=/opt/data as_agent bun /opt/bridge/reporter.ts --config /work/project/.open-autonomy/config.yaml &
reporter=$!
while kill -0 "$valve" 2>/dev/null && kill -0 "$reporter" 2>/dev/null; do sleep 5; done
echo "bridge: a process ended; restarting the bridge"
exit 1
