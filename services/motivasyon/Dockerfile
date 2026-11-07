# syntax=docker/dockerfile:1
# Build baglami monorepo koku: docker build -f services/motivasyon/Dockerfile -t kopru/motivasyon .
# Ayni imaj iki surec calistirir: API (varsayilan) ve worker
#   docker run kopru/motivasyon                       -> node dist/main.js
#   docker run kopru/motivasyon node dist/worker.js   -> worker

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@kopru/motivasyon...
# Yalnizca uretim bagimliliklari + derlenmis ciktilar
RUN pnpm --filter=@kopru/motivasyon deploy --prod --legacy /out

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4001
CMD ["node", "dist/main.js"]
