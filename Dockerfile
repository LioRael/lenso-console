# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS web-builder

WORKDIR /workspace
RUN corepack enable

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile

COPY index.html tsconfig.json vite.config.ts ./
COPY scripts/check-host-extension-exports.mjs ./scripts/check-host-extension-exports.mjs
COPY src ./src
RUN pnpm service:web-build

FROM rust:1.94-bookworm AS service-builder

WORKDIR /workspace
COPY service ./service
COPY packages/console-system-plane/migrations ./packages/console-system-plane/migrations
RUN --mount=type=cache,id=lenso-console-cargo-registry,sharing=locked,target=/usr/local/cargo/registry \
    --mount=type=cache,id=lenso-console-service-target,sharing=locked,target=/workspace/service/target \
    cargo build --locked --release --manifest-path service/Cargo.toml --bins \
    && mkdir -p /workspace/service-bin \
    && cp service/target/release/lenso-console-api \
        service/target/release/lenso-console-migrate \
        service/target/release/lenso-console-serve \
        service/target/release/lenso-console-worker \
        /workspace/service-bin/

FROM debian:bookworm-slim AS runtime

ARG RELEASE_VERSION
ARG RELEASE_COMMIT

LABEL org.opencontainers.image.source="https://github.com/LioRael/lenso-console" \
    org.opencontainers.image.version="${RELEASE_VERSION}" \
    org.opencontainers.image.revision="${RELEASE_COMMIT}"

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 lenso-console \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin lenso-console

COPY --from=service-builder /workspace/service-bin/lenso-console-api /usr/local/bin/
COPY --from=service-builder /workspace/service-bin/lenso-console-migrate /usr/local/bin/
COPY --from=service-builder /workspace/service-bin/lenso-console-serve /usr/local/bin/
COPY --from=service-builder /workspace/service-bin/lenso-console-worker /usr/local/bin/
COPY --from=web-builder --chown=10001:10001 /workspace/dist /opt/lenso-console/web

ENV CONSOLE_WEB_ROOT=/opt/lenso-console/web \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=3030 \
    LENSO_COMPOSITION_PROFILE=core \
    SERVICE_NAME=lenso-console

USER 10001:10001
EXPOSE 3030

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=4 \
    CMD curl --fail --silent --show-error http://127.0.0.1:3030/health/ready || exit 1

CMD ["/usr/local/bin/lenso-console-serve"]
