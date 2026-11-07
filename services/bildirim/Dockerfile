# syntax=docker/dockerfile:1
# Build baglami monorepo koku: docker build -f services/bildirim/Dockerfile -t kopru/bildirim .
# Ayni imaj iki surec calistirir: API (varsayilan) ve worker
#   docker run kopru/bildirim                       -> node dist/main.js
#   docker run kopru/bildirim node dist/worker.js   -> worker

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@kopru/bildirim...
# Yalnizca uretim bagimliliklari + derlenmis ciktilar
RUN pnpm --filter=@kopru/bildirim deploy --prod --legacy /out

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4002
CMD ["node", "dist/main.js"]
