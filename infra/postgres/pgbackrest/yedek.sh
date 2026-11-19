#!/usr/bin/env bash
# pgBackRest yedek betigi (birincil sunucuda postgres kullanicisiyla, cron/systemd timer'dan).
#   yedek.sh tam        # gunluk tam yedek (03:30 Europe/Istanbul onerilir)
#   yedek.sh artimli    # istege bagli: artimli (fark) yedek
#   yedek.sh dogrula    # yedek deposunu dogrula (haftalik)
# Basari/yas Prometheus'a yazilir (textfile collector): kopru_pgbackrest_son_basarili_yedek_zaman
# (alarm: yedek yasi > 26 sa, bkz. infra/gozlem/alarmlar/alarmlar.yaml).
set -euo pipefail

STANZA="${PGBACKREST_STANZA:-kopru}"
TUR="${1:-tam}"
METRIK_DIZINI="${METRIK_DIZINI:-/var/lib/node_exporter/textfile_collector}"

metrik_yaz() {
  [ -d "$METRIK_DIZINI" ] || return 0
  local dosya="$METRIK_DIZINI/kopru_pgbackrest.prom"
  {
    echo "# TYPE kopru_pgbackrest_son_basarili_yedek_zaman gauge"
    echo "kopru_pgbackrest_son_basarili_yedek_zaman{tur=\"$1\"} $(date +%s)"
  } >"$dosya.tmp" && mv "$dosya.tmp" "$dosya"
}

case "$TUR" in
  tam)
    pgbackrest --stanza="$STANZA" --type=full backup
    pgbackrest --stanza="$STANZA" check
    metrik_yaz tam
    ;;
  artimli)
    pgbackrest --stanza="$STANZA" --type=diff backup
    metrik_yaz artimli
    ;;
  dogrula)
    pgbackrest --stanza="$STANZA" verify
    ;;
  *)
    echo "Kullanim: $0 {tam|artimli|dogrula}" >&2
    exit 2
    ;;
esac

pgbackrest --stanza="$STANZA" info
