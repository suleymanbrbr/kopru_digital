#!/usr/bin/env bash
# Abonelik odeme saglayicilari: uctan uca curl senaryosu (sahte iyzico + RevenueCat). Tekrar calistirilabilir
# (her calistirmada yeni kullanici/kurum; OTP kullanmaz, e-posta+parola ile girer). bash 3.2 uyumlu.
#
# Senaryo: (A kurumu) fatura bilgisi yok -> odeme baslat 422 -> fatura bilgisi -> odeme baslat (oturum) ->
# imzali webhook -> aktif (SURE yazdirilir, hedef < 10 sn) -> fatura `kesildi` (log saglayici) -> ayni webhook tekrar
# -> yenileme basarisiz -> odeme_bekliyor -> basarili -> aktif -> (B kurumu) RevenueCat INITIAL_PURCHASE -> aktif ->
# B icin iyzico baslatma 409 abonelik_baska_kanalda -> A icin iade -> erisim biter + iade faturasi.
#
# On kosul: api 41700 portunda, ayri veritabaninda, sahte odeme kanaliyla:
#   docker exec kopru-postgres-1 psql -U postgres -c 'create database kopru_a2_akis'
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_a2_akis \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_a2_akis \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_a2_akis API_PORT=41700 \
#          API_PUBLIC_URL=http://localhost:41700 ODEME_IYZICO=sahte SAHTE_ODEME_SIRRI=sahte-sir \
#          REVENUECAT_WEBHOOK_SIRRI=rc-akis-paylasilan-sir
#   pnpm --filter @kopru/api db:migrate && (cd services/api && npx tsx src/main.ts > /tmp/api41700.log 2>&1 &)
# SQL adimlari icin DB (varsayilan kopru_a2_akis; docker exec ile Postgres konteyneri).
# Kullanim (repo kokunden): services/api/scripts/abonelik-odeme-akisi.sh
set -euo pipefail

API="${API:-http://localhost:41700}"
DB="${DB:-kopru_a2_akis}"
SAHTE_SIR="${SAHTE_ODEME_SIRRI:-sahte-sir}"
RC_SIR="${REVENUECAT_WEBHOOK_SIRRI:-rc-akis-paylasilan-sir}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
sql() { docker exec -i kopru-postgres-1 psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
ms() { perl -MTime::HiRes=time -e 'printf("%d", time()*1000)'; }
iso() { # $1 = bugunden itibaren gun (negatif olabilir)
  date -u -v"$([ "$1" -ge 0 ] && echo "+$1" || echo "$1")d" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "$1 days" +%Y-%m-%dT%H:%M:%SZ
}

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
riza() { # $1 erisim belirteci
  local id
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
    j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null
  done
}
kurum_ac() { # $1 etiket -> "kurum_id token" (kurum turu: kurum -> plan `kurum`)
  local oturum ilk kurum t
  oturum=$(kayit "odeme-$1-$RUN@example.com" "Sahip $1"); ilk=$(token "$oturum"); riza "$ilk"
  kurum=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg a "Odeme Akisi $1" '{ad:$a,tur:"kurum"}')" | jq -r '.kurum.id')
  t=$(token "$oturum" "$kurum")
  echo "$kurum $t"
}
iyzico_gonder() { # $1 ham govde -> HTTP yaniti (imzali)
  local imza
  imza=$(printf '%s' "$1" | openssl dgst -sha256 -hmac "$SAHTE_SIR" -hex | sed 's/^.* //')
  curl -sS -X POST "$API/v1/abonelik/webhook/iyzico" -H 'content-type: application/json' -H "x-sahte-imza: $imza" --data-binary "$1"
}
odeme_govdesi() { # $1 olay_id $2 islem_id $3 abonelik_id $4 durum $5 baslangic_gun $6 bitis_gun [$7 oturum_token] [$8 iade_edilen]
  jq -nc --arg id "$1" --arg islem "$2" --arg ab "$3" --arg durum "$4" --arg bas "$(iso "$5")" --arg bit "$(iso "$6")" \
    --arg tok "${7:-}" --arg iade "${8:-}" \
    '{id:$id,tur:("odeme."+$durum),abonelik_id:$ab,islem_id:$islem,
      odeme:({durum:$durum,tutar_kurus:599880,donem_baslangic_at:$bas,donem_bitis_at:$bit}
             + (if $durum == "basarisiz" then {hata_kodu:"kart_reddedildi"} else {} end)
             + (if $iade != "" then {iade_edilen_islem_id:$iade} else {} end))}
     + (if $tok != "" then {oturum_token:$tok} else {} end)'
}
abonelik_durumu() { j "$API/v1/abonelik/kurumlar/$1/abonelik" -H "authorization: Bearer $2" | jq -r '[.abonelik.durum, .abonelik.kaynak] | join("/")'; }
bekle() { # $1 aciklama $2 kurum $3 token $4 beklenen "durum/kaynak" [$5 sure sn] -> gecen ms
  local t0 t bitis="${5:-10}" g
  t0=$(ms)
  while true; do
    g=$(abonelik_durumu "$2" "$3")
    if [ "$g" = "$4" ]; then t=$(( $(ms) - t0 )); echo "$t"; return 0; fi
    if [ $(( $(ms) - t0 )) -gt $(( bitis * 1000 )) ]; then echo "BASARISIZ: $1 ($bitis sn icinde '$4' olmadi, son: '$g')" >&2; exit 1; fi
    sleep 0.1
  done
}

adim "1) A kurumu olustur; fatura bilgisi yokken odeme baslatma 422"
read -r KA TA <<EOF
$(kurum_ac A)
EOF
AA="$API/v1/abonelik/kurumlar/$KA"
echo "kurum A: $KA"
sart "fatura bilgisi yokken odeme baslat" "$(durum -X POST "$AA/odeme/baslat" -H "authorization: Bearer $TA" -d '{"plan_kodu":"kurum","periyot":"aylik"}')" 422
sart "hata kodu" "$(j -X POST "$AA/odeme/baslat" -H "authorization: Bearer $TA" -d '{"plan_kodu":"kurum"}' | jq -r '.error.code')" fatura_bilgisi_gerekli

adim "2) Fatura bilgisi yaz, odeme baslat (iyzico sahte): yonlendirme adresi + KDV dahil tutar"
sart "fatura bilgisi PUT" "$(durum -X PUT "$AA/fatura-bilgileri" -H "authorization: Bearer $TA" -d '{"unvan":"Akis Egitim Ltd. Sti.","vergi_no":"1234567890","vergi_dairesi":"Kadikoy","adres":{"satir":"Moda Cd. 1","ilce":"Kadikoy","il":"Istanbul"},"eposta":"fatura@akis.test"}')" 200
B=$(j -X POST "$AA/odeme/baslat" -H "authorization: Bearer $TA" -d '{"plan_kodu":"kurum","periyot":"aylik"}')
echo "$B" | jq -c .
OTURUM=$(echo "$B" | jq -r '.oturum_id')
sart "tutar (499900 + %20 KDV)" "$(echo "$B" | jq -r '.tutar_kurus')" 599880
sart "kdv" "$(echo "$B" | jq -r '.kdv_kurus')" 99980
sart "deneme suruyor (cift abonelik sayilmaz)" "$(abonelik_durumu "$KA" "$TA")" deneme/deneme

adim "3) Imza: gecersiz imza 401; imzali odeme webhook'u -> aktif (SURE)"
GOVDE=$(odeme_govdesi "evt_$RUN-1" "ord_$RUN-1" "sub_$RUN" basarili 0 30 "sahte_$OTURUM")
sart "gecersiz imza" "$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/v1/abonelik/webhook/iyzico" -H 'content-type: application/json' -H "x-sahte-imza: $(printf 'a%.0s' $(seq 1 64))" --data-binary "$GOVDE")" 401
T0=$(ms)
Y=$(iyzico_gonder "$GOVDE")
echo "webhook yaniti: $Y"
sart "webhook alindi" "$(echo "$Y" | jq -r '.durum')" alindi
GECEN=$(bekle "odeme -> aktif" "$KA" "$TA" aktif/iyzico)
TOPLAM=$(( $(ms) - T0 ))
echo "SURE: webhook istegi -> abonelik aktif = ${TOPLAM} ms (aktiflik yoklamasi dahil; hedef < 10000 ms)"
if [ "$TOPLAM" -ge 10000 ]; then echo "BASARISIZ: aktivasyon 10 sn'yi asti"; exit 1; fi
sart "abonelik aktif/iyzico" "$(abonelik_durumu "$KA" "$TA")" aktif/iyzico
sart "tekrar webhook" "$(iyzico_gonder "$GOVDE" | jq -r '.durum')" tekrar
sart "odeme satiri sayisi" "$(j "$AA/odemeler" -H "authorization: Bearer $TA" | jq '.odemeler | length')" 1

adim "4) e-Arsiv: fatura kesildi (log saglayici), matrah/KDV"
for i in $(seq 1 50); do
  F=$(j "$AA/faturalar" -H "authorization: Bearer $TA")
  [ "$(echo "$F" | jq -r '.faturalar[0].durum // "yok"')" = "kesildi" ] && break
  sleep 0.2
done
echo "$F" | jq -c '.faturalar[] | {tur, durum, fatura_no, matrah_kurus, kdv_kurus, toplam_kurus, kdv_orani, pdf_dosya_id}'
sart "fatura durumu" "$(echo "$F" | jq -r '.faturalar[0].durum')" kesildi
sart "fatura matrahi" "$(echo "$F" | jq -r '.faturalar[0].matrah_kurus')" 499900
sart "fatura KDV" "$(echo "$F" | jq -r '.faturalar[0].kdv_kurus')" 99980
sart "e-Arsiv saglayici" "$(sql "select entegrator from abonelik.faturalar where kurum_id='$KA'")" log
sart "olay outboxta (odeme.islendi)" "$(sql "select count(*) from ortak.outbox where kurum_id='$KA' and subject='evt.abonelik.odeme.islendi.v1'")" 1
sart "olay outboxta (fatura.kesildi)" "$(sql "select count(*) from ortak.outbox where kurum_id='$KA' and subject='evt.abonelik.fatura.kesildi.v1'")" 1

adim "5) Yenileme basarisiz -> odeme_bekliyor; (sirasiz eski olay etkisiz); basarili -> aktif"
iyzico_gonder "$(odeme_govdesi "evt_$RUN-2" "ord_$RUN-2" "sub_$RUN" basarisiz 30 60)" >/dev/null
bekle "yenileme basarisiz" "$KA" "$TA" odeme_bekliyor/iyzico >/dev/null
sart "basarisiz odeme kaydi" "$(j "$AA/odemeler" -H "authorization: Bearer $TA" | jq -r '[.odemeler[] | select(.durum=="basarisiz") | .hata_kodu][0]')" kart_reddedildi
iyzico_gonder "$(odeme_govdesi "evt_$RUN-eski" "ord_$RUN-eski" "sub_$RUN" basarili -30 0)" >/dev/null
sleep 1
sart "sirasiz eski olay durumu degistirmez" "$(abonelik_durumu "$KA" "$TA")" odeme_bekliyor/iyzico
iyzico_gonder "$(odeme_govdesi "evt_$RUN-3" "ord_$RUN-3" "sub_$RUN" basarili 30 60)" >/dev/null
bekle "yenileme basarili" "$KA" "$TA" aktif/iyzico >/dev/null
sart "abonelik tekrar aktif" "$(abonelik_durumu "$KA" "$TA")" aktif/iyzico

adim "6) B kurumu: RevenueCat INITIAL_PURCHASE (App Store) -> aktif; faturasiz"
read -r KB TB <<EOF
$(kurum_ac B)
EOF
AB="$API/v1/abonelik/kurumlar/$KB"
echo "kurum B: $KB"
sql "update abonelik.planlar set magaza_urun_kodlari = '{\"apple\":\"kopru.kurum.aylik\",\"google\":\"kopru_kurum\"}'::jsonb where kod='kurum' and surum=1" >/dev/null
NOW_MS=$(ms)
RC=$(jq -nc --arg id "rc_$RUN" --arg kurum "$KB" --arg tx "tx_$RUN" --argjson bas "$NOW_MS" --argjson bit "$(( NOW_MS + 30*86400000 ))" \
  '{api_version:"1.0",event:{id:$id,type:"INITIAL_PURCHASE",app_user_id:$kurum,product_id:"kopru.kurum.aylik",store:"APP_STORE",environment:"PRODUCTION",purchased_at_ms:$bas,expiration_at_ms:$bit,transaction_id:$tx,original_transaction_id:("o"+$tx),currency:"TRY",price_in_purchased_currency:5998.8}}')
sart "yanlis RevenueCat sirri" "$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/v1/abonelik/webhook/revenuecat" -H 'content-type: application/json' -H 'authorization: yanlis' --data-binary "$RC")" 401
Y=$(curl -sS -X POST "$API/v1/abonelik/webhook/revenuecat" -H 'content-type: application/json' -H "authorization: Bearer $RC_SIR" --data-binary "$RC")
sart "RevenueCat webhook alindi" "$(echo "$Y" | jq -r '.durum')" alindi
GECEN=$(bekle "magaza satin alma -> aktif" "$KB" "$TB" aktif/apple)
sart "B abonelik" "$(abonelik_durumu "$KB" "$TB")" aktif/apple
sart "magaza odemesi kaydi" "$(j "$AB/odemeler" -H "authorization: Bearer $TB" | jq -r '.odemeler[0] | [.kaynak, .durum] | join("/")')" apple/basarili
sleep 1
sart "magaza odemesine fatura kesilmez" "$(j "$AB/faturalar" -H "authorization: Bearer $TB" | jq '.faturalar | length')" 0

adim "7) Cift abonelik engeli: B (App Store aktif) icin iyzico baslatma 409 abonelik_baska_kanalda"
sart "B fatura bilgisi" "$(durum -X PUT "$AB/fatura-bilgileri" -H "authorization: Bearer $TB" -d '{"unvan":"B Egitim","vergi_no":"1234567890","adres":{"satir":"x","ilce":"y","il":"z"},"eposta":"b@akis.test"}')" 200
R=$(j -X POST "$AB/odeme/baslat" -H "authorization: Bearer $TB" -d '{"plan_kodu":"kurum"}' -w '\n%{http_code}')
sart "iyzico baslatma HTTP" "$(echo "$R" | tail -1)" 409
sart "hata kodu" "$(echo "$R" | head -1 | jq -r '.error.code')" abonelik_baska_kanalda
sart "B hala App Store" "$(abonelik_durumu "$KB" "$TB")" aktif/apple
# Magaza aktifken gelen iyzico odemesi abonelik acmaz: olay kaydedilir, alarm + denetim.
ZOR=$(jq -nc --arg id "evt_$RUN-cift" --arg k "$KB" --arg bas "$(iso 0)" --arg bit "$(iso 30)" \
  '{id:$id,tur:"odeme.basarili",kurum_id:$k,abonelik_id:"sub_zorla",islem_id:"ord_zorla",odeme:{durum:"basarili",tutar_kurus:599880,donem_baslangic_at:$bas,donem_bitis_at:$bit}}')
iyzico_gonder "$ZOR" >/dev/null
sleep 1
sart "cift kanal olayi yoksayildi" "$(sql "select durum||'/'||hata from abonelik.abonelik_olaylari where dis_olay_id='evt_$RUN-cift'")" yoksayildi/cift_kanal
sart "cift kanal denetim kaydi" "$(sql "select count(*) from hesap.denetim_kayitlari where kurum_id='$KB' and eylem='sistem.abonelik_cift_kanal'")" 1
sart "B abonelik degismedi" "$(abonelik_durumu "$KB" "$TB")" aktif/apple

adim "8) Iade (A): iade satiri, iade faturasi, erisim biter"
iyzico_gonder "$(odeme_govdesi "evt_$RUN-iade" "iade_$RUN" "sub_$RUN" iade 30 60 "" "ord_$RUN-3")" >/dev/null
bekle "iade -> sona_erdi" "$KA" "$TA" sona_erdi/iyzico >/dev/null
sart "A abonelik sona erdi" "$(abonelik_durumu "$KA" "$TA")" sona_erdi/iyzico
sart "kurum askida (yazma kilitli)" "$(j "$API/v1/abonelik/kurumlar/$KA/abonelik" -H "authorization: Bearer $TA" | jq -r '.yazma_kilitli')" true
sart "iade satiri ters_cevrilen_id dolu" "$(j "$AA/odemeler" -H "authorization: Bearer $TA" | jq -r '[.odemeler[] | select(.durum=="iade") | (.ters_cevrilen_id != null)][0]')" true
for i in $(seq 1 50); do
  N=$(j "$AA/faturalar" -H "authorization: Bearer $TA" | jq '[.faturalar[] | select(.tur=="iade" and .durum=="kesildi")] | length')
  [ "$N" = "1" ] && break
  sleep 0.2
done
sart "iade faturasi kesildi" "$N" 1
j "$AA/faturalar" -H "authorization: Bearer $TA" | jq -c '.faturalar[] | {tur, durum, fatura_no, toplam_kurus}'
sart "iade faturasi toplami" "$(j "$AA/faturalar" -H "authorization: Bearer $TA" | jq -r '[.faturalar[] | select(.tur=="iade") | .toplam_kurus][0]')" 599880

printf '\nTUM ADIMLAR GECTI (aktivasyon suresi: %s ms)\n' "$TOPLAM"
