#!/bin/sh
# Build the pinned Hermes image the agent runs on (container/hermes.pin). Clones the tag into a
# temporary directory — this repository never vendors Hermes — verifies the commit, and builds
# `hermes-agent:<tag>` in the current Docker context. Takes ~10 minutes the first time.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
. "$here/hermes.pin"
image="hermes-agent:$HERMES_TAG"
if [ "${FORCE:-}" != "1" ] && docker image inspect "$image" >/dev/null 2>&1; then
  echo "$image already built (FORCE=1 to rebuild)"
  exit 0
fi
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git clone -q --depth 1 --branch "$HERMES_TAG" "$HERMES_REPO" "$work/hermes"
have=$(git -C "$work/hermes" rev-parse HEAD)
[ "$have" = "$HERMES_COMMIT" ] || { echo "hermes.pin: $HERMES_TAG is $have, not the pinned $HERMES_COMMIT" >&2; exit 1; }
# The upstream Dockerfile uses a symbolic --chmod, which needs a Dockerfile frontend newer than the
# daemon's built-in one.
docker build --build-arg BUILDKIT_SYNTAX=docker/dockerfile:1.17 -t "$image" "$work/hermes"
echo "built $image ($HERMES_COMMIT)"
