#!/usr/bin/env bash
set -euo pipefail
API="${API:-http://localhost:4110}"
RUN="$RANDOM$RANDOM"
H='content-type: application/json'
E="s1-$RUN@example.com"
UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

echo "== kayit (iPhone Safari UA)"
OT=$(curl -sS -XPOST $API/auth/eposta/kayit -H "$H" -H "user-agent: $UA" -d "{\"eposta\":\"$E\",\"parola\":\"cok-gizli-parola\",\"gorunen_ad\":\"S1 Deneme\"}" | jq -r .oturum_belirteci)
TOK=$(curl -sS -XPOST $API/auth/token -H "authorization: Bearer $OT" -H "$H" -d '{}' | jq -r .access_token)
RID=$(curl -sS $API/v1/hesap/rizalar/guncel -H "authorization: Bearer $TOK" | jq -r '.metinler[0].id')
curl -sS -o /dev/null -XPOST $API/v1/hesap/rizalar -H "authorization: Bearer $TOK" -H "$H" -d "{\"riza_metni_id\":\"$RID\"}"
KID=$(curl -sS -XPOST $API/v1/hesap/kurumlar -H "authorization: Bearer $TOK" -H "$H" -d '{"ad":"S1 Kurumu","tur":"kurum"}' | jq -r .kurum.id)
KT=$(curl -sS -XPOST $API/auth/token -H "authorization: Bearer $OT" -H "$H" -d "{\"kurum_id\":\"$KID\"}" | jq -r .access_token)

echo "== oturumlar (beklenen: iPhone · Safari)"
curl -sS $API/v1/hesap/oturumlar -H "authorization: Bearer $KT" | jq -c '.oturumlar[] | {cihaz, bu_oturum}'
echo "== node UA ile giris (beklenen: cihaz null)"
OT2=$(curl -sS -XPOST $API/auth/eposta/giris -H "$H" -H "user-agent: node" -d "{\"eposta\":\"$E\",\"parola\":\"cok-gizli-parola\"}" | jq -r .oturum_belirteci)
curl -sS $API/v1/hesap/oturumlar -H "authorization: Bearer $KT" | jq -c '.oturumlar[] | {cihaz}'

echo "== bransler"
curl -sS $API/v1/hesap/bransler -H "authorization: Bearer $KT" | jq -c '.bransler | length, .[0], .[-1]'
echo "== bransler kimliksiz (beklenen 401)"
curl -sS -o /dev/null -w '%{http_code}\n' $API/v1/hesap/bransler
echo "== kademeler"
curl -sS $API/v1/hesap/kurumlar/$KID/kademeler -H "authorization: Bearer $KT" | jq -c '.kademeler | length, .[0]'

echo "== PATCH ben"
curl -sS -XPATCH $API/v1/hesap/ben -H "authorization: Bearer $KT" -H "$H" -d '{"gorunen_ad":"Ayşe Demir"}' | jq -c .

echo "== bos JSON govde: content-type json + govdesiz POST (beklenen 200; sema nullish; tum oturumlar kapanir)"
curl -sS -o /dev/null -w '%{http_code}\n' -XPOST $API/v1/hesap/oturumlar/tumunu-kapat -H "authorization: Bearer $KT" -H "$H"
echo "== bozuk JSON (beklenen 400)"
curl -sS -o /dev/null -w '%{http_code}\n' -XPOST $API/auth/token -H "authorization: Bearer $OT2" -H "$H" -d '{x'

echo "== OTP gonderim siniri (6. istek 429 + Retry-After)"
TEL="05$((RANDOM % 9))$((RANDOM % 9))$(printf '%07d' $((RANDOM*RANDOM % 10000000)))"
for i in 1 2 3 4 5 6; do
  curl -sS -D - -o /tmp/s1-otp-body.txt -XPOST $API/auth/otp/gonder -H "$H" -d "{\"telefon\":\"$TEL\"}" | egrep -i "^HTTP|retry-after" | tr '\r\n' '  '; echo
done
cat /tmp/s1-otp-body.txt; echo
