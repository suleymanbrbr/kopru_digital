#!/usr/bin/env bash
# motivasyon XP akisi: uctan uca curl senaryosu (gercek api + motivasyon API + iki worker + NATS).
# Kurum + ogretmen + ogrenci kurar; yoklama (geldi) -> XP; izinliye cevir -> ters kayit; geri geldi -> yeniden kazanim;
# odev (zamaninda, gec, onay) -> 15 / 7 / 10; plan gorevleri -> plan tavani (40); deneme -> net artisi; soru + "anladim";
# `GET .../benim` ciktisi; seviye atlama ve rozet olaylari motivasyon outbox'inda (SQL); modul kapatinca 403 modul_kapali.
# Hesap kopyalari bos kalir (api'nin olaylari-yeniden-yayimla komutu ayri pakettir): varsayilanlar gecerli
# (Europe/Istanbul, modul acik, ogrenci etkin); modul kapatma kismi api'den gercek `modul_ayari.degisti` olayi ureterek
# `motivasyon.kopya` tuketicisini de dener. Tekrar calistirilabilir (her calistirmada yeni kullanici/kurum).
# bash 3.2 (macOS) uyumlu. Gereken: curl, jq, docker.
#
# On kosul (repo kokunden; portlar bu betigin varsayilanlari, Postgres 5433; AYRI NATS: tuketici adlari sabittir):
#   docker run -d --name mot1-nats -p 4225:4222 nats:2 -js
#   P='docker exec kopru-postgres-1 psql -U postgres'
#   $P -c 'create database kopru_paket_mot1 owner api' ; $P -c 'create database kopru_motivasyon_mot1'
#   export NATS_URL=nats://localhost:4225
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_paket_mot1 \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_paket_mot1 \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_paket_mot1 \
#          API_PORT=4274 API_PUBLIC_URL=http://localhost:4274
#   pnpm --filter @kopru/api db:migrate
#   (pnpm --filter @kopru/api dev > /tmp/api4274.log 2>&1 &) ; (pnpm --filter @kopru/api dev:worker > /tmp/api-worker-mot1.log 2>&1 &)
#   # motivasyon (4273) + worker: kendi veritabani, JWKS = api
#   export MOTIVASYON_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_motivasyon_mot1 \
#          MOTIVASYON_APP_PASSWORD=motivasyon_app MOTIVASYON_SISTEM_PASSWORD=motivasyon_sistem
#   pnpm --filter @kopru/motivasyon db:migrate
#   export MOTIVASYON_DATABASE_URL=postgres://motivasyon_app:motivasyon_app@localhost:5433/kopru_motivasyon_mot1 \
#          MOTIVASYON_DATABASE_SISTEM_URL=postgres://motivasyon_sistem:motivasyon_sistem@localhost:5433/kopru_motivasyon_mot1 \
#          MOTIVASYON_PORT=4273 MOTIVASYON_AUTH_ENABLED=true JWKS_URL=http://localhost:4274/.well-known/jwks.json \
#          JWT_ISSUER=http://localhost:4274
#   (pnpm --filter @kopru/motivasyon dev > /tmp/mot4273.log 2>&1 &) ; (pnpm --filter @kopru/motivasyon dev:worker > /tmp/mot-worker.log 2>&1 &)
# Kullanim (repo kokunden): services/motivasyon/scripts/xp-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4274}"
MOT="${MOT:-http://localhost:4273}"
MOT_DB="${MOT_DB:-kopru_motivasyon_mot1}"
API_DB="${API_DB:-kopru_paket_mot1}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
simdi() { date -u +%Y-%m-%dT%H:%M:%S.000Z; }
dun() { date -u -v-1d +%F 2>/dev/null || date -u -d 'yesterday' +%F; }
yeniAnahtar() { uuidgen | tr 'A-Z' 'a-z'; }
msql() { docker exec kopru-postgres-1 psql -U postgres -d "$MOT_DB" -tAc "$1"; }
asql() { docker exec kopru-postgres-1 psql -U postgres -d "$API_DB" -tAc "$1"; }

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
davetle() { # $1 sahip token, $2 rol, $3 eposta, $4 ad -> "uyelik_id oturum" ; $KURUM kullanilir
  local davet belirtec oturum ilk kabul uyelik
  davet=$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$davet" | jq -r '.belirtec')
  oturum=$(kayit "$3" "$4"); ilk=$(token "$oturum"); riza "$ilk"
  kabul=$(jq -nc --arg b "$belirtec" '{belirtec:$b}')
  uyelik=$(j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$kabul" | jq -r '.uyelik_id')
  printf '%s %s' "$uyelik" "$oturum"
}
benim() { j "$MOT/v1/motivasyon/kurumlar/$KURUM/benim" -H "authorization: Bearer $O"; }
xp_bekle() { # $1 beklenen toplam XP (olay tuketilene kadar bekler)
  local i x
  for i in $(seq 1 60); do
    x=$(benim | jq -r '.toplam_xp // empty')
    if [ "$x" = "$1" ]; then return 0; fi
    sleep 0.5
  done
  echo "BASARISIZ: toplam XP $1 olmadi (son: ${x:-yok})"; benim | jq -c .; exit 1
}
satir() { # $1 sql sayisi icin sorgu, $2 beklenen
  local i v
  for i in $(seq 1 60); do v=$(msql "$1"); if [ "$v" = "$2" ]; then return 0; fi; sleep 0.5; done
  echo "BASARISIZ: '$1' -> $v (beklenen $2)"; exit 1
}

adim "0) Kurum, grup, ogretmen (matematik atamasi) ve ogrenci (api girisi)"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d "$(jq -nc '{ad:"Motivasyon Deneme Kurumu",tur:"kurum"}')" | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"; D="$API/v1/ders/kurumlar/$KURUM"; F="$API/v1/finans/kurumlar/$KURUM"; OG="$API/v1/ogrenme/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d "$(jq -nc '{tur:"grup",ad:"8-A Matematik"}')" | jq -r '.id')
HOCA_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca"); HOCA_UYELIK=${HOCA_BILGI%% *}; HOCA_OTURUM=${HOCA_BILGI##* }
sart "ogretmen atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
OGR_BILGI=$(davetle "$S" ogrenci "ogr$RUN@example.com" "Ali Ogrenci"); OGR=${OGR_BILGI%% *}; OGR_OTURUM=${OGR_BILGI##* }
sart "ogrenci gruba (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OGR" '{ogrenci_idleri:[$a]}')")" 201
HOCA=$(token "$HOCA_OTURUM" "$KURUM"); O=$(token "$OGR_OTURUM" "$KURUM")
PAKET=$(j -X POST "$F/paketler" -H "authorization: Bearer $S" -d "$(jq -nc '{ad:"8 Ders",kredi_adedi:8,fiyat_kurus:600000}')" | jq -r '.id')
sart "paket satisi (201)" "$(durum -X POST "$F/paket-satislari" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$OGR" --arg p "$PAKET" '{ogrenci_id:$o,paket_id:$p}')")" 201
echo "kurum: $KURUM  ogrenci(uyelik): $OGR"
sart "motivasyon /ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$MOT/ready")" 200
sart "kimliksiz /benim (401)" "$(durum "$MOT/v1/motivasyon/kurumlar/$KURUM/benim")" 401
sart "baslangic: 0 XP, seviye 1" "$(benim | jq -c '[.toplam_xp,.seviye]')" '[0,1]'

adim "1) Yoklama: geldi -> 20 XP (seviye 2)"
DERS=$(j -X POST "$D/dersler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg g "$GRUP" --arg t "$(dun)" '{grup_id:$g,tarih:$t,baslangic_saati:"10:00",sure_dk:60}')" | jq -r '.ders.id')
yoklama() { # $1 durum
  j -X PUT "$D/dersler/$DERS/yoklamalar" -H "authorization: Bearer $HOCA" -H "idempotency-key: $(yeniAnahtar)" \
    -d "$(jq -nc --arg o "$OGR" --arg d "$1" --arg t "$(simdi)" '{yoklamalar:[{ogrenci_id:$o,durum:$d,isaretlenme_at:$t}]}')" | jq -r '.sonuclar[0].sonuc'
}
sart "yoklama geldi" "$(yoklama geldi)" yeni
xp_bekle 20
sart "XP 20, seviye 2" "$(benim | jq -c '[.toplam_xp,.seviye]')" '[20,2]'

adim "2) Yoklamayi izinliye cevir -> ters kayit (XP 0, seviye 2 kalir); tekrar geldi -> yeniden kazanim"
sleep 1; sart "izinli" "$(yoklama izinli)" guncellendi
xp_bekle 0
sart "ters kayit sonrasi seviye dusmez" "$(benim | jq -c '[.toplam_xp,.seviye]')" '[0,2]'
sleep 1; sart "yeniden geldi" "$(yoklama geldi)" guncellendi
xp_bekle 20
echo "defter: $(msql "select string_agg(kural_kodu || ' ' || xp || case when ters_cevrilen_id is not null then ' (ters)' else '' end, ', ' order by created_at) from motivasyon.xp_hareketleri where ogrenci_id = '$OGR'")"
sart "defter: kazanim, ters, kazanim" "$(msql "select count(*) from motivasyon.xp_hareketleri where ogrenci_id = '$OGR' and kural_kodu = 'yoklama_geldi'")" 3

adim "3) Odev: zamaninda teslim 15, onay 10; gec teslim 7 (yarisi asagi)"
SON=$(python3 -c 'import datetime as d; print((d.datetime.now(d.timezone.utc)+d.timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ"))')
odev() { # $1 baslik -> odev id (yayinlanmis)
  local id
  id=$(j -X POST "$OG/odevler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg b "$1" --arg g "$GRUP" --arg s "$SON" '{baslik:$b,brans_kodu:"matematik",tur:"soru",hedef_soru_sayisi:10,hedef_turu:"grup",hedef_id:$g,son_teslim_at:$s}')" | jq -r '.id')
  j -X POST "$OG/odevler/$id/yayinla" -H "authorization: Bearer $HOCA" -d '{}' >/dev/null
  printf '%s' "$id"
}
satir_id() { j "$OG/odevlerim" -H "authorization: Bearer $O" | jq -r --arg o "$1" '.odevler[] | select(.odev_id == $o) | .id'; }
ODEV1=$(odev "Turev 1"); ODEV2=$(odev "Turev 2")
SATIR1=$(satir_id "$ODEV1"); SATIR2=$(satir_id "$ODEV2")
sart "teslim (zamaninda)" "$(j -X POST "$OG/ogrenci-odevleri/$SATIR1/teslim" -H "authorization: Bearer $O" -d '{"yapilan_soru_sayisi":10,"dogru_sayisi":8}' | jq -r '.gec_teslim')" false
xp_bekle 35
sart "inceleme tamam" "$(j -X POST "$OG/ogrenci-odevleri/$SATIR1/inceleme" -H "authorization: Bearer $HOCA" -d '{"sonuc":"tamam"}' | jq -r '.durum')" incelendi
xp_bekle 45
asql "update ogrenme.ogrenci_odevleri set son_teslim_at = now() - interval '1 hour' where id = '$SATIR2'"
sart "gec teslim" "$(j -X POST "$OG/ogrenci-odevleri/$SATIR2/teslim" -H "authorization: Bearer $O" -d '{"yapilan_soru_sayisi":10,"dogru_sayisi":5}' | jq -r '.gec_teslim')" true
xp_bekle 52
echo "odev XP: $(msql "select string_agg(kural_kodu || ' ' || xp, ', ' order by created_at) from motivasyon.xp_hareketleri where ogrenci_id = '$OGR' and kural_kodu like 'odev%'")"
sart "yeniden teslim XP vermez (tekrar_istendi akisi yok: ayni satir 409)" "$(durum -X POST "$OG/ogrenci-odevleri/$SATIR1/teslim" -H "authorization: Bearer $O" -d '{"yapilan_soru_sayisi":10}')" 409
sart "odev_teslim XP satirlari: 15 ve 7" "$(msql "select string_agg(xp::text, ',' order by xp desc) from motivasyon.xp_hareketleri where ogrenci_id = '$OGR' and kural_kodu = 'odev_teslim'")" "15,7"

adim "4) Plan gorevleri: 9 gorev tamamlanir, plan tavani 40 (8 x 5)"
HAFTA=2030-01-07
PLAN=$(j -X POST "$OG/planlar" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$OGR" --arg h "$HAFTA" '{ogrenci_id:$o,hafta_baslangic:$h}')" | jq -r '.plan.id')
GOREVLER=""
for i in 1 2 3 4 5 6 7 8 9; do
  GUN=$(printf '2030-01-%02d' $((6 + (i % 7) + 1)))
  B=matematik; if [ $((i % 2)) -eq 0 ]; then B=fizik; fi
  G=$(j -X POST "$OG/planlar/$PLAN/gorevler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg g "$GUN" --arg b "$B" --argjson m $((10 + i)) '{gun:$g,brans_kodu:$b,hedef_turu:"soru",hedef_miktar:$m}')" | jq -r '.id')
  GOREVLER="$GOREVLER $G:$((10 + i))"
done
sart "plan yayin (200)" "$(durum -X POST "$OG/planlar/$PLAN/yayinla" -H "authorization: Bearer $HOCA" -d '{}')" 200
for gm in $GOREVLER; do
  j -X PUT "$OG/gorevler/${gm%%:*}/gerceklesen" -H "authorization: Bearer $O" -d "$(jq -nc --argjson m "${gm##*:}" '{gerceklesen_miktar:$m}')" >/dev/null
done
xp_bekle 92
satir "select count(*) from motivasyon.xp_hareketleri where ogrenci_id = '$OGR' and kural_kodu = 'plan_gorevi_tamam'" 8
sart "plan tavani 40/40" "$(benim | jq -c '.bugun.tavanlar[] | select(.kod=="plan") | [.kullanilan,.ust_sinir]')" '[40,40]'
echo "9 gorev tamamlandi, plan XP satiri: $(msql "select count(*) from motivasyon.xp_hareketleri where ogrenci_id = '$OGR' and kural_kodu = 'plan_gorevi_tamam'") (9. gorev tavan nedeniyle XP almadi)"

adim "5) Deneme: ilk TYT 10 XP; ikinci TYT net artisi (+6 net -> 30 XP) + 10 XP; net_bronz rozeti"
d1=$(j -X POST "$OG/denemeler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$OGR" '{kural_kodu:"tyt",ogrenci_id:$o,ad:"TYT-1",sinav_tarihi:"2026-03-01",bolumler:[{bolum_kodu:"turkce",dogru:25,yanlis:2},{bolum_kodu:"matematik",dogru:15,yanlis:2}]}')")
sart "deneme 1 net" "$(echo "$d1" | jq '.toplam_net')" 39
xp_bekle 102
d2=$(j -X POST "$OG/denemeler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg o "$OGR" '{kural_kodu:"tyt",ogrenci_id:$o,ad:"TYT-2",sinav_tarihi:"2026-04-01",bolumler:[{bolum_kodu:"turkce",dogru:30,yanlis:0},{bolum_kodu:"matematik",dogru:15,yanlis:0}]}')")
sart "deneme 2 net" "$(echo "$d2" | jq '.toplam_net')" 45
xp_bekle 142
sart "net artisi XP" "$(msql "select xp from motivasyon.xp_hareketleri where ogrenci_id = '$OGR' and kural_kodu = 'deneme_net_artisi'")" 30

adim "6) Soru sor (3 XP) ve \"anladim\" (5 XP)"
# Soru fotografi icin medya servisi yerine api'nin dosya kopyasi dogrudan yazilir (medya bu betigin konusu degil).
FOTO=$(yeniAnahtar)
OGR_K=$(asql "select kullanici_id from hesap.uyelikler where id = '$OGR'")
asql "insert into ortak.medya_dosya_kopyalari (id, kurum_id, sahip_kullanici_id, tur, durum, mime_tipi, boyut_bayt, kaynak_olay_id) values ('$FOTO', '$KURUM', '$OGR_K', 'soru_fotografi', 'hazir', 'image/jpeg', 350000, '$(yeniAnahtar)')" >/dev/null
SORU=$(j -X POST "$OG/sorular" -H "authorization: Bearer $O" -d "$(jq -nc --arg f "$FOTO" '{brans_kodu:"matematik",baslik:"Limit sorusu",metin:"Bu limiti cozemedim",fotograflar:[$f]}')")
echo "$SORU" | jq -c '{id, durum, error}'
SORU_ID=$(echo "$SORU" | jq -r '.id')
xp_bekle 145
sart "ogretmen cevaplar" "$(j -X POST "$OG/sorular/$SORU_ID/cevap" -H "authorization: Bearer $HOCA" -d '{"metin":"Once limitin tanimina bak."}' | jq -r '.durum')" cevaplandi
sart "anladim" "$(j -X POST "$OG/sorular/$SORU_ID/anladim" -H "authorization: Bearer $O" -d '{}' | jq -r '.durum')" cozuldu
xp_bekle 150

adim "7) GET /benim"
benim | jq '{toplam_xp, seviye, seviye_baslangic_xp, sonraki_seviye_xp, sonraki_seviyeye_kalan, bu_hafta_xp, bugun, beceriler, rozet_kazanilan: [.rozetler.kazanilan[] | {kod, kategori, kademe}], kilitli_sayisi: (.rozetler.kilitli | length), ilk_kilitli: .rozetler.kilitli[0], karakter, seri, son_hareketler: [.son_hareketler[] | {kural_kodu, xp, kismi}]}'
sart "toplam XP ve seviye" "$(benim | jq -c '[.toplam_xp,.seviye]')" '[150,3]'
sart "sonraki seviyeye kalan (170 - 150)" "$(benim | jq '.sonraki_seviyeye_kalan')" 20
sart "sayisal beceri" "$(benim | jq '.beceriler[] | select(.kod=="sayisal") | .puan')" "$(msql "select puan from motivasyon.beceri_puanlari where ogrenci_id = '$OGR' and beceri_kodu = 'sayisal'")"
sart "net_bronz rozeti kazanildi" "$(benim | jq -r '[.rozetler.kazanilan[].kod] | index("net_bronz") != null')" true
sart "ogretmen ozeti (atandigi gruptaki ogrenci)" "$(j "$MOT/v1/motivasyon/kurumlar/$KURUM/ogrenciler/$OGR/ozet" -H "authorization: Bearer $HOCA" | jq '.toplam_xp')" 150
sart "ogretmen /benim kullanamaz (403)" "$(durum "$MOT/v1/motivasyon/kurumlar/$KURUM/benim" -H "authorization: Bearer $HOCA")" 403
sart "yonetici ozeti (200)" "$(durum "$MOT/v1/motivasyon/kurumlar/$KURUM/ogrenciler/$OGR/ozet" -H "authorization: Bearer $S")" 200

adim "8) Motivasyon outbox'i (SQL): seviye atlama ve rozet olaylari"
msql "select subject, payload->'data' from ortak.outbox where kurum_id = '$KURUM' order by created_at, id"
sart "seviye.atladi olaylari (1->2, 2->3)" "$(msql "select string_agg((payload->'data'->>'eski_seviye') || '>' || (payload->'data'->>'yeni_seviye'), ',' order by created_at, id) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.motivasyon.seviye.atladi.v1'")" "1>2,2>3"
sart "ters kayit seviye olayi uretmedi (yeniden kazanimda 2. kez 1>2 yok)" "$(msql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.motivasyon.seviye.atladi.v1'")" 2
sart "rozet.kazanildi: net_bronz" "$(msql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.motivasyon.rozet.kazanildi.v1' and payload->'data'->>'rozet_kodu' = 'net_bronz'")" 1
sart "olaylarda kisisel veri yok (ad/telefon/eposta)" "$(msql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and payload::text ~* '(Ali Ogrenci|example.com|telefon)'")" 0

adim "9) Modul kapatma: api modul_ayari olayi -> kopya -> 403 modul_kapali"
sart "oyunlastirma kapat (200)" "$(durum -X PUT "$H/modul-ayarlari" -H "authorization: Bearer $S" -d '{"modul_kodu":"oyunlastirma","kapsam":"kurum","acik":false}')" 200
satir "select count(*) from motivasyon.modul_ayari_kopyalari where kurum_id = '$KURUM' and acik = false" 1
sart "benim (403)" "$(durum "$MOT/v1/motivasyon/kurumlar/$KURUM/benim" -H "authorization: Bearer $O")" 403
sart "hata kodu" "$(benim | jq -r '.error.code')" modul_kapali
echo "tamam."
