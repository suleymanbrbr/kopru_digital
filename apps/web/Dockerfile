# syntax=docker/dockerfile:1
# Build baglami monorepo koku: docker build -f apps/web/Dockerfile -t kopru/web .
# Next.js `output: 'standalone'` (NEXT_STANDALONE=1) ile bagimsiz sunucu: node apps/web/server.js
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
COPY --from=manifestler /m ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter '@kopru/web...'
COPY . .
# Paylasilan paketler (ui-tokens, i18n, api-client, contracts), sonra uygulamanin kendisi
RUN pnpm --filter '@kopru/web^...' run build
# Sahte API modu uretim imajina girmez: --build-arg NEXT_PUBLIC_API_MOCK=1 derlemeyi durdurur.
ARG NEXT_PUBLIC_API_MOCK
RUN test -z "$NEXT_PUBLIC_API_MOCK" || { echo "NEXT_PUBLIC_API_MOCK uretim imajinda kullanilamaz" >&2; exit 1; }
ENV NEXT_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @kopru/web run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    SAGLIK_YOLU=/api/saglik
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
COPY --chown=node:node infra/docker/saglik.mjs infra/docker/next-baslat.mjs ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD ["node", "saglik.mjs"]
# next-baslat.mjs: NEXT_PUBLIC_API_MOCK tanimliysa acilmayi reddeder, sonra standalone sunucuyu yukler.
CMD ["node", "next-baslat.mjs", "apps/web/server.js"]
