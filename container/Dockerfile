# The agent's container: stock Hermes at the pinned tag (container/hermes.pin, built by
# container/build-hermes.sh) plus what a worker runs: git over ssh to push, bun for the
# project's check, and the home synced from the repository before every start. It holds no secret: the keys
# and the push key live in the bridge, and the only thing in its environment is an optional Discord token.
ARG HERMES_IMAGE=hermes-agent:v2026.8.31
FROM ${HERMES_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client git ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
ARG BUN_VERSION=1.3.10
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}" \
    && ln -sf /usr/local/bin/bun /usr/local/bin/bunx && bun --version
RUN mkdir -p /work
# s6 runs this before the gateway: the committed home into the volume.
COPY container/home-sync.sh /etc/cont-init.d/00-home-sync
RUN chmod +x /etc/cont-init.d/00-home-sync
