#!/usr/bin/env bash
# Ders sonu geri bildirimi akisi: uctan uca curl senaryosu. Ders biter (veritabaninda 1 saat once) ->
# yoklama (ogr1 geldi, ogr2 gelmedi) -> ogr1 "bekleyen geri bildirimler"de dersi gorur -> geri bildirim verir
# (ilk veris) -> ikinci gonderim gunceller (olay tek) -> gelmeyen ogrenci 422 -> ogretmen ders kartinda ve
# ogrenci profilinde gorur -> sahip tarih araliginda oranlari gorur -> yetkisiz roller 403 -> outbox sayilari.
# Tekrar calistirilabilir (her calistirmada yeni kullanici/kurum). bash 3.2 (macOS) uyumlu.
#
# On kosul: kayit-akisi.sh ile ayni (api 4260, veritabani kopru_paket_a, NATS 4222). Dersi bitmis saymak icin
# `docker exec kopru-postgres-1 psql` ile dersin saati degistirilir (DB adi: $DB, varsayilan kopru_paket_a).
# Kullanim (repo kokunden): services/api/scripts/geri-bildirim-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4260}"
DB="${DB:-kopru_paket_a}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
simdi() { date -u +%Y-%m-%dT%H:%M:%S.000Z; }
yeniAnahtar() { uuidgen | tr 'A-Z' 'a-z'; }
dun() { date -u -v-1d +%F 2>/dev/null || date -u -d 'yesterday' +%F; }
yarin() { date -u -v+1d +%F 2>/dev/null || date -u -d 'tomorrow' +%F; }
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

adim "1) Sahip: kurum, grup, ogretmen (atanmis), iki ogrenci; ders acilir ve veritabaninda 1 saat once bitmis yapilir"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM_GOVDE=$(jq -nc '{ad:"Geri Bildirim Deneme Kurumu",tur:"kurum"}')
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
GELECEK_GOVDE=$(jq -nc --arg g "$GRUP" --arg t "$(yarin)" '{grup_id:$g,tarih:$t,baslangic_saati:"23:00",sure_dk:60}')
DERS=$(j -X POST "$D/dersler" -H "authorization: Bearer $HOCA" -d "$GELECEK_GOVDE" | jq -r '.ders.id')
KONU="01990000-0000-7000-8000-0000000000aa"
echo "kurum: $KURUM  grup: $GRUP  ders: $DERS  ogr1: $O1  ogr2: $O2"
GB_GOVDE=$(jq -nc --arg k "$KONU" '{deger:"kismen",konu_id:$k,not:"Limit sorulari zor geldi"}')
sart "ders bitmeden geri bildirim (422)" "$(durum -X PUT "$D/dersler/$DERS/geri-bildirim" -H "authorization: Bearer $T1" -d "$GB_GOVDE")" 422
sart "hata kodu" "$(j -X PUT "$D/dersler/$DERS/geri-bildirim" -H "authorization: Bearer $T1" -d "$GB_GOVDE" | jq -r '.error.code')" geri_bildirim_ders_bitmedi
sql "update ders.dersler set baslangic_at = now() - interval '2 hours', bitis_at = now() - interval '1 hour', ilk_baslangic_at = now() - interval '2 hours' where id = '$DERS'" >/dev/null

adim "2) Yoklama: ogr1 geldi, ogr2 gelmedi"
YOKLAMA_GOVDE=$(jq -nc --arg a "$O1" --arg b "$O2" --arg t "$(simdi)" '{yoklamalar:[{ogrenci_id:$a,durum:"geldi",isaretlenme_at:$t},{ogrenci_id:$b,durum:"gelmedi",isaretlenme_at:$t}]}')
sart "yoklama (200)" "$(durum -X PUT "$D/dersler/$DERS/yoklamalar" -H "authorization: Bearer $HOCA" -H "idempotency-key: $(yeniAnahtar)" -d "$YOKLAMA_GOVDE")" 200

adim "3) Bekleyen geri bildirimler (Bugun ekrani karti): yalniz gelen ogrenci gorur"
B1=$(j "$D/geri-bildirim/bekleyen" -H "authorization: Bearer $T1")
sart "ogr1 bekleyen sayisi" "$(echo "$B1" | jq -r '.dersler | length')" 1
sart "bekleyen ders" "$(echo "$B1" | jq -r '.dersler[0].ders_id')" "$DERS"
sart "ogr2 (gelmedi) bekleyeni yok" "$(j "$D/geri-bildirim/bekleyen" -H "authorization: Bearer $T2" | jq -r '.dersler | length')" 0

adim "4) ogr1 geri bildirim verir (ilk veris), ikinci gonderim gunceller; ogr2 (gelmedi) 422"
G1=$(j -X PUT "$D/dersler/$DERS/geri-bildirim" -H "authorization: Bearer $T1" -d "$GB_GOVDE")
sart "ilk veris yeni=true" "$(echo "$G1" | jq -r '.yeni')" true
sart "deger" "$(echo "$G1" | jq -r '.geri_bildirim.deger')" kismen
GB2_GOVDE=$(jq -nc '{deger:"anladim"}')
G2=$(j -X PUT "$D/dersler/$DERS/geri-bildirim" -H "authorization: Bearer $T1" -d "$GB2_GOVDE")
sart "ikinci gonderim yeni=false" "$(echo "$G2" | jq -r '.yeni')" false
sart "ayni kayit guncellendi" "$(echo "$G2" | jq -r '.geri_bildirim.id')" "$(echo "$G1" | jq -r '.geri_bildirim.id')"
sart "guncel deger" "$(echo "$G2" | jq -r '.geri_bildirim.deger')" anladim
sart "bekleyen listesi bosaldi" "$(j "$D/geri-bildirim/bekleyen" -H "authorization: Bearer $T1" | jq -r '.dersler | length')" 0
sart "gelmeyen ogrenci (422)" "$(durum -X PUT "$D/dersler/$DERS/geri-bildirim" -H "authorization: Bearer $T2" -d "$GB2_GOVDE")" 422
sart "gelmeyen ogrenci hata kodu" "$(j -X PUT "$D/dersler/$DERS/geri-bildirim" -H "authorization: Bearer $T2" -d "$GB2_GOVDE" | jq -r '.error.code')" geri_bildirim_yoklama_uygun_degil
sart "gecersiz deger (400)" "$(durum -X PUT "$D/dersler/$DERS/geri-bildirim" -H "authorization: Bearer $T1" -d '{"deger":"belki"}')" 400

adim "5) Ogretmen ders kartinda ve ogrenci profilinde gorur"
KART=$(j "$D/dersler/$DERS/geri-bildirimler" -H "authorization: Bearer $HOCA")
sart "ozet toplam" "$(echo "$KART" | jq -r '.ozet.toplam')" 1
sart "ozet anladim" "$(echo "$KART" | jq -r '.ozet.anladim')" 1
sart "katilimci sayisi" "$(echo "$KART" | jq -r '.katilimci_sayisi')" 2
sart "satirda ogrenci, deger" "$(echo "$KART" | jq -r --arg o "$O1" '.geri_bildirimler[] | select(.ogrenci_id == $o) | [.deger, .gorunen_ad] | join(",")')" "anladim,Ali Ogrenci"
PROFIL=$(j "$D/ogrenciler/$O1/geri-bildirimler" -H "authorization: Bearer $HOCA")
sart "ogrenci profilinde son geri bildirim" "$(echo "$PROFIL" | jq -r '.geri_bildirimler[0].ders_id')" "$DERS"
sart "ogrenci kendi geri bildirimini okur" "$(j "$D/dersler/$DERS/geri-bildirim" -H "authorization: Bearer $T1" | jq -r '.geri_bildirim.deger')" anladim
sart "ogrenci ders kartina giremez (403)" "$(durum "$D/dersler/$DERS/geri-bildirimler" -H "authorization: Bearer $T1")" 403

adim "6) Sahip: tarih araliginda oranlar (toplam, ogretmen ve brans kirilimi); ogretmen 403"
OZET=$(j "$D/geri-bildirim/ozet?baslangic=$(dun)&bitis=$(yarin)" -H "authorization: Bearer $S")
sart "toplam" "$(echo "$OZET" | jq -r '.toplam.toplam')" 1
sart "anladim orani" "$(echo "$OZET" | jq -r '.toplam.oran.anladim')" 1
sart "ogretmen kirilimi" "$(echo "$OZET" | jq -r '.ogretmenler[0].ogretmen_id')" "$HOCA_UYELIK"
sart "brans kirilimi" "$(echo "$OZET" | jq -r '.branslar[0].brans_kodu')" matematik
sart "ogretmen ozeti goremez (403)" "$(durum "$D/geri-bildirim/ozet?baslangic=$(dun)&bitis=$(yarin)" -H "authorization: Bearer $HOCA")" 403

adim "7) Outbox: ders.geri_bildirim.verildi.v1 yalniz ilk verista, not olaya girmedi"
sart "olay sayisi (2 gonderim, 1 olay)" "$(sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.ders.geri_bildirim.verildi.v1'")" 1
sart "olaydaki deger ilk verisdir" "$(sql "select payload->'data'->>'deger' from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.ders.geri_bildirim.verildi.v1'")" kismen
sart "olayda not yok" "$(sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.ders.geri_bildirim.verildi.v1' and payload::text like '%Limit sorulari%'")" 0

echo
echo "TAMAM: geri bildirim akisi basarili"
