# syntax=docker/dockerfile:1
# Build baglami monorepo koku: docker build -f services/motivasyon/Dockerfile -t kopru/motivasyon .
# Ayni imaj uc is yapar (komutla secilir):
#   docker run kopru/motivasyon                                    -> HTTP: node dist/main.js
#   docker run kopru/motivasyon node dist/worker.js                -> worker (HTTP yok)
#   docker run kopru/motivasyon node dist/db/migrate-cli.js migrate -> goc (DATABASE_OWNER_URL ile)

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# Yalniz paket manifestleri + kilit dosyasi: kaynak degisince bagimlilik katmani yeniden kurulmaz.
FROM base AS manifestler
COPY . /src
RUN cd /src && mkdir /m \
    && cp pnpm-lock.yaml pnpm-workspace.yaml package.json /m/ \
    && find . -name package.json -not -path '*/node_modules/*' -print0 | tar cf - --null -T - | tar xf - -C /m

FROM base AS build
COPY --from=manifestler /m ./
RUN printf "supportedArchitectures:\n  libc: [glibc]\n" >> pnpm-workspace.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter '@kopru/motivasyon...'
COPY . .
RUN printf "supportedArchitectures:\n  libc: [glibc]\n" >> pnpm-workspace.yaml
RUN pnpm --filter '@kopru/motivasyon...' run build
# Yalnizca uretim bagimliliklari + derlenmis ciktilar (dist, migrations)
RUN pnpm --filter=@kopru/motivasyon deploy --prod --legacy /out
# better-auth gibi paketlerin istege bagli "peer" bagimliliklari (next, playwright, vitest, ...) kilit
# dosyasinda cozuldugu icin deploy'a girer ama sunucuda hic yuklenmez; imaj boyutunu sisirir, silinir.
RUN cd /out/node_modules/.pnpm && rm -rf next@* @next+swc-* playwright* @playwright+* vitest@* @vitest+* \
    jsdom@* rolldown@* @rolldown+* esbuild@* @esbuild+* tsx@* lightningcss* react-dom@* react@* \
    babel-plugin-react-compiler*

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=4001
WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY --chown=node:node infra/docker/saglik.mjs ./saglik.mjs
USER node
EXPOSE 4001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD ["node", "saglik.mjs"]
CMD ["node", "dist/main.js"]
