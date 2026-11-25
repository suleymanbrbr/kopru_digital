#!/usr/bin/env bash
# Geri yukleme tatbikati: calisan bir PostgreSQL'den yedek alir, AYRI gecici bir konteynere geri yukler ve
# dogrular. Kaynaga yalniz OKUMA yapar (pg_dump / pg_basebackup); kaynak konteyneri durdurmaz.
#
#   infra/scripts/geri-yukleme-tatbikati.sh [mantiksal|fiziksel|hepsi]     (varsayilan: hepsi)
#
# Ortam:
#   KAYNAK_KONTEYNER   varsayilan kopru-postgres-1
#   HEDEF_PORT         varsayilan 41815 (gecici konteynerin host portu)
#   VERITABANLARI      varsayilan "api motivasyon bildirim medya" (kaynakta olanlar)
#   YEDEK_DIZINI       varsayilan gecici dizin (sonda silinir)
#
# Mantiksal: pg_dumpall --globals-only (roller) + pg_dump -Fc (her veritabani) -> pg_restore.
# Fiziksel : pg_basebackup -X stream (sunucu kopyasi) -> yeni konteynerde kurtarma ile acilis.
# Dogrulama: her tablonun satir sayisi kaynakla karsilastirilir (kaynak yedek sirasinda degisebilir:
#            geri yuklenen sayi, yedek oncesi/sonrasi sayilarin arasinda olmali), RLS politika ve
#            rol sayilari esit olmali, tum veritabanlarina baglanilabilmeli.
# Cikis kodu 0 = tatbikat basarili. Sureler (RTO'ya girdi) sonda yazdirilir.
set -euo pipefail

MOD="${1:-hepsi}"
KAYNAK="${KAYNAK_KONTEYNER:-kopru-postgres-1}"
PORT="${HEDEF_PORT:-41815}"
VERITABANLARI="${VERITABANLARI:-api motivasyon bildirim medya}"
IMAJ="$(docker inspect "$KAYNAK" --format '{{.Config.Image}}')"
AD="kopru-d2-geri-yukleme-$$"
VOLUME="$AD-veri"
if [ -n "${YEDEK_DIZINI:-}" ]; then
  mkdir -p "$YEDEK_DIZINI"
  DIZIN="$YEDEK_DIZINI"
else
  DIZIN="$(mktemp -d "${TMPDIR:-/tmp}/kopru-yedek.XXXXXX")"
fi
HATA=0

gunluk() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
sure() { # sure <etiket> <komut...>: saniye cinsinden sureyi SURELER'e yazar
  local etiket="$1"; shift
  local b=$SECONDS
  "$@"
  SURELER+=("$etiket: $((SECONDS - b)) sn")
}
SURELER=()

temizle() {
  docker rm -f "$AD" >/dev/null 2>&1 || true
  docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true
  docker exec "$KAYNAK" rm -rf /tmp/kopru-tatbikat >/dev/null 2>&1 || true
  rm -rf "$DIZIN"
}
trap temizle EXIT

kaynak_sql() { docker exec -i "$KAYNAK" psql -U postgres -X -At -d "$1" -c "$2"; }
hedef_sql() { docker exec -i "$AD" psql -U postgres -X -At -d "$1" -c "$2"; }

# Veritabaninda: "sema.tablo|satir_sayisi" (kesin sayim) + RLS politika sayisi.
SAYIM_SQL="select format('%I.%I', n.nspname, c.relname) || '|' ||
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname not in ('pg_catalog', 'information_schema') order by 1"
POLITIKA_SQL="select count(*) from pg_policies"

hedef_hazir_bekle() {
  for _ in $(seq 1 90); do
    if docker exec "$AD" pg_isready -U postgres -q 2>/dev/null; then
      # Kurtarma bitmis ve yazmaya acik mi?
      if [ "$(hedef_sql postgres 'select pg_is_in_recovery()' 2>/dev/null || echo t)" = "f" ]; then return 0; fi
    fi
    sleep 1
  done
  echo "HATA: hedef PostgreSQL hazir olmadi" >&2
  docker logs --tail 30 "$AD" >&2 || true
  return 1
}

# Kaynak ve hedefin tablo sayimlarini karsilastirir. Argumanlar: <oncesi_dosyasi> <sonrasi_dosyasi> <db>
dogrula() {
  local db="$1" once="$DIZIN/sayim-$1-once.txt" sonra="$DIZIN/sayim-$1-sonra.txt" hedef="$DIZIN/sayim-$1-hedef.txt"
  hedef_sql "$db" "$SAYIM_SQL" >"$hedef"
  local sorun=0 toplam=0 satir
  while IFS='|' read -r tablo n_hedef; do
    toplam=$((toplam + 1))
    local n_once n_sonra alt ust
    n_once="$(grep -F "$tablo|" "$once" | head -1 | cut -d'|' -f2)"
    n_sonra="$(grep -F "$tablo|" "$sonra" | head -1 | cut -d'|' -f2)"
    n_once="${n_once:-0}"; n_sonra="${n_sonra:-0}"
    alt=$(( n_once < n_sonra ? n_once : n_sonra ))
    ust=$(( n_once > n_sonra ? n_once : n_sonra ))
    if [ "$n_hedef" -lt "$alt" ] || [ "$n_hedef" -gt "$ust" ]; then
      gunluk "  UYUMSUZ $db $tablo: kaynak $n_once..$n_sonra, geri yuklenen $n_hedef"
      sorun=$((sorun + 1))
    fi
  done <"$hedef"
  local tablo_kaynak; tablo_kaynak="$(wc -l <"$once" | tr -d ' ')"
  if [ "$toplam" -ne "$tablo_kaynak" ]; then
    gunluk "  UYUMSUZ $db: tablo sayisi kaynak $tablo_kaynak, geri yuklenen $toplam"; sorun=$((sorun + 1))
  fi
  local pk ph; pk="$(kaynak_sql "$db" "$POLITIKA_SQL")"; ph="$(hedef_sql "$db" "$POLITIKA_SQL")"
  if [ "$pk" != "$ph" ]; then gunluk "  UYUMSUZ $db: RLS politika sayisi kaynak $pk, hedef $ph"; sorun=$((sorun + 1)); fi
  if [ "$sorun" -eq 0 ]; then
    gunluk "  OK $db: $toplam tablo, satir sayilari tutarli, $ph RLS politikasi"
  else
    HATA=1
  fi
}

sayimlari_al() { # <son ek> : once/sonra dosyalari
  for db in $DB_LISTE; do kaynak_sql "$db" "$SAYIM_SQL" >"$DIZIN/sayim-$db-$1.txt"; done
}

hedef_konteyneri_baslat() { # <hacim veya bos>
  local args=(-d --name "$AD" -p "$PORT:5432")
  if [ -n "${1:-}" ]; then
    args+=(-v "$1:/var/lib/postgresql/data")
  else
    args+=(-e POSTGRES_PASSWORD=tatbikat)
  fi
  docker run "${args[@]}" "$IMAJ" >/dev/null
}

DB_LISTE=""
for db in $VERITABANLARI; do
  if [ "$(kaynak_sql postgres "select 1 from pg_database where datname = '$db'")" = "1" ]; then DB_LISTE="$DB_LISTE $db"; fi
done
[ -n "$DB_LISTE" ] || { echo "HATA: kaynakta hedef veritabani yok" >&2; exit 1; }
gunluk "Kaynak: $KAYNAK ($IMAJ), veritabanlari:$DB_LISTE; mod: $MOD"

# ---------------------------------------------------------------------------------------------
mantiksal_yedek() {
  docker exec "$KAYNAK" pg_dumpall -U postgres --globals-only >"$DIZIN/globals.sql"
  for db in $DB_LISTE; do
    docker exec "$KAYNAK" pg_dump -U postgres -Fc "$db" >"$DIZIN/$db.dump"
  done
}

mantiksal_geri_yukle() {
  docker exec -i "$AD" psql -U postgres -X -q -f - <"$DIZIN/globals.sql" >/dev/null 2>&1 || true
  for db in $DB_LISTE; do
    local sahip
    sahip="$(kaynak_sql postgres "select pg_get_userbyid(datdba) from pg_database where datname = '$db'")"
    docker exec "$AD" psql -U postgres -X -q -c "create database \"$db\" owner \"$sahip\"" >/dev/null
    docker exec -i "$AD" pg_restore -U postgres -d "$db" --no-owner --exit-on-error <"$DIZIN/$db.dump"
  done
}

mantiksal() {
  gunluk "== MANTIKSAL: pg_dump / pg_restore =="
  sayimlari_al once
  sure "mantiksal yedek (pg_dumpall globals + pg_dump -Fc)" mantiksal_yedek
  sayimlari_al sonra
  gunluk "Yedek boyutu: $(du -sh "$DIZIN" | cut -f1)"

  docker rm -f "$AD" >/dev/null 2>&1 || true
  hedef_konteyneri_baslat ""
  for _ in $(seq 1 60); do
    if hedef_sql postgres 'select 1' >/dev/null 2>&1; then break; fi
    sleep 1
  done
  sure "mantiksal geri yukleme (roller + pg_restore)" mantiksal_geri_yukle
  local rk rh
  rk="$(kaynak_sql postgres "select count(*) from pg_roles where rolname !~ '^pg_'")"
  rh="$(hedef_sql postgres "select count(*) from pg_roles where rolname !~ '^pg_'")"
  if [ "$rk" != "$rh" ]; then gunluk "  UYUMSUZ rol sayisi kaynak $rk, hedef $rh"; HATA=1; else gunluk "  OK roller: $rh"; fi
  for db in $DB_LISTE; do dogrula "$db"; done
  docker rm -f "$AD" >/dev/null
}

# ---------------------------------------------------------------------------------------------
fiziksel_geri_yukle() {
  docker run --rm -v "$VOLUME:/hedef" -v "$DIZIN/fiziksel:/kaynak:ro" --entrypoint bash "$IMAJ" -c \
    'cp -a /kaynak/. /hedef/ && chown -R postgres:postgres /hedef && chmod 700 /hedef'
  docker run -d --name "$AD" -p "$PORT:5432" -v "$VOLUME:/var/lib/postgresql/data" "$IMAJ" >/dev/null
  hedef_hazir_bekle
}

fiziksel() {
  gunluk "== FIZIKSEL: pg_basebackup + kurtarma =="
  sayimlari_al once
  docker exec "$KAYNAK" rm -rf /tmp/kopru-tatbikat
  docker exec "$KAYNAK" mkdir -p /tmp/kopru-tatbikat
  sure "fiziksel yedek (pg_basebackup -X stream)" \
    docker exec "$KAYNAK" pg_basebackup -U postgres -D /tmp/kopru-tatbikat/veri -Fp -X stream -c fast
  sayimlari_al sonra
  mkdir -p "$DIZIN/fiziksel"
  docker cp "$KAYNAK:/tmp/kopru-tatbikat/veri/." "$DIZIN/fiziksel/"
  gunluk "Yedek boyutu: $(du -sh "$DIZIN/fiziksel" | cut -f1)"

  docker volume create "$VOLUME" >/dev/null
  sure "fiziksel geri yukleme (kopyala + sunucuyu ac, yazmaya hazir)" fiziksel_geri_yukle
  for db in $DB_LISTE; do dogrula "$db"; done
  docker rm -f "$AD" >/dev/null
  docker volume rm -f "$VOLUME" >/dev/null
}

case "$MOD" in
  mantiksal) mantiksal ;;
  fiziksel) fiziksel ;;
  hepsi) mantiksal; fiziksel ;;
  *) echo "Kullanim: $0 [mantiksal|fiziksel|hepsi]" >&2; exit 2 ;;
esac

echo
gunluk "Sureler:"
for s in "${SURELER[@]}"; do gunluk "  $s"; done
if [ "$HATA" -eq 0 ]; then
  gunluk "TATBIKAT BASARILI"
else
  gunluk "TATBIKAT BASARISIZ"
  exit 1
fi
