#!/usr/bin/env bash
# Finans akisi: uctan uca curl senaryosu. Paket sablonu -> satis (kismi odeme) -> tahsilat -> ayni
# Idempotency-Key ile tekrar -> tahsilat iptali -> bakiye -> ogrenci veri siniri -> aylik ozet -> xlsx.
# Tekrar calistirilabilir (her calistirmada yeni kullanici/kurum; e-posta+parola ile girer). bash 3.2 uyumlu.
# JSON govdeleri `jq -nc --arg` ile `$( )` DISINDA kurulur (macOS bash 3.2 tirnak tuzagi).
#
# On kosul: api 4220 portunda, ayri veritabaninda; NATS (4222) acik:
#   docker exec kopru-postgres-1 psql -U postgres -c 'create database kopru_paket_n'
#   export API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_paket_n \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem
#   pnpm --filter @kopru/api db:migrate
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_paket_n \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_n \
#          API_PORT=4220 API_PUBLIC_URL=http://localhost:4220 NATS_URL=nats://localhost:4222
#   pnpm --filter @kopru/api dev > /tmp/api4220.log 2>&1 &
# Kullanim (repo kokunden): services/api/scripts/finans-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4220}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

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
  local id govde
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
    govde=$(jq -nc --arg i "$id" '{riza_metni_id:$i}')
    j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$govde" >/dev/null
  done
}

adim "1) Sahip: kayit, KVKK, kurum; ogrenci daveti ve kabulu"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM_GOVDE=$(jq -nc '{ad:"Finans Deneme Kurumu",tur:"kurum"}')
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d "$KURUM_GOVDE" | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"
F="$API/v1/finans/kurumlar/$KURUM"
DAVET_GOVDE=$(jq -nc '{kanal:"baglanti",rol:"ogrenci"}')
D_OGR=$(j -X POST "$H/davetler" -H "authorization: Bearer $S" -d "$DAVET_GOVDE" | jq -r '.belirtec')
O_OTURUM=$(kayit "ogrenci$RUN@example.com" "Ali Ogrenci"); O_ILK=$(token "$O_OTURUM"); riza "$O_ILK"
KABUL_GOVDE=$(jq -nc --arg b "$D_OGR" '{belirtec:$b}')
OGR=$(j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $O_ILK" -d "$KABUL_GOVDE" | jq -r '.uyelik_id')
O=$(token "$O_OTURUM" "$KURUM")
echo "kurum: $KURUM  ogrenci uyelik: $OGR"

adim "2) Paket sablonu (8 ders, 6.000 TL = 600000 kurus)"
PAKET_GOVDE=$(jq -nc '{ad:"8 Ders Paketi",kredi_adedi:8,fiyat_kurus:600000,gecerlilik_gun:90}')
PAKET=$(j -X POST "$F/paketler" -H "authorization: Bearer $S" -d "$PAKET_GOVDE")
PAKET_ID=$(echo "$PAKET" | jq -r '.id')
echo "$PAKET" | jq -c '{id, ad, kredi_adedi, fiyat_kurus, gecerlilik_gun}'
sart "paket fiyati kurus tamsayi" "$(echo "$PAKET" | jq -r '.fiyat_kurus')" 600000
sart "negatif fiyat reddedilir (400)" "$(durum -X POST "$F/paketler" -H "authorization: Bearer $S" -d "$(jq -nc '{ad:"x",kredi_adedi:1,fiyat_kurus:-5}')")" 400
sart "ogrenci sablon olusturamaz (403)" "$(durum -X POST "$F/paketler" -H "authorization: Bearer $O" -d "$PAKET_GOVDE")" 403

adim "3) Paket satisi, kismi odeme (2.500 TL nakit)"
SATIS_GOVDE=$(jq -nc --arg o "$OGR" --arg p "$PAKET_ID" '{ogrenci_id:$o,paket_id:$p,odeme:{tur:"kismi",tutar_kurus:250000,yontem:"nakit"}}')
SATIS=$(j -X POST "$F/paket-satislari" -H "authorization: Bearer $S" -d "$SATIS_GOVDE")
echo "$SATIS" | jq -c '{kalan_kredi, bakiye_kurus, durum: .satis.durum, tahsilat: .tahsilat.tutar_kurus}'
sart "kalan kredi" "$(echo "$SATIS" | jq -r '.kalan_kredi')" 8
sart "bakiye = -(6000-2500) TL (kurus)" "$(echo "$SATIS" | jq -r '.bakiye_kurus')" -350000
SATIS_ID=$(echo "$SATIS" | jq -r '.satis.id')

adim "4) Tahsilat 1.000 TL, ayni Idempotency-Key ile iki kez"
ANAHTAR=$(uuidgen | tr 'A-Z' 'a-z')
TAH_GOVDE=$(jq -nc --arg o "$OGR" '{ogrenci_id:$o,tutar_kurus:100000,yontem:"havale",aciklama:"Kasim taksiti"}')
T1=$(curl -sS -w '\n%{http_code}' -H 'content-type: application/json' -H "idempotency-key: $ANAHTAR" -H "authorization: Bearer $S" -X POST "$F/tahsilatlar" -d "$TAH_GOVDE")
sart "ilk tahsilat (201)" "$(echo "$T1" | tail -n1)" 201
TAH_ID=$(echo "$T1" | head -n1 | jq -r '.id')
T2=$(curl -sS -w '\n%{http_code}' -H 'content-type: application/json' -H "idempotency-key: $ANAHTAR" -H "authorization: Bearer $S" -X POST "$F/tahsilatlar" -d "$TAH_GOVDE")
sart "ayni anahtarla tekrar (200)" "$(echo "$T2" | tail -n1)" 200
sart "ayni kayit doner" "$(echo "$T2" | head -n1 | jq -r '.id')" "$TAH_ID"
sart "tekrar bayragi" "$(echo "$T2" | head -n1 | jq -r '.tekrar')" true
KART=$(j "$F/ogrenciler/$OGR/finans" -H "authorization: Bearer $S")
sart "cift kayit yok: bakiye -2.500 TL" "$(echo "$KART" | jq -r '.bakiye_kurus')" -250000
CAKISMA_GOVDE=$(jq -nc --arg o "$OGR" '{ogrenci_id:$o,tutar_kurus:1,yontem:"nakit"}')
sart "ayni anahtar farkli icerik (409)" "$(durum -H "idempotency-key: $ANAHTAR" -H "authorization: Bearer $S" -X POST "$F/tahsilatlar" -d "$CAKISMA_GOVDE")" 409

adim "5) Tahsilat iptali (neden zorunlu) ve bakiye"
sart "nedensiz iptal (400)" "$(durum -X POST "$F/tahsilatlar/$TAH_ID/iptal" -H "authorization: Bearer $S" -d '{}')" 400
IPTAL_GOVDE=$(jq -nc '{neden:"Yanlis ogrenciye girildi"}')
IPTAL=$(j -X POST "$F/tahsilatlar/$TAH_ID/iptal" -H "authorization: Bearer $S" -d "$IPTAL_GOVDE")
sart "tahsilat durumu" "$(echo "$IPTAL" | jq -r '.durum')" iptal
sart "ikinci iptal (409)" "$(durum -X POST "$F/tahsilatlar/$TAH_ID/iptal" -H "authorization: Bearer $S" -d "$IPTAL_GOVDE")" 409
KART=$(j "$F/ogrenciler/$OGR/finans" -H "authorization: Bearer $S")
echo "$KART" | jq -c '{kalan_kredi, bakiye_kurus, borclu, hareketler: [.son_bakiye_hareketleri[].tur]}'
sart "bakiye iptalden sonra -3.500 TL" "$(echo "$KART" | jq -r '.bakiye_kurus')" -350000
sart "borclu" "$(echo "$KART" | jq -r '.borclu')" true
sart "defter: ters kayit var" "$(echo "$KART" | jq -r '[.son_bakiye_hareketleri[].tur] | index("ters_kayit") != null')" true

adim "6) Borclu listesi ve ogrenci veri siniri"
sart "?borclu listesi" "$(j "$F/ogrenciler?borclu" -H "authorization: Bearer $S" | jq '.ogrenciler | length')" 1
OKART=$(j "$F/ogrenciler/$OGR/finans" -H "authorization: Bearer $O")
echo "$OKART" | jq -c .
sart "ogrenci gorunumu" "$(echo "$OKART" | jq -r '.gorunum')" ogrenci
sart "ogrenci kalan ders" "$(echo "$OKART" | jq -r '.kalan_kredi')" 8
sart "ogrenci yanitinda fiyat/borc/tahsilat yok" "$(echo "$OKART" | grep -c -E 'kurus|bakiye|tahsilat|odeyen|borc' || true)" 0
sart "ogrenci tahsilat listesi (403)" "$(durum "$F/tahsilatlar" -H "authorization: Bearer $O")" 403
AYAR_GOVDE=$(jq -nc '{ogrenci_kalan_ders_gorur:false}')
sart "kurum ayari kapat (200)" "$(durum -X PUT "$F/ayarlar" -H "authorization: Bearer $S" -d "$AYAR_GOVDE")" 200
sart "ayar kapaliyken ogrenci kalan ders null" "$(j "$F/ogrenciler/$OGR/finans" -H "authorization: Bearer $O" | jq -r '.kalan_kredi')" null

adim "7) Aylik gelir ozeti ve Excel"
AY=$(TZ=Europe/Istanbul date +%Y-%m)
OZET=$(j "$F/ozet/aylik?ay=$AY" -H "authorization: Bearer $S")
echo "$OZET" | jq -c .
sart "ozet toplami = yalniz gecerli tahsilat (iptal haric)" "$(echo "$OZET" | jq -r '.toplam_kurus')" 250000
sart "ozet yontem kirilimi" "$(echo "$OZET" | jq -r '.yonteme_gore | map(.yontem) | join(",")')" nakit
XLSX="$TMP/finans.xlsx"
CT=$(curl -sS -o "$XLSX" -w '%{content_type}' -H "authorization: Bearer $S" "$F/disa-aktar?ay=$AY")
sart "xlsx icerik turu" "$CT" "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
sart "xlsx zip basligi (PK)" "$(head -c 2 "$XLSX")" PK
sart "xlsx dosyasi gecerli zip (workbook.xml)" "$(unzip -l "$XLSX" | grep -c 'xl/workbook.xml')" 1
sart "ogrenci xlsx indiremez (403)" "$(durum -H "authorization: Bearer $O" "$F/disa-aktar?ay=$AY")" 403

adim "8) Paket satisi iptali: kullanilmamis paket geri alinir"
NEDEN_GOVDE=$(jq -nc '{neden:"Vazgecti"}')
sart "satis iptali (200)" "$(durum -X POST "$F/paket-satislari/$SATIS_ID/iptal" -H "authorization: Bearer $S" -d "$NEDEN_GOVDE")" 200
KART=$(j "$F/ogrenciler/$OGR/finans" -H "authorization: Bearer $S")
sart "iptalden sonra kalan kredi" "$(echo "$KART" | jq -r '.kalan_kredi')" 0
sart "iptalden sonra bakiye = alinan odeme kadar alacak" "$(echo "$KART" | jq -r '.bakiye_kurus')" 250000

printf '\nTUM ADIMLAR GECTI\n'
