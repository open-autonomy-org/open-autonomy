# The executor: native Hermes and its tools. World owns this container's lifetime;
# start.ts --container on the host owns the valve, reporter and gateway lifetime.
# No host credentials or Docker socket are mounted into the executor.
ARG HERMES_IMAGE=hermes-agent:v2026.8.31
FROM ${HERMES_IMAGE} AS managed
USER root
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client git ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
ARG BUN_VERSION=1.3.10
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}" \
    && ln -sf /usr/local/bin/bun /usr/local/bin/bunx && bun --version
# Codex, for a project whose setup picks it: the orchestrator runs it as each profile's worker, its model through the
# host valve's Codex forward (ADR 0009, as amended); the executor holds no login.
ARG CODEX_VERSION=0.156.1
RUN npm install -g "@openai/codex@${CODEX_VERSION}" && npm cache clean --force && codex --version
# Volter Harness: one install, the image's own, as on a bare machine (D215, D217), never a copy in .open-autonomy.
# @volter/supercode brings its orchestrator, harness SDK and Teams package at its one release (supercode RELEASING.md);
# its orchestrator's daemon entry is the image's supercode-orchestrator, which container.ts runs. SUPERCODE_VERSION is
# the host machine's own supercode release (the kit's build passes it), so the image and the host keeper are one release.
ARG SUPERCODE_VERSION
RUN test -n "$SUPERCODE_VERSION" || { echo "build with --build-arg SUPERCODE_VERSION=<a supercode release>" >&2; exit 1; }
RUN npm install -g --allow-scripts=@homebridge/node-pty-prebuilt-multiarch "@volter/supercode@${SUPERCODE_VERSION}" \
    && npm cache clean --force && supercode --version \
    && ln -s "$(npm root -g)/@volter/supercode/node_modules/@volter/supercode-orchestrator/bin/orchestrator.mjs" /usr/local/bin/supercode-orchestrator
# The start script and the reporter's dependencies, from the image — the checkout arrives after the first boot.
COPY .open-autonomy /opt/agent/.open-autonomy
ARG RUNTIME_REGISTRY=https://registry.npmjs.org
RUN cd /opt/agent/.open-autonomy && bun install-runtime.ts --runtime-registry "$RUNTIME_REGISTRY"
# Login shells use /usr/local/bin; expose the installed World CLI there too.
RUN ln -s /opt/agent/.open-autonomy/node_modules/.bin/volter-world /usr/local/bin/volter-world
RUN mkdir -p /work/project /opt/data && chown hermes:hermes /work/project /opt/data
# Keep native file writes within the Hermes home and this project checkout.
ENV HERMES_WRITE_SAFE_ROOT="/opt/data:/work/project"
ENV PATH="/opt/agent/.open-autonomy/node_modules/.bin:${PATH}"
ENTRYPOINT ["sleep", "infinity"]
