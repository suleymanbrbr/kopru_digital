#!/usr/bin/env bash
# Yonetici paneli gercek deneme: kendi veritabanini kurar (migrate + 1.000 ogrencilik tohum), api'yi bos bir
# portta calistirir, OTP ile giris yapip panel uclarini sureleriyle cagirir, sonunda veritabanini siler.
# Kullanim: bash services/api/scripts/panel-akisi.sh   (postgres kopru-postgres-1 konteynerinde, 5433)
# Ortam: PANEL_PORT (4661), PANEL_DB (kopru_rapor_olcum), KEEP=1 (veritabani ve api acik kalir; web e2e icin).
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PANEL_PORT:-4661}"
DB="${PANEL_DB:-kopru_rapor_olcum}"
PG="docker exec -i kopru-postgres-1 psql -U postgres -v ON_ERROR_STOP=1"
SU="postgres://postgres:postgres@localhost:5433"
KURUM=018f0000-0000-7000-8000-0000000000aa
SAHIP_K=018f0000-0000-7000-8000-000000000001
SAHIP_U=018f0000-0000-7000-8000-0000000000bb
TELEFON=05310000001

$PG -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
DATABASE_URL="$SU/$DB" API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem pnpm -s db:migrate | tail -1
$PG -d "$DB" >/dev/null <<EOF
insert into hesap.kullanicilar (id, telefon_e164, gorunen_ad) values ('$SAHIP_K', '+905310000001', 'Kurum Sahibi');
insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values ('$KURUM', 'Olcum Kurumu', 'kurum', '$SAHIP_K');
insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol, gorunen_ad) values ('$SAHIP_U', '$KURUM', '$SAHIP_K', 'sahip', 'Kurum Sahibi');
-- KVKK metni onceden kabul edilmis sayilmaz: girisi yapan tarayici/istemci onaylar.
EOF
sed "s/{{KURUM_ID}}/$KURUM/g" scripts/rapor-tohum.sql | $PG -d "$DB" >/dev/null
echo "tohum yuklendi (1.000 ogrenci, 50 grup, 30 ogretmen)"

API_PORT=$PORT API_DATABASE_URL="postgres://api_app:api_app@localhost:5433/$DB" \
  API_DATABASE_SISTEM_URL="postgres://api_sistem:api_sistem@localhost:5433/$DB" \
  API_AUTH_ENABLED=true API_SMS_SAGLAYICI=log NODE_ENV=development \
  ./node_modules/.bin/tsx src/main.ts >/tmp/panel-akisi-api.log 2>&1 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true; [ "${KEEP:-0}" = 1 ] || $PG -d postgres -c "drop database if exists $DB with (force)" >/dev/null' EXIT
for i in $(seq 1 40); do curl -sf "localhost:$PORT/health" >/dev/null && break; sleep 0.5; done

B="localhost:$PORT"; H='content-type: application/json'
curl -s -XPOST "$B/auth/otp/gonder" -H "$H" -d "{\"telefon\":\"$TELEFON\"}" >/dev/null
KOD=$($PG -d "$DB" -At -c "select split_part(deger, ':', 1) from hesap.dogrulamalar where tanimlayici like '%5310000001' order by created_at desc limit 1")
OTURUM=$(curl -s -XPOST "$B/auth/otp/dogrula" -H "$H" -d "{\"telefon\":\"$TELEFON\",\"kod\":\"$KOD\"}" | sed -E 's/.*"oturum_belirteci":"([^"]+)".*/\1/')
T0=$(curl -s -XPOST "$B/auth/token" -H "authorization: Bearer $OTURUM" -H "$H" -d '{}' | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
RIZA=$(curl -s "$B/v1/hesap/rizalar/guncel" -H "authorization: Bearer $T0" | sed -E 's/.*"id":"([^"]+)".*/\1/')
curl -s -XPOST "$B/v1/hesap/rizalar" -H "authorization: Bearer $T0" -H "$H" -d "{\"riza_metni_id\":\"$RIZA\"}" >/dev/null
TOKEN=$(curl -s -XPOST "$B/auth/token" -H "authorization: Bearer $OTURUM" -H "$H" -d "{\"kurum_id\":\"$KURUM\"}" | sed -E 's/.*"access_token":"([^"]+)".*/\1/')

for yol in hesap/rapor/ozet ders/rapor/ozet ogrenme/rapor/ozet hesap/rapor/ogrenciler ders/rapor/devam ders/rapor/anladim ogrenme/rapor/odev ogrenme/rapor/plan ogrenme/rapor/soru ogrenme/rapor/disa-aktar; do
  curl -s -o /tmp/panel-akisi-cikti -w "%{http_code} %{time_total}s  $yol\n" -H "authorization: Bearer $TOKEN" "$B/v1/${yol%%/*}/kurumlar/$KURUM/${yol#*/}?donem=30"
done
echo "paralel uc ozet:"
curl -s -o /dev/null -w "toplam %{time_total}s\n" -Z \
  -H "authorization: Bearer $TOKEN" "$B/v1/hesap/kurumlar/$KURUM/rapor/ozet?donem=30" \
  -H "authorization: Bearer $TOKEN" "$B/v1/ders/kurumlar/$KURUM/rapor/ozet?donem=30" \
  -H "authorization: Bearer $TOKEN" "$B/v1/ogrenme/kurumlar/$KURUM/rapor/ozet?donem=30"
curl -s -H "authorization: Bearer $TOKEN" "$B/v1/ogrenme/kurumlar/$KURUM/rapor/ozet?donem=7" | head -c 400; echo

if [ "${KEEP:-0}" = 1 ]; then
  echo "api http://localhost:$PORT acik (PID $API_PID), veritabani $DB duruyor. Web e2e icin:"
  echo "  API_URL=http://localhost:$PORT API_ADMIN_DATABASE_URL=$SU/$DB PANEL_TELEFON=5310000001 pnpm --filter @kopru/web e2e:gercek panel-akisi"
  wait $API_PID
fi
