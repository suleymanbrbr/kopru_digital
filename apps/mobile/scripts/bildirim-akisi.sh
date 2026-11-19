#!/usr/bin/env bash
# Mobil bildirim akisi: simulatorde elle denenecek veriyi hazirlar ve bildirim uretir (gercek api +
# bildirim servisi + iki worker, log push saglayicisi). Mobil uygulama TELEFON + OTP ile girdigi icin
# kullanicilar telefonla olusturulur (OTP kodu api logundaki `[DEV SMS]` satirindan okunur).
#
# Kullanim (repo kokunden):
#   apps/mobile/scripts/bildirim-akisi.sh hazirla        kurum + ogretmen + ogrenci; telefon ve kodlari yazar
#   apps/mobile/scripts/bildirim-akisi.sh bildirim-uret  ogrenci soru sorar, ogretmen cevaplar ("Sorun cevaplandi")
#   apps/mobile/scripts/bildirim-akisi.sh soru-sor       ogrenci soru sorar (ogretmene "yeni soru" bildirimi gider)
#   apps/mobile/scripts/bildirim-akisi.sh durum          cihaz kayitlari, kutu ve gonderim satirlari
#   apps/mobile/scripts/bildirim-akisi.sh otp <telefon>  son OTP kodunu yazar (simulatorde girisi tamamlamak icin)
#
# On kosul: services/bildirim/scripts/bildirim-akisi.sh basligindaki servis kurulumu (api, api worker,
# bildirim, bildirim worker, AYRI NATS, iki veritabani). Bu paketteki degerler:
#   NATS nats://localhost:4532 (konteyner m1-nats), api 4581, bildirim 4582,
#   veritabanlari kopru_api_m1 / kopru_bildirim_m1 (Postgres 5433), API_LOG ve WORKER_LOG dosya yollari.
# Gerekenler: curl, jq, docker, python3, uuidgen. bash 3.2 (macOS) uyumlu.
set -euo pipefail

API="${API:-http://localhost:4581}"
BIL="${BIL:-http://localhost:4582}"
API_DB="${API_DB:-kopru_api_m1}"
BIL_DB="${BIL_DB:-kopru_bildirim_m1}"
API_LOG="${API_LOG:?API_LOG: api sunucusunun log dosyasi (OTP kodu icin) verilmeli}"
STATE="${STATE:-${TMPDIR:-/tmp}/mobil-bildirim-akisi.state}"
PAROLA_KODU="${PAROLA_KODU:-}"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
asql() { docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d "$API_DB" -v ON_ERROR_STOP=1 -c "$1"; }
bsql() { docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d "$BIL_DB" -v ON_ERROR_STOP=1 -c "$1"; }

# ---- OTP ile giris (api logundan kod okunur) -------------------------------------------------
son_kod() { # $1 telefon (E.164)
  grep "DEV SMS" "$API_LOG" | grep -F "\"dev_telefon\":\"$1\"" | tail -1 | jq -r '.dev_kod'
}
e164() { printf '+9%s' "$1"; } # 05321234567 -> +905321234567
otp_giris() { # $1 yerel telefon (0532...) -> oturum belirteci
  local tel e kod
  tel="$1"; e=$(e164 "$tel")
  j -X POST "$API/auth/otp/gonder" -d "$(jq -nc --arg t "$tel" '{telefon:$t}')" >/dev/null
  sleep 1
  kod=$(son_kod "$e")
  j -X POST "$API/auth/otp/dogrula" -d "$(jq -nc --arg t "$tel" --arg k "$kod" '{telefon:$t,kod:$k}')" | jq -r '.oturum_belirteci'
}
token() { j -X POST "$API/auth/token" -H "authorization: Bearer $1" -d "$(jq -nc --arg k "${2:-}" 'if $k == "" then {} else {kurum_id:$k} end')" | jq -r '.access_token'; }
riza() { local id; for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null; done; }
davetle() { # $1 sahip token, $2 rol, $3 yerel telefon -> "uyelik_id oturum"
  local belirtec oturum ilk
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')" | jq -r '.belirtec')
  oturum=$(otp_giris "$3"); ilk=$(token "$oturum"); riza "$ilk"
  j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg b "$belirtec" '{belirtec:$b}')" | jq -r '.uyelik_id' | tr -d '\n'
  printf ' %s' "$oturum"
}
medya_hazir() { # $1 sahip kullanici -> dosya_id (api'ye `medya.dosya.hazir.v1` outbox olayi; gercek medya servisi yok)
  local id olay
  id=$(uuidgen | tr 'A-Z' 'a-z')
  olay=$(jq -nc --arg id "$(python3 -c 'import uuid,time;print(uuid.UUID(int=(int(time.time()*1000)<<80)|(7<<76)|(2<<62)|(uuid.uuid4().int&((1<<62)-1))))')" --arg k "$KURUM" --arg d "$id" --arg u "$1" \
    '{id:$id,type:"medya.dosya.hazir",version:1,occurredAt:(now|todate),kurumId:$k,actor:{tur:"servis",id:"medya"},correlationId:"mobil-bildirim",data:{dosya_id:$d,sahip_kullanici_id:$u,sahip_uyelik_id:$u,tur:"soru_fotografi",mime_tipi:"image/jpeg",boyut_bayt:350000,genislik:800,yukseklik:600,sure_sn:null,kucuk_resim_var:true}}')
  asql "insert into ortak.outbox (id, kurum_id, subject, payload) values ('$(echo "$olay" | jq -r .id)', '$KURUM', 'evt.medya.dosya.hazir.v1', '$olay'::jsonb)" >/dev/null
  local i; for i in $(seq 1 40); do [ "$(asql "select count(*) from ortak.medya_dosya_kopyalari where id = '$id'")" = "1" ] && { printf '%s' "$id"; return 0; }; sleep 0.5; done
  echo "BASARISIZ: medya kopyasi olusmadi ($id)" >&2; exit 1
}

durumu_yukle() {
  [ -f "$STATE" ] || { echo "Once '$0 hazirla' calistirin ($STATE yok)." >&2; exit 2; }
  # shellcheck disable=SC1090
  . "$STATE"
  O="$API/v1/ogrenme/kurumlar/$KURUM"
}

komut="${1:-}"
case "$komut" in
  hazirla)
    RUN="$RANDOM$RANDOM"
    SON5=$(printf '%05d' $((RUN % 100000)))
    SAHIP_TEL="05329${SON5}0"; HOCA_TEL="05329${SON5}1"; OGR_TEL="05329${SON5}2"
    adim "Kurum, grup, ogretmen (matematik) ve ogrenci (telefonla)"
    S_OTURUM=$(otp_giris "$SAHIP_TEL"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
    KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Mobil Bildirim Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
    S=$(token "$S_OTURUM" "$KURUM")
    H="$API/v1/hesap/kurumlar/$KURUM"
    GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"11-A"}' | jq -r '.id')
    H1_BILGI=$(davetle "$S" ogretmen "$HOCA_TEL"); H1_UYELIK=${H1_BILGI%% *}; H1_OTURUM=${H1_BILGI##* }
    curl -sS -o /dev/null -X POST "$H/gruplar/$GRUP/atamalar" -H 'content-type: application/json' -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$H1_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')"
    OG_BILGI=$(davetle "$S" ogrenci "$OGR_TEL"); OG_UYELIK=${OG_BILGI%% *}; OG_OTURUM=${OG_BILGI##* }
    curl -sS -o /dev/null -X POST "$H/gruplar/$GRUP/uyeler" -H 'content-type: application/json' -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OG_UYELIK" '{ogrenci_idleri:[$a]}')"
    OG_K=$(asql "select kullanici_id from hesap.uyelikler where id = '$OG_UYELIK'")
    printf 'KURUM=%s\nGRUP=%s\nHOCA_TEL=%s\nOGR_TEL=%s\nH1_OTURUM=%s\nOG_OTURUM=%s\nOG_K=%s\nOG_UYELIK=%s\nH1_UYELIK=%s\n' \
      "$KURUM" "$GRUP" "$HOCA_TEL" "$OGR_TEL" "$H1_OTURUM" "$OG_OTURUM" "$OG_K" "$OG_UYELIK" "$H1_UYELIK" > "$STATE"
    echo "kurum: $KURUM"
    echo "ogretmen telefonu: $HOCA_TEL    ogrenci telefonu: $OGR_TEL   (OTP: '$0 otp <telefon>')"
    echo "durum dosyasi: $STATE"
    ;;
  otp)
    : "${2:?telefon verilmeli (05321234567 gibi)}"
    kod=$(son_kod "$(e164 "$2")")
    echo "$kod"
    ;;
  soru-sor | bildirim-uret)
    durumu_yukle
    OG=$(token "$OG_OTURUM" "$KURUM"); H1=$(token "$H1_OTURUM" "$KURUM")
    adim "Ogrenci soru sorar ($komut)"
    F=$(medya_hazir "$OG_K")
    SORU=$(j -X POST "$O/sorular" -H "authorization: Bearer $OG" -d "$(jq -nc --arg f "$F" --arg b "Turev sorusu $RANDOM" '{brans_kodu:"matematik",baslik:$b,metin:"Burada takildim",fotograflar:[$f]}')" | jq -r .id)
    echo "soru: $SORU"
    if [ "$komut" = "bildirim-uret" ]; then
      adim "Ogretmen cevaplar -> ogrenciye 'Sorun cevaplandi' (kutu + push)"
      j -X POST "$O/sorular/$SORU/cevap" -H "authorization: Bearer $H1" -d '{"metin":"Once turev al, sonra sifira esitle"}' >/dev/null
    fi
    sleep 7
    echo "ogrenci kutusu:"; curl -sS "$BIL/v1/bildirim/kurumlar/$KURUM/kutu" -H "authorization: Bearer $OG" | jq -c '.ogeler[] | {id,baslik,derin_baglanti,okundu_at}'
    ;;
  durum)
    durumu_yukle
    adim "Cihaz kayitlari (ogrenci kullanicisi)"
    bsql "select platform, left(push_belirteci, 40), cihaz_kimligi, aktif, son_gorulme_at from bildirim.cihazlar where kullanici_id = '$OG_K'"
    adim "Gonderimler"
    bsql "select durum || coalesce(' (' || atlama_nedeni || ')', ''), kanal, baslik from bildirim.gonderimler where kurum_id = '$KURUM' order by created_at"
    adim "Kutu (okunmamis sayisi)"
    OG=$(token "$OG_OTURUM" "$KURUM")
    curl -sS "$BIL/v1/bildirim/kurumlar/$KURUM/kutu/okunmamis-sayisi" -H "authorization: Bearer $OG"; echo
    ;;
  *)
    sed -n 2,12p "$0"
    exit 2
    ;;
esac
