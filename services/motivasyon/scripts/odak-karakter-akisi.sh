#!/usr/bin/env bash
# motivasyon odak + karakter + haftanin yildizi akisi: uctan uca curl senaryosu (gercek api + motivasyon API +
# iki worker + NATS). Kurum + ogretmen + 4 ogrenci kurar; ogrenci karakter secer (uygunsuz ad 422) -> 25 dk
# odak oturumu baslatir/bitirir (zaman gecirmek icin istemci baslangic/bitis zamani kullanilir) -> XP, tavan ve
# `benim`'de karakter; ayni bitisi tekrar gonderir -> XP degismez; ikinci acik oturum 409; ogretmen haftanin
# yildizi verir -> 50 XP + gizli rozet; ayni ogrenciye 2. yildiz ve ogretmenin 4. yildizi 409; rozetle acilan
# kozmetigi kusanir/cikarir (sahip olunmayan 422). Tekrar calistirilabilir (her calistirmada yeni kullanici/kurum).
# bash 3.2 (macOS) uyumlu. Gereken: curl, jq, docker, uuidgen.
#
# On kosul (repo kokunden; portlar bu betigin varsayilanlari, Postgres 5433; AYRI NATS: tuketici adlari sabittir):
#   docker run -d --name m3-nats -p 4227:4222 nats:2 -js
#   P='docker exec kopru-postgres-1 psql -U postgres'
#   $P -c 'create database kopru_api_m3 owner api' ; $P -c 'create database kopru_motivasyon_m3'
#   export NATS_URL=nats://localhost:4227
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_api_m3 \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_api_m3 \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_api_m3 \
#          API_PORT=4277 API_PUBLIC_URL=http://localhost:4277
#   pnpm --filter @kopru/api db:migrate
#   (pnpm --filter @kopru/api dev > /tmp/api4277.log 2>&1 &) ; (pnpm --filter @kopru/api dev:worker > /tmp/api-worker-m3.log 2>&1 &)
#   export MOTIVASYON_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_motivasyon_m3 \
#          MOTIVASYON_APP_PASSWORD=motivasyon_app MOTIVASYON_SISTEM_PASSWORD=motivasyon_sistem
#   pnpm --filter @kopru/motivasyon db:migrate
#   export MOTIVASYON_DATABASE_URL=postgres://motivasyon_app:motivasyon_app@localhost:5433/kopru_motivasyon_m3 \
#          MOTIVASYON_DATABASE_SISTEM_URL=postgres://motivasyon_sistem:motivasyon_sistem@localhost:5433/kopru_motivasyon_m3 \
#          MOTIVASYON_PORT=4278 MOTIVASYON_AUTH_ENABLED=true JWKS_URL=http://localhost:4277/.well-known/jwks.json \
#          JWT_ISSUER=http://localhost:4277
#   (pnpm --filter @kopru/motivasyon dev > /tmp/mot4278.log 2>&1 &) ; (pnpm --filter @kopru/motivasyon dev:worker > /tmp/mot-worker-m3.log 2>&1 &)
# Kullanim (repo kokunden): services/motivasyon/scripts/odak-karakter-akisi.sh
# Temizlik: surecleri `lsof -ti tcp:<port> -sTCP:LISTEN` ile kapat; veritabanlarini ve `m3-nats`'i sil.
set -euo pipefail

API="${API:-http://localhost:4277}"
MOT="${MOT:-http://localhost:4278}"
MOT_DB="${MOT_DB:-kopru_motivasyon_m3}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
yeniAnahtar() { uuidgen | tr 'A-Z' 'a-z'; }
msql() { docker exec kopru-postgres-1 psql -U postgres -d "$MOT_DB" -tAc "$1"; }
# $1 saniye farki (negatif: gecmis) -> ISO UTC
zaman() { date -u -v"${1}S" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -d "${1} seconds" +%Y-%m-%dT%H:%M:%S.000Z; }

kayit() { # $1 eposta $2 ad -> oturum belirteci
  local govde
  govde=$(jq -nc --arg e "$1" --arg p "$PAROLA" --arg a "$2" '{eposta:$e,parola:$p,gorunen_ad:$a}')
  local t i # kayit ucu dakikada sinirli (429): bekleyip yeniden dener
  for i in $(seq 1 12); do
    t=$(j -X POST "$API/auth/eposta/kayit" -d "$govde" | jq -r '.oturum_belirteci // empty')
    if [ -n "$t" ]; then printf '%s' "$t"; return 0; fi
    sleep 6
  done
  echo "BASARISIZ: kayit olmadi ($1)" >&2; exit 1
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
satir() { # $1 sql sayisi icin sorgu, $2 beklenen (tuketici gecikmesi icin bekler)
  local i v
  for i in $(seq 1 60); do v=$(msql "$1"); if [ "$v" = "$2" ]; then return 0; fi; sleep 0.5; done
  echo "BASARISIZ: '$1' -> $v (beklenen $2)"; exit 1
}
benim() { j "$MOT/v1/motivasyon/kurumlar/$KURUM/benim" -H "authorization: Bearer $O"; }
mot() { # $1 yontem $2 yol $3 belirtec $4 (ops.) govde
  if [ -n "${4:-}" ]; then j -X "$1" "$MOT/v1/motivasyon/kurumlar/$KURUM$2" -H "authorization: Bearer $3" -d "$4"
  else curl -sS -X "$1" "$MOT/v1/motivasyon/kurumlar/$KURUM$2" -H "authorization: Bearer $3"; fi # govdesiz: content-type yok (bos JSON govde 400 olur)
}
motd() { # durum kodu
  if [ -n "${4:-}" ]; then durum -X "$1" "$MOT/v1/motivasyon/kurumlar/$KURUM$2" -H "authorization: Bearer $3" -d "$4"
  else curl -sS -o /dev/null -w '%{http_code}' -X "$1" "$MOT/v1/motivasyon/kurumlar/$KURUM$2" -H "authorization: Bearer $3"; fi
}

adim "0) Kurum, grup, ogretmen (matematik atamasi) ve 4 ogrenci"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d "$(jq -nc '{ad:"Odak Deneme Kurumu",tur:"kurum"}')" | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d "$(jq -nc '{tur:"grup",ad:"8-A Matematik"}')" | jq -r '.id')
HOCA_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca"); HOCA_UYELIK=${HOCA_BILGI%% *}; HOCA_OTURUM=${HOCA_BILGI##* }
sart "ogretmen atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
OGRS=""; OTURUMLAR=""
for i in 1 2 3 4; do
  B=$(davetle "$S" ogrenci "ogr$i-$RUN@example.com" "Ogrenci $i"); U=${B%% *}
  sart "ogrenci $i gruba (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$U" '{ogrenci_idleri:[$a]}')")" 201
  OGRS="$OGRS $U"; OTURUMLAR="$OTURUMLAR ${B##* }"
done
set -- $OGRS; OGR1=$1; OGR2=$2; OGR3=$3; OGR4=$4
set -- $OTURUMLAR; O1=$1; O2=$2; O3=$3; O4=$4
HOCA=$(token "$HOCA_OTURUM" "$KURUM"); O=$(token "$O1" "$KURUM"); OT2=$(token "$O2" "$KURUM"); OT3=$(token "$O3" "$KURUM"); OT4=$(token "$O4" "$KURUM")
echo "kurum: $KURUM  ogrenci1(uyelik): $OGR1"
sart "motivasyon /ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$MOT/ready")" 200
sart "kimliksiz karakter (401)" "$(durum "$MOT/v1/motivasyon/kurumlar/$KURUM/karakter")" 401
# Atama ve grup uyeligi kopyalari olay tuketicisiyle gelir
satir "select count(*) from motivasyon.atama_kopyalari where kurum_id = '$KURUM' and ogretmen_id = '$HOCA_UYELIK'" 1
satir "select count(*) from motivasyon.grup_uyesi_kopyalari where kurum_id = '$KURUM'" 4

adim "1) Karakter: turler, uygunsuz ad (422), secim (201), tekrar secim (409)"
sart "3 tur, 5 asama" "$(mot GET /karakter/turler "$O" | jq -c '[(.turler | length), (.turler[0].asamalar | length)]')" '[3,5]'
sart "baslangicta karakter yok" "$(mot GET /karakter "$O" | jq -c '.karakter')" null
sart "uygunsuz ad (422)" "$(motd POST /karakter "$O" '{"tur_kodu":"kivilcim","ad":"Siktir"}')" 422
sart "uygunsuz ad kodu" "$(mot POST /karakter "$O" '{"tur_kodu":"kivilcim","ad":"o r o s p u"}' | jq -r '.error.code')" karakter_adi_uygunsuz
sart "karakter secimi (201)" "$(motd POST /karakter "$O" '{"tur_kodu":"kivilcim","ad":"Pırıl"}')" 201
sart "tekrar secim (409)" "$(motd POST /karakter "$O" '{"tur_kodu":"dinamo","ad":"Baska"}')" 409
sart "benim.karakter" "$(benim | jq -c '.karakter | [.tur_kodu,.ad,.asama,.sonraki_asama_seviyesi]')" '["kivilcim","Pırıl",1,5]'

adim "2) Odak: 25 dk oturum (istemci zamanlariyla), idempotent baslat/bitir, tek acik oturum"
IST=$(yeniAnahtar)
BASLA=$(zaman -1560) # 26 dk once basladi
govde=$(jq -nc --arg i "$IST" --arg b "$BASLA" '{istemci_id:$i,mod:"25_5",brans_kodu:"matematik",cihaz:"curl",baslangic_at:$b}')
sart "baslat (201)" "$(motd POST /odak-oturumlari "$O" "$govde")" 201
sart "ayni istemci_id tekrar (200, ayni oturum)" "$(motd POST /odak-oturumlari "$O" "$govde")" 200
sart "ikinci acik oturum (409)" "$(motd POST /odak-oturumlari "$O" "$(jq -nc --arg i "$(yeniAnahtar)" '{istemci_id:$i,mod:"50_10"}')")" 409
sart "409 kodu ve acik oturum bilgisi" "$(mot POST /odak-oturumlari "$O" "$(jq -nc --arg i "$(yeniAnahtar)" '{istemci_id:$i,mod:"50_10"}')" | jq -c '[.error.code, (.error.details.oturum.istemci_id == "'"$IST"'")]')" '["acik_oturum_var",true]'
sart "acik oturum" "$(mot GET /odak-oturumlari/acik "$O" | jq -r '.oturum.istemci_id')" "$IST"
BITIS=$(zaman -60) # 1 dk once bitirdi: 25 dk
sart "bitir: 1500 sn" "$(mot POST "/odak-oturumlari/$IST/bitir" "$O" "$(jq -nc --arg b "$BITIS" '{durum:"tamam",bitis_at:$b}')" | jq -c '[.oturum.durum, .oturum.gerceklesen_sn, .kazanim.xp]')" '["tamam",1500,25]'
sart "XP 25, odak tavani 25/120, sayisal beceri 25" "$(benim | jq -c '[.toplam_xp, (.bugun.tavanlar[] | select(.kod=="odak") | [.kullanilan,.ust_sinir]), (.beceriler[] | select(.kod=="sayisal") | .puan)]')" '[25,[25,120],25]'
sart "ayni bitisi tekrar: durum ayni, XP ayni" "$(mot POST "/odak-oturumlari/$IST/bitir" "$O" "$(jq -nc --arg b "$BITIS" '{durum:"tamam",bitis_at:$b}')" | jq -c '[.oturum.durum, .oturum.gerceklesen_sn, .kazanim.xp]')" '["tamam",1500,25]'
sart "toplam XP hala 25" "$(benim | jq '.toplam_xp')" 25
sart "odak XP satiri tek (kaynak_olay_id = odak:{id} UUIDv5)" "$(msql "select count(*) from motivasyon.xp_hareketleri where ogrenci_id = '$OGR1' and kural_kodu = 'odak_oturumu'")" 1
sart "odak_sn aktivite 1500, toplam_odak_dk sayaci 25" "$(msql "select (select odak_sn from motivasyon.ogrenci_gunluk_aktivite where ogrenci_id = '$OGR1') || ',' || (select deger::int from motivasyon.ogrenci_sayaclari where ogrenci_id = '$OGR1' and sayac_kodu = 'toplam_odak_dk')")" "1500,25"
sart "son oturumlar" "$(mot GET "/odak-oturumlari?limit=5" "$O" | jq -c '[.oturumlar[] | [.durum, .gerceklesen_sn]]')" '[["tamam",1500]]'
sart "ogretmen odak baslatamaz (403)" "$(motd POST /odak-oturumlari "$HOCA" "$govde")" 403

adim "3) Haftanin yildizi: 50 XP + gizli rozet; ogrenci haftada bir; ogretmen haftada en cok 3"
yildiz() { mot POST /haftanin-yildizlari "$HOCA" "$(jq -nc --arg o "$1" --arg g "$GRUP" '{ogrenci_id:$o,grup_id:$g,gerekce:"Bu hafta cok calisti"}')"; }
Y1=$(yildiz "$OGR1")
echo "$Y1" | jq -c '{xp, yeni_rozetler, hafta: .yildiz.hafta_baslangic}'
sart "yildiz XP ve rozet" "$(echo "$Y1" | jq -c '[.xp, .yeni_rozetler]')" '[50,["yildiz_bronz"]]'
sart "ogrenci: toplam 75 XP, yildiz_bronz kazanildi" "$(benim | jq -c '[.toplam_xp, ([.rozetler.kazanilan[].kod] | index("yildiz_bronz") != null)]')" '[75,true]'
sart "ogrenci aldigi yildiz sayisi" "$(mot GET "/ogrenciler/$OGR1/haftanin-yildizlari" "$O" | jq '.yildizlar | length')" 1
sart "ayni ogrenciye 2. yildiz (409)" "$(yildiz "$OGR1" | jq -r '.error.code')" haftanin_yildizi_verilmis
sart "2. ogrenci (201)" "$(yildiz "$OGR2" | jq '.xp')" 50
sart "3. ogrenci (201)" "$(yildiz "$OGR3" | jq '.xp')" 50
sart "4. yildiz: haftalik limit (409)" "$(yildiz "$OGR4" | jq -r '.error.code')" haftalik_limit_asildi
sart "verdiklerim: 3 verildi, kalan 0" "$(mot GET /haftanin-yildizlari/verdiklerim "$HOCA" | jq -c '[.limit,.verilen,.kalan]')" '[3,3,0]'
sart "ogrenci yildiz veremez (403)" "$(motd POST /haftanin-yildizlari "$O" "$(jq -nc --arg o "$OGR4" --arg g "$GRUP" '{ogrenci_id:$o,grup_id:$g}')")" 403
sart "grup disi ogrenci (404)" "$(motd POST /haftanin-yildizlari "$HOCA" "$(jq -nc --arg o "$(yeniAnahtar)" --arg g "$GRUP" '{ogrenci_id:$o,grup_id:$g}')")" 404
sart "yildiz XP satiri tavandan muaf (3 satir, xp=50)" "$(msql "select count(*) || ',' || min(xp) from motivasyon.xp_hareketleri where kurum_id = '$KURUM' and kural_kodu = 'haftanin_yildizi'")" "3,50"

adim "4) Kozmetik: rozetle acilanlari kusan / cikar; sahip olunmayan 422"
mot GET /karakter/kozmetikler "$O" | jq -c '[.kozmetikler[] | {kod, slot, sahip, acilma_kosulu}] | map(select(.sahip))'
KOZ=$(mot GET /karakter/kozmetikler "$O" | jq -r '[.kozmetikler[] | select(.sahip)][0].kod')
SLOT=$(mot GET /karakter/kozmetikler "$O" | jq -r '[.kozmetikler[] | select(.sahip)][0].slot')
KILITLI=$(mot GET /karakter/kozmetikler "$O" | jq -r '[.kozmetikler[] | select(.sahip | not)][0] | .kod + " " + .slot')
echo "acik: $KOZ ($SLOT); kilitli: $KILITLI"
sart "yildiz rozetiyle bir kozmetik acildi" "$([ -n "$KOZ" ] && [ "$KOZ" != "null" ] && echo evet || echo hayir)" evet
sart "sahip olunmayani kusan (422)" "$(motd PUT "/karakter/kusanimlar/${KILITLI##* }" "$O" "$(jq -nc --arg k "${KILITLI%% *}" '{kozmetik_kodu:$k}')")" 422
sart "kusan (200)" "$(motd PUT "/karakter/kusanimlar/$SLOT" "$O" "$(jq -nc --arg k "$KOZ" '{kozmetik_kodu:$k}')")" 200
sart "benim.karakter.kusanilanlar" "$(benim | jq -c '.karakter.kusanilanlar')" "[{\"slot\":\"$SLOT\",\"kozmetik_kodu\":\"$KOZ\"}]"
sart "cikar (200) ve bos" "$(mot DELETE "/karakter/kusanimlar/$SLOT" "$O" | jq -c '.karakter.kusanilanlar')" '[]'

adim "5) Tur degistirme tek sefer, ad degistirme"
sart "tur degistir (200, hak 0, asama ayni)" "$(mot PATCH /karakter/tur "$O" '{"tur_kodu":"sedir"}' | jq -c '[.karakter.tur_kodu, .karakter.tur_degistirme_hakki, .karakter.asama]')" '["sedir",0,1]'
sart "ikinci tur degistirme (409)" "$(mot PATCH /karakter/tur "$O" '{"tur_kodu":"dinamo"}' | jq -r '.error.code')" tur_degistirme_hakki_yok
sart "ad degistir" "$(mot PATCH /karakter/ad "$O" '{"ad":"Meşe"}' | jq -r '.karakter.ad')" "Meşe"

adim "6) Olaylarda kisisel veri yok"
sart "motivasyon outbox'inda ad/eposta yok" "$(msql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and payload::text ~* '(Ogrenci [0-9]|example.com|Pırıl|Meşe)'")" 0
sart "rozet.kazanildi: yildiz_bronz (3 ogrenci)" "$(msql "select count(*) from ortak.outbox where kurum_id = '$KURUM' and subject = 'evt.motivasyon.rozet.kazanildi.v1' and payload->'data'->>'rozet_kodu' = 'yildiz_bronz'")" 3

adim "7) Modul kapatma: 403 modul_kapali"
sart "oyunlastirma kapat (200)" "$(durum -X PUT "$H/modul-ayarlari" -H "authorization: Bearer $S" -d '{"modul_kodu":"oyunlastirma","kapsam":"kurum","acik":false}')" 200
satir "select count(*) from motivasyon.modul_ayari_kopyalari where kurum_id = '$KURUM' and acik = false" 1
sart "odak baslat (403 modul_kapali)" "$(mot POST /odak-oturumlari "$O" "$(jq -nc --arg i "$(yeniAnahtar)" '{istemci_id:$i,mod:"25_5"}')" | jq -r '.error.code')" modul_kapali
sart "karakter (403 modul_kapali)" "$(mot GET /karakter "$O" | jq -r '.error.code')" modul_kapali
echo "tamam."
