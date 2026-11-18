#!/usr/bin/env bash
# eslemeler akisi (paket B2): ders, hatirlatma, yoklama, odev eslemeleri ve zamanlanmis bildirimler;
# gercek api + bildirim API + iki worker + AYRI NATS.
#
# Akis: kurum + grup + ogretmen + 2 ogrenci (OG1, OG2) -> cihaz + sessiz saat kapali
#  -> 2 ders planla (yarin 10:00 ve 15:00): ders_hatirlatma (ogrenci basina baslangic - 60 dk), ogretmen sabah ozeti
#     (gunun ilk dersi - 30 dk, "N ders"), ders sonu geri bildirimi satiri
#  -> 10:00 dersini YONETICI iptal eder: ogrencilere `ders_iptal`, ogretmene `ders_iptal_ogretmen`, hatirlatma/geri bildirim
#     satirlari iptal, sabah ozeti 1 derse iner
#  -> 15:00 dersi 17:00'ye ertelenir: `ders_ertelendi`, hatirlatma ve sabah satirlari yeni saate kayar
#  -> hatirlatma ayari degisimi (15 dk / 0 = kapali / 60): bekleyen satir yeniden hesaplanir
#  -> ZAMAN ILERLETME: zamani yarina ait satirlarin `gonderim_at`i veritabaninda simdiye cekilir (gercek saatle bekleyemeyiz);
#     is (`zamanlanmis.uret`, 2 sn) bildirimi uretir: kutu + push (log saglayici)
#  -> GECMISTE biten ders: yoklama (OG1 geldi, OG2 gelmedi) -> `yoklama_gelmedi`; ders tamamlaninca yalniz OG1'e
#     "Ders nasildi?" geri bildirimi
#  -> odev (teslim tarihi +3 gun): `odev_yayinlandi`, teslim yaklasiyor satirlari; OG3 teslim eder (satiri iptal, ogretmene
#     bildirim), ogretmen inceler (`odev_incelendi`); OG2'nin teslim yaklasiyor bildirimi uretilir, OG3'unki uretilmez.
#
# Ogrenci basina gunluk 5 push siniri vardir; senaryo her ogrenci icin en cok 5 push uretecek sekilde kurulmustur.
# bash 3.2 (macOS) uyumlu. Gereken: curl, jq, docker, pnpm, python3 (zoneinfo), uuidgen.
#
# On kosul (repo kokunden; AYRI NATS ve DB; 47xx portlari):
#   docker run -d --name b2-nats -p 4732:4222 nats:2 -js
#   P='docker exec kopru-postgres-1 psql -U postgres'
#   $P -c 'create database kopru_api_b2 owner api' ; $P -c 'create database kopru_bildirim_b2'
#   export NATS_URL=nats://localhost:4732
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_api_b2 \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_api_b2 \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_api_b2 \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
#          API_PORT=4781 API_PUBLIC_URL=http://localhost:4781 API_MEDYA_URL=http://127.0.0.1:4789
#   pnpm --filter @kopru/api db:migrate
#   (pnpm --filter @kopru/api start > /tmp/api4781.log 2>&1 &) ; (pnpm --filter @kopru/api start:worker > /tmp/api-worker-b2.log 2>&1 &)
#   export BILDIRIM_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_bildirim_b2 \
#          BILDIRIM_APP_PASSWORD=bildirim_app BILDIRIM_SISTEM_PASSWORD=bildirim_sistem
#   pnpm --filter @kopru/bildirim db:migrate
#   export BILDIRIM_DATABASE_URL=postgres://bildirim_app:bildirim_app@localhost:5433/kopru_bildirim_b2 \
#          BILDIRIM_DATABASE_SISTEM_URL=postgres://bildirim_sistem:bildirim_sistem@localhost:5433/kopru_bildirim_b2 \
#          BILDIRIM_PORT=4782 BILDIRIM_AUTH_ENABLED=true JWKS_URL=http://localhost:4781/.well-known/jwks.json \
#          JWT_ISSUER=http://localhost:4781 BILDIRIM_PUSH_SAGLAYICI=log \
#          BILDIRIM_ZAMANLANMIS_ARALIK_MS=2000 BILDIRIM_GONDERIM_ARALIK_MS=1000
#   (pnpm --filter @kopru/bildirim start > /tmp/bildirim4782.log 2>&1 &)
#   (pnpm --filter @kopru/bildirim start:worker > /tmp/bildirim-worker-b2.log 2>&1 &)
# Kullanim (repo kokunden, ayni ortam degiskenleriyle; WORKER_LOG = bildirim worker log dosyasi):
#   API=http://localhost:4781 BIL=http://localhost:4782 API_DB=kopru_api_b2 BIL_DB=kopru_bildirim_b2 \
#   WORKER_LOG=/tmp/bildirim-worker-b2.log services/bildirim/scripts/eslemeler-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4781}"
BIL="${BIL:-http://localhost:4782}"
API_DB="${API_DB:-kopru_api_b2}"
BIL_DB="${BIL_DB:-kopru_bildirim_b2}"
WORKER_LOG="${WORKER_LOG:-/tmp/bildirim-worker-b2.log}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
TZ_K="Europe/Istanbul"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
asql() { docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d "$API_DB" -v ON_ERROR_STOP=1 -c "$1"; }
bsql() { docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d "$BIL_DB" -v ON_ERROR_STOP=1 -c "$1"; }
bekle() { # $1 aciklama, $2 sql (bildirim DB), $3 beklenen deger
  local i v
  for i in $(seq 1 90); do v=$(bsql "$2"); if [ "$v" = "$3" ]; then echo "ok: $1 -> $v"; return 0; fi; sleep 0.5; done
  echo "BASARISIZ: $1 -> '$v' (beklenen $3); sql: $2"; exit 1
}
yerel() { # $1 ofset (python timedelta ifadesi), $2 bicim -> yerel zaman metni (Istanbul)
  python3 -c "import datetime,zoneinfo;z=zoneinfo.ZoneInfo('$TZ_K');print((datetime.datetime.now(z)+$1).strftime('$2'))"
}
yerel_at() { # $1 gun ofseti, $2 saat:dk -> ISO UTC (kuruma gore yerel anin UTC karsiligi)
  python3 -c "import datetime,zoneinfo;z=zoneinfo.ZoneInfo('$TZ_K');d=(datetime.datetime.now(z)+datetime.timedelta(days=$1)).date();h,m=map(int,'$2'.split(':'));print(datetime.datetime(d.year,d.month,d.day,h,m,tzinfo=z).astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))"
}

kayit() { j -X POST "$API/auth/eposta/kayit" -d "$(jq -nc --arg e "$1" --arg p "$PAROLA" --arg a "$2" '{eposta:$e,parola:$p,gorunen_ad:$a}')" | jq -r '.oturum_belirteci'; }
token() { j -X POST "$API/auth/token" -H "authorization: Bearer $1" -d "$(jq -nc --arg k "${2:-}" 'if $k == "" then {} else {kurum_id:$k} end')" | jq -r '.access_token'; }
riza() { local id; for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null; done; }
davetle() { # $1 sahip token, $2 rol, $3 eposta, $4 ad -> "uyelik_id oturum"
  local belirtec oturum ilk
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')" | jq -r '.belirtec')
  oturum=$(kayit "$3" "$4"); ilk=$(token "$oturum"); riza "$ilk"
  j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg b "$belirtec" '{belirtec:$b}')" | jq -r '.uyelik_id' | tr -d '\n'
  printf ' %s' "$oturum"
}
cihaz() { # $1 token, $2 ad -> cihaz kaydi + sessiz saat kapali
  j -X PUT "$BIL/v1/bildirim/cihazlar" -H "authorization: Bearer $1" -d "$(jq -nc --arg c "cihaz-$2-$RUN" --arg b "ExponentPushToken[$2-$RUN]" '{platform:"ios",push_belirteci:$b,cihaz_kimligi:$c,uygulama_surumu:"1.0.0",dil:"tr"}')" >/dev/null
  j -X PUT "$BIL/v1/bildirim/kurumlar/$KURUM/ayarlar" -H "authorization: Bearer $1" -d '{"sessiz_gunler":[]}' >/dev/null
}
ayar_dk() { j -X PUT "$BIL/v1/bildirim/kurumlar/$KURUM/ayarlar" -H "authorization: Bearer $1" -d "$(jq -nc --argjson d "$2" '{ders_hatirlatma_dk:$d}')" | jq -r .ders_hatirlatma_dk; }
ders_planla() { # $1 tarih (YYYY-MM-DD), $2 saat, $3 sure -> ders kimligi
  j -X POST "$D/dersler" -H "authorization: Bearer $H1" -d "$(jq -nc --arg g "$GRUP" --arg t "$1" --arg s "$2" --argjson u "$3" '{grup_id:$g,tarih:$t,baslangic_saati:$s,sure_dk:$u}')" | jq -r '.ders.id'
}
z_satir() { # $1 sablon, $2 alici uyelik -> "yerel gonderim | iptal | uretildi"
  bsql "select to_char(gonderim_at at time zone '$TZ_K', 'YYYY-MM-DD HH24:MI') || ' | ' || coalesce(iptal_nedeni, '-') || ' | ' || (uretildi_at is not null)::text from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and sablon_kodu = '$1' and alici_id = '$2'"
}
kutu() { # $1 token -> baslik listesi
  j "$BIL/v1/bildirim/kurumlar/$KURUM/kutu?limit=50" -H "authorization: Bearer $1" | jq -c '[.ogeler[] | .sablon_kodu]'
}
b_say() { bsql "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and alici_id = '$1' and sablon_kodu = '$2'"; }
gonderim_say() { bsql "select count(*) from bildirim.gonderimler g join bildirim.bildirimler b on b.id = g.bildirim_id where g.kurum_id = '$KURUM' and b.alici_id = '$1' and b.sablon_kodu = '$2' and g.durum = '$3'"; }

adim "0) Servisler"
sart "bildirim /ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$BIL/ready")" 200
sart "api /ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$API/ready")" 200

adim "1) Kurum, grup, ogretmen (matematik), ogrenci OG1 + OG2 (hesap olaylari bildirim kopyalarina)"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Eslemeler Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"; O="$API/v1/ogrenme/kurumlar/$KURUM"; D="$API/v1/ders/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"11-A"}' | jq -r '.id')
H1_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca"); H1_UYELIK=${H1_BILGI%% *}; H1_OTURUM=${H1_BILGI##* }
sart "matematik atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$H1_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
OG1_BILGI=$(davetle "$S" ogrenci "ogr1$RUN@example.com" "Ali Birinci"); OG1_UYELIK=${OG1_BILGI%% *}; OG1_OTURUM=${OG1_BILGI##* }
OG2_BILGI=$(davetle "$S" ogrenci "ogr2$RUN@example.com" "Veli Ikinci"); OG2_UYELIK=${OG2_BILGI%% *}; OG2_OTURUM=${OG2_BILGI##* }
sart "ogrenciler gruba (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OG1_UYELIK" --arg b "$OG2_UYELIK" '{ogrenci_idleri:[$a,$b]}')")" 201
H1=$(token "$H1_OTURUM" "$KURUM"); OG1=$(token "$OG1_OTURUM" "$KURUM"); OG2=$(token "$OG2_OTURUM" "$KURUM")
echo "kurum: $KURUM  ogretmen: $H1_UYELIK  OG1: $OG1_UYELIK  OG2: $OG2_UYELIK"
bekle "uyelik kopyalari (sahip + ogretmen + 2 ogrenci)" "select count(*) from bildirim.uyelik_kopyalari where kurum_id = '$KURUM' and durum = 'aktif'" 4
cihaz "$OG1" og1; cihaz "$OG2" og2; cihaz "$H1" hoca
sart "cihazlar kayitli (3)" "$(bsql "select count(*) from bildirim.cihazlar where aktif and push_belirteci like '%-$RUN]'")" 3

adim "2) Iki ders planla (yarin 10:00 ve 15:00): hatirlatma + sabah ozeti + geri bildirim satirlari"
YARIN=$(yerel "datetime.timedelta(days=1)" '%Y-%m-%d')
DERS_B=$(ders_planla "$YARIN" "10:00" 60); DERS_A=$(ders_planla "$YARIN" "15:00" 60)
echo "yarin: $YARIN  ders B (10:00): $DERS_B  ders A (15:00): $DERS_A"
bekle "ders planlari kopyalandi" "select count(*) from bildirim.ders_planlari where kurum_id = '$KURUM'" 2
bekle "hatirlatma satirlari (2 ders x 2 ogrenci)" "select count(*) from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ders_hatirlatma'" 4
bekle "geri bildirim satirlari (2 x 2)" "select count(*) from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ders_geri_bildirim'" 4
sart "OG1 ders A hatirlatma = 14:00 (15:00 - 60 dk)" "$(bsql "select to_char(gonderim_at at time zone '$TZ_K', 'HH24:MI') from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and kaynak_id = '$DERS_A' and alici_id = '$OG1_UYELIK' and sablon_kodu = 'ders_hatirlatma'")" "14:00"
bekle "ogretmen sabah ozeti satiri (tek)" "select count(*) from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ogretmen_sabah'" 1
bekle "sabah ozeti = ilk ders (10:00) - 30 dk, 2 ders" "select to_char(gonderim_at at time zone '$TZ_K', 'HH24:MI') || ' ' || (veri->>'ders_sayisi') from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ogretmen_sabah'" "09:30 2"

adim "3) 10:00 dersini YONETICI iptal eder: ders_iptal (ogrenciler) + ders_iptal_ogretmen; satirlar iptal; sabah ozeti 1 ders"
SURUM_B=$(j "$D/dersler/$DERS_B" -H "authorization: Bearer $S" | jq -r '.surum')
sart "iptal (200)" "$(durum -X POST "$D/dersler/$DERS_B/iptal" -H "authorization: Bearer $S" -d "$(jq -nc --argjson s "$SURUM_B" '{surum:$s,iptal_kaynagi:"yonetici",iptal_nedeni:"Hoca hasta"}')")" 200
bekle "ders_iptal ogrencilere (2)" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ders_iptal'" 2
bekle "ders_iptal_ogretmen (1)" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ders_iptal_ogretmen' and alici_id = '$H1_UYELIK'" 1
bekle "iptal edilen dersin hatirlatma/geri bildirim satirlari iptal (4)" "select count(*) from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and kaynak_id = '$DERS_B' and iptal_nedeni = 'ders'" 4
bekle "sabah ozeti 1 ders, 14:30" "select to_char(gonderim_at at time zone '$TZ_K', 'HH24:MI') || ' ' || (veri->>'ders_sayisi') from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ogretmen_sabah' and iptal_at is null" "14:30 1"
sart "iptal push metninde ogrenci adi/neden yok" "$(bsql "select count(*) from bildirim.gonderimler where kurum_id = '$KURUM' and (govde ilike '%Hoca hasta%' or govde ilike '%Ali%' or baslik ilike '%Ali%')")" 0
echo "iptal bildirimi (kutu): $(bsql "select baslik || ' / ' || govde || ' / ' || derin_baglanti from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ders_iptal' limit 1")"

adim "4) 15:00 dersi 17:00'ye ertelenir: ders_ertelendi; hatirlatma 16:00, sabah ozeti 16:30"
SURUM_A=$(j "$D/dersler/$DERS_A" -H "authorization: Bearer $S" | jq -r '.surum')
sart "erteleme (200)" "$(durum -X POST "$D/dersler/$DERS_A/tasi" -H "authorization: Bearer $H1" -d "$(jq -nc --argjson s "$SURUM_A" '{surum:$s,yeni_saat:"17:00"}')")" 200
bekle "ders_ertelendi ogrencilere (2)" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ders_ertelendi'" 2
bekle "OG1 hatirlatma 16:00" "select to_char(gonderim_at at time zone '$TZ_K', 'HH24:MI') from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and kaynak_id = '$DERS_A' and alici_id = '$OG1_UYELIK' and sablon_kodu = 'ders_hatirlatma'" "16:00"
bekle "sabah ozeti 16:30" "select to_char(gonderim_at at time zone '$TZ_K', 'HH24:MI') from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ogretmen_sabah' and iptal_at is null" "16:30"
echo "erteleme bildirimi (kutu): $(bsql "select baslik || ' / ' || govde from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ders_ertelendi' limit 1")"
sart "ogretmene erteleme bildirimi yok" "$(b_say "$H1_UYELIK" ders_ertelendi)" 0

adim "5) Hatirlatma ayari degisimi: OG2 15 dk, OG1 0 (kapali) sonra 60"
sart "OG2 ayar 15" "$(ayar_dk "$OG2" 15)" 15
sart "OG2 hatirlatma 16:45" "$(bsql "select to_char(gonderim_at at time zone '$TZ_K', 'HH24:MI') from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and kaynak_id = '$DERS_A' and alici_id = '$OG2_UYELIK' and sablon_kodu = 'ders_hatirlatma'")" "16:45"
sart "OG1 ayar 0 (kapali)" "$(ayar_dk "$OG1" 0)" 0
sart "OG1 hatirlatma iptal (ayar)" "$(z_satir ders_hatirlatma "$OG1_UYELIK" | grep -c "| ayar |" | tr -d ' ')" 1
sart "OG1 ayar 60 (yeniden acik)" "$(ayar_dk "$OG1" 60)" 60
sart "OG1 ders A hatirlatmasi yeniden etkin (16:00)" "$(bsql "select to_char(gonderim_at at time zone '$TZ_K', 'HH24:MI') || ' ' || coalesce(iptal_nedeni, '-') from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and kaynak_id = '$DERS_A' and alici_id = '$OG1_UYELIK' and sablon_kodu = 'ders_hatirlatma'")" "16:00 -"

adim "6) ZAMAN ILERLETME: yarinin hatirlatma ve sabah satirlari 'simdi'ye cekilir; is bildirimi uretir"
bsql "update bildirim.zamanlanmis_bildirimler set gonderim_at = now() - interval '1 minute' where kurum_id = '$KURUM' and ((sablon_kodu = 'ders_hatirlatma' and kaynak_id = '$DERS_A' and alici_id = '$OG1_UYELIK') or sablon_kodu = 'ogretmen_sabah')" >/dev/null
bekle "OG1 ders hatirlatmasi kutuda" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and alici_id = '$OG1_UYELIK' and sablon_kodu = 'ders_hatirlatma'" 1
bekle "ogretmen sabah bildirimi kutuda" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and alici_id = '$H1_UYELIK' and sablon_kodu = 'ogretmen_sabah'" 1
bekle "hatirlatma push gonderildi" "select count(*) from bildirim.gonderimler g join bildirim.bildirimler b on b.id = g.bildirim_id where g.kurum_id = '$KURUM' and b.sablon_kodu = 'ders_hatirlatma' and g.durum = 'gonderildi'" 1
bekle "sabah push gonderildi" "select count(*) from bildirim.gonderimler g join bildirim.bildirimler b on b.id = g.bildirim_id where g.kurum_id = '$KURUM' and b.sablon_kodu = 'ogretmen_sabah' and g.durum = 'gonderildi'" 1
echo "hatirlatma (kutu): $(bsql "select baslik || ' / ' || govde || ' / gecerlilik_bitis ' || to_char(gecerlilik_bitis_at at time zone '$TZ_K', 'HH24:MI') from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ders_hatirlatma'")"
echo "sabah ozeti (kutu): $(bsql "select baslik || ' / ' || govde from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ogretmen_sabah'")"
sart "iptal edilen dersin hatirlatmasi uretilmedi (OG2 ve ders B icin kutuda yok)" "$(bsql "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ders_hatirlatma' and alici_id <> '$OG1_UYELIK'")" 0

adim "7) Gecmiste biten ders: yoklama (OG1 geldi, OG2 gelmedi) -> yoklama_gelmedi; ders tamamlaninca yalniz OG1'e geri bildirim"
GEC_TARIH=$(yerel "datetime.timedelta(hours=-3)" '%Y-%m-%d'); GEC_SAAT=$(yerel "datetime.timedelta(hours=-3)" '%H:00')
DERS_C=$(ders_planla "$GEC_TARIH" "$GEC_SAAT" 60)
echo "gecmis ders C: $GEC_TARIH $GEC_SAAT (60 dk): $DERS_C"
[ -n "$DERS_C" ] && [ "$DERS_C" != "null" ] || { echo "BASARISIZ: gecmis ders olusmadi"; exit 1; }
bekle "ders C geri bildirim satirlari (2)" "select count(*) from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and kaynak_id = '$DERS_C' and sablon_kodu = 'ders_geri_bildirim'" 2
sleep 4
sart "yoklama alinmadan geri bildirim uretilmedi (ders planli)" "$(bsql "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ders_geri_bildirim'")" 0
NOW_ISO=$(python3 -c "import datetime;print(datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))")
YOK=$(jq -nc --arg a "$OG1_UYELIK" --arg b "$OG2_UYELIK" --arg t "$NOW_ISO" '{yoklamalar:[{ogrenci_id:$a,durum:"geldi",isaretlenme_at:$t},{ogrenci_id:$b,durum:"gelmedi",isaretlenme_at:$t}]}')
sart "yoklama (200)" "$(durum -X PUT "$D/dersler/$DERS_C/yoklamalar" -H "authorization: Bearer $H1" -H "idempotency-key: $(uuidgen | tr 'A-Z' 'a-z')" -d "$YOK")" 200
bekle "OG2'ye yoklama_gelmedi bildirimi" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and alici_id = '$OG2_UYELIK' and sablon_kodu = 'yoklama_gelmedi'" 1
sart "OG1'e (geldi) yoklama bildirimi yok" "$(bsql "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and alici_id = '$OG1_UYELIK' and sablon_kodu like 'yoklama_%'")" 0
bekle "ders C tamamlandi (kopya)" "select durum from bildirim.ders_planlari where ders_id = '$DERS_C'" tamamlandi
bekle "OG1'e 'Ders nasildi?' geri bildirimi" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and alici_id = '$OG1_UYELIK' and sablon_kodu = 'ders_geri_bildirim'" 1
sart "OG2'ye (gelmedi) geri bildirim yok; satir iptal (yoklama)" "$(z_satir ders_geri_bildirim "$OG2_UYELIK" | grep -c "yoklama")" 1
echo "geri bildirim (kutu): $(bsql "select baslik || ' / ' || govde || ' / ' || derin_baglanti from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'ders_geri_bildirim'")"

adim "8) Odev: yayin (OG1, OG2 + OG3), teslim yaklasiyor satirlari; OG3 teslim eder, ogretmen inceler"
OG3_BILGI=$(davetle "$S" ogrenci "ogr3$RUN@example.com" "Can Ucuncu"); OG3_UYELIK=${OG3_BILGI%% *}; OG3_OTURUM=${OG3_BILGI##* }
sart "OG3 gruba (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OG3_UYELIK" '{ogrenci_idleri:[$a]}')")" 201
OG3=$(token "$OG3_OTURUM" "$KURUM"); cihaz "$OG3" og3
bekle "OG3 uyelik kopyasi" "select count(*) from bildirim.uyelik_kopyalari where uyelik_id = '$OG3_UYELIK' and durum = 'aktif'" 1
SON_TESLIM=$(python3 -c "import datetime;print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=3)).strftime('%Y-%m-%dT%H:%M:%SZ'))")
ODEV=$(j -X POST "$O/odevler" -H "authorization: Bearer $H1" -d "$(jq -nc --arg g "$GRUP" --arg s "$SON_TESLIM" '{baslik:"Turev alistirmasi",brans_kodu:"matematik",hedef_turu:"grup",hedef_id:$g,son_teslim_at:$s,tur:"soru",hedef_soru_sayisi:10}')" | jq -r .id)
sart "odev yayinla (200)" "$(durum -X POST "$O/odevler/$ODEV/yayinla" -H "authorization: Bearer $H1" -d '{}')" 200
bekle "odev_yayinlandi (3 ogrenci)" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'odev_yayinlandi'" 3
bekle "teslim yaklasiyor satirlari (3)" "select count(*) from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and kaynak_id = '$ODEV' and sablon_kodu = 'odev_teslim_yaklasiyor' and iptal_at is null" 3
sart "satir = son teslim - 24 saat" "$(bsql "select count(*) from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and kaynak_id = '$ODEV' and gonderim_at = '$SON_TESLIM'::timestamptz - interval '24 hours'")" 3
echo "odev_yayinlandi push metni: $(bsql "select baslik || ' / ' || govde || ' / ' || derin_baglanti from bildirim.gonderimler where kurum_id = '$KURUM' and sablon_kodu = 'odev_yayinlandi' limit 1")"
sart "push metninde odev basligi yok" "$(bsql "select count(*) from bildirim.gonderimler where kurum_id = '$KURUM' and (govde ilike '%alistirma%' or baslik ilike '%alistirma%')")" 0

OG3_ODEV=$(j "$O/odevlerim" -H "authorization: Bearer $OG3" | jq -r --arg o "$ODEV" '.odevler[] | select(.odev_id == $o) | .id')
sart "OG3 teslim (200)" "$(durum -X POST "$O/ogrenci-odevleri/$OG3_ODEV/teslim" -H "authorization: Bearer $OG3" -d '{"yapilan_soru_sayisi":10}')" 200
bekle "ogretmene odev_teslim_edildi" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and alici_id = '$H1_UYELIK' and sablon_kodu = 'odev_teslim_edildi'" 1
bekle "OG3'un teslim yaklasiyor satiri iptal (teslim)" "select count(*) from bildirim.zamanlanmis_bildirimler where kurum_id = '$KURUM' and kaynak_id = '$ODEV' and alici_id = '$OG3_UYELIK' and iptal_nedeni = 'teslim'" 1
sart "teslim bildiriminde ogrenci adi yok" "$(bsql "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'odev_teslim_edildi' and (govde ilike '%Can%' or baslik ilike '%Can%')")" 0
sart "inceleme (200)" "$(durum -X POST "$O/ogrenci-odevleri/$OG3_ODEV/inceleme" -H "authorization: Bearer $H1" -d '{"sonuc":"tamam","not":"Eline saglik"}')" 200
bekle "OG3'e odev_incelendi" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and alici_id = '$OG3_UYELIK' and sablon_kodu = 'odev_incelendi'" 1
sart "ogretmen notu bildirimde yok" "$(bsql "select count(*) from bildirim.bildirimler b where kurum_id = '$KURUM' and (govde ilike '%Eline saglik%')")" 0
echo "odev_incelendi (kutu): $(bsql "select baslik || ' / ' || govde from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'odev_incelendi'")"

adim "9) ZAMAN ILERLETME: odev teslim yaklasiyor -> yalniz teslim etmeyen OG2'ye uretilir (OG3'e uretilmez)"
bsql "update bildirim.zamanlanmis_bildirimler set gonderim_at = now() - interval '1 minute' where kurum_id = '$KURUM' and kaynak_id = '$ODEV' and alici_id in ('$OG2_UYELIK', '$OG3_UYELIK')" >/dev/null
bekle "OG2'ye teslim yaklasiyor bildirimi" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and alici_id = '$OG2_UYELIK' and sablon_kodu = 'odev_teslim_yaklasiyor'" 1
sleep 3
sart "OG3'e (teslim etti) uretilmedi" "$(b_say "$OG3_UYELIK" odev_teslim_yaklasiyor)" 0

adim "10) Ozet: kutular, gonderimler ve log saglayici"
echo "OG1 kutusu: $(kutu "$OG1")"
echo "OG2 kutusu: $(kutu "$OG2")"
echo "OG3 kutusu: $(kutu "$OG3")"
echo "ogretmen kutusu: $(kutu "$H1")"
echo "gonderim durumlari (sablon:durum:adet): $(bsql "select string_agg(s, ', ' order by s) from (select sablon_kodu || ':' || durum || coalesce('(' || atlama_nedeni || ')', '') || ':' || count(*) as s from bildirim.gonderimler where kurum_id = '$KURUM' group by sablon_kodu, durum, atlama_nedeni) t")"
sart "sahibin kutusunda 4 davet_kabul_edildi (hesap.davet.kabul_edildi; sahibin cihazi yok: push atlandi cihaz_yok)" "$(b_say "$(bsql "select uyelik_id from bildirim.uyelik_kopyalari where kurum_id = '$KURUM' and rol = 'sahip'")" davet_kabul_edildi)" 4
sart "basarisiz/atlanan gonderim yok (davet bildirimleri haric)" "$(bsql "select count(*) from bildirim.gonderimler where kurum_id = '$KURUM' and durum in ('basarisiz', 'atlandi') and sablon_kodu <> 'davet_kabul_edildi'")" 0
echo "log saglayici satirlari (son 8):"
grep 'push gönderimi (log sağlayıcı)' "$WORKER_LOG" | tail -8 | jq -c '{title,body,data}' | sed 's/^/  /'
sart "hicbir push metninde kisisel veri yok (Ali/Veli/Can/Ayse)" "$(bsql "select count(*) from bildirim.gonderimler where kurum_id = '$KURUM' and (govde ~* '(Ali|Veli|Can|Ayse) ' or baslik ~* '(Ali|Veli|Can|Ayse) ')")" 0

echo
echo "TAMAM: eslemeler akisi gecti (kurum $KURUM)"
