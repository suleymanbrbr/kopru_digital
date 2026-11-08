#!/usr/bin/env bash
# Guvenlik akisi: (a) cikis sonrasi erisim belirteci iptali (sid listesi), (b) e-posta dogrulama (Mailpit).
# Tekrar calistirilabilir (her calistirmada yeni kullanici/e-posta). bash 3.2 uyumlu.
#
# On kosul: api 4200 portunda, ayri veritabaninda (api_d); NATS (4222) ve Mailpit (SMTP 1025, API 8025) acik;
# e-posta SMTP ile gonderilir, OTP kodu log dosyasina yazilir:
#   docker compose -f infra/docker/compose.yaml exec -T postgres psql -U postgres -c 'create database api_d owner api'
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/api_d \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/api_d \
#          API_DATABASE_OWNER_URL=postgres://api:api@localhost:5433/api_d API_PORT=4200 \
#          API_PUBLIC_URL=http://localhost:4200 API_EPOSTA_SAGLAYICI=smtp
#   pnpm --filter @kopru/api db:migrate && pnpm --filter @kopru/api dev > /tmp/api4200.log 2>&1 &
# Kullanim (repo kokunden): API_LOG=/tmp/api4200.log services/api/scripts/guvenlik-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4200}"
API_LOG="${API_LOG:-/tmp/api4200.log}"
MAILPIT="${MAILPIT:-http://localhost:8025}"
DB="${DB:-api_d}"
RUN="$RANDOM$RANDOM"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }
otp_kodu() { grep '\[DEV SMS\]' "$API_LOG" | grep -F "$1" | tail -1 | jq -r '.kod'; }
giris() { # $1 telefon -> oturum belirteci (OTP IP siniri icin her giris ayri sahte IP basligi gonderme: yerel api'de gerekmez)
  local govde
  govde=$(jq -nc --arg t "$1" '{telefon:$t}')
  j -X POST "$API/auth/otp/gonder" -d "$govde" >/dev/null
  sleep 0.5
  local kod; kod=$(otp_kodu "$1")
  govde=$(jq -nc --arg t "$1" --arg k "$kod" '{telefon:$t,kod:$k}')
  j -X POST "$API/auth/otp/dogrula" -d "$govde" | jq -r '.oturum_belirteci'
}
token() { # $1 oturum belirteci -> erisim belirteci
  j -X POST "$API/auth/token" -H "authorization: Bearer $1" -d '{}' | jq -r '.access_token'
}
ben() { durum "$API/v1/hesap/ben" -H "authorization: Bearer $1"; }

SON=$(printf '%07d' $((RUN % 10000000)))

adim "A) Cikis sonrasi erisim belirteci iptali"
T1="+90554$SON"; T2="+90555$SON"
O1=$(giris "$T1"); O2=$(giris "$T2")
A1=$(token "$O1"); A1b=$(token "$O1"); A2=$(token "$O2")
sart "cikis oncesi oturum-1 belirteci" "$(ben "$A1")" 200
sart "cikis oncesi oturum-2 belirteci" "$(ben "$A2")" 200
sart "POST /auth/cikis" "$(durum -X POST "$API/auth/cikis" -H "authorization: Bearer $O1")" 200
sart "cikis sonrasi AYNI belirtec" "$(ben "$A1")" 401
sart "cikis sonrasi ayni oturumun ikinci belirteci" "$(ben "$A1b")" 401
sart "baska oturumun belirteci etkilenmedi" "$(ben "$A2")" 200

adim "B) E-posta dogrulama (Mailpit)"
EPOSTA="guvenlik$RUN@example.com"
KAYIT=$(j -X POST "$API/auth/eposta/kayit" -d "$(jq -nc --arg e "$EPOSTA" '{eposta:$e,parola:"cok-gizli-parola",gorunen_ad:"Güvenlik Deneme"}')")
OB=$(printf '%s' "$KAYIT" | jq -r '.oturum_belirteci')
AB=$(token "$OB")
sart "kayit sonrasi eposta_dogrulandi" "$(j "$API/v1/hesap/ben" -H "authorization: Bearer $AB" | jq -r '.kullanici.eposta_dogrulandi')" false
sleep 1
MSG_ID=$(curl -sS "$MAILPIT/api/v1/search" --get --data-urlencode "query=to:$EPOSTA" | jq -r '.messages[0].ID')
[ -n "$MSG_ID" ] && [ "$MSG_ID" != "null" ] || { echo "BASARISIZ: Mailpit'te dogrulama e-postasi yok"; exit 1; }
echo "Mailpit mesaji:"
curl -sS "$MAILPIT/api/v1/message/$MSG_ID" | jq '{Konu:.Subject, Kime:[.To[].Address], Gonderen:.From.Address, Metin:.Text}'
BAGLANTI=$(curl -sS "$MAILPIT/api/v1/message/$MSG_ID" | jq -r '.Text' | grep -o 'http[^[:space:]]*eposta-dogrula?belirtec=[^[:space:]]*' | head -1)
[ -n "$BAGLANTI" ] || { echo "BASARISIZ: e-postada dogrulama baglantisi yok"; exit 1; }
sart "gecersiz belirtec" "$(durum "$API/auth/eposta/dogrula?belirtec=gecersiz-belirtec-xyz")" 400
# Baglanti web sayfasina gider (/eposta-dogrula?belirtec=...); sayfa belirteci api ucuna iletir.
sart "baglantidaki belirtec" "$(durum "$API/auth/eposta/dogrula?belirtec=${BAGLANTI#*belirtec=}")" 200
sart "dogrulama sonrasi eposta_dogrulandi" "$(j "$API/v1/hesap/ben" -H "authorization: Bearer $AB" | jq -r '.kullanici.eposta_dogrulandi')" true
sart "dogrulama sonrasi giris hala calisiyor" "$(durum -X POST "$API/auth/eposta/giris" -H 'content-type: application/json' -d "$(jq -nc --arg e "$EPOSTA" '{eposta:$e,parola:"cok-gizli-parola"}')")" 200

printf '\nTUM KONTROLLER GECTI\n'
