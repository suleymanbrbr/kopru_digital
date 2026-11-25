#!/usr/bin/env bash
# Uretime yakin yerel ortamin (infra/docker/compose.prod-yerel.yaml) uctan uca duman testi.
#
# Denetler: dort servisin /ready'si; web ve admin giris sayfalari (200) ve /api/saglik; api'de
# kayit -> kurum -> grup olusturma; bir olayin (hesap kurum olusturma) outbox -> NATS -> bildirim tuketicisi
# yoluyla bildirim servisinin veritabanina ulasmasi.
#
# On kosul (repo kokunden):
#   docker compose -f infra/docker/compose.prod-yerel.yaml build
#   docker compose -f infra/docker/compose.prod-yerel.yaml up -d --wait
#   infra/scripts/duman-testi.sh
#   docker compose -f infra/docker/compose.prod-yerel.yaml down -v
# Gereken: curl, jq, docker. bash 3.2 (macOS) uyumlu.
set -euo pipefail

COMPOSE="${COMPOSE:-docker compose -f infra/docker/compose.prod-yerel.yaml}"
API="${API:-http://localhost:41800}"
MOT="${MOT:-http://localhost:41801}"
BIL="${BIL:-http://localhost:41802}"
MED="${MED:-http://localhost:41803}"
WEB="${WEB:-http://localhost:41804}"
ADM="${ADM:-http://localhost:41805}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() {
  if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi
  echo "ok: $1 -> $2"
}
kod() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }
bsql() { $COMPOSE exec -T postgres psql -q -t -A -U postgres -d bildirim -v ON_ERROR_STOP=1 -c "$1"; }
bekle() { # $1 aciklama, $2 sql (bildirim DB), $3 beklenen
  local i v=''
  for i in $(seq 1 60); do
    v=$(bsql "$2"); if [ "$v" = "$3" ]; then echo "ok: $1 -> $v"; return 0; fi
    sleep 1
  done
  echo "BASARISIZ: $1 -> '$v' (beklenen $3); sql: $2"; exit 1
}

adim "1) Saglik: servis /ready, web/admin"
sart "api /ready" "$(kod "$API/ready")" 200
sart "motivasyon /ready" "$(kod "$MOT/ready")" 200
sart "bildirim /ready" "$(kod "$BIL/ready")" 200
sart "medya /ready" "$(kod "$MED/ready")" 200
sart "api /health" "$(kod "$API/health")" 200
sart "web /api/saglik" "$(kod "$WEB/api/saglik")" 200
sart "admin /api/saglik" "$(kod "$ADM/api/saglik")" 200
sart "web giris sayfasi" "$(kod "$WEB/giris")" 200
sart "admin giris sayfasi" "$(kod "$ADM/giris")" 200
OPENAPI=$(kod "$API/openapi.json")
if [ "$OPENAPI" = 200 ]; then echo "BASARISIZ: uretimde /openapi.json acik (200)"; exit 1; fi
echo "ok: uretimde /openapi.json yayinlanmiyor -> $OPENAPI"

adim "2) api: kayit -> kurum -> grup"
OTURUM=$(j -X POST "$API/auth/eposta/kayit" -d "$(jq -nc --arg e "duman$RUN@example.com" --arg p "$PAROLA" '{eposta:$e,parola:$p,gorunen_ad:"Duman Testi"}')" | jq -r '.oturum_belirteci')
[ -n "$OTURUM" ] && [ "$OTURUM" != null ] || { echo "BASARISIZ: kayit oturum belirteci vermedi"; exit 1; }
ILK=$(j -X POST "$API/auth/token" -H "authorization: Bearer $OTURUM" -d '{}' | jq -r '.access_token')
for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $ILK" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
  j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $ILK" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null
done
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $ILK" -d '{"ad":"Duman Testi Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
[ -n "$KURUM" ] && [ "$KURUM" != null ] || { echo "BASARISIZ: kurum olusmadi"; exit 1; }
echo "kurum: $KURUM"
TOKEN=$(j -X POST "$API/auth/token" -H "authorization: Bearer $OTURUM" -d "$(jq -nc --arg k "$KURUM" '{kurum_id:$k}')" | jq -r '.access_token')
GRUP=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/gruplar" -H "authorization: Bearer $TOKEN" -d '{"tur":"grup","ad":"11-A"}' | jq -r '.id')
[ -n "$GRUP" ] && [ "$GRUP" != null ] || { echo "BASARISIZ: grup olusmadi"; exit 1; }
echo "grup: $GRUP"
sart "grup listede" "$(j "$API/v1/hesap/kurumlar/$KURUM/gruplar" -H "authorization: Bearer $TOKEN" | jq --arg g "$GRUP" '[.. | objects | select(.id? == $g)] | length > 0')" true

adim "3) Olay yolu: api outbox -> NATS -> bildirim tuketicisi (kendi veritabaninda kurum kopyasi)"
bekle "bildirim kurum kopyasi" "select count(*) from bildirim.kurum_kopyalari where kurum_id = '$KURUM'" 1
sart "bildirim kopyasinda kisisel veri sutunu yok" "$(bsql "select count(*) from information_schema.columns where table_schema = 'bildirim' and table_name = 'uyelik_kopyalari' and column_name in ('telefon','eposta','gorunen_ad')")" 0

adim "4) Kimlik dogrulama: servis uclari belirtecsiz 401 (uretimde auth acik)"
sart "bildirim belirtecsiz" "$(kod "$BIL/v1/bildirim/kurumlar/$KURUM/kutu")" 401
sart "bildirim kullanici belirteciyle" "$(kod "$BIL/v1/bildirim/kurumlar/$KURUM/kutu" -H "authorization: Bearer $TOKEN")" 200

echo
echo "DUMAN TESTI GECTI"
