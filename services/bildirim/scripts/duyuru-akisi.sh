#!/usr/bin/env bash
# duyuru akisi: uctan uca curl senaryosu (gercek api + bildirim API + iki worker + AYRI NATS).
#
# Akis: kurum + iki grup (11-A, 11-B) + ogretmen (yalniz 11-A atamali) + ogrenciler (api; hesap olaylari bildirim
# kopyalarina gelir) -> ogretmen 11-A'ya duyuru yayinlar -> 11-A ogrencilerinin kutusunda ve duyurularinda gorunur,
# push log'da (genel metin, baslik yok), 11-B ogrencisi gormez -> okundu -> sayac (tekrar okuma artirmaz) ->
# okuyanlar -> ogretmen 11-B'ye yazamaz (403) -> 11-A'ya yeni katilan ogrenci duyuruyu gorur (push'suz) ->
# yonetici kurum duyurusu -> arsiv kutudan kaldirir.
#
# bash 3.2 (macOS) uyumlu. Gereken: curl, jq, docker, pnpm, python3, uuidgen.
#
# On kosul (repo kokunden; portlar bu betigin varsayilanlari; Postgres 5433; AYRI NATS: tuketici adlari sabittir):
#   docker run -d --name b3-nats -p 4832:4222 nats:2 -js
#   P='docker exec kopru-postgres-1 psql -U postgres'
#   $P -c 'create database kopru_api_b3 owner api' ; $P -c 'create database kopru_bildirim_b3'
#   export NATS_URL=nats://localhost:4832
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_api_b3 \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_api_b3 \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_api_b3 \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
#          API_PORT=4881 API_PUBLIC_URL=http://localhost:4881 API_MEDYA_URL=http://127.0.0.1:4889
#   pnpm --filter @kopru/api db:migrate
#   (pnpm --filter @kopru/api dev > /tmp/api4881.log 2>&1 &) ; (pnpm --filter @kopru/api dev:worker > /tmp/api-worker-b3.log 2>&1 &)
#   export BILDIRIM_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_bildirim_b3 \
#          BILDIRIM_APP_PASSWORD=bildirim_app BILDIRIM_SISTEM_PASSWORD=bildirim_sistem
#   pnpm --filter @kopru/bildirim db:migrate
#   export BILDIRIM_DATABASE_URL=postgres://bildirim_app:bildirim_app@localhost:5433/kopru_bildirim_b3 \
#          BILDIRIM_DATABASE_SISTEM_URL=postgres://bildirim_sistem:bildirim_sistem@localhost:5433/kopru_bildirim_b3 \
#          BILDIRIM_PORT=4882 BILDIRIM_AUTH_ENABLED=true JWKS_URL=http://localhost:4881/.well-known/jwks.json \
#          JWT_ISSUER=http://localhost:4881 BILDIRIM_PUSH_SAGLAYICI=log
#   (pnpm --filter @kopru/bildirim dev > /tmp/bildirim4882.log 2>&1 &)
#   (pnpm --filter @kopru/bildirim dev:worker > /tmp/bildirim-worker-b3.log 2>&1 &)
# Kullanim (repo kokunden, ayni ortam degiskenleriyle): services/bildirim/scripts/duyuru-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4881}"
BIL="${BIL:-http://localhost:4882}"
API_DB="${API_DB:-kopru_api_b3}"
BIL_DB="${BIL_DB:-kopru_bildirim_b3}"
WORKER_LOG="${WORKER_LOG:-/tmp/bildirim-worker-b3.log}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
bsql() { docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d "$BIL_DB" -v ON_ERROR_STOP=1 -c "$1"; }
bekle() { # $1 aciklama, $2 sql (bildirim DB), $3 beklenen deger
  local i v
  for i in $(seq 1 90); do v=$(bsql "$2"); if [ "$v" = "$3" ]; then echo "ok: $1 -> $v"; return 0; fi; sleep 0.5; done
  echo "BASARISIZ: $1 -> '$v' (beklenen $3); sql: $2"; exit 1
}

# Kayit ucu dakikada 5 istekle sinirlidir (429): sinira takilinca sonraki dakikaya kadar bekleyip yeniden dener.
kayit() {
  local i o
  for i in 1 2 3 4 5 6; do
    o=$(j -X POST "$API/auth/eposta/kayit" -d "$(jq -nc --arg e "$1" --arg p "$PAROLA" --arg a "$2" '{eposta:$e,parola:$p,gorunen_ad:$a}')" | jq -r '.oturum_belirteci // empty')
    if [ -n "$o" ]; then printf '%s' "$o"; return 0; fi
    sleep 15
  done
  echo "BASARISIZ: kayit ($1)" >&2; exit 1
}
token() { j -X POST "$API/auth/token" -H "authorization: Bearer $1" -d "$(jq -nc --arg k "${2:-}" 'if $k == "" then {} else {kurum_id:$k} end')" | jq -r '.access_token'; }
riza() { local id; for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null; done; }
davetle() { # $1 sahip token, $2 rol, $3 eposta, $4 ad -> "uyelik_id oturum"
  local belirtec oturum ilk
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')" | jq -r '.belirtec')
  oturum=$(kayit "$3" "$4"); ilk=$(token "$oturum"); riza "$ilk"
  j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg b "$belirtec" '{belirtec:$b}')" | jq -r '.uyelik_id' | tr -d '\n'
  printf ' %s' "$oturum"
}
D() { echo "$BIL/v1/bildirim/kurumlar/$KURUM/duyurular$1"; }
kutu() { j "$BIL/v1/bildirim/kurumlar/$KURUM/kutu$2" -H "authorization: Bearer $1"; }
cihaz() { # $1 ogrenci token -> cihaz kaydi + sessiz saat kapali
  local c="cihaz-$RUN-$2"
  durum -X PUT "$BIL/v1/bildirim/cihazlar" -H "authorization: Bearer $1" -d "$(jq -nc --arg c "$c" --arg b "ExponentPushToken[duyuru-$RUN-$2]" '{platform:"ios",push_belirteci:$b,cihaz_kimligi:$c}')" >/dev/null
  durum -X PUT "$BIL/v1/bildirim/kurumlar/$KURUM/ayarlar" -H "authorization: Bearer $1" -d '{"sessiz_gunler":[]}' >/dev/null
}

adim "0) Servisler"
sart "bildirim /ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$BIL/ready")" 200
sart "api /ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$API/ready")" 200

adim "1) Kurum, 11-A ve 11-B, ogretmen (yalniz 11-A atamali), uc ogrenci (A, A, B) -> hesap olaylari kopyalara"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Duyuru Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"
GA=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"11-A"}' | jq -r '.id')
GB=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"11-B"}' | jq -r '.id')
HOCA_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca"); HOCA_UYELIK=${HOCA_BILGI%% *}; HOCA_OTURUM=${HOCA_BILGI##* }
sart "11-A atamasi (201)" "$(durum -X POST "$H/gruplar/$GA/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
ogrenci() { # $1 sira, $2 grup -> "uyelik oturum"
  local b u; b=$(davetle "$S" ogrenci "ogr$1-$RUN@example.com" "Ogrenci $1"); u=${b%% *}
  durum -X POST "$H/gruplar/$2/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$u" '{ogrenci_idleri:[$a]}')" >/dev/null
  printf '%s' "$b"
}
O1_B=$(ogrenci 1 "$GA"); O1_U=${O1_B%% *}; O1=$(token "${O1_B##* }" "$KURUM")
O2_B=$(ogrenci 2 "$GA"); O2_U=${O2_B%% *}; O2=$(token "${O2_B##* }" "$KURUM")
O3_B=$(ogrenci 3 "$GB"); O3_U=${O3_B%% *}; O3=$(token "${O3_B##* }" "$KURUM")
HOCA=$(token "$HOCA_OTURUM" "$KURUM")
echo "kurum: $KURUM  11-A: $GA  11-B: $GB"
bekle "uc ogrenci grup uyesi kopyasi" "select count(*) from bildirim.grup_uyesi_kopyalari where kurum_id = '$KURUM'" 3
bekle "ogretmen atama kopyasi" "select count(*) from bildirim.atama_kopyalari where kurum_id = '$KURUM' and ogretmen_id = '$HOCA_UYELIK'" 1
bekle "uyelik kopyalari (ogretmen + 3 ogrenci + sahip)" "select count(*) from bildirim.uyelik_kopyalari where kurum_id = '$KURUM' and durum = 'aktif'" 5
cihaz "$O1" 1

adim "2) Ogretmen 11-A'ya duyuru: taslak -> yayin"
GOVDE=$(jq -nc --arg g "$GA" '{baslik:"Cumartesi deneme sinavi",govde:"Cumartesi 10:00da deneme sinavi var. Detay: https://ornek.example/sinav",hedef_turu:"grup",hedef_id:$g,hedef_roller:["ogrenci"]}')
R=$(j -X POST "$(D '')" -H "authorization: Bearer $HOCA" -d "$GOVDE")
DID=$(echo "$R" | jq -r .id)
sart "taslak durumu" "$(echo "$R" | jq -r .durum)" taslak
sart "taslak ogrenciye gorunmez (404)" "$(durum "$(D "/$DID")" -H "authorization: Bearer $O1")" 404
Y=$(j -X POST "$(D "/$DID/yayinla")" -H "authorization: Bearer $HOCA" -d '{}')
sart "yayinda, alici sayisi 2" "$(echo "$Y" | jq -c '[.durum,.alici_sayisi,.okunan_sayisi]')" '["yayinda",2,0]'
bekle "iki alici satiri" "select count(*) from bildirim.duyuru_alicilari where duyuru_id = '$DID'" 2
sart "kutu bildirimi (ogrenci 1) baslik" "$(kutu "$O1" '' | jq -r '.ogeler[0].baslik')" "Cumartesi deneme sinavi"
sart "kutu bildirimi derin baglanti" "$(kutu "$O1" '' | jq -r '.ogeler[0].derin_baglanti')" "kopru://duyuru/$DID"
sart "ogrenci 2 kutusunda" "$(kutu "$O2" '' | jq '.ogeler | length')" 1
sart "11-B ogrencisinin kutusu bos" "$(kutu "$O3" '' | jq '.ogeler | length')" 0
sart "duyurularim (ogrenci 1)" "$(j "$(D '')" -H "authorization: Bearer $O1" | jq -c '[.toplam, .ogeler[0].baslik, .ogeler[0].okundu_at]')" '[1,"Cumartesi deneme sinavi",null]'
sart "11-B ogrencisinin duyurulari bos" "$(j "$(D '')" -H "authorization: Bearer $O3" | jq .toplam)" 0
bekle "push gonderildi (ogrenci 1 cihazi)" "select count(*) from bildirim.gonderimler where kurum_id = '$KURUM' and durum = 'gonderildi' and sablon_kodu = 'duyuru_yayinlandi'" 1
echo "log saglayici satiri:"; grep 'push gönderimi (log sağlayıcı)' "$WORKER_LOG" | tail -1 | jq -c '{title:.title,body:.body,data:.data}' | sed 's/^/  /'
sart "push basligi genel" "$(grep 'push gönderimi (log sağlayıcı)' "$WORKER_LOG" | tail -1 | jq -r .title)" "Yeni duyuru"
sart "push metninde duyuru basligi yok" "$(bsql "select count(*) from bildirim.gonderimler where kurum_id = '$KURUM' and (govde ilike '%deneme sinavi%' or baslik ilike '%deneme sinavi%')")" 0

adim "3) Okundu: sayac yalniz ilk okumada artar; kutudaki bildirim de okundu olur"
sart "okundu (200)" "$(durum -X POST "$(D "/$DID/okundu")" -H "authorization: Bearer $O1" -d '{}')" 200
sart "tekrar okundu (200)" "$(durum -X POST "$(D "/$DID/okundu")" -H "authorization: Bearer $O1" -d '{}')" 200
sart "sayac 1/2" "$(j "$(D "/$DID")" -H "authorization: Bearer $HOCA" | jq -c '[.yonetim.okunan_sayisi, .yonetim.alici_sayisi]')" '[1,2]'
sart "kutu bildirimi okundu" "$(kutu "$O1" '' | jq '.ogeler[0].okundu_at != null')" true
sart "ogrenci 2'nin kutu bildirimi okunmamis" "$(kutu "$O2" '' | jq '.ogeler[0].okundu_at')" null
sart "okuyanlar (yazar)" "$(j "$(D "/$DID/okuyanlar")" -H "authorization: Bearer $HOCA" | jq -c '[(.okuyanlar | map(.alici_id)), .okunan_sayisi]')" "[[\"$O1_U\"],1]"
sart "ogrenci okuyanlari goremez (403)" "$(durum "$(D "/$DID/okuyanlar")" -H "authorization: Bearer $O1")" 403
sart "11-B ogrencisi okundu isaretleyemez (404)" "$(durum -X POST "$(D "/$DID/okundu")" -H "authorization: Bearer $O3" -d '{}')" 404
sart "ogretmenin yonetim listesi" "$(j "$(D '/yonetim')" -H "authorization: Bearer $HOCA" | jq -c '[.toplam, .ogeler[0].okunan_sayisi, .ogeler[0].alici_sayisi]')" '[1,1,2]'

adim "4) Yetki: ogretmen atamasiz 11-B'ye ve tum kuruma yazamaz; ogrenci yazamaz"
sart "11-B'ye taslak (403)" "$(durum -X POST "$(D '')" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg g "$GB" '{baslik:"x",govde:"y",hedef_turu:"grup",hedef_id:$g}')")" 403
sart "kuruma taslak (403)" "$(durum -X POST "$(D '')" -H "authorization: Bearer $HOCA" -d '{"baslik":"x","govde":"y","hedef_turu":"kurum"}')" 403
sart "ogrenci yazamaz (403)" "$(durum -X POST "$(D '')" -H "authorization: Bearer $O1" -d "$GOVDE")" 403
sart "kimliksiz (401)" "$(durum "$(D '')")" 401

adim "5) Sonradan katilan ogrenci 11-A'ya eklenir -> sabit/son 14 gun duyuruyu push'suz gorur"
O4_B=$(davetle "$S" ogrenci "ogr4-$RUN@example.com" "Ogrenci 4"); O4_U=${O4_B%% *}; O4=$(token "${O4_B##* }" "$KURUM")
cihaz "$O4" 4
bekle "yeni ogrenci uyelik kopyasi" "select count(*) from bildirim.uyelik_kopyalari where uyelik_id = '$O4_U' and durum = 'aktif'" 1
sart "yeni ogrenci henuz duyuru gormez" "$(j "$(D '')" -H "authorization: Bearer $O4" | jq .toplam)" 0
sart "11-A'ya ekle (201)" "$(durum -X POST "$H/gruplar/$GA/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$O4_U" '{ogrenci_idleri:[$a]}')")" 201
bekle "yeni ogrenci alici satiri" "select count(*) from bildirim.duyuru_alicilari where duyuru_id = '$DID' and alici_id = '$O4_U'" 1
sart "yeni ogrencinin duyurulari" "$(j "$(D '')" -H "authorization: Bearer $O4" | jq -c '[.toplam, .ogeler[0].baslik]')" '[1,"Cumartesi deneme sinavi"]'
sart "yeni ogrencinin kutusunda bildirim" "$(kutu "$O4" '' | jq '.ogeler | length')" 1
sart "yeni ogrenciye push yok" "$(bsql "select count(*) from bildirim.gonderimler g join bildirim.bildirimler b on b.id = g.bildirim_id where b.alici_id = '$O4_U'")" 0
sart "alici sayisi 3, okunan 1" "$(j "$(D "/$DID")" -H "authorization: Bearer $HOCA" | jq -c '[.yonetim.alici_sayisi, .yonetim.okunan_sayisi]')" '[3,1]'

adim "6) Yonetici: kurum duyurusu (sabit), sabitler listede ustte; guncelleme; arsiv kutudan kaldirir"
KY=$(j -X POST "$(D '')" -H "authorization: Bearer $S" -d '{"baslik":"Kurum tatili","govde":"Pazartesi kurumumuz kapali.","hedef_turu":"kurum","sabit":true}' | jq -r .id)
sart "kurum duyurusu yayin (alici 4 ogrenci)" "$(j -X POST "$(D "/$KY/yayinla")" -H "authorization: Bearer $S" -d '{}' | jq -c '[.durum,.alici_sayisi]')" '["yayinda",4]'
sart "ogrenci 1: sabit ustte" "$(j "$(D '')" -H "authorization: Bearer $O1" | jq -c '[.ogeler[].baslik]')" '["Kurum tatili","Cumartesi deneme sinavi"]'
sart "yayindaki duyuruda govde degisemez (409)" "$(durum -X PATCH "$(D "/$KY")" -H "authorization: Bearer $S" -d '{"baslik":"Degisti"}')" 409
sart "sabit kaldirilir (200)" "$(durum -X PATCH "$(D "/$KY")" -H "authorization: Bearer $S" -d '{"sabit":false}')" 200
sart "arsivle (200)" "$(durum -X POST "$(D "/$KY/arsivle")" -H "authorization: Bearer $S" -d '{}')" 200
sart "arsivlenen duyurularimda yok" "$(j "$(D '')" -H "authorization: Bearer $O1" | jq .toplam)" 1
sart "arsivlenen kutuda yok" "$(kutu "$O1" '?limit=50' | jq -c '[.ogeler[].baslik]')" '["Cumartesi deneme sinavi"]'
sart "yonetici listesi (2 duyuru)" "$(j "$(D '/yonetim')" -H "authorization: Bearer $S" | jq .toplam)" 2

echo
echo "TAMAM: duyuru akisi gecti (kurum $KURUM)"
