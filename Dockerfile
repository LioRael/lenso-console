# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS builder

WORKDIR /workspace
RUN corepack enable

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY config ./config
RUN pnpm install --frozen-lockfile

COPY tsconfig.json vite.config.ts vitest.browser.config.ts ./
COPY src ./src
COPY public ./public
COPY scripts/clean-console-web.mjs ./scripts/clean-console-web.mjs
RUN pnpm build:local

FROM node:24-bookworm-slim AS runtime

ARG RELEASE_VERSION
ARG RELEASE_COMMIT

LABEL org.opencontainers.image.source="https://github.com/LioRael/lenso-console" \
    org.opencontainers.image.version="${RELEASE_VERSION}" \
    org.opencontainers.image.revision="${RELEASE_COMMIT}"

RUN groupadd --gid 10001 lenso-console \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin lenso-console

WORKDIR /opt/lenso-console
COPY --from=builder --chown=10001:10001 /workspace/.output ./.output

ENV HOST=0.0.0.0 \
    NODE_ENV=production \
    PORT=3030

USER 10001:10001
EXPOSE 3030

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=4 \
    CMD node -e "fetch('http://127.0.0.1:3030/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
