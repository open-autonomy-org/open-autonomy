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
# The start script and the reporter's dependencies, from the image — the checkout arrives after the first boot.
COPY .open-autonomy /opt/agent/.open-autonomy
RUN cd /opt/agent/.open-autonomy && bun install --no-save && ./node_modules/.bin/supercode --version
# Login shells use /usr/local/bin; expose the installed World CLI there too.
RUN ln -s /opt/agent/.open-autonomy/node_modules/.bin/volter-world /usr/local/bin/volter-world
RUN mkdir -p /work/project /opt/data && chown hermes:hermes /work/project /opt/data
# Keep native file writes within the Hermes home and this project checkout.
ENV HERMES_WRITE_SAFE_ROOT="/opt/data:/work/project"
ENV PATH="/opt/agent/.open-autonomy/node_modules/.bin:${PATH}"
ENTRYPOINT ["sleep", "infinity"]
