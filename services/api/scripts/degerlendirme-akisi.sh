#!/usr/bin/env bash
# Ogretmen degerlendirmesi, onerilen kaynak ve kocluk gorunumu akisi: uctan uca curl senaryosu (gercek api + api
# worker + bildirim + bildirim worker + NATS). Tekrar calistirilabilir (her calistirmada yeni kurum/kullanici;
# e-posta+parola ile girer). bash 3.2 (macOS) uyumlu. Gereken: curl, jq, docker, python3, uuidgen.
#
# Akis: kurum, grup, iki ogretmen (biyoloji, fizik; ikisi de gruba atanmis), ucuncu ILGISIZ ogretmen, ogrenci ->
# iki ogretmen ayni ogrenciye degerlendirme yazar (biri ogrenci gorsun, digeri gizli), biri kaynak onerir ->
# ogrenci YALNIZ gorunur olani ve oneriyi gorur (gizli yorum hicbir uctan gelmez), bildirim kutusunda 2 bildirim
# (genel metin, yorum yok) -> ogrenci oneriyi gunluk kayitta kullanir -> kocluk gorunumunde "basladi" -> ilgisiz
# ogretmen 404 -> geri cekme (ogrenci artik gormez, baska ogretmen 403) -> hatirlatma -> outbox'ta yorum metni yok.
#
# On kosul (repo kokunden; AYRI NATS 4257; portlar 41860-41869; Postgres 5433):
#   docker run -d --name kopru-nats-e1 -p 4257:4222 nats:2 -js
#   docker exec kopru-postgres-1 createdb -U postgres kopru_e1_api ; docker exec kopru-postgres-1 createdb -U postgres kopru_e1_bil
#   export NATS_URL=nats://localhost:4257
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_e1_api \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_e1_api \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_e1_api \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
#          API_PORT=41860 API_PUBLIC_URL=http://localhost:41860
#   pnpm --filter @kopru/api db:migrate
#   (cd services/api && npx tsx src/main.ts > /tmp/e1-api.log 2>&1 &) ; (cd services/api && npx tsx src/worker.ts > /tmp/e1-api-worker.log 2>&1 &)
#   export BILDIRIM_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_e1_bil \
#          BILDIRIM_APP_PASSWORD=bildirim_app BILDIRIM_SISTEM_PASSWORD=bildirim_sistem
#   pnpm --filter @kopru/bildirim db:migrate
#   export BILDIRIM_DATABASE_URL=postgres://bildirim_app:bildirim_app@localhost:5433/kopru_e1_bil \
#          BILDIRIM_DATABASE_SISTEM_URL=postgres://bildirim_sistem:bildirim_sistem@localhost:5433/kopru_e1_bil \
#          BILDIRIM_PORT=41862 BILDIRIM_AUTH_ENABLED=true JWKS_URL=http://localhost:41860/.well-known/jwks.json \
#          JWT_ISSUER=http://localhost:41860 BILDIRIM_PUSH_SAGLAYICI=log
#   (cd services/bildirim && npx tsx src/main.ts > /tmp/e1-bil.log 2>&1 &) ; (cd services/bildirim && npx tsx src/worker.ts > /tmp/e1-bil-worker.log 2>&1 &)
# Not: betik her kosuda 5+ hesap acar; auth uclarinin IP hiz siniri kisa surede tekrar kosuyu 401'e dusurebilir
# (yerelde api'yi `RATE_LIMIT_MAX=100000` ile baslatin ya da bekleyin).
# Kullanim (repo kokunden): services/api/scripts/degerlendirme-akisi.sh
set -euo pipefail

API="${API:-http://localhost:41860}"
BIL="${BIL:-http://localhost:41862}"
API_DB="${API_DB:-kopru_e1_api}"
BIL_DB="${BIL_DB:-kopru_e1_bil}"
PG="${PG:-docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d $API_DB -v ON_ERROR_STOP=1}"
BPG="${BPG:-docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d $BIL_DB -v ON_ERROR_STOP=1}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
GIZLI_YORUM="GIZLI-YORUM-$RUN"
GORUNUR_YORUM="Gorunur yorum $RUN: derslere duzenli katiliyor."

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
sql() { $PG -c "$1"; }
bsql() { $BPG -c "$1"; }
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
bekle() { # $1 aciklama, $2 sorgu (bildirim db), $3 beklenen
  local i x
  for i in $(seq 1 80); do x=$(bsql "$2" | tr -d '[:space:]'); [ "$x" = "$3" ] && { echo "ok: $1 -> $x"; return 0; }; sleep 0.5; done
  echo "BASARISIZ: $1 (beklenen $3, son: ${x:-yok})"; exit 1
}

adim "1) Kurum, grup, iki atanmis ogretmen (biyoloji, fizik), ilgisiz ogretmen, ogrenci, konu, kaynak kitap"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Degerlendirme Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"; P="$API/v1/ogrenme/kurumlar/$KURUM"; B="$BIL/v1/bildirim/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"12-A"}' | jq -r '.id')
HA_B=$(davetle "$S" ogretmen "hocaa$RUN@example.com" "Ayse Hoca"); HA_U=${HA_B%% *}; HA_O=${HA_B##* }
HB_B=$(davetle "$S" ogretmen "hocab$RUN@example.com" "Mehmet Hoca"); HB_U=${HB_B%% *}; HB_O=${HB_B##* }
HC_B=$(davetle "$S" ogretmen "hocac$RUN@example.com" "Ilgisiz Hoca"); HC_O=${HC_B##* }
sart "hoca A biyoloji atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HA_U" '{ogretmen_id:$o,brans_kodu:"biyoloji"}')")" 201
sart "hoca B fizik atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HB_U" '{ogretmen_id:$o,brans_kodu:"fizik"}')")" 201
OGR_B=$(davetle "$S" ogrenci "ogr$RUN@example.com" "Ali Ogrenci"); OGR_U=${OGR_B%% *}; OGR_O=${OGR_B##* }
sart "ogrenci gruba (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OGR_U" '{ogrenci_idleri:[$a]}')")" 201
HA=$(token "$HA_O" "$KURUM"); HB=$(token "$HB_O" "$KURUM"); HC=$(token "$HC_O" "$KURUM"); O=$(token "$OGR_O" "$KURUM")
UNITE=$(yeniUuid); KONU=$(yeniUuid)
sql "insert into ogrenme.konular (id, kurum_id, brans_kodu, ust_id, seviye, ad) values ('$UNITE', '$KURUM', 'biyoloji', null, 'unite', 'Kalitim'), ('$KONU', '$KURUM', 'biyoloji', '$UNITE', 'konu', 'Genetik')" >/dev/null
KITAP=$(j -X POST "$P/kaynak-kitaplar" -H "authorization: Bearer $HA" -d '{"ad":"Biyoloji Soru Bankasi","brans_kodu":"biyoloji","testler":[{"ad":"Test 4","soru_sayisi":20},{"ad":"Test 5","soru_sayisi":25}]}')
KITAP_ID=$(echo "$KITAP" | jq -r '.id'); TEST4=$(echo "$KITAP" | jq -r '.testler[0].id')
echo "kurum: $KURUM  ogrenci(uyelik): $OGR_U  kitap: $KITAP_ID"
sart "bildirim /ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$BIL/ready")" 200

adim "2) Iki ogretmen ayni ogrenciye degerlendirme yazar (biri gizli, biri ogrenci gorsun); biri kaynak onerir"
BU_HAFTA=$(python3 -c 'import datetime as d;t=d.datetime.now(d.timezone(d.timedelta(hours=3))).date();print(t-d.timedelta(days=t.weekday()))')
DEGER_URL="$P/ogrenciler/$OGR_U/degerlendirmeler"
govde() { jq -nc --arg b "$BU_HAFTA" --arg y "$1" --argjson g "$2" --argjson c "$3" '{donem_baslangic:$b,calisma_duzeni:$c,derse_katilim:4,yorum:$y,ogrenci_gorur:$g}'; }
DA=$(j -X POST "$DEGER_URL" -H "authorization: Bearer $HA" -d "$(govde "$GIZLI_YORUM" false 3)")
DB=$(j -X POST "$DEGER_URL" -H "authorization: Bearer $HB" -d "$(govde "$GORUNUR_YORUM" true 5)")
DA_ID=$(echo "$DA" | jq -r '.id'); DB_ID=$(echo "$DB" | jq -r '.id')
sart "hoca A degerlendirmesi: ogrenci gormez (varsayilan)" "$(echo "$DA" | jq -r '.ogrenci_gorur')" false
sart "hoca B degerlendirmesi: ogrenci gorur" "$(echo "$DB" | jq -r '.ogrenci_gorur')" true
sart "olcek 1-5 disi 400" "$(durum -X POST "$DEGER_URL" -H "authorization: Bearer $HA" -d "$(govde x false 6)")" 400
sart "gelecek donem 422" "$(durum -X POST "$DEGER_URL" -H "authorization: Bearer $HA" -d "$(jq -nc --arg b "$(python3 -c 'import datetime as d;print(d.date.today()+d.timedelta(days=9))')" '{donem_baslangic:$b,calisma_duzeni:3}')")" 422
sart "ogretmenler birbirinin degerlendirmesini gorur" "$(j "$DEGER_URL" -H "authorization: Bearer $HA" | jq -r '.degerlendirmeler | length')" 2
sart "yazar olmayan duzenleyemez (403)" "$(durum -X PATCH "$P/degerlendirmeler/$DB_ID" -H "authorization: Bearer $HA" -d '{"yorum":"ele gecirildi"}')" 403
sart "yazar duzenler (200)" "$(durum -X PATCH "$P/degerlendirmeler/$DA_ID" -H "authorization: Bearer $HA" -d '{"calisma_duzeni":2}')" 200
ONERI=$(j -X POST "$P/ogrenciler/$OGR_U/kaynak-onerileri" -H "authorization: Bearer $HA" -d "$(jq -nc --arg t "$TEST4" --arg k "$KONU" '{tur:"kaynak_kitap_testi",kaynak_test_id:$t,konu_id:$k,not:"Genetik icin once bunu coz"}')")
ONERI_ID=$(echo "$ONERI" | jq -r '.id')
sart "oneri: kitap adi ve henuz baslamadi" "$(echo "$ONERI" | jq -r '.kaynak_kitap_ad + ":" + (.basladi|tostring)')" "Biyoloji Soru Bankasi:false"
sart "link onerisi: javascript: reddedilir (400)" "$(durum -X POST "$P/ogrenciler/$OGR_U/kaynak-onerileri" -H "authorization: Bearer $HB" -d '{"tur":"link","baglanti_url":"javascript:alert(1)","baslik":"x"}')" 400
LINK=$(j -X POST "$P/ogrenciler/$OGR_U/kaynak-onerileri" -H "authorization: Bearer $HB" -d '{"tur":"link","baglanti_url":"https://ornek.com/fizik","baslik":"Fizik video","brans_kodu":"fizik"}')
sart "link onerisi: baslama olculemez (null)" "$(echo "$LINK" | jq -r '.basladi')" null

adim "3) Ogrenci YALNIZ gorunur degerlendirmeyi ve oneriyi gorur; bildirim kutusunda genel metin"
OD=$(j "$P/degerlendirmelerim" -H "authorization: Bearer $O")
sart "ogrenci 1 degerlendirme gorur" "$(echo "$OD" | jq -r '.degerlendirmeler | length')" 1
sart "gorunen yorum hoca B'nin" "$(echo "$OD" | jq -r '.degerlendirmeler[0].yorum')" "$GORUNUR_YORUM"
sart "yanitta gizli yorum yok" "$(echo "$OD" | grep -c "$GIZLI_YORUM" || true)" 0
sart "yanitta gorunurluk bayragi/yazar kimligi yok" "$(echo "$OD" | jq '.degerlendirmeler[0] | has("ogrenci_gorur") or has("yazar_id")')" false
for yol in "ogrenciler/$OGR_U/degerlendirmeler" "ogrenciler/$OGR_U/degerlendirmeler?geri_cekilenler=true" "ogrenciler/$OGR_U/kocluk" "ogrenciler/$OGR_U/kaynak-onerileri" "degerlendirme-hatirlatma"; do
  sart "ogrenci personel ucu 403: $yol" "$(durum "$P/$yol" -H "authorization: Bearer $O")" 403
done
sart "ogrenci geri cekemez (403)" "$(durum -X POST "$P/degerlendirmeler/$DB_ID/geri-cek" -H "authorization: Bearer $O" -d '{}')" 403
sart "ogrenci yazamaz (403)" "$(durum -X POST "$DEGER_URL" -H "authorization: Bearer $O" -d "$(govde x true 3)")" 403
sart "ogrenci tum yanitlarda gizli yorumu goremez (veritabaninda RESTRICTIVE RLS dahil)" "$( (j "$P/degerlendirmelerim?limit=100" -H "authorization: Bearer $O"; j "$P/kaynak-onerilerim" -H "authorization: Bearer $O") | grep -c "$GIZLI_YORUM" || true)" 0
OO=$(j "$P/kaynak-onerilerim" -H "authorization: Bearer $O")
sart "ogrenci 2 oneri gorur" "$(echo "$OO" | jq -r '.oneriler | length')" 2
bekle "degerlendirme bildirimi (yalniz gorunur olan icin 1)" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and alici_id = '$OGR_U' and sablon_kodu = 'degerlendirme_yayimlandi'" 1
bekle "oneri bildirimleri (2)" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and alici_id = '$OGR_U' and sablon_kodu = 'kaynak_onerisi_eklendi'" 2
KUTU=$(j "$B/kutu" -H "authorization: Bearer $O")
echo "$KUTU" | jq -c '[.ogeler[] | {baslik, govde, derin_baglanti}]'
sart "kutuda 3 bildirim" "$(echo "$KUTU" | jq -r '.ogeler | length')" 3
sart "kutu metni genel (yorum/ad yok)" "$(echo "$KUTU" | jq -r '.ogeler[].govde' | grep -c -E "$GORUNUR_YORUM|$GIZLI_YORUM|Hoca|Genetik icin" || true)" 0
sart "degerlendirme bildirimi metni" "$(echo "$KUTU" | jq -r '.ogeler[] | select(.baslik == "Yeni değerlendirme") | .govde')" "Öğretmeninden yeni bir değerlendirme."
sart "push gonderimi yok (yalniz kutu)" "$(bsql "select count(*) from bildirim.gonderimler g join bildirim.bildirimler b on b.id = g.bildirim_id where b.kurum_id = '$KURUM' and b.sablon_kodu in ('degerlendirme_yayimlandi','kaynak_onerisi_eklendi')" | tr -d '[:space:]')" 0
sart "gizli degerlendirme icin bildirim uretilmedi (hoca A yazdi, toplam 1)" "$(bsql "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'degerlendirme_yayimlandi'" | tr -d '[:space:]')" 1

adim "4) Ogrenci oneriyi gunluk kayitta kullanir -> kocluk gorunumunde 'basladi'"
R=$(j -X POST "$P/gunluk-soru/kayitlar" -H "authorization: Bearer $O" -d "$(jq -nc --arg k "$KONU" --arg t "$TEST4" '{brans_kodu:"biyoloji",konu_id:$k,zorluk:"orta",dogru:12,yanlis:6,bos:2,kaynak_test_id:$t}')")
sart "gunluk kayit olustu (toplam 20)" "$(echo "$R" | jq -r '.toplam')" 20
KC=$(j "$P/ogrenciler/$OGR_U/kocluk" -H "authorization: Bearer $HB")
echo "$KC" | jq -c '{degerlendirme: (.degerlendirmeler.degerlendirmeler|length), ortalama_bu_hafta: .olcek_ortalamalari.haftalar[3], kitaplar: .kullanilan_kaynaklar.kitaplar, oneriler: [.oneriler[] | {tur, basladi}], konu_analizi_toplam: .konu_analizi.toplam, plan_odev}'
sart "kocluk: iki ogretmenin degerlendirmesi, gizli olan personelde var" "$(echo "$KC" | jq -r '.degerlendirmeler.degerlendirmeler | map(.ogrenci_gorur) | sort | tostring')" '[false,true]'
sart "kocluk: bu hafta ortalama calisma duzeni (2 ve 5 -> 3.5)" "$(echo "$KC" | jq -r '.olcek_ortalamalari.haftalar[3].calisma_duzeni')" 3.5
sart "kocluk: kitap ilerlemesi 1/2 test" "$(echo "$KC" | jq -r '.kullanilan_kaynaklar.kitaplar[0] | (.cozulen_test|tostring) + "/" + (.toplam_test|tostring)')" "1/2"
sart "kocluk: kitap testi onerisi BASLADI" "$(echo "$KC" | jq -r '.oneriler[] | select(.tur == "kaynak_kitap_testi") | .basladi')" true
sart "kocluk: link onerisi olculemez" "$(echo "$KC" | jq -r '.oneriler[] | select(.tur == "link") | .basladi')" null
sart "kocluk: konu analizi 20 soru" "$(echo "$KC" | jq -r '.konu_analizi.toplam.cozulen')" 20
sart "kocluk: sahip gorur (200)" "$(durum "$P/ogrenciler/$OGR_U/kocluk" -H "authorization: Bearer $S")" 200
SURE=$(curl -sS -o /dev/null -w '%{time_total}' "$P/ogrenciler/$OGR_U/kocluk" -H "authorization: Bearer $HB")
echo "kocluk yanit suresi: ${SURE}s"
sart "kocluk 2 sn altinda" "$(python3 -c "print('evet' if $SURE < 2 else 'hayir')")" evet
sart "ogrencinin kendi oneri durumu: basladi" "$(j "$P/kaynak-onerilerim" -H "authorization: Bearer $O" | jq -r '.oneriler[] | select(.tur == "kaynak_kitap_testi") | .basladi')" true

adim "5) Ilgisiz (ucuncu) ogretmen: hicbir uctan ogrenciyi goremez (404)"
for yol in "ogrenciler/$OGR_U/kocluk" "ogrenciler/$OGR_U/degerlendirmeler" "ogrenciler/$OGR_U/kaynak-onerileri"; do
  sart "ilgisiz ogretmen 404: $yol" "$(durum "$P/$yol" -H "authorization: Bearer $HC")" 404
done
sart "ilgisiz ogretmen yazamaz (404)" "$(durum -X POST "$DEGER_URL" -H "authorization: Bearer $HC" -d "$(govde x true 3)")" 404
sart "ilgisiz ogretmen oneremez (404)" "$(durum -X POST "$P/ogrenciler/$OGR_U/kaynak-onerileri" -H "authorization: Bearer $HC" -d '{"tur":"serbest","baslik":"x"}')" 404
sart "ilgisiz ogretmen baskasinin degerlendirmesini duzenleyemez/geri cekemez (404)" "$(durum -X POST "$P/degerlendirmeler/$DB_ID/geri-cek" -H "authorization: Bearer $HC" -d '{}')" 404
HAT=$(j "$P/degerlendirme-hatirlatma" -H "authorization: Bearer $HC")
sart "ilgisiz ogretmenin hatirlatma listesi bos" "$(echo "$HAT" | jq -r '.eksik_sayisi')" 0

adim "6) Hatirlatma ve geri cekme"
sart "hoca A bu hafta yazdi: hatirlatmada ogrenci yok" "$(j "$P/degerlendirme-hatirlatma" -H "authorization: Bearer $HA" | jq -r '.eksik_sayisi')" 0
SON=$(j -X POST "$P/degerlendirmeler/$DA_ID/geri-cek" -H "authorization: Bearer $HA" -d '{}')
sart "hoca A kendi degerlendirmesini geri cekti" "$(echo "$SON" | jq -r '.geri_cekildi_at != null')" true
sart "geri cekince hoca A icin yeniden hatirlatma (1 ogrenci)" "$(j "$P/degerlendirme-hatirlatma" -H "authorization: Bearer $HA" | jq -r '.eksik_sayisi')" 1
sart "hoca A baskasinin degerlendirmesini geri cekemez (403)" "$(durum -X POST "$P/degerlendirmeler/$DB_ID/geri-cek" -H "authorization: Bearer $HA" -d '{}')" 403
sart "geri cekilmis kayit duzenlenemez (409)" "$(durum -X PATCH "$P/degerlendirmeler/$DA_ID" -H "authorization: Bearer $HA" -d '{"yorum":"y"}')" 409
sart "tekrar geri cekme idempotent (200)" "$(durum -X POST "$P/degerlendirmeler/$DA_ID/geri-cek" -H "authorization: Bearer $HA" -d '{}')" 200
sart "geri cekilen listeden kalkti" "$(j "$DEGER_URL" -H "authorization: Bearer $HB" | jq -r '.degerlendirmeler | length')" 1
sart "geri cekilenler istenirse gorunur" "$(j "$DEGER_URL?geri_cekilenler=true" -H "authorization: Bearer $HB" | jq -r '.degerlendirmeler | length')" 2
sart "satir silinmedi (geri cekme silme degil)" "$(sql "select count(*) from ogrenme.ogretmen_degerlendirmeleri where id = '$DA_ID'")" 1
sart "sahip hoca B'nin degerlendirmesini geri cekebilir (200)" "$(durum -X POST "$P/degerlendirmeler/$DB_ID/geri-cek" -H "authorization: Bearer $S" -d '{}')" 200
sart "ogrenci artik hicbir degerlendirme gormez" "$(j "$P/degerlendirmelerim" -H "authorization: Bearer $O" | jq -r '.degerlendirmeler | length')" 0
sart "oneren oneriyi geri ceker (200)" "$(durum -X POST "$P/kaynak-onerileri/$ONERI_ID/geri-cek" -H "authorization: Bearer $HA" -d '{}')" 200
sart "ogrenci geri cekilen oneriyi gormez" "$(j "$P/kaynak-onerilerim" -H "authorization: Bearer $O" | jq -r '.oneriler | length')" 1
sart "baska ogretmen oneriyi geri cekemez (403)" "$(durum -X POST "$P/kaynak-onerileri/$(echo "$LINK" | jq -r .id)/geri-cek" -H "authorization: Bearer $HA" -d '{}')" 403

adim "7) Outbox olaylarinda yorum metni, baslik, baglanti, not ve ad yok"
sart "degerlendirme olayi: 1 (yalniz gorunur)" "$(sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.ogrenme.degerlendirme.yayimlandi.v1'")" 1
sart "oneri olaylari: 2" "$(sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.ogrenme.kaynak_onerisi.eklendi.v1'")" 2
sart "olay yuklerinde kisisel/serbest metin yok" "$(sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject like 'evt.ogrenme.%' and subject not like 'evt.ogrenme.gunluk_soru%' and (payload::text like '%$RUN%' or payload::text like '%Hoca%' or payload::text like '%ornek.com%' or payload::text like '%Genetik%')")" 0

echo
echo "TUM ADIMLAR GECTI"
