#!/usr/bin/env bash
# Mobil gunluk soru takibi akisi: simulatorde elle denenecek veriyi hazirlar (gercek api + api worker +
# motivasyon + motivasyon worker + medya + medya worker + NATS). Mobil uygulama TELEFON + OTP ile girer; OTP kodu
# api logundaki `[DEV SMS]` satirindan okunur.
#
# Kullanim (repo kokunden):
#   apps/mobile/scripts/gunluk-soru-akisi.sh hazirla         kurum + grup + ogretmen (matematik) + ogrenci + konular + kaynak kitap
#                                                            + ogrencinin gecmis kayitlari (Uslu Sayilar: kolay %90, orta %60, zor %25;
#                                                            Denklemler: zor bantta %17) + bugunun plan gorevi (20 soru, Uslu Sayilar)
#   apps/mobile/scripts/gunluk-soru-akisi.sh otp <telefon>   son OTP kodu
#   apps/mobile/scripts/gunluk-soru-akisi.sh durum           ogrencinin kayitlari, ogretmenin analizi/onerileri, ogrencinin gorevleri, XP
#
# On kosul (repo kokunden; AYRI NATS 4259; portlar 41880-41889; Postgres 5433), bkz. services/api/scripts/gunluk-soru-akisi.sh:
#   docker run -d --name kopru-nats-m2 -p 4259:4222 nats:2 -js
#   docker exec kopru-postgres-1 createdb -U postgres kopru_m2_api   (kopru_m2_mot, kopru_m2_medya da)
#   api 41880 + worker, motivasyon 41882 + worker, medya 41881 + worker (MEDYA_S3_* ile RustFS 9000, ayri kova)
# Mobil: cd apps/mobile && CI=1 EXPO_PUBLIC_API_URL=http://localhost:41880 EXPO_PUBLIC_MEDYA_URL=http://localhost:41881 \
#   EXPO_PUBLIC_MOTIVASYON_URL=http://localhost:41882 npx expo start --dev-client --port 41883
# API_LOG zorunlu (api sunucusunun log dosyasi). Gerekenler: curl, jq, docker, python3. bash 3.2 uyumlu.
set -euo pipefail

API="${API:-http://localhost:41880}"
MOT="${MOT:-http://localhost:41882}"
API_DB="${API_DB:-kopru_m2_api}"
API_LOG="${API_LOG:?API_LOG: api sunucusunun log dosyasi (OTP kodu icin) verilmeli}"
STATE="${STATE:-${TMPDIR:-/tmp}/mobil-gunluk-soru.state}"

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
    SAHIP_TEL="05329${SON5}0"; HOCA_TEL="05329${SON5}1"; OGR_TEL="05329${SON5}2"
    adim "Kurum, grup (11-A), ogretmen (matematik atamali), ogrenci"
    S_OTURUM=$(otp_giris "$SAHIP_TEL"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
    KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Gunluk Soru Mobil Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
    S=$(token "$S_OTURUM" "$KURUM"); H="$API/v1/hesap/kurumlar/$KURUM"
    GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"11-A"}' | jq -r '.id')
    H1=$(davetle "$S" ogretmen "$HOCA_TEL"); H1_UYELIK=${H1%% *}; H1_OTURUM=${H1##* }
    curl -sS -o /dev/null -X POST "$H/gruplar/$GRUP/atamalar" -H 'content-type: application/json' -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$H1_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')"
    OG=$(davetle "$S" ogrenci "$OGR_TEL"); OG_UYELIK=${OG%% *}; OG_OTURUM=${OG##* }
    curl -sS -o /dev/null -X POST "$H/gruplar/$GRUP/uyeler" -H 'content-type: application/json' -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OG_UYELIK" '{ogrenci_idleri:[$a]}')"
    HOCA=$(token "$H1_OTURUM" "$KURUM"); OGT=$(token "$OG_OTURUM" "$KURUM")

    adim "Konu agaci (matematik: Uslu Sayilar, Denklemler; biyoloji: Genetik)"
    SAYILAR=$(yeniUuid); USLU=$(yeniUuid); CEBIR=$(yeniUuid); DENKLEM=$(yeniUuid); KALITIM=$(yeniUuid); GENETIK=$(yeniUuid)
    # Kurum konulari (global katalog satirlari surum cozumlemesi ister; kurum konusu dogrudan listelenir).
    asql "insert into ogrenme.konular (id, kurum_id, brans_kodu, ust_id, seviye, ad, sira) values
      ('$SAYILAR', '$KURUM', 'matematik', null, 'unite', 'Sayılar ve İşlemler', 1),
      ('$USLU', '$KURUM', 'matematik', '$SAYILAR', 'konu', 'Üslü Sayılar', 1),
      ('$CEBIR', '$KURUM', 'matematik', null, 'unite', 'Cebir', 2),
      ('$DENKLEM', '$KURUM', 'matematik', '$CEBIR', 'konu', 'Denklemler', 1),
      ('$KALITIM', '$KURUM', 'biyoloji', null, 'unite', 'Kalıtım', 1),
      ('$GENETIK', '$KURUM', 'biyoloji', '$KALITIM', 'konu', 'Genetik', 1)"

    adim "Ogretmen kaynak kitap tanimlar"
    O="$API/v1/ogrenme/kurumlar/$KURUM"
    KITAP=$(j -X POST "$O/kaynak-kitaplar" -H "authorization: Bearer $HOCA" -d '{"ad":"Esen Soru Bankası","yayinevi":"Esen Yayınları","brans_kodu":"matematik","testler":[{"ad":"Test 1: Üslü sayılar","soru_sayisi":20},{"ad":"Test 2: Üslü sayılar","soru_sayisi":20},{"ad":"Test 3: Denklemler","soru_sayisi":15}]}')
    TEST1=$(echo "$KITAP" | jq -r '.testler[0].id')

    adim "Ogrencinin gecmis kayitlari (Uslu Sayilar kolay %90 / orta %60 / zor %25; Denklemler zor %17)"
    kayit() { # gun-once konu zorluk dogru yanlis bos [test_id]
      local ek='{}'; [ -z "${7:-}" ] || ek=$(jq -nc --arg t "$7" '{kaynak_test_id:$t}')
      j -X POST "$O/gunluk-soru/kayitlar" -H "authorization: Bearer $OGT" -d "$(jq -nc --arg g "$(gun_once "$1")" --arg k "$2" --arg z "$3" --argjson d "$4" --argjson y "$5" --argjson b "$6" --arg i "$(yeniUuid)" --argjson ek "$ek" \
        '{gun:$g,brans_kodu:"matematik",konu_id:$k,zorluk:$z,dogru:$d,yanlis:$y,bos:$b,istek_id:$i} + $ek')" | jq -c '{gun,zorluk,toplam}'
    }
    kayit 5 "$USLU" kolay 18 2 0
    kayit 4 "$USLU" orta 12 7 1 "$TEST1"
    kayit 3 "$USLU" zor 5 14 1
    kayit 5 "$DENKLEM" kolay 12 0 0
    kayit 4 "$DENKLEM" orta 10 2 0
    kayit 3 "$DENKLEM" zor 1 6 0
    kayit 1 "$DENKLEM" zor 1 5 0

    adim "Bugunun plan gorevi (matematik, Uslu Sayilar, 20 soru)"
    BUGUN=$(python3 -c 'import datetime as d; print(d.date.today().isoformat())')
    PAZARTESI=$(python3 -c 'import datetime as d; t=d.date.today(); print((t-d.timedelta(days=t.weekday())).isoformat())')
    PLAN_ID=$(j -X POST "$O/planlar" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$OG_UYELIK" --arg h "$PAZARTESI" '{ogrenci_id:$o,hafta_baslangic:$h}')" | jq -r '(.plan.id // .id)')
    j -X POST "$O/planlar/$PLAN_ID/gorevler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg g "$BUGUN" --arg k "$USLU" '{gun:$g,brans_kodu:"matematik",konu_id:$k,hedef_turu:"soru",hedef_miktar:20}')" | jq -c '{id,hedef_miktar}'
    j -X POST "$O/planlar/$PLAN_ID/yayinla" -H "authorization: Bearer $HOCA" -d '{}' | head -c 200; echo
    printf 'KURUM=%s\nGRUP=%s\nHOCA_TEL=%s\nOGR_TEL=%s\nH1_OTURUM=%s\nOG_OTURUM=%s\nOG_UYELIK=%s\nH1_UYELIK=%s\nUSLU=%s\nDENKLEM=%s\n' \
      "$KURUM" "$GRUP" "$HOCA_TEL" "$OGR_TEL" "$H1_OTURUM" "$OG_OTURUM" "$OG_UYELIK" "$H1_UYELIK" "$USLU" "$DENKLEM" > "$STATE"
    echo "kurum: $KURUM"
    echo "ogretmen telefonu: $HOCA_TEL    ogrenci telefonu: $OGR_TEL   (OTP: '$0 otp <telefon>')"
    ;;
  otp)
    : "${2:?telefon verilmeli (05321234567 gibi)}"
    son_kod "$(e164 "$2")"
    ;;
  durum)
    durumu_yukle
    HOCA=$(token "$H1_OTURUM" "$KURUM"); OGT=$(token "$OG_OTURUM" "$KURUM"); O="$API/v1/ogrenme/kurumlar/$KURUM"
    adim "Ogrencinin son 30 gunluk kayitlari"
    j "$O/gunluk-soru/kayitlar" -H "authorization: Bearer $OGT" | jq -c '.kayitlar[] | {gun,konu_ad,zorluk,dogru,yanlis,bos,dosya:(.dosyalar|length),kaynak:(.kaynak_metin // .kaynak_test_id)}'
    adim "Ogretmenin konu analizi ve onerileri (matematik, 30 gun)"
    j "$O/ogrenciler/$OG_UYELIK/gunluk-soru/analiz?brans_kodu=matematik&donem=30" -H "authorization: Bearer $HOCA" | jq -c '{konular:[.konular[]|{konu_ad,bant:.bant.durum,bant_adi:.bant.bant}],oneriler:[.oneriler[]|{tur,konu_ad}]}'
    adim "Ogrencinin plan gorevleri (yarin)"
    YARIN=$(python3 -c 'import datetime as d; print((d.date.today()+d.timedelta(days=1)).isoformat())')
    j "$O/gorevlerim?gun=$YARIN" -H "authorization: Bearer $OGT" | jq -c '.gorevler[]|{gun,baslik,hedef_miktar}'
    adim "Ogrenci XP"
    j "$MOT/v1/motivasyon/kurumlar/$KURUM/benim" -H "authorization: Bearer $OGT" | jq -c '{toplam_xp,seviye}'
    ;;
  *)
    sed -n 2,13p "$0"
    exit 2
    ;;
esac
