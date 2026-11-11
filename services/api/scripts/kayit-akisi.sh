#!/usr/bin/env bash
# Ders kayitlari ve materyaller akisi: uctan uca curl senaryosu. Ogretmen derse 3 link ekler (tek istek) ->
# gecersiz url 422 -> gruba secili ogrenciye materyal -> ogrenciler "Kayitlarim"i listeler, parolayi tekil
# okumada gorur -> "izledim" (idempotent) -> "acilmiyor" bildirimi (ikincisi 409) -> ogretmen izleyenleri ve
# bozuk durumunu gorur, duzeltir -> gizler/siler -> outbox sayilari. Tekrar calistirilabilir (her calistirmada
# yeni kullanici/kurum). bash 3.2 (macOS) uyumlu; JSON govdeleri `jq -nc --arg` ile `$( )` DISINDA kurulur.
#
# On kosul: api 4260 portunda, ayri veritabaninda (kopru_paket_a); NATS (4222) acik; parola anahtari tanimli:
#   docker exec kopru-postgres-1 createdb -U postgres kopru_paket_a
#   export API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_paket_a \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem
#   pnpm --filter @kopru/api db:migrate
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_paket_a \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_a \
#          API_PORT=4260 API_PUBLIC_URL=http://localhost:4260 NATS_URL=nats://localhost:4222 \
#          API_KAYNAK_PAROLA_ANAHTARI="$(openssl rand -base64 32)"
#   pnpm --filter @kopru/api dev > /tmp/api4260.log 2>&1 &
# Outbox sayilari icin `docker exec kopru-postgres-1 psql` kullanilir (DB adi: $DB, varsayilan kopru_paket_a).
# Kullanim (repo kokunden): services/api/scripts/kayit-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4260}"
DB="${DB:-kopru_paket_a}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
silme() { curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$@"; } # bos govdeli DELETE'e content-type: json eklenmez (400 olur)
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
dun() { date -u -v-1d +%F 2>/dev/null || date -u -d 'yesterday' +%F; }
sql() { docker exec kopru-postgres-1 psql -U postgres -d "$DB" -tAc "$1"; }

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
  local id govde
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
    govde=$(jq -nc --arg i "$id" '{riza_metni_id:$i}')
    j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$govde" >/dev/null
  done
}
davetle() { # $1 sahip token, $2 rol, $3 eposta, $4 ad -> "uyelik_id oturum" ; $KURUM kullanilir
  local davet belirtec oturum ilk kabul uyelik
  davet=$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$davet" | jq -r '.belirtec')
  oturum=$(kayit "$3" "$4"); ilk=$(token "$oturum"); riza "$ilk"
  kabul=$(jq -nc --arg b "$belirtec" '{belirtec:$b}')
  uyelik=$(j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$kabul" | jq -r '.uyelik_id')
  printf '%s %s' "$uyelik" "$oturum"
}

adim "1) Sahip: kayit, KVKK, kurum, grup, ogretmen (atanmis) ve iki ogrenci (gruba eklenir); dun 10:00 dersi"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM_GOVDE=$(jq -nc '{ad:"Kayit Deneme Kurumu",tur:"kurum"}')
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d "$KURUM_GOVDE" | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"
D="$API/v1/ders/kurumlar/$KURUM"
GRUP_GOVDE=$(jq -nc '{tur:"grup",ad:"8-A Matematik"}')
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d "$GRUP_GOVDE" | jq -r '.id')
HOCA_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca")
HOCA_UYELIK=${HOCA_BILGI%% *}; HOCA_OTURUM=${HOCA_BILGI##* }
ATAMA_GOVDE=$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')
sart "ogretmen atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$ATAMA_GOVDE")" 201
O1_BILGI=$(davetle "$S" ogrenci "ogr1$RUN@example.com" "Ali Ogrenci")
O1=${O1_BILGI%% *}; O1_OTURUM=${O1_BILGI##* }
O2_BILGI=$(davetle "$S" ogrenci "ogr2$RUN@example.com" "Veli Ogrenci")
O2=${O2_BILGI%% *}; O2_OTURUM=${O2_BILGI##* }
UYE_GOVDE=$(jq -nc --arg a "$O1" --arg b "$O2" '{ogrenci_idleri:[$a,$b]}')
sart "ogrenciler gruba eklendi (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$UYE_GOVDE")" 201
HOCA=$(token "$HOCA_OTURUM" "$KURUM")
T1=$(token "$O1_OTURUM" "$KURUM")
T2=$(token "$O2_OTURUM" "$KURUM")
DERS_GOVDE=$(jq -nc --arg g "$GRUP" --arg t "$(dun)" '{grup_id:$g,tarih:$t,baslangic_saati:"10:00",sure_dk:60}')
DERS=$(j -X POST "$D/dersler" -H "authorization: Bearer $HOCA" -d "$DERS_GOVDE" | jq -r '.ders.id')
echo "kurum: $KURUM  grup: $GRUP  ders: $DERS  ogretmen: $HOCA_UYELIK  ogr1: $O1  ogr2: $O2"

adim "2) Ogretmen derse tek istekte 3 kayit linki ekler (Zoom + parola, Drive, YouTube)"
EKLE_GOVDE=$(jq -nc '{tur:"kayit",gorunurluk:"grup",linkler:[
  {baslik:"Ders kaydi (Zoom)",url:"https://us02web.zoom.us/rec/share/abc123",parola:"Zoom-Parola-9"},
  {baslik:"Ders kaydi (Drive)",url:"https://drive.google.com/file/d/1abc/view"},
  {baslik:"Konu ozeti (YouTube)",url:"https://youtu.be/xyz"}]}')
EKLE=$(j -X POST "$D/dersler/$DERS/kaynaklar" -H "authorization: Bearer $HOCA" -d "$EKLE_GOVDE")
sart "3 kaynak olustu" "$(echo "$EKLE" | jq -r '.kaynaklar | length')" 3
sart "saglayicilar alan adindan taninir" "$(echo "$EKLE" | jq -r '[.kaynaklar[].saglayici] | join(",")')" "zoom,drive,youtube"
ZOOM=$(echo "$EKLE" | jq -r '.kaynaklar[0].id')
DRIVE=$(echo "$EKLE" | jq -r '.kaynaklar[1].id')
sart "ekleyen yanitta parolayi gorur" "$(echo "$EKLE" | jq -r '.kaynaklar[0].parola')" "Zoom-Parola-9"
sart "parola veritabaninda sifreli (duz metin yok)" "$(sql "select position('Zoom-Parola' in convert_from(parola_sifreli, 'LATIN1')) from ders.ders_kaynaklari where id = '$ZOOM'")" 0

adim "3) Gecersiz url'ler 422 kaynak_url_gecersiz; baska ogretmen/ogrenci yazamaz"
HTTP_GOVDE=$(jq -nc '{linkler:[{baslik:"x",url:"http://zoom.us/rec/x"}]}')
sart "http:// reddedilir (422)" "$(durum -X POST "$D/dersler/$DERS/kaynaklar" -H "authorization: Bearer $HOCA" -d "$HTTP_GOVDE")" 422
sart "hata kodu" "$(j -X POST "$D/dersler/$DERS/kaynaklar" -H "authorization: Bearer $HOCA" -d "$HTTP_GOVDE" | jq -r '.error.code')" kaynak_url_gecersiz
SAHTE_GOVDE=$(jq -nc '{linkler:[{baslik:"x",url:"https://evilzoom.us/rec/x"}]}')
sart "evilzoom.us zoom sayilmaz (diger)" "$(j -X POST "$D/dersler/$DERS/kaynaklar" -H "authorization: Bearer $HOCA" -d "$SAHTE_GOVDE" | jq -r '.kaynaklar[0].saglayici')" diger
sart "ogrenci kayit ekleyemez (403)" "$(durum -X POST "$D/dersler/$DERS/kaynaklar" -H "authorization: Bearer $T1" -d "$SAHTE_GOVDE")" 403

adim "4) Gruba dersten bagimsiz materyal (yalniz ogr1 gorsun)"
MAT_GOVDE=$(jq -nc --arg o "$O1" '{gorunurluk:"secili_ogrenciler",ogrenci_idleri:[$o],linkler:[{baslik:"Turev konu anlatimi (PDF)",url:"https://ornek.com/turev.pdf"}]}')
MAT=$(j -X POST "$D/gruplar/$GRUP/materyaller" -H "authorization: Bearer $HOCA" -d "$MAT_GOVDE")
MAT_ID=$(echo "$MAT" | jq -r '.kaynaklar[0].id')
sart "materyal derssiz" "$(echo "$MAT" | jq -r '.kaynaklar[0].ders_id')" null

adim "5) Ogrenciler 'Kayitlarim': ogr1 5 satir (3 kayit + diger + materyal), ogr2 4 satir; liste parola tasimaz, tekil okuma tasir"
L1=$(j "$D/kayitlarim?limit=100" -H "authorization: Bearer $T1")
L2=$(j "$D/kayitlarim?limit=100" -H "authorization: Bearer $T2")
sart "ogr1 satir sayisi" "$(echo "$L1" | jq -r '.kayitlar | length')" 5
sart "ogr2 satir sayisi (secili materyal yok)" "$(echo "$L2" | jq -r '.kayitlar | length')" 4
sart "listede parola alani yok" "$(echo "$L1" | jq -r '[.kayitlar[] | has("parola")] | any')" false
sart "satirda ders tarihi, brans ve ogretmen" "$(echo "$L1" | jq -r --arg z "$ZOOM" --arg h "$HOCA_UYELIK" '.kayitlar[] | select(.id == $z) | [.brans_kodu, (.ogretmen_id == $h), (.ders_baslangic_at != null)] | join(",")')" "matematik,true,true"
sart "ogr1 tekil okumada Zoom parolasi" "$(j "$D/kayitlarim/$ZOOM" -H "authorization: Bearer $T1" | jq -r '.parola')" "Zoom-Parola-9"
sart "ogr2 secili materyali goremez (404)" "$(durum "$D/kayitlarim/$MAT_ID" -H "authorization: Bearer $T2")" 404
sart "tur suzgeci: materyal" "$(j "$D/kayitlarim?tur=materyal" -H "authorization: Bearer $T1" | jq -r '.kayitlar | length')" 1
PAGE1=$(j "$D/kayitlarim?limit=2" -H "authorization: Bearer $T1")
IMLEC=$(echo "$PAGE1" | jq -r '.sonraki_imlec')
sart "imlecli sayfalama: 2. sayfa" "$(j "$D/kayitlarim?limit=2&imlec=$IMLEC" -H "authorization: Bearer $T1" | jq -r '.kayitlar | length')" 2

adim "6) 'Izledim' idempotent: ilk true, ikinci false; izlenen satir listenin sonuna gider"
IZ1=$(j -X POST "$D/kayitlarim/$ZOOM/izledim" -H "authorization: Bearer $T1" -d '{}')
sart "ilk isaret" "$(echo "$IZ1" | jq -r '.ilk')" true
IZ2=$(j -X POST "$D/kayitlarim/$ZOOM/izledim" -H "authorization: Bearer $T1" -d '{}')
sart "ikinci isaret" "$(echo "$IZ2" | jq -r '.ilk')" false
sart "ayni izledi_at" "$(echo "$IZ2" | jq -r '.izledi_at')" "$(echo "$IZ1" | jq -r '.izledi_at')"
sart "izlenmis kayit sonda" "$(j "$D/kayitlarim?limit=100" -H "authorization: Bearer $T1" | jq -r '.kayitlar[-1].id == "'"$ZOOM"'"')" true

adim "7) 'Acilmiyor': ogr1 Drive kaydi icin bildirir -> kaynak bozuk; ayni ogrenci tekrar 409; ogr2 bozuk uyarisini gorur"
SORUN_GOVDE=$(jq -nc '{neden:"acilmiyor",aciklama:"Erisim izni istiyor"}')
SORUN=$(j -X POST "$D/kayitlarim/$DRIVE/sorunlar" -H "authorization: Bearer $T1" -d "$SORUN_GOVDE")
sart "kaynak bozuk oldu" "$(echo "$SORUN" | jq -r '.kaynak_durumu')" bozuk
sart "ayni ogrenci ikinci bildirim (409)" "$(durum -X POST "$D/kayitlarim/$DRIVE/sorunlar" -H "authorization: Bearer $T1" -d "$SORUN_GOVDE")" 409
sart "ogr2 listesinde bozuk=true" "$(j "$D/kayitlarim?limit=100" -H "authorization: Bearer $T2" | jq -r --arg d "$DRIVE" '.kayitlar[] | select(.id == $d) | .bozuk')" true

adim "8) Ogretmen: kimin izledigi ve bozuk durum; duzeltince aktif ve bildirimler cozulur"
IZL=$(j "$D/kaynaklar/$ZOOM/izlemeler" -H "authorization: Bearer $HOCA")
sart "izleyen sayisi" "$(echo "$IZL" | jq -r '.izleyenler | length')" 1
sart "izleyen ogr1" "$(echo "$IZL" | jq -r '.izleyenler[0].ogrenci_id')" "$O1"
sart "izlemeyen ogr2" "$(echo "$IZL" | jq -r '.izlemeyenler[0].ogrenci_id')" "$O2"
sart "ogretmen listesinde bozuk ve acik sorun 1" "$(j "$D/kaynaklar?durum=bozuk" -H "authorization: Bearer $HOCA" | jq -r '.kaynaklar[0] | [.durum, .acik_sorun_sayisi] | join(",")')" "bozuk,1"
sart "sorun listesi" "$(j "$D/kaynaklar/$DRIVE/sorunlar" -H "authorization: Bearer $HOCA" | jq -r '.sorunlar[0].neden')" acilmiyor
DUZELT_GOVDE=$(jq -nc '{url:"https://drive.google.com/file/d/1abc/view?usp=sharing"}')
sart "kaynak guncellenince aktif" "$(j -X PATCH "$D/kaynaklar/$DRIVE" -H "authorization: Bearer $HOCA" -d "$DUZELT_GOVDE" | jq -r '[.durum, .acik_sorun_sayisi] | join(",")')" "aktif,0"
sart "ogr1 artik bozuk degil" "$(j "$D/kayitlarim/$DRIVE" -H "authorization: Bearer $T1" | jq -r '.bozuk')" false

adim "9) Gizle, sil: ogrenci goremez; kapsam disi ogretmen 404"
GIZLE_GOVDE=$(jq -nc '{durum:"gizli"}')
sart "gizle (200)" "$(durum -X PATCH "$D/kaynaklar/$DRIVE" -H "authorization: Bearer $HOCA" -d "$GIZLE_GOVDE")" 200
sart "gizli kaynak ogrenciye 404" "$(durum "$D/kayitlarim/$DRIVE" -H "authorization: Bearer $T1")" 404
sart "yumusak sil (200)" "$(silme "$D/kaynaklar/$MAT_ID" -H "authorization: Bearer $HOCA")" 200
sart "silinen ogrenciye 404" "$(durum "$D/kayitlarim/$MAT_ID" -H "authorization: Bearer $T1")" 404
sart "silinen satir veritabaninda duruyor" "$(sql "select (silindi_at is not null) from ders.ders_kaynaklari where id = '$MAT_ID'")" t
DIS_BILGI=$(davetle "$S" ogretmen "dis$RUN@example.com" "Atanmamis Hoca")
DIS=$(token "${DIS_BILGI##* }" "$KURUM")
sart "atanmamis ogretmen kaynagi goremez (404)" "$(durum "$D/kaynaklar/$ZOOM" -H "authorization: Bearer $DIS")" 404

adim "10) Outbox: olaylar tek sefer yazildi"
OLAY() { sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = '$1'"; }
sart "ders.kaynak.eklendi.v1 (3 kayit + diger + materyal)" "$(OLAY evt.ders.kaynak.eklendi.v1)" 5
sart "ders.kaynak.izlendi.v1 (iki izledim cagrisi, tek olay)" "$(OLAY evt.ders.kaynak.izlendi.v1)" 1
sart "ders.kaynak.sorun_bildirildi.v1 (iki istek, tek olay)" "$(OLAY evt.ders.kaynak.sorun_bildirildi.v1)" 1
sart "olay yukunde parola/url/baslik yok" "$(sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject like 'evt.ders.kaynak.%' and (payload::text like '%Zoom-Parola%' or payload::text like '%zoom.us%' or payload::text like '%Ders kaydi%')")" 0

echo
echo "TAMAM: kayit akisi basarili"
