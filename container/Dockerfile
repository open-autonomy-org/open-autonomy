# syntax=docker/dockerfile:1.19
# The executor: native Hermes and its tools. World owns this container's lifetime;
# start.ts --container on the host owns the valve, reporter and gateway lifetime.
# No host credentials or Docker socket are mounted into the executor.
ARG HERMES_IMAGE=hermes-agent:v2026.8.31
FROM node:26.12.0-bookworm-slim AS node-runtime
FROM ${HERMES_IMAGE} AS managed
USER root
# The source CLI requires Node >=26.8.1.
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client git ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
ARG BUN_VERSION=1.3.10
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}" \
    && ln -sf /usr/local/bin/bun /usr/local/bin/bunx && bun --version
# Native pnpm uses one hard-linked content store on this executor volume.
ENV PNPM_HOME=/opt/pnpm
ENV PATH="/opt/pnpm/bin:${PATH}"
RUN curl -fsSL https://get.pnpm.io/install.sh | PNPM_VERSION=12.15.0 SHELL=/bin/bash sh -
# Codex, for a project whose setup picks it: the orchestrator runs it as each profile's worker, its model through the
# host valve's Codex forward (ADR 0009, as amended); the executor holds no login.
ARG CODEX_VERSION=0.156.1
# The start script and the reporter's dependencies, from the image — the checkout arrives after the first boot.
# Supply the exact reviewed source checkout as a named native build context.
COPY --from=supercode-source --exclude=**/node_modules --exclude=**/.git --exclude=**/.env* --exclude=recordings --exclude=docs/evidence / /opt/supercode/
COPY .open-autonomy /opt/agent/.open-autonomy
COPY container/pnpm-source-workspace.yaml /opt/agent/.open-autonomy/pnpm-workspace.yaml
ARG RUNTIME_REGISTRY=https://registry.npmjs.org
# Install into one writable image layer so OverlayFS does not copy up shared store files.
RUN pnpm --config.nodeLinker=hoisted add -g --package-import-method hardlink "@openai/codex@${CODEX_VERSION}" && codex --version \
    && pnpm --dir /opt/supercode --config.nodeLinker=hoisted install --frozen-lockfile --package-import-method hardlink --registry "$RUNTIME_REGISTRY" \
    && pnpm --dir /opt/supercode run build:sources \
    && pnpm --dir /opt/agent/.open-autonomy install --no-frozen-lockfile --package-import-method hardlink --registry "$RUNTIME_REGISTRY" \
    && /opt/agent/.open-autonomy/node_modules/.bin/supercode --version
# Login shells use /usr/local/bin; expose the installed World CLI there too.
RUN ln -s /opt/agent/.open-autonomy/node_modules/.bin/volter-world /usr/local/bin/volter-world
RUN mkdir -p /work/project /opt/data && chown hermes:hermes /work/project /opt/data
# Keep native file writes within the Hermes home and this project checkout.
ENV HERMES_WRITE_SAFE_ROOT="/opt/data:/work/project"
ENV PATH="/opt/agent/.open-autonomy/node_modules/.bin:${PATH}"
ENTRYPOINT ["sleep", "infinity"]
