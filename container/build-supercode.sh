#!/bin/sh
# Build supercode for the VM (Linux, this machine's architecture) from the sibling checkout, into
# container/supercode-linux-arm64 (git-ignored), for Dockerfile.reporter. The build's target lives in a
# Docker volume; the binary is streamed out, since the checkout is mounted into the builder read-only.
set -eu
SRC=${SUPERCODE_SRC:-$(dirname "$0")/../../supercode}
docker run --rm -v "$(cd "$SRC" && pwd)":/src:ro -v oa-cargo-registry:/usr/local/cargo/registry -v oa-cargo-target:/target \
  -w /src -e CARGO_TARGET_DIR=/target rust:1-bookworm cargo build --release --bin supercode
docker run --rm -v oa-cargo-target:/t alpine cat /t/release/supercode > "$(dirname "$0")/supercode-linux-arm64"
chmod +x "$(dirname "$0")/supercode-linux-arm64"
