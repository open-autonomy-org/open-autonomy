# The agent's container: stock Hermes at the pinned tag (container/hermes.pin, built by container/build-hermes.sh) plus
# bun and git over ssh, started by the same script that starts it on a laptop (.open-autonomy/start.ts), here as root
# with `--as hermes`: the secrets mounted at /secrets are root's, and the gateway runs as the image's `hermes` user
# and can reach no key. The checkout is cloned into /work/project on first boot; the home lives at /opt/data.
ARG HERMES_IMAGE=hermes-agent:v2026.8.31
FROM ${HERMES_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client git ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
ARG BUN_VERSION=1.3.10
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}" \
    && ln -sf /usr/local/bin/bun /usr/local/bin/bunx && bun --version
# The start script and the reporter's dependencies, from the image — the checkout arrives after the first boot.
COPY .open-autonomy /opt/agent/.open-autonomy
RUN cd /opt/agent/.open-autonomy && bun install --no-save && ./node_modules/.bin/supercode --version
RUN mkdir -p /work/project /opt/data && chown hermes:hermes /work/project /opt/data
ENV PATH="/opt/agent/.open-autonomy/node_modules/.bin:${PATH}"
ENTRYPOINT ["bun", "/opt/agent/.open-autonomy/start.ts", "--project", "/work/project", "--home", "/opt/data", "--secrets", "/secrets", "--as", "hermes"]
