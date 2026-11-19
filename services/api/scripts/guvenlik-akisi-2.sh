#!/usr/bin/env bash
# Guvenlik akisi 2 (denetim S1): gercek api sureci uzerinde curl ile
#  (a) e-posta girisinde hesap basina kilit (S1-01: 10 yanlis deneme -> 429),
#  (b) kimliksiz/bozuk/alg=none belirteci 401,
#  (c) CORS: izinsiz origin icin Access-Control-Allow-Origin yok,
#  (d) webhook govde siniri 413,
#  (e) uretimde AUTH_ENABLED=false ile ortam dogrulamasi reddeder (S1-02).
# bash 3.2 uyumlu, tekrar calistirilabilir. Kullanim (kokten):
#   API=http://localhost:41822 services/api/scripts/guvenlik-akisi-2.sh
# On kosul: api ayri veritabaninda calisiyor (bkz. guvenlik-akisi.sh basligi). Adim (a) IP basina dakikada 10 giris
# sinirini asmamak icin 61 sn bekler (yaklasik 1,5 dk surer).
set -euo pipefail

API="${API:-http://localhost:41822}"
RUN="$RANDOM$RANDOM"

adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }
# bash 3.2: $(...) icinde ic ice tirnakli JSON sorunlu oldugundan govde once degiskene alinir.
post_durum() { curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d "$2" "$1"; }

adim "A) E-posta girisinde hesap basina kilit"
EPOSTA="kilit${RUN}@example.com"
PAROLA="cok-gizli-parola-1"
KAYIT_GOVDE="{\"eposta\":\"$EPOSTA\",\"parola\":\"$PAROLA\"}"
KAYIT_DURUM=$(post_durum "$API/auth/eposta/kayit" "$KAYIT_GOVDE")
sart "kayit" "$KAYIT_DURUM" 200
i=0
while [ "$i" -lt 10 ]; do
  YANLIS_GOVDE="{\"eposta\":\"$EPOSTA\",\"parola\":\"yanlis-parola-$i\"}"
  post_durum "$API/auth/eposta/giris" "$YANLIS_GOVDE" >/dev/null
  i=$((i + 1))
  # IP basina dakikada 10 sinirina (rota hiz siniri) takilmadan hesap kilidini sinamak icin 8. denemede bekle.
  if [ "$i" -eq 8 ]; then sleep 61; fi
done
KILIT_DURUM=$(post_durum "$API/auth/eposta/giris" "$KAYIT_GOVDE")
sart "10 basarisiz denemeden sonra DOGRU parola reddedilir" "$KILIT_DURUM" 429

adim "B) Belirtec dogrulama"
sart "belirtecsiz" "$(durum "$API/v1/hesap/ben")" 401
sart "bozuk belirtec" "$(durum "$API/v1/hesap/ben" -H 'authorization: Bearer abc.def.ghi')" 401
B_BASLIK=$(printf '{"alg":"none","typ":"JWT"}' | base64 | tr -d '=' | tr '/+' '_-')
B_YUK=$(printf '{"sub":"x","kurum_id":"x"}' | base64 | tr -d '=' | tr '/+' '_-')
NONE="$B_BASLIK.$B_YUK."
sart "alg=none belirteci" "$(durum "$API/v1/hesap/ben" -H "authorization: Bearer $NONE")" 401
sart "platform ucu kimliksiz" "$(durum "$API/platform/ben")" 401

adim "C) CORS"
BASLIK=$(curl -sS -D - -o /dev/null "$API/health" -H 'origin: https://evil.example.com' | tr -d '\r' | grep -i '^access-control-allow-origin' || true)
sart "izinsiz origin icin ACAO basligi yok" "${BASLIK:-yok}" "yok"

adim "D) Webhook govde siniri"
BUYUK=$(head -c 300000 /dev/zero | tr '\0' 'a')
BUYUK_GOVDE="{\"x\":\"$BUYUK\"}"
sart "300 KB webhook govdesi" "$(post_durum "$API/v1/abonelik/webhook/iyzico" "$BUYUK_GOVDE")" 413

adim "E) Uretimde AUTH_ENABLED=false"
if (cd services/motivasyon && NODE_ENV=production AUTH_ENABLED=false node -e "
  import('@kopru/service-kit').then(({ loadEnv, createEnvSchema }) => {
    loadEnv(createEnvSchema({ defaultPort: 1 }), { source: { NODE_ENV: 'production', AUTH_ENABLED: 'false' } });
  });" >/dev/null 2>&1); then
  echo "BASARISIZ: uretimde AUTH_ENABLED=false kabul edildi"
  exit 1
else
  echo "ok: uretimde AUTH_ENABLED=false reddedildi"
fi

printf '\nTUM ADIMLAR BASARILI\n'
