#!/usr/bin/env bash
# motivasyon platform ayar akisi: uctan uca curl senaryosu (motivasyon API + worker + NATS; api gerekmez).
# Servisi kendi veritabaninda ayaga kaldirir; `plat=yonetici` claim'li belirteci kendi JWKS'iyle uretir
# (api'nin plat belirteci henuz yok: yardimci `ayar-yardimcisi.ts`). Senaryo: yetkisizler 401/403 -> yonetici ayarlari
# okur (surum 1) -> ogrenciye yoklama olayi (20 XP) -> yoklama XP'si 30 yapilir (uyarilarla) -> gecersiz degerler 422 ->
# yeni yoklama olayi 30 XP verir, eski satir 20 kalir -> surum 1'e geri al -> yeni olay yine 20 XP -> gecmis ve denetim.
# bash 3.2 (macOS) uyumlu. Gereken: curl, jq, docker (Postgres 5433), pnpm, python3.
#
# On kosul (repo kokunden; AYRI NATS, tuketici adlari sabittir):
#   docker run -d --name kopru-nats-p3 -p 4234:4222 nats:2 -js
# Kullanim: services/motivasyon/scripts/motivasyon-ayar-akisi.sh
# Betik veritabanini (kopru_motivasyon_p3) olusturur, bitince siler; yalniz kendi surecleri/portlarini oldurur.
set -euo pipefail

KOK="$(cd "$(dirname "$0")/../../.." && pwd)"
SERVIS="$KOK/services/motivasyon"
DB="${MOT_DB:-kopru_motivasyon_p3}"
PORT="${MOT_PORT:-41530}"
JWKS_PORT="${JWKS_PORT:-41539}"
NATS="${NATS_URL:-nats://localhost:4234}"
MOT="http://localhost:$PORT"
URL="$MOT/platform/motivasyon/ayarlar"
TMP="$(mktemp -d)"
PIDS=""
PG() { docker exec kopru-postgres-1 psql -U postgres "$@"; }
msql() { PG -d "$DB" -tAc "$1"; }

temizle() {
  local p
  for p in $PIDS; do kill "$p" 2>/dev/null || true; done
  sleep 1
  for p in $PIDS; do kill -9 "$p" 2>/dev/null || true; done
  lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  lsof -ti "tcp:$JWKS_PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  PG -qc "drop database if exists $DB with (force)" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap temizle EXIT

adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2"; }
yh() { (cd "$SERVIS" && ./node_modules/.bin/tsx scripts/ayar-yardimcisi.ts "$@"); }
istek() { # $1 yontem $2 url $3 belirtec (ops.) $4 govde (ops.) -> "kod govde" ; govde $TMP/son'a yazilir
  local kod
  if [ -n "${4:-}" ]; then
    kod=$(curl -sS -o "$TMP/son" -w '%{http_code}' -X "$1" "$2" ${3:+-H "authorization: Bearer $3"} -H 'content-type: application/json' -d "$4")
  else
    kod=$(curl -sS -o "$TMP/son" -w '%{http_code}' -X "$1" "$2" ${3:+-H "authorization: Bearer $3"})
  fi
  printf '%s' "$kod"
}
yeniUuid() { uuidgen | tr 'A-Z' 'a-z'; }

adim "0) Veritabani, JWKS, motivasyon API ve worker"
docker ps --format '{{.Names}}' | grep -q kopru-nats-p3 || { echo "kopru-nats-p3 yok: docker run -d --name kopru-nats-p3 -p 4234:4222 nats:2 -js"; exit 2; }
PG -qc "drop database if exists $DB with (force)" >/dev/null
PG -qc "create database $DB"
yh anahtar "$TMP/jwks"
(cd "$TMP/jwks" && exec python3 -m http.server "$JWKS_PORT" >/dev/null 2>&1) &
PIDS="$PIDS $!"
export MOTIVASYON_DATABASE_OWNER_URL="postgres://postgres:postgres@localhost:5433/$DB" \
  MOTIVASYON_APP_PASSWORD=motivasyon_app MOTIVASYON_SISTEM_PASSWORD=motivasyon_sistem
(cd "$SERVIS" && pnpm run db:migrate 2>&1 | tail -3)
export MOTIVASYON_DATABASE_URL="postgres://motivasyon_app:motivasyon_app@localhost:5433/$DB" \
  MOTIVASYON_DATABASE_SISTEM_URL="postgres://motivasyon_sistem:motivasyon_sistem@localhost:5433/$DB" \
  MOTIVASYON_PORT="$PORT" MOTIVASYON_AUTH_ENABLED=true MOTIVASYON_LOG_LEVEL=warn \
  JWKS_URL="http://localhost:$JWKS_PORT/jwks.json" NATS_URL="$NATS"
(cd "$SERVIS" && exec ./node_modules/.bin/tsx --env-file-if-exists=../../.env src/main.ts >"$TMP/api.log" 2>&1) &
PIDS="$PIDS $!"
(cd "$SERVIS" && exec ./node_modules/.bin/tsx --env-file-if-exists=../../.env src/worker.ts >"$TMP/worker.log" 2>&1) &
PIDS="$PIDS $!"
for i in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$MOT/ready" || true)" = 200 ]; then break; fi
  sleep 0.5
done
sart "motivasyon /ready" "$(curl -s -o /dev/null -w '%{http_code}' "$MOT/ready")" 200

YON=$(yh token "$TMP/jwks" plat=yonetici)
DESTEK=$(yh token "$TMP/jwks" plat=destek)
KURUM=$(yeniUuid); OGR=$(yeniUuid)
OGR_T=$(yh token "$TMP/jwks" "ogrenci:$KURUM:$OGR")
benim() { curl -sS "$MOT/v1/motivasyon/kurumlar/$KURUM/benim" -H "authorization: Bearer $OGR_T"; }
xp_bekle() { # $1 beklenen toplam XP (olay tuketilene kadar bekler)
  local i x
  for i in $(seq 1 60); do
    x=$(benim | jq -r '.toplam_xp // empty')
    if [ "$x" = "$1" ]; then echo "ok: ogrenci toplam XP -> $x"; return 0; fi
    sleep 0.5
  done
  echo "BASARISIZ: toplam XP $1 olmadi (son: ${x:-yok})"; tail -5 "$TMP/worker.log"; exit 1
}

adim "1) Yetki: belirtecsiz 401; destek, ogrenci 403"
sart "belirtecsiz GET" "$(istek GET "$URL" "")" 401
sart "plat=destek GET" "$(istek GET "$URL" "$DESTEK")" 403
sart "plat=destek hata kodu" "$(jq -r '.error.code' "$TMP/son")" izin_yok
sart "ogrenci belirteci GET" "$(istek GET "$URL" "$OGR_T")" 403
sart "plat=destek PUT" "$(istek PUT "$URL" "$DESTEK" '{"neden":"deneme","tavanlar":{"plan":41}}')" 403

adim "2) Yonetici: gecerli degerler (surum 1) ve gecmis"
sart "plat=yonetici GET" "$(istek GET "$URL" "$YON")" 200
jq -c '{surum: .gecerli.surum, yoklama_geldi: .gecerli.degerler.kurallar.yoklama_geldi, tavanlar: .gecerli.degerler.tavanlar, gecmis: [.gecmis[] | {surum, neden}]}' "$TMP/son"
sart "surum" "$(jq -r '.gecerli.surum' "$TMP/son")" 1

adim "3) Degisiklikten ONCE: yoklama olayi -> 20 XP"
yh olay "$NATS" "$KURUM" "$OGR" "$(yeniUuid)"
xp_bekle 20

adim "4) Gecersiz degerler: 422 ayar_gecersiz"
sart "negatif XP" "$(istek PUT "$URL" "$YON" '{"neden":"deneme","kurallar":{"yoklama_geldi":{"xp":-5}}}')" 422
jq -c '.error | {code, hatalar: .details.hatalar}' "$TMP/son"
sart "alt tavan genel'i asar" "$(istek PUT "$URL" "$YON" '{"neden":"deneme","tavanlar":{"plan":400}}')" 422
jq -c '.error.details.hatalar' "$TMP/son"
sart "neden yok (400)" "$(istek PUT "$URL" "$YON" '{"tavanlar":{"plan":41}}')" 400

adim "5) PUT: yoklama XP'si 30 (yeni surum, uyarilarla)"
sart "PUT" "$(istek PUT "$URL" "$YON" '{"neden":"Yoklama XP artirma denemesi","kurallar":{"yoklama_geldi":{"xp":30}}}')" 200
jq -c '{surum, onceki_surum, neden, uyarilar}' "$TMP/son"
sart "yeni surum 2" "$(jq -r '.surum' "$TMP/son")" 2
sart "yoklama_geldi tabloda 30" "$(msql "select xp from motivasyon.xp_kurallari where kod = 'yoklama_geldi'")" 30
sart "varsayimi bozan degisiklik: reddedilmez, uyari doner" "$(istek PUT "$URL" "$YON" '{"neden":"Odak XP kapatma denemesi","kurallar":{"odak_oturumu":{"xp":0}}}')" 200
jq -c '{surum, uyarilar}' "$TMP/son"
sart "uyari kodlari" "$(jq -r '[.uyarilar[].kod] | sort | join(",")' "$TMP/son")" "haftalik_xp_degisti,ilk_gun_hedefi,kural_kapatildi,seviye_hedefi_kaydi"

adim "6) Degisiklikten SONRA: yeni yoklama olayi 30 XP; eski satir 20 kalir (gecmise donuk degil)"
yh olay "$NATS" "$KURUM" "$OGR" "$(yeniUuid)"
xp_bekle 50
sart "defter" "$(msql "select string_agg(xp::text, ',' order by created_at) from motivasyon.xp_hareketleri where ogrenci_id = '$OGR'")" "20,30"

adim "7) Geri al: surum 1'in degerleriyle yeni surum (4); sonraki olay yine 20 XP"
sart "geri al" "$(istek POST "$URL/geri-al" "$YON" '{"surum":1,"neden":"Tohum degerlerine donus"}')" 201
jq -c '{surum, onceki_surum, geri_alinan_surum, uyarilar}' "$TMP/son"
sart "geri alinan surum" "$(jq -r '.geri_alinan_surum' "$TMP/son")" 1
sart "yoklama_geldi tabloda 20" "$(msql "select xp from motivasyon.xp_kurallari where kod = 'yoklama_geldi'")" 20
yh olay "$NATS" "$KURUM" "$OGR" "$(yeniUuid)"
xp_bekle 70
sart "defter" "$(msql "select string_agg(xp::text, ',' order by created_at) from motivasyon.xp_hareketleri where ogrenci_id = '$OGR'")" "20,30,20"

adim "8) Gecmis ve denetim"
sart "GET" "$(istek GET "$URL?limit=10" "$YON")" 200
jq -c '.gecmis[] | {surum, onceki_surum, geri_alinan_surum, neden, uyari_sayisi: (.uyarilar | length)}' "$TMP/son"
sart "surum sayisi" "$(jq '.gecmis | length' "$TMP/son")" 4
echo "yapilandirma_gecmisi (anahtar bazinda):"
msql "select tablo || '.' || anahtar || ' ' || (once->>'xp') || ' -> ' || (sonra->>'xp') || '  (' || neden || ')' from motivasyon.yapilandirma_gecmisi order by created_at" || true
sart "denetim satiri sayisi (yoklama 20->30, odak 1->0, yoklama 30->20, odak 0->1)" "$(msql "select count(*) from motivasyon.yapilandirma_gecmisi")" 4
DEGISTIR=$(PG -d "$DB" -tAc "update motivasyon.platform_ayar_surumleri set neden = 'x'" 2>&1 || true)
if printf '%s' "$DEGISTIR" | grep -q defter_degistirilemez; then echo "ok: surum satiri degistirilemez (superuser dahil)"; else echo "BASARISIZ: surum satiri degistirilebildi"; exit 1; fi

echo; echo "TAMAM: platform ayar akisi basarili"
