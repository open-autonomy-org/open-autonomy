#!/bin/sh
# Build supercode for the VM (Linux, this machine's architecture) from the sibling checkout, into
# container/supercode-linux-arm64 (git-ignored), for Dockerfile.reporter.
set -eu
SRC=${SUPERCODE_SRC:-$(dirname "$0")/../../supercode}
docker run --rm -v "$(cd "$SRC" && pwd)":/src -v oa-cargo-registry:/usr/local/cargo/registry -v oa-cargo-target:/target \
  -w /src -e CARGO_TARGET_DIR=/target rust:1-bookworm \
  sh -c 'cargo build --release --bin supercode && cp /target/release/supercode /src/target/supercode-linux-arm64'
cp "$SRC/target/supercode-linux-arm64" "$(dirname "$0")/supercode-linux-arm64"
