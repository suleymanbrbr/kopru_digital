#!/usr/bin/env bash
# bildirim akisi: uctan uca curl senaryosu (gercek api + bildirim API + iki worker + AYRI NATS).
#
# Akis: kurum + grup + ogretmen (matematik atamasi) + ogrenci (api, hesap olaylari bildirim kopyalarina gelir)
#  -> ogrenci cihazini kaydeder -> ogrenci soru sorar, ogretmen cevaplar (api `ogrenme.soru_mesaji.eklendi.v1`)
#  -> kutuda "Sorun cevaplandi", `log` saglayicida push satiri, gonderim `gonderildi` -> okundu isaretlenir
#  -> sessiz saat (simdiyi kapsayan aralik): push `ertelendi`, kutu aninda -> tercih kapali: push `atlandi (tercih)`
#  -> `motivasyon.seri.risk.v1` olaylari (NATS'a dogrudan): gunluk 5 push siniri, asan `atlandi (kota)`
#  -> kutu listesi, okunmamis sayisi, tumunu oku, baska kullanici/kurum erisemez.
#
# ZAMAN: olaylari api gercek zamanla uretir. Sessiz saat adimi, SIMDIYI kapsayan bir aralik ayarlayarak
# calisir (betik hangi saatte kosulursa kosulsun ayni sonucu verir). Soru kotasi gunde 3 oldugundan betik gunde
# bir kez, her calistirmada YENI kurum/kullanici ile kosar (her kosuda yeni kurum: kota kurum+ogrenci bazlidir).
# bash 3.2 (macOS) uyumlu. Gereken: curl, jq, docker, pnpm, python3, uuidgen.
#
# On kosul (repo kokunden; portlar bu betigin varsayilanlari; Postgres 5433; AYRI NATS: tuketici adlari sabittir):
#   docker run -d --name b1-nats -p 4231:4222 nats:2 -js
#   P='docker exec kopru-postgres-1 psql -U postgres'
#   $P -c 'create database kopru_api_b1 owner api' ; $P -c 'create database kopru_bildirim_b1'
#   export NATS_URL=nats://localhost:4231
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_api_b1 \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_api_b1 \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_api_b1 \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
#          API_PORT=4181 API_PUBLIC_URL=http://localhost:4181 API_MEDYA_URL=http://127.0.0.1:4189
#   pnpm --filter @kopru/api db:migrate
#   (pnpm --filter @kopru/api dev > /tmp/api4181.log 2>&1 &) ; (pnpm --filter @kopru/api dev:worker > /tmp/api-worker-b1.log 2>&1 &)
#   export BILDIRIM_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_bildirim_b1 \
#          BILDIRIM_APP_PASSWORD=bildirim_app BILDIRIM_SISTEM_PASSWORD=bildirim_sistem
#   pnpm --filter @kopru/bildirim db:migrate
#   export BILDIRIM_DATABASE_URL=postgres://bildirim_app:bildirim_app@localhost:5433/kopru_bildirim_b1 \
#          BILDIRIM_DATABASE_SISTEM_URL=postgres://bildirim_sistem:bildirim_sistem@localhost:5433/kopru_bildirim_b1 \
#          BILDIRIM_PORT=4182 BILDIRIM_AUTH_ENABLED=true JWKS_URL=http://localhost:4181/.well-known/jwks.json \
#          JWT_ISSUER=http://localhost:4181 BILDIRIM_PUSH_SAGLAYICI=log
#   (pnpm --filter @kopru/bildirim dev > /tmp/bildirim4182.log 2>&1 &)
#   (pnpm --filter @kopru/bildirim dev:worker > /tmp/bildirim-worker-b1.log 2>&1 &)
# Sahte medya sunucusu bu betikte YOK: soru fotografi icin `medya.dosya.hazir.v1` olayi api outbox'ina yazilir.
# Kullanim (repo kokunden, ayni ortam degiskenleriyle): services/bildirim/scripts/bildirim-akisi.sh
set -euo pipefail

API="${API:-http://localhost:4181}"
BIL="${BIL:-http://localhost:4182}"
API_DB="${API_DB:-kopru_api_b1}"
BIL_DB="${BIL_DB:-kopru_bildirim_b1}"
WORKER_LOG="${WORKER_LOG:-/tmp/bildirim-worker-b1.log}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
BIL_DIZIN="$(cd "$(dirname "$0")/.." && pwd)"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister, $# geldi ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2 (beklenen $3)"; }
sil() { curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$1" -H "authorization: Bearer $2"; } # govdesiz DELETE
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
asql() { docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d "$API_DB" -v ON_ERROR_STOP=1 -c "$1"; }
bsql() { docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d "$BIL_DB" -v ON_ERROR_STOP=1 -c "$1"; }
bekle() { # $1 aciklama, $2 sql (bildirim DB), $3 beklenen deger
  local i v
  for i in $(seq 1 90); do v=$(bsql "$2"); if [ "$v" = "$3" ]; then echo "ok: $1 -> $v"; return 0; fi; sleep 0.5; done
  echo "BASARISIZ: $1 -> '$v' (beklenen $3); sql: $2"; exit 1
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
medya_hazir() { # $1 sahip kullanici -> dosya_id (api'ye `medya.dosya.hazir.v1` outbox olayi)
  local id olay
  id=$(uuidgen | tr 'A-Z' 'a-z')
  olay=$(jq -nc --arg id "$(python3 -c 'import uuid,time;print(uuid.UUID(int=(int(time.time()*1000)<<80)|(7<<76)|(2<<62)|(uuid.uuid4().int&((1<<62)-1))))')" --arg k "$KURUM" --arg d "$id" --arg u "$1" \
    '{id:$id,type:"medya.dosya.hazir",version:1,occurredAt:(now|todate),kurumId:$k,actor:{tur:"servis",id:"medya"},correlationId:"bildirim-akisi",data:{dosya_id:$d,sahip_kullanici_id:$u,sahip_uyelik_id:$u,tur:"soru_fotografi",mime_tipi:"image/jpeg",boyut_bayt:350000,genislik:800,yukseklik:600,sure_sn:null,kucuk_resim_var:true}}')
  asql "insert into ortak.outbox (id, kurum_id, subject, payload) values ('$(echo "$olay" | jq -r .id)', '$KURUM', 'evt.medya.dosya.hazir.v1', '$olay'::jsonb)" >/dev/null
  local i; for i in $(seq 1 40); do [ "$(asql "select count(*) from ortak.medya_dosya_kopyalari where id = '$id'")" = "1" ] && { printf '%s' "$id"; return 0; }; sleep 0.5; done
  echo "BASARISIZ: medya kopyasi olusmadi ($id)" >&2; exit 1
}
sor_cevapla() { # $1 baslik -> soru kimligi (ogrenci sorar, ogretmen cevaplar)
  local f soru
  f=$(medya_hazir "$OG_K")
  soru=$(j -X POST "$O/sorular" -H "authorization: Bearer $OG" -d "$(jq -nc --arg f "$f" --arg b "$1" '{brans_kodu:"matematik",baslik:$b,metin:"Burada takildim",fotograflar:[$f]}')" | jq -r .id)
  j -X POST "$O/sorular/$soru/cevap" -H "authorization: Bearer $H1" -d '{"metin":"Once turev al, sonra sifira esitle"}' >/dev/null
  printf '%s' "$soru"
}
kutu() { j "$BIL/v1/bildirim/kurumlar/$KURUM/kutu$1" -H "authorization: Bearer $OG"; }
sayac() { j "$BIL/v1/bildirim/kurumlar/$KURUM/kutu/okunmamis-sayisi" -H "authorization: Bearer $OG" | jq -r .okunmamis; }
gonderimler() { bsql "select durum || coalesce(' (' || atlama_nedeni || ')', '') from bildirim.gonderimler where kurum_id = '$KURUM' order by created_at, id" | tr '\n' ',' ; }

adim "0) Servisler"
sart "bildirim /ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$BIL/ready")" 200
sart "api /ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$API/ready")" 200

adim "1) Kurum, grup, ogretmen (matematik atamasi), ogrenci (api) -> hesap olaylari bildirim kopyalarina"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Bildirim Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"; O="$API/v1/ogrenme/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"11-A"}' | jq -r '.id')
H1_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca"); H1_UYELIK=${H1_BILGI%% *}; H1_OTURUM=${H1_BILGI##* }
sart "matematik atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$H1_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
OG_BILGI=$(davetle "$S" ogrenci "ogr$RUN@example.com" "Ali Ogrenci"); OG_UYELIK=${OG_BILGI%% *}; OG_OTURUM=${OG_BILGI##* }
sart "ogrenci gruba (201)" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OG_UYELIK" '{ogrenci_idleri:[$a]}')")" 201
H1=$(token "$H1_OTURUM" "$KURUM"); OG=$(token "$OG_OTURUM" "$KURUM")
OG_K=$(asql "select kullanici_id from hesap.uyelikler where id = '$OG_UYELIK'")
echo "kurum: $KURUM  ogrenci(uyelik): $OG_UYELIK  ogrenci(kullanici): $OG_K"
bekle "kurum kopyasi" "select count(*) from bildirim.kurum_kopyalari where kurum_id = '$KURUM'" 1
bekle "ogrenci uyelik kopyasi" "select count(*) from bildirim.uyelik_kopyalari where uyelik_id = '$OG_UYELIK' and rol = 'ogrenci' and durum = 'aktif'" 1
sart "kopyada iletisim bilgisi sutunu yok" "$(bsql "select count(*) from information_schema.columns where table_schema = 'bildirim' and table_name = 'uyelik_kopyalari' and column_name in ('telefon','eposta','gorunen_ad')")" 0

adim "2) Cihaz kaydi (ogrenci) ve varsayilan ayarlar"
CIHAZ="cihaz-$RUN"; BELIRTEC="ExponentPushToken[akis-$RUN]"
CIHAZ_GOVDE=$(jq -nc --arg c "$CIHAZ" --arg b "$BELIRTEC" '{platform:"ios",push_belirteci:$b,cihaz_kimligi:$c,uygulama_surumu:"1.0.0",dil:"tr"}')
sart "cihaz kaydi (200)" "$(durum -X PUT "$BIL/v1/bildirim/cihazlar" -H "authorization: Bearer $OG" -d "$CIHAZ_GOVDE")" 200
sart "cihaz satiri etkin" "$(bsql "select aktif from bildirim.cihazlar where kullanici_id = '$OG_K' and cihaz_kimligi = '$CIHAZ'")" t
sart "kimliksiz istek (401)" "$(durum "$BIL/v1/bildirim/kurumlar/$KURUM/kutu")" 401
echo "ayarlar (varsayilan): $(j "$BIL/v1/bildirim/kurumlar/$KURUM/ayarlar" -H "authorization: Bearer $OG" | jq -c .)"
# Gecenin saatinde kosulsa bile ilk push gitsin: sessiz saat kapatilir.
sart "sessiz saat kapat (200)" "$(durum -X PUT "$BIL/v1/bildirim/kurumlar/$KURUM/ayarlar" -H "authorization: Bearer $OG" -d '{"sessiz_gunler":[]}')" 200

adim "3) Soru sor + cevapla -> kutu bildirimi + push (log saglayici) -> gonderildi"
SORU1=$(sor_cevapla "Turev sorusu")
bekle "kutu bildirimi uretildi" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and alici_id = '$OG_UYELIK' and sablon_kodu = 'soru_cevaplandi'" 1
bekle "push gonderildi" "select count(*) from bildirim.gonderimler where kurum_id = '$KURUM' and durum = 'gonderildi' and saglayici = 'log'" 1
echo "olaydan push'a gecikme (bildirim uretimi -> gonderildi_at): $(bsql "select round(extract(epoch from (g.gonderildi_at - b.created_at))::numeric, 1) || ' sn' from bildirim.gonderimler g join bildirim.bildirimler b on b.id = g.bildirim_id where g.kurum_id = '$KURUM'")"
L=$(kutu "")
sart "kutuda 1 bildirim" "$(echo "$L" | jq '.ogeler | length')" 1
sart "baslik" "$(echo "$L" | jq -r '.ogeler[0].baslik')" "Sorun cevaplandı"
sart "derin baglanti" "$(echo "$L" | jq -r '.ogeler[0].derin_baglanti')" "kopru://soru/$SORU1"
sart "okunmamis sayisi" "$(sayac)" 1
echo "log saglayici satiri:"; grep 'push gönderimi (log sağlayıcı)' "$WORKER_LOG" | tail -1 | jq -c '{msg,title:.title,body:.body,data:.data,badge:.badge,platform:.platform,belirtec:.belirtec}' | sed 's/^/  /'
sart "log satirinda iOS rozeti = okunmamis sayisi" "$(grep 'push gönderimi (log sağlayıcı)' "$WORKER_LOG" | tail -1 | jq -r .badge)" 1
sart "push govdesinde kisisel veri yok (ad)" "$(bsql "select count(*) from bildirim.gonderimler where kurum_id = '$KURUM' and (govde ilike '%Ali%' or baslik ilike '%Ali%')")" 0

adim "4) Okundu isaretle"
BID=$(echo "$L" | jq -r '.ogeler[0].id')
sart "okundu (200)" "$(durum -X POST "$BIL/v1/bildirim/kurumlar/$KURUM/kutu/$BID/okundu" -H "authorization: Bearer $OG" -d '{}')" 200
sart "okunmamis sayisi 0" "$(sayac)" 0
sart "okunmamis suzgeci bos" "$(kutu '?okunmamis=true' | jq '.ogeler | length')" 0

adim "5) Sessiz saat: SIMDIYI kapsayan aralik -> push ertelendi, kutu aninda"
BASLA=$(bsql "select to_char((now() at time zone 'Europe/Istanbul') - interval '1 hour', 'HH24:MI')")
BITIS=$(bsql "select to_char((now() at time zone 'Europe/Istanbul') + interval '2 hours', 'HH24:MI')")
sart "ayar (200)" "$(durum -X PUT "$BIL/v1/bildirim/kurumlar/$KURUM/ayarlar" -H "authorization: Bearer $OG" -d "$(jq -nc --arg a "$BASLA" --arg b "$BITIS" '{sessiz_baslangic:$a,sessiz_bitis:$b,sessiz_gunler:[1,2,3,4,5,6,7]}')")" 200
echo "sessiz aralik (yerel): $BASLA - $BITIS"
SORU2=$(sor_cevapla "Integral sorusu")
bekle "kutu bildirimi (2)" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM'" 2
bekle "push ertelendi" "select count(*) from bildirim.gonderimler where kurum_id = '$KURUM' and durum = 'ertelendi'" 1
echo "ertelenen push zamanlanan_at (UTC): $(bsql "select to_char(zamanlanan_at at time zone 'UTC', 'HH24:MI') from bildirim.gonderimler where kurum_id = '$KURUM' and durum = 'ertelendi'")  (sessiz saat bitisi yerel $BITIS = UTC+3)"
sart "ertelenen push saglayiciya gitmedi" "$(bsql "select count(*) from bildirim.gonderimler where kurum_id = '$KURUM' and durum = 'gonderildi'")" 1
sart "kutuda hemen goruluyor" "$(sayac)" 1

adim "6) Tercih kapali (soru/push): kutu yazilir, push atlandi (tercih)"
sart "sessiz saati kapat (200)" "$(durum -X PUT "$BIL/v1/bildirim/kurumlar/$KURUM/ayarlar" -H "authorization: Bearer $OG" -d '{"sessiz_gunler":[]}')" 200
sart "tercih guncelle (200)" "$(durum -X PUT "$BIL/v1/bildirim/kurumlar/$KURUM/tercihler" -H "authorization: Bearer $OG" -d '{"tercihler":[{"kategori":"soru","kanal":"push","acik":false}]}')" 200
sart "sistem kategorisi degistirilemez (400)" "$(durum -X PUT "$BIL/v1/bildirim/kurumlar/$KURUM/tercihler" -H "authorization: Bearer $OG" -d '{"tercihler":[{"kategori":"sistem","kanal":"push","acik":false}]}')" 400
sart "gelen kutusu kapatilamaz (400)" "$(durum -X PUT "$BIL/v1/bildirim/kurumlar/$KURUM/tercihler" -H "authorization: Bearer $OG" -d '{"tercihler":[{"kategori":"odev","kanal":"kutu","acik":false}]}')" 400
SORU3=$(sor_cevapla "Limit sorusu")
bekle "kutu bildirimi (3)" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM'" 3
bekle "push atlandi (tercih)" "select count(*) from bildirim.gonderimler where kurum_id = '$KURUM' and durum = 'atlandi' and atlama_nedeni = 'tercih'" 1
sart "tercihi geri ac (200)" "$(durum -X PUT "$BIL/v1/bildirim/kurumlar/$KURUM/tercihler" -H "authorization: Bearer $OG" -d '{"tercihler":[{"kategori":"soru","kanal":"push","acik":true}]}')" 200

adim "7) motivasyon.seri.risk.v1 (NATS'a dogrudan) x4: gunluk 5 push siniri (2 gecerli push sayildi: gonderildi + ertelendi)"
for i in 1 2 3 4; do
  BITIS_AT=$(python3 -c "import datetime;print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=$i)).strftime('%Y-%m-%dT%H:%M:%SZ'))")
  ( cd "$BIL_DIZIN" && pnpm --silent exec tsx scripts/olay-yayinla.ts seri-risk "$KURUM" "$OG_UYELIK" "$BITIS_AT" "$((4 + i))" )
done
bekle "seri hatirlatmalari kutuda" "select count(*) from bildirim.bildirimler where kurum_id = '$KURUM' and sablon_kodu = 'seri_hatirlatma'" 4
bekle "kota nedeniyle atlanan" "select count(*) from bildirim.gonderimler where kurum_id = '$KURUM' and atlama_nedeni = 'kota'" 1
bekle "seri push'larinin gonderilmesi" "select count(*) from bildirim.gonderimler g join bildirim.bildirimler b on b.id = g.bildirim_id where g.kurum_id = '$KURUM' and b.sablon_kodu = 'seri_hatirlatma' and g.durum = 'gonderildi'" 3
echo "gonderimler (sirayla): $(gonderimler)"
sart "bugun sayilan push (atlandi disi) en cok 5" "$(bsql "select count(distinct bildirim_id) from bildirim.gonderimler where kurum_id = '$KURUM' and durum <> 'atlandi'")" 5

adim "8) Kutu: liste (imlecli), okunmamis sayisi, tumunu oku"
L=$(kutu "?limit=3")
sart "ilk sayfa 3 oge" "$(echo "$L" | jq '.ogeler | length')" 3
IMLEC=$(echo "$L" | jq -r .sonraki_imlec)
L2=$(kutu "?limit=3&imlec=$IMLEC")
sart "ikinci sayfa 3 oge (toplam 7: 3 soru + 4 seri)" "$(echo "$L2" | jq '.ogeler | length')" 3
L3=$(kutu "?limit=3&imlec=$(echo "$L2" | jq -r .sonraki_imlec)")
sart "ucuncu sayfa 1 oge, imlec yok" "$(echo "$L3" | jq -c '[(.ogeler | length), .sonraki_imlec]')" '[1,null]'
echo "kutu basliklari (yeniden eskiye): $(kutu "?limit=50" | jq -c '[.ogeler[].baslik]')"
sart "okunmamis sayisi (1 okundu)" "$(sayac)" 6
SEKIZ=$(kutu "?limit=50" | jq -r '[.ogeler[] | select(.sablon_kodu == "seri_hatirlatma")][0].id')
sart "arsivle (200)" "$(durum -X POST "$BIL/v1/bildirim/kurumlar/$KURUM/kutu/$SEKIZ/arsivle" -H "authorization: Bearer $OG" -d '{}')" 200
sart "arsivlenen kutuda gorunmez" "$(kutu "?limit=50" | jq '.ogeler | length')" 6
# arsivlenen (okunmamis) bildirim de okundu olur: 6 okunmamis satir (5 gorunur + 1 arsivli) -> 6
sart "tumunu oku" "$(j -X POST "$BIL/v1/bildirim/kurumlar/$KURUM/kutu/tumunu-oku" -H "authorization: Bearer $OG" -d '{}' | jq -r .guncellenen)" 6
sart "okunmamis sayisi 0" "$(sayac)" 0

adim "9) Erisim: baska kullanici/kurum bu bildirimlere erisemez"
sart "ogretmen kendi kutusu bos" "$(j "$BIL/v1/bildirim/kurumlar/$KURUM/kutu" -H "authorization: Bearer $H1" | jq '.ogeler | length')" 0
sart "ogretmen ogrencinin bildirimini okundu yapamaz (404)" "$(durum -X POST "$BIL/v1/bildirim/kurumlar/$KURUM/kutu/$BID/okundu" -H "authorization: Bearer $H1" -d '{}')" 404
sart "baska kurum yolu (403)" "$(durum "$BIL/v1/bildirim/kurumlar/$(uuidgen | tr 'A-Z' 'a-z')/kutu" -H "authorization: Bearer $OG")" 403
sart "ogretmenin tercih matrisi kendi varsayilani (soru/push acik)" "$(j "$BIL/v1/bildirim/kurumlar/$KURUM/tercihler" -H "authorization: Bearer $H1" | jq -r '.tercihler[] | select(.kategori == "soru" and .kanal == "push") | .acik')" true

adim "10) Cikista cihaz silinir"
sart "cihaz sil (200)" "$(sil "$BIL/v1/bildirim/cihazlar/$CIHAZ" "$OG")" 200
sart "cihaz satiri yok" "$(bsql "select count(*) from bildirim.cihazlar where kullanici_id = '$OG_K'")" 0

echo
echo "TAMAM: bildirim akisi gecti (kurum $KURUM)"
