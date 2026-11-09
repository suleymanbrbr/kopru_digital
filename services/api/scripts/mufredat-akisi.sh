#!/usr/bin/env bash
# Mufredat kutuphanesi akisi: uctan uca curl senaryosu. Tekrar calistirilabilir (her calistirmada yeni
# kullanici/e-posta/kurum; OTP kullanmaz, e-posta+parola ile girer). bash 3.2 (macOS) uyumlu.
#
# Akis: katalog ve konu listesi (tohum) -> Turkce duyarsiz arama -> kurum konusu ekle/guncelle/arsivle ->
# global konu 403 -> surum atamasi -> baska kurum izolasyonu.
#
# On kosul: api 4260 portunda, ayri veritabaninda (kopru_paket_m); NATS (4222) acik; tohum yuklu:
#   docker exec kopru-postgres-1 createdb -U postgres kopru_paket_m
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_paket_m \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_m \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_paket_m \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
#          API_PORT=4260 API_PUBLIC_URL=http://localhost:4260 NATS_URL=nats://localhost:4222
#   pnpm --filter @kopru/api db:migrate
#   docker exec -i kopru-postgres-1 psql -U api_sistem -d kopru_paket_m -h localhost < services/api/scripts/mufredat-tohum.sql
#   pnpm --filter @kopru/api dev > /tmp/api4260.log 2>&1 &
# Kullanim (repo kokunden): services/api/scripts/mufredat-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4260}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }

kayit() { # $1 eposta $2 ad -> oturum belirteci
  local govde
  govde=$(jq -nc --arg e "$1" --arg p "$PAROLA" --arg a "$2" '{eposta:$e,parola:$p,gorunen_ad:$a}')
  j -X POST "$API/auth/eposta/kayit" -d "$govde" | jq -r '.oturum_belirteci'
}
token() { # $1 oturum belirteci, $2 (ops.) kurum_id -> erisim belirteci
  local govde
  govde=$(jq -nc --arg k "${2:-}" 'if $k == "" then {} else {kurum_id:$k} end')
  j -X POST "$API/auth/token" -H "authorization: Bearer $1" -d "$govde" | jq -r '.access_token'
}
riza() { # $1 erisim belirteci: guncel KVKK metinlerini kabul eder
  local id
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
    j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null
  done
}
kurum_ac() { # $1 ad -> "kurum_id oturum"
  local oturum ilk kurum
  oturum=$(kayit "sahip$RUN$2@example.com" "Sahip $1"); ilk=$(token "$oturum"); riza "$ilk"
  kurum=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg a "$1" '{ad:$a,tur:"kurum"}')" | jq -r '.kurum.id')
  printf '%s %s' "$kurum" "$oturum"
}

adim "1) Iki kurum: A (sahip + ogretmen + ogrenci) ve B (yalniz sahip)"
A_BILGI=$(kurum_ac "Mufredat Deneme A" a); KURUM=${A_BILGI%% *}; A_OTURUM=${A_BILGI##* }
S=$(token "$A_OTURUM" "$KURUM")
B_BILGI=$(kurum_ac "Mufredat Deneme B" b); KURUM_B=${B_BILGI%% *}; B_OTURUM=${B_BILGI##* }
SB=$(token "$B_OTURUM" "$KURUM_B")
davetle() { # $1 rol $2 eposta $3 ad -> erisim belirteci (A kurumunda)
  local belirtec oturum ilk
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $S" -d "$(jq -nc --arg r "$1" '{kanal:"baglanti",rol:$r}')" | jq -r '.belirtec')
  oturum=$(kayit "$2" "$3"); ilk=$(token "$oturum"); riza "$ilk"
  j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg b "$belirtec" '{belirtec:$b}')" >/dev/null
  token "$oturum" "$KURUM"
}
HOCA=$(davetle ogretmen "hoca$RUN@example.com" "Ayse Hoca")
OGR=$(davetle ogrenci "ogr$RUN@example.com" "Ali Ogrenci")
M="$API/v1/ogrenme/kurumlar/$KURUM"
MB="$API/v1/ogrenme/kurumlar/$KURUM_B"

adim "2) Katalog ve konu listesi (tohum: LGS 1)"
KAT=$(j "$M/kataloglar" -H "authorization: Bearer $OGR")
sart "katalog sayisi >= 1 (ogrenci okur)" "$(echo "$KAT" | jq '[.kataloglar[] | select(.katalog_kodu == "lgs")] | length')" 1
LISTE=$(j "$M/konular?katalog_kodu=lgs" -H "authorization: Bearer $OGR")
echo "$LISTE" | jq -c '{surumler, adet: (.konular | length)}'
sart "cozulen surum (en yuksek yayinlanmis)" "$(echo "$LISTE" | jq -c '.surumler')" '[{"katalog_kodu":"lgs","surum_no":1}]'
sart "tohum konu sayisi" "$(echo "$LISTE" | jq '.konular | length')" 5
UNITE=$(echo "$LISTE" | jq -r '.konular[] | select(.ad == "Üslü İfadeler") | .id')
sart "ust ile filtre (2 konu)" "$(j "$M/konular?ust_id=$UNITE" -H "authorization: Bearer $OGR" | jq '.konular | length')" 2
sart "sayfalama (limit 2 + imlec)" "$(j "$M/konular?katalog_kodu=lgs&limit=2" -H "authorization: Bearer $OGR" | jq '.sonraki_imlec != null')" true
DETAY=$(j "$M/konular/$UNITE" -H "authorization: Bearer $OGR")
sart "detay global konu (kurum_id null)" "$(echo "$DETAY" | jq '.kurum_id')" null

adim "3) Turkce duyarsiz arama"
ARA() { j -G "$M/konular" --data-urlencode "q=$1" -H "authorization: Bearer $OGR" | jq -c '[.konular[].ad]'; }
sart "uslu" "$(ARA 'üslü')" '["Üslü İfadeler"]'
sart "USLU buyuk harf" "$(ARA 'ÜSLÜ')" '["Üslü İfadeler"]'
sart "BILIMSEL (I/İ katlanir)" "$(ARA 'BİLİMSEL')" '["Bilimsel gösterim","Çok büyük sayıların bilimsel gösterimi"]'

adim "4) Kurum konusu: ogretmen ekler, ogrenci ekleyemez"
GOVDE=$(jq -nc --arg u "$UNITE" '{brans_kodu:"matematik",seviye:"konu",ad:"Okul ek konusu: kuvvet bulmaca",ust_id:$u,sinif_seviyesi:8}')
sart "ogrenci ekleyemez (403)" "$(durum -X POST "$M/konular" -H "authorization: Bearer $OGR" -d "$GOVDE")" 403
EKLE=$(j -X POST "$M/konular" -H "authorization: Bearer $HOCA" -d "$GOVDE")
KONU=$(echo "$EKLE" | jq -r '.id')
sart "kurum konusu kurum_id" "$(echo "$EKLE" | jq -r '.kurum_id')" "$KURUM"
sart "yanlis seviye zinciri (400)" "$(durum -X POST "$M/konular" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg u "$UNITE" '{brans_kodu:"matematik",seviye:"alt_konu",ad:"x",ust_id:$u}')")" 400
sart "listede kurum konusu" "$(j "$M/konular?kaynak=kurum" -H "authorization: Bearer $OGR" | jq -c '[.konular[].ad]')" '["Okul ek konusu: kuvvet bulmaca"]'
sart "guncelle (200)" "$(j -X PATCH "$M/konular/$KONU" -H "authorization: Bearer $HOCA" -d '{"ad":"Kuvvet bulmaca"}' | jq -r '.ad')" "Kuvvet bulmaca"
adim "5) Global konu yazilamaz"
sart "global PATCH 403" "$(durum -X PATCH "$M/konular/$UNITE" -H "authorization: Bearer $S" -d '{"ad":"x"}')" 403
sart "global kodu" "$(j -X PATCH "$M/konular/$UNITE" -H "authorization: Bearer $S" -d '{"ad":"x"}' | jq -r '.error.code')" global_konu_yazilamaz
sart "global arsivle 403" "$(durum -X POST "$M/konular/$UNITE/arsivle" -H "authorization: Bearer $S" -d "{}")" 403

adim "6) Arsivle: varsayilan gizli, tumu=1 ile rozetli"
sart "arsivle (200)" "$(durum -X POST "$M/konular/$KONU/arsivle" -H "authorization: Bearer $HOCA" -d "{}")" 200
sart "gizli" "$(j "$M/konular?kaynak=kurum" -H "authorization: Bearer $OGR" | jq '.konular | length')" 0
sart "tumu=1 rozetli" "$(j "$M/konular?kaynak=kurum&tumu=1" -H "authorization: Bearer $OGR" | jq '.konular[0].kullanimdan_kalkti')" true

adim "7) Surum atamasi (yalniz yonetici/sahip)"
ATAMA=$(jq -nc --arg k "$KURUM" '{kapsam:"kurum",kapsam_id:$k,katalog_kodu:"lgs",surum_no:1}')
sart "ogretmen atayamaz (403)" "$(durum -X PUT "$M/mufredat-atamalari" -H "authorization: Bearer $HOCA" -d "$ATAMA")" 403
sart "olmayan surum (404)" "$(durum -X PUT "$M/mufredat-atamalari" -H "authorization: Bearer $S" -d "$(jq -nc --arg k "$KURUM" '{kapsam:"kurum",kapsam_id:$k,katalog_kodu:"lgs",surum_no:9}')")" 404
sart "sahip atar (200)" "$(durum -X PUT "$M/mufredat-atamalari" -H "authorization: Bearer $S" -d "$ATAMA")" 200
sart "atama listesi" "$(j "$M/mufredat-atamalari" -H "authorization: Bearer $OGR" | jq '.atamalar | length')" 1
sart "kataloglarda kurum_surumu" "$(j "$M/kataloglar" -H "authorization: Bearer $OGR" | jq '.kataloglar[] | select(.katalog_kodu == "lgs") | .kurum_surumu')" 1

adim "8) Baska kurum (B) izolasyonu"
sart "B, A konusunu goremez (404)" "$(durum "$MB/konular/$KONU" -H "authorization: Bearer $SB")" 404
sart "B, A konusunu yazamaz (404)" "$(durum -X PATCH "$MB/konular/$KONU" -H "authorization: Bearer $SB" -d '{"ad":"x"}')" 404
sart "B listesinde A konusu yok" "$(j "$MB/konular?kaynak=kurum&tumu=1" -H "authorization: Bearer $SB" | jq '.konular | length')" 0
sart "B global konulari gorur" "$(j "$MB/konular?katalog_kodu=lgs" -H "authorization: Bearer $SB" | jq '.konular | length')" 5
sart "B, A yolunu kullanamaz (403)" "$(durum "$M/konular" -H "authorization: Bearer $SB")" 403
sart "B atamasi bos" "$(j "$MB/mufredat-atamalari" -H "authorization: Bearer $SB" | jq '.atamalar | length')" 0

echo; echo "TUM ADIMLAR GECTI"
