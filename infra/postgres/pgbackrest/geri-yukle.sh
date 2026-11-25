#!/usr/bin/env bash
# pgBackRest geri yukleme betigi. YIKICIDIR: hedef veri dizinindeki her sey degisir.
# Kullanim (YENI/bos bir sunucuda ya da durdurulmus PostgreSQL'de, postgres kullanicisiyla):
#   geri-yukle.sh son                          # en son yedek + tum WAL (en yeni duruma)
#   geri-yukle.sh zaman "2026-11-19 14:05:00+03"   # PITR: o ana kadar (yanlis silmeden hemen once)
#   geri-yukle.sh yedek 20261119-033000F       # belirli yedek (WAL olmadan tutarli nokta)
# Sonrasi: PostgreSQL baslar, kurtarma tamamlaninca `select pg_wal_replay_resume()` gerekebilir
# (target-action=pause); sonuclari dogrulayin, sonra `pg_wal_replay_resume()` ile terfi ettirin.
# Tam adimlar: docs/isletim/el-kitabi.md "Veritabani geri yukleme".
set -euo pipefail

STANZA="${PGBACKREST_STANZA:-kopru}"
PGDATA="${PGDATA:-/var/lib/postgresql/17/main}"
MOD="${1:-}"

if systemctl is-active --quiet postgresql 2>/dev/null; then
  echo "HATA: PostgreSQL calisiyor. Once durdurun: systemctl stop postgresql" >&2
  exit 1
fi

case "$MOD" in
  son)
    pgbackrest --stanza="$STANZA" --delta --type=default restore
    ;;
  zaman)
    HEDEF="${2:?zaman damgasi gerekli, ornek: \"2026-11-19 14:05:00+03\"}"
    pgbackrest --stanza="$STANZA" --delta --type=time --target="$HEDEF" \
      --target-action=pause --target-timeline=current restore
    ;;
  yedek)
    ETIKET="${2:?yedek etiketi gerekli (pgbackrest info)}"
    pgbackrest --stanza="$STANZA" --delta --set="$ETIKET" --type=immediate \
      --target-action=pause restore
    ;;
  *)
    echo "Kullanim: $0 {son|zaman <damga>|yedek <etiket>}" >&2
    exit 2
    ;;
esac

echo "Geri yukleme tamam: $PGDATA. Simdi: systemctl start postgresql ; sonra tutarlilik kontrolu."
