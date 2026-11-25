# syntax=docker/dockerfile:1
# Build baglami monorepo koku: docker build -f apps/admin/Dockerfile -t kopru/admin .
# Next.js `output: 'standalone'` (NEXT_STANDALONE=1) ile bagimsiz sunucu: node apps/admin/server.js
# API_URL, MEDYA_URL, BILDIRIM_URL, MOTIVASYON_URL calisma zamaninda okunur (imaja gomulmez).
# NEXT_PUBLIC_* degerleri DERLEME zamaninda gomulur; uretimde NEXT_PUBLIC_API_MOCK verilmez.

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS manifestler
COPY . /src
RUN cd /src && mkdir /m \
    && cp pnpm-lock.yaml pnpm-workspace.yaml package.json /m/ \
    && find . -name package.json -not -path '*/node_modules/*' -print0 | tar cf - --null -T - | tar xf - -C /m

FROM base AS build
# admin temasi web/scripts/tema.ts ile uretilir (@kopru/ui-tokens oradan cozulur): web de kurulur.
COPY --from=manifestler /m ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter '@kopru/admin...' --filter '@kopru/web...'
COPY . .
# Paylasilan paketler (ui-tokens, i18n, api-client, contracts), sonra uygulamanin kendisi
RUN pnpm --filter '@kopru/admin^...' run build
ENV NEXT_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @kopru/admin run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0 \
    SAGLIK_YOLU=/api/saglik
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --chown=node:node infra/docker/saglik.mjs ./saglik.mjs
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD ["node", "saglik.mjs"]
CMD ["node", "apps/admin/server.js"]
