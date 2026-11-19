#!/usr/bin/env bash
# Platform entegrasyon akisi (paket I1): gercek api + motivasyon (ayri veritabanlari, ayri NATS) uctan uca.
#
# Senaryo: platform yoneticisi -> giris -> 2FA'siz belirtec motivasyon ayarini OKUYAMAZ (403 ikinci_adim_gerekli)
#  -> 2FA kur/onayla -> /auth/token ile YENI belirtec (plat_2fa_exp claim'i) -> motivasyon ayari okunur (200)
#  -> mufredat taslagi 2FA'siz 403 / 2FA'li 200 (P1 kapisi, denetim satiri)
#  -> taklit: hedefin yan etkili GET'i (yoklama listesi) taklitte 200 ve yazmaz; taklitte yazma 403; DB'de
#     READ ONLY islem yazmayi reddeder (scripts/salt-okunur-deneme.ts)
#  -> kurumu platformdan askiya al: kurum kullanicisi 403 kurum_askida; abonelik "odeme" simulasyonu
#     (kurumsal aktivasyon CLI = aboneligiAktiflestir) askiyi KALDIRMAZ; /ac ile kalkar
#  -> kurumsal aktivasyon platform ucundan, abonelik gecmisi, deneme uzatma, ek sure, plan degistirme.
#
# Kendi sureclerini baslatir (watch'siz) ve isi bitince kapatir; yalniz kendi portlarini/PID'lerini oldurur.
# Portlar: api 41710, motivasyon 41711 (JWKS api'den). NATS: kopru-nats-i1 (4242) yoksa olusturur, ise o actiysa siler.
# bash 3.2 (macOS) uyumlu. Gereken: curl, jq, docker (Postgres kopru-postgres-1, 5433), pnpm, node.
# Kullanim (repo kokunden): services/api/scripts/platform-entegrasyon-akisi.sh
set -euo pipefail

KOK="$(cd "$(dirname "$0")/../../.." && pwd)"
APIDIZIN="$KOK/services/api"
MOTDIZIN="$KOK/services/motivasyon"
API_PORT=41710
MOT_PORT=41711
API="http://localhost:$API_PORT"
MOT="http://localhost:$MOT_PORT"
DB_API="${DB_API:-kopru_i1_api}"
DB_MOT="${DB_MOT:-kopru_i1_mot}"
NATS_PORT=4242
NATS_KAP="kopru-nats-i1"
NATS="nats://localhost:$NATS_PORT"
TMP="$(mktemp -d)"
PIDS=""
NATS_BIZ=0
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

PG() { docker exec kopru-postgres-1 psql -U postgres "$@"; }
sql() { PG -d "$DB_API" -tAc "$1"; }

temizle() {
  local p
  for p in $PIDS; do kill "$p" 2>/dev/null || true; done
  sleep 1
  for p in $PIDS; do kill -9 "$p" 2>/dev/null || true; done
  lsof -ti "tcp:$API_PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  lsof -ti "tcp:$MOT_PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  PG -qc "drop database if exists $DB_API with (force)" >/dev/null 2>&1 || true
  PG -qc "drop database if exists $DB_MOT with (force)" >/dev/null 2>&1 || true
  if [ "$NATS_BIZ" = 1 ]; then docker rm -f "$NATS_KAP" >/dev/null 2>&1 || true; fi
  rm -rf "$TMP"
}
trap temizle EXIT

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }

kayit() { # $1 eposta $2 ad -> oturum belirteci
  local govde
  govde=$(jq -nc --arg e "$1" --arg p "$PAROLA" --arg a "$2" '{eposta:$e,parola:$p,gorunen_ad:$a}')
  j -X POST "$API/auth/eposta/kayit" -d "$govde" | jq -r '.oturum_belirteci'
}
token() { # $1 oturum belirteci, $2 (ops.) kurum_id -> erisim belirteci
  local govde
  govde=$(jq -nc --arg k "${2:-}" 'if $k == "" then {} else {kurum_id:$k} end')
  j -X POST "$API/auth/token" -H "authorization: Bearer $1" -d "$govde" | jq -r '.access_token'
}
riza() { # $1 erisim belirteci
  local id govde
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
    govde=$(jq -nc --arg i "$id" '{riza_metni_id:$i}')
    j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$govde" >/dev/null
  done
}
totp() { # $1 base32 sir
  node -e '
    const c = require("node:crypto");
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bit = 0, v = 0; const b = [];
    for (const ch of process.argv[1]) { v = ((v << 5) | A.indexOf(ch)) & 0xffff; bit += 5; if (bit >= 8) { b.push((v >>> (bit - 8)) & 255); bit -= 8; } }
    const sayac = Math.floor(Date.now() / 30000);
    const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(sayac));
    const h = c.createHmac("sha1", Buffer.from(b)).update(m).digest();
    const o = h[h.length - 1] & 15;
    const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    console.log(String(n % 1000000).padStart(6, "0"));
  ' "$1"
}
claims() { node -e 'console.log(Buffer.from(process.argv[1].split(".")[1], "base64url").toString("utf8"))' "$1"; }
P() { # $1 yontem $2 yol $3 belirtec $4 (ops.) govde -> yanit govdesi
  local govde="${4:-}"
  if [ -z "$govde" ] && [ "$1" = POST ]; then govde='{}'; fi
  if [ -n "$govde" ]; then j -X "$1" "$API$2" -H "authorization: Bearer $3" -d "$govde"; else j -X "$1" "$API$2" -H "authorization: Bearer $3"; fi
}
PD() { # P ile ayni, yalniz HTTP durum kodu
  local govde="${4:-}"
  if [ -z "$govde" ] && [ "$1" = POST ]; then govde='{}'; fi
  if [ -n "$govde" ]; then durum -X "$1" "$API$2" -H "authorization: Bearer $3" -d "$govde"; else durum -X "$1" "$API$2" -H "authorization: Bearer $3"; fi
}
MD() { # motivasyon GET, yalniz durum kodu
  curl -sS -o /dev/null -w '%{http_code}' "$MOT/platform/motivasyon/ayarlar" -H "authorization: Bearer $1"
}

adim "0) Altyapi: NATS, veritabanlari, api ve motivasyon (watch'siz)"
if ! docker ps --format '{{.Names}}' | grep -q "^$NATS_KAP\$"; then
  docker run -d --name "$NATS_KAP" -p "$NATS_PORT:4222" nats:2 -js >/dev/null
  NATS_BIZ=1
fi
PG -qc "drop database if exists $DB_API with (force)" >/dev/null
PG -qc "drop database if exists $DB_MOT with (force)" >/dev/null
PG -qc "create database $DB_API"
PG -qc "create database $DB_MOT"
export API_DATABASE_OWNER_URL="postgres://postgres:postgres@localhost:5433/$DB_API" API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem
(cd "$APIDIZIN" && pnpm run db:migrate 2>&1 | tail -2)
PG -d "$DB_API" -q < "$APIDIZIN/scripts/mufredat-tohum.sql" >/dev/null
export MOTIVASYON_DATABASE_OWNER_URL="postgres://postgres:postgres@localhost:5433/$DB_MOT" MOTIVASYON_APP_PASSWORD=motivasyon_app MOTIVASYON_SISTEM_PASSWORD=motivasyon_sistem
(cd "$MOTDIZIN" && pnpm run db:migrate 2>&1 | tail -2)
export API_DATABASE_URL="postgres://api_app:api_app@localhost:5433/$DB_API" \
  API_DATABASE_SISTEM_URL="postgres://api_sistem:api_sistem@localhost:5433/$DB_API" \
  API_PORT="$API_PORT" API_PUBLIC_URL="$API" API_PLATFORM_IP_IZINLI="127.0.0.1/32,::1/128" \
  API_LOG_LEVEL=warn NATS_URL="$NATS"
(cd "$APIDIZIN" && exec ./node_modules/.bin/tsx src/main.ts >"$TMP/api.log" 2>&1) &
PIDS="$PIDS $!"
(
  export MOTIVASYON_DATABASE_URL="postgres://motivasyon_app:motivasyon_app@localhost:5433/$DB_MOT" \
    MOTIVASYON_DATABASE_SISTEM_URL="postgres://motivasyon_sistem:motivasyon_sistem@localhost:5433/$DB_MOT" \
    MOTIVASYON_PORT="$MOT_PORT" MOTIVASYON_AUTH_ENABLED=true MOTIVASYON_LOG_LEVEL=warn \
    JWKS_URL="$API/.well-known/jwks.json" MOTIVASYON_PLATFORM_IP_IZINLI="127.0.0.1/32,::1/128"
  cd "$MOTDIZIN" && exec ./node_modules/.bin/tsx src/main.ts >"$TMP/mot.log" 2>&1
) &
PIDS="$PIDS $!"
for i in $(seq 1 80); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$API/ready" || true)" = 200 ] && [ "$(curl -s -o /dev/null -w '%{http_code}' "$MOT/ready" || true)" = 200 ]; then break; fi
  sleep 0.5
done
sart "api /ready" "$(curl -s -o /dev/null -w '%{http_code}' "$API/ready")" 200
sart "motivasyon /ready" "$(curl -s -o /dev/null -w '%{http_code}' "$MOT/ready")" 200

adim "1) Hedef kurum (okul sahibi) ve platform yoneticisi"
EH="sahip$RUN@example.com"
OH=$(kayit "$EH" "Okul Sahibi"); AH=$(token "$OH"); riza "$AH"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $AH" -d "$(jq -nc --arg a "Entegrasyon Okulu $RUN" '{ad:$a,tur:"bireysel"}')" | jq -r '.kurum.id')
HEDEF_KULLANICI=$(j "$API/v1/hesap/ben" -H "authorization: Bearer $AH" | jq -r '.kullanici.id')
HT=$(token "$OH" "$KURUM")
DERSLER="/v1/ders/kurumlar/$KURUM/dersler?baslangic=2026-01-01T00:00:00Z&bitis=2026-02-01T00:00:00Z"
sart "hedef kendi takvimini okuyor" "$(PD GET "$DERSLER" "$HT")" 200
EY="yonetici$RUN@example.com"
OY=$(kayit "$EY" "Platform Yoneticisi")
(cd "$APIDIZIN" && pnpm --silent platform:yonetici-ekle -- "$EY" --rol yonetici)
OY=$(j -X POST "$API/auth/eposta/giris" -d "$(jq -nc --arg e "$EY" --arg p "$PAROLA" '{eposta:$e,parola:$p}')" | jq -r '.oturum_belirteci')
AY=$(token "$OY")
echo "2FA'dan once claim'ler: $(claims "$AY" | jq -c '{plat, plat_2fa_exp}')"

adim "2) 2FA'siz belirtec: api /platform ve motivasyon ayari kapali"
sart "api 2FA'siz /platform/kurumlar" "$(PD GET /platform/kurumlar "$AY")" 403
sart "motivasyon ayari 2FA'siz belirtec" "$(MD "$AY")" 403
curl -sS "$MOT/platform/motivasyon/ayarlar" -H "authorization: Bearer $AY" | jq -c '.error.code'
sart "motivasyon hata kodu" "$(curl -sS "$MOT/platform/motivasyon/ayarlar" -H "authorization: Bearer $AY" | jq -r '.error.code')" ikinci_adim_gerekli
sart "mufredat taslagi 2FA'siz (P1 kapisi)" "$(PD POST /platform/mufredat/kataloglar/lgs/taslak "$AY" '{"ad":"LGS 2027"}')" 403
sart "mufredat 2FA'siz hata kodu" "$(P POST /platform/mufredat/kataloglar/lgs/taslak "$AY" '{"ad":"LGS 2027"}' | jq -r '.error.code')" ikinci_adim_gerekli

adim "3) 2FA kur/onayla -> /auth/token ile YENI belirtec"
KUR=$(P POST /platform/ikinci-adim/kur "$AY" '{}')
SIR=$(echo "$KUR" | jq -r '.sir')
sart "2FA onay" "$(PD POST /platform/ikinci-adim/onayla "$AY" "$(jq -nc --arg k "$(totp "$SIR")" '{kod:$k}')")" 200
sart "eski belirtec motivasyonda hala 403 (claim yok)" "$(MD "$AY")" 403
AY2=$(token "$OY")
echo "yeni belirtec claim'leri: $(claims "$AY2" | jq -c '{plat, plat_2fa_exp, sid}')"
sart "yeni belirtecte plat_2fa_exp var" "$(claims "$AY2" | jq -r 'has("plat_2fa_exp")')" true
sart "motivasyon ayari 2FA'li belirtec" "$(MD "$AY2")" 200
curl -sS "$MOT/platform/motivasyon/ayarlar?limit=1" -H "authorization: Bearer $AY2" | jq -c '{surum: .gecerli.surum}'
sart "kurum belirteci motivasyonda 403" "$(MD "$HT")" 403

adim "4) Mufredat editoru: 2FA'li belirtec 200 + denetim (P1 yardimcisi)"
sart "taslak ac" "$(PD POST /platform/mufredat/kataloglar/lgs/taslak "$AY2" '{"ad":"LGS 2027","aciklama":"Entegrasyon denemesi"}')" 201
sart "mufredat denetimi" "$(sql "select count(*) from hesap.denetim_kayitlari where eylem = 'platform.mufredat.taslak_ac' and sonra->>'durum' is null and ip is not null")" 1
sart "kataloglar (okuma)" "$(PD GET /platform/mufredat/kataloglar "$AY2")" 200

adim "5) Taklit: yan etkili GET yazmaz, yazma 403, DB READ ONLY reddeder"
TAKLIT=$(P POST /platform/taklit "$AY2" "$(jq -nc --arg h "$HEDEF_KULLANICI" --arg k "$KURUM" '{hedef_kullanici_id:$h,kurum_id:$k,neden:"Destek talebi 7001: takvim incelemesi"}')")
TT=$(echo "$TAKLIT" | jq -r '.access_token'); TID=$(echo "$TAKLIT" | jq -r '.taklit_id')
sart "taklit: dersler (okuma)" "$(PD GET "$DERSLER" "$TT")" 200
sart "taklit: yazma" "$(PD POST /v1/hesap/kurumlar "$TT" '{"ad":"X","tur":"bireysel"}')" 403
(cd "$APIDIZIN" && API_DATABASE_URL="$API_DATABASE_URL" ./node_modules/.bin/tsx scripts/salt-okunur-deneme.ts "$KURUM")
sart "DB denemesi yazmadi (modul_ayarlari bos)" "$(sql "select count(*) from hesap.modul_ayarlari where kurum_id = '$KURUM'")" 0
sart "taklit sonlandir" "$(PD POST "/platform/taklit/$TID/sonlandir" "$AY2")" 200

adim "6) Platform askisi ve abonelik askisi ayri"
OLAY0=$(sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.hesap.kurum.degisti.v1'")
sart "askiya al (neden kisa)" "$(PD POST "/platform/kurumlar/$KURUM/askiya-al" "$AY2" '{"neden":"kisa"}')" 400
sart "askiya al" "$(PD POST "/platform/kurumlar/$KURUM/askiya-al" "$AY2" '{"neden":"Kotuye kullanim incelemesi (entegrasyon denemesi)"}')" 200
sart "kurum.durum = askida, platform_askida_at dolu" "$(sql "select durum || '/' || (platform_askida_at is not null) from hesap.kurumlar where id = '$KURUM'")" "askida/true"
sart "kurum kullanicisi 403" "$(PD GET "$DERSLER" "$HT")" 403
echo "kod: $(P GET "$DERSLER" "$HT" | jq -r '.error.code')"
sart "kurum.degisti olayi (askida) bir tane eklendi" "$(sql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.hesap.kurum.degisti.v1'")" "$((OLAY0 + 1))"
echo "-- abonelik 'odemesi' (aboneligiAktiflestir yolu; kurumsal aktivasyon CLI): askiyi kaldirmamali"
(cd "$APIDIZIN" && pnpm --silent abonelik-kurumsal -- --kurum "$KURUM" --plan baslangic --sozlesme "ODEME-$RUN" --aktor "$HEDEF_KULLANICI" --neden "Odeme simulasyonu: askiyi kaldirmamali")
sart "abonelik aktif oldu" "$(sql "select durum from abonelik.abonelikler where kurum_id = '$KURUM' and durum = 'aktif'")" aktif
sart "ama kurum hala askida (platform askisi)" "$(sql "select durum || '/' || (platform_askida_at is not null) from hesap.kurumlar where id = '$KURUM'")" "askida/true"
sart "kurum kullanicisi hala 403" "$(PD GET "$DERSLER" "$HT")" 403
sart "platform ac" "$(PD POST "/platform/kurumlar/$KURUM/ac" "$AY2" '{"neden":"Inceleme tamamlandi, aski kalkti"}')" 200
sart "kurum aktif, platform askisi yok" "$(sql "select durum || '/' || (platform_askida_at is not null) from hesap.kurumlar where id = '$KURUM'")" "aktif/false"
sart "kurum kullanicisi tekrar 200" "$(PD GET "$DERSLER" "$HT")" 200

adim "7) Kurumsal aktivasyon, abonelik gecmisi ve duzeltmeler (platform uclari)"
sart "yeni kurum detayinda abonelik ozeti" "$(P GET "/platform/kurumlar/$KURUM" "$AY2" | jq -r '.abonelik.abonelik.kaynak')" kurumsal
KURUM2=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $AH" -d "$(jq -nc --arg a "Entegrasyon Okulu 2 $RUN" '{ad:$a,tur:"bireysel"}')" | jq -r '.kurum.id')
U="/platform/kurumlar/$KURUM2/abonelik"
sart "baslangic: deneme" "$(P GET "$U" "$AY2" | jq -r '.abonelik.durum')" deneme
sart "deneme uzat (+10 gun)" "$(PD POST "$U/deneme-uzat" "$AY2" '{"gun":10,"neden":"Pilot kurum deneme uzatma talebi"}')" 200
sart "plan degistir (hemen)" "$(P POST "$U/plan-degistir" "$AY2" '{"plan_kodu":"koc","neden":"Kurum talebi plan duzeltmesi"}' | jq -r '.abonelik.plan.kod')" koc
KURUMSAL=$(P POST "$U/kurumsal-aktivasyon" "$AY2" '{"plan_kodu":"koc","sozlesme_no":"SZL-2026-777","periyot":"yillik","neden":"Teklif kabul edildi, fatura kesildi"}')
echo "$KURUMSAL" | jq -c '{durum: .abonelik.durum, kaynak: .abonelik.kaynak, plan: .abonelik.plan.kod, kurum_durumu, platform_askida}'
sart "kurumsal aktivasyon" "$(echo "$KURUMSAL" | jq -r '.abonelik.kaynak + "/" + .abonelik.durum')" "kurumsal/aktif"
sart "abonelik gecmisi" "$(P GET "$U" "$AY2" | jq -r '[.gecmis[].durum] | join(",")')" "aktif,sona_erdi"
DEN=$(P GET "/platform/denetim?kurum_id=$KURUM2&limit=50" "$AY2")
echo "$DEN" | jq -r '.kayitlar | reverse | .[] | select(.eylem | startswith("platform.abonelik")) | "\(.eylem)  neden=\(.neden)"'
sart "abonelik eylemleri denetimde" "$(echo "$DEN" | jq '[.kayitlar[] | select(.eylem | startswith("platform.abonelik_"))] | length >= 3')" true

echo "TAMAM"
