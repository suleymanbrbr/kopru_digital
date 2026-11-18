#!/usr/bin/env bash
# Abonelik cekirdegi: uctan uca curl senaryosu. Tekrar calistirilabilir (her calistirmada yeni kullanici/e-posta/kurum;
# OTP kullanmaz, e-posta+parola ile girer). bash 3.2 uyumlu.
#
# Senaryo: kurum olustur -> 14 gunluk deneme gorunur -> limit dolunca 402 plan_limiti (16. ogrenci, ogretmen) ->
# abonelik elle askiya alinir (SQL) -> yazma 402 abonelik_gerekli, okuma 200 -> fatura bilgisi (abonelik uclari acik) ->
# kurumsal aktivasyon (servis fonksiyonu, CLI) -> yazma tekrar acik -> iptal istegi.
#
# On kosul: api 41500 portunda, ayri veritabaninda; NATS acik:
#   docker compose -f infra/docker/compose.yaml exec -T postgres psql -U postgres -c 'create database kopru_a1_akis'
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_a1_akis \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_a1_akis \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_a1_akis API_PORT=41500 \
#          API_PUBLIC_URL=http://localhost:41500 NATS_URL=nats://localhost:4222
#   pnpm --filter @kopru/api db:migrate && pnpm --filter @kopru/api dev > /tmp/api41500.log 2>&1 &
# SQL adimlari icin PSQL (varsayilan: docker exec ile Postgres konteyneri) ve DB (varsayilan kopru_a1_akis).
# Kullanim (repo kokunden): services/api/scripts/abonelik-akisi.sh
set -euo pipefail

API="${API:-http://localhost:41500}"
DB="${DB:-kopru_a1_akis}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
sql() { docker exec -i kopru-postgres-1 psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -qAt -c "$1"; }

kayit() { # $1 eposta $2 ad -> oturum belirteci (kayit ucu IP basina dakikada 10 istek: 7 sn aralikla)
  local govde
  sleep 7
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
davet() { # $1 sahip erisim belirteci, $2 rol -> belirtec
  j -X POST "$B/davetler" -H "authorization: Bearer $1" -d "$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')" | jq -r '.belirtec'
}
ogrenci_katil() { # $1 sira -> HTTP durumu (davet kabulu)
  local oturum ilk belirtec
  oturum=$(kayit "abonelik-ogr$1-$RUN@example.com" "Ogrenci $1"); ilk=$(token "$oturum"); riza "$ilk"
  belirtec=$(davet "$S" ogrenci)
  durum -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg b "$belirtec" '{belirtec:$b}')"
}

adim "1) Bireysel kurum olustur (solo hoca): 14 gunluk deneme gorunur"
S_OTURUM=$(kayit "abonelik-sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Abonelik Deneme Kurumu","tur":"bireysel"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
B="$API/v1/hesap/kurumlar/$KURUM"
AB="$API/v1/abonelik/kurumlar/$KURUM"
echo "kurum: $KURUM"
Y=$(j "$AB/abonelik" -H "authorization: Bearer $S")
echo "$Y" | jq -c '{kaynak: .abonelik.kaynak, durum: .abonelik.durum, plan: .abonelik.plan.kod, deneme_bitis_at: .abonelik.deneme_bitis_at, limitler: {max_ogrenci: .limitler.max_ogrenci, max_ogretmen: .limitler.max_ogretmen}, kullanim}'
sart "abonelik durumu" "$(echo "$Y" | jq -r '.abonelik.durum')" deneme
sart "kaynak (kart istenmedi)" "$(echo "$Y" | jq -r '.abonelik.kaynak')" deneme
sart "plan (bireysel -> baslangic)" "$(echo "$Y" | jq -r '.abonelik.plan.kod')" baslangic
sart "ogrenci limiti (yer tutucu)" "$(echo "$Y" | jq '.limitler.max_ogrenci')" 15
sart "deneme 13-14 gun icinde bitiyor" "$(echo "$Y" | jq -r '(((.abonelik.deneme_bitis_at | sub("\\.[0-9]+Z$"; "Z") | fromdate) - now) / 86400 | floor)')" 13
sart "yazma kilitli degil" "$(echo "$Y" | jq -r '.yazma_kilitli')" false
sart "olay outboxta (abonelik.degisti)" "$(sql "select count(*) from ortak.outbox where kurum_id='$KURUM' and subject='evt.abonelik.abonelik.degisti.v1'")" 1
sart "planlar (bireysel: baslangic, koc)" "$(j "$AB/planlar" -H "authorization: Bearer $S" | jq -r '[.planlar[].kod] | join(",")')" "baslangic,koc"

adim "2) Limit: Baslangic 15 ogrenci; 15 ogrenci eklenir, 16. icin 402 plan_limiti"
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  KOD=$(ogrenci_katil "$i")
  if [ "$KOD" != "200" ]; then echo "BASARISIZ: ogrenci $i davet kabulu $KOD"; exit 1; fi
done
echo "15 ogrenci eklendi"
sart "kullanim 15/15" "$(j "$AB/abonelik" -H "authorization: Bearer $S" | jq -c '.kullanim.ogrenci')" '{"mevcut":15,"ust_sinir":15}'
O16_OTURUM=$(kayit "abonelik-ogr16-$RUN@example.com" "Ogrenci 16"); O16=$(token "$O16_OTURUM"); riza "$O16"
D16=$(davet "$S" ogrenci)
R16=$(curl -sS -w '\n%{http_code}' -H 'content-type: application/json' -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $O16" -d "$(jq -nc --arg b "$D16" '{belirtec:$b}')")
echo "$R16" | head -n1 | jq -c '.error | {code, details}'
sart "16. ogrenci (402)" "$(echo "$R16" | tail -n1)" 402
sart "hata kodu" "$(echo "$R16" | head -n1 | jq -r '.error.code')" plan_limiti
sart "govde: hangi limit" "$(echo "$R16" | head -n1 | jq -r '.error.details.limit')" max_ogrenci
sart "govde: mevcut/ust sinir" "$(echo "$R16" | head -n1 | jq -c '[.error.details.mevcut, .error.details.ust_sinir]')" "[15,15]"
sart "mevcut veri silinmedi (ogrenci sayisi)" "$(sql "select count(distinct kullanici_id) from hesap.uyelikler where kurum_id='$KURUM' and rol='ogrenci' and durum='aktif'")" 15
O_HOCA_OTURUM=$(kayit "abonelik-hoca-$RUN@example.com" "Ikinci Hoca"); O_HOCA=$(token "$O_HOCA_OTURUM"); riza "$O_HOCA"
DH=$(davet "$S" ogretmen)
RH=$(curl -sS -w '\n%{http_code}' -H 'content-type: application/json' -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $O_HOCA" -d "$(jq -nc --arg b "$DH" '{belirtec:$b}')")
sart "ogretmen limiti (402, kurucu sahip-ogretmen 1/1)" "$(echo "$RH" | tail -n1) $(echo "$RH" | head -n1 | jq -r '.error.details.limit')" "402 max_ogretmen"

adim "3) Abonelik elle askiya alinir (SQL): yazma 402 abonelik_gerekli, okuma 200"
sql "update abonelik.abonelikler set durum='askida' where kurum_id='$KURUM' and durum='deneme'" >/dev/null
sql "update hesap.kurumlar set durum='askida' where id='$KURUM'" >/dev/null
Y2=$(j "$AB/abonelik" -H "authorization: Bearer $S")
sart "durum askida, yazma kilitli" "$(echo "$Y2" | jq -r '[.abonelik.durum, .yazma_kilitli] | join(",")')" "askida,true"
YAZ=$(curl -sS -w '\n%{http_code}' -H 'content-type: application/json' -X POST "$B/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"Yeni Grup"}')
echo "$YAZ" | head -n1 | jq -c '.error | {code, message}'
sart "yazma (POST /gruplar)" "$(echo "$YAZ" | tail -n1)" 402
sart "yazma hata kodu" "$(echo "$YAZ" | head -n1 | jq -r '.error.code')" abonelik_gerekli
sart "yazma (PATCH kurum)" "$(durum -X PATCH "$B" -H "authorization: Bearer $S" -d '{"ad":"X"}')" 402
sart "okuma (GET kurum)" "$(durum "$B" -H "authorization: Bearer $S")" 200
sart "okuma (GET gruplar)" "$(durum "$B/gruplar" -H "authorization: Bearer $S")" 200
sart "abonelik ucu acik (GET abonelik)" "$(durum "$AB/abonelik" -H "authorization: Bearer $S")" 200
sart "abonelik ucu acik (GET planlar)" "$(durum "$AB/planlar" -H "authorization: Bearer $S")" 200
FATURA='{"unvan":"Askida Egitim Ltd.","vergi_no":"1234567890","vergi_dairesi":"Kadikoy","adres":{"satir":"Bagdat Cad. 1","ilce":"Kadikoy","il":"Istanbul"},"eposta":"fatura@example.com","e_fatura_mukellefi":false}'
sart "fatura bilgisi yazma askida da acik (200)" "$(durum -X PUT "$AB/fatura-bilgileri" -H "authorization: Bearer $S" -d "$FATURA")" 200
sart "fatura bilgisi okunur" "$(j "$AB/fatura-bilgileri" -H "authorization: Bearer $S" | jq -r '.fatura_bilgisi.vergi_no')" 1234567890
sart "yeni ogrenci davet kabulu askida 402 abonelik_gerekli" "$(curl -sS -H 'content-type: application/json' -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $O16" -d "$(jq -nc --arg b "$D16" '{belirtec:$b}')" | jq -r '.error.code')" abonelik_gerekli

adim "4) Kurumsal aktivasyon (servis fonksiyonu): yazma tekrar acik, kurum aktif"
SAHIP_ID=$(sql "select olusturan_kullanici_id from hesap.kurumlar where id='$KURUM'")
(cd "$(git rev-parse --show-toplevel)" && pnpm --silent --filter @kopru/api abonelik-kurumsal -- --kurum "$KURUM" --plan koc --sozlesme "TKL-$RUN" --aktor "$SAHIP_ID" --periyot yillik --neden "Teklif ve fatura ile elle aktivasyon (akis betigi)")
Y3=$(j "$AB/abonelik" -H "authorization: Bearer $S")
echo "$Y3" | jq -c '{kaynak: .abonelik.kaynak, durum: .abonelik.durum, plan: .abonelik.plan.kod, periyot: .abonelik.periyot, limitler: {max_ogrenci: .limitler.max_ogrenci}, yazma_kilitli}'
sart "durum aktif, kaynak kurumsal" "$(echo "$Y3" | jq -r '[.abonelik.durum, .abonelik.kaynak] | join(",")')" "aktif,kurumsal"
sart "plan koc (limit 60)" "$(echo "$Y3" | jq -r '[.abonelik.plan.kod, .limitler.max_ogrenci] | join(",")')" "koc,60"
sart "yazma kilidi kalkti" "$(echo "$Y3" | jq -r '.yazma_kilitli')" false
sart "kurum durumu aktif" "$(sql "select durum from hesap.kurumlar where id='$KURUM'")" aktif
sart "yazma (POST /gruplar) tekrar acik" "$(durum -X POST "$B/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"Yeni Grup"}')" 201
sart "tek etkin abonelik" "$(sql "select count(*) from abonelik.abonelikler where kurum_id='$KURUM' and durum in ('deneme','aktif','odeme_bekliyor','ek_sure')")" 1
sart "16. ogrenci artik girebilir (limit 60, 200)" "$(durum -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $O16" -d "$(jq -nc --arg b "$D16" '{belirtec:$b}')")" 200
sart "denetim kaydi (kurumsal aktivasyon)" "$(sql "select count(*) from hesap.denetim_kayitlari where kurum_id='$KURUM' and eylem='sistem.abonelik_kurumsal_aktivasyon'")" 1

adim "5) Plan degistirme istegi ve otomatik yenileme iptali"
PD=$(j -X POST "$AB/abonelik/plan-degistir" -H "authorization: Bearer $S" -d '{"plan_kodu":"baslangic"}')
echo "$PD" | jq -c '{uygulama, bekleyen: .abonelik.bekleyen_plan_kodu, limit_asimlari}'
sart "ucretli abonelikte donem sonunda uygulanir" "$(echo "$PD" | jq -r '.uygulama')" donem_sonu
sart "limit asimi bildirilir (16 ogrenci > 15)" "$(echo "$PD" | jq -r '.limit_asimlari[0].limit + ":" + (.limit_asimlari[0].mevcut|tostring)')" "max_ogrenci:16"
sart "tur uymayan plan 404" "$(durum -X POST "$AB/abonelik/plan-degistir" -H "authorization: Bearer $S" -d '{"plan_kodu":"kurum"}')" 404
IP=$(j -X POST "$AB/abonelik/iptal" -H "authorization: Bearer $S" -d '{}')
sart "iptal istegi: donem sonunda sona erer (otomatik yenileme kapali)" "$(echo "$IP" | jq -r '[.abonelik.durum, .abonelik.otomatik_yenileme, (.abonelik.iptal_istendi_at != null)] | join(",")')" "aktif,false,true"
sart "iptal sonrasi tam erisim surer (POST /gruplar)" "$(durum -X POST "$B/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"Iptal Sonrasi"}')" 201

adim "6) Yetki: ogrenci abonelik uclarini goremez (yalniz sahip)"
O16_UYE=$(token "$O16_OTURUM" "$KURUM")
sart "ogrenci GET abonelik (403)" "$(durum "$AB/abonelik" -H "authorization: Bearer $O16_UYE")" 403

echo
echo "TUM ADIMLAR BASARILI"
