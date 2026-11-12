#!/usr/bin/env bash
# motivasyon seri akisi: uctan uca curl senaryosu (gercek api + motivasyon API + iki worker + NATS).
# Kurum + grup + ogretmen (atamali) + ogrenci kurar; ogrenci 3 gun ust uste plan gorevi tamamlar (seri 3, kilometre
# tasi olayi) -> bir gun kacirir (dondurma yok) -> gece isi: bozulma olayi -> pencerede 2 kat hedef: onarim, seri geri
# gelir -> ogretmen grup duraklatmasi: gece isi duraklatma yazar, seri bozulmaz -> risk olayi (gunde bir).
#
# ZAMAN: olaylari api gercek zamanla uretir (hep "bugun"). Gunlerin gectigi, ogrencinin gun bazli satirlari
# (seri_gunleri, ogrenci_gunluk_aktivite, seriler tarihleri) SQL ile bir gun geri kaydirilarak taklit edilir
# (`kaydir`); gece ve risk isleri `src/seri-komut.ts` ile (yalniz gelistirmede) verilen ani `simdi` olarak alir.
# Hesap kopyalari api'nin gercek olaylariyla dolar (kurum, uyelik, grup, grup uyesi, atama).
# bash 3.2 (macOS) uyumlu. Gereken: curl, jq, docker, pnpm.
#
# On kosul (repo kokunden; portlar bu betigin varsayilanlari, Postgres 5433; AYRI NATS: tuketici adlari sabittir):
#   docker run -d --name m2-nats -p 4226:4222 nats:2 -js
#   P='docker exec kopru-postgres-1 psql -U postgres'
#   $P -c 'create database kopru_paket_m2 owner api' ; $P -c 'create database kopru_motivasyon_m2'
#   export NATS_URL=nats://localhost:4226
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_paket_m2 \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_m2 \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_paket_m2 \
#          API_PORT=4275 API_PUBLIC_URL=http://localhost:4275
#   pnpm --filter @kopru/api db:migrate
#   (pnpm --filter @kopru/api dev > /tmp/api4275.log 2>&1 &) ; (pnpm --filter @kopru/api dev:worker > /tmp/api-worker-m2.log 2>&1 &)
#   export MOTIVASYON_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_motivasyon_m2 \
#          MOTIVASYON_APP_PASSWORD=motivasyon_app MOTIVASYON_SISTEM_PASSWORD=motivasyon_sistem
#   pnpm --filter @kopru/motivasyon db:migrate
#   export MOTIVASYON_DATABASE_URL=postgres://motivasyon_app:motivasyon_app@localhost:5433/kopru_motivasyon_m2 \
#          MOTIVASYON_DATABASE_SISTEM_URL=postgres://motivasyon_sistem:motivasyon_sistem@localhost:5433/kopru_motivasyon_m2 \
#          MOTIVASYON_PORT=4276 MOTIVASYON_AUTH_ENABLED=true JWKS_URL=http://localhost:4275/.well-known/jwks.json \
#          JWT_ISSUER=http://localhost:4275
#   (pnpm --filter @kopru/motivasyon dev > /tmp/mot4276.log 2>&1 &) ; (pnpm --filter @kopru/motivasyon dev:worker > /tmp/mot-worker-m2.log 2>&1 &)
# Kullanim (repo kokunden, ayni ortam degiskenleriyle): services/motivasyon/scripts/seri-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4275}"
MOT="${MOT:-http://localhost:4276}"
MOT_DB="${MOT_DB:-kopru_motivasyon_m2}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
sil() { curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$1" -H "authorization: Bearer $HOCA"; } # govdesiz DELETE
msql() { docker exec kopru-postgres-1 psql -U postgres -d "$MOT_DB" -tAc "$1"; }

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
riza() { # $1 erisim belirteci
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
seri_detay() { j "$MOT/v1/motivasyon/kurumlar/$KURUM/benim/seri" -H "authorization: Bearer $O"; }
benim() { j "$MOT/v1/motivasyon/kurumlar/$KURUM/benim" -H "authorization: Bearer $O"; }
satir() { # $1 sql, $2 beklenen (olay tuketilene kadar bekler)
  local i v
  for i in $(seq 1 60); do v=$(msql "$1"); if [ "$v" = "$2" ]; then return 0; fi; sleep 0.5; done
  echo "BASARISIZ: '$1' -> $v (beklenen $2)"; exit 1
}
seri_sql() { msql "select mevcut_seri || ',' || en_uzun_seri || ',' || dondurma_stogu || ',' || onarim_hakki from motivasyon.seriler where ogrenci_id = '$OGR'"; }
takvim() { # son 5 gun: gun:durum
  seri_detay | jq -r '[.gunler[-5:][] | (.gun[5:] + ":" + .durum)] | join(" ")'
}
olay_say() { # $1 tur (bozuldu|kilometre_tasi|risk)
  msql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.motivasyon.seri.$1.v1' and payload->'data'->>'ogrenci_id' = '$OGR'"
}
isle() { # $1 gece|risk, $2 ISO zaman: seri islerini verilen anda calistirir
  pnpm --filter @kopru/motivasyon exec tsx src/seri-komut.ts "$1" "$2" 2>&1 | tail -1
}
kaydir() { # $1 gun: ogrencinin gun bazli satirlarini $1 gun geri tasir ("$1 gun gecti" taklidi)
  msql "
    update motivasyon.seri_gunleri set gun = gun + 20000 where ogrenci_id = '$OGR';
    update motivasyon.seri_gunleri set gun = gun - 20000 - $1 where ogrenci_id = '$OGR';
    update motivasyon.ogrenci_gunluk_aktivite set gun = gun + 20000 where ogrenci_id = '$OGR';
    update motivasyon.ogrenci_gunluk_aktivite set gun = gun - 20000 - $1 where ogrenci_id = '$OGR';
    update motivasyon.seriler set son_aktif_gun = son_aktif_gun - $1, bozulan_gun = bozulan_gun - $1,
           onarim_bitis_at = onarim_bitis_at - make_interval(days => $1) where ogrenci_id = '$OGR';" >/dev/null
}
GOREV_LISTE=()
GI=0
tamamla() { # siradaki plan gorevini ogrenci olarak tamamlar
  local gm
  gm=${GOREV_LISTE[$GI]}; GI=$((GI + 1))
  j -X PUT "$OG/gorevler/${gm%%:*}/gerceklesen" -H "authorization: Bearer $O" -d "$(jq -nc --argjson m "${gm##*:}" '{gerceklesen_miktar:$m}')" >/dev/null
}

adim "0) Kurum, grup, ogretmen (matematik atamasi), ogrenci (api girisi) ve plan gorevleri"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d "$(jq -nc '{ad:"Seri Deneme Kurumu",tur:"kurum"}')" | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"; OG="$API/v1/ogrenme/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d "$(jq -nc '{tur:"grup",ad:"8-A Matematik"}')" | jq -r '.id')
HOCA_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca"); HOCA_UYELIK=${HOCA_BILGI%% *}; HOCA_OTURUM=${HOCA_BILGI##* }
sart "ogretmen atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
OGR_BILGI=$(davetle "$S" ogrenci "ogr$RUN@example.com" "Ali Ogrenci"); OGR=${OGR_BILGI%% *}; OGR_OTURUM=${OGR_BILGI##* }
sart "ogrenci gruba (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OGR" '{ogrenci_idleri:[$a]}')")" 201
HOCA=$(token "$HOCA_OTURUM" "$KURUM"); O=$(token "$OGR_OTURUM" "$KURUM")
echo "kurum: $KURUM  ogrenci(uyelik): $OGR  grup: $GRUP"
sart "motivasyon /ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$MOT/ready")" 200
satir "select count(*) from motivasyon.grup_kopyalari where grup_id = '$GRUP'" 1
satir "select count(*) from motivasyon.atama_kopyalari where grup_id = '$GRUP' and ogretmen_id = '$HOCA_UYELIK'" 1
satir "select count(*) from motivasyon.grup_uyesi_kopyalari where grup_id = '$GRUP' and ogrenci_id = '$OGR'" 1
GUN=$(msql "select ((now() at time zone 'Europe/Istanbul') - interval '4 hours')::date")
YARIN=$(msql "select ('$GUN'::date + 1)")
echo "bugun (kurum gunu, 04:00 kurali): $GUN"
HAFTA=2030-01-07
PLAN=$(j -X POST "$OG/planlar" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$OGR" --arg h "$HAFTA" '{ogrenci_id:$o,hafta_baslangic:$h}')" | jq -r '.plan.id')
for i in 1 2 3 4 5; do
  YANIT=$(j -X POST "$OG/planlar/$PLAN/gorevler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg g "$(printf '2030-01-%02d' $((7 + i)))" --argjson m $((10 + i)) '{gun:$g,brans_kodu:"matematik",hedef_turu:"soru",hedef_miktar:$m}')")
  G=$(echo "$YANIT" | jq -r '.id')
  if [ "$G" = "null" ]; then echo "BASARISIZ: plan gorevi olusturulamadi: $YANIT"; exit 1; fi
  GOREV_LISTE+=("$G:$((10 + i))")
done
sart "plan yayin (200)" "$(durum -X POST "$OG/planlar/$PLAN/yayinla" -H "authorization: Bearer $HOCA" -d '{}')" 200
sart "baslangic: seri 0, bos takvim" "$(seri_detay | jq -c '[.mevcut_seri, ([.gunler[].durum] | unique)]')" '[0,["yok"]]'

adim "1) Uc gun ust uste plan gorevi: seri 3, kilometre tasi olayi (yalniz bir kez)"
tamamla; satir "select mevcut_seri from motivasyon.seriler where ogrenci_id = '$OGR'" 1
kaydir 1
tamamla; satir "select mevcut_seri from motivasyon.seriler where ogrenci_id = '$OGR'" 2
kaydir 1
tamamla; satir "select mevcut_seri from motivasyon.seriler where ogrenci_id = '$OGR'" 3
sart "seri, en uzun, dondurma, onarim hakki" "$(seri_sql)" "3,3,0,1"
sart "takvim (son 5 gun; API = SQL)" "$(takvim)" "$(msql "select string_agg(to_char('$GUN'::date - i, 'MM-DD') || ':' || coalesce((select durum from motivasyon.seri_gunleri g where g.ogrenci_id = '$OGR' and g.gun = '$GUN'::date - i), 'yok'), ' ' order by i desc) from generate_series(0, 4) i")"
sart "kilometre_tasi olayi" "$(msql "select string_agg(payload->'data'->>'seri', ',') from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.motivasyon.seri.kilometre_tasi.v1'")" 3
sart "toplam_aktif_gun ve en_uzun_seri sayaclari" "$(msql "select string_agg(sayac_kodu || '=' || deger, ',' order by sayac_kodu) from motivasyon.ogrenci_sayaclari where ogrenci_id = '$OGR' and sayac_kodu in ('toplam_aktif_gun','en_uzun_seri')")" "en_uzun_seri=3,toplam_aktif_gun=3"
sart "sapka_kasket kozmetigi (seri 3) acildi" "$(msql "select count(*) from motivasyon.ogrenci_kozmetikleri where ogrenci_id = '$OGR' and kozmetik_kodu = 'sapka_kasket'")" 1

adim "2) Bir gun kacirilir (dondurma yok): gece isi -> kacirildi + bozulma olayi (tek)"
kaydir 2   # son aktif gun: bugunden 2 gun once; dunku gun bos
simdi_gece="${GUN}T12:00:00+03:00"
isle gece "$simdi_gece"
sart "seri 0, en uzun 3, dondurma 0, hak 1" "$(seri_sql)" "0,3,0,1"
sart "dunku gun kacirildi" "$(msql "select durum from motivasyon.seri_gunleri where ogrenci_id = '$OGR' and gun = '$GUN'::date - 1")" kacirildi
sart "bozulan_seri / bozulan_gun" "$(msql "select bozulan_seri || ',' || bozulan_gun from motivasyon.seriler where ogrenci_id = '$OGR'")" "3,$(msql "select ('$GUN'::date - 1)")"
sart "onarim penceresi bitisi = bugunun sonu (yarin 04:00 Istanbul)" "$(msql "select (onarim_bitis_at at time zone 'Europe/Istanbul')::text from motivasyon.seriler where ogrenci_id = '$OGR'")" "$YARIN 04:00:00"
sart "bozuldu olayi" "$(msql "select payload->'data'->>'onceki_seri' || ',' || (payload->'data'->>'onarilabilir') || ',' || (payload->'data'->>'onarim_son_gun') from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.motivasyon.seri.bozuldu.v1'")" "3,true,$GUN"
isle gece "$simdi_gece" >/dev/null
sart "gece isi tekrar: ikinci bozulma olayi yok" "$(olay_say bozuldu)" 1
echo "ogrenci ekrani (onarim penceresi): $(seri_detay | jq -c '{bugun, mevcut_seri, en_uzun_seri, onarim: {bozulan_gun: .onarim.bozulan_gun, bozulan_seri: .onarim.bozulan_seri, bitis_at: .onarim.bitis_at, plan: .onarim.hedefler[0]}}')"
sart "onarim bilgisi acik" "$(seri_detay | jq -r '.onarim != null')" true

adim "3) Pencerede 2 kat hedef (2 plan gorevi): kacirilan gun onarim, hak 0, seri geri gelir"
tamamla; satir "select mevcut_seri from motivasyon.seriler where ogrenci_id = '$OGR'" 1
sart "tek gorev onarmaz" "$(msql "select durum from motivasyon.seri_gunleri where ogrenci_id = '$OGR' and gun = '$GUN'::date - 1")" kacirildi
tamamla; satir "select mevcut_seri from motivasyon.seriler where ogrenci_id = '$OGR'" 5
sart "seri 5, en uzun 5, dondurma 0, hak 0" "$(seri_sql)" "5,5,0,0"
sart "dunku gun onarim" "$(msql "select durum from motivasyon.seri_gunleri where ogrenci_id = '$OGR' and gun = '$GUN'::date - 1")" onarim
sart "bozulma bilgisi temizlendi" "$(msql "select bozulan_seri is null and bozulan_gun is null and onarim_bitis_at is null from motivasyon.seriler where ogrenci_id = '$OGR'")" t
echo "ogrenci ekrani: $(takvim)"
sart "benim.seri ozeti" "$(benim | jq -c '[.seri.mevcut_seri, .seri.en_uzun_seri, .seri.onarim_hakki]')" '[5,5,0]'

adim "4) Ogretmen grup duraklatmasi: gece isi duraklatma yazar, seri bozulmaz, dondurma harcanmaz"
kaydir 1   # bugun artik "yeni gun": satirlar bir gun daha gecmise
DUR="$MOT/v1/motivasyon/kurumlar/$KURUM/gruplar/$GRUP/seri-duraklatmalari"
sart "ogrenci duraklatma olusturamaz (403)" "$(durum -X POST "$DUR" -H "authorization: Bearer $O" -d "$(jq -nc --arg g "$GUN" '{baslangic_gun:$g,bitis_gun:$g}')")" 403
DID=$(j -X POST "$DUR" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg g "$GUN" '{baslangic_gun:$g,bitis_gun:$g,neden:"Ara tatil"}')" | jq -r '.id')
sart "ogretmen duraklatma olusturur (id var)" "$([ "$DID" != "null" ] && echo evet || echo hayir)" evet
sart "cakisan aralik 409" "$(durum -X POST "$DUR" -H "authorization: Bearer $S" -d "$(jq -nc --arg g "$GUN" '{baslangic_gun:$g,bitis_gun:$g}')")" 409
sart "31 gunden uzun 422" "$(durum -X POST "$DUR" -H "authorization: Bearer $S" -d "$(jq -nc --arg g "$YARIN" '{baslangic_gun:$g,bitis_gun:"2031-01-01"}')")" 422
sart "liste" "$(j "$DUR" -H "authorization: Bearer $HOCA" | jq -c '[.duraklatmalar[] | [.baslangic_gun, .bitis_gun, .neden, .iptal_at]]')" "[[\"$GUN\",\"$GUN\",\"Ara tatil\",null]]"
# gece isi: ertesi gun 04:10'da (yarin 12:00) bugunu (GUN) degerlendirir
isle gece "${YARIN}T12:00:00+03:00"
sart "bugun duraklatma" "$(msql "select durum from motivasyon.seri_gunleri where ogrenci_id = '$OGR' and gun = '$GUN'::date")" duraklatma
sart "seri bozulmadi (mevcut 5, en uzun 5)" "$(msql "select mevcut_seri || ',' || en_uzun_seri from motivasyon.seriler where ogrenci_id = '$OGR'")" "5,5"
sart "dondurma gunu yok (harcanmadi)" "$(msql "select count(*) from motivasyon.seri_gunleri where ogrenci_id = '$OGR' and durum = 'dondurma'")" 0
sart "yeni bozulma olayi yok" "$(olay_say bozuldu)" 1
echo "ogrenci ekrani: $(takvim)"

adim "5) Risk olayi: yarin 20:00'de bugun aktif olmayan seri>=3 ogrenciye gunde bir kez"
sart "19:59 -> olay yok" "$(isle risk "${YARIN}T19:59:00+03:00" | jq -r '.olay')" 0
sart "20:00 -> 1 olay" "$(isle risk "${YARIN}T20:00:00+03:00" | jq -r '.olay')" 1
sart "20:30 -> ikinci olay yok" "$(isle risk "${YARIN}T20:30:00+03:00" | jq -r '.olay')" 0
echo "risk olayi: $(msql "select payload->'data' from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.motivasyon.seri.risk.v1'")"
sart "risk olayi sayisi" "$(olay_say risk)" 1

adim "6) Duraklatmayi iptal et"
sart "iptal (200)" "$(sil "$DUR/$DID")" 200
sart "ikinci iptal 404" "$(sil "$DUR/$DID")" 404

adim "7) Motivasyon outbox'i (SQL): seri olaylari"
msql "select subject, payload->'data' from ortak.outbox where kurum_id = '$KURUM' and subject like 'evt.motivasyon.seri.%' order by id"
sart "olaylarda kisisel veri yok (ad/telefon/eposta)" "$(msql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and payload::text ~* '(Ali Ogrenci|example.com|telefon)'")" 0
echo "tamam."
