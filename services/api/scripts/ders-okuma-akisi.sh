#!/usr/bin/env bash
# Ders/finans kucuk duzeltmeleri akisi: uctan uca curl senaryosu.
#  1) Birebir grup listesinde `ogrenci_ad` ve finans ogrenci kartinda `ogrenci_ad` (ayri ad sorgusu yok).
#  2) Misafir/telafi katilimci ekleme ve listede turuyle gorunmesi.
#  3) Grup duzeyinde `takvim` modulu kapaninca tekil okuma 403 `modul_kapali`, ders listesi bos.
#  4) Ucret tarifesine ogrenci + brans kapsami (201), ayni kapsamda cakisma 409.
# Tekrar calistirilabilir (her calistirmada yeni kullanici/kurum). bash 3.2 (macOS) uyumlu.
#
# On kosul: kayit-akisi.sh ile ayni (api $API, veritabani $DB, NATS). Kullanim (repo kokunden):
#   services/api/scripts/ders-okuma-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4260}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
yarin() { date -u -v+1d +%F 2>/dev/null || date -u -d 'tomorrow' +%F; }
dun() { date -u -v-1d +%F 2>/dev/null || date -u -d 'yesterday' +%F; }

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
riza() { # $1 erisim belirteci
  local id govde
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
    govde=$(jq -nc --arg i "$id" '{riza_metni_id:$i}')
    j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$govde" >/dev/null
  done
}
davetle() { # $1 sahip token, $2 rol, $3 eposta, $4 ad -> "uyelik_id oturum" ; $KURUM kullanilir
  local davet belirtec oturum ilk kabul uyelik
  davet=$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$davet" | jq -r '.belirtec')
  oturum=$(kayit "$3" "$4"); ilk=$(token "$oturum"); riza "$ilk"
  kabul=$(jq -nc --arg b "$belirtec" '{belirtec:$b}')
  uyelik=$(j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$kabul" | jq -r '.uyelik_id')
  printf '%s %s' "$uyelik" "$oturum"
}

adim "1) Solo hoca (bireysel kurum): iki ogrenci davetle gelir, her biri birebir grup alir"
S_OTURUM=$(kayit "hoca$RUN@example.com" "Hoca Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM_GOVDE=$(jq -nc '{ad:"Okuma Deneme Kurumu",tur:"bireysel"}')
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d "$KURUM_GOVDE" | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"
D="$API/v1/ders/kurumlar/$KURUM"
F="$API/v1/finans/kurumlar/$KURUM"
O1_BILGI=$(davetle "$S" ogrenci "ogr1$RUN@example.com" "Ali Ogrenci")
O1=${O1_BILGI%% *}
O2_BILGI=$(davetle "$S" ogrenci "ogr2$RUN@example.com" "Veli Ogrenci")
O2=${O2_BILGI%% *}
echo "kurum: $KURUM  ogr1: $O1  ogr2: $O2"

adim "2) Grup listesi birebir gruplarda ogrenci_ad tasir (tek istek, ayri uyeler sorgusu yok)"
LISTE=$(j "$H/gruplar?limit=100" -H "authorization: Bearer $S")
sart "birebir grup sayisi" "$(echo "$LISTE" | jq -r '[.gruplar[] | select(.tur == "birebir")] | length')" 2
sart "ogrenci_ad (Ali)" "$(echo "$LISTE" | jq -r '[.gruplar[] | select(.tur == "birebir") | .ogrenci_ad] | sort | .[0]')" "Ali Ogrenci"
sart "ogrenci_ad (Veli)" "$(echo "$LISTE" | jq -r '[.gruplar[] | select(.tur == "birebir") | .ogrenci_ad] | sort | .[1]')" "Veli Ogrenci"
GRUP1=$(echo "$LISTE" | jq -r '.gruplar[] | select(.ogrenci_ad == "Ali Ogrenci") | .id')
sart "diger tur grup yok (hepsi birebir)" "$(echo "$LISTE" | jq -r '[.gruplar[] | select(.tur != "birebir" and .ogrenci_ad != null)] | length')" 0

adim "3) Finans ogrenci karti ogrenci_ad tasir"
KART=$(j "$F/ogrenciler/$O1/finans" -H "authorization: Bearer $S")
sart "kart gorunumu" "$(echo "$KART" | jq -r '.gorunum')" tam
sart "kart ogrenci_ad" "$(echo "$KART" | jq -r '.ogrenci_ad')" "Ali Ogrenci"

adim "4) Ders ac, Veli'yi misafir, sonra telafi olarak ekle; listede turuyle gorunur"
DERS_GOVDE=$(jq -nc --arg g "$GRUP1" --arg t "$(yarin)" '{grup_id:$g,tarih:$t,baslangic_saati:"15:00",sure_dk:60,brans_kodu:"matematik"}')
DERS=$(j -X POST "$D/dersler" -H "authorization: Bearer $S" -d "$DERS_GOVDE" | jq -r '.ders.id')
echo "ders: $DERS"
EKLE=$(jq -nc --arg o "$O2" '{ogrenci_id:$o,tur:"misafir"}')
sart "misafir ekle (201)" "$(durum -X POST "$D/dersler/$DERS/katilimcilar" -H "authorization: Bearer $S" -d "$EKLE")" 201
sart "ayni ogrenci tekrar (409)" "$(durum -X POST "$D/dersler/$DERS/katilimcilar" -H "authorization: Bearer $S" -d "$EKLE")" 409
DETAY=$(j "$D/dersler/$DERS" -H "authorization: Bearer $S")
sart "katilimci sayisi" "$(echo "$DETAY" | jq -r '.katilimcilar | length')" 2
sart "Veli turu" "$(echo "$DETAY" | jq -r --arg o "$O2" '.katilimcilar[] | select(.ogrenci_id == $o) | .tur')" misafir

adim "5) Grup duzeyinde takvim modulu kapaninca okumalar da kapanir"
LIST_URL="$D/dersler?baslangic=$(dun)T00:00:00Z&bitis=$(date -u -v+3d +%FT00:00:00Z 2>/dev/null || date -u -d '+3 days' +%FT00:00:00Z)"
sart "kapatmadan once liste ders icerir" "$(j "$LIST_URL" -H "authorization: Bearer $S" | jq -r --arg d "$DERS" '[.dersler[] | select(.id == $d)] | length')" 1
KAPAT=$(jq -nc --arg g "$GRUP1" '{modul_kodu:"takvim",kapsam:"grup",kapsam_id:$g,acik:false}')
sart "modul grup duzeyinde kapatildi (200)" "$(durum -X PUT "$H/modul-ayarlari" -H "authorization: Bearer $S" -d "$KAPAT")" 200
sart "tekil ders okuma (403)" "$(durum "$D/dersler/$DERS" -H "authorization: Bearer $S")" 403
sart "hata kodu" "$(j "$D/dersler/$DERS" -H "authorization: Bearer $S" | jq -r '.error.code')" modul_kapali
sart "ders listesi kapali grubu icermez" "$(j "$LIST_URL" -H "authorization: Bearer $S" | jq -r --arg d "$DERS" '[.dersler[] | select(.id == $d)] | length')" 0

adim "6) Ucret tarifesi: ogrenci + brans kapsami (201), ayni kapsamda cakisma (409), kurum tarifesi ayri"
T1=$(jq -nc --arg o "$O1" --arg b "$(dun)" '{ogrenci_id:$o,brans_kodu:"matematik",ucret_kurus:75000,gecerlilik_baslangic:$b}')
sart "ogrenci+brans tarifesi (201)" "$(durum -X POST "$F/ucret-tarifeleri" -H "authorization: Bearer $S" -d "$T1")" 201
sart "ayni kapsam cakisir (409)" "$(durum -X POST "$F/ucret-tarifeleri" -H "authorization: Bearer $S" -d "$T1")" 409
T2=$(jq -nc --arg b "$(dun)" '{brans_kodu:"fizik",ucret_kurus:60000,gecerlilik_baslangic:$b}')
sart "yalniz brans tarifesi (201)" "$(durum -X POST "$F/ucret-tarifeleri" -H "authorization: Bearer $S" -d "$T2")" 201
TL=$(j "$F/ucret-tarifeleri" -H "authorization: Bearer $S")
sart "listede ogrenci kapsamli satir" "$(echo "$TL" | jq -r --arg o "$O1" '[.tarifeler[] | select(.ogrenci_id == $o and .brans_kodu == "matematik")] | length')" 1

echo
echo "TAMAM: ders okuma/katilimci/tarife akisi basarili"
