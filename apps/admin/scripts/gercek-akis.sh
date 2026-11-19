#!/usr/bin/env bash
# Platform paneli GERCEK denemesi: api + motivasyon + admin (mock kapali) ayaga kalkar, tohum atilir ve
# Playwright akislari (giris, 2FA, kurum, modul, denetim, taklit, saglik, mesaj, mufredat, motivasyon,
# koyu tema, mobil, destek rolu) gercekten yapilir; ekran goruntuleri apps/admin/docs/ekranlar/ altina yazilir.
#
# On kosul (repo kokunden): Docker'da kopru-postgres-1 (5433) ve kendi NATS konteynerin:
#   docker run -d --name kopru-nats-u1 -p 4243:4222 nats:2 -js
# Kullanim: apps/admin/scripts/gercek-akis.sh
# Portlar (degistirilebilir): API_PORT=41720 MOT_PORT=41722 ADMIN_PORT=41723 NATS_PORT=4243.
# Betik veritabanlarini olusturur, bitince siler; yalniz kendi surecleri/portlarini oldurur. `next dev`
# yerine build + start kullanilir (dosya izleme sorunu); servisler watch'siz calisir.
# Ortam: PLAYWRIGHT_CHROME_PATH (Playwright tarayicisi yoksa yerel Chrome).
set -euo pipefail

KOK="$(cd "$(dirname "$0")/../../.." && pwd)"
API_PORT="${API_PORT:-41720}"
MOT_PORT="${MOT_PORT:-41722}"
ADMIN_PORT="${ADMIN_PORT:-41723}"
NATS_PORT="${NATS_PORT:-4243}"
DB_API="${DB_API:-kopru_u1_api}"
DB_MOT="${DB_MOT:-kopru_u1_mot}"
TMP="$(mktemp -d)"
PIDS=""
PG() { docker exec kopru-postgres-1 psql -U postgres "$@"; }

temizle() {
  local p
  for p in $PIDS; do kill "$p" 2>/dev/null || true; done
  sleep 1
  for p in $PIDS; do kill -9 "$p" 2>/dev/null || true; done
  for port in "$API_PORT" "$MOT_PORT" "$ADMIN_PORT"; do
    lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  done
  PG -qc "drop database if exists $DB_API with (force)" >/dev/null 2>&1 || true
  PG -qc "drop database if exists $DB_MOT with (force)" >/dev/null 2>&1 || true
  echo "kayitlar: $TMP"
}
trap temizle EXIT

adim() { printf '\n== %s\n' "$*"; }

export NATS_URL="nats://localhost:$NATS_PORT"
export API_DATABASE_OWNER_URL="postgres://postgres:postgres@localhost:5433/$DB_API"
export API_DATABASE_URL="postgres://api_app:api_app@localhost:5433/$DB_API"
export API_DATABASE_SISTEM_URL="postgres://api_sistem:api_sistem@localhost:5433/$DB_API"
export API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem
export API_PORT API_PUBLIC_URL="http://localhost:$API_PORT"
export API_PLATFORM_IP_IZINLI=127.0.0.1/32,::1/128
export MOTIVASYON_DATABASE_OWNER_URL="postgres://postgres:postgres@localhost:5433/$DB_MOT"
export MOTIVASYON_APP_PASSWORD=motivasyon_app MOTIVASYON_SISTEM_PASSWORD=motivasyon_sistem
export MOTIVASYON_DATABASE_URL="postgres://motivasyon_app:motivasyon_app@localhost:5433/$DB_MOT"
export MOTIVASYON_DATABASE_SISTEM_URL="postgres://motivasyon_sistem:motivasyon_sistem@localhost:5433/$DB_MOT"
export MOTIVASYON_PORT="$MOT_PORT" MOTIVASYON_AUTH_ENABLED=true
export MOTIVASYON_PLATFORM_IP_IZINLI=127.0.0.1/32,::1/128
export JWKS_URL="http://localhost:$API_PORT/.well-known/jwks.json"
export JWT_ISSUER="http://localhost:$API_PORT"
export API_URL="http://localhost:$API_PORT" MOTIVASYON_URL="http://localhost:$MOT_PORT"

adim "Veritabanlari ve gocler"
PG -qc "drop database if exists $DB_API with (force)" >/dev/null 2>&1 || true
PG -qc "drop database if exists $DB_MOT with (force)" >/dev/null 2>&1 || true
docker exec kopru-postgres-1 createdb -U postgres "$DB_API"
docker exec kopru-postgres-1 createdb -U postgres "$DB_MOT"
(cd "$KOK" && pnpm --filter @kopru/api... --filter @kopru/motivasyon... build >"$TMP/build.log" 2>&1)
(cd "$KOK" && pnpm --filter @kopru/api db:migrate 2>&1 | tail -1)
(cd "$KOK" && pnpm --filter @kopru/motivasyon db:migrate 2>&1 | tail -1)

adim "api ve motivasyon (watch'siz)"
(cd "$KOK/services/api" && exec node dist/main.js >"$TMP/api.log" 2>&1) &
PIDS="$PIDS $!"
(cd "$KOK/services/motivasyon" && exec node dist/main.js >"$TMP/mot.log" 2>&1) &
PIDS="$PIDS $!"
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:$API_PORT/health" >/dev/null 2>&1 && curl -fsS "http://localhost:$MOT_PORT/health" >/dev/null 2>&1; then break; fi
  sleep 1
done

adim "Tohum (okul sahipleri, platform yoneticisi ve destek)"
(cd "$KOK" && bash apps/admin/scripts/gercek-tohum.sh >"$TMP/tohum.env" 2>/dev/null)
cat "$TMP/tohum.env"

adim "Admin (gercek mod) build + start"
(cd "$KOK/apps/admin" && NEXT_PUBLIC_API_MOCK=0 pnpm build >"$TMP/admin-build.log" 2>&1)
(cd "$KOK/apps/admin" && NEXT_PUBLIC_API_MOCK=0 exec pnpm exec next start --port "$ADMIN_PORT" >"$TMP/admin.log" 2>&1) &
PIDS="$PIDS $!"
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:$ADMIN_PORT/giris" >/dev/null 2>&1; then break; fi
  sleep 1
done

adim "Playwright (gercek akislar)"
set -a
# shellcheck disable=SC1090
. "$TMP/tohum.env"
set +a
export GERCEK_MOTIVASYON_URL="http://localhost:$MOT_PORT" GERCEK_API_URL="http://localhost:$API_PORT" E2E_ADMIN_PORT="$ADMIN_PORT"
(cd "$KOK/apps/admin" && pnpm exec playwright test --config playwright.gercek.config.ts)
