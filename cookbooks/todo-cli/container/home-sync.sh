#!/bin/sh
# Before the gateway starts, on every boot: the committed home (hermes/ in the checkout — SOUL, skills, profiles,
# seeds, config) into the home volume. The repository is the source of truth for what the agent IS; the volume only
# holds what it has since done. The agent's own .env in the volume is kept.
set -e
if [ -d /work/project/hermes ]; then
  cd /work/project/hermes && find . -type f ! -name '.env' -exec cp -a --parents {} /opt/data/ \;
  chown -R "${HERMES_UID:-501}:${HERMES_GID:-20}" /opt/data
  echo "home synced from the repository"
fi
