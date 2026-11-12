#!/usr/bin/env bash
# medya yukleme akisi: uctan uca curl senaryosu (gercek api girisi + medya API + worker + RustFS + NATS).
# Ogrenci EXIF'li (GPS konumlu, yon=6) gercek bir JPEG yukler: izin -> presigned PUT -> tamam -> worker isler ->
# GET ile adresler -> indir; boyut, EXIF'in silindigi, kucuk resimler, outbox'taki medya.dosya.hazir.v1 gosterilir.
# Ogretmen ses (MP3, varsa macOS afconvert ile m4a) yukler: sure; ogrenci ses yukleyemez; 180 sn ustu reddedilir.
# api'nin servis tokeniyle ic uc cagrilir; kullanici tokeniyle 401. Son olarak silme isi nesneleri siler.
# Tekrar calistirilabilir (her calistirmada yeni kullanici/kurum). bash 3.2 (macOS) uyumlu. Gereken: curl, jq, docker.
#
# On kosul (repo kokunden; portlar bu betigin varsayilanlari, Postgres 5433):
#   P='docker exec kopru-postgres-1 psql -U postgres'
#   $P -c 'create database kopru_paket_m owner api' ; $P -c 'create database kopru_medya_m'
#   # api (4267): giris ve JWKS icin
#   export NATS_URL=nats://localhost:4222
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_paket_m \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_m \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_paket_m \
#          API_PORT=4267 API_PUBLIC_URL=http://localhost:4267
#   pnpm --filter @kopru/api db:migrate && pnpm --filter @kopru/api dev > /tmp/api4267.log 2>&1 &
#   # medya (4263) + worker: kendi veritabani, S3 (RustFS 9000), JWKS = api
#   export MEDYA_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_medya_m \
#          MEDYA_APP_PASSWORD=medya_app MEDYA_SISTEM_PASSWORD=medya_sistem
#   pnpm --filter @kopru/medya db:migrate
#   export MEDYA_DATABASE_URL=postgres://medya_app:medya_app@localhost:5433/kopru_medya_m \
#          MEDYA_DATABASE_SISTEM_URL=postgres://medya_sistem:medya_sistem@localhost:5433/kopru_medya_m \
#          MEDYA_PORT=4263 JWKS_URL=http://localhost:4267/.well-known/jwks.json JWT_ISSUER=http://localhost:4267 \
#          MEDYA_BAKIM_ARALIK_MS=2000
#   pnpm --filter @kopru/medya dev > /tmp/medya4263.log 2>&1 &
#   pnpm --filter @kopru/medya dev:worker > /tmp/medya-worker.log 2>&1 &
# Kullanim (repo kokunden): services/medya/scripts/yukleme-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4267}"
MEDYA="${MEDYA:-http://localhost:4263}"
DB="${DB:-kopru_medya_m}"
API_DB_URL="${API_DB_URL:-postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_m}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
yeniAnahtar() { uuidgen | tr 'A-Z' 'a-z'; }
sql() { docker exec kopru-postgres-1 psql -U postgres -d "$DB" -tAc "$1"; }
ornek() { pnpm --silent --filter @kopru/medya exec tsx scripts/ornek-uret.ts "$@"; }
kb() { echo "$(( ($1 + 512) / 1024 )) KB"; }

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

yukle() { # $1 token $2 tur $3 mime $4 dosya -> stdout: dosya_id ; PUT/tamam kodlari stderr
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
  echo "   PUT $put, tamam $tamam, dosya $id" >&2
  printf '%s' "$id"
}
bekle() { # $1 token $2 dosya_id -> hazir/islenemedi olana kadar bekler, son yaniti yazar
  local i y d
  for i in $(seq 1 40); do
    y=$(j "$MEDYA/v1/dosyalar/$2" -H "authorization: Bearer $1")
    d=$(echo "$y" | jq -r '.durum')
    if [ "$d" = "hazir" ] || [ "$d" = "islenemedi" ]; then echo "$y"; return; fi
    sleep 0.5
  done
  echo "$y"
}

adim "0) Kurum, ogrenci ve ogretmen (api girisi)"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d "$(jq -nc '{ad:"Medya Deneme Kurumu",tur:"kurum"}')" | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
OGR_OTURUM=$(davetle "$S" ogrenci "ogr$RUN@example.com" "Ali Ogrenci")
HOCA_OTURUM=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca")
OGR=$(token "$OGR_OTURUM" "$KURUM"); HOCA=$(token "$HOCA_OTURUM" "$KURUM")
echo "kurum: $KURUM"
sart "medya /ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$MEDYA/ready")" 200
sart "kimliksiz yukleme izni (401)" "$(durum -X POST "$MEDYA/v1/dosyalar" -d '{}')" 401

adim "1) Ogrenci EXIF'li fotografi yukler (soru_fotografi)"
ornek jpeg "$TMP/foto.jpg"
echo "yuklenen ozgun dosya: $(kb "$(wc -c < "$TMP/foto.jpg")"), $(ornek incele "$TMP/foto.jpg")"
sart "ozgun dosyada EXIF/GPS var" "$(ornek incele "$TMP/foto.jpg" | jq -r '.gps')" true
FOTO=$(yukle "$OGR" soru_fotografi image/jpeg "$TMP/foto.jpg")
SON=$(bekle "$OGR" "$FOTO")
sart "durum hazir" "$(echo "$SON" | jq -r '.durum')" hazir
echo "$SON" | jq '{durum, mime_tipi, boyut_bayt, genislik, yukseklik}'
curl -sS -o "$TMP/asil.jpg" "$(echo "$SON" | jq -r '.adresler.asil_url')"
curl -sS -o "$TMP/kucuk.webp" "$(echo "$SON" | jq -r '.adresler.kucuk_url')"
curl -sS -o "$TMP/orta.webp" "$(echo "$SON" | jq -r '.adresler.orta_url')"
echo "asil   : $(kb "$(wc -c < "$TMP/asil.jpg")")  $(ornek incele "$TMP/asil.jpg")"
echo "orta   : $(kb "$(wc -c < "$TMP/orta.webp")")  $(ornek incele "$TMP/orta.webp")"
echo "kucuk  : $(kb "$(wc -c < "$TMP/kucuk.webp")")  $(ornek incele "$TMP/kucuk.webp")"
sart "islenmis dosyada EXIF/GPS yok" "$(ornek incele "$TMP/asil.jpg" | jq -r '.exif')" false
sart "uzun kenar 2000 px" "$(ornek incele "$TMP/asil.jpg" | jq -r '[.genislik,.yukseklik]|max')" 2000
sart "kucuk resim 256 px" "$(ornek incele "$TMP/kucuk.webp" | jq -r '[.genislik,.yukseklik]|max')" 256
sart "orta resim 1024 px" "$(ornek incele "$TMP/orta.webp" | jq -r '[.genislik,.yukseklik]|max')" 1024

adim "2) Outbox: medya.dosya.hazir.v1 (SQL)"
sql "select subject, payload->'data' from ortak.outbox where kurum_id='$KURUM' order by created_at"
sart "hazir olayi sayisi" "$(sql "select count(*) from ortak.outbox where kurum_id='$KURUM' and subject='evt.medya.dosya.hazir.v1'")" 1
sart "olayda depolama anahtari/EXIF yok" "$(sql "select count(*) from ortak.outbox where kurum_id='$KURUM' and payload::text ~* '(depolama|gizli-sahip|TestKamera)'")" 0
sql "select durum, tur, mime_tipi, boyut_bayt, genislik, yukseklik, silinecek_at is not null as silme_plani, silme_nedeni from medya.dosyalar where id='$FOTO'"

adim "3) Kurallar: ogrenci ses yukleyemez, yanlis Content-Type reddedilir, MIME uyusmazligi"
ornek mp3 "$TMP/kisa.mp3" 12
GOVDE=$(jq -nc --arg s "$(shasum -a 256 "$TMP/kisa.mp3" | cut -d' ' -f1)" --argjson b "$(wc -c < "$TMP/kisa.mp3" | tr -d ' ')" --arg k "$(yeniAnahtar)" '{tur:"soru_ses",mime_tipi:"audio/mpeg",boyut_bayt:$b,sha256:$s,istemci_anahtari:$k}')
sart "ogrenci soru_ses (403)" "$(durum -X POST "$MEDYA/v1/dosyalar" -H "authorization: Bearer $OGR" -d "$GOVDE")" 403
sart "heic (415)" "$(durum -X POST "$MEDYA/v1/dosyalar" -H "authorization: Bearer $OGR" -d '{"tur":"soru_fotografi","mime_tipi":"image/heic","boyut_bayt":100,"sha256":"'"$(printf 'a%.0s' $(seq 1 64))"'","istemci_anahtari":"'"$(yeniAnahtar)"'"}')" 415
URL=$(j -X POST "$MEDYA/v1/dosyalar" -H "authorization: Bearer $HOCA" -d "$GOVDE" | jq -r '.yukleme.url')
sart "imzaya uymayan Content-Type ile PUT (403)" "$(curl -sS -o /dev/null -w '%{http_code}' -X PUT -H 'Content-Type: text/html' --data-binary "@$TMP/kisa.mp3" "$URL")" 403
printf 'Bu bir resim degil, duz metin.\n' > "$TMP/duz.jpg"
SAHTE=$(yukle "$OGR" soru_fotografi image/jpeg "$TMP/duz.jpg")
SONS=$(bekle "$OGR" "$SAHTE")
sart "metin .jpg diye gonderilince durum" "$(echo "$SONS" | jq -r '.durum')" islenemedi
sart "hata kodu" "$(echo "$SONS" | jq -r '.hata_kodu')" mime_uyusmazligi

adim "4) Ogretmen ses yukler: sure; 180 sn ustu reddedilir"
SES=$(yukle "$HOCA" soru_ses audio/mpeg "$TMP/kisa.mp3")
SONSES=$(bekle "$HOCA" "$SES")
echo "$SONSES" | jq '{durum, mime_tipi, boyut_bayt, sure_sn}'
sart "ses durumu" "$(echo "$SONSES" | jq -r '.durum')" hazir
sart "ses suresi (sn)" "$(echo "$SONSES" | jq -r '.sure_sn')" 12
if command -v afconvert >/dev/null 2>&1; then
  ornek wav "$TMP/ses.wav" 5
  afconvert -f m4af -d aac "$TMP/ses.wav" "$TMP/ses.m4a"
  M4A=$(yukle "$HOCA" soru_ses audio/mp4 "$TMP/ses.m4a")
  SONM=$(bekle "$HOCA" "$M4A")
  echo "m4a (afconvert, 5 sn): $(echo "$SONM" | jq -c '{durum, mime_tipi, sure_sn}')"
  sart "m4a durumu" "$(echo "$SONM" | jq -r '.durum')" hazir
else
  echo "(afconvert yok: m4a adimi atlandi)"
fi
ornek mp3 "$TMP/uzun.mp3" 200
UZUN=$(yukle "$HOCA" soru_ses audio/mpeg "$TMP/uzun.mp3")
SONU=$(bekle "$HOCA" "$UZUN")
sart "200 sn ses durumu" "$(echo "$SONU" | jq -r '.durum')" islenemedi
sart "200 sn ses hata kodu" "$(echo "$SONU" | jq -r '.hata_kodu')" sure_asimi

adim "5) Ic uc: api servis tokeni ile okuma adresleri (kullanici tokeniyle 401)"
SERVIS=$(API_DATABASE_URL="$API_DB_URL" API_PUBLIC_URL="$API" JWT_ISSUER="$API" pnpm --silent --filter @kopru/medya exec tsx scripts/servis-token.mjs)
IC=$(jq -nc --arg k "$KURUM" --arg a "$FOTO" --arg b "$SES" --arg c "$UZUN" --arg d "$(yeniAnahtar)" '{kurum_id:$k,dosya_idleri:[$a,$b,$c,$d]}')
YANIT=$(j -X POST "$MEDYA/ic/okuma-adresleri" -H "authorization: Bearer $SERVIS" -d "$IC")
echo "$YANIT" | jq '.adresler | map({dosya_id, mime_tipi, genislik, sure_sn, kucuk_var: (.kucuk_url != null), gecerlilik_bitis_at})'
sart "yanitta yalniz hazir dosyalar (foto + ses)" "$(echo "$YANIT" | jq '.adresler | length')" 2
sart "adresten indirme" "$(curl -sS -o /dev/null -w '%{http_code}' "$(echo "$YANIT" | jq -r '.adresler[0].asil_url')")" 200
sart "kullanici tokeniyle ic uc (401)" "$(durum -X POST "$MEDYA/ic/okuma-adresleri" -H "authorization: Bearer $OGR" -d "$IC")" 401
sart "baska kurum kimligiyle yanit bos" "$(j -X POST "$MEDYA/ic/okuma-adresleri" -H "authorization: Bearer $SERVIS" -d "$(echo "$IC" | jq -c --arg k "$(yeniAnahtar)" '.kurum_id=$k')" | jq '.adresler | length')" 0

adim "6) Silme isi: nesneler silinir, satir silindi, kota duser"
sql "select kullanilan_bayt, dosya_sayisi from medya.kurum_kotalari where kurum_id='$KURUM'"
ASIL_URL=$(echo "$SON" | jq -r '.adresler.asil_url')
sart "silmeden once asil nesne 200" "$(curl -sS -o /dev/null -w '%{http_code}' "$ASIL_URL")" 200
sql "update medya.dosyalar set silinecek_at = now(), silme_nedeni = 'saklama_suresi' where kurum_id='$KURUM'" >/dev/null
for i in $(seq 1 30); do
  KALAN=$(sql "select count(*) from medya.dosyalar where kurum_id='$KURUM' and durum <> 'silindi'")
  [ "$KALAN" = "0" ] && break
  sleep 1
done
sart "silinmemis dosya kalmadi" "$KALAN" 0
sart "asil nesne artik yok (404)" "$(curl -sS -o /dev/null -w '%{http_code}' "$ASIL_URL")" 404
sql "select kullanilan_bayt, dosya_sayisi from medya.kurum_kotalari where kurum_id='$KURUM'"
sart "kota sifirlandi" "$(sql "select kullanilan_bayt || '/' || dosya_sayisi from medya.kurum_kotalari where kurum_id='$KURUM'")" "0/0"
sql "select durum, depolama_anahtari is null as anahtar_yok, sha256 is not null as ozet_var from medya.dosyalar where id='$FOTO'"
echo "silindi olaylari (outbox): $(sql "select count(*) from ortak.outbox where kurum_id='$KURUM' and subject='evt.medya.dosya.silindi.v1'")"

echo
echo "TUM ADIMLAR BASARILI"
