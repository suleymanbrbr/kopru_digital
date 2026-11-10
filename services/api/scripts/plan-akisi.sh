#!/usr/bin/env bash
# Haftalik plan akisi: uctan uca curl senaryosu. Tekrar calistirilabilir (her calistirmada yeni
# kullanici/e-posta/kurum; OTP kullanmaz, e-posta+parola ile girer). bash 3.2 (macOS) uyumlu.
#
# Akis: plan olustur -> gorev ekle -> taslak ogrenciye gorunmez -> yayinla -> ogrenci gerceklesen girer
# (durum sunucuda) -> ogretmen gerceklesen yazamaz, ogrenci hedefi degistiremez -> tekrar yazim etkisiz ->
# Pazar gorevini devret (sonraki hafta) -> ozet -> kopyala -> gruba toplu plan -> sablondan kur ->
# kilitli hafta -> modul kapali.
#
# On kosul: api 4280 portunda, ayri veritabaninda (kopru_paket_p); NATS (4222) acik:
#   docker exec kopru-postgres-1 createdb -U postgres kopru_paket_p
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_paket_p \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_p \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_paket_p \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
#          API_PORT=4280 API_PUBLIC_URL=http://localhost:4280 NATS_URL=nats://localhost:4222
#   pnpm --filter @kopru/api db:migrate && pnpm --filter @kopru/api dev > /tmp/api4280.log 2>&1 &
# Kullanim (repo kokunden): services/api/scripts/plan-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4280}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
# Sabit tarihler (hepsi Pazartesi). Gelecek haftalar kilitli degildir; 2020 haftasi kilitlidir.
HAFTA="2030-01-07"
SONRAKI="2030-01-14"
UCUNCU="2030-01-21"
TOPLU="2030-02-04"
SABLONLU="2030-02-11"
ESKI="2020-01-06"

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
davetle() { # $1 sahip token, $2 rol, $3 eposta, $4 ad -> "uyelik_id oturum" ; $KURUM kullanilir
  local belirtec oturum ilk
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')" | jq -r '.belirtec')
  oturum=$(kayit "$3" "$4"); ilk=$(token "$oturum"); riza "$ilk"
  j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg b "$belirtec" '{belirtec:$b}')" | jq -r '.uyelik_id' | tr -d '\n'
  printf ' %s' "$oturum"
}

adim "1) Sahip: kayit, KVKK, kurum, grup, ogretmen ve iki ogrenci"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Plan Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"
P="$API/v1/ogrenme/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"8-A Matematik"}' | jq -r '.id')
HOCA_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca")
HOCA_UYELIK=${HOCA_BILGI%% *}; HOCA_OTURUM=${HOCA_BILGI##* }
sart "ogretmen atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
O1_BILGI=$(davetle "$S" ogrenci "ogr1$RUN@example.com" "Ali Ogrenci")
O1_UYELIK=${O1_BILGI%% *}; O1_OTURUM=${O1_BILGI##* }
O2_BILGI=$(davetle "$S" ogrenci "ogr2$RUN@example.com" "Berk Ogrenci")
O2_UYELIK=${O2_BILGI%% *}; O2_OTURUM=${O2_BILGI##* }
sart "iki ogrenci gruba eklendi (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$O1_UYELIK" --arg b "$O2_UYELIK" '{ogrenci_idleri:[$a,$b]}')")" 201
HOCA=$(token "$HOCA_OTURUM" "$KURUM")
O1=$(token "$O1_OTURUM" "$KURUM")
O2=$(token "$O2_OTURUM" "$KURUM")
echo "kurum: $KURUM  grup: $GRUP  ogretmen: $HOCA_UYELIK  ogrenci1: $O1_UYELIK"

adim "2) Ogretmen plan olusturur (taslak); Pazartesi disi 422; ayni hafta ikinci plan 409"
PLAN=$(j -X POST "$P/planlar" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$O1_UYELIK" --arg h "$HAFTA" '{ogrenci_id:$o,hafta_baslangic:$h}')")
PLAN_ID=$(echo "$PLAN" | jq -r '.plan.id')
sart "plan durumu" "$(echo "$PLAN" | jq -r '.plan.durum')" taslak
sart "hazirlayan ogretmen" "$(echo "$PLAN" | jq -r '.plan.hazirlayan_id')" "$HOCA_UYELIK"
sart "Sali plani (422)" "$(durum -X POST "$P/planlar" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$O2_UYELIK" '{ogrenci_id:$o,hafta_baslangic:"2030-01-08"}')")" 422
sart "ikinci plan (409)" "$(durum -X POST "$P/planlar" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$O1_UYELIK" --arg h "$HAFTA" '{ogrenci_id:$o,hafta_baslangic:$h}')")" 409
sart "ikinci plan hata kodu" "$(j -X POST "$P/planlar" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$O1_UYELIK" --arg h "$HAFTA" '{ogrenci_id:$o,hafta_baslangic:$h}')" | jq -r '.error.code')" plan_zaten_var
BOS=$(j "$P/ogrenciler/$O2_UYELIK/plan?hafta=$HAFTA" -H "authorization: Bearer $HOCA")
sart "plani olmayan ogrenci: bos iskelet" "$(echo "$BOS" | jq -c '{plan: .plan, n: (.gorevler | length)}')" '{"plan":null,"n":0}'

adim "3) Gorevler: Pazartesi matematik 20 soru, Sali fizik 30 dakika, Pazar matematik 10 soru"
gorev() { # $1 gun $2 brans $3 tur $4 miktar -> govde
  jq -nc --arg g "$1" --arg b "$2" --arg t "$3" --argjson m "$4" '{gun:$g,brans_kodu:$b,hedef_turu:$t,hedef_miktar:$m}'
}
G1=$(j -X POST "$P/planlar/$PLAN_ID/gorevler" -H "authorization: Bearer $HOCA" -d "$(gorev 2030-01-07 matematik soru 20)" | jq -r '.id')
G2=$(j -X POST "$P/planlar/$PLAN_ID/gorevler" -H "authorization: Bearer $HOCA" -d "$(gorev 2030-01-08 fizik dakika 30)" | jq -r '.id')
G3=$(j -X POST "$P/planlar/$PLAN_ID/gorevler" -H "authorization: Bearer $HOCA" -d "$(gorev 2030-01-13 matematik soru 10)" | jq -r '.id')
sart "gun hafta disinda (422)" "$(durum -X POST "$P/planlar/$PLAN_ID/gorevler" -H "authorization: Bearer $HOCA" -d "$(gorev 2030-01-14 matematik soru 5)")" 422
sart "ogrenci gorev ekleyemez (403)" "$(durum -X POST "$P/planlar/$PLAN_ID/gorevler" -H "authorization: Bearer $O1" -d "$(gorev 2030-01-09 matematik soru 5)")" 403
sart "gorev sayisi" "$(j "$P/planlar/$PLAN_ID" -H "authorization: Bearer $HOCA" | jq '.gorevler | length')" 3

adim "4) Yayin oncesi ogrenci plani gormez; yayin sonrasi gorur"
sart "taslak: ogrenci plani yok" "$(j "$P/planim?hafta=$HAFTA" -H "authorization: Bearer $O1" | jq -c '.plan')" null
sart "taslak: ogrenci gorevi yazamaz (404)" "$(durum -X PUT "$P/gorevler/$G1/gerceklesen" -H "authorization: Bearer $O1" -d '{"gerceklesen_miktar":5}')" 404
sart "yayinla (200)" "$(durum -X POST "$P/planlar/$PLAN_ID/yayinla" -H "authorization: Bearer $HOCA" -d '{}')" 200
sart "yayin: ogrenci plani gorur" "$(j "$P/planim?hafta=$HAFTA" -H "authorization: Bearer $O1" | jq '.gorevler | length')" 3
sart "Bugun ekrani (Pazartesi gorevi)" "$(j "$P/gorevlerim?gun=2030-01-07" -H "authorization: Bearer $O1" | jq -r '.gorevler[0].id')" "$G1"
sart "baska ogrenci gorevi gormez (404)" "$(durum -X PUT "$P/gorevler/$G1/gerceklesen" -H "authorization: Bearer $O2" -d '{"gerceklesen_miktar":5}')" 404
BUGUN_SUNUCU=$(j "$P/gorevlerim" -H "authorization: Bearer $O1" | jq -r '.gun')
sart "gun verilmezse sunucunun Istanbul gunu" "$BUGUN_SUNUCU" "$(TZ=Europe/Istanbul date +%F)"

adim "5) Gerceklesen: durum sunucuda; ogretmen gerceklesen yazamaz; ogrenci hedefi degistiremez; tekrar yazim etkisiz"
R=$(j -X PUT "$P/gorevler/$G1/gerceklesen" -H "authorization: Bearer $O1" -d '{"gerceklesen_miktar":12}')
sart "12/20 -> kismen" "$(echo "$R" | jq -r '.durum')" kismen
SURUM=$(echo "$R" | jq -r '.surum')
sart "ogretmen gerceklesen yazamaz (403)" "$(durum -X PUT "$P/gorevler/$G1/gerceklesen" -H "authorization: Bearer $HOCA" -d '{"gerceklesen_miktar":20}')" 403
sart "sahip de yazamaz (403)" "$(durum -X PUT "$P/gorevler/$G1/gerceklesen" -H "authorization: Bearer $S" -d '{"gerceklesen_miktar":20}')" 403
sart "ogrenci hedef PATCH (403)" "$(durum -X PATCH "$P/gorevler/$G1" -H "authorization: Bearer $O1" -d '{"hedef_miktar":1}')" 403
R2=$(j -X PUT "$P/gorevler/$G1/gerceklesen" -H "authorization: Bearer $O1" -d '{"gerceklesen_miktar":12}')
sart "ayni deger tekrari: surum ayni" "$(echo "$R2" | jq -r '.surum')" "$SURUM"
R3=$(j -X PUT "$P/gorevler/$G1/gerceklesen" -H "authorization: Bearer $O1" -d '{"gerceklesen_miktar":25}')
sart "25 >= 20 -> tamam" "$(echo "$R3" | jq -r '.durum')" tamam
sart "tamamlandi_at dolu" "$(echo "$R3" | jq -r '.tamamlandi_at != null')" true
sart "eski surum + farkli deger (409)" "$(durum -X PUT "$P/gorevler/$G1/gerceklesen" -H "authorization: Bearer $O1" -d "$(jq -nc --argjson s "$SURUM" '{gerceklesen_miktar:3,surum:$s}')")" 409
j -X PUT "$P/gorevler/$G2/gerceklesen" -H "authorization: Bearer $O1" -d '{"gerceklesen_miktar":10}' >/dev/null
sart "dakika gorevi kismen" "$(j "$P/planim?hafta=$HAFTA" -H "authorization: Bearer $O1" | jq -r --arg g "$G2" '.gorevler[] | select(.id == $g) | .durum')" kismen

adim "6) Devret: Pazar gorevi sonraki haftanin planina (yayinda acilir); cift devir 409"
D=$(j -X POST "$P/gorevler/$G3/devret" -H "authorization: Bearer $O1" -d '{}')
sart "yeni gorev gunu (sonraki Pazartesi)" "$(echo "$D" | jq -r '.yeni.gun')" "$SONRAKI"
sart "yeni hedef = kalan" "$(echo "$D" | jq -r '.yeni.hedef_miktar')" 10
sart "devreden_gorev_id" "$(echo "$D" | jq -r '.yeni.devreden_gorev_id')" "$G3"
sart "eski gorev devredildi" "$(echo "$D" | jq -r '.eski.durum')" devredildi
sart "cift devir (409)" "$(durum -X POST "$P/gorevler/$G3/devret" -H "authorization: Bearer $O1" -d '{}')" 409
sart "cift devir hata kodu" "$(j -X POST "$P/gorevler/$G3/devret" -H "authorization: Bearer $O1" -d '{}' | jq -r '.error.code')" gorev_zaten_devredildi
sart "tamamlanan gorev devredilmez (409)" "$(durum -X POST "$P/gorevler/$G1/devret" -H "authorization: Bearer $O1" -d '{}')" 409
SON=$(j "$P/ogrenciler/$O1_UYELIK/plan?hafta=$SONRAKI" -H "authorization: Bearer $HOCA")
sart "sonraki hafta plani yayinda" "$(echo "$SON" | jq -r '.plan.durum')" yayinda
sart "ogretmen devri plandan gorur" "$(echo "$SON" | jq -r '.gorevler[0].devreden_gorev_id')" "$G3"

adim "7) Ozet: ders bazinda planlanan/gerceklesen (soru ve dakika ayri)"
OZET=$(j "$P/planlar/$PLAN_ID/ozet" -H "authorization: Bearer $HOCA")
sart "matematik soru" "$(echo "$OZET" | jq -c '.dersler[] | select(.brans_kodu == "matematik") | .soru')" '{"planlanan":20,"gerceklesen":25}'
sart "fizik dakika" "$(echo "$OZET" | jq -c '.dersler[] | select(.brans_kodu == "fizik") | .dakika')" '{"planlanan":30,"gerceklesen":10}'
sart "toplam gorev (devredilen haric)" "$(echo "$OZET" | jq '.toplam.gorev_sayisi')" 2
sart "ogrenci kendi ozetini gorur (200)" "$(durum "$P/planlar/$PLAN_ID/ozet" -H "authorization: Bearer $O1")" 200
sart "baska ogrenci ozeti goremez (404)" "$(durum "$P/planlar/$PLAN_ID/ozet" -H "authorization: Bearer $O2")" 404

adim "8) Kopyala: gerceklesen sifirlanir; dolu haftaya 409"
sart "dolu hafta (409)" "$(durum -X POST "$P/planlar/$PLAN_ID/kopyala" -H "authorization: Bearer $HOCA" -d '{}')" 409
K=$(j -X POST "$P/planlar/$PLAN_ID/kopyala" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg h "$UCUNCU" '{hedef_hafta_baslangic:$h}')")
sart "kopya gorev sayisi (devredilen kopyalanmaz)" "$(echo "$K" | jq '.gorevler | length')" 2
sart "kopyada gerceklesen sifir/bos" "$(echo "$K" | jq -c '[.gorevler[] | [.gerceklesen_miktar, .durum]] | unique')" '[[null,"bekliyor"]]'
sart "kopya taslak" "$(echo "$K" | jq -r '.plan.durum')" taslak

adim "9) Gruba toplu plan (idempotent)"
TG=$(jq -nc --arg g "$GRUP" --arg h "$TOPLU" '{grup_id:$g,hafta_baslangic:$h,yayinla:true,gorevler:[{gun_sirasi:0,brans_kodu:"matematik",hedef_turu:"soru",hedef_miktar:30},{gun_sirasi:3,brans_kodu:"fizik",hedef_turu:"dakika",hedef_miktar:45}]}')
T1=$(j -X POST "$P/planlar/toplu" -H "authorization: Bearer $HOCA" -d "$TG")
sart "toplu: olusturulan" "$(echo "$T1" | jq '.olusturulan')" 2
T2=$(j -X POST "$P/planlar/toplu" -H "authorization: Bearer $HOCA" -d "$TG")
sart "toplu tekrar: olusturulan" "$(echo "$T2" | jq '.olusturulan')" 0
sart "toplu tekrar: atlanan" "$(echo "$T2" | jq '.atlanan')" 2
sart "toplu: ogrenci gorev sayisi" "$(j "$P/planim?hafta=$TOPLU" -H "authorization: Bearer $O2" | jq '.gorevler | length')" 2

adim "10) Sablon: olustur, ogrenciye kur"
SB=$(j -X POST "$P/plan-sablonlari" -H "authorization: Bearer $HOCA" -d '{"ad":"LGS Haftasi","gorevler":[{"gun_sirasi":0,"brans_kodu":"matematik","hedef_turu":"soru","hedef_miktar":40},{"gun_sirasi":6,"brans_kodu":"fizik","hedef_turu":"dakika","hedef_miktar":60}]}')
SB_ID=$(echo "$SB" | jq -r '.id')
sart "sablon gorev sayisi" "$(echo "$SB" | jq '.gorevler | length')" 2
SK=$(j -X POST "$P/plan-sablonlari/$SB_ID/uygula" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$O1_UYELIK" --arg h "$SABLONLU" '{ogrenci_id:$o,hafta_baslangic:$h}')")
sart "sablondan kurulan gunler" "$(echo "$SK" | jq -c '[.gorevler[].gun]')" '["2030-02-11","2030-02-17"]'
sart "sablon dolu haftaya 409" "$(durum -X POST "$P/plan-sablonlari/$SB_ID/uygula" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$O1_UYELIK" --arg h "$SABLONLU" '{ogrenci_id:$o,hafta_baslangic:$h}')")" 409
sart "sahip hocanin sablonunu goremez (404)" "$(durum "$P/plan-sablonlari/$SB_ID" -H "authorization: Bearer $S")" 404

adim "11) Kilitli hafta: hafta sonu + 14 gun sonra yazma 409 plan_kilitli"
KILIT=$(j -X POST "$P/planlar" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$O1_UYELIK" --arg h "$ESKI" '{ogrenci_id:$o,hafta_baslangic:$h}')")
sart "kilitli hafta hata kodu" "$(echo "$KILIT" | jq -r '.error.code')" plan_kilitli
sart "kilitli haftayi okumak serbest (200)" "$(durum "$P/ogrenciler/$O1_UYELIK/plan?hafta=$ESKI" -H "authorization: Bearer $HOCA")" 200
sart "kilitli hafta kilitli:true" "$(j "$P/ogrenciler/$O1_UYELIK/plan?hafta=$ESKI" -H "authorization: Bearer $HOCA" | jq '.kilitli')" true

adim "12) Kapsam ve modul"
sart "baska kurum yolu (403)" "$(durum "$API/v1/ogrenme/kurumlar/00000000-0000-7000-8000-000000000000/planim" -H "authorization: Bearer $O1")" 403
sart "modul kapatma (200)" "$(durum -X PUT "$H/modul-ayarlari" -H "authorization: Bearer $S" -d "$(jq -nc --arg g "$GRUP" '{modul_kodu:"haftalik_plan",kapsam:"grup",kapsam_id:$g,acik:false}')")" 200
sart "kapali modul: ogretmen yazamaz (403)" "$(durum -X POST "$P/planlar/$PLAN_ID/gorevler" -H "authorization: Bearer $HOCA" -d "$(gorev 2030-01-09 matematik soru 5)")" 403
sart "kapali modul hata kodu" "$(j -X POST "$P/planlar/$PLAN_ID/gorevler" -H "authorization: Bearer $HOCA" -d "$(gorev 2030-01-09 matematik soru 5)" | jq -r '.error.code')" modul_kapali
sart "kapali modul: ogrenci yazamaz (403)" "$(durum -X PUT "$P/gorevler/$G2/gerceklesen" -H "authorization: Bearer $O1" -d '{"gerceklesen_miktar":20}')" 403
sart "kapali modulde okuma serbest (200)" "$(durum "$P/planlar/$PLAN_ID" -H "authorization: Bearer $HOCA")" 200

printf '\nTUM ADIMLAR GECTI\n'
