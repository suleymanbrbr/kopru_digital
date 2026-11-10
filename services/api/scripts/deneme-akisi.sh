#!/usr/bin/env bash
# Deneme analizi akisi: uctan uca curl senaryosu. Tekrar calistirilabilir (her calistirmada yeni
# kullanici/e-posta/kurum; OTP kullanmaz, e-posta+parola ile girer). bash 3.2 (macOS) uyumlu; jq ve node gerekir.
#
# Akis: kural listesi -> ogretmen girisi (net) -> ogrenci girisi (onay bekler) -> onay -> gelisim ->
# toplu giris -> Excel sablon ve yukleme (gecerli, formul hucresi) -> ayar kapali -> kapsam.
#
# On kosul: api 4290 portunda, ayri veritabaninda (kopru_paket_d); NATS (4222) acik:
#   docker exec kopru-postgres-1 createdb -U postgres kopru_paket_d
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_paket_d \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_d \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_paket_d \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
#          API_PORT=4290 API_PUBLIC_URL=http://localhost:4290 NATS_URL=nats://localhost:4222
#   pnpm --filter @kopru/api db:migrate && pnpm --filter @kopru/api dev > /tmp/api4290.log 2>&1 &
# Kullanim (repo kokunden): services/api/scripts/deneme-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4290}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
KOK="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }

kayit() {
  local govde
  govde=$(jq -nc --arg e "$1" --arg p "$PAROLA" --arg a "$2" '{eposta:$e,parola:$p,gorunen_ad:$a}')
  j -X POST "$API/auth/eposta/kayit" -d "$govde" | jq -r '.oturum_belirteci'
}
token() {
  local govde
  govde=$(jq -nc --arg k "${2:-}" 'if $k == "" then {} else {kurum_id:$k} end')
  j -X POST "$API/auth/token" -H "authorization: Bearer $1" -d "$govde" | jq -r '.access_token'
}
riza() {
  local id
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
    j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null
  done
}
davetle() { # $1 sahip token, $2 rol, $3 eposta, $4 ad -> "uyelik_id oturum"
  local belirtec oturum ilk
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')" | jq -r '.belirtec')
  oturum=$(kayit "$3" "$4"); ilk=$(token "$oturum"); riza "$ilk"
  j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg b "$belirtec" '{belirtec:$b}')" | jq -r '.uyelik_id' | tr -d '\n'
  printf ' %s' "$oturum"
}

adim "1) Sahip: kurum, grup, ogretmen (atamali), iki ogrenci (grupta)"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Deneme Akis Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"
O="$API/v1/ogrenme/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"12-A TYT"}' | jq -r '.id')
HOCA_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca")
HOCA_UYELIK=${HOCA_BILGI%% *}; HOCA_OTURUM=${HOCA_BILGI##* }
sart "ogretmen atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
O1_BILGI=$(davetle "$S" ogrenci "ogr1$RUN@example.com" "Ali Ogrenci")
O1_UYELIK=${O1_BILGI%% *}; O1_OTURUM=${O1_BILGI##* }
O2_BILGI=$(davetle "$S" ogrenci "ogr2$RUN@example.com" "Berk Ogrenci")
O2_UYELIK=${O2_BILGI%% *}
sart "iki ogrenci gruba eklendi (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$O1_UYELIK" --arg b "$O2_UYELIK" '{ogrenci_idleri:[$a,$b]}')")" 201
HOCA=$(token "$HOCA_OTURUM" "$KURUM")
O1=$(token "$O1_OTURUM" "$KURUM")

adim "2) Kurallar: 7 global kural, LGS katsayisi 0.3333"
KURALLAR=$(j "$O/deneme-kurallari" -H "authorization: Bearer $HOCA")
sart "global kural sayisi" "$(echo "$KURALLAR" | jq '[.kurallar[] | select(.global)] | length')" 7
sart "LGS katsayisi" "$(echo "$KURALLAR" | jq '.kurallar[] | select(.kod=="lgs") | .yanlis_katsayisi')" 0.3333
sart "ogretmen kural yazamaz (403)" "$(durum -X POST "$O/deneme-kurallari" -H "authorization: Bearer $HOCA" -d '{"kod":"ozel_x","ad":"X","yanlis_katsayisi":0.25,"bolumler":[{"bolum_kodu":"a","brans_kodu":"matematik","ad":"A","soru_sayisi":10}]}')" 403

adim "3) Ogretmen girisi: TYT 25+15 dogru, 2+2 yanlis -> net 39 (onayli)"
GOVDE=$(jq -nc --arg o "$O1_UYELIK" '{kural_kodu:"tyt",ogrenci_id:$o,ad:"Akis TYT-1",sinav_tarihi:"2026-03-01",bolumler:[{bolum_kodu:"turkce",dogru:25,yanlis:2},{bolum_kodu:"matematik",dogru:15,yanlis:2}]}')
D1=$(j -X POST "$O/denemeler" -H "authorization: Bearer $HOCA" -d "$GOVDE")
sart "toplam net" "$(echo "$D1" | jq '.toplam_net')" 39
sart "onay durumu" "$(echo "$D1" | jq -r '.onay_durumu')" onaylandi
sart "ayni deneme tekrar (409)" "$(durum -X POST "$O/denemeler" -H "authorization: Bearer $HOCA" -d "$GOVDE")" 409
sart "toplami asan bolum (422)" "$(durum -X POST "$O/denemeler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$O1_UYELIK" '{kural_kodu:"tyt",ogrenci_id:$o,ad:"Kotu",sinav_tarihi:"2026-03-02",bolumler:[{bolum_kodu:"turkce",dogru:35,yanlis:10}]}')")" 422

adim "4) Ogrenci girisi onay bekler, gelisime girmez; onaylaninca girer"
D2=$(j -X POST "$O/denemeler" -H "authorization: Bearer $O1" -d '{"kural_kodu":"tyt","ad":"Ogrenci TYT-2","sinav_tarihi":"2026-03-08","bolumler":[{"bolum_kodu":"turkce","dogru":30,"yanlis":0}]}')
D2ID=$(echo "$D2" | jq -r '.id')
sart "ogrenci girisi bekliyor" "$(echo "$D2" | jq -r '.onay_durumu')" bekliyor
sart "gelisimde yalniz onayli (1)" "$(j "$O/ogrenciler/$O1_UYELIK/deneme-gelisim?kural=tyt" -H "authorization: Bearer $O1" | jq '.deneme_sayisi')" 1
sart "onay kuyrugu" "$(j "$O/denemeler?onay=bekliyor" -H "authorization: Bearer $HOCA" | jq '.denemeler | length')" 1
sart "ogrenci onaylayamaz (403)" "$(durum -X POST "$O/denemeler/$D2ID/onay" -H "authorization: Bearer $O1" -d '{}')" 403
sart "onay (200)" "$(durum -X POST "$O/denemeler/$D2ID/onay" -H "authorization: Bearer $HOCA" -d '{}')" 200
GEL=$(j "$O/ogrenciler/$O1_UYELIK/deneme-gelisim?kural=tyt" -H "authorization: Bearer $O1")
sart "gelisim deneme sayisi (2)" "$(echo "$GEL" | jq '.deneme_sayisi')" 2
sart "son 5 ortalama (39 ve 30)" "$(echo "$GEL" | jq '.son5_ortalama')" 34.5
sart "baska ogrencinin gelisimi 404" "$(durum "$O/ogrenciler/$O2_UYELIK/deneme-gelisim?kural=tyt" -H "authorization: Bearer $O1")" 404
sart "sinif ozeti ogrenciye kapali (403)" "$(durum "$O/gruplar/$GRUP/deneme-ozet?kural=tyt" -H "authorization: Bearer $O1")" 403
OZET=$(j "$O/gruplar/$GRUP/deneme-ozet?kural=tyt" -H "authorization: Bearer $HOCA")
sart "sinif ortalamasi" "$(echo "$OZET" | jq '.sinif_ortalamasi')" 34.5

adim "5) Toplu giris: hepsi ya da hic"
TOPLU_KOTU=$(jq -nc --arg a "$O1_UYELIK" --arg b "$O2_UYELIK" '{kural_kodu:"lgs",ad:"Toplu LGS",sinav_tarihi:"2026-04-01",satirlar:[{ogrenci_id:$a,bolumler:[{bolum_kodu:"turkce",dogru:12,yanlis:3}]},{ogrenci_id:$b,bolumler:[{bolum_kodu:"turkce",dogru:30,yanlis:0}]}]}')
sart "hatali satirli toplu (422)" "$(durum -X POST "$O/denemeler/toplu" -H "authorization: Bearer $HOCA" -d "$TOPLU_KOTU")" 422
sart "hata satiri" "$(j -X POST "$O/denemeler/toplu" -H "authorization: Bearer $HOCA" -d "$TOPLU_KOTU" | jq -c '[.error.details.hatalar[] | .satir]')" "[1]"
sart "hicbiri yazilmadi" "$(j "$O/denemeler?kural=lgs" -H "authorization: Bearer $HOCA" | jq '.denemeler | length')" 0
TOPLU=$(jq -nc --arg a "$O1_UYELIK" --arg b "$O2_UYELIK" '{kural_kodu:"lgs",ad:"Toplu LGS",sinav_tarihi:"2026-04-01",satirlar:[{ogrenci_id:$a,bolumler:[{bolum_kodu:"turkce",dogru:12,yanlis:3},{bolum_kodu:"matematik",dogru:8,yanlis:0}]},{ogrenci_id:$b,bolumler:[{bolum_kodu:"turkce",dogru:14,yanlis:1},{bolum_kodu:"matematik",dogru:6,yanlis:0}]}]}')
TY=$(j -X POST "$O/denemeler/toplu" -H "authorization: Bearer $HOCA" -d "$TOPLU")
sart "toplu olusturulan" "$(echo "$TY" | jq '.olusturulan_sayisi')" 2
sart "LGS 20 dogru 3 yanlis = 19" "$(echo "$TY" | jq --arg a "$O1_UYELIK" '.denemeler[] | select(.ogrenci_id==$a) | .toplam_net')" 19
sart "LGS 20 dogru 1 yanlis = 19.67" "$(echo "$TY" | jq --arg b "$O2_UYELIK" '.denemeler[] | select(.ogrenci_id==$b) | .toplam_net')" 19.67

adim "6) Excel: sablon indir, gecerli yukle, formul hucresi reddet"
curl -sS -D "$TMP/baslik.txt" -o "$TMP/sablon.xlsx" -H "authorization: Bearer $HOCA" "$O/denemeler/sablon.xlsx?kural=tyt&grup_id=$GRUP"
sart "sablon content-type" "$(grep -i '^content-type:' "$TMP/baslik.txt" | tr -d '\r' | awk '{print $2}')" "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
sart "sablon zip imzasi (PK)" "$(head -c 2 "$TMP/sablon.xlsx")" PK
(cd "$KOK" && node --input-type=module -e '
import ExcelJS from "exceljs";
const [dosya, a, b, formul] = process.argv.slice(1);
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Veri");
ws.addRow(["ogrenci_id","ogrenci_no","ad","turkce_dogru","turkce_yanlis","matematik_dogru","matematik_yanlis"]);
ws.addRow([a, "", "x", formul === "1" ? { formula: "10+10", result: 20 } : 20, 4, 10, 0]);
ws.addRow([b, "", "y", 30, 0, 10, 0]);
await wb.xlsx.writeFile(dosya);
' "$TMP/gecerli.xlsx" "$O1_UYELIK" "$O2_UYELIK" 0)
(cd "$KOK" && node --input-type=module -e '
import ExcelJS from "exceljs";
const [dosya, a, b] = process.argv.slice(1);
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Veri");
ws.addRow(["ogrenci_id","ogrenci_no","ad","turkce_dogru","turkce_yanlis"]);
ws.addRow([a, "", "x", { formula: "10+10", result: 20 }, 4]);
ws.addRow([b, "", "y", 30, 0]);
await wb.xlsx.writeFile(dosya);
' "$TMP/formul.xlsx" "$O1_UYELIK" "$O2_UYELIK")
XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
SORGU="kural=tyt&ad=Excel%20TYT&sinav_tarihi=2026-05-01&grup_id=$GRUP"
KOD=$(curl -sS -o "$TMP/formul.json" -w '%{http_code}' -X POST "$O/denemeler/excel?$SORGU" -H "authorization: Bearer $HOCA" -H "content-type: $XLSX" --data-binary @"$TMP/formul.xlsx")
sart "formul hucreli dosya (422)" "$KOD" 422
sart "formul hata kodu" "$(jq -r '.error.details.hatalar[0].kod' "$TMP/formul.json")" formul_hucresi
sart "formul satiri" "$(jq '.error.details.hatalar[0].satir' "$TMP/formul.json")" 2
KOD=$(curl -sS -o "$TMP/gecerli.json" -w '%{http_code}' -X POST "$O/denemeler/excel?$SORGU" -H "authorization: Bearer $HOCA" -H "content-type: $XLSX" --data-binary @"$TMP/gecerli.xlsx")
sart "gecerli dosya (201)" "$KOD" 201
sart "excel olusturulan" "$(jq '.olusturulan_sayisi' "$TMP/gecerli.json")" 2
sart "excel net (20 dogru 4 yanlis + 10 dogru = 29)" "$(jq --arg a "$O1_UYELIK" '.denemeler[] | select(.ogrenci_id==$a) | .toplam_net' "$TMP/gecerli.json")" 29
sart "xlsx olmayan govde (422)" "$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$O/denemeler/excel?$SORGU" -H "authorization: Bearer $HOCA" -H "content-type: $XLSX" --data-binary 'duz metin')" 422
head -c 2200000 /dev/zero > "$TMP/buyuk.bin"
sart "2 MB ustu govde (413)" "$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$O/denemeler/excel?$SORGU" -H "authorization: Bearer $HOCA" -H "content-type: $XLSX" --data-binary @"$TMP/buyuk.bin")" 413

adim "7) Ayar: ogrenci girisi kapaninca 403"
sart "ogretmen ayari degistiremez (403)" "$(durum -X PUT "$O/deneme-ayarlari" -H "authorization: Bearer $HOCA" -d '{"ogrenci_deneme_girisi":false}')" 403
sart "sahip kapatir (200)" "$(durum -X PUT "$O/deneme-ayarlari" -H "authorization: Bearer $S" -d '{"ogrenci_deneme_girisi":false}')" 200
sart "ogrenci girisi kapali (403)" "$(durum -X POST "$O/denemeler" -H "authorization: Bearer $O1" -d '{"kural_kodu":"tyt","ad":"Kapali","sinav_tarihi":"2026-06-01","bolumler":[{"bolum_kodu":"turkce","dogru":1,"yanlis":0}]}')" 403
sart "hata kodu" "$(j -X POST "$O/denemeler" -H "authorization: Bearer $O1" -d '{"kural_kodu":"tyt","ad":"Kapali","sinav_tarihi":"2026-06-01","bolumler":[{"bolum_kodu":"turkce","dogru":1,"yanlis":0}]}' | jq -r '.error.code')" ogrenci_deneme_girisi_kapali

adim "8) Deneme modulu kapaninca yazma kaybolur"
sart "modul kapatma (200)" "$(durum -X PUT "$H/modul-ayarlari" -H "authorization: Bearer $S" -d '{"modul_kodu":"deneme","kapsam":"kurum","acik":false}')" 200
sart "kapali modul 403" "$(durum "$O/denemeler" -H "authorization: Bearer $HOCA")" 403
sart "hata kodu modul_kapali" "$(j "$O/denemeler" -H "authorization: Bearer $HOCA" | jq -r '.error.code')" modul_kapali

printf '\nTUM ADIMLAR GECTI\n'
