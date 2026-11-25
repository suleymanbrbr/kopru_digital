#!/usr/bin/env bash
# Alarm kurallarini yerel otel-lgtm konteynerindeki promtool ile dogrular ve her ifadeyi Prometheus'ta
# bir kez calistirir (soz dizimi + metrik adlarinin cozulmesi). Kullanim: infra/gozlem/scripts/alarmlari-dogrula.sh
set -euo pipefail
KONTEYNER="${LGTM_KONTEYNER:-kopru-otel-lgtm-1}"
DOSYA="$(cd "$(dirname "$0")/.." && pwd)/alarmlar/alarmlar.yaml"
docker cp "$DOSYA" "$KONTEYNER:/tmp/alarmlar.yaml"
docker exec "$KONTEYNER" /otel-lgtm/prometheus/promtool check rules /tmp/alarmlar.yaml
