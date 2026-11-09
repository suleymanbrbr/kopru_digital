#!/usr/bin/env bash
# Odev akisi: uctan uca curl senaryosu. Tekrar calistirilabilir (her calistirmada yeni kullanici/e-posta/
# kurum; OTP kullanmaz, e-posta+parola ile girer). bash 3.2 (macOS) uyumlu.
#
# Akis: grup + 30 ogrenci -> sablon -> odev taslagi -> yayin (fan-out) -> ikinci yayin (idempotent) ->
# ogrenci teslim -> inceleme (tekrar) -> yeniden teslim -> ozet (30 kisilik sinif, sure) -> atama esitle ->
# gorunurluk/yetki -> modul kapali.
#
# On kosul: api 4270 portunda, ayri veritabaninda (kopru_paket_o); NATS (4222) acik:
#   docker exec kopru-postgres-1 createdb -U postgres kopru_paket_o
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_paket_o \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_o \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_paket_o \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
#          API_PORT=4270 API_PUBLIC_URL=http://localhost:4270 NATS_URL=nats://localhost:4222
#   pnpm --filter @kopru/api db:migrate && pnpm --filter @kopru/api dev > /tmp/api4270.log 2>&1 &
# Toplu ogrenci eklemek icin SISTEM_DB (varsayilan kopru_paket_o) uzerinden psql kullanilir (docker exec).
# Kullanim (repo kokunden): services/api/scripts/odev-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4270}"
PG="${PG:-docker exec -i kopru-postgres-1 psql -q -U postgres -d kopru_paket_o -v ON_ERROR_STOP=1}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

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
ms() { python3 -c 'import time; print(int(time.time()*1000))'; }

adim "1) Sahip: kayit, KVKK, kurum, grup, ogretmen, 1 girisli ogrenci + 29 toplu ogrenci (30 kisilik sinif)"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Odev Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"
O="$API/v1/ogrenme/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"8-A Matematik"}' | jq -r '.id')
HOCA_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca")
HOCA_UYELIK=${HOCA_BILGI%% *}; HOCA_OTURUM=${HOCA_BILGI##* }
sart "ogretmen atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
O1_BILGI=$(davetle "$S" ogrenci "ogr1$RUN@example.com" "Ali Ogrenci")
O1_UYELIK=${O1_BILGI%% *}; O1_OTURUM=${O1_BILGI##* }
O2_BILGI=$(davetle "$S" ogrenci "ogr2$RUN@example.com" "Berk Ogrenci")
O2_UYELIK=${O2_BILGI%% *}; O2_OTURUM=${O2_BILGI##* }
sart "iki girisli ogrenci gruba (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$O1_UYELIK" --arg b "$O2_UYELIK" '{ogrenci_idleri:[$a,$b]}')")" 201
# 28 toplu ogrenci (giris yok): dogrudan SQL (sahip rolu), sinif 30 kisi olur.
$PG <<SQL
with k as (
  insert into hesap.kullanicilar (id, telefon_e164)
  select gen_random_uuid(), '+9054' || lpad((floor(random()*90000000)::int + 10000000)::text, 8, '0') || ''
  from generate_series(1, 28) returning id
), u as (
  insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol, gorunen_ad)
  select gen_random_uuid(), '$KURUM'::uuid, k.id, 'ogrenci', 'Toplu ' || row_number() over ()
  from k returning id
)
insert into hesap.grup_uyeleri (id, kurum_id, grup_id, ogrenci_id, katilim_yolu)
select gen_random_uuid(), '$KURUM'::uuid, '$GRUP'::uuid, id, 'yonetici' from u;
SQL
HOCA=$(token "$HOCA_OTURUM" "$KURUM")
O1=$(token "$O1_OTURUM" "$KURUM")
O2=$(token "$O2_OTURUM" "$KURUM")
echo "kurum: $KURUM  grup: $GRUP"

adim "2) Sablon (ogretmen): olustur, listele"
SABLON=$(j -X POST "$O/odev-sablonlari" -H "authorization: Bearer $HOCA" -d "$(jq -nc '{baslik:"Turev tekrar",brans_kodu:"matematik",tur:"soru",kaynak:"X Yayinlari Test 4",hedef_soru_sayisi:20}')")
sart "sablon tur" "$(echo "$SABLON" | jq -r '.tur')" soru
sart "sablon listesi" "$(j "$O/odev-sablonlari" -H "authorization: Bearer $HOCA" | jq '.sablonlar | length')" 1
sart "baska kullanicinin listesi bos (sahip kendi sablonunu gorur)" "$(j "$O/odev-sablonlari" -H "authorization: Bearer $S" | jq '.sablonlar | length')" 0
sart "ogrenci sablon goremez (403)" "$(durum "$O/odev-sablonlari" -H "authorization: Bearer $O1")" 403

adim "3) Odev taslagi (sablondan alanlarla) ve guncelleme"
SON=$(python3 -c 'import datetime as d; print((d.datetime.now(d.timezone.utc)+d.timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ"))')
GOVDE=$(jq -nc --arg g "$GRUP" --arg s "$SON" --argjson sb "$SABLON" '{baslik:$sb.baslik,brans_kodu:$sb.brans_kodu,tur:$sb.tur,kaynak:$sb.kaynak,hedef_soru_sayisi:$sb.hedef_soru_sayisi,hedef_turu:"grup",hedef_id:$g,son_teslim_at:$s}')
ODEV=$(j -X POST "$O/odevler" -H "authorization: Bearer $HOCA" -d "$GOVDE")
ODEV_ID=$(echo "$ODEV" | jq -r '.id')
sart "taslak durumu" "$(echo "$ODEV" | jq -r '.durum')" taslak
sart "taslak guncelle (200)" "$(durum -X PATCH "$O/odevler/$ODEV_ID" -H "authorization: Bearer $HOCA" -d '{"baslik":"Turev test 4 (guncel)","tur":"sayfa"}')" 200
sart "ogretmen kurum geneline ODEV VEREMEZ (403)" "$(durum -X POST "$O/odevler" -H "authorization: Bearer $HOCA" -d "$(jq -nc '{baslik:"x",brans_kodu:"matematik",hedef_turu:"kurum"}')")" 403
sart "ogrenci odev olusturamaz (403)" "$(durum -X POST "$O/odevler" -H "authorization: Bearer $O1" -d "$GOVDE")" 403

adim "4) Yayinla: 30 ogrenciye satir (tek islemde) + idempotent ikinci yayin"
YAYIN=$(j -X POST "$O/odevler/$ODEV_ID/yayinla" -H "authorization: Bearer $HOCA" -d '{}')
echo "$YAYIN" | jq -c '{durum, fan_out_durum, atanan_sayisi}'
sart "atanan sayisi" "$(echo "$YAYIN" | jq '.atanan_sayisi')" 30
sart "fan_out_durum" "$(echo "$YAYIN" | jq -r '.fan_out_durum')" tamamlandi
sart "ikinci yayin etkisiz (200)" "$(durum -X POST "$O/odevler/$ODEV_ID/yayinla" -H "authorization: Bearer $HOCA" -d '{}')" 200
sart "atanan sayisi degismedi" "$(j "$O/odevler/$ODEV_ID" -H "authorization: Bearer $HOCA" | jq '.atanan_sayisi')" 30
sart "yayindaki odev guncellenemez (409)" "$(durum -X PATCH "$O/odevler/$ODEV_ID" -H "authorization: Bearer $HOCA" -d '{"baslik":"x"}')" 409

adim "5) Ogrenci: odevlerim, teslim (ikinci teslim 409), baskasinin satiri 404"
ODEVLERIM=$(j "$O/odevlerim" -H "authorization: Bearer $O1")
sart "ogrenci tek satir gorur" "$(echo "$ODEVLERIM" | jq '.odevler | length')" 1
SATIR1=$(echo "$ODEVLERIM" | jq -r '.odevler[0].id')
SATIR2=$(j "$O/odevlerim" -H "authorization: Bearer $O2" | jq -r '.odevler[0].id')
sart "baskasinin satirina teslim 404" "$(durum -X POST "$O/ogrenci-odevleri/$SATIR2/teslim" -H "authorization: Bearer $O1" -d '{"yapilan_soru_sayisi":5}')" 404
sart "toplam > yapilan 422" "$(durum -X POST "$O/ogrenci-odevleri/$SATIR1/teslim" -H "authorization: Bearer $O1" -d '{"yapilan_soru_sayisi":5,"dogru_sayisi":4,"yanlis_sayisi":3}')" 422
TESLIM=$(j -X POST "$O/ogrenci-odevleri/$SATIR1/teslim" -H "authorization: Bearer $O1" -d '{"yapilan_soru_sayisi":20,"dogru_sayisi":15,"yanlis_sayisi":3,"bos_sayisi":2,"ogrenci_notu":"Son 3 soru zordu"}')
sart "teslim durumu" "$(echo "$TESLIM" | jq -r '.durum')" teslim_edildi
sart "gec_teslim yok" "$(echo "$TESLIM" | jq '.gec_teslim')" false
sart "ikinci teslim 409" "$(durum -X POST "$O/ogrenci-odevleri/$SATIR1/teslim" -H "authorization: Bearer $O1" -d '{"yapilan_soru_sayisi":20}')" 409
j -X POST "$O/ogrenci-odevleri/$SATIR2/teslim" -H "authorization: Bearer $O2" -d '{"yapilan_soru_sayisi":10,"dogru_sayisi":4}' >/dev/null

adim "6) Inceleme: ogrenci inceleyemez; tekrar_istendi -> yeniden teslim -> tamam"
sart "ogrenci inceleyemez (403)" "$(durum -X POST "$O/ogrenci-odevleri/$SATIR1/inceleme" -H "authorization: Bearer $O1" -d '{"sonuc":"tamam"}')" 403
TEKRAR=$(j -X POST "$O/ogrenci-odevleri/$SATIR1/inceleme" -H "authorization: Bearer $HOCA" -d '{"sonuc":"tekrar","not":"Son 3 soruyu tekrar coz"}')
sart "tekrar istendi" "$(echo "$TEKRAR" | jq -r '.durum')" tekrar_istendi
sart "ogrenci geri bildirimi gorur" "$(j "$O/odevlerim" -H "authorization: Bearer $O1" | jq -r '.odevler[0].inceleme_notu')" "Son 3 soruyu tekrar coz"
YENIDEN=$(j -X POST "$O/ogrenci-odevleri/$SATIR1/teslim" -H "authorization: Bearer $O1" -d '{"yapilan_soru_sayisi":20,"dogru_sayisi":19}')
sart "yeniden teslim" "$(echo "$YENIDEN" | jq -r '.durum')" teslim_edildi
sart "onceki inceleme temizlendi" "$(echo "$YENIDEN" | jq -r '.inceleme_sonucu')" null
TAMAM=$(j -X POST "$O/ogrenci-odevleri/$SATIR1/inceleme" -H "authorization: Bearer $HOCA" -d '{"sonuc":"tamam"}')
sart "incelendi" "$(echo "$TAMAM" | jq -r '.durum')" incelendi
sart "tekrar inceleme 409" "$(durum -X POST "$O/ogrenci-odevleri/$SATIR1/inceleme" -H "authorization: Bearer $HOCA" -d '{"sonuc":"eksik"}')" 409

adim "7) Ozet: 30 kisilik sinif tek istekte (sure olculur)"
T0=$(ms)
OZET=$(j "$O/odevler/$ODEV_ID/ozet" -H "authorization: Bearer $HOCA")
T1=$(ms)
echo "ozet suresi: $((T1 - T0)) ms (istemci + api, curl)"
echo "$OZET" | jq -c '.sayilar'
sart "ozet ogrenci satiri" "$(echo "$OZET" | jq '.ogrenciler | length')" 30
sart "ozet atanan" "$(echo "$OZET" | jq '.sayilar.atanan')" 30
sart "ozet incelendi" "$(echo "$OZET" | jq '.sayilar.incelendi')" 1
sart "ozet teslim_edildi" "$(echo "$OZET" | jq '.sayilar.teslim_edildi')" 1
sart "ozet atandi (teslim etmeyen)" "$(echo "$OZET" | jq '.sayilar.atandi')" 28
sart "ozet ortalama dogru orani ((19/20 + 4/10)/2)" "$(echo "$OZET" | jq '.sayilar.ortalama_dogru_orani')" 0.675
sart "ozet satirlarinda ad var" "$(echo "$OZET" | jq '[.ogrenciler[] | select(.gorunen_ad == null)] | length')" 0
sart "ogrenci ozet goremez (403)" "$(durum "$O/odevler/$ODEV_ID/ozet" -H "authorization: Bearer $O1")" 403

adim "8) Atama esitle: sonradan katilan ogrenci; ikinci cagri etkisiz"
O3_BILGI=$(davetle "$S" ogrenci "ogr3$RUN@example.com" "Can Ogrenci")
O3_UYELIK=${O3_BILGI%% *}; O3_OTURUM=${O3_BILGI##* }
j -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$O3_UYELIK" '{ogrenci_idleri:[$a]}')" >/dev/null
O3=$(token "$O3_OTURUM" "$KURUM")
sart "esitlemeden once ogrenci odevi yok" "$(j "$O/odevlerim" -H "authorization: Bearer $O3" | jq '.odevler | length')" 0
ES1=$(j -X POST "$O/odevler/$ODEV_ID/atama-esitle" -H "authorization: Bearer $HOCA" -d '{}')
sart "ilk esitleme eklenen" "$(echo "$ES1" | jq '.eklenen')" 1
sart "ilk esitleme atanan" "$(echo "$ES1" | jq '.atanan_sayisi')" 31
ES2=$(j -X POST "$O/odevler/$ODEV_ID/atama-esitle" -H "authorization: Bearer $HOCA" -d '{}')
sart "ikinci esitleme eklenen (idempotent)" "$(echo "$ES2" | jq '.eklenen')" 0
sart "ogrenci artik odevi gorur" "$(j "$O/odevlerim" -H "authorization: Bearer $O3" | jq '.odevler | length')" 1

adim "9) Liste, kapat ve kapali odeve teslim"
sart "ogretmen listesi" "$(j "$O/odevler" -H "authorization: Bearer $HOCA" | jq '.odevler | length')" 1
sart "kapat (200)" "$(durum -X POST "$O/odevler/$ODEV_ID/kapat" -H "authorization: Bearer $HOCA" -d '{}')" 200
SATIR3=$(j "$O/odevlerim" -H "authorization: Bearer $O3" | jq -r '.odevler[0].id')
sart "kapali odeve teslim 409" "$(durum -X POST "$O/ogrenci-odevleri/$SATIR3/teslim" -H "authorization: Bearer $O3" -d '{"yapilan_soru_sayisi":1}')" 409
sart "hata kodu odev_kapali" "$(j -X POST "$O/ogrenci-odevleri/$SATIR3/teslim" -H "authorization: Bearer $O3" -d '{"yapilan_soru_sayisi":1}' | jq -r '.error.code')" odev_kapali

adim "10) Odev modulu grupta kapaninca yazma 403 modul_kapali"
sart "modul kapatma (200)" "$(durum -X PUT "$H/modul-ayarlari" -H "authorization: Bearer $S" -d "$(jq -nc --arg g "$GRUP" '{modul_kodu:"odev",kapsam:"grup",kapsam_id:$g,acik:false}')")" 200
sart "kapali modul: odev olusturma 403" "$(durum -X POST "$O/odevler" -H "authorization: Bearer $HOCA" -d "$GOVDE")" 403
sart "hata kodu modul_kapali" "$(j -X POST "$O/odevler" -H "authorization: Bearer $HOCA" -d "$GOVDE" | jq -r '.error.code')" modul_kapali

printf '\nTUM ADIMLAR GECTI\n'
