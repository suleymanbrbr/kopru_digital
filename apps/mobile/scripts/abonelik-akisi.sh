#!/usr/bin/env bash
# Mobil abonelik denemesi: gercek api + sahte magaza saglayicisi + RevenueCat webhook'u. bash 3.2 uyumlu.
#
# Akis: `hazirla` sahip kullanici + kurum acar (telefon OTP'si api logundan okunur) ve planlara sahte magaza
# urun kodlari yazar; uygulama (sahte magaza saglayicisi, EXPO_PUBLIC_REVENUECAT_* bos) "Satin al"a basinca
# `webhook` komutu RevenueCat INITIAL_PURCHASE gonderir -> kurum aktif/apple olur -> ekran aktif gorunur.
#
# On kosul (api, ayri veritabani, ornek portlar 41740):
#   docker exec kopru-postgres-1 psql -U postgres -c 'create database kopru_m1_akis'
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_m1_akis \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_m1_akis \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_m1_akis API_PORT=41740 \
#          API_PUBLIC_URL=http://localhost:41740 ODEME_IYZICO=sahte SAHTE_ODEME_SIRRI=sahte-sir \
#          REVENUECAT_WEBHOOK_SIRRI=rc-m1-sir
#   pnpm --filter @kopru/api db:migrate && (cd services/api && npx tsx src/main.ts > $API_LOG 2>&1 &)
# Metro (mobil): CI=1 EXPO_PUBLIC_API_URL=http://localhost:41740 EXPO_PUBLIC_PUSH_SAHTE=1 \
#   npx expo start --dev-client --port 41741 (apps/mobile; Watchman bozuksa CI=1 sart)
#
# Kullanim:
#   abonelik-akisi.sh hazirla                 # kullanici + kurum; telefon ve kurum kimligi yazdirilir
#   abonelik-akisi.sh otp                     # girisi icin son OTP kodu (api logundan)
#   abonelik-akisi.sh webhook [urun_kodu]     # INITIAL_PURCHASE (varsayilan kopru.baslangic.aylik)
#   abonelik-akisi.sh iptal                   # CANCELLATION: otomatik yenileme kapanir, donem sonuna kadar erisim
#   abonelik-akisi.sh deneme-bitir [gun]      # denemeyi N gun sonrasina ayarlar (varsayilan 2) -> sahibe afis
#   abonelik-akisi.sh ek-sure | aski | kurum-aski | temizle-aski | durum
set -euo pipefail

API="${API:-http://localhost:41740}"
DB="${DB:-kopru_m1_akis}"
RC_SIR="${REVENUECAT_WEBHOOK_SIRRI:-rc-m1-sir}"
API_LOG="${API_LOG:-/tmp/api41740.log}"
DURUM="${DURUM_DOSYASI:-/tmp/kopru-m1-abonelik.env}"
TELEFON="${TELEFON:-05321110044}"

j() { curl -sS -H 'content-type: application/json' "$@"; }
sql() { docker exec -i kopru-postgres-1 psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
ms() { perl -MTime::HiRes=time -e 'printf("%d", time()*1000)'; }
son_otp() { grep '\[DEV SMS\]' "$API_LOG" | tail -1 | sed -E 's/.*doğrulama kodunuz: ([0-9]{6}).*/\1/'; }
kurum_id() { # shellcheck disable=SC1090
  . "$DURUM"; echo "$KURUM_ID"
}

hazirla() {
  j -XPOST "$API/auth/otp/gonder" -d "$(jq -nc --arg t "$TELEFON" '{telefon:$t}')" >/dev/null
  sleep 1
  local kod oturum ilk kurum
  kod=$(son_otp)
  oturum=$(j -XPOST "$API/auth/otp/dogrula" -d "$(jq -nc --arg t "$TELEFON" --arg k "$kod" '{telefon:$t,kod:$k}')" | jq -r '.oturum_belirteci')
  ilk=$(j -XPOST "$API/auth/token" -H "authorization: Bearer $oturum" -d '{}' | jq -r '.access_token')
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $ilk" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
    j -XPOST "$API/v1/hesap/rizalar" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null
  done
  kurum=$(j -XPOST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $ilk" -d '{"ad":"Abonelik Deneme Kursu","tur":"bireysel"}' | jq -r '.kurum.id')
  printf 'KURUM_ID=%s\nTELEFON=%s\n' "$kurum" "$TELEFON" > "$DURUM"
  # Planlara sahte magaza urun kodlari (Apple: kopru.<plan>.<periyot>; mobil urun kimliginden plan kodunu ayiklar).
  sql "update abonelik.planlar set magaza_urun_kodlari = jsonb_build_object('apple','kopru.'||kod||'.aylik','google','kopru_'||kod) where surum=1" >/dev/null
  echo "kurum: $kurum"
  echo "telefon: $TELEFON (uygulamada giris: bu numara; OTP: ./abonelik-akisi.sh otp)"
}

webhook() {
  local kurum urun now
  kurum=$(kurum_id); urun="${1:-kopru.baslangic.aylik}"; now=$(ms)
  local tx="tx_$RANDOM$RANDOM"
  local govde
  govde=$(jq -nc --arg id "rc_$tx" --arg kurum "$kurum" --arg urun "$urun" --arg tx "$tx" --argjson bas "$now" --argjson bit "$(( now + 30*86400000 ))" \
    '{api_version:"1.0",event:{id:$id,type:"INITIAL_PURCHASE",app_user_id:$kurum,product_id:$urun,store:"APP_STORE",environment:"PRODUCTION",purchased_at_ms:$bas,expiration_at_ms:$bit,transaction_id:$tx,original_transaction_id:("o"+$tx),currency:"TRY",price_in_purchased_currency:299.99}}')
  curl -sS -XPOST "$API/v1/abonelik/webhook/revenuecat" -H 'content-type: application/json' -H "authorization: Bearer $RC_SIR" --data-binary "$govde"
  echo
}

iptal() {
  local kurum now govde tx="tx_ipt$RANDOM"
  kurum=$(kurum_id); now=$(ms)
  govde=$(jq -nc --arg id "rc_$tx" --arg kurum "$kurum" --argjson bas "$now" --argjson bit "$(( now + 30*86400000 ))" \
    '{api_version:"1.0",event:{id:$id,type:"CANCELLATION",app_user_id:$kurum,product_id:"kopru.baslangic.aylik",store:"APP_STORE",environment:"PRODUCTION",event_timestamp_ms:$bas,purchased_at_ms:$bas,expiration_at_ms:$bit,cancel_reason:"UNSUBSCRIBE",original_transaction_id:"oTXORJ"}}')
  curl -sS -XPOST "$API/v1/abonelik/webhook/revenuecat" -H 'content-type: application/json' -H "authorization: Bearer $RC_SIR" --data-binary "$govde"
  echo
}

case "${1:-}" in
  hazirla) hazirla ;;
  otp) son_otp ;;
  webhook) shift; webhook "$@" ;;
  iptal) iptal ;;
  deneme-bitir)
    sql "update abonelik.abonelikler set deneme_bitis_at = now() + interval '${2:-2} days' - interval '1 hour' where kurum_id='$(kurum_id)' and durum='deneme'" ;;
  ek-sure)
    sql "update abonelik.abonelikler set durum='ek_sure', ek_sure_bitis_at = now() + interval '5 days' where kurum_id='$(kurum_id)'" ;;
  aski)
    sql "update abonelik.abonelikler set durum='askida' where kurum_id='$(kurum_id)'" ;;
  kurum-aski)
    sql "update hesap.kurumlar set durum='askida', platform_askida_at=now(), platform_aski_nedeni='mobil deneme' where id='$(kurum_id)'" ;;
  temizle-aski)
    sql "update hesap.kurumlar set durum='aktif', platform_askida_at=null, platform_aski_nedeni=null where id='$(kurum_id)'" ;;
  durum)
    sql "select durum, kaynak, otomatik_yenileme from abonelik.abonelikler where kurum_id='$(kurum_id)'" ;;
  *) sed -n '2,30p' "$0"; exit 2 ;;
esac
