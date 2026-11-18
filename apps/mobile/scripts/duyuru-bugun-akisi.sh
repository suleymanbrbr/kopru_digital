#!/usr/bin/env bash
# Mobil duyuru + Bugun akisi: simulatorde elle denenecek veriyi hazirlar (gercek api + bildirim + motivasyon
# + worker'lar, log push saglayicisi). Mobil uygulama TELEFON + OTP ile girer; OTP kodu api logundaki `[DEV SMS]`
# satirindan okunur.
#
# Kullanim (repo kokunden):
#   apps/mobile/scripts/duyuru-bugun-akisi.sh hazirla         kurum + grup + ogretmen + ogrenci + bugunun dersleri + plan gorevi + odev
#   apps/mobile/scripts/duyuru-bugun-akisi.sh otp <telefon>   son OTP kodu
#   apps/mobile/scripts/duyuru-bugun-akisi.sh duyuru-yaz      ogretmen 11-A'ya duyuru yayinlar (push dahil), kimligi yazar
#   apps/mobile/scripts/duyuru-bugun-akisi.sh ogrenci-okur    ogrenci okunmamis duyurulari okundu yapar (API)
#   apps/mobile/scripts/duyuru-bugun-akisi.sh durum           duyuru sayaclari (okunan / alici) ve ogrenci kutusu
#
# On kosul: ayri NATS (m2-nats, 4832), api 4841, bildirim 4842, motivasyon 4843 ve worker'lar; veritabanlari
# kopru_api_m2 / kopru_bildirim_m2 / kopru_motivasyon_m2 (Postgres 5433). Servis kurulumu icin
# services/bildirim/scripts/duyuru-akisi.sh ve services/motivasyon/scripts/seri-akisi.sh basliklarina bak.
# API_LOG zorunlu (api sunucusunun log dosyasi). Gerekenler: curl, jq, docker, python3. bash 3.2 uyumlu.
set -euo pipefail

API="${API:-http://localhost:4841}"
BIL="${BIL:-http://localhost:4842}"
API_DB="${API_DB:-kopru_api_m2}"
API_LOG="${API_LOG:?API_LOG: api sunucusunun log dosyasi (OTP kodu icin) verilmeli}"
STATE="${STATE:-${TMPDIR:-/tmp}/mobil-duyuru-bugun.state}"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
asql() { docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d "$API_DB" -v ON_ERROR_STOP=1 -c "$1"; }

son_kod() { grep "DEV SMS" "$API_LOG" | grep -F "\"telefon\":\"$1\"" | tail -1 | jq -r '.kod'; }
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

komut="${1:-}"
case "$komut" in
  hazirla)
    RUN="$RANDOM$RANDOM"; SON5=$(printf '%05d' $((RUN % 100000)))
    SAHIP_TEL="05328${SON5}0"; HOCA_TEL="05328${SON5}1"; OGR_TEL="05328${SON5}2"
    adim "Kurum, grup (11-A), ogretmen (atamali), ogrenci"
    S_OTURUM=$(otp_giris "$SAHIP_TEL"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
    KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Mobil Duyuru Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
    S=$(token "$S_OTURUM" "$KURUM"); H="$API/v1/hesap/kurumlar/$KURUM"
    GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"11-A"}' | jq -r '.id')
    H1=$(davetle "$S" ogretmen "$HOCA_TEL"); H1_UYELIK=${H1%% *}; H1_OTURUM=${H1##* }
    curl -sS -o /dev/null -X POST "$H/gruplar/$GRUP/atamalar" -H 'content-type: application/json' -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$H1_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')"
    OG=$(davetle "$S" ogrenci "$OGR_TEL"); OG_UYELIK=${OG%% *}; OG_OTURUM=${OG##* }
    curl -sS -o /dev/null -X POST "$H/gruplar/$GRUP/uyeler" -H 'content-type: application/json' -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OG_UYELIK" '{ogrenci_idleri:[$a]}')"
    HOCA=$(token "$H1_OTURUM" "$KURUM")
    adim "Bugunun dersleri (biri baslamis: yoklamasi alinmamis), odev, bugunun plan gorevleri"
    BUGUN=$(python3 -c 'import datetime as d; print(d.datetime.now().strftime("%Y-%m-%d"))')
    SAAT_ONCE=$(python3 -c 'import datetime as d; print((d.datetime.now()-d.timedelta(hours=2)).strftime("%H:%M"))')
    SAAT_SONRA=$(python3 -c 'import datetime as d; print((d.datetime.now()+d.timedelta(hours=3)).strftime("%H:%M"))')
    for saat in "$SAAT_ONCE" "$SAAT_SONRA"; do
      j -X POST "$API/v1/ders/kurumlar/$KURUM/dersler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg g "$GRUP" --arg t "$BUGUN" --arg s "$saat" '{grup_id:$g,tarih:$t,baslangic_saati:$s,sure_dk:60,brans_kodu:"matematik"}')" | head -c 400; echo
    done
    O="$API/v1/ogrenme/kurumlar/$KURUM"
    SON=$(python3 -c 'import datetime as d; print((d.datetime.now(d.timezone.utc)+d.timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ"))')
    ODEV_ID=$(j -X POST "$O/odevler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg g "$GRUP" --arg s "$SON" '{baslik:"Turev tekrar",brans_kodu:"matematik",tur:"soru",kaynak:"X Yayinlari",hedef_soru_sayisi:20,hedef_turu:"grup",hedef_id:$g,son_teslim_at:$s}')" | jq -r '.id')
    j -X POST "$O/odevler/$ODEV_ID/yayinla" -H "authorization: Bearer $HOCA" -d '{}' | head -c 300; echo
    PAZARTESI=$(python3 -c 'import datetime as d; t=d.date.today(); print((t-d.timedelta(days=t.weekday())).isoformat())')
    PLAN_ID=$(j -X POST "$O/planlar" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$OG_UYELIK" --arg h "$PAZARTESI" '{ogrenci_id:$o,hafta_baslangic:$h}')" | jq -r '(.plan.id // .id)')
    for g in "matematik soru 20" "fizik dakika 30" "kimya soru 15"; do
      set -- $g
      j -X POST "$O/planlar/$PLAN_ID/gorevler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg g "$BUGUN" --arg b "$1" --arg t "$2" --argjson m "$3" '{gun:$g,brans_kodu:$b,hedef_turu:$t,hedef_miktar:$m}')" >/dev/null
    done
    j -X POST "$O/planlar/$PLAN_ID/yayinla" -H "authorization: Bearer $HOCA" -d '{}' | head -c 300; echo
    printf 'KURUM=%s\nGRUP=%s\nHOCA_TEL=%s\nOGR_TEL=%s\nH1_OTURUM=%s\nOG_OTURUM=%s\nOG_UYELIK=%s\nH1_UYELIK=%s\n' \
      "$KURUM" "$GRUP" "$HOCA_TEL" "$OGR_TEL" "$H1_OTURUM" "$OG_OTURUM" "$OG_UYELIK" "$H1_UYELIK" > "$STATE"
    echo "kurum: $KURUM"
    echo "ogretmen telefonu: $HOCA_TEL    ogrenci telefonu: $OGR_TEL   (OTP: '$0 otp <telefon>')"
    ;;
  otp)
    : "${2:?telefon verilmeli (05321234567 gibi)}"
    son_kod "$(e164 "$2")"
    ;;
  duyuru-yaz)
    durumu_yukle
    HOCA=$(token "$H1_OTURUM" "$KURUM"); D="$BIL/v1/bildirim/kurumlar/$KURUM/duyurular"
    adim "Ogretmen 11-A'ya duyuru yazar ve yayinlar"
    ID=$(j -X POST "$D" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg g "$GRUP" --arg b "Cuma deneme sinavi ${RANDOM}" '{baslik:$b,govde:"Cuma 4. derste deneme var. Konu listesi: https://ornek.com/konular",hedef_turu:"grup",hedef_id:$g,sabit:true}')" | jq -r '.id')
    j -X POST "$D/$ID/yayinla" -H "authorization: Bearer $HOCA" -d '{}' | jq -c '{id,durum,alici_sayisi,okunan_sayisi}'
    echo "DUYURU_ID=$ID" >> "$STATE"; echo "duyuru: $ID"
    ;;
  ogrenci-okur)
    # Ogrenci en yeni (okunmamis) duyuruyu okundu isaretler: ogretmenin sayaci artar (uygulamadan acmanin API karsiligi).
    durumu_yukle
    OGT=$(token "$OG_OTURUM" "$KURUM"); D="$BIL/v1/bildirim/kurumlar/$KURUM/duyurular"
    for id in $(j "$D?okunmamis=true" -H "authorization: Bearer $OGT" | jq -r '.ogeler[].id'); do
      j -X POST "$D/$id/okundu" -H "authorization: Bearer $OGT" -d '{}' | jq -c .
    done
    ;;
  durum)
    durumu_yukle
    HOCA=$(token "$H1_OTURUM" "$KURUM"); OGT=$(token "$OG_OTURUM" "$KURUM")
    adim "Ogretmen yonetim listesi (okunan / alici)"
    j "$BIL/v1/bildirim/kurumlar/$KURUM/duyurular/yonetim" -H "authorization: Bearer $HOCA" | jq -c '.ogeler[] | {baslik,durum,alici_sayisi,okunan_sayisi}'
    adim "Ogrenci duyurularim"
    j "$BIL/v1/bildirim/kurumlar/$KURUM/duyurular" -H "authorization: Bearer $OGT" | jq -c '.ogeler[] | {id,baslik,okundu_at}'
    ;;
  *)
    sed -n 2,11p "$0"
    exit 2
    ;;
esac
