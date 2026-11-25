#!/usr/bin/env bash
# Pano JSON'larini yerel otel-lgtm Grafana'ya (3030) yukler (idempotent: ayni uid uzerine yazar).
# Kullanim: infra/gozlem/scripts/panolari-yukle.sh   (GRAFANA_URL, GRAFANA_KULLANICI varsayilanlari yerel)
# Uretimde panolar Grafana provisioning (infra/gozlem/grafana/panolar.yaml) ile dosyadan yuklenir.
set -euo pipefail
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3030}"
KULLANICI="${GRAFANA_KULLANICI:-admin:admin}"   # otel-lgtm varsayilani; yalniz yerel gelistirme
DIZIN="$(cd "$(dirname "$0")/.." && pwd)/panolar"
for dosya in "$DIZIN"/*.json; do
  govde="$(jq -c '{dashboard: ., overwrite: true, folderUid: ""}' "$dosya")"
  sonuc="$(curl -fsS -u "$KULLANICI" -H 'Content-Type: application/json' -d "$govde" "$GRAFANA_URL/api/dashboards/db")"
  echo "$(basename "$dosya"): $(echo "$sonuc" | jq -r '.url // .message')"
done
