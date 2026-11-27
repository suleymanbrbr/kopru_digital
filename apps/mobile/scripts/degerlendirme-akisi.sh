#!/usr/bin/env bash
# Mobil degerlendirme / kaynak onerisi / kocluk akisi: simulatorde elle denenecek veriyi hazirlar (gercek api +
# api worker + bildirim + bildirim worker + motivasyon + motivasyon worker + NATS). Mobil uygulama TELEFON + OTP
# ile girer; OTP kodu api logundaki `[DEV SMS]` satirindan okunur.
#
# Kullanim (repo kokunden):
#   apps/mobile/scripts/degerlendirme-akisi.sh hazirla   kurum + grup + ogretmen A (matematik) + ogretmen B (biyoloji)
#                                                        + ogrenci + konular + kaynak kitap + ogrencinin gecmis kayitlari
#   apps/mobile/scripts/degerlendirme-akisi.sh b-yaz     ogretmen B GIZLI degerlendirme yazar (ogrenci goremez)
#   apps/mobile/scripts/degerlendirme-akisi.sh otp <telefon>   son OTP kodu
#   apps/mobile/scripts/degerlendirme-akisi.sh durum     ogrencinin gordukleri, ogretmen A'nin kocluk ozeti, bildirim kutusu
#
# On kosul (repo kokunden; AYRI NATS 4261; portlar 41900-41909; Postgres 5433):
#   docker run -d --name kopru-nats-m3 -p 4261:4222 nats:2 -js
#   docker exec kopru-postgres-1 createdb -U postgres kopru_m3_api   (kopru_m3_bil, kopru_m3_mot da)
#   api 41900 + worker, motivasyon 41901 + worker, bildirim 41902 + worker (ortam degiskenleri:
#   services/api/scripts/degerlendirme-akisi.sh ve gunluk-soru-akisi.sh basliklari; RATE_LIMIT_MAX=100000)
# Mobil: cd apps/mobile && CI=1 EXPO_PUBLIC_API_URL=http://localhost:41900 EXPO_PUBLIC_MOTIVASYON_URL=http://localhost:41901 \
#   EXPO_PUBLIC_BILDIRIM_URL=http://localhost:41902 npx expo start --dev-client --port 41903
# API_LOG zorunlu (api sunucusunun log dosyasi). Gerekenler: curl, jq, docker, python3, uuidgen. bash 3.2 uyumlu.
set -euo pipefail

API="${API:-http://localhost:41900}"
BIL="${BIL:-http://localhost:41902}"
API_DB="${API_DB:-kopru_m3_api}"
API_LOG="${API_LOG:?API_LOG: api sunucusunun log dosyasi (OTP kodu icin) verilmeli}"
STATE="${STATE:-${TMPDIR:-/tmp}/mobil-degerlendirme.state}"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
asql() { docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d "$API_DB" -v ON_ERROR_STOP=1 -c "$1"; }
yeniUuid() { uuidgen | tr 'A-Z' 'a-z'; }

son_kod() { grep "DEV SMS" "$API_LOG" | grep -F "\"dev_telefon\":\"$1\"" | tail -1 | jq -r '.dev_kod'; }
e164() { printf '+9%s' "$1"; }
otp_giris() {
  local tel e kod
  tel="$1"; e=$(e164 "$tel")
  j -X POST "$API/auth/otp/gonder" -d "$(jq -nc --arg t "$tel" '{telefon:$t}')" >/dev/null
  sleep 1
  kod=$(son_kod "$e")
  j -X POST "$API/auth/otp/dogrula" -d "$(jq -nc --arg t "$tel" --arg k "$kod" '{telefon:$t,kod:$k}')" | jq -r '.oturum_belirteci'
}
token() { j -X POST "$API/auth/token" -H "authorization: Bearer $1" -d "$(jq -nc --arg k "${2:-}" 'if $k == "" then {} else {kurum_id:$k} end')" | jq -r '.access_token'; }
riza() { local id; for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null; done; }
davetle() {
  local belirtec oturum ilk
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')" | jq -r '.belirtec')
  oturum=$(otp_giris "$3"); ilk=$(token "$oturum"); riza "$ilk"
  j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg b "$belirtec" '{belirtec:$b}')" | jq -r '.uyelik_id' | tr -d '\n'
  printf ' %s' "$oturum"
}
durumu_yukle() {
  [ -f "$STATE" ] || { echo "Once '$0 hazirla' calistirin ($STATE yok)." >&2; exit 2; }
  # shellcheck disable=SC1090
  . "$STATE"
}
gun_once() { python3 -c "import datetime as d,sys; print((d.date.today()-d.timedelta(days=int(sys.argv[1]))).isoformat())" "$1"; }

komut="${1:-}"
case "$komut" in
  hazirla)
    RUN="$RANDOM$RANDOM"; SON5=$(printf '%05d' $((RUN % 100000)))
    SAHIP_TEL="05329${SON5}0"; HA_TEL="05329${SON5}1"; HB_TEL="05329${SON5}3"; OGR_TEL="05329${SON5}2"
    adim "Kurum, grup (11-A), ogretmen A (matematik), ogretmen B (biyoloji), ogrenci"
    S_OTURUM=$(otp_giris "$SAHIP_TEL"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
    KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Degerlendirme Mobil Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
    S=$(token "$S_OTURUM" "$KURUM"); H="$API/v1/hesap/kurumlar/$KURUM"
    GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"11-A"}' | jq -r '.id')
    A=$(davetle "$S" ogretmen "$HA_TEL"); A_UYELIK=${A%% *}; A_OTURUM=${A##* }
    B=$(davetle "$S" ogretmen "$HB_TEL"); B_UYELIK=${B%% *}; B_OTURUM=${B##* }
    curl -sS -o /dev/null -X POST "$H/gruplar/$GRUP/atamalar" -H 'content-type: application/json' -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$A_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')"
    curl -sS -o /dev/null -X POST "$H/gruplar/$GRUP/atamalar" -H 'content-type: application/json' -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$B_UYELIK" '{ogretmen_id:$o,brans_kodu:"biyoloji"}')"
    OG=$(davetle "$S" ogrenci "$OGR_TEL"); OG_UYELIK=${OG%% *}; OG_OTURUM=${OG##* }
    curl -sS -o /dev/null -X POST "$H/gruplar/$GRUP/uyeler" -H 'content-type: application/json' -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OG_UYELIK" '{ogrenci_idleri:[$a]}')"
    HOCA=$(token "$A_OTURUM" "$KURUM"); OGT=$(token "$OG_OTURUM" "$KURUM")

    adim "Konu agaci ve kaynak kitap (ogretmen A)"
    SAYILAR=$(yeniUuid); USLU=$(yeniUuid); CEBIR=$(yeniUuid); DENKLEM=$(yeniUuid)
    asql "insert into ogrenme.konular (id, kurum_id, brans_kodu, ust_id, seviye, ad, sira) values
      ('$SAYILAR', '$KURUM', 'matematik', null, 'unite', 'Sayılar ve İşlemler', 1),
      ('$USLU', '$KURUM', 'matematik', '$SAYILAR', 'konu', 'Üslü Sayılar', 1),
      ('$CEBIR', '$KURUM', 'matematik', null, 'unite', 'Cebir', 2),
      ('$DENKLEM', '$KURUM', 'matematik', '$CEBIR', 'konu', 'Denklemler', 1)"
    O="$API/v1/ogrenme/kurumlar/$KURUM"
    KITAP=$(j -X POST "$O/kaynak-kitaplar" -H "authorization: Bearer $HOCA" -d '{"ad":"Esen Soru Bankası","yayinevi":"Esen Yayınları","brans_kodu":"matematik","testler":[{"ad":"Test 1: Üslü sayılar","soru_sayisi":20},{"ad":"Test 2: Üslü sayılar","soru_sayisi":20},{"ad":"Test 3: Denklemler","soru_sayisi":15}]}')
    KITAP_ID=$(echo "$KITAP" | jq -r '.id'); TEST1=$(echo "$KITAP" | jq -r '.testler[0].id')

    adim "Ogrencinin gecmis kayitlari (Uslu Sayilar, Denklemler)"
    kayit() { # gun-once konu zorluk dogru yanlis bos [test_id]
      local ek='{}'; [ -z "${7:-}" ] || ek=$(jq -nc --arg t "$7" '{kaynak_test_id:$t}')
      j -X POST "$O/gunluk-soru/kayitlar" -H "authorization: Bearer $OGT" -d "$(jq -nc --arg g "$(gun_once "$1")" --arg k "$2" --arg z "$3" --argjson d "$4" --argjson y "$5" --argjson b "$6" --arg i "$(yeniUuid)" --argjson ek "$ek" \
        '{gun:$g,brans_kodu:"matematik",konu_id:$k,zorluk:$z,dogru:$d,yanlis:$y,bos:$b,istek_id:$i} + $ek')" | jq -c '{gun,zorluk,toplam}'
    }
    kayit 5 "$USLU" kolay 18 2 0
    kayit 4 "$USLU" orta 12 7 1 "$TEST1"
    kayit 3 "$DENKLEM" zor 1 6 0
    printf 'KURUM=%s\nHA_TEL=%s\nHB_TEL=%s\nOGR_TEL=%s\nA_OTURUM=%s\nB_OTURUM=%s\nOG_OTURUM=%s\nOG_UYELIK=%s\nKITAP_ID=%s\nTEST1=%s\n' \
      "$KURUM" "$HA_TEL" "$HB_TEL" "$OGR_TEL" "$A_OTURUM" "$B_OTURUM" "$OG_OTURUM" "$OG_UYELIK" "$KITAP_ID" "$TEST1" > "$STATE"
    echo "kurum: $KURUM"
    echo "ogretmen A (matematik) telefonu: $HA_TEL   ogretmen B (biyoloji): $HB_TEL   ogrenci: $OGR_TEL   (OTP: '$0 otp <telefon>')"
    ;;
  b-yaz)
    durumu_yukle
    HB=$(token "$B_OTURUM" "$KURUM"); O="$API/v1/ogrenme/kurumlar/$KURUM"
    PAZARTESI=$(python3 -c 'import datetime as d; t=d.date.today(); print((t-d.timedelta(days=t.weekday())).isoformat())')
    adim "Ogretmen B GIZLI degerlendirme yazar (ogrenci_gorur=false)"
    j -X POST "$O/ogrenciler/$OG_UYELIK/degerlendirmeler" -H "authorization: Bearer $HB" \
      -d "$(jq -nc --arg g "$PAZARTESI" '{donem_baslangic:$g,calisma_duzeni:2,derse_katilim:3,yorum:"GIZLI: derste dikkati dagınık, aileyle gorusmek gerekebilir.",ogrenci_gorur:false}')" | jq -c '{id,ogrenci_gorur}'
    ;;
  otp)
    : "${2:?telefon verilmeli (05321234567 gibi)}"
    son_kod "$(e164 "$2")"
    ;;
  durum)
    durumu_yukle
    HA=$(token "$A_OTURUM" "$KURUM"); OGT=$(token "$OG_OTURUM" "$KURUM"); O="$API/v1/ogrenme/kurumlar/$KURUM"
    adim "Ogrencinin gordugu degerlendirmeler (yalniz gorunur olanlar) ve oneriler"
    j "$O/degerlendirmelerim" -H "authorization: Bearer $OGT" | jq -c '.degerlendirmeler[]|{yazar_ad,yorum}'
    j "$O/kaynak-onerilerim" -H "authorization: Bearer $OGT" | jq -c '.oneriler[]|{tur,kaynak_kitap_ad,kaynak_test_ad,baslik,basladi}'
    adim "Ogretmen A koclukta (tum ogretmenlerin kayitlari, oneri durumu)"
    j "$O/ogrenciler/$OG_UYELIK/kocluk" -H "authorization: Bearer $HA" | jq -c '{degerlendirmeler:[.degerlendirmeler.degerlendirmeler[]|{yazar_ad,ogrenci_gorur,benim}],oneriler:[.oneriler[]|{tur,basladi,kayit_sayisi}]}'
    adim "Ogrencinin bildirim kutusu"
    j "$BIL/v1/bildirim/kurumlar/$KURUM/bildirimler" -H "authorization: Bearer $OGT" | jq -c '.bildirimler[]?|{baslik,govde,derin_baglanti}'
    ;;
  *)
    sed -n 2,11p "$0"
    exit 2
    ;;
esac
