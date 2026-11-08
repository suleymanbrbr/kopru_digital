#!/usr/bin/env bash
# Yoklama akisi: uctan uca curl senaryosu. Paket sat -> baslamis ders ac -> yoklama al -> ayni
# Idempotency-Key ile tekrar -> kredi 1 dusmus -> `izinli` duzelt -> kredi geri -> ogrenci ogretmene
# ozel notu gormez -> ders iptali (yoklama kaynakli dusum yoksa iade). Tekrar calistirilabilir (her
# calistirmada yeni kullanici/kurum; e-posta+parola ile girer). bash 3.2 (macOS) uyumlu.
# JSON govdeleri `jq -nc --arg` ile `$( )` DISINDA kurulur (macOS bash 3.2 tirnak tuzagi).
#
# On kosul: api 4230 portunda, ayri veritabaninda (kopru_paket_y); NATS (4222) acik:
#   docker exec kopru-postgres-1 createdb -U postgres kopru_paket_y
#   export API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_paket_y \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem
#   pnpm --filter @kopru/api db:migrate
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_paket_y \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_y \
#          API_PORT=4230 API_PUBLIC_URL=http://localhost:4230 NATS_URL=nats://localhost:4222
#   pnpm --filter @kopru/api dev > /tmp/api4230.log 2>&1 &
# Kullanim (repo kokunden): services/api/scripts/yoklama-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4230}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
simdi() { date -u +%Y-%m-%dT%H:%M:%S.000Z; }
yeniAnahtar() { uuidgen | tr 'A-Z' 'a-z'; }
dun() { date -u -v-1d +%F 2>/dev/null || date -u -d 'yesterday' +%F; }
yarin() { date -u -v+3d +%F 2>/dev/null || date -u -d '+3 days' +%F; }

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
davetle() { # $1 sahip token, $2 rol, $3 eposta, $4 ad -> "uyelik_id oturum" ; $KURUM kullanilir
  local davet belirtec oturum ilk kabul uyelik
  davet=$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$davet" | jq -r '.belirtec')
  oturum=$(kayit "$3" "$4"); ilk=$(token "$oturum"); riza "$ilk"
  kabul=$(jq -nc --arg b "$belirtec" '{belirtec:$b}')
  uyelik=$(j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$kabul" | jq -r '.uyelik_id')
  printf '%s %s' "$uyelik" "$oturum"
}
# $1 token, $2 ders id, $3 anahtar, $4 govde -> govde + "\n" + http kodu + "\n" + Idempotent-Replayed basligi
yoklama_put() {
  curl -sS -D "$TMP/baslik" -o "$TMP/govde" -w '%{http_code}' -X PUT "$D/dersler/$2/yoklamalar" \
    -H 'content-type: application/json' -H "authorization: Bearer $1" -H "idempotency-key: $3" -d "$4" >"$TMP/kod"
}
tekrar_basligi() { grep -i '^idempotent-replayed:' "$TMP/baslik" | tr -d '\r' | awk '{print tolower($2)}'; }
kalan_kredi() { j "$F/ogrenciler/$OGR/finans" -H "authorization: Bearer $S" | jq -r '.kalan_kredi'; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

adim "1) Sahip: kayit, KVKK, kurum, grup, ogretmen ve ogrenci (gruba eklenir)"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM_GOVDE=$(jq -nc '{ad:"Yoklama Deneme Kurumu",tur:"kurum"}')
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d "$KURUM_GOVDE" | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"
D="$API/v1/ders/kurumlar/$KURUM"
F="$API/v1/finans/kurumlar/$KURUM"
GRUP_GOVDE=$(jq -nc '{tur:"grup",ad:"8-A Matematik"}')
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d "$GRUP_GOVDE" | jq -r '.id')
HOCA_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca")
HOCA_UYELIK=${HOCA_BILGI%% *}; HOCA_OTURUM=${HOCA_BILGI##* }
ATAMA_GOVDE=$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')
sart "ogretmen atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$ATAMA_GOVDE")" 201
OGR_BILGI=$(davetle "$S" ogrenci "ogr$RUN@example.com" "Ali Ogrenci")
OGR=${OGR_BILGI%% *}; OGR_OTURUM=${OGR_BILGI##* }
UYE_GOVDE=$(jq -nc --arg a "$OGR" '{ogrenci_idleri:[$a]}')
sart "ogrenci gruba eklendi (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$UYE_GOVDE")" 201
HOCA=$(token "$HOCA_OTURUM" "$KURUM")
O=$(token "$OGR_OTURUM" "$KURUM")
echo "kurum: $KURUM  grup: $GRUP  ogretmen: $HOCA_UYELIK  ogrenci: $OGR"

adim "2) Paket sat: 8 ders (kredi 8)"
PAKET_GOVDE=$(jq -nc '{ad:"8 Ders Paketi",kredi_adedi:8,fiyat_kurus:600000}')
PAKET_ID=$(j -X POST "$F/paketler" -H "authorization: Bearer $S" -d "$PAKET_GOVDE" | jq -r '.id')
SATIS_GOVDE=$(jq -nc --arg o "$OGR" --arg p "$PAKET_ID" '{ogrenci_id:$o,paket_id:$p}')
sart "paket satisi (201)" "$(durum -X POST "$F/paket-satislari" -H "authorization: Bearer $S" -d "$SATIS_GOVDE")" 201
sart "baslangic kredisi" "$(kalan_kredi)" 8

adim "3) Dersler: dun 10:00 (baslamis) ve 3 gun sonra (gelecek)"
DERS_GOVDE=$(jq -nc --arg g "$GRUP" --arg t "$(dun)" '{grup_id:$g,tarih:$t,baslangic_saati:"10:00",sure_dk:60}')
DERS=$(j -X POST "$D/dersler" -H "authorization: Bearer $HOCA" -d "$DERS_GOVDE" | jq -r '.ders.id')
GELECEK_GOVDE=$(jq -nc --arg g "$GRUP" --arg t "$(yarin)" '{grup_id:$g,tarih:$t,baslangic_saati:"10:00",sure_dk:60}')
GELECEK=$(j -X POST "$D/dersler" -H "authorization: Bearer $HOCA" -d "$GELECEK_GOVDE" | jq -r '.ders.id')
BEKLEYEN=$(j "$D/yoklama-bekleyen" -H "authorization: Bearer $HOCA")
sart "yoklama-bekleyen listesinde dun dersi var" "$(echo "$BEKLEYEN" | jq -r --arg d "$DERS" '[.dersler[] | select(.id == $d)] | length')" 1
sart "gelecek ders listede yok" "$(echo "$BEKLEYEN" | jq -r --arg d "$GELECEK" '[.dersler[] | select(.id == $d)] | length')" 0

adim "4) Yoklama al (geldi + ogretmene ozel not); anahtarsiz 400, gelecek ders 422"
ANAHTAR=$(yeniAnahtar)
T0=$(simdi)
GOVDE=$(jq -nc --arg o "$OGR" --arg t "$T0" '{yoklamalar:[{ogrenci_id:$o,durum:"geldi",not:"Ozel not: turev konusunu tekrar et",not_gorunurluk:"ogretmene_ozel",isaretlenme_at:$t}]}')
sart "Idempotency-Key olmadan (400)" "$(durum -X PUT "$D/dersler/$DERS/yoklamalar" -H "authorization: Bearer $HOCA" -d "$GOVDE")" 400
sart "gelecek derse yoklama (422)" "$(durum -X PUT "$D/dersler/$GELECEK/yoklamalar" -H "authorization: Bearer $HOCA" -H "idempotency-key: $(yeniAnahtar)" -d "$GOVDE")" 422
yoklama_put "$HOCA" "$DERS" "$ANAHTAR" "$GOVDE"
sart "yoklama (200)" "$(cat "$TMP/kod")" 200
sart "sonuc" "$(jq -r '.sonuclar[0].sonuc' "$TMP/govde")" yeni
sart "ders tamamlandi" "$(jq -r '.ders_durumu' "$TMP/govde")" tamamlandi
sart "yanitta kalan kredi" "$(jq -r '.sonuclar[0].kalan_kredi' "$TMP/govde")" 7
sart "kredi 1 dustu" "$(kalan_kredi)" 7
sart "ilk istek tekrar bayragi tasimaz" "$(tekrar_basligi)" ""

adim "5) Ayni anahtarla tekrar: kayitli yanit, kredi bir kez"
cp "$TMP/govde" "$TMP/ilk"
yoklama_put "$HOCA" "$DERS" "$ANAHTAR" "$GOVDE"
sart "tekrar (200)" "$(cat "$TMP/kod")" 200
sart "Idempotent-Replayed" "$(tekrar_basligi)" true
sart "yanit aynen" "$(jq -S -c . "$TMP/govde")" "$(jq -S -c . "$TMP/ilk")"
sart "kredi hala 7" "$(kalan_kredi)" 7
FARKLI=$(jq -nc --arg o "$OGR" --arg t "$T0" '{yoklamalar:[{ogrenci_id:$o,durum:"gelmedi",isaretlenme_at:$t}]}')
sart "ayni anahtar farkli govde (422)" "$(durum -X PUT "$D/dersler/$DERS/yoklamalar" -H "authorization: Bearer $HOCA" -H "idempotency-key: $ANAHTAR" -d "$FARKLI")" 422
yoklama_put "$HOCA" "$DERS" "$(yeniAnahtar)" "$GOVDE"
sart "farkli anahtar ayni icerik: sonuc ayni" "$(jq -r '.sonuclar[0].sonuc' "$TMP/govde")" ayni
sart "kredi hala 7 (yeniden kuyruklanan isaretleme etkisiz)" "$(kalan_kredi)" 7

adim "6) Duzeltme: izinli (kredi geri), sonra eski isaretleme yeniyi ezmez"
sleep 1
T1=$(simdi)
DUZELT=$(jq -nc --arg o "$OGR" --arg t "$T1" '{yoklamalar:[{ogrenci_id:$o,durum:"izinli",not:"Ozel not: turev konusunu tekrar et",not_gorunurluk:"ogretmene_ozel",isaretlenme_at:$t}]}')
yoklama_put "$HOCA" "$DERS" "$(yeniAnahtar)" "$DUZELT"
sart "duzeltme sonucu" "$(jq -r '.sonuclar[0].sonuc' "$TMP/govde")" guncellendi
sart "izinli kredi dusurmez: iade, kredi 8" "$(kalan_kredi)" 8
ESKI=$(jq -nc --arg o "$OGR" --arg t "$T0" '{yoklamalar:[{ogrenci_id:$o,durum:"gelmedi",isaretlenme_at:$t}]}')
yoklama_put "$HOCA" "$DERS" "$(yeniAnahtar)" "$ESKI"
sart "eski isaretleme: sonuc" "$(jq -r '.sonuclar[0].sonuc' "$TMP/govde")" eski
sart "eski isaretleme yeniyi ezmedi (durum izinli)" "$(jq -r '.sonuclar[0].yoklama.durum' "$TMP/govde")" izinli
sart "kredi 8" "$(kalan_kredi)" 8
sart "kredi defteri: satin_alma, dusum, iade" "$(j "$F/ogrenciler/$OGR/kredi-hareketleri" -H "authorization: Bearer $S" | jq -r '[.hareketler[].tur] | sort | join(",")')" "dusum,iade,satin_alma"

adim "7) Ogrenci ogretmene ozel notu gormez; ogretmen gorur"
OLISTE=$(j "$D/dersler/$DERS/yoklamalar" -H "authorization: Bearer $O")
sart "ogrenci yalniz kendini gorur" "$(echo "$OLISTE" | jq -r '.katilimcilar | length')" 1
sart "ogrenci yoklama durumunu gorur" "$(echo "$OLISTE" | jq -r '.katilimcilar[0].yoklama.durum')" izinli
sart "ogrenciye not null" "$(echo "$OLISTE" | jq -r '.katilimcilar[0].yoklama.not')" null
sart "yanit govdesinde ozel not metni yok" "$(echo "$OLISTE" | grep -c 'turev' || true)" 0
HLISTE=$(j "$D/dersler/$DERS/yoklamalar" -H "authorization: Bearer $HOCA")
sart "ogretmen notu gorur" "$(echo "$HLISTE" | jq -r '.katilimcilar[0].yoklama.not')" "Ozel not: turev konusunu tekrar et"
sart "ogrenci yoklama yazamaz (403)" "$(durum -X PUT "$D/dersler/$DERS/yoklamalar" -H "authorization: Bearer $O" -H "idempotency-key: $(yeniAnahtar)" -d "$DUZELT")" 403
sart "yoklamasi alinmis katilimci cikarilamaz (409)" "$(durum -X DELETE "$D/dersler/$DERS/katilimcilar/$OGR" -H "authorization: Bearer $HOCA" -d "{}")" 409

adim "8) Duzeltme geri: geldi (kredi tekrar duser), sonra ders iptali ters cevirir"
sleep 1
T2=$(simdi)
GERI=$(jq -nc --arg o "$OGR" --arg t "$T2" '{yoklamalar:[{ogrenci_id:$o,durum:"geldi",isaretlenme_at:$t}]}')
yoklama_put "$HOCA" "$DERS" "$(yeniAnahtar)" "$GERI"
sart "geldi: kredi 7" "$(kalan_kredi)" 7
IPTAL_GOVDE=$(jq -nc '{iptal_kaynagi:"ogretmen",iptal_nedeni:"Yanlis ders acilmis"}')
IPTAL=$(j -X POST "$D/dersler/$DERS/iptal" -H "authorization: Bearer $HOCA" -d "$IPTAL_GOVDE")
sart "ders iptal edildi" "$(echo "$IPTAL" | jq -r '.ders.durum')" iptal
sart "iptal yoklama dusumunu ters cevirdi: kredi 8" "$(kalan_kredi)" 8
sart "iptal derse yoklama (409)" "$(durum -X PUT "$D/dersler/$DERS/yoklamalar" -H "authorization: Bearer $HOCA" -H "idempotency-key: $(yeniAnahtar)" -d "$GERI")" 409

echo
echo "TUM ADIMLAR GECTI"
