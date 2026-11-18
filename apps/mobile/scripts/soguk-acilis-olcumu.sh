#!/usr/bin/env bash
# Soguk acilis olcumu (iOS simulatoru, gelistirme derlemesi): uygulamayi oldurup yeniden acar ve
# "Bugun" ekraninin ilk dolu karesine kadar gecen duvar saati suresini yazar.
#
# Yontem: `src/lib/olcum.ts` Bugun'un ana veri sorgusu (ogrenci: bugunku gorevler; ogretmen: bugunku
# dersler) ilk kez dolunca `[olcum] ... bitis_epoch=<ms>` satirini Metro'ya yazar. Bu betik acma komutundan
# hemen once duvar saatini alir; fark = tum soguk acilis (native acilis + JS paketi + oturum + onbellek).
# Ayrica satirdaki `NNNms` JS paketinin calismaya basladigi andan itibaren gecen suredir; `kaynak=onbellek`
# veri bir onceki oturumun kalici onbelleginden geldi demektir.
#
# Kullanim: apps/mobile/scripts/soguk-acilis-olcumu.sh <metro-log-dosyasi> [deneme-sayisi]
# On kosul: Metro (--dev-client) bu dosyaya yazilarak calisiyor, uygulama giris yapmis (onbellek dolu).
# Not: gelistirme derlemesinde paket Metro'dan gelir; uretim paketinde gomulu oldugu icin daha hizlidir.
set -euo pipefail
UDID="${UDID:-7A33A3C5-566C-4DF8-B6E1-9253C4390FD8}"
BUNDLE="${BUNDLE:-com.koprudigital.app}"
METRO_PORT="${METRO_PORT:-4845}"
LOG="${1:?metro log dosyasi verilmeli}"
N="${2:-3}"
ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
for i in $(seq 1 "$N"); do
  xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1 || true
  sleep 2
  onceki=$(grep -c 'bugun-dolu' "$LOG" || true)
  onceki_satir=$(grep -c '\[olcum\]' "$LOG" || true)
  t0=$(ms)
  xcrun simctl openurl "$UDID" "kopru://expo-development-client/?url=http%3A%2F%2Flocalhost%3A${METRO_PORT}"
  for _ in $(seq 1 120); do
    simdi=$(grep -c 'bugun-dolu' "$LOG" || true)
    [ "$simdi" -gt "$onceki" ] && break
    sleep 0.1
  done
  satir=$(grep 'bugun-dolu' "$LOG" | tail -1)
  asamalar=$(grep '\[olcum\]' "$LOG" | tail -n +"$((onceki_satir + 1))" | grep -v 'bugun-dolu' | sed 's/.*\[olcum\] //' | tr '\n' ';')
  bitis=$(printf '%s' "$satir" | sed -n 's/.*bitis_epoch=\([0-9]*\).*/\1/p')
  printf "%b\n" "deneme $i: toplam $((bitis - t0)) ms (acma komutundan ilk dolu kareye) | $satir\n    asamalar: $asamalar"
done
