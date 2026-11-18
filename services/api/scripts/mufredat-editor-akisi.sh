#!/usr/bin/env bash
# Platform mufredat editoru akisi (paket P2): gercek api + api worker (outbox relay) + bildirim API + bildirim worker.
#
# Akis: kurum (sahip + ogretmen + grup) -> LGS 1 tohumu (konular: 101 unite, 102/103 konu, 104 alt konu, 105 unite)
#  -> kurum verisi: ogretmen 102'ye bagli odev verir, sahip 102 altina kurum alt konusu ekler
#  -> plat claim'siz 403 / platform belirteciyle taslak ac -> konu ekle, adlandir (103, alt agaciyla kopya), tasi,
#     birlestir (102 -> 103'), ekle+kaldir -> surum farki -> yayinla
#  -> eski konuya bagli odev hala okunur; 102 "kullanimdan kalkti" + yerine_gecen_id; kurum alt konusu yeni ust konuda
#  -> yayinlanan surum degismez (SQL denemesi); denetim kayitlari
#  -> bildirim servisi: sahibin kutusunda "Mufredat guncellendi" (yalniz kutu).
#
# Platform girisi (P1) birlesene kadar `plat` belirteci `scripts/platform-belirteci.ts` ile basilir (yalniz gelistirme).
# bash 3.2 (macOS) uyumlu. Gereken: curl, jq, docker, pnpm, python3.
#
# On kosul (repo kokunden; AYRI NATS ve DB; 415xx portlari):
#   docker run -d --name kopru-nats-p2 -p 4233:4222 nats:2 -js
#   P='docker exec kopru-postgres-1 psql -U postgres'
#   $P -c 'create database kopru_api_p2' ; $P -c 'create database kopru_bildirim_p2'
#   export NATS_URL=nats://localhost:4233
#   export API_DATABASE_URL=postgres://api_app:api_app@localhost:5433/kopru_api_p2 \
#          API_DATABASE_SISTEM_URL=postgres://api_sistem:api_sistem@localhost:5433/kopru_api_p2 \
#          API_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_api_p2 \
#          API_APP_PASSWORD=api_app API_SISTEM_PASSWORD=api_sistem \
#          API_PORT=41520 API_PUBLIC_URL=http://localhost:41520 API_MEDYA_URL=http://127.0.0.1:41529
#   pnpm --filter @kopru/api db:migrate
#   docker exec -i kopru-postgres-1 psql -U api_sistem -d kopru_api_p2 -h localhost < services/api/scripts/mufredat-tohum.sql
#   (pnpm --filter @kopru/api start > /tmp/api-p2.log 2>&1 &) ; (pnpm --filter @kopru/api start:worker > /tmp/api-worker-p2.log 2>&1 &)
#   export BILDIRIM_DATABASE_OWNER_URL=postgres://postgres:postgres@localhost:5433/kopru_bildirim_p2 \
#          BILDIRIM_APP_PASSWORD=bildirim_app BILDIRIM_SISTEM_PASSWORD=bildirim_sistem
#   pnpm --filter @kopru/bildirim db:migrate
#   export BILDIRIM_DATABASE_URL=postgres://bildirim_app:bildirim_app@localhost:5433/kopru_bildirim_p2 \
#          BILDIRIM_DATABASE_SISTEM_URL=postgres://bildirim_sistem:bildirim_sistem@localhost:5433/kopru_bildirim_p2 \
#          BILDIRIM_PORT=41521 BILDIRIM_AUTH_ENABLED=true JWKS_URL=http://localhost:41520/.well-known/jwks.json \
#          JWT_ISSUER=http://localhost:41520 BILDIRIM_PUSH_SAGLAYICI=log
#   (pnpm --filter @kopru/bildirim start > /tmp/bildirim-p2.log 2>&1 &) ; (pnpm --filter @kopru/bildirim start:worker > /tmp/bildirim-worker-p2.log 2>&1 &)
# Kullanim (repo kokunden, ayni ortam degiskenleriyle):
#   services/api/scripts/mufredat-editor-akisi.sh
set -euo pipefail

API="${API:-http://localhost:41520}"
BIL="${BIL:-http://localhost:41521}"
PG="${PG:-docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -d kopru_api_p2 -v ON_ERROR_STOP=1}"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"

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
  local id
  for id in $(j "$API/v1/hesap/rizalar/guncel" -H "authorization: Bearer $1" | jq -r '.metinler[] | select(.kabul_edildi == false) | .id'); do
    j -X POST "$API/v1/hesap/rizalar" -H "authorization: Bearer $1" -d "$(jq -nc --arg i "$id" '{riza_metni_id:$i}')" >/dev/null
  done
}
davetle() { # $1 sahip token, $2 rol, $3 eposta, $4 ad -> "uyelik_id oturum"
  local belirtec oturum ilk
  belirtec=$(j -X POST "$API/v1/hesap/kurumlar/$KURUM/davetler" -H "authorization: Bearer $1" -d "$(jq -nc --arg r "$2" '{kanal:"baglanti",rol:$r}')" | jq -r '.belirtec')
  oturum=$(kayit "$3" "$4"); ilk=$(token "$oturum"); riza "$ilk"
  j -X POST "$API/v1/hesap/davetler/kabul" -H "authorization: Bearer $ilk" -d "$(jq -nc --arg b "$belirtec" '{belirtec:$b}')" | jq -r '.uyelik_id' | tr -d '\n'
  printf ' %s' "$oturum"
}

adim "1) Kurum: sahip, ogretmen (matematik atamali), grup"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Deneme"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"Mufredat Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"
O="$API/v1/ogrenme/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"8-A Matematik"}' | jq -r '.id')
HOCA_BILGI=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca")
HOCA_UYELIK=${HOCA_BILGI%% *}; HOCA_OTURUM=${HOCA_BILGI##* }
sart "ogretmen atamasi (201)" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$HOCA_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
HOCA=$(token "$HOCA_OTURUM" "$KURUM")
SAHIP_KULLANICI=$(echo "$S" | cut -d. -f2 | python3 -c 'import sys,base64,json; s=sys.stdin.read().strip(); print(json.loads(base64.urlsafe_b64decode(s+"="*(-len(s)%4)))["sub"])')
echo "kurum: $KURUM"

K102=019a0000-0000-7000-8000-000000000102   # Tam sayilarin negatif kuvvetleri (konu)
K103=019a0000-0000-7000-8000-000000000103   # Bilimsel gosterim (konu, alt konusu var: 104)
K105=019a0000-0000-7000-8000-000000000105   # Karekoklu Ifadeler (unite)
U101=019a0000-0000-7000-8000-000000000101   # Usli Ifadeler (unite)

adim "2) Kurum verisi: 102'ye bagli odev ve 102 altinda kurum alt konusu"
ALT=$(j -X POST "$O/konular" -H "authorization: Bearer $S" -d "$(jq -nc --arg u "$K102" '{brans_kodu:"matematik",ust_id:$u,seviye:"alt_konu",ad:"Kurumun negatif kuvvet soru bankasi"}')")
ALT_ID=$(echo "$ALT" | jq -r '.id')
sart "kurum alt konusu ust konusu" "$(echo "$ALT" | jq -r '.ust_id')" "$K102"
SON=$(python3 -c 'import datetime as d; print((d.datetime.now(d.timezone.utc)+d.timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ"))')
ODEV=$(j -X POST "$O/odevler" -H "authorization: Bearer $HOCA" -d "$(jq -nc --arg g "$GRUP" --arg k "$K102" --arg s "$SON" '{baslik:"Negatif kuvvetler",brans_kodu:"matematik",tur:"soru",hedef_turu:"grup",hedef_id:$g,konu_id:$k,son_teslim_at:$s}')")
ODEV_ID=$(echo "$ODEV" | jq -r '.id')
sart "odevin konusu" "$(echo "$ODEV" | jq -r '.konu_id')" "$K102"

adim "3) Yetki: plat claim'siz 403; belirtecsiz 401"
sart "kurum sahibi platform ucunu goremez (403)" "$(durum "$API/platform/mufredat/kataloglar" -H "authorization: Bearer $S")" 403
sart "belirtecsiz (401)" "$(durum "$API/platform/mufredat/kataloglar")" 401
sart "kurum sahibi taslak acamaz, gecersiz govdeyle de 403" "$(durum -X POST "$API/platform/mufredat/kataloglar/lgs/taslak" -H "authorization: Bearer $S" -d '{}')" 403
PLAT=$(pnpm --silent --filter @kopru/api exec tsx scripts/platform-belirteci.ts "$SAHIP_KULLANICI" yonetici)
P="$API/platform/mufredat/kataloglar/lgs"
pj() { j -H "authorization: Bearer $PLAT" "$@"; }
sart "plat=yonetici katalog listesi (200)" "$(durum "$API/platform/mufredat/kataloglar" -H "authorization: Bearer $PLAT")" 200

adim "4) Taslak: ac (ikinci taslak 409), konu ekle/adlandir/tasi/birlestir/kaldir"
TASLAK=$(pj -X POST "$P/taslak" -d '{"ad":"2027-2028 LGS (deneme)","aciklama":"Editor denemesi"}')
sart "taslak surum no" "$(echo "$TASLAK" | jq '.surum.surum_no')" 2
sart "ikinci taslak 409" "$(durum -X POST "$P/taslak" -H "authorization: Bearer $PLAT" -d '{"ad":"x"}')" 409
X=$(pj -X POST "$P/taslak/konular" -d "$(jq -nc --arg u "$U101" '{brans_kodu:"matematik",ust_id:$u,seviye:"konu",ad:"Üslü ifadelerde işlemler",not:"Yeni programda eklendi."}')")
X_ID=$(echo "$X" | jq -r '.konu.id')
sart "eklenen konu taslakta doguldu" "$(echo "$X" | jq '.konu.yeni')" true
AD=$(pj -X POST "$P/taslak/konular/$K103/adlandir" -d '{"ad":"Bilimsel gösterim ve standart form","not":"MEB adı güncellendi."}')
K103_YENI=$(echo "$AD" | jq -r '.konu.id')
sart "adlandirma yeni kimlikli kopya" "$([ "$K103_YENI" != "$K103" ] && echo evet || echo hayir)" evet
echo "alt agac kopyalanan satir: $(echo "$AD" | jq '.degisiklik.ayrinti.kopyalanan_konu')"
sart "ekleneni baska unitenin altina tasi (yerinde)" "$(pj -X POST "$P/taslak/konular/$X_ID/tasi" -d "$(jq -nc --arg u "$K105" '{ust_id:$u,not:"Kareköklü ünitesine alındı."}')" | jq -r '.konu.ust_id')" "$K105"
sart "birlestirme gecersiz (farkli seviye) 400" "$(durum -X POST "$P/taslak/konular/$K102/birlestir" -H "authorization: Bearer $PLAT" -d "$(jq -nc --arg h "$K105" '{hedef_id:$h,not:"n"}')")" 400
BIRLESTIR=$(pj -X POST "$P/taslak/konular/$K102/birlestir" -d "$(jq -nc --arg h "$K103_YENI" '{hedef_id:$h,not:"Negatif kuvvetler bilimsel gösterimle birleştirildi."}')")
sart "birlesen konunun hedefi" "$(echo "$BIRLESTIR" | jq -r '.degisiklik.hedef_konu_id')" "$K103_YENI"
Y=$(pj -X POST "$P/taslak/konular" -d "$(jq -nc --arg u "$K105" '{brans_kodu:"matematik",ust_id:$u,seviye:"konu",ad:"Geçici konu",not:"Deneme."}')")
Y_ID=$(echo "$Y" | jq -r '.konu.id')
sart "kaldir (200)" "$(durum -X POST "$P/taslak/konular/$Y_ID/kaldir" -H "authorization: Bearer $PLAT" -d '{"not":"Vazgecildi."}')" 200

adim "5) Surum farki ve taslak agaci (v1 degismemis)"
FARK=$(pj "$P/surumler/2/fark")
echo "$FARK" | jq -c '.ozet'
sart "fark ozeti" "$(echo "$FARK" | jq -c '.ozet')" '{"eklenen":2,"yeniden_adlandirilan":1,"tasinan":1,"birlesen":1,"kaldirilan":1}'
echo "adlandirma: $(echo "$FARK" | jq -c '.yeniden_adlandirilan[0] | {ad_once, ad_sonra, not}')"
sart "v1 agaci: eski adlar duruyor" "$(pj "$P/surumler/1/agac" | jq -c '[.konular[].ad] | sort')" '["Bilimsel gösterim","Kareköklü İfadeler","Tam sayıların negatif kuvvetleri","Çok büyük sayıların bilimsel gösterimi","Üslü İfadeler"]'
sart "v2 taslak agaci konu sayisi (102 birlesti, Gecici hic var olmadi)" "$(pj "$P/surumler/2/agac" | jq '.konular | length')" 5
sart "kurum henuz taslagi gormez (tumu=1, lgs)" "$(j "$O/konular?katalog_kodu=lgs&tumu=1" -H "authorization: Bearer $S" | jq '[.konular[] | select(.ad == "Üslü ifadelerde işlemler")] | length')" 0

adim "6) Yayin: surum degismez olur, kurum verisi kopmaz"
YAYIN=$(pj -X POST "$P/taslak/yayinla" -d '{"not":"2027-2028 müfredatı yayında."}')
echo "$YAYIN" | jq -c '{taslak: .surum.taslak, ozet, bildirilen_kurum_sayisi, yeniden_baglanan_kurum_konusu}'
sart "yayinlandi" "$(echo "$YAYIN" | jq '.surum.taslak')" false
sart "kurum alt konusu yeni ust konuya baglandi" "$(echo "$YAYIN" | jq '.yeniden_baglanan_kurum_konusu')" 1
sart "yayindan sonra taslak islemi 404" "$(durum -X POST "$P/taslak/konular/$X_ID/adlandir" -H "authorization: Bearer $PLAT" -d '{"ad":"x","not":"n"}')" 404
ODEV_SONRA=$(j "$O/odevler/$ODEV_ID" -H "authorization: Bearer $HOCA")
sart "ESKI konuya bagli odev hala okunur (konu_id degismedi)" "$(echo "$ODEV_SONRA" | jq -r '.konu_id')" "$K102"
ESKI=$(j "$O/konular/$K102" -H "authorization: Bearer $HOCA")
echo "eski konu: $(echo "$ESKI" | jq -c '{ad, kullanimdan_kalkti, yerine_gecen_id}')"
sart "eski konu kullanimdan kalkti" "$(echo "$ESKI" | jq '.kullanimdan_kalkti')" true
sart "eski konunun yerine gecen konusu" "$(echo "$ESKI" | jq -r '.yerine_gecen_id')" "$K103_YENI"
sart "kurum alt konusu yeni ust konunun altinda" "$(j "$O/konular/$ALT_ID" -H "authorization: Bearer $S" | jq -r '.ust_id')" "$K103_YENI"
sart "kurum artik v2'yi cozer ve yeni konuyu gorur" "$(j "$O/konular?katalog_kodu=lgs" -H "authorization: Bearer $S" | jq '[.konular[] | select(.ad == "Üslü ifadelerde işlemler")] | length')" 1

adim "7) Yayinli surum degismezligi (SQL, api_sistem) ve denetim"
SQL_HATA=$(docker exec -i kopru-postgres-1 psql -q -t -A -U api_sistem -h localhost -d kopru_api_p2 -c "update ogrenme.mufredat_surumleri set ad = 'oynama' where katalog_kodu = 'lgs' and surum_no = 2" 2>&1 || true)
case "$SQL_HATA" in *yayinli_surum_degismez*) echo "ok: yayinli surum guncellenemedi ($SQL_HATA)";; *) echo "BASARISIZ: surum degistirilebildi: $SQL_HATA"; exit 1;; esac
echo "denetim kayitlari: $($PG -c "select eylem || ' / ' || coalesce(neden, '') from hesap.denetim_kayitlari where eylem like 'platform.mufredat.%' order by created_at" | tr '\n' ';')"
sart "denetim sayisi (8 islem: taslak, 2 ekle, adlandir, tasi, birlestir, kaldir, yayin)" "$($PG -c "select count(*) from hesap.denetim_kayitlari where eylem like 'platform.mufredat.%'")" 8

adim "8) Bildirim servisi: sahibin kutusunda 'Mufredat guncellendi'"
BULUNDU=hayir
for _ in $(seq 1 30); do
  KUTU=$(j "$BIL/v1/bildirim/kurumlar/$KURUM/kutu?limit=50" -H "authorization: Bearer $S")
  if [ "$(echo "$KUTU" | jq '[.ogeler[] | select(.sablon_kodu == "mufredat_guncellendi")] | length' 2>/dev/null || echo 0)" -ge 1 ]; then BULUNDU=evet; break; fi
  sleep 1
done
sart "sahibin kutusunda bildirim" "$BULUNDU" evet
echo "$KUTU" | jq -c '.ogeler[] | select(.sablon_kodu == "mufredat_guncellendi")'
sart "ogretmenin kutusunda yok" "$(j "$BIL/v1/bildirim/kurumlar/$KURUM/kutu?limit=50" -H "authorization: Bearer $HOCA" | jq '[.ogeler[] | select(.sablon_kodu == "mufredat_guncellendi")] | length')" 0

printf '\nTUM ADIMLAR GECTI\n'
