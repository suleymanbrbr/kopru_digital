#!/usr/bin/env bash
# Derlenmis bir imajin uretim ayariyla acildigini dener (CI `imajlar.yml` ve yerel denemede AYNI betik).
#
#   infra/scripts/imaj-denemesi.sh <ad> <port> <saglik_yolu> [imaj_etiketi]
#   infra/scripts/imaj-denemesi.sh api 4000 /health           # kopru/api:ci
#   infra/scripts/imaj-denemesi.sh web 3000 /api/saglik
#
# 1) HTTP sureci: NODE_ENV=production, AUTH_ENABLED=true; saglik ucu 200 ve imajdaki HEALTHCHECK betigi 0 donmeli.
# 2) Worker (yalniz servis imajlari): ayni imaj, `node dist/worker.js`; kendi NATS konteyneri ile BAGLI calisir
#    (NATS baglantisi surecin ayakta kalmasini ve canlilik dosyasinin yazilmasini saglar) ve HEALTHCHECK 0 donmeli.
# Actigi tum konteyner ve agi cikista siler.
set -euo pipefail

ad="${1:?ad}"
port="${2:?port}"
yol="${3:?saglik yolu}"
imaj="${4:-kopru/${ad}:ci}"
hport="${HOST_PORT:-$port}"   # yerelde cakisan portlar icin
son="$$"
ag="imaj-denemesi-${ad}-${son}"
uyg="imaj-uyg-${ad}-${son}"
wrk="imaj-wrk-${ad}-${son}"
nats="imaj-nats-${ad}-${son}"

temizle() {
  docker rm -f "$uyg" "$wrk" "$nats" >/dev/null 2>&1 || true
  docker network rm "$ag" >/dev/null 2>&1 || true
}
hata() {
  echo "--- uygulama gunlugu"; docker logs "$uyg" 2>&1 | tail -30 || true
  echo "--- worker gunlugu"; docker logs "$wrk" 2>&1 | tail -30 || true
}
trap temizle EXIT
trap 'hata' ERR

ortak=(
  -e BETTER_AUTH_SECRET=ci-icin-uretilmis-sir-0123456789abcdef
  -e AUTH_ENABLED=true
  -e JWKS_URL=http://127.0.0.1:9/.well-known/jwks.json
  -e S3_ENDPOINT=http://127.0.0.1:9 -e S3_ACCESS_KEY_ID=ci -e S3_SECRET_ACCESS_KEY=ci
)

docker network create "$ag" >/dev/null

echo "== HTTP sureci ($imaj)"
docker run -d --name "$uyg" --network "$ag" -p "${hport}:${port}" "${ortak[@]}" "$imaj" >/dev/null
ok=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${hport}${yol}"; then ok=1; echo; break; fi
  sleep 1
done
[ "$ok" = 1 ] || { echo "BASARISIZ: ${yol} 200 donmedi"; false; }
docker exec "$uyg" node saglik.mjs
echo "ok: HEALTHCHECK betigi (HTTP)"

case "$ad" in
  web | admin) echo "ok: $ad"; exit 0 ;;
esac

echo "== Worker ($imaj node dist/worker.js, NATS ile)"
docker run -d --name "$nats" --network "$ag" nats:2 -js >/dev/null
docker run -d --name "$wrk" --network "$ag" "${ortak[@]}" \
  -e NATS_URL="nats://${nats}:4222" -e WORKER_SAGLIK_DOSYASI=/tmp/worker-canli \
  "$imaj" node dist/worker.js >/dev/null
ok=0
for _ in $(seq 1 60); do
  if [ "$(docker inspect -f '{{.State.Running}}' "$wrk")" != true ]; then break; fi
  if docker exec "$wrk" node saglik.mjs; then ok=1; break; fi
  sleep 1
done
[ "$ok" = 1 ] || { echo "BASARISIZ: worker canli degil"; false; }
# Birkac saniye sonra hala ayakta ve canli olmali (acilista cikip gitmemeli).
sleep 12
[ "$(docker inspect -f '{{.State.Running}}' "$wrk")" = true ] || { echo "BASARISIZ: worker durdu"; false; }
docker exec "$wrk" node saglik.mjs
echo "ok: worker canli ve bagli ($ad)"
