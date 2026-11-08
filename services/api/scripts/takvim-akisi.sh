#!/usr/bin/env bash
# Ders takvimi akisi: uctan uca curl senaryosu. Tekrar calistirilabilir (her calistirmada yeni
# kullanici/e-posta/kurum; OTP kullanmaz, e-posta+parola ile girer). bash 3.2 (macOS) uyumlu.
#
# Akis: seri olustur -> listele -> tek dersi tasi (yalniz bu) -> bu ve sonrakileri iptal et ->
# ogretmen cakismasi 409 -> onayla -> ogrenci kapsami.
#
# On kosul: api 4210 portunda, ayri veritabaninda (kopru_paket_l); NATS (4222) acik:
#   docker exec kopru-postgres-1 createdb -U postgres kopru_paket_l
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_paket_l \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_l \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_paket_l \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
#          API_PORT=4210 API_PUBLIC_URL=http://localhost:4210 NATS_URL=nats://localhost:4222
#   pnpm --filter @kopru/api db:migrate && pnpm --filter @kopru/api dev > /tmp/api4210.log 2>&1 &
# Kullanim (repo kokunden): services/api/scripts/takvim-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4210}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
BASLANGIC="2030-01-07" # Pazartesi; saat dilimi sabit UTC+3 (Europe/Istanbul)

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }

kayit() { # $1 eposta $2 ad -> oturum belirteci
  local govde
  govde=$(jq -nc --arg e "$1" --arg p "$PAROLA" --arg a "$2" '{eposta:$e,parola:$p,gorunen_ad:$a}')
  j -X POST "$API/auth/eposta/kayit" -d "$govde" | jq -r '.oturum_belirteci'
}
token() { # $1 oturum belirteci, $2 (ops.) kurum_id -> erisim belirteci
  local govde
  govde=$(jq -nc --arg k "${2:-}" 'if $k == "" then {} else {kurum_id:$k} end')
  j -X POST "$API/auth/token" -H "authorization: Bearer $1" -d "$govde" | jq -r '.access_token'
}
riza() { # $1 erisim belirteci: guncel KVKK metinlerini kabul eder
  local id
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
    j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null
  done
}
davetle() { # $1 sahip token, $2 rol, $3 eposta, $4 ad -> uyelik_id ; $KURUM kullanilir
  local belirtec oturum ilk
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')" | jq -r '.belirtec')
  oturum=$(kayit "$3" "$4"); ilk=$(token "$oturum"); riza "$ilk"
  j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg b "$belirtec" '{belirtec:$b}')" | jq -r '.uyelik_id' | tr -d '\n'
  printf ' %s' "$oturum"
}

adim "1) Sahip: kayit, KVKK, kurum, grup, ogretmen ve iki ogrenci"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Takvim Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"
D="$API/v1/ders/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"8-A Matematik"}' | jq -r '.id')
HOCA_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca")
HOCA_UYELIK=${HOCA_BILGI%% *}; HOCA_OTURUM=${HOCA_BILGI##* }
sart "ogretmen atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
O1_BILGI=$(davetle "$S" ogrenci "ogr1$RUN@example.com" "Ali Ogrenci")
O1_UYELIK=${O1_BILGI%% *}; O1_OTURUM=${O1_BILGI##* }
O2_BILGI=$(davetle "$S" ogrenci "ogr2$RUN@example.com" "Berk Ogrenci")
O2_UYELIK=${O2_BILGI%% *}
sart "iki ogrenci gruba eklendi (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$O1_UYELIK" --arg b "$O2_UYELIK" '{ogrenci_idleri:[$a,$b]}')")" 201
HOCA=$(token "$HOCA_OTURUM" "$KURUM")
O1=$(token "$O1_OTURUM" "$KURUM")
echo "kurum: $KURUM  grup: $GRUP  ogretmen uyelik: $HOCA_UYELIK"

adim "2) Seri olustur: her Pazartesi 16:00, 60 dk, 4 ders (ogretmen kendi adina)"
SERI_GOVDE=$(jq -nc --arg g "$GRUP" --arg b "$BASLANGIC" '{grup_id:$g,tekrar_kurali:"FREQ=WEEKLY;BYDAY=MO",baslangic_tarihi:$b,baslangic_saati:"16:00",sure_dk:60,adet:4,online_baglanti:"https://meet.example/8a"}')
SERI=$(j -X POST "$D/seriler" -H "authorization: Bearer $HOCA" -d "$SERI_GOVDE")
echo "$SERI" | jq -c '{seri: .seri.tekrar_kurali, durum: .seri.durum, uretilen: (.dersler | length), atlanan: (.atlanan | length)}'
sart "uretilen ders sayisi" "$(echo "$SERI" | jq '.dersler | length')" 4
sart "ilk ders UTC (16:00 UTC+3 = 13:00Z)" "$(echo "$SERI" | jq -r '.dersler[0].baslangic_at')" "${BASLANGIC}T13:00:00.000Z"
sart "katilimci sayisi" "$(echo "$SERI" | jq '.dersler[0].katilimci_sayisi')" 2
sart "seri sirasi 0..3" "$(echo "$SERI" | jq -c '[.dersler[].seri_sirasi]')" "[0,1,2,3]"
D0=$(echo "$SERI" | jq -r '.dersler[0].id'); D1=$(echo "$SERI" | jq -r '.dersler[1].id')
D2=$(echo "$SERI" | jq -r '.dersler[2].id'); D3=$(echo "$SERI" | jq -r '.dersler[3].id')
sart "gecersiz tekrar kurali (400)" "$(durum -X POST "$D/seriler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg g "$GRUP" --arg b "$BASLANGIC" '{grup_id:$g,tekrar_kurali:"FREQ=MONTHLY",baslangic_tarihi:$b,baslangic_saati:"16:00",sure_dk:60,adet:4}')")" 400

adim "3) Listele (aralik zorunlu) ve ogrenci kapsami"
ARALIK="baslangic=2030-01-01T00:00:00Z&bitis=2030-02-15T00:00:00Z"
LISTE=$(j "$D/dersler?$ARALIK" -H "authorization: Bearer $HOCA")
sart "ogretmen listesi" "$(echo "$LISTE" | jq '.dersler | length')" 4
sart "aralik olmadan 400" "$(durum "$D/dersler" -H "authorization: Bearer $HOCA")" 400
sart "100 gunu asan aralik 400" "$(durum "$D/dersler?baslangic=2030-01-01T00:00:00Z&bitis=2030-06-01T00:00:00Z" -H "authorization: Bearer $HOCA")" 400
sart "ogrenci kendi derslerini gorur" "$(j "$D/dersler?$ARALIK" -H "authorization: Bearer $O1" | jq '.dersler | length')" 4
sart "ogrenci online baglantiyi gorur" "$(j "$D/dersler/$D0" -H "authorization: Bearer $O1" | jq -r '.online_baglanti')" "https://meet.example/8a"
sart "ogrenci ders olusturamaz (403)" "$(durum -X POST "$D/dersler" -H "authorization: Bearer $O1" -d "$(jq -nc --arg g "$GRUP" '{grup_id:$g,tarih:"2030-03-04",baslangic_saati:"10:00",sure_dk:60,brans_kodu:"matematik"}')")" 403

adim "4) Tek dersi tasi (yalniz bu): 2. ders Sali 18:00; seriden ayrilir"
TASI=$(j -X POST "$D/dersler/$D1/tasi" -H "authorization: Bearer $HOCA" -d '{"surum":1,"yeni_tarih":"2030-01-15","yeni_saat":"18:00"}')
echo "$TASI" | jq -c '{baslangic: .ders.baslangic_at, istisna: .ders.seri_istisna, ertelendi: .ders.ertelendi_sayisi, surum: .ders.surum}'
sart "yeni UTC (18:00 UTC+3 = 15:00Z)" "$(echo "$TASI" | jq -r '.ders.baslangic_at')" "2030-01-15T15:00:00.000Z"
sart "seri istisnasi" "$(echo "$TASI" | jq '.ders.seri_istisna')" true
sart "ilk planlanan zaman korunur" "$(echo "$TASI" | jq -r '.ders.ilk_baslangic_at')" "2030-01-14T13:00:00.000Z"
sart "eski surum 409 (iyimser kilit)" "$(durum -X POST "$D/dersler/$D1/tasi" -H "authorization: Bearer $HOCA" -d '{"surum":1,"yeni_saat":"19:00"}')" 409

adim "5) Bu ve sonrakileri iptal et (3. dersten): istisna ders korunur, seri biter"
IPTAL=$(j -X POST "$D/dersler/$D2/iptal" -H "authorization: Bearer $HOCA" -d '{"kapsam":"bu_ve_sonrakiler","iptal_kaynagi":"ogretmen","iptal_nedeni":"Donem sonu"}')
echo "$IPTAL" | jq -c '{durum: .ders.durum, etkilenen: (.etkilenen_ders_idleri | length)}'
sart "etkilenen ders sayisi (3. ve 4.)" "$(echo "$IPTAL" | jq '.etkilenen_ders_idleri | length')" 2
sart "3. ders iptal" "$(j "$D/dersler/$D2" -H "authorization: Bearer $HOCA" | jq -r '.durum')" iptal
sart "4. ders iptal" "$(j "$D/dersler/$D3" -H "authorization: Bearer $HOCA" | jq -r '.durum')" iptal
sart "istisna (tasinmis) 2. ders planli kalir" "$(j "$D/dersler/$D1" -H "authorization: Bearer $HOCA" | jq -r '.durum')" planli
sart "1. ders planli kalir" "$(j "$D/dersler/$D0" -H "authorization: Bearer $HOCA" | jq -r '.durum')" planli
sart "iptal edilmis ders tekrar iptal edilemez (409)" "$(durum -X POST "$D/dersler/$D2/iptal" -H "authorization: Bearer $HOCA" -d '{"iptal_kaynagi":"ogretmen"}')" 409
sart "ogrenci kaynakli iptal grup dersinde 422" "$(durum -X POST "$D/dersler/$D0/iptal" -H "authorization: Bearer $HOCA" -d '{"iptal_kaynagi":"ogrenci"}')" 422

adim "6) Ogretmen cakismasi: ayni saate tekil ders -> 409 ders_cakismasi; cakisma_onayli ile 201"
CAKISAN=$(jq -nc --arg g "$GRUP" '{grup_id:$g,tarih:"2030-01-07",baslangic_saati:"16:30",sure_dk:45}')
KOD=$(durum -X POST "$D/dersler" -H "authorization: Bearer $HOCA" -d "$CAKISAN")
sart "cakisma (409)" "$KOD" 409
YANIT=$(j -X POST "$D/dersler" -H "authorization: Bearer $HOCA" -d "$CAKISAN")
echo "$YANIT" | jq -c '{kod: .error.code, cakisan: (.error.details.cakisanlar | length)}'
sart "hata kodu" "$(echo "$YANIT" | jq -r '.error.code')" ders_cakismasi
sart "cakisan ders listelenir" "$(echo "$YANIT" | jq -r '.error.details.cakisanlar[0].id')" "$D0"
ONAYLI=$(jq -nc --arg g "$GRUP" '{grup_id:$g,tarih:"2030-01-07",baslangic_saati:"16:30",sure_dk:45,cakisma_onayli:true}')
sart "onayli yazim (201)" "$(durum -X POST "$D/dersler" -H "authorization: Bearer $HOCA" -d "$ONAYLI")" 201
sart "baska kurum yolu 403" "$(durum "$API/v1/ders/kurumlar/00000000-0000-7000-8000-000000000000/dersler?$ARALIK" -H "authorization: Bearer $HOCA")" 403

adim "7) Takvim modulu kapaninca uclar kaybolur"
sart "modul kapatma (200)" "$(durum -X PUT "$H/modul-ayarlari" -H "authorization: Bearer $S" -d '{"modul_kodu":"takvim","kapsam":"kurum","acik":false}')" 200
sart "kapali modul 403" "$(durum "$D/dersler?$ARALIK" -H "authorization: Bearer $HOCA")" 403
sart "hata kodu modul_kapali" "$(j "$D/dersler?$ARALIK" -H "authorization: Bearer $HOCA" | jq -r '.error.code')" modul_kapali

printf '\nTUM ADIMLAR GECTI\n'
