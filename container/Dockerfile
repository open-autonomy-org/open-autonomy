# The Open Autonomy agent's container: stock Hermes plus what the build-roadmap skill runs (git over ssh
# to push, bun for `bun run check`). It holds no secret: the model key lives in the sidecar, the push key
# in an ssh-agent forwarded from the host, and the only thing in its environment is the Discord token.
FROM hermes-agent:local
USER root
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client git ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
ARG BUN_VERSION=1.3.10
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}" \
    && ln -sf /usr/local/bin/bun /usr/local/bin/bunx && bun --version
RUN mkdir -p /work && chown 10000:10000 /work
