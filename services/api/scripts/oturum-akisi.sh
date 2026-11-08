#!/usr/bin/env bash
# Oturum yonetimi, toplu davet ve toplu modul durumu akisi. Tekrar calistirilabilir (her calistirmada
# yeni kullanici/e-posta; OTP kullanmaz, e-posta+parola ile girer). bash 3.2 uyumlu.
#
# On kosul: api 4300 portunda, ayri veritabaninda (api_g); NATS (4222) acik:
#   docker compose -f infra/docker/compose.yaml exec -T postgres psql -U postgres -c 'create database api_g owner api'
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/api_g \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/api_g \
#          API_DATABASE_OWNER_URL=postgres://api:api@localhost:5433/api_g API_PORT=4300 \
#          API_PUBLIC_URL=http://localhost:4300 NATS_URL=nats://localhost:4222
#   pnpm --filter @kopru/api db:migrate && pnpm --filter @kopru/api dev > /tmp/api4300.log 2>&1 &
# Kullanim (repo kokunden): services/api/scripts/oturum-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4300}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }

kayit() { # $1 eposta -> oturum belirteci
  local govde
  govde=$(jq -nc --arg e "$1" --arg p "$PAROLA" '{eposta:$e,parola:$p,gorunen_ad:"Oturum Deneme"}')
  j -X POST "$API/auth/eposta/kayit" -d "$govde" | jq -r '.oturum_belirteci'
}
giris() { # $1 eposta -> yeni oturumun belirteci
  local govde
  govde=$(jq -nc --arg e "$1" --arg p "$PAROLA" '{eposta:$e,parola:$p}')
  j -X POST "$API/auth/eposta/giris" -d "$govde" | jq -r '.oturum_belirteci'
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
ben() { durum "$API/v1/hesap/ben" -H "authorization: Bearer $1"; }

adim "A) Oturumlar: uc oturum ac, listele, birini sonlandir"
E1="oturum$RUN@example.com"
O1=$(kayit "$E1"); O2=$(giris "$E1"); O3=$(giris "$E1")
A1=$(token "$O1"); A2=$(token "$O2"); A3=$(token "$O3")
riza "$A1"
sart "oturum-1 belirteci" "$(ben "$A1")" 200
sart "oturum-2 belirteci" "$(ben "$A2")" 200
sart "kimliksiz liste" "$(durum "$API/v1/hesap/oturumlar")" 401
LISTE=$(j "$API/v1/hesap/oturumlar" -H "authorization: Bearer $A1")
echo "$LISTE" | jq '.oturumlar | map({id, bu_oturum, cihaz, ip_maskeli})'
sart "acik oturum sayisi" "$(echo "$LISTE" | jq '.oturumlar | length')" 3
sart "bu_oturum isaretli sayisi" "$(echo "$LISTE" | jq '[.oturumlar[] | select(.bu_oturum)] | length')" 1
sart "yanitta tam ip alani yok" "$(echo "$LISTE" | jq 'any(.oturumlar[]; has("ip"))')" false
HEDEF=$(echo "$LISTE" | jq -r '[.oturumlar[] | select(.bu_oturum | not)][0].id')
AB=$(token "$(kayit "baska$RUN@example.com")"); riza "$AB"
sart "baska kullanicinin oturumunu sonlandirma" "$(durum -X DELETE "$API/v1/hesap/oturumlar/$HEDEF" -H "authorization: Bearer $AB")" 404
SIL=$(durum -X DELETE "$API/v1/hesap/oturumlar/$HEDEF" -H "authorization: Bearer $A1")
sart "DELETE oturum" "$SIL" 200
sart "tekrar DELETE (artik yok)" "$(durum -X DELETE "$API/v1/hesap/oturumlar/$HEDEF" -H "authorization: Bearer $A1")" 404
A2_ILE=$(ben "$A2"); A3_ILE=$(ben "$A3")
# hedef oturum 2 ya da 3'tendir: biri 401, digeri 200 olmali
if [ "$A2_ILE" = 401 ] && [ "$A3_ILE" = 200 ]; then echo "ok: sonlanan oturum 401, diger 200"; elif [ "$A2_ILE" = 200 ] && [ "$A3_ILE" = 401 ]; then echo "ok: sonlanan oturum 401, diger 200"; else echo "BASARISIZ: beklenen biri 401 digeri 200, gelen $A2_ILE/$A3_ILE"; exit 1; fi
sart "mevcut oturum etkilenmedi" "$(ben "$A1")" 200

adim "B) Tumunu kapat (mevcut haric, sonra hepsi)"
O4=$(giris "$E1"); A4=$(token "$O4")
SONUC=$(j -X POST "$API/v1/hesap/oturumlar/tumunu-kapat" -H "authorization: Bearer $A1" -d '{"mevcut_haric":true}')
echo "$SONUC"
sart "mevcut haric: kapatilan (iki diger)" "$(echo "$SONUC" | jq '.kapatilan')" 2
sart "digerleri 401 (A2,A3,A4 toplam 401 sayisi)" "$(for t in "$A2" "$A3" "$A4"; do ben "$t"; echo; done | grep -c 401)" 3
sart "mevcut hala 200" "$(ben "$A1")" 200
SONUC=$(j -X POST "$API/v1/hesap/oturumlar/tumunu-kapat" -H "authorization: Bearer $A1" -d '{}')
sart "hepsini kapat: kapatilan" "$(echo "$SONUC" | jq '.kapatilan')" 1
sart "mevcut belirteci artik 401" "$(ben "$A1")" 401

adim "C) Toplu davet (kismi basari)"
E2="kurum$RUN@example.com"
K1=$(kayit "$E2"); KA=$(token "$K1"); riza "$KA"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $KA" -d '{"ad":"Oturum Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
KT=$(token "$K1" "$KURUM")
SON=$(printf '%07d' $((RUN % 10000000)))
GOVDE=$(jq -nc --arg t "0532$SON" '{davetler:[{kanal:"baglanti",rol:"ogrenci"},{kanal:"sms",rol:"ogrenci",telefon:"abc"},{kanal:"sms",rol:"ogrenci",telefon:$t,hedef_ad:"Ali"}]}')
TOPLU=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler/toplu" -H "authorization: Bearer $KT" -d "$GOVDE")
echo "$TOPLU" | jq '{basarili_sayisi, hata_sayisi, sonuclar: [.sonuclar[] | {sira, durum, hata_kodu}]}'
sart "basarili satir sayisi" "$(echo "$TOPLU" | jq '.basarili_sayisi')" 2
sart "hatali satir sayisi" "$(echo "$TOPLU" | jq '.hata_sayisi')" 1
sart "hatali satir kodu" "$(echo "$TOPLU" | jq -r '.sonuclar[1].hata_kodu')" gecersiz_telefon
sart "davet listesinde iki kayit" "$(j "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $KT" | jq '.davetler | length')" 2
SATIR='{"kanal":"baglanti","rol":"ogrenci"}'
YUZ_BIR=$(jq -nc --argjson s "$SATIR" '{davetler: [range(0;101) | $s]}')
sart "101 satir" "$(durum -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler/toplu" -H 'content-type: application/json' -H "authorization: Bearer $KT" -d "$YUZ_BIR")" 400

adim "D) Toplu modul durumu"
sart "finans kapat" "$(durum -X PUT "$API/v1/hesap/kurumlar/$KURUM/modul-ayarlari" -H 'content-type: application/json' -H "authorization: Bearer $KT" -d '{"modul_kodu":"finans","kapsam":"kurum","acik":false}')" 200
TUMU=$(j "$API/v1/hesap/modul-ayarlari/etkin-tumu" -H "authorization: Bearer $KT")
echo "$TUMU" | jq -c '.moduller'
sart "tumu: finans" "$(echo "$TUMU" | jq '.moduller.finans')" false
sart "tumu: odev" "$(echo "$TUMU" | jq '.moduller.odev')" true
for m in finans odev takvim; do
  sart "tekil = toplu ($m)" "$(j "$API/v1/hesap/modul-ayarlari/etkin?modul_kodu=$m" -H "authorization: Bearer $KT" | jq '.acik')" "$(echo "$TUMU" | jq ".moduller.$m")"
done

printf '\nTUM KONTROLLER GECTI\n'
