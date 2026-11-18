#!/usr/bin/env bash
# Platform yonetimi akisi (/platform/*): uctan uca curl senaryosu. Platform yoneticisi ekle (betik) -> giris ->
# 2FA'siz erisim reddi -> 2FA kur ve dogrula (TOTP betikte uretilir) -> kurum ara -> modul kapat (olay outbox'ta)
# -> taklit baslat -> hedef olarak oku (200) / yaz (403) -> sonlandir (401) -> denetim listesinde hepsi -> sistem
# sagligi -> bakim mesaji yayinla ve kimliksiz uctan oku. Tekrar calistirilabilir (her calistirmada yeni
# kullanici/kurum). bash 3.2 (macOS) uyumlu; JSON govdeleri `jq -nc --arg` ile kurulur.
#
# On kosul: api 41510 portunda, ayri veritabaninda; NATS (kendi konteynerin) acik:
#   docker exec kopru-postgres-1 createdb -U postgres kopru_p1_api
#   docker run -d --name kopru-nats-p1 -p 4232:4222 nats:2 -js
#   export API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_p1_api \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem
#   pnpm --filter @kopru/api db:migrate
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_p1_api \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_p1_api \
#          API_PORT=41510 API_PUBLIC_URL=http://localhost:41510 NATS_URL=nats://localhost:4232 \
#          API_PLATFORM_IP_IZINLI=127.0.0.1/32,::1/128
#   pnpm --filter @kopru/api dev > /tmp/api41510.log 2>&1 &
# Outbox sayilari icin `docker exec kopru-postgres-1 psql` kullanilir (DB adi: $DB, varsayilan kopru_p1_api).
# Kullanim (repo kokunden): services/api/scripts/platform-akisi.sh
set -euo pipefail

API="${API:-http://localhost:41510}"
DB="${DB:-kopru_p1_api}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
sql() { docker exec kopru-postgres-1 psql -U postgres -d "$DB" -tAc "$1"; }

kayit() { # $1 eposta $2 ad -> oturum belirteci
  local govde
  govde=$(jq -nc --arg e "$1" --arg p "$PAROLA" --arg a "$2" '{eposta:$e,parola:$p,gorunen_ad:$a}')
  j -X POST "$API/auth/eposta/kayit" -d "$govde" | jq -r '.oturum_belirteci'
}
giris() { # $1 eposta -> yeni oturum belirteci
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
  local id govde
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
    govde=$(jq -nc --arg i "$id" '{riza_metni_id:$i}')
    j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$govde" >/dev/null
  done
}
# RFC 6238 TOTP (SHA-1, 6 hane, 30 sn); $1 base32 sir, $2 (ops.) adim kaydirma
totp() {
  node -e '
    const c = require("node:crypto");
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bit = 0, v = 0; const b = [];
    for (const ch of process.argv[1]) { v = ((v << 5) | A.indexOf(ch)) & 0xffff; bit += 5; if (bit >= 8) { b.push((v >>> (bit - 8)) & 255); bit -= 8; } }
    const sayac = Math.floor(Date.now() / 30000) + Number(process.argv[2] || 0);
    const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(sayac));
    const h = c.createHmac("sha1", Buffer.from(b)).update(m).digest();
    const o = h[h.length - 1] & 15;
    const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    console.log(String(n % 1000000).padStart(6, "0"));
  ' "$1" "${2:-}"
}
claims() { # $1 JWT -> JSON govde (base64url, dolgu yok)
  node -e 'console.log(Buffer.from(process.argv[1].split(".")[1], "base64url").toString("utf8"))' "$1"
}
P() { # $1 yontem $2 yol $3 belirtec $4 (ops.) govde -> yanit govdesi (govdesiz POST'a {} yollanir)
  local govde="${4:-}"
  if [ -z "$govde" ] && [ "$1" = POST ]; then govde='{}'; fi
  if [ -n "$govde" ]; then j -X "$1" "$API$2" -H "authorization: Bearer $3" -d "$govde"; else j -X "$1" "$API$2" -H "authorization: Bearer $3"; fi
}
PD() { # P ile ayni, yalniz HTTP durum kodu
  local govde="${4:-}"
  if [ -z "$govde" ] && [ "$1" = POST ]; then govde='{}'; fi
  if [ -n "$govde" ]; then durum -X "$1" "$API$2" -H "authorization: Bearer $3" -d "$govde"; else durum -X "$1" "$API$2" -H "authorization: Bearer $3"; fi
}

adim "0) Hedef kurum ve sahibi (taklit edilecek kullanici)"
EH="sahip$RUN@example.com"
OH=$(kayit "$EH" "Okul Sahibi"); AH=$(token "$OH"); riza "$AH"
KURUM_AD="Platform Akis Okulu $RUN"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $AH" -d "$(jq -nc --arg a "$KURUM_AD" '{ad:$a,tur:"kurum"}')" | jq -r '.kurum.id')
HEDEF_KULLANICI=$(j "$API/v1/hesap/ben" -H "authorization: Bearer $AH" | jq -r '.kullanici.id')
HT=$(token "$OH" "$KURUM")
echo "kurum=$KURUM hedef_kullanici=$HEDEF_KULLANICI"
DERSLER="/v1/ders/kurumlar/$KURUM/dersler?baslangic=2026-01-01T00:00:00Z&bitis=2026-02-01T00:00:00Z"
sart "hedef kendi takvimini okuyabiliyor" "$(PD GET "$DERSLER" "$HT")" 200

adim "1) Platform yoneticisi ekle (betik; uretimde tek yol) ve giris"
EY="yonetici$RUN@example.com"
OY0=$(kayit "$EY" "Platform Yoneticisi")
pnpm --silent --filter @kopru/api platform:yonetici-ekle -- "$EY" --rol yonetici
OY=$(giris "$EY"); AY=$(token "$OY")
echo "belirtec plat claim'i: $(claims "$AY" | jq -r '.plat // "yok"')"
sart "kimliksiz platform ucu" "$(durum "$API/platform/kurumlar")" 401
sart "platform rolu olmayan (okul sahibi)" "$(PD GET /platform/kurumlar "$HT")" 403
sart "2FA'siz platform ucu" "$(PD GET /platform/kurumlar "$AY")" 403
echo "kod: $(P GET /platform/kurumlar "$AY" | jq -r '.error.code')"
sart "ikinci adim durumu (kurulu degil)" "$(P GET /platform/ben "$AY" | jq -r '.ikinci_adim.kurulu')" false

adim "2) 2FA kur ve dogrula"
KUR=$(P POST /platform/ikinci-adim/kur "$AY" '{}')
SIR=$(echo "$KUR" | jq -r '.sir')
echo "$KUR" | jq '{otpauth_uri, yedek_kod_sayisi: (.yedek_kodlar | length)}'
YEDEK=$(echo "$KUR" | jq -r '.yedek_kodlar[0]')
sart "yanlis kod" "$(PD POST /platform/ikinci-adim/onayla "$AY" '{"kod":"000000"}')" 400
sart "dogru kod ile onay" "$(PD POST /platform/ikinci-adim/onayla "$AY" "$(jq -nc --arg k "$(totp "$SIR")" '{kod:$k}')")" 200
sart "ayni TOTP kodu yeni oturumda reddedilir (tekrar oynatma)" "$(PD POST /platform/ikinci-adim/dogrula "$(token "$(giris "$EY")")" "$(jq -nc --arg k "$(totp "$SIR")" '{kod:$k}')")" 400
sart "kurulu 2FA yeniden kurulamaz" "$(PD POST /platform/ikinci-adim/kur "$AY" '{}')" 409
sart "2FA sonrasi platform ucu" "$(PD GET /platform/kurumlar "$AY")" 200
OY2=$(giris "$EY"); AY2=$(token "$OY2")
sart "yeni oturum yeniden dogrulama ister" "$(PD GET /platform/kurumlar "$AY2")" 403
sart "yedek kodla dogrulama" "$(PD POST /platform/ikinci-adim/dogrula "$AY2" "$(jq -nc --arg k "$YEDEK" '{yedek_kod:$k}')")" 200
sart "ayni yedek kod ikinci kez" "$(PD POST /platform/ikinci-adim/dogrula "$(token "$(giris "$EY")")" "$(jq -nc --arg k "$YEDEK" '{yedek_kod:$k}')")" 400

adim "3) Kurum ara (ad, id, sahip e-postasi) — kisisel veri maskeli"
ARA=$(P GET "/platform/kurumlar?q=$(jq -rn --arg q "$KURUM_AD" '$q|@uri')" "$AY")
echo "$ARA" | jq '.kurumlar[] | {id, ad, durum, sahipler}'
sart "ada gore bulundu" "$(echo "$ARA" | jq -r '.kurumlar[0].id')" "$KURUM"
sart "kurum kimligi ile" "$(P GET "/platform/kurumlar?q=$KURUM" "$AY" | jq -r '.kurumlar[0].id')" "$KURUM"
sart "sahip e-postasi ile" "$(P GET "/platform/kurumlar?q=$(jq -rn --arg q "$EH" '$q|@uri')" "$AY" | jq -r '.kurumlar[0].id')" "$KURUM"
sart "yanitta tam e-posta yok" "$(echo "$ARA" | grep -c "$EH" || true)" 0
DETAY=$(P GET "/platform/kurumlar/$KURUM" "$AY")
echo "$DETAY" | jq '{ad, durum, uye_sayilari, takvim: (.moduller[] | select(.modul_kodu == "takvim"))}'

adim "4) Kuruma ozel modul kapat (olay outbox'a yazilir) ve beta bayragi"
sart "neden kisa" "$(PD PUT "/platform/kurumlar/$KURUM/moduller/takvim" "$AY" '{"acik":false,"neden":"kisa"}')" 400
sart "takvim kapat" "$(PD PUT "/platform/kurumlar/$KURUM/moduller/takvim" "$AY" '{"acik":false,"neden":"Kurum talebiyle gecici kapatma (akis denemesi)"}')" 200
sart "hedef kullanici takvimi artik 403" "$(PD GET "$DERSLER" "$HT")" 403
echo "kod: $(P GET "$DERSLER" "$HT" | jq -r '.error.code')"
sart "modul olayi outbox'ta" "$(sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.hesap.modul_ayari.degisti.v1'")" 1
sart "beta bayragi ac" "$(PD PUT "/platform/kurumlar/$KURUM/beta/yeni_ekran" "$AY" '{"acik":true,"neden":"Pilot kurum beta erisimi"}')" 200
sart "detayda beta" "$(P GET "/platform/kurumlar/$KURUM" "$AY" | jq -r '.beta_ozellikleri[0].ozellik_kodu')" yeni_ekran

adim "5) Taklit: baslat, hedef olarak oku (200) / yaz (403), sonlandir (401)"
sart "neden kisa" "$(PD POST /platform/taklit "$AY" "$(jq -nc --arg h "$HEDEF_KULLANICI" --arg k "$KURUM" '{hedef_kullanici_id:$h,kurum_id:$k,neden:"kisa"}')")" 400
TAKLIT=$(P POST /platform/taklit "$AY" "$(jq -nc --arg h "$HEDEF_KULLANICI" --arg k "$KURUM" '{hedef_kullanici_id:$h,kurum_id:$k,neden:"Destek talebi 4821: takvim gorunmuyor"}')")
echo "$TAKLIT" | jq '{taklit_id, expires_in, bitis_at, rol}'
TID=$(echo "$TAKLIT" | jq -r '.taklit_id'); TT=$(echo "$TAKLIT" | jq -r '.access_token')
echo "taklit belirteci claim'leri: $(claims "$TT" | jq -c '{sub, aktor, imp, sid, kurum_id, rol}')"
sart "taklit: hedefin uyelikleri (okuma)" "$(PD GET /v1/hesap/uyeliklerim "$TT")" 200
sart "taklit: hedefin gordugu takvim (modul kapali)" "$(PD GET "$DERSLER" "$TT")" 403
sart "taklit: yazma (modul ayari)" "$(PD PUT "/v1/hesap/kurumlar/$KURUM/modul-ayarlari" "$TT" '{"modul_kodu":"takvim","kapsam":"kurum","acik":true}')" 403
echo "kod: $(P PUT "/v1/hesap/kurumlar/$KURUM/modul-ayarlari" "$TT" '{"modul_kodu":"takvim","kapsam":"kurum","acik":true}' | jq -r '.error.code')"
sart "taklit: yazma (kurum olustur)" "$(PD POST /v1/hesap/kurumlar "$TT" '{"ad":"X","tur":"bireysel"}')" 403
sart "taklit belirteci /platform/* acamaz" "$(PD GET /platform/kurumlar "$TT")" 403
sart "taklit belirteci yenilenemez (/auth/token)" "$(PD POST /auth/token "$TT" '{}')" 401
sart "hedefin kendi belirteci etkilenmedi (modul hala kapali, yazma yok)" "$(sql "select count(*) from hesap.modul_ayarlari where kurum_id = '$KURUM' and acik")" 0
sart "sonlandir" "$(PD POST "/platform/taklit/$TID/sonlandir" "$AY")" 200
sart "sonlanan taklit belirteci 401" "$(PD GET /v1/hesap/uyeliklerim "$TT")" 401
sart "sonlandirma tekrari idempotent" "$(PD POST "/platform/taklit/$TID/sonlandir" "$AY")" 200

adim "6) Modulu mirasa dondur"
sart "takvim mirasa" "$(PD PUT "/platform/kurumlar/$KURUM/moduller/takvim" "$AY" '{"acik":null,"neden":"Kapatma geri alindi (akis denemesi)"}')" 200
sart "hedef takvimi tekrar 200" "$(PD GET "$DERSLER" "$HT")" 200

adim "7) Denetim listesinde hepsi (kurum suzgeci)"
DEN=$(P GET "/platform/denetim?kurum_id=$KURUM&limit=200" "$AY")
echo "$DEN" | jq -r '.kayitlar | reverse | .[] | "\(.created_at)  \(.eylem)  taklit=\(.taklit_kayit_id // "-")  \(.ayrinti // {} | tostring)"' | cut -c1-150
for e in platform.kurum_detay platform.modul_ayarla platform.beta_ayarla platform.taklit_baslat taklit.istek; do
  sart "kurum denetiminde $e" "$(echo "$DEN" | jq --arg e "$e" '[.kayitlar[] | select(.eylem == $e)] | length > 0')" true
done
AKTOR=$(claims "$TT" | jq -r '.aktor')
for e in platform.kurum_ara platform.taklit_sonlandir platform.ikinci_adim_onayla platform.ikinci_adim_dogrula platform.denetim_listele; do
  sart "aktor denetiminde $e" "$(P GET "/platform/denetim?aktor_id=$AKTOR&eylem=$e&limit=5" "$AY" | jq '.kayitlar | length > 0')" true
done
sart "taklit istekleri taklit_kayit_id ile" "$(echo "$DEN" | jq --arg t "$TID" '[.kayitlar[] | select(.eylem == "taklit.istek" and .taklit_kayit_id == $t)] | length >= 6')" true
echo "-- aktor suzgeci + eylem oneki (sayfa 1/2, limit 3)"
S1=$(P GET "/platform/denetim?aktor_id=$AKTOR&eylem=platform.*&limit=3" "$AY")
echo "$S1" | jq '{adet: (.kayitlar | length), sonraki_imlec}'
IMLEC=$(echo "$S1" | jq -r '.sonraki_imlec')
S2=$(P GET "/platform/denetim?eylem=platform.*&limit=3&imlec=$IMLEC" "$AY")
echo "$S2" | jq '{adet: (.kayitlar | length), ilk: .kayitlar[0].eylem}'

echo "-- destek rolu: kurum okuma serbest, denetim/degisiklik yonetici isi"
ED="destek$RUN@example.com"
kayit "$ED" "Destek" >/dev/null
pnpm --silent --filter @kopru/api platform:yonetici-ekle -- "$ED" --rol destek
OD=$(giris "$ED"); AD=$(token "$OD")
SIRD=$(P POST /platform/ikinci-adim/kur "$AD" '{}' | jq -r '.sir')
sart "destek 2FA onay" "$(PD POST /platform/ikinci-adim/onayla "$AD" "$(jq -nc --arg k "$(totp "$SIRD")" '{kod:$k}')")" 200
sart "destek kurum okur" "$(PD GET "/platform/kurumlar/$KURUM" "$AD")" 200
sart "destek denetim listeleyemez" "$(PD GET /platform/denetim "$AD")" 403
echo "kod: $(P GET /platform/denetim "$AD" | jq -r '.error.code')"
sart "destek modul degistiremez" "$(PD PUT "/platform/kurumlar/$KURUM/moduller/takvim" "$AD" '{"acik":false,"neden":"destek deneme nedeni"}')" 403

adim "8) Sistem sagligi"
P GET /platform/sistem-sagligi "$AY" | jq .

adim "9) Bakim/duyuru mesaji: yayinla, kimliksiz oku, kaldir"
sart "baslangicta mesaj yok" "$(j "$API/v1/platform-mesaji" | jq -c '.mesaj')" null
BITIS=$(node -e 'console.log(new Date(Date.now() + 2 * 3600 * 1000).toISOString())')
MESAJ=$(P POST /platform/mesajlar "$AY" "$(jq -nc --arg b "$BITIS" '{baslik:"Planli bakim",metin:"Pazar 03:00-04:00 arasi kisa kesinti olabilir.",onem:"uyari",bitis_at:$b}')")
echo "$MESAJ" | jq '{id, onem, baslangic_at, bitis_at}'
MID=$(echo "$MESAJ" | jq -r '.id')
ACIK=$(curl -sS -i "$API/v1/platform-mesaji")
echo "$ACIK" | grep -i '^cache-control'
echo "$ACIK" | tail -1 | jq .
sart "kimliksiz uc etkin mesaji doner" "$(echo "$ACIK" | tail -1 | jq -r '.mesaj.baslik')" "Planli bakim"
sart "mesaj iptal" "$(PD POST "/platform/mesajlar/$MID/iptal" "$AY")" 200
sart "iptal sonrasi mesaj yok" "$(j "$API/v1/platform-mesaji" | jq -c '.mesaj')" null

adim "10) Ozet"
echo "taklit_kayitlari: $(sql "select count(*) from hesap.taklit_kayitlari where hedef_kurum_id = '$KURUM'")"
echo "denetim satiri (kurum): $(sql "select count(*) from hesap.denetim_kayitlari where kurum_id = '$KURUM'")"
echo "TAMAM"
