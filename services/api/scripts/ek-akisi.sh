#!/usr/bin/env bash
# Odev ve haftalik plan ek dosyalari: uctan uca curl senaryosu (gercek api + medya + worker'lar + NATS + RustFS).
# Ogretmen PDF ve PNG'yi medya servisine yukler (izin -> presigned PUT -> tamam -> islendi), odeve ve plana
# baglar (PUT .../ekler); ogrenci ekleri okur ve imzali adresten gercekten indirir; cikarilan dosya medyada
# silinir; hata kodlari (baskasinin dosyasi, yanlis tur, zaten bagli, hazir degil) ve yetki (ogrenci yazamaz).
# Tekrar calistirilabilir (her calistirmada yeni kullanici/kurum). bash 3.2 (macOS) uyumlu. Gereken: curl, jq, docker.
#
# On kosul: api (API), api worker, medya (MEDYA), medya worker ve ayni NATS'e bagli olmali; api'de
# `MEDYA_URL` medyayi gostermeli (ic okuma adresleri). Ornek kurulum `services/medya/scripts/yukleme-akisi.sh`
# basinda (yukleme akisinin ayni ortami). Veritabani adlari ortamdan: DB_MEDYA, DB_API.
# Kullanim (repo kokunden):
#   API=http://localhost:4130 MEDYA=http://localhost:4131 DB_API=kopru_s3_api DB_MEDYA=kopru_s3_medya \
#     services/api/scripts/ek-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4000}"
MEDYA="${MEDYA:-http://localhost:4003}"
DB_API="${DB_API:-kopru_paket_m}"
DB_MEDYA="${DB_MEDYA:-kopru_medya_m}"
PG="${PG:-kopru-postgres-1}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
yeniAnahtar() { uuidgen | tr 'A-Z' 'a-z'; }
sqlm() { docker exec "$PG" psql -U postgres -d "$DB_MEDYA" -tAc "$1"; }
sqla() { docker exec "$PG" psql -U postgres -d "$DB_API" -tAc "$1"; }

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
davetle() { # $1 sahip token, $2 rol, $3 eposta, $4 ad -> oturum belirteci ; $KURUM kullanilir
  local davet belirtec oturum ilk kabul
  davet=$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$davet" | jq -r '.belirtec')
  oturum=$(kayit "$3" "$4"); ilk=$(token "$oturum"); riza "$ilk"
  kabul=$(jq -nc --arg b "$belirtec" '{belirtec:$b}')
  j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$kabul" >/dev/null
  printf '%s' "$oturum"
}
ogr_api() { # $1 yontem $2 token $3 yol [$4 govde]
  if [ "$#" -ge 4 ]; then j -X "$1" "$API/v1/ogrenme/kurumlar/$KURUM$3" -H "authorization: Bearer $2" -d "$4"
  else j -X "$1" "$API/v1/ogrenme/kurumlar/$KURUM$3" -H "authorization: Bearer $2"; fi
}
ogr_durum() { # ayni, yalniz HTTP kodu
  if [ "$#" -ge 4 ]; then durum -X "$1" "$API/v1/ogrenme/kurumlar/$KURUM$3" -H "authorization: Bearer $2" -d "$4"
  else durum -X "$1" "$API/v1/ogrenme/kurumlar/$KURUM$3" -H "authorization: Bearer $2"; fi
}

yukle() { # $1 token $2 tur $3 mime $4 dosya -> stdout: dosya_id
  local boyut sha govde izin id url put tamam
  boyut=$(wc -c < "$4" | tr -d ' ')
  sha=$(shasum -a 256 "$4" | cut -d' ' -f1)
  govde=$(jq -nc --arg t "$2" --arg m "$3" --argjson b "$boyut" --arg s "$sha" --arg k "$(yeniAnahtar)" \
    '{tur:$t,mime_tipi:$m,boyut_bayt:$b,sha256:$s,istemci_anahtari:$k}')
  izin=$(j -X POST "$MEDYA/v1/dosyalar" -H "authorization: Bearer $1" -d "$govde")
  id=$(echo "$izin" | jq -r '.dosya.id')
  url=$(echo "$izin" | jq -r '.yukleme.url')
  put=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT -H "Content-Type: $3" --data-binary "@$4" "$url")
  tamam=$(durum -X POST "$MEDYA/v1/dosyalar/$id/tamam" -H "authorization: Bearer $1")
  echo "   yukleme $2: PUT $put, tamam $tamam" >&2
  printf '%s' "$id"
}
hazir_bekle() { # $1 token $2 dosya_id -> hazir olana kadar bekler (api kopyasi da gelsin diye +2 sn)
  local i d
  for i in $(seq 1 60); do
    d=$(j "$MEDYA/v1/dosyalar/$1x" -H "authorization: Bearer $1" 2>/dev/null | jq -r '.durum' 2>/dev/null || true)
    d=$(j "$MEDYA/v1/dosyalar/$2" -H "authorization: Bearer $1" | jq -r '.durum')
    if [ "$d" = "hazir" ] || [ "$d" = "islenemedi" ]; then break; fi
    sleep 0.5
  done
  sart "medya dosyasi hazir ($2)" "$d" hazir
  # api'nin yerel kopyasi (medya.dosya.hazir.v1 -> ortak.medya_dosya_kopyalari) olay ile gelir
  for i in $(seq 1 40); do
    n=$(sqla "select count(*) from ortak.medya_dosya_kopyalari where id = '$2'")
    if [ "$n" = "1" ]; then return; fi
    sleep 0.5
  done
  echo "BASARISIZ: api kopyasi gelmedi ($2)"; exit 1
}

adim "0) Kurum, ogretmen, iki ogrenci"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d "$(jq -nc '{ad:"Ek Deneme Kurumu",tur:"kurum"}')" | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
HOCA_OTURUM=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca")
OGR_OTURUM=$(davetle "$S" ogrenci "ogr$RUN@example.com" "Ali Ogrenci")
OGR2_OTURUM=$(davetle "$S" ogrenci "ogr2$RUN@example.com" "Veli Ogrenci")
HOCA=$(token "$HOCA_OTURUM" "$KURUM"); OGR=$(token "$OGR_OTURUM" "$KURUM"); OGR2=$(token "$OGR2_OTURUM" "$KURUM")
HOCA_UYELIK=$(j "$API/v1/hesap/uyeliklerim" -H "authorization: Bearer $(token "$HOCA_OTURUM")" | jq -r --arg k "$KURUM" '.uyelikler[] | select(.kurum_id == $k) | .uyelik_id')
OGR_UYELIK=$(j "$API/v1/hesap/uyeliklerim" -H "authorization: Bearer $(token "$OGR_OTURUM")" | jq -r --arg k "$KURUM" '.uyelikler[] | select(.kurum_id == $k) | .uyelik_id')
echo "kurum: $KURUM"

adim "1) Ogretmen PDF ve PNG yukler (odev_eki), ogrenci yukleyemez"
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%%%EOF\n' > "$TMP/f.pdf"
printf 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWOQSzlBEmIY1ZAyGkpywzVpAADGmEoQdBsCvwAAAABJRU5ErkJggg==' | base64 -d > "$TMP/s.png"
PDF=$(yukle "$HOCA" odev_eki application/pdf "$TMP/f.pdf")
PNG=$(yukle "$HOCA" odev_eki image/png "$TMP/s.png")
hazir_bekle "$HOCA" "$PDF"; hazir_bekle "$HOCA" "$PNG"
govde=$(jq -nc '{tur:"odev_eki",mime_tipi:"application/pdf",boyut_bayt:10,sha256:"0000000000000000000000000000000000000000000000000000000000000000",istemci_anahtari:"'"$(yeniAnahtar)"'"}')
sart "ogrenci odev_eki yukleyemez (403)" "$(durum -X POST "$MEDYA/v1/dosyalar" -H "authorization: Bearer $OGR" -d "$govde")" 403

adim "2) Grup + odev: ek dosyalariyla olustur ve yayinla"
GRUP=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/gruplar" -H "authorization: Bearer $S" -d "$(jq -nc '{tur:"sinif",ad:"8-A Matematik"}')" | jq -r '.id')
j -X POST "$API/v1/hesap/kurumlar/$KURUM/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')" >/dev/null
j -X POST "$API/v1/hesap/kurumlar/$KURUM/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OGR_UYELIK" '{ogrenci_idleri:[$a]}')" >/dev/null
YARIN=$(date -u -v+1d +%Y-%m-%dT12:00:00Z 2>/dev/null || date -u -d '+1 day' +%Y-%m-%dT12:00:00Z)
ODEV=$(ogr_api POST "$HOCA" /odevler "$(jq -nc --arg g "$GRUP" --arg y "$YARIN" --arg a "$PDF" --arg b "$PNG" \
  '{baslik:"Turev foyu",brans_kodu:"matematik",tur:"serbest",hedef_turu:"grup",hedef_id:$g,son_teslim_at:$y,ek_dosya_idleri:[$a,$b]}')" | jq -r '.id')
ogr_api POST "$HOCA" "/odevler/$ODEV/yayinla" '{}' >/dev/null
OL=$(ogr_api GET "$HOCA" "/odevler/$ODEV/ekler")
sart "ogretmen: 2 ek, sirali" "$(echo "$OL" | jq -r '[.ekler[].medya_dosya_id] == ["'"$PDF"'","'"$PNG"'"]')" true
sart "ogretmen: adresler alindi" "$(echo "$OL" | jq -r '.adresler_alinamadi')" false
echo "$OL" | jq '{ek_sayisi: (.ekler|length), ilk: {mime: .ekler[0].mime_tipi, boyut: .ekler[0].boyut_bayt}}'
sart "outbox: 2 baglandi olayi (odev_eki)" "$(sqla "select count(*) from ortak.outbox where kurum_id='$KURUM' and subject='evt.ortak.dosya.baglandi.v1' and payload->'data'->>'bagli_tur'='odev_eki'")" 2

adim "3) Ogrenci: kartta ek sayisi, ek listesi, gercek indirme"
SATIR=$(ogr_api GET "$OGR" /odevlerim | jq -r --arg o "$ODEV" '.odevler[] | select(.odev_id == $o) | .id')
sart "odevlerim ek_sayisi" "$(ogr_api GET "$OGR" /odevlerim | jq -r --arg o "$ODEV" '.odevler[] | select(.odev_id == $o) | .ek_sayisi')" 2
OE=$(ogr_api GET "$OGR" "/ogrenci-odevleri/$SATIR/ekler")
sart "ogrenci 2 ek goruyor" "$(echo "$OE" | jq -r '.ekler | length')" 2
PDF_URL=$(echo "$OE" | jq -r '.ekler[0].adres.asil_url')
curl -sS -o "$TMP/indirilen.pdf" -w '   indirme HTTP %{http_code}, %{content_type}, %{size_download} bayt\n' "$PDF_URL"
sart "indirilen PDF imzasi" "$(head -c 4 "$TMP/indirilen.pdf")" "%PDF"
sart "baska ogrencinin satiri (ogrenci2) 404" "$(ogr_durum GET "$OGR2" "/ogrenci-odevleri/$SATIR/ekler")" 404
sart "ogretmen ogrenci ucunu kullanamaz (403)" "$(ogr_durum GET "$HOCA" "/ogrenci-odevleri/$SATIR/ekler")" 403
sart "ogrenci ek yazamaz (403)" "$(ogr_durum PUT "$OGR" "/odevler/$ODEV/ekler" '{"medya_dosya_idleri":[]}')" 403
sart "kimliksiz 401" "$(durum "$API/v1/ogrenme/kurumlar/$KURUM/odevler/$ODEV/ekler")" 401

adim "4) Hata kodlari"
BASKA=$(yukle "$S" odev_eki application/pdf "$TMP/f.pdf"); hazir_bekle "$S" "$BASKA"
sart "baskasinin dosyasi 422 dosya_gecersiz" "$(ogr_api PUT "$HOCA" "/odevler/$ODEV/ekler" "$(jq -nc --arg a "$PDF" --arg b "$BASKA" '{medya_dosya_idleri:[$a,$b]}')" | jq -r '.error.code')" dosya_gecersiz
sart "hazir olmayan dosya 409 dosya_hazir_degil" "$(ogr_api PUT "$HOCA" "/odevler/$ODEV/ekler" "$(jq -nc --arg a "$PDF" --arg b "$(uuidgen | tr 'A-Z' 'a-z')" '{medya_dosya_idleri:[$a,$b]}')" | jq -r '.error.code')" dosya_hazir_degil
sart "11 dosya 400" "$(ogr_durum PUT "$HOCA" "/odevler/$ODEV/ekler" "$(jq -nc '{medya_dosya_idleri: [range(11) | "00000000-0000-7000-8000-00000000000\(.)"]}' | sed 's/0000000000010/000000000010/')")" 400

adim "5) Cikarilan ek medyada silinir; yeni PDF eklenir"
YENI=$(yukle "$HOCA" odev_eki application/pdf "$TMP/f.pdf"); hazir_bekle "$HOCA" "$YENI"
G=$(ogr_api PUT "$HOCA" "/odevler/$ODEV/ekler" "$(jq -nc --arg a "$PDF" --arg c "$YENI" '{medya_dosya_idleri:[$c,$a]}')")
sart "yeni sira" "$(echo "$G" | jq -r '[.ekler[].medya_dosya_id] == ["'"$YENI"'","'"$PDF"'"]')" true
sart "outbox: birakildi olayi (hemen_sil)" "$(sqla "select count(*) from ortak.outbox where kurum_id='$KURUM' and subject='evt.ortak.dosya.birakildi.v1' and payload->'data'->>'dosya_id'='$PNG' and payload->'data'->>'hemen_sil'='true'")" 1
for i in $(seq 1 40); do
  d=$(sqlm "select durum from medya.dosyalar where id = '$PNG'")
  [ "$d" = "silindi" ] && break
  sleep 1
done
sart "medya: cikarilan PNG silindi" "$d" silindi
sart "medya: yeni PDF baglandi" "$(sqlm "select baglandi::text || ':' || bagli_tur from medya.dosyalar where id = '$YENI'")" "true:odev_eki"

adim "6) Haftalik plan eki (plan_eki)"
PL_PDF=$(yukle "$HOCA" plan_eki application/pdf "$TMP/f.pdf"); hazir_bekle "$HOCA" "$PL_PDF"
sart "odev_eki plana verilemez" "$(ogr_api PUT "$HOCA" "/planlar/00000000-0000-7000-8000-000000000001/ekler" "$(jq -nc --arg a "$YENI" '{medya_dosya_idleri:[$a]}')" | jq -r '.error.code')" bulunamadi
PAZARTESI=$(date -u -v-"$(( ($(date -u +%u) + 6) % 7 ))"d +%Y-%m-%d 2>/dev/null || date -u -d "last monday" +%Y-%m-%d)
PLAN=$(ogr_api POST "$HOCA" /planlar "$(jq -nc --arg o "$OGR_UYELIK" --arg h "$PAZARTESI" '{ogrenci_id:$o,hafta_baslangic:$h}')" | jq -r '.plan.id')
sart "odev_eki plana verilemez (422)" "$(ogr_api PUT "$HOCA" "/planlar/$PLAN/ekler" "$(jq -nc --arg a "$YENI" '{medya_dosya_idleri:[$a]}')" | jq -r '.error.code')" dosya_gecersiz
sart "plan eki baglandi" "$(ogr_api PUT "$HOCA" "/planlar/$PLAN/ekler" "$(jq -nc --arg a "$PL_PDF" '{medya_dosya_idleri:[$a]}')" | jq -r '.ekler | length')" 1
sart "taslak plan: ogrenci goremez (404)" "$(ogr_durum GET "$OGR" "/planim/$PLAN/ekler")" 404
ogr_api POST "$HOCA" "/planlar/$PLAN/gorevler" "$(jq -nc --arg g "$PAZARTESI" '{gun:$g,brans_kodu:"matematik",hedef_turu:"soru",hedef_miktar:20}')" >/dev/null
ogr_api POST "$HOCA" "/planlar/$PLAN/yayinla" '{}' >/dev/null
PE=$(ogr_api GET "$OGR" "/planim/$PLAN/ekler")
sart "yayindan sonra ogrenci plan ekini goruyor" "$(echo "$PE" | jq -r '.ekler | length')" 1
curl -sS -o "$TMP/plan.pdf" -w '   plan eki indirme HTTP %{http_code}, %{size_download} bayt\n' "$(echo "$PE" | jq -r '.ekler[0].adres.asil_url')"
sart "indirilen plan PDF imzasi" "$(head -c 4 "$TMP/plan.pdf")" "%PDF"
sart "baska ogrenci plana erisemez (404)" "$(ogr_durum GET "$OGR2" "/planim/$PLAN/ekler")" 404
sart "ogrenci plan eki yazamaz (403)" "$(ogr_durum PUT "$OGR" "/planlar/$PLAN/ekler" '{"medya_dosya_idleri":[]}')" 403

echo; echo "TAMAM: odev ve plan ek akisi basarili"
