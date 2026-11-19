#!/usr/bin/env bash
# Platform paneli gercek denemesi icin tohum: iki okul sahibi + kurum, bir platform yoneticisi ve bir destek
# kullanicisi (hepsi e-posta + parola). Cikti: `GERCEK_*=deger` satirlari (e2e:gercek bunlari ortamdan okur).
#
# On kosul (repo kokunden): api ayakta (API_URL, varsayilan http://localhost:41720) ve `API_DATABASE_SISTEM_URL`
# ortamda (platform:yonetici-ekle betigi icin). Servis kurulumu icin bkz. `apps/admin/scripts/gercek-akis.sh`.
# bash 3.2 (macOS) uyumlu; JSON `jq -nc --arg` ile kurulur.
set -euo pipefail

API="${API_URL:-http://localhost:41720}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }

kayit() { # $1 eposta $2 ad -> oturum belirteci
  j -X POST "$API/auth/eposta/kayit" -d "$(jq -nc --arg e "$1" --arg p "$PAROLA" --arg a "$2" '{eposta:$e,parola:$p,gorunen_ad:$a}')" | jq -r '.oturum_belirteci'
}
token() { # $1 oturum belirteci -> erisim belirteci
  j -X POST "$API/auth/token" -H "authorization: Bearer $1" -d '{}' | jq -r '.access_token'
}
riza() { # $1 erisim belirteci: guncel KVKK metinlerini kabul eder
  local id
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
    j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null
  done
}
kurum_ac() { # $1 sahip eposta $2 kurum adi -> kurum id
  local oturum erisim
  oturum=$(kayit "$1" "Okul Sahibi")
  erisim=$(token "$oturum")
  riza "$erisim"
  j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $erisim" -d "$(jq -nc --arg a "$2" '{ad:$a,tur:"kurum"}')" | jq -r '.kurum.id'
}

K1="Ege Işık Dershanesi $RUN"
K2="Bornova Fen Kursu $RUN"
ID1=$(kurum_ac "sahip1-$RUN@example.com" "$K1")
ID2=$(kurum_ac "sahip2-$RUN@example.com" "$K2")

YONETICI="yonetici-$RUN@example.com"
DESTEK="destek-$RUN@example.com"
kayit "$YONETICI" "Platform Yöneticisi" >/dev/null
kayit "$DESTEK" "Platform Destek" >/dev/null
pnpm --silent --filter @kopru/api platform:yonetici-ekle -- "$YONETICI" --rol yonetici >/dev/null
pnpm --silent --filter @kopru/api platform:yonetici-ekle -- "$DESTEK" --rol destek >/dev/null

cikti() { printf '%s=%q\n' "$1" "$2"; }
cikti GERCEK_RUN "$RUN"
cikti GERCEK_YONETICI "$YONETICI"
cikti GERCEK_DESTEK "$DESTEK"
cikti GERCEK_PAROLA "$PAROLA"
cikti GERCEK_KURUM1 "$K1"
cikti GERCEK_KURUM1_ID "$ID1"
cikti GERCEK_KURUM2 "$K2"
cikti GERCEK_KURUM2_ID "$ID2"
