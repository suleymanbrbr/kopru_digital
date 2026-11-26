#!/usr/bin/env bash
# Soguk acilis olcumu (iOS simulatoru, RELEASE derlemesi). bash 3.2 uyumlu.
#
# Release derlemesinde Metro ve konsol cikisi yoktur. Bu yuzden uygulama `EXPO_PUBLIC_OLCUM_URL` ile
# derlenir; "Bugun" ilk dolu karede `GET <adres>/?m=[olcum] ...` gonderir. Bu betik yerel bir dinleyici
# acar, uygulamayi oldurup `simctl launch` ile yeniden baslatir ve baslatma komutundan isaretci gelene
# kadar gecen duvar saati suresini yazar (native acilis + JS paketi + oturum + onbellek + ilk cizim).
# Satirdaki `NNNms` JS paketinin calismaya basladigi andan itibaren gecen suredir; fark = native acilis.
#
# Derleme (once; api calisiyor olmali, uygulama giris yapmis olmali ki onbellek/anlik dolu olsun):
#   cd apps/mobile
#   LANG=en_US.UTF-8 CI=1 EXPO_PUBLIC_API_URL=http://localhost:41850 EXPO_PUBLIC_OLCUM_URL=http://localhost:41851 \
#     npx expo run:ios --configuration Release --device <udid> --no-bundler
#   (JS degisince ayni komut yalniz paketi yeniden uretir: `ios/` dizinindeki derleme artimlidir.)
#
# Kullanim: apps/mobile/scripts/soguk-acilis-release.sh [deneme-sayisi] [log-dosyasi]
#   Ortam: UDID, BUNDLE (varsayilan com.koprudigital.app), OLCUM_PORT (41851)
# Not: Uretim derlemesine EXPO_PUBLIC_OLCUM_URL giremez (`app.config.ts` uretimDenetimi reddeder).
set -euo pipefail
UDID="${UDID:-7A33A3C5-566C-4DF8-B6E1-9253C4390FD8}"
BUNDLE="${BUNDLE:-com.koprudigital.app}"
PORT="${OLCUM_PORT:-41851}"
N="${1:-5}"
LOG="${2:-/tmp/kopru-olcum-$PORT.log}"
: > "$LOG"
ms() { python3 -c 'import time; print(int(time.time()*1000))'; }

python3 - "$PORT" "$LOG" <<'PY' &
import sys, time, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
port, log = int(sys.argv[1]), sys.argv[2]
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('m', [''])[0]
        with open(log, 'a') as f:
            f.write('%d\t%s\n' % (int(time.time() * 1000), q))
        self.send_response(200); self.end_headers()
    def log_message(self, *a): pass
HTTPServer(('127.0.0.1', port), H).serve_forever()
PY
DINLEYICI=$!
trap 'kill $DINLEYICI 2>/dev/null || true' EXIT
sleep 1

for i in $(seq 1 "$N"); do
  xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1 || true
  sleep 3
  onceki=$(grep -c 'bugun-dolu' "$LOG" || true)
  t0=$(ms)
  xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null
  for _ in $(seq 1 200); do
    simdi=$(grep -c 'bugun-dolu' "$LOG" || true)
    [ "$simdi" -gt "$onceki" ] && break
    sleep 0.05
  done
  satir=$(grep 'bugun-dolu' "$LOG" | tail -1)
  alinan=${satir%%$'\t'*}
  if [ "$simdi" -le "$onceki" ]; then echo "deneme $i: isaretci gelmedi (giris yapildi mi? bugun ekrani doldu mu?)"; continue; fi
  asamalar=$(tail -n +1 "$LOG" | awk -F'\t' -v t="$t0" '$1 >= t {print $2}' | grep -v 'bugun-dolu' | sed 's/.*\[olcum\] //' | tr '\n' ';')
  # JS tarafi: JS paketinin calismaya basladigi an = bitis_epoch - NNNms; oncesi native acilis + paket yukleme.
  bitis=$(printf '%s' "$satir" | sed -n 's/.*bitis_epoch=\([0-9]*\).*/\1/p')
  jsms=$(printf '%s' "$satir" | sed -n 's/.*dolu \([0-9]*\)ms.*/\1/p')
  kaynak=$(printf '%s' "$satir" | sed -n 's/.*kaynak=\([a-z]*\).*/\1/p')
  native=$((bitis - jsms - t0))
  printf "deneme %s: toplam %s ms = native+paket %s ms + JS %s ms (kaynak=%s) | asamalar: %s\n" \
    "$i" "$((alinan - t0))" "$native" "$jsms" "$kaynak" "$asamalar"
done
