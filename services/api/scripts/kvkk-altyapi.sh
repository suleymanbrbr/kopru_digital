#!/usr/bin/env bash
# KVKK akisi icin tum servisleri AYRI veritabani/NATS/portlarla ayaga kaldirir ve kapatir (kvkk-akisi.sh kullanir).
#   services/api/scripts/kvkk-altyapi.sh ac      # NATS konteyneri + 4 veritabani + migrate + 4 servis + 4 worker
#   services/api/scripts/kvkk-altyapi.sh kapat   # surecleri durdurur, NATS konteynerini ve veritabanlarini siler
# Portlar (paket K1): api 41830, motivasyon 41831, bildirim 41832, medya 41833; NATS 4254. Postgres 5433 (kopru-postgres-1),
# S3 (RustFS) 9000, kova `kopru-k1`. Mevcut kopru-* konteynerlerine dokunulmaz. bash 3.2 uyumlu.
set -euo pipefail

KOK="$(cd "$(dirname "$0")/../../.." && pwd)"
DURUM="${KVKK_DURUM_DIZINI:-/tmp/kvkk-akisi}"
PG="docker exec -i kopru-postgres-1 psql -q -U postgres"
NATS_ADI="kopru-nats-k1"
NATS_PORT=4254
API_P=41830; MOT_P=41831; BIL_P=41832; MED_P=41833
S3="http://localhost:9000"

ortak_env() {
  export NATS_URL="nats://localhost:$NATS_PORT"
  export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_k1_api \
         API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_k1_api \
         API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_k1_api \
         API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
         API_PORT=$API_P API_PUBLIC_URL="http://localhost:$API_P" \
         API_MEDYA_URL="http://127.0.0.1:$MED_P" API_MOTIVASYON_URL="http://127.0.0.1:$MOT_P" \
         API_BILDIRIM_URL="http://127.0.0.1:$BIL_P" API_KVKK_ARALIK_MS=3000
  export MOTIVASYON_DATABASE_URL=postgres://motivasyon_app:motivasyon_app@localhost:5433/kopru_k1_mot \
         MOTIVASYON_DATABASE_SISTEM_URL=postgres://motivasyon_sistem:motivasyon_sistem@localhost:5433/kopru_k1_mot \
         MOTIVASYON_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_k1_mot \
         MOTIVASYON_APP_PASSWORD=motivasyon_app MOTIVASYON_SISTEM_PASSWORD=motivasyon_sistem \
         MOTIVASYON_PORT=$MOT_P MOTIVASYON_AUTH_ENABLED=true
  export BILDIRIM_DATABASE_URL=postgres://bildirim_app:bildirim_app@localhost:5433/kopru_k1_bil \
         BILDIRIM_DATABASE_SISTEM_URL=postgres://bildirim_sistem:bildirim_sistem@localhost:5433/kopru_k1_bil \
         BILDIRIM_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_k1_bil \
         BILDIRIM_APP_PASSWORD=bildirim_app BILDIRIM_SISTEM_PASSWORD=bildirim_sistem \
         BILDIRIM_PORT=$BIL_P BILDIRIM_AUTH_ENABLED=true BILDIRIM_PUSH_SAGLAYICI=log
  export MEDYA_DATABASE_URL=postgres://medya_app:medya_app@localhost:5433/kopru_k1_med \
         MEDYA_DATABASE_SISTEM_URL=postgres://medya_sistem:medya_sistem@localhost:5433/kopru_k1_med \
         MEDYA_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_k1_med \
         MEDYA_APP_PASSWORD=medya_app MEDYA_SISTEM_PASSWORD=medya_sistem \
         MEDYA_PORT=$MED_P MEDYA_AUTH_ENABLED=true MEDYA_BAKIM_ARALIK_MS=2000 \
         MEDYA_S3_ENDPOINT=$S3 MEDYA_S3_GENEL_ENDPOINT=$S3 MEDYA_S3_ACCESS_KEY_ID=kopru \
         MEDYA_S3_SECRET_ACCESS_KEY=kopru-dev-secret S3_BUCKET=kopru-k1
  export JWKS_URL="http://localhost:$API_P/.well-known/jwks.json" JWT_ISSUER="http://localhost:$API_P"
}

baslat() { # $1 ad, $2.. komut (repo kokunden)
  local ad="$1"; shift
  ( cd "$KOK" && nohup "$@" > "$DURUM/$ad.log" 2>&1 & echo $! > "$DURUM/$ad.pid" )
}

bekle_http() { local i; for i in $(seq 1 90); do [ "$(curl -s -o /dev/null -w '%{http_code}' "$1")" = "200" ] && return 0; sleep 1; done; echo "BASARISIZ: $1 acilmadi"; exit 1; }

case "${1:-}" in
  ac)
    mkdir -p "$DURUM"
    docker rm -f "$NATS_ADI" >/dev/null 2>&1 || true
    docker run -d --name "$NATS_ADI" -p "$NATS_PORT:4222" nats:2 -js >/dev/null
    for d in kopru_k1_api kopru_k1_mot kopru_k1_bil kopru_k1_med; do
      $PG -c "drop database if exists $d" -c "create database $d" >/dev/null
    done
    $PG -c 'create role api_owner nologin' 2>/dev/null || true
    ortak_env
    ( cd "$KOK" && pnpm --silent --filter @kopru/api db:migrate && pnpm --silent --filter @kopru/motivasyon db:migrate \
      && pnpm --silent --filter @kopru/bildirim db:migrate && pnpm --silent --filter @kopru/medya db:migrate ) > "$DURUM/migrate.log" 2>&1 \
      || { echo "migrate basarisiz: $DURUM/migrate.log"; tail -20 "$DURUM/migrate.log"; exit 1; }
    baslat api pnpm --filter @kopru/api dev
    bekle_http "http://localhost:$API_P/health"
    baslat api-worker pnpm --filter @kopru/api dev:worker
    baslat motivasyon pnpm --filter @kopru/motivasyon dev
    baslat motivasyon-worker pnpm --filter @kopru/motivasyon dev:worker
    baslat bildirim pnpm --filter @kopru/bildirim dev
    baslat bildirim-worker pnpm --filter @kopru/bildirim dev:worker
    baslat medya pnpm --filter @kopru/medya dev
    baslat medya-worker pnpm --filter @kopru/medya dev:worker
    for p in $MOT_P $BIL_P $MED_P; do bekle_http "http://localhost:$p/health"; done
    echo "altyapi hazir: api $API_P, motivasyon $MOT_P, bildirim $BIL_P, medya $MED_P, NATS $NATS_PORT (loglar $DURUM)"
    ;;
  kapat)
    for p in $API_P $MOT_P $BIL_P $MED_P; do lsof -ti "tcp:$p" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true; done
    if [ -d "$DURUM" ]; then
      for f in "$DURUM"/*.pid; do [ -f "$f" ] || continue; pkill -P "$(cat "$f")" 2>/dev/null || true; kill "$(cat "$f")" 2>/dev/null || true; done
    fi
    pkill -f "k1-kvkk.*(dev:worker|src/worker.ts)" 2>/dev/null || true
    docker rm -f "$NATS_ADI" >/dev/null 2>&1 || true
    for d in kopru_k1_api kopru_k1_mot kopru_k1_bil kopru_k1_med; do $PG -c "drop database if exists $d with (force)" >/dev/null 2>&1 || true; done
    rm -rf "$DURUM"
    echo "altyapi kapatildi"
    ;;
  env) ortak_env; env | grep -E '^(API|MOTIVASYON|BILDIRIM|MEDYA)_|^NATS_URL|^JWKS|^JWT_|^S3_' | sort ;;
  *) echo "kullanim: $0 ac|kapat|env"; exit 2 ;;
esac
