#!/usr/bin/env bash
# Soru sor akisi: uctan uca curl senaryosu. Tekrar calistirilabilir (her calistirmada yeni kullanici/kurum;
# e-posta+parola ile girer). bash 3.2 (macOS) uyumlu.
#
# Akis: ogrenci fotografli soru sorar (medya kopyasi olay ile gelir) -> dogru ogretmene yonlenir -> kota (4. soru
# 429) -> ogretmen kuyrugu -> ses + cizimli fotograf ekli cevap (okuma adresleri sahte medyadan) -> "hala
# anlamadim" takip -> cevap -> "anladim" -> cozuldu olayi (silinecek_at dolu) -> yeniden acma -> masa senaryosu
# (iki ogretmen ayni anda cevaplar, ilk cevaplayan ustlenir) -> yonetici olcum ozeti -> outbox olay sayilari.
#
# On kosul: api (4264) VE worker (outbox relay + api.medya tuketicisi) ayri veritabaninda; NATS (4222) acik:
#   docker exec kopru-postgres-1 createdb -U postgres kopru_paket_s
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_paket_s \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_s \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_paket_s \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
#          API_PORT=4264 API_PUBLIC_URL=http://localhost:4264 API_MEDYA_URL=http://127.0.0.1:4265 \
#          NATS_URL=nats://localhost:4222
#   pnpm --filter @kopru/api db:migrate && pnpm --filter @kopru/api dev &  pnpm --filter @kopru/api dev:worker &
# Sahte medya sunucusu bu betik icinde (MEDYA_PORT, varsayilan 4265) baslar ve kapanir.
# Kullanim (repo kokunden): services/api/scripts/soru-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4264}"
MEDYA_PORT="${MEDYA_PORT:-4265}"
PG="${PG:-docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d kopru_paket_s -v ON_ERROR_STOP=1}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
API_DIZIN="$(cd "$(dirname "$0")/.." && pwd)"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
sql() { $PG -c "$1"; }

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

# --- Sahte medya: POST /ic/okuma-adresleri, servis JWT'sini api JWKS'iyle dogrular -------------------------
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
      console.log(JSON.stringify({ sub: payload.sub, aud: payload.aud, scope: payload.scope, kurum_id: g.kurum_id, dosya_sayisi: g.dosya_idleri.length }));
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

adim "1) Kurum, grup, 2 ogretmen (matematik atamasi + fizik masasi), 1 girisli ogrenci"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Soru Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"; O="$API/v1/ogrenme/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"11-A"}' | jq -r '.id')
H1_BILGI=$(davetle "$S" ogretmen "hoca1$RUN@example.com" "Ayse Hoca"); H1_UYELIK=${H1_BILGI%% *}; H1_OTURUM=${H1_BILGI##* }
H2_BILGI=$(davetle "$S" ogretmen "hoca2$RUN@example.com" "Mehmet Hoca"); H2_UYELIK=${H2_BILGI%% *}; H2_OTURUM=${H2_BILGI##* }
sart "matematik atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$H1_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
OG_BILGI=$(davetle "$S" ogrenci "ogr$RUN@example.com" "Ali Ogrenci"); OG_UYELIK=${OG_BILGI%% *}; OG_OTURUM=${OG_BILGI##* }
sart "ogrenci gruba (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OG_UYELIK" '{ogrenci_idleri:[$a]}')")" 201
H1=$(token "$H1_OTURUM" "$KURUM"); H2=$(token "$H2_OTURUM" "$KURUM"); OG=$(token "$OG_OTURUM" "$KURUM")
kullanici_id() { sql "select kullanici_id from hesap.uyelikler where id = '$1'"; }
OG_K=$(kullanici_id "$OG_UYELIK"); H1_K=$(kullanici_id "$H1_UYELIK"); H2_K=$(kullanici_id "$H2_UYELIK")
sart "fizik soru masasi (201)" "$(durum -X POST "$O/soru-masalari" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$H1_UYELIK" --arg b "$H2_UYELIK" '{brans_kodu:"fizik",ad:"Fizik masasi",ogretmen_idleri:[$a,$b]}')")" 201

# --- Medya dosyasi: medya servisi yerine `medya.dosya.hazir.v1` olayini outbox'a yazariz; worker relay NATS'a
# yayimlar, api.medya tuketicisi (uygulama rolu, RLS) kopyayi olusturur.
medya_hazir() { # $1 sahip kullanici, $2 tur, $3 (ops.) sure_sn -> dosya_id
  local id olay
  id=$(uuidgen | tr 'A-Z' 'a-z')
  olay=$(jq -nc --arg id "$(python3 -c 'import uuid,time;print(uuid.UUID(int=(int(time.time()*1000)<<80)|(7<<76)|(2<<62)|(uuid.uuid4().int&((1<<62)-1))))')" --arg k "$KURUM" --arg d "$id" --arg u "$1" --arg t "$2" --argjson s "${3:-null}" \
    '{id:$id,type:"medya.dosya.hazir",version:1,occurredAt:(now|todate),kurumId:$k,actor:{tur:"servis",id:"medya"},correlationId:"soru-akisi",data:{dosya_id:$d,sahip_kullanici_id:$u,sahip_uyelik_id:$u,tur:$t,mime_tipi:(if $t=="soru_ses" then "audio/mp4" else "image/jpeg" end),boyut_bayt:350000,genislik:800,yukseklik:600,sure_sn:$s,kucuk_resim_var:true}}')
  sql "insert into ortak.outbox (id, kurum_id, subject, payload) values ('$(echo "$olay" | jq -r .id)', '$KURUM', 'evt.medya.dosya.hazir.v1', '$olay'::jsonb)" >/dev/null
  printf '%s' "$id"
}
kopya_bekle() { local i; for i in $(seq 1 40); do [ "$(sql "select count(*) from ortak.medya_dosya_kopyalari where id = '$1'")" = "1" ] && return 0; sleep 0.5; done; echo "BASARISIZ: medya kopyasi olusmadi ($1)"; exit 1; }

adim "2) Soru: fotograf medyadan once yuklenmemisken 409 dosya_hazir_degil; olay gelince 201"
F1=$(uuidgen | tr 'A-Z' 'a-z')
GOVDE=$(jq -nc --arg f "$F1" '{brans_kodu:"matematik",baslik:"Turev sorusu",metin:"Burada takildim",fotograflar:[$f]}')
sart "kopya yokken (409)" "$(durum -X POST "$O/sorular" -H "authorization: Bearer $OG" -d "$GOVDE")" 409
echo "$(j -X POST "$O/sorular" -H "authorization: Bearer $OG" -d "$GOVDE" | jq -c .error)"
F1=$(medya_hazir "$OG_K" soru_fotografi); kopya_bekle "$F1"
echo "medya kopyasi olustu: $(sql "select tur || ' ' || durum from ortak.medya_dosya_kopyalari where id = '$F1'")"
ISTEK=$(uuidgen | tr 'A-Z' 'a-z')
GOVDE=$(jq -nc --arg f "$F1" --arg i "$ISTEK" '{brans_kodu:"matematik",baslik:"Turev sorusu",metin:"Burada takildim",fotograflar:[$f],istek_id:$i}')
R=$(j -X POST "$O/sorular" -H "authorization: Bearer $OG" -d "$GOVDE")
SORU=$(echo "$R" | jq -r .id)
sart "yonlendirme" "$(echo "$R" | jq -r .yonlendirme)" atanan_ogretmen
sart "atanan ogretmen" "$(echo "$R" | jq -r .atanan_ogretmen_id)" "$H1_UYELIK"
sart "kota gunluk kalan" "$(echo "$R" | jq -r .kota.gunluk_kalan)" 2
echo "tahmini cevap: $(echo "$R" | jq -c .tahmini_cevap)  foto adresi: $(echo "$R" | jq -r '.fotograflar[0].adres.asil_url')"
sart "ayni istek_id tekrar (200, tekrar)" "$(j -X POST "$O/sorular" -H "authorization: Bearer $OG" -d "$GOVDE" | jq -r '.tekrar')" true

adim "3) Kota: ikinci ve ucuncu soru, dorduncu 429 kota_asildi"
for i in 2 3; do
  F=$(medya_hazir "$OG_K" soru_fotografi); kopya_bekle "$F"
  sart "soru $i (201)" "$(durum -X POST "$O/sorular" -H "authorization: Bearer $OG" -d "$(jq -nc --arg f "$F" '{brans_kodu:"matematik",fotograflar:[$f]}')")" 201
done
F=$(medya_hazir "$OG_K" soru_fotografi); kopya_bekle "$F"
R4=$(j -X POST "$O/sorular" -H "authorization: Bearer $OG" -w '\n%{http_code}' -d "$(jq -nc --arg f "$F" '{brans_kodu:"matematik",fotograflar:[$f]}')")
sart "dorduncu soru (429)" "$(echo "$R4" | tail -n1)" 429
echo "$(echo "$R4" | sed '$d' | jq -c '{kod:.error.code,kalan:.error.details.kota.gunluk_kalan,sifirlanma:.error.details.kota.gunluk_sifirlanma_at}')"
echo "kota ucu: $(j "$O/soru-kotam" -H "authorization: Bearer $OG" | jq -c '{kullanilan:.gunluk_kullanilan,kalan:.gunluk_kalan}')"

adim "4) Ogretmen kuyrugu ve ses + cizimli fotograf ekli cevap"
echo "kuyruk sayisi: $(j "$O/gelen-sorular/sayi" -H "authorization: Bearer $H1" | jq -c .)"
sart "baska ogretmenin kuyrugu bos (hoca2)" "$(j "$O/gelen-sorular" -H "authorization: Bearer $H2" | jq '.sorular | length')" 0
SES=$(medya_hazir "$H1_K" soru_ses 95); CIZIM=$(medya_hazir "$H1_K" soru_cizim); kopya_bekle "$SES"; kopya_bekle "$CIZIM"
CEVAP=$(jq -nc --arg s "$SES" --arg c "$CIZIM" --arg f "$F1" '{metin:"Once turev al, sonra sifira esitle",ekler:[{tur:"ses",medya_dosya_id:$s},{tur:"cizimli_fotograf",medya_dosya_id:$c,kaynak_dosya_id:$f,cizim_verisi:{cizgiler:[[0,0,10,10]]}}]}')
R=$(j -X POST "$O/sorular/$SORU/cevap" -H "authorization: Bearer $H1" -d "$CEVAP")
sart "soru durumu" "$(echo "$R" | jq -r .durum)" cevaplandi
echo "cevap ekleri: $(echo "$R" | jq -c '[.mesajlar[-1].ekler[] | {tur,sure_sn,adres:.adres.asil_url}]')"
sart "adres_alinamadi" "$(echo "$R" | jq -r .adres_alinamadi)" false
echo "sahte medya istekleri (servis JWT dogrulandi):"; sed 's/^/  /' "$SAHTE_LOG"

adim "5) Ogrenci: hala anlamadim (takip) -> ogretmen cevap -> anladim -> cozuldu -> yeniden acma"
sart "takip (200)" "$(j -X POST "$O/sorular/$SORU/takip" -H "authorization: Bearer $OG" -d '{"metin":"Hala anlamadim, 2. adimi gosterir misiniz?"}' | jq -r .durum)" takip_bekliyor
sart "kota takipten etkilenmedi" "$(j "$O/soru-kotam" -H "authorization: Bearer $OG" | jq -r .gunluk_kullanilan)" 3
sart "cevap (derste konusalim)" "$(j -X POST "$O/sorular/$SORU/cevap" -H "authorization: Bearer $H1" -d '{"derste_konusalim":true}' | jq -r .durum)" cevaplandi
R=$(j -X POST "$O/sorular/$SORU/anladim" -H "authorization: Bearer $OG" -d '{}')
sart "anladim -> cozuldu" "$(echo "$R" | jq -r .durum)" cozuldu
echo "foto_silinme_at: $(echo "$R" | jq -r .foto_silinme_at)"
echo "cozuldu olayi: $(sql "select (payload->'data') - 'ogrenci_id'::text from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.ogrenme.soru.cozuldu.v1'")"
R=$(j -X POST "$O/sorular/$SORU/takip" -H "authorization: Bearer $OG" -d '{"metin":"Aslinda anlamamisim"}')
sart "yeniden acma" "$(echo "$R" | jq -r .durum)" takip_bekliyor
sart "foto_silinme_at temizlendi" "$(echo "$R" | jq -r .foto_silinme_at)" null

adim "6) Masa: iki ogretmen ayni anda cevaplar; ilk cevaplayan ustlenir, digeri 409 masa_ustlenildi"
FF=$(medya_hazir "$OG_K" soru_fotografi); kopya_bekle "$FF"
# Kota doldu: kurum ayariyla gunluk limit 10 (yonetim ucu).
sart "kota ayari (200)" "$(durum -X PUT "$O/soru-ayarlari" -H "authorization: Bearer $S" -d '{"gunluk_soru_limiti":10}')" 200
R=$(j -X POST "$O/sorular" -H "authorization: Bearer $OG" -d "$(jq -nc --arg f "$FF" '{brans_kodu:"fizik",baslik:"Hareket",fotograflar:[$f]}')")
MASA_SORU=$(echo "$R" | jq -r .id)
sart "masaya yonlendi" "$(echo "$R" | jq -r .yonlendirme)" masa
D1=$(mktemp); D2=$(mktemp)
( curl -sS -o /dev/null -w '%{http_code}' -X POST "$O/sorular/$MASA_SORU/cevap" -H 'content-type: application/json' -H "authorization: Bearer $H1" -d '{"metin":"ben"}' >"$D1" ) &
( curl -sS -o /dev/null -w '%{http_code}' -X POST "$O/sorular/$MASA_SORU/cevap" -H 'content-type: application/json' -H "authorization: Bearer $H2" -d '{"metin":"ben de"}' >"$D2" ) &
wait
echo "iki ogretmenin sonucu: $(cat "$D1") ve $(cat "$D2")"
sart "biri 200 digeri 409" "$(printf '%s\n%s\n' "$(cat "$D1")" "$(cat "$D2")" | sort | tr '\n' ' ')" "200 409 "
echo "ustlenen: $(j "$O/sorular/$MASA_SORU" -H "authorization: Bearer $S" | jq -r .ustlenen_id)  (hoca1=$H1_UYELIK hoca2=$H2_UYELIK)"

adim "7) Yonetici: tum yazismalar ve olcum ozeti"
echo "yonetim listesi: $(j "$O/yonetim/sorular" -H "authorization: Bearer $S" | jq '.sorular | length') soru"
echo "olcum: $(j "$O/soru-olcum" -H "authorization: Bearer $S" | jq -c '{soru_sayisi,cevaplanan,anladim,anladim_orani,ortalama_ilk_cevap_sn,ogretmenler:(.ogretmenler|length),branslar:[.branslar[]|{brans_kodu,soru_sayisi}]}')"
sart "ogrenci yonetim ucuna giremez (403)" "$(durum "$O/yonetim/sorular" -H "authorization: Bearer $OG")" 403

adim "8) Outbox olay sayilari (kurum $KURUM)"
sql "select subject, count(*) from ortak.outbox where kurum_id = '$KURUM' group by subject order by subject"
echo "kopyalar: $(sql "select count(*) from ortak.medya_dosya_kopyalari where kurum_id = '$KURUM'")"
echo; echo "TAMAM: soru sor akisi"
