#!/usr/bin/env bash
# Sinif katilim kodu ve ogretmen onayi akisi: uctan uca curl senaryosu. Tekrar calistirilabilir
# (her calistirmada yeni kullanici/e-posta/kurum; OTP kullanmaz, e-posta+parola ile girer). bash 3.2 uyumlu.
#
# On kosul: api 4400 portunda, ayri veritabaninda (api_h); NATS (4222) acik:
#   docker compose -f infra/docker/compose.yaml exec -T postgres psql -U postgres -c 'create database api_h owner api'
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/api_h \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/api_h \
#          API_DATABASE_OWNER_URL=postgres://api:api@localhost:5433/api_h API_PORT=4400 \
#          API_PUBLIC_URL=http://localhost:4400 NATS_URL=nats://localhost:4222
#   pnpm --filter @kopru/api db:migrate && pnpm --filter @kopru/api dev > /tmp/api4400.log 2>&1 &
# Kullanim (repo kokunden): services/api/scripts/sinif-kodu-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4400}"
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
kod_govdesi() { jq -nc --arg k "$1" '{kod:$k}'; }

adim "1) Sahip: kayit, KVKK, kurum, sinif (6-A), ogretmen daveti ve atamasi"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Sinif Kodu Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
B="$API/v1/hesap/kurumlar/$KURUM"
GRUP=$(j -X POST "$B/gruplar" -H "authorization: Bearer $S" -d '{"tur":"sinif","ad":"6-A"}' | jq -r '.id')
echo "kurum: $KURUM  grup: $GRUP"
D_HOCA=$(j -X POST "$B/davetler" -H "authorization: Bearer $S" -d '{"kanal":"baglanti","rol":"ogretmen"}' | jq -r '.belirtec')
H_OTURUM=$(kayit "hoca$RUN@example.com" "Ayse Hoca"); H_ILK=$(token "$H_OTURUM"); riza "$H_ILK"
HOCA_UYELIK=$(j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $H_ILK" -d "$(jq -nc --arg b "$D_HOCA" '{belirtec:$b}')" | jq -r '.uyelik_id')
sart "ogretmen atamasi (201)" "$(durum -X POST "$B/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
H=$(token "$H_OTURUM" "$KURUM")

adim "2) Ogretmen sinif kodu olusturur (8 karakter)"
KOD_YANIT=$(j -X POST "$B/gruplar/$GRUP/katilim-kodu" -H "authorization: Bearer $H" -d '{"max_kullanim":30}')
KOD=$(echo "$KOD_YANIT" | jq -r '.kod')
echo "$KOD_YANIT" | jq -c '{kod, aktif, max_kullanim, kullanim_sayisi}'
sart "kod uzunlugu" "${#KOD}" 8
sart "etkin kod okunur (200)" "$(durum "$B/gruplar/$GRUP/katilim-kodu" -H "authorization: Bearer $H")" 200

adim "3) Ogrenci A: kayit, KVKK, kodu girer -> bekleyen istek (tekrar ayni istek)"
A_OTURUM=$(kayit "ogr-a$RUN@example.com" "Ali Ogrenci"); A_ILK=$(token "$A_OTURUM"); riza "$A_ILK"
K1=$(curl -sS -w '\n%{http_code}' -H 'content-type: application/json' -X POST "$API/v1/hesap/sinif-kodu/katil" -H "authorization: Bearer $A_ILK" -d "$(kod_govdesi "$KOD")")
echo "$K1" | head -n1 | jq -c '{id, durum, kurum_ad, grup_ad}'
sart "ilk katilim (201)" "$(echo "$K1" | tail -n1)" 201
ISTEK_A=$(echo "$K1" | head -n1 | jq -r '.id')
K2=$(j -X POST "$API/v1/hesap/sinif-kodu/katil" -H "authorization: Bearer $A_ILK" -d "$(kod_govdesi "$KOD")")
sart "tekrar katilim ayni istek" "$(echo "$K2" | jq -r '.id')" "$ISTEK_A"
sart "kendi bekleyen istek sayisi" "$(j "$API/v1/hesap/sinif-kodu/istekler" -H "authorization: Bearer $A_ILK" | jq '.istekler | length')" 1
sart "yanlis kod ayni 410" "$(durum -X POST "$API/v1/hesap/sinif-kodu/katil" -H "authorization: Bearer $A_ILK" -d "$(kod_govdesi ABCDEFGH)")" 410

adim "4) Ogretmen bekleyenleri listeler (ad var, telefon/e-posta yok) ve onaylar"
LISTE=$(j "$B/gruplar/$GRUP/katilim-istekleri?durum=bekliyor" -H "authorization: Bearer $H")
echo "$LISTE" | jq -c '.istekler[] | {durum, gorunen_ad}'
sart "bekleyen sayisi" "$(echo "$LISTE" | jq '.istekler | length')" 1
sart "listede iletisim bilgisi yok" "$(echo "$LISTE" | grep -c -E 'telefon|eposta|example.com' || true)" 0
sart "onaydan once grupta uye yok" "$(j "$B/gruplar/$GRUP/uyeler" -H "authorization: Bearer $H" | jq '.uyeler | length')" 0
ONAY=$(j -X POST "$B/gruplar/$GRUP/katilim-istekleri/$ISTEK_A/onayla" -H "authorization: Bearer $H" -d '{}')
echo "$ONAY" | jq -c '{durum: .istek.durum, uyelik_id, grup_uyesi_id}'
sart "onay durumu" "$(echo "$ONAY" | jq -r '.istek.durum')" onaylandi
UYELER=$(j "$B/gruplar/$GRUP/uyeler" -H "authorization: Bearer $H")
sart "gruba eklendi (uye sayisi)" "$(echo "$UYELER" | jq '.uyeler | length')" 1
sart "katilim yolu" "$(echo "$UYELER" | jq -r '.uyeler[0].katilim_yolu')" sinif_kodu
sart "cift onay etkisiz (200)" "$(durum -X POST "$B/gruplar/$GRUP/katilim-istekleri/$ISTEK_A/onayla" -H "authorization: Bearer $H" -d '{}')" 200
sart "uye sayisi hala 1" "$(j "$B/gruplar/$GRUP/uyeler" -H "authorization: Bearer $H" | jq '.uyeler | length')" 1
sart "uye olan ogrenci tekrar katilamaz (409)" "$(durum -X POST "$API/v1/hesap/sinif-kodu/katil" -H "authorization: Bearer $A_ILK" -d "$(kod_govdesi "$KOD")")" 409

adim "5) Ogrenci B: istek gonderir, ogretmen reddeder -> eklenmez"
B_OTURUM=$(kayit "ogr-b$RUN@example.com" "Berk Ogrenci"); B_ILK=$(token "$B_OTURUM"); riza "$B_ILK"
ISTEK_B=$(j -X POST "$API/v1/hesap/sinif-kodu/katil" -H "authorization: Bearer $B_ILK" -d "$(kod_govdesi "$KOD")" | jq -r '.id')
RED=$(j -X POST "$B/gruplar/$GRUP/katilim-istekleri/$ISTEK_B/reddet" -H "authorization: Bearer $H" -d '{}')
sart "ret durumu" "$(echo "$RED" | jq -r '.istek.durum')" reddedildi
sart "reddedilen eklenmedi (uye sayisi 1)" "$(j "$B/gruplar/$GRUP/uyeler" -H "authorization: Bearer $H" | jq '.uyeler | length')" 1
sart "reddedilen istek artik onaylanamaz (409)" "$(durum -X POST "$B/gruplar/$GRUP/katilim-istekleri/$ISTEK_B/onayla" -H "authorization: Bearer $H" -d '{}')" 409
sart "reddedilenin bekleyen istegi kalmadi" "$(j "$API/v1/hesap/sinif-kodu/istekler" -H "authorization: Bearer $B_ILK" | jq '.istekler | length')" 0

adim "6) Yetki: ogrenci kod yonetemez; kod yenilenince eski kod gecersiz"
A=$(token "$A_OTURUM" "$KURUM")
sart "uye ogrenci kod olusturamaz (403)" "$(durum -X POST "$B/gruplar/$GRUP/katilim-kodu" -H "authorization: Bearer $A" -d '{}')" 403
YENI=$(j -X POST "$B/gruplar/$GRUP/katilim-kodu" -H "authorization: Bearer $S" -d '{}' | jq -r '.kod')
echo "yeni kod: $YENI (eski: $KOD)"
C_OTURUM=$(kayit "ogr-c$RUN@example.com" "Can Ogrenci"); C_ILK=$(token "$C_OTURUM"); riza "$C_ILK"
sart "eski kod gecersiz (410)" "$(durum -X POST "$API/v1/hesap/sinif-kodu/katil" -H "authorization: Bearer $C_ILK" -d "$(kod_govdesi "$KOD")")" 410
sart "yeni kod gecerli (201)" "$(durum -X POST "$API/v1/hesap/sinif-kodu/katil" -H "authorization: Bearer $C_ILK" -d "$(kod_govdesi "$YENI")")" 201

printf '\nTUM ADIMLAR GECTI\n'
