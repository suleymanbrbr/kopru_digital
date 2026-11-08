#!/usr/bin/env bash
# Davet, grup ve atama akisi: uctan uca curl senaryosu (tekrar calistirilabilir; her calistirmada yeni kullanicilar).
#
# On kosul: api 4100 portunda, ayri bir veritabanina (api_c) migrate edilmis, OTP kodu log dosyasina yaziyor:
#   docker compose -f infra/docker/compose.yaml exec -T postgres psql -U postgres -c 'create database api_c owner api'
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/api_c \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/api_c \
#          API_DATABASE_OWNER_URL=postgres://api:api@localhost:5433/api_c API_PORT=4100
#   pnpm --filter @kopru/api db:migrate && pnpm --filter @kopru/api dev > /tmp/api4100.log 2>&1 &
# Kullanim (repo kokunden): API_LOG=/tmp/api4100.log services/api/scripts/davet-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4100}"
API_LOG="${API_LOG:-/tmp/api4100.log}"
DB="${DB:-api_c}"
# SQL icin docker icindeki postgres kullanilir (yerel psql gerekmez).
psql_() { docker compose -f infra/docker/compose.yaml exec -T postgres psql -U postgres -d "$DB" "$@"; }
RUN="$RANDOM$RANDOM"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
otp_kodu() { grep '\[DEV SMS\]' "$API_LOG" | grep -F "$1" | tail -1 | jq -r '.kod'; }
giris() { # $1 telefon -> oturum belirteci
  j -X POST "$API/auth/otp/gonder" -d "{\"telefon\":\"$1\"}" >/dev/null
  sleep 0.5
  local kod; kod=$(otp_kodu "$1")
  j -X POST "$API/auth/otp/dogrula" -d "{\"telefon\":\"$1\",\"kod\":\"$kod\"}" | jq -r '.oturum_belirteci'
}
token() { # $1 oturum, $2 kurum_id (opsiyonel)
  local govde='{}'; [ -n "${2:-}" ] && govde="{\"kurum_id\":\"$2\"}"
  j -X POST "$API/auth/token" -H "authorization: Bearer $1" -d "$govde" | jq -r '.access_token'
}
kvkk() { # $1 access token
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi|not) | .id'); do
    j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "{\"riza_metni_id\":\"$id\"}" >/dev/null
  done
}
kod() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }

SON=$(printf '%07d' $((RUN % 10000000)))
TEL_SAHIP="+90551$SON"
TEL_HOCA="+90552$SON"
TEL_OGR="+90553$SON"

adim "1) Sahip girisi, KVKK, kurum olusturma, kurum token'i"
S_OTURUM=$(giris "$TEL_SAHIP")
S_ILK=$(token "$S_OTURUM"); kvkk "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Davet Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
echo "kurum: $KURUM"
B="$API/v1/hesap/kurumlar/$KURUM"

adim "2) Siniflar (6-A, 7-B) olustur"
GRUP=$(j -X POST "$B/gruplar" -H "authorization: Bearer $S" -d '{"tur":"sinif","ad":"6-A","kapasite":30}' | jq -r '.id')
GRUP2=$(j -X POST "$B/gruplar" -H "authorization: Bearer $S" -d '{"tur":"sinif","ad":"7-B"}' | jq -r '.id')
echo "grup: $GRUP (6-A), $GRUP2 (7-B)"

adim "3) Davetler: ogretmen -> e-posta, ogrenci -> sms (gruba bagli), iki baglanti (iptal / sure testi)"
D_HOCA=$(j -X POST "$B/davetler" -H "authorization: Bearer $S" -d "{\"kanal\":\"eposta\",\"rol\":\"ogretmen\",\"eposta\":\"hoca$RUN@ornek.test\",\"hedef_ad\":\"Ayse Hoca\"}")
echo "$D_HOCA" | jq -c '{durum: .davet.durum, kanal: .davet.kanal, gonderim, belirtec_uzunlugu: (.belirtec|length)}'
T_HOCA=$(echo "$D_HOCA" | jq -r '.belirtec')
D_OGR=$(j -X POST "$B/davetler" -H "authorization: Bearer $S" -d "{\"kanal\":\"sms\",\"rol\":\"ogrenci\",\"telefon\":\"$TEL_OGR\",\"grup_id\":\"$GRUP\"}")
echo "$D_OGR" | jq -c '{durum: .davet.durum, kanal: .davet.kanal, gonderim, gonderim_sayisi: .davet.gonderim_sayisi}'
T_OGR=$(echo "$D_OGR" | jq -r '.belirtec')
D_IPTAL=$(j -X POST "$B/davetler" -H "authorization: Bearer $S" -d '{"kanal":"baglanti","rol":"ogrenci"}')
T_IPTAL=$(echo "$D_IPTAL" | jq -r '.belirtec'); ID_IPTAL=$(echo "$D_IPTAL" | jq -r '.davet.id')
D_SURE=$(j -X POST "$B/davetler" -H "authorization: Bearer $S" -d '{"kanal":"baglanti","rol":"ogrenci"}')
T_SURE=$(echo "$D_SURE" | jq -r '.belirtec'); ID_SURE=$(echo "$D_SURE" | jq -r '.davet.id')
sart "sahip davet edilemez (400)" "$(kod -X POST "$B/davetler" -H "authorization: Bearer $S" -d '{"kanal":"baglanti","rol":"sahip"}')" 400

adim "4) Ikinci ve ucuncu kullanici: giris + KVKK + daveti kabul"
H_OTURUM=$(giris "$TEL_HOCA"); H_ILK=$(token "$H_OTURUM"); kvkk "$H_ILK"
KABUL_H=$(j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $H_ILK" -d "{\"belirtec\":\"$T_HOCA\"}")
echo "$KABUL_H" | jq -c '{rol, uyelik_id, grup_id}'
HOCA_UYELIK=$(echo "$KABUL_H" | jq -r '.uyelik_id')
O_OTURUM=$(giris "$TEL_OGR"); O_ILK=$(token "$O_OTURUM"); kvkk "$O_ILK"
KABUL_O=$(j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $O_ILK" -d "{\"belirtec\":\"$T_OGR\"}")
echo "$KABUL_O" | jq -c '{rol, uyelik_id, grup_id, grup_uyesi_id}'
OGR_UYELIK=$(echo "$KABUL_O" | jq -r '.uyelik_id')

adim "5) Ogrenci gruba eklenmis mi? Ogretmen 6-A ya atanir"
j "$B/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" | jq -c '.uyeler[] | {ogrenci_id, katilim_yolu}'
sart "ogrenci grup uyesi" "$(j "$B/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" | jq -r --arg o "$OGR_UYELIK" '[.uyeler[]|select(.ogrenci_id==$o)]|length')" 1
ATAMA=$(j -X POST "$B/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "{\"ogretmen_id\":\"$HOCA_UYELIK\",\"brans_kodu\":\"matematik\",\"ana_ogretmen\":true}")
echo "$ATAMA" | jq -c '{id, grup_id, brans_kodu, ana_ogretmen}'
sart "ayni atama tekrari (409)" "$(kod -X POST "$B/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "{\"ogretmen_id\":\"$HOCA_UYELIK\",\"brans_kodu\":\"matematik\"}")" 409

adim "6) Ogretmen token'i yalniz kendi grubunu gorur"
H=$(token "$H_OTURUM" "$KURUM")
echo "ogretmen gruplari:"; j "$B/gruplar" -H "authorization: Bearer $H" | jq -c '{kapsam, gruplar: [.gruplar[]|{ad,uye_sayisi}]}'
sart "ogretmen 1 grup gorur" "$(j "$B/gruplar" -H "authorization: Bearer $H" | jq '.gruplar|length')" 1
sart "atanmadigi grup 404" "$(kod "$B/gruplar/$GRUP2" -H "authorization: Bearer $H")" 404
sart "ogretmen grup olusturamaz 403" "$(kod -X POST "$B/gruplar" -H "authorization: Bearer $H" -d '{"tur":"grup","ad":"x"}')" 403
O=$(token "$O_OTURUM" "$KURUM")
sart "ogrenci yalniz uye oldugu grubu gorur" "$(j "$B/gruplar" -H "authorization: Bearer $O" | jq '.gruplar|length')" 1

adim "7) Iptal edilmis ve suresi dolmus davet -> 410"
sart "iptal" "$(j -X POST "$B/davetler/$ID_IPTAL/iptal" -H "authorization: Bearer $S" -d '{}' | jq -r '.durum')" iptal
sart "iptal edilmis davet kabulu 410" "$(kod -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $O_ILK" -d "{\"belirtec\":\"$T_IPTAL\"}")" 410
psql_ -qc "update hesap.davetler set expires_at = now() - interval '1 minute' where id = '$ID_SURE'" >/dev/null
sart "suresi dolmus davet kabulu 410" "$(kod -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $O_ILK" -d "{\"belirtec\":\"$T_SURE\"}")" 410
sart "kullanilmis davet tekrar kabulu 410" "$(kod -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $O_ILK" -d "{\"belirtec\":\"$T_OGR\"}")" 410
echo "davet durumlari:"; j "$B/davetler" -H "authorization: Bearer $S" | jq -c '.davetler[] | {kanal, rol, durum}'
sart "suresi_doldu goruluyor" "$(j "$B/davetler?durum=suresi_doldu" -H "authorization: Bearer $S" | jq '.davetler|length')" 1

adim "8) Outbox: olaylar PII icermiyor (telefon, e-posta, ad, belirtec)"
psql_ -c "select subject, payload->'data' as veri from ortak.outbox where kurum_id = '$KURUM' and subject in ('evt.hesap.grup.degisti.v1','evt.hesap.grup_uyesi.degisti.v1','evt.hesap.atama.degisti.v1','evt.hesap.davet.kabul_edildi.v1') order by created_at"
SIZINTI=$(psql_ -Atc "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject like 'evt.hesap.%' and subject <> 'evt.hesap.uyelik.degisti.v1' and (payload::text like '%$TEL_OGR%' or payload::text like '%$TEL_HOCA%' or payload::text like '%@ornek.test%' or payload::text like '%Ayse%' or payload::text like '%$T_OGR%' or payload::text like '%$T_HOCA%')")
sart "PII sizintisi yok" "$SIZINTI" 0
adim "TAMAM"
