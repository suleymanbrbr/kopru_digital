#!/usr/bin/env bash
# Gunluk soru takibi akisi: uctan uca curl senaryosu (gercek api + api worker + motivasyon + motivasyon worker +
# NATS). Tekrar calistirilabilir (her calistirmada yeni kullanici/kurum; e-posta+parola ile girer). bash 3.2
# (macOS) uyumlu. Gereken: curl, jq, docker, python3, node.
#
# Akis: ogretmen kaynak kitap tanimlar -> ogrenci 3 zorlukta (kolay/orta/zor) kayit girer (biri fotografli, biri
# kitap testinden, istek_id tekrari idempotent) -> ogretmen konu analizini alir (bant tespiti "orta seviyede
# zorlaniyor" ve "gorev oner" onerisi) -> ogrenci kendi analizini alir, yanitta ONERI YOK -> baska (atanmamis)
# ogretmen goremez (404) -> hucre ayrintisi fotograf okuma adresiyle -> oneriden plan gorevi olustur (ogrenci
# gorur) ve odev -> XP motivasyonda gorunur (kayit basina 2) -> kayit silinince ters kayit -> duzeltme -> haftalik
# ozet -> outbox olaylarinda kisisel veri yok. Fotograf: medya servisi yerine `medya.dosya.hazir.v1` olayi outbox'a
# yazilir (soru-akisi.sh ile ayni yontem), okuma adresleri icin sahte medya sunucusu bu betikte baslar.
#
# On kosul (repo kokunden; AYRI NATS 4255; portlar 41840-41849; Postgres 5433):
#   docker run -d --name kopru-nats-g1 -p 4255:4222 nats:2 -js
#   docker exec kopru-postgres-1 createdb -U postgres kopru_g1_api ; docker exec kopru-postgres-1 createdb -U postgres kopru_g1_mot
#   export NATS_URL=nats://localhost:4255
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_g1_api \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_g1_api \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_g1_api \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
#          API_PORT=41840 API_PUBLIC_URL=http://localhost:41840 API_MEDYA_URL=http://127.0.0.1:41841
#   pnpm --filter @kopru/api db:migrate
#   (pnpm --filter @kopru/api dev > /tmp/g1-api.log 2>&1 &) ; (pnpm --filter @kopru/api dev:worker > /tmp/g1-api-worker.log 2>&1 &)
#   export MOTIVASYON_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_g1_mot \
#          MOTIVASYON_APP_PASSWORD=motivasyon_app MOTIVASYON_SISTEM_PASSWORD=motivasyon_sistem
#   pnpm --filter @kopru/motivasyon db:migrate
#   export MOTIVASYON_DATABASE_URL=postgres://motivasyon_app:motivasyon_app@localhost:5433/kopru_g1_mot \
#          MOTIVASYON_DATABASE_SISTEM_URL=postgres://motivasyon_sistem:motivasyon_sistem@localhost:5433/kopru_g1_mot \
#          MOTIVASYON_PORT=41842 MOTIVASYON_AUTH_ENABLED=true JWKS_URL=http://localhost:41840/.well-known/jwks.json \
#          JWT_ISSUER=http://localhost:41840
#   (pnpm --filter @kopru/motivasyon dev > /tmp/g1-mot.log 2>&1 &) ; (pnpm --filter @kopru/motivasyon dev:worker > /tmp/g1-mot-worker.log 2>&1 &)
# Kullanim (repo kokunden): services/api/scripts/gunluk-soru-akisi.sh
set -euo pipefail

API="${API:-http://localhost:41840}"
MOT="${MOT:-http://localhost:41842}"
MEDYA_PORT="${MEDYA_PORT:-41841}"
API_DB="${API_DB:-kopru_g1_api}"
MOT_DB="${MOT_DB:-kopru_g1_mot}"
PG="${PG:-docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d $API_DB -v ON_ERROR_STOP=1}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
API_DIZIN="$(cd "$(dirname "$0")/.." && pwd)"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
sql() { $PG -c "$1"; }
msql() { docker exec kopru-postgres-1 psql -U postgres -d "$MOT_DB" -tAc "$1"; }
yeniUuid() { uuidgen | tr 'A-Z' 'a-z'; }

kayit() { j -X POST "$API/auth/eposta/kayit" -d "$(jq -nc --arg e "$1" --arg p "$PAROLA" --arg a "$2" '{eposta:$e,parola:$p,gorunen_ad:$a}')" | jq -r '.oturum_belirteci'; }
token() { j -X POST "$API/auth/token" -H "authorization: Bearer $1" -d "$(jq -nc --arg k "${2:-}" 'if $k == "" then {} else {kurum_id:$k} end')" | jq -r '.access_token'; }
riza() { local id; for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null; done; }
davetle() { # $1 sahip token, $2 rol, $3 eposta, $4 ad -> "uyelik_id oturum"
  local belirtec oturum ilk
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')" | jq -r '.belirtec')
  oturum=$(kayit "$3" "$4"); ilk=$(token "$oturum"); riza "$ilk"
  j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg b "$belirtec" '{belirtec:$b}')" | jq -r '.uyelik_id' | tr -d '\n'
  printf ' %s' "$oturum"
}
benim() { j "$MOT/v1/motivasyon/kurumlar/$KURUM/benim" -H "authorization: Bearer $O"; }
xp_bekle() { # $1 beklenen toplam XP (olay tuketilene kadar bekler)
  local i x
  for i in $(seq 1 80); do
    x=$(benim | jq -r '.toplam_xp // empty')
    if [ "$x" = "$1" ]; then return 0; fi
    sleep 0.5
  done
  echo "BASARISIZ: toplam XP $1 olmadi (son: ${x:-yok})"; benim | jq -c .; exit 1
}

# --- Sahte medya: POST /ic/okuma-adresleri (soru-akisi.sh ile ayni) ---------------------------------------
SAHTE_LOG=$(mktemp)
( cd "$API_DIZIN" && MEDYA_PORT="$MEDYA_PORT" JWKS="$API/.well-known/jwks.json" ISSUER="${API_ISSUER:-$API}" \
  node --input-type=module -e '
import http from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";
const jwks = createRemoteJWKSet(new URL(process.env.JWKS));
http.createServer((req, res) => {
  const p = []; req.on("data", (c) => p.push(c));
  req.on("end", async () => {
    try {
      const t = (req.headers.authorization || "").replace(/^Bearer /, "");
      const { payload } = await jwtVerify(t, jwks, { audience: "medya", issuer: process.env.ISSUER, algorithms: ["EdDSA"] });
      if (!String(payload.scope).split(" ").includes("medya.okuma")) { res.statusCode = 403; return res.end("{}"); }
      const g = JSON.parse(Buffer.concat(p).toString());
      const bitis = new Date(Date.now() + 600000).toISOString();
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ adresler: g.dosya_idleri.map((id) => ({ dosya_id: id, mime_tipi: "image/jpeg", asil_url: "https://depo.test/" + id, kucuk_url: null, orta_url: null, genislik: 800, yukseklik: 600, sure_sn: null, gecerlilik_bitis_at: bitis })) }));
    } catch (e) { res.statusCode = 401; res.end("{}"); }
  });
}).listen(Number(process.env.MEDYA_PORT), "127.0.0.1");
' >"$SAHTE_LOG" 2>&1 & echo $! >"$SAHTE_LOG.pid" )
SAHTE_PID=$(cat "$SAHTE_LOG.pid")
trap 'kill "$SAHTE_PID" 2>/dev/null || true' EXIT
sleep 1

medya_hazir() { # $1 sahip kullanici, $2 tur -> dosya_id (medya servisi yerine `medya.dosya.hazir.v1` outbox'a)
  local id olay
  id=$(yeniUuid)
  olay=$(jq -nc --arg id "$(python3 -c 'import uuid,time;print(uuid.UUID(int=(int(time.time()*1000)<<80)|(7<<76)|(2<<62)|(uuid.uuid4().int&((1<<62)-1))))')" --arg k "$KURUM" --arg d "$id" --arg u "$1" --arg t "$2" \
    '{id:$id,type:"medya.dosya.hazir",version:1,occurredAt:(now|todate),kurumId:$k,actor:{tur:"servis",id:"medya"},correlationId:"gunluk-soru-akisi",data:{dosya_id:$d,sahip_kullanici_id:$u,sahip_uyelik_id:$u,tur:$t,mime_tipi:"image/jpeg",boyut_bayt:350000,genislik:800,yukseklik:600,sure_sn:null,kucuk_resim_var:true}}')
  sql "insert into ortak.outbox (id, kurum_id, subject, payload) values ('$(echo "$olay" | jq -r .id)', '$KURUM', 'evt.medya.dosya.hazir.v1', '$olay'::jsonb)" >/dev/null
  printf '%s' "$id"
}
kopya_bekle() { local i; for i in $(seq 1 60); do [ "$(sql "select count(*) from ortak.medya_dosya_kopyalari where id = '$1'")" = "1" ] && return 0; sleep 0.5; done; echo "BASARISIZ: medya kopyasi olusmadi ($1)"; exit 1; }

adim "1) Kurum, grup, ogretmen (biyoloji atamasi), atanmamis ikinci ogretmen, ogrenci, konu agaci"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Gunluk Soru Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"; P="$API/v1/ogrenme/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"12-A Biyoloji"}' | jq -r '.id')
HOCA_B=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca"); HOCA_U=${HOCA_B%% *}; HOCA_O=${HOCA_B##* }
HOCA2_B=$(davetle "$S" ogretmen "hocab$RUN@example.com" "Mehmet Hoca"); HOCA2_O=${HOCA2_B##* }
sart "biyoloji atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HOCA_U" '{ogretmen_id:$o,brans_kodu:"biyoloji"}')")" 201
OGR_B=$(davetle "$S" ogrenci "ogr$RUN@example.com" "Ali Ogrenci"); OGR_U=${OGR_B%% *}; OGR_O=${OGR_B##* }
sart "ogrenci gruba (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OGR_U" '{ogrenci_idleri:[$a]}')")" 201
HOCA=$(token "$HOCA_O" "$KURUM"); HOCA2=$(token "$HOCA2_O" "$KURUM"); O=$(token "$OGR_O" "$KURUM")
OGR_K=$(sql "select kullanici_id from hesap.uyelikler where id = '$OGR_U'")
UNITE=$(yeniUuid); KONU=$(yeniUuid)
sql "insert into ogrenme.konular (id, kurum_id, katalog_kodu, brans_kodu, ust_id, seviye, ad, gecerli_surum_baslangic) values ('$UNITE', null, 'tyt', 'biyoloji', null, 'unite', 'Kalitim', 1), ('$KONU', null, 'tyt', 'biyoloji', '$UNITE', 'konu', 'Genetik', 1)" >/dev/null
echo "kurum: $KURUM  grup: $GRUP  ogrenci(uyelik): $OGR_U  konu: $KONU"
sart "motivasyon /ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$MOT/ready")" 200

adim "2) Ogretmen kaynak kitap tanimlar; ogrenci okur ama yazamaz"
KITAP=$(j -X POST "$P/kaynak-kitaplar" -H "authorization: Bearer $HOCA" -d '{"ad":"Biyoloji Soru Bankasi","yayinevi":"X Yayinlari","brans_kodu":"biyoloji","testler":[{"ad":"Test 4","soru_sayisi":20},{"ad":"Test 5","soru_sayisi":25}]}')
KITAP_ID=$(echo "$KITAP" | jq -r '.id'); TEST4=$(echo "$KITAP" | jq -r '.testler[0].id')
sart "kitap: 2 test, 45 soru" "$(echo "$KITAP" | jq -c '[.test_sayisi,.toplam_soru]')" '[2,45]'
sart "ogrenci kitap tanimlayamaz (403)" "$(durum -X POST "$P/kaynak-kitaplar" -H "authorization: Bearer $O" -d '{"ad":"x","brans_kodu":"biyoloji"}')" 403
sart "ogrenci kitaplari gorur" "$(j "$P/kaynak-kitaplar" -H "authorization: Bearer $O" | jq -r '.kitaplar[0].ad')" "Biyoloji Soru Bankasi"
sart "atanmamis ogretmen baskasinin kitabini degistiremez (403)" "$(durum -X PATCH "$P/kaynak-kitaplar/$KITAP_ID" -H "authorization: Bearer $HOCA2" -d '{"ad":"ele gecirildi"}')" 403

adim "3) Ogrenci uc zorlukta kayit girer (kolay %90, orta %60 kitap testinden, zor %25 fotografli)"
kayitGovde() { # $1 zorluk $2 dogru $3 yanlis $4 bos $5 istek_id $6 ek-json
  local ek="${6:-}"; [ -n "$ek" ] || ek='{}'
  jq -nc --arg k "$KONU" --arg z "$1" --argjson d "$2" --argjson y "$3" --argjson b "$4" --arg i "$5" --argjson ek "$ek" \
    '{brans_kodu:"biyoloji",konu_id:$k,zorluk:$z,dogru:$d,yanlis:$y,bos:$b,istek_id:$i} + $ek'
}
FOTO=$(medya_hazir "$OGR_K" gunluk_soru_fotografi); kopya_bekle "$FOTO"
sart "fotograf kopyasi yokken 409" "$(durum -X POST "$P/gunluk-soru/kayitlar" -H "authorization: Bearer $O" -d "$(kayitGovde zor 5 10 5 "$(yeniUuid)" "$(jq -nc --arg f "$(yeniUuid)" '{dosya_idleri:[$f]}')")")" 409
I1=$(yeniUuid); I2=$(yeniUuid); I3=$(yeniUuid)
R1=$(j -X POST "$P/gunluk-soru/kayitlar" -H "authorization: Bearer $O" -d "$(kayitGovde kolay 18 2 0 "$I1")")
sart "kolay kayit (toplam 20)" "$(echo "$R1" | jq -r '.toplam')" 20
KAYIT1=$(echo "$R1" | jq -r '.id')
R2=$(j -X POST "$P/gunluk-soru/kayitlar" -H "authorization: Bearer $O" -d "$(kayitGovde orta 12 6 2 "$I2" "$(jq -nc --arg t "$TEST4" '{kaynak_test_id:$t}')")")
sart "orta kayit kitap testi" "$(echo "$R2" | jq -r '.kaynak_kitap_id')" "$KITAP_ID"
KAYIT2=$(echo "$R2" | jq -r '.id')
R3=$(j -X POST "$P/gunluk-soru/kayitlar" -H "authorization: Bearer $O" -d "$(kayitGovde zor 5 10 5 "$I3" "$(jq -nc --arg f "$FOTO" '{dosya_idleri:[$f]}')")")
sart "zor kayit fotografli" "$(echo "$R3" | jq -r '.dosyalar[0].medya_dosya_id')" "$FOTO"
KAYIT3=$(echo "$R3" | jq -r '.id')
sart "istek_id tekrari 200, ayni kayit" "$(durum -X POST "$P/gunluk-soru/kayitlar" -H "authorization: Bearer $O" -d "$(kayitGovde kolay 18 2 0 "$I1")")" 200
sart "tek kayit olarak kaldi" "$(sql "select count(*) from ogrenme.gunluk_soru_kayitlari where kurum_id = '$KURUM'")" 3
sart "gelecek gun 422" "$(durum -X POST "$P/gunluk-soru/kayitlar" -H "authorization: Bearer $O" -d "$(kayitGovde kolay 5 0 0 "$(yeniUuid)" "$(jq -nc --arg g "$(date -u -v+2d +%F 2>/dev/null || date -u -d '+2 days' +%F)" '{gun:$g}')")")" 422
SON=$(j "$P/gunluk-soru/son-kullanilanlar" -H "authorization: Bearer $O")
sart "son kullanilan: ders ve konu hatirlanir" "$(echo "$SON" | jq -r '.dersler[0] | .brans_kodu + ":" + .konular[0].konu_ad')" "biyoloji:Genetik"
sart "son kullanilan: kitap/test hatirlanir" "$(echo "$SON" | jq -r '.dersler[0].kaynaklar[0].kitap_ad + " / " + .dersler[0].kaynaklar[0].test_ad')" "Biyoloji Soru Bankasi / Test 4"

adim "4) Ogretmen konu analizi: bant tespiti ve oneri; ogrenci yanitinda oneri yok; baska ogretmen goremez"
A=$(j "$P/ogrenciler/$OGR_U/gunluk-soru/analiz?brans_kodu=biyoloji&donem=30" -H "authorization: Bearer $HOCA")
echo "$A" | jq -c '{konular: [.konular[] | {konu_ad, hucreler: {kolay: .hucreler.kolay.basari, orta: .hucreler.orta.basari, zor: .hucreler.zor.basari}, bant}], oneriler}'
sart "bant: orta seviyede zorlaniyor" "$(echo "$A" | jq -r '.konular[0].bant | .durum + ":" + .bant')" "zorlaniyor:orta"
sart "gorev oner: orta, 20 soru" "$(echo "$A" | jq -r '.oneriler[] | select(.tur == "gorev_oner") | .zorluk + ":" + (.soru_sayisi|tostring)')" "orta:20"
sart "ogrenci kendi analizi (200)" "$(durum "$P/gunluk-soru/analiz?brans_kodu=biyoloji" -H "authorization: Bearer $O")" 200
sart "ogrenci yanitinda oneri alani yok" "$(j "$P/gunluk-soru/analiz?brans_kodu=biyoloji" -H "authorization: Bearer $O" | jq 'has("oneriler")')" false
sart "ogrenci personel ucuna giremez (403)" "$(durum "$P/ogrenciler/$OGR_U/gunluk-soru/analiz?brans_kodu=biyoloji" -H "authorization: Bearer $O")" 403
sart "atanmamis ogretmen goremez (404)" "$(durum "$P/ogrenciler/$OGR_U/gunluk-soru/analiz?brans_kodu=biyoloji" -H "authorization: Bearer $HOCA2")" 404
sart "yonetici/sahip gorur (200)" "$(durum "$P/ogrenciler/$OGR_U/gunluk-soru/analiz?brans_kodu=biyoloji" -H "authorization: Bearer $S")" 200
sart "sinif gorunumu (200)" "$(durum "$P/gunluk-soru/sinif-analizi?grup_id=$GRUP&brans_kodu=biyoloji" -H "authorization: Bearer $HOCA")" 200
sart "sinif: en cok zorlanilan konu" "$(j "$P/gunluk-soru/sinif-analizi?grup_id=$GRUP&brans_kodu=biyoloji" -H "authorization: Bearer $HOCA" | jq -r '.en_cok_zorlanilan[0].konu_ad')" Genetik
sart "atanmamis ogretmen sinifi goremez (404)" "$(durum "$P/gunluk-soru/sinif-analizi?grup_id=$GRUP&brans_kodu=biyoloji" -H "authorization: Bearer $HOCA2")" 404
HUCRE=$(j "$P/ogrenciler/$OGR_U/gunluk-soru/analiz/hucre?brans_kodu=biyoloji&konu_id=$KONU&zorluk=zor" -H "authorization: Bearer $HOCA")
sart "hucre: zor kaydi" "$(echo "$HUCRE" | jq -r '.kayitlar | length')" 1
sart "hucre: fotograf okuma adresi" "$(echo "$HUCRE" | jq -r '.kayitlar[0].dosyalar[0].adres.asil_url')" "https://depo.test/$FOTO"
sart "hucre: ogrenci kaydi kitap adi (orta)" "$(j "$P/ogrenciler/$OGR_U/gunluk-soru/analiz/hucre?brans_kodu=biyoloji&konu_id=$KONU&zorluk=orta" -H "authorization: Bearer $HOCA" | jq -r '.kayitlar[0].kaynak_adi')" "Biyoloji Soru Bankasi · Test 4"
OZET=$(j "$P/ogrenciler/$OGR_U/gunluk-soru/haftalik-ozet" -H "authorization: Bearer $HOCA")
echo "$OZET" | jq -c '{cozulen, basari, en_zayif_konular, bant_degisimi: .bant.degisim}'
sart "haftalik ozet: cozulen 60" "$(echo "$OZET" | jq -r '.cozulen')" 60

adim "5) Oneriden gorev: haftalik plana gorev ve odev"
YARIN=$(TZ=Europe/Istanbul date -v+1d +%F 2>/dev/null || TZ=Europe/Istanbul date -d tomorrow +%F)
GV=$(j -X POST "$P/ogrenciler/$OGR_U/gunluk-soru/gorev-ver" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg k "$KONU" --arg g "$YARIN" '{tur:"plan_gorevi",brans_kodu:"biyoloji",konu_id:$k,zorluk:"orta",soru_sayisi:20,gun:$g}')")
echo "$GV" | jq -c .
GOREV_ID=$(echo "$GV" | jq -r '.gorev_id')
sart "plan yayinda" "$(echo "$GV" | jq -r '.plan_durum')" yayinda
sart "ogrenci gorevi Bugun ekraninda gorur" "$(j "$P/gorevlerim?gun=$YARIN" -H "authorization: Bearer $O" | jq -r '.gorevler[0].baslik')" "Genetik: orta seviyeden 20 soru"
OV=$(j -X POST "$P/ogrenciler/$OGR_U/gunluk-soru/gorev-ver" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg k "$KONU" '{tur:"odev",brans_kodu:"biyoloji",konu_id:$k,zorluk:"orta",soru_sayisi:20}')")
sart "odev olustu ve ogrenciye atandi" "$(j "$P/odevlerim" -H "authorization: Bearer $O" | jq -r '.odevler[0].baslik')" "Genetik: orta seviyeden 20 soru"
sart "ogrenci gorev veremez (403)" "$(durum -X POST "$P/ogrenciler/$OGR_U/gunluk-soru/gorev-ver" -H "authorization: Bearer $O" -d "$(jq -nc --arg k "$KONU" '{tur:"plan_gorevi",brans_kodu:"biyoloji",konu_id:$k,zorluk:"orta",soru_sayisi:20}')")" 403
echo "odev: $(echo "$OV" | jq -r '.odev_id')"
# Gorev baglantili kayit: gorev gerceklesen dolar
R4=$(j -X POST "$P/gunluk-soru/kayitlar" -H "authorization: Bearer $O" -d "$(kayitGovde orta 9 1 0 "$(yeniUuid)" "$(jq -nc --arg g "$GOREV_ID" '{plan_gorev_id:$g}')")")
KAYIT4=$(echo "$R4" | jq -r '.id')
sart "gorev gerceklesen 10, kismen" "$(sql "select gerceklesen_miktar || ':' || durum from ogrenme.plan_gorevleri where id = '$GOREV_ID'")" "10:kismen"

adim "6) XP motivasyonda: kayit basina 2 XP (4 kayit = 8), duzeltme etkisiz, silme ters kayit"
xp_bekle 8
sart "xp defteri: dort gunluk_soru satiri" "$(msql "select count(*) from motivasyon.xp_hareketleri where ogrenci_id = '$OGR_U' and kural_kodu = 'gunluk_soru' and xp = 2")" 4
sart "rozet sayaci toplam_cozulen_soru = 70" "$(msql "select deger::int from motivasyon.ogrenci_sayaclari where ogrenci_id = '$OGR_U' and sayac_kodu = 'toplam_cozulen_soru'")" 70
sart "duzeltme (12 dogru) 200" "$(durum -X PATCH "$P/gunluk-soru/kayitlar/$KAYIT2" -H "authorization: Bearer $O" -d '{"dogru":14}')" 200
sart "duzeltme sayaci farkla gunceller (72)" "$(for i in $(seq 1 40); do v=$(msql "select deger::int from motivasyon.ogrenci_sayaclari where ogrenci_id = '$OGR_U' and sayac_kodu = 'toplam_cozulen_soru'"); [ "$v" = 72 ] && break; sleep 0.5; done; echo "$v")" 72
sart "esigin altina (4 soru) duzeltme XP'yi geri alir" "$(durum -X PATCH "$P/gunluk-soru/kayitlar/$KAYIT4" -H "authorization: Bearer $O" -d '{"dogru":3,"yanlis":1}')" 200
xp_bekle 6
sart "silme (204)" "$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$P/gunluk-soru/kayitlar/$KAYIT1" -H "authorization: Bearer $O")" 204
xp_bekle 4
echo "defter: $(msql "select string_agg(kural_kodu || ' ' || xp || case when ters_cevrilen_id is not null then ' (ters: ' || coalesce(neden, '') || ')' else '' end, ', ' order by created_at, id) from motivasyon.xp_hareketleri where ogrenci_id = '$OGR_U' and kural_kodu = 'gunluk_soru'")"
sart "ters kayit satirlari: 2 (duzeltme + silme)" "$(msql "select count(*) from motivasyon.xp_hareketleri where ogrenci_id = '$OGR_U' and kural_kodu = 'gunluk_soru' and xp < 0")" 2
sart "silinen kayit listede yok" "$(j "$P/gunluk-soru/kayitlar" -H "authorization: Bearer $O" | jq -r --arg id "$KAYIT1" '[.kayitlar[] | select(.id == $id)] | length')" 0
sart "fotograf birakildi olayi (silinen kayit degil: zor kayit duruyor)" "$(sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.ortak.dosya.birakildi.v1'")" 0
sart "baska ogrenci/ogretmen kaydi silemez (403)" "$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$P/gunluk-soru/kayitlar/$KAYIT3" -H "authorization: Bearer $HOCA")" 403

adim "7) Olaylarda kisisel veri yok"
sart "gunluk_soru olay sayisi (4 olusturma + 2 duzeltme + 1 silme)" "$(sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.ogrenme.gunluk_soru.kaydedildi.v1'")" 7
sart "olay yukunde ad/e-posta/telefon/metin yok" "$(sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.ogrenme.gunluk_soru.kaydedildi.v1' and (payload::text ~* '(@|telefon|eposta|gorunen_ad|kaynak_metin|Ali Ogrenci|Ayse Hoca)')")" 0
echo "olay ornegi: $(sql "select payload->'data' from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.ogrenme.gunluk_soru.kaydedildi.v1' order by created_at limit 1")"
echo
echo "TAMAM: gunluk soru akisi gecti (kurum $KURUM)"
