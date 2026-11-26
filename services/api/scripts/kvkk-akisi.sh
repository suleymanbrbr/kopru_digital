#!/usr/bin/env bash
# KVKK akisi: hesap silme + veri disa aktarma, uctan uca (gercek api + motivasyon + bildirim + medya, 4 worker, NATS, S3).
# Ogrenci olusturulur; veri uretilir (fotografli soru: gercek medya yuklemesi + S3 nesnesi, XP, bildirim kutusu + cihaz,
# karakter adi, kurumun finans defteri); "verilerimi indir" icerigi dogrulanir; silme talebi -> yanlis parola reddi ->
# geri al -> yeniden talep -> soguma zaman yolculugu (SQL) -> worker anonimlestirir -> api, motivasyon, bildirim, medya ve
# S3'te kisisel verinin gittigi, kurumun finans defterinin ve XP defterinin bozulmadan durdugu SQL/S3 ile gosterilir.
# Ek: tek sahibi olunan kurumda baska uye varsa silme engeli (409); iptal edilen oturumun belirteci 401.
#
# Kullanim (repo kokunden; once altyapi, sonra akis, en son kapat):
#   services/api/scripts/kvkk-altyapi.sh ac && services/api/scripts/kvkk-akisi.sh ; services/api/scripts/kvkk-altyapi.sh kapat
# Gereken: curl (>= 7.75, --aws-sigv4), jq, docker, uuidgen. bash 3.2 (macOS) uyumlu.
set -euo pipefail

API="${API:-http://localhost:41830}"
MOT="${MOT:-http://localhost:41831}"
BIL="${BIL:-http://localhost:41832}"
MED="${MED:-http://localhost:41833}"
S3="${S3:-http://localhost:9000}"; KOVA="${KOVA:-kopru-k1}"
KOK="$(cd "$(dirname "$0")/../../.." && pwd)"
RUN="$RANDOM$RANDOM"
PAROLA="cok-gizli-parola"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PSQL="docker exec -i kopru-postgres-1 psql -q -t -A -U postgres -v ON_ERROR_STOP=1"

j() { curl -sS -H 'content-type: application/json' "$@"; }
adim() { printf '\n== %s\n' "$*"; }
sart() { if [ "$#" -ne 3 ]; then echo "BASARISIZ: sart 3 arguman ister ($1)"; exit 2; fi; if [ "$2" != "$3" ]; then echo "BASARISIZ: $1 (beklenen $3, gelen $2)"; exit 1; fi; echo "ok: $1 -> $2"; }
durum() { curl -sS -o /dev/null -w '%{http_code}' -H 'content-type: application/json' "$@"; }
sil() { curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$@"; } # govdesiz DELETE: content-type basligi gonderilmez
asql() { $PSQL -d kopru_k1_api -c "$1"; }
msql() { $PSQL -d kopru_k1_mot -c "$1"; }
bsql() { $PSQL -d kopru_k1_bil -c "$1"; }
dsql() { $PSQL -d kopru_k1_med -c "$1"; }
s3durum() { curl -sS -o /dev/null -w '%{http_code}' -I --aws-sigv4 "aws:amz:us-east-1:s3" --user kopru:kopru-dev-secret "$S3/$KOVA/$1"; }
bekle() { # $1 aciklama, $2 komut (ciktisi "1"/"t"/"true" olunca biter), 60 sn
  local i; for i in $(seq 1 120); do if [ "$(eval "$2" 2>/dev/null || true)" = "1" ]; then echo "ok: $1"; return 0; fi; sleep 0.5; done
  echo "BASARISIZ: zaman asimi: $1"; exit 1
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
yukle() { # $1 token $2 tur $3 mime $4 dosya -> dosya_id
  local boyut sha izin id url
  boyut=$(wc -c < "$4" | tr -d ' '); sha=$(shasum -a 256 "$4" | cut -d' ' -f1)
  izin=$(j -X POST "$MED/v1/dosyalar" -H "authorization: Bearer $1" -d "$(jq -nc --arg t "$2" --arg m "$3" --argjson b "$boyut" --arg s "$sha" --arg k "$(uuidgen | tr 'A-Z' 'a-z')" '{tur:$t,mime_tipi:$m,boyut_bayt:$b,sha256:$s,istemci_anahtari:$k}')")
  id=$(echo "$izin" | jq -r '.dosya.id'); url=$(echo "$izin" | jq -r '.yukleme.url')
  curl -sS -o /dev/null -X PUT -H "Content-Type: $3" --data-binary "@$4" "$url"
  durum -X POST "$MED/v1/dosyalar/$id/tamam" -H "authorization: Bearer $1" >/dev/null
  printf '%s' "$id"
}

adim "0) Servisler hazir mi"
for u in "$API" "$MOT" "$BIL" "$MED"; do sart "$u/ready" "$(curl -sS -o /dev/null -w '%{http_code}' "$u/ready")" 200; done

adim "1) Kurum, ogretmen (matematik), ogrenci (girisli, parola), baska bir ogrenci (kontrol)"
S_OTURUM=$(kayit "sahip$RUN@example.com" "Sahip Kisi"); S_ILK=$(token "$S_OTURUM"); riza "$S_ILK"
KURUM=$(j -X POST "$API/v1/hesap/kurumlar" -H "authorization: Bearer $S_ILK" -d '{"ad":"KVKK Deneme Kurumu","tur":"kurum"}' | jq -r '.kurum.id')
S=$(token "$S_OTURUM" "$KURUM")
H="$API/v1/hesap/kurumlar/$KURUM"; O="$API/v1/ogrenme/kurumlar/$KURUM"; F="$API/v1/finans/kurumlar/$KURUM"
GRUP=$(j -X POST "$H/gruplar" -H "authorization: Bearer $S" -d '{"tur":"grup","ad":"11-A"}' | jq -r '.id')
H_B=$(davetle "$S" ogretmen "hoca$RUN@example.com" "Ayse Hoca"); H_UYELIK=${H_B%% *}; H_OTURUM=${H_B##* }
sart "matematik atamasi" "$(durum -X POST "$H/gruplar/$GRUP/atamalar" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$H_UYELIK" '{ogretmen_id:$o,brans_kodu:"matematik"}')")" 201
OG_B=$(davetle "$S" ogrenci "ogr$RUN@example.com" "Ali Ogrenci"); OG_UYELIK=${OG_B%% *}; OG_OTURUM=${OG_B##* }
DG_B=$(davetle "$S" ogrenci "diger$RUN@example.com" "Diger Ogrenci"); DG_UYELIK=${DG_B%% *}; DG_OTURUM=${DG_B##* }
sart "ogrenciler gruba" "$(durum -X POST "$H/gruplar/$GRUP/uyeler" -H "authorization: Bearer $S" -d "$(jq -nc --arg a "$OG_UYELIK" --arg b "$DG_UYELIK" '{ogrenci_idleri:[$a,$b]}')")" 201
HOCA=$(token "$H_OTURUM" "$KURUM"); OGR=$(token "$OG_OTURUM" "$KURUM"); DGR=$(token "$DG_OTURUM" "$KURUM")
OG_K=$(asql "select kullanici_id from hesap.uyelikler where id = '$OG_UYELIK'")
DG_K=$(asql "select kullanici_id from hesap.uyelikler where id = '$DG_UYELIK'")
echo "kurum $KURUM, ogrenci kullanici $OG_K"

adim "2) Veri uret: karakter, cihaz, fotografli soru (gercek medya), ogretmen cevabi -> bildirim, XP, finans defteri"
sart "karakter secimi" "$(durum -X POST "$MOT/v1/motivasyon/kurumlar/$KURUM/karakter" -H "authorization: Bearer $OGR" -d '{"tur_kodu":"kivilcim","ad":"Ayse Yildiz Karakteri"}')" 201
sart "diger ogrenci karakteri" "$(durum -X POST "$MOT/v1/motivasyon/kurumlar/$KURUM/karakter" -H "authorization: Bearer $DGR" -d '{"tur_kodu":"kivilcim","ad":"Digerinin Adi"}')" 201
sart "cihaz kaydi" "$(durum -X PUT "$BIL/v1/bildirim/cihazlar" -H "authorization: Bearer $OGR" -d "$(jq -nc --arg b "ExponentPushToken[kvkk-$RUN]" '{platform:"ios",push_belirteci:$b,cihaz_kimligi:"cihaz-kvkk",uygulama_surumu:"1.0.0",dil:"tr"}')")" 200
( cd "$KOK/services/medya" && pnpm --silent exec tsx scripts/ornek-uret.ts jpeg "$TMP/foto.jpg" ) >/dev/null
FOTO=$(yukle "$OGR" soru_fotografi image/jpeg "$TMP/foto.jpg")
bekle "foto hazir (medya worker isledi)" "[ \"\$(j $MED/v1/dosyalar/$FOTO -H 'authorization: Bearer $OGR' | jq -r .durum)\" = hazir ] && echo 1"
bekle "api medya kopyasi geldi (olay)" "[ \"\$(asql \"select count(*) from ortak.medya_dosya_kopyalari where id = '$FOTO'\")\" = 1 ] && echo 1"
ANAHTAR=$(dsql "select depolama_anahtari from medya.dosyalar where id = '$FOTO'")
sart "S3 nesnesi var" "$(s3durum "$ANAHTAR")" 200
R=$(j -X POST "$O/sorular" -H "authorization: Bearer $OGR" -d "$(jq -nc --arg f "$FOTO" '{brans_kodu:"matematik",baslik:"Turev sorusu",metin:"Burada takildim",fotograflar:[$f]}')")
SORU=$(echo "$R" | jq -r .id); echo "soru: $SORU"
sart "ogretmen cevaplar" "$(durum -X POST "$O/sorular/$SORU/cevap" -H "authorization: Bearer $HOCA" -d '{"metin":"Once turev al"}')" 200
bekle "ogrenci bildirim kutusunda kayit" "[ \"\$(bsql \"select count(*) from bildirim.bildirimler b join bildirim.uyelik_kopyalari u on u.uyelik_id = b.alici_id where u.kullanici_id = '$OG_K'\")\" -ge 1 ] && echo 1"
bekle "XP defteri (motivasyon)" "[ \"\$(msql \"select count(*) from motivasyon.xp_hareketleri where ogrenci_id = '$OG_UYELIK'\")\" -ge 1 ] && echo 1"
PAKET=$(j -X POST "$F/paketler" -H "authorization: Bearer $S" -d '{"ad":"8 Ders","kredi_adedi":8,"fiyat_kurus":600000,"gecerlilik_gun":90}' | jq -r .id)
sart "satis + kismi odeme" "$(durum -X POST "$F/paket-satislari" -H "authorization: Bearer $S" -d "$(jq -nc --arg o "$OG_UYELIK" --arg p "$PAKET" '{ogrenci_id:$o,paket_id:$p,odeme:{tur:"kismi",tutar_kurus:250000,yontem:"nakit"}}')")" 201
FINANS_ONCE=$(asql "select (select count(*) from finans.tahsilatlar where kurum_id = '$KURUM') || '/' || (select count(*) from finans.bakiye_hareketleri where kurum_id = '$KURUM') || '/' || (select coalesce(sum(tutar_kurus),0) from finans.tahsilatlar where kurum_id = '$KURUM')")
echo "finans defteri (tahsilat/hareket/toplam kurus): $FINANS_ONCE"
XP_ONCE=$(msql "select count(*) || '/' || coalesce(sum(xp),0) from motivasyon.xp_hareketleri where ogrenci_id = '$OG_UYELIK'")
echo "XP defteri (satir/toplam): $XP_ONCE"

adim "3) Verilerimi indir (GET /v1/hesap/ben/verilerim)"
curl -sS -D "$TMP/basliklar" -H "authorization: Bearer $OGR" "$API/v1/hesap/ben/verilerim" -o "$TMP/verilerim.json"
grep -i 'content-disposition' "$TMP/basliklar" | tr -d '\r'
jq '{kullanici_id, hesap: {ad: .hesap.gorunen_ad, eposta: .hesap.eposta}, uyelik: (.bolumler.uyelikler|length), soru: (.bolumler.sorular|length), soru_mesaji: (.bolumler.soru_mesajlari|length), riza: (.bolumler.rizalar|length), xp: .servisler.motivasyon.xp_ozeti[0].toplam_xp, karakter: .servisler.motivasyon.karakter[0].ad, cihaz: (.servisler.bildirim.cihazlar|length), bildirim: (.servisler.bildirim.bildirimler|length), dosya: (.servisler.medya.dosyalar|length), eksik: .eksik_servisler}' "$TMP/verilerim.json"
sart "kullanici" "$(jq -r .kullanici_id "$TMP/verilerim.json")" "$OG_K"
sart "yalniz kendi uyeligi" "$(jq -r '[.bolumler.uyelikler[].id]|join(",")' "$TMP/verilerim.json")" "$OG_UYELIK"
sart "soru sayisi" "$(jq -r '.bolumler.sorular|length' "$TMP/verilerim.json")" 1
sart "karakter adi" "$(jq -r '.servisler.motivasyon.karakter[0].ad' "$TMP/verilerim.json")" "Ayse Yildiz Karakteri"
sart "cihaz sayisi" "$(jq -r '.servisler.bildirim.cihazlar|length' "$TMP/verilerim.json")" 1
sart "medya dosyasi" "$(jq -r '.servisler.medya.dosyalar[0].id' "$TMP/verilerim.json")" "$FOTO"
sart "eksik servis yok" "$(jq -r '.eksik_servisler|length' "$TMP/verilerim.json")" 0
sart "baska kullanicinin kimligi dosyada yok" "$(grep -c -e "$DG_K" -e "$DG_UYELIK" -e "diger$RUN" -e "Digerinin" "$TMP/verilerim.json" || true)" 0
sart "ogretmen/sahip e-postasi dosyada yok" "$(grep -c -e "hoca$RUN" -e "sahip$RUN" "$TMP/verilerim.json" || true)" 0
sart "push belirteci dosyada yok" "$(grep -c 'ExponentPushToken' "$TMP/verilerim.json" || true)" 0

adim "4) Silme talebi: durum, yanlis parola, dogru parola, ikinci talep, geri al, yeniden talep"
echo "durum: $(j "$API/v1/hesap/ben/silme-talebi" -H "authorization: Bearer $OGR" | jq -c '{talep, soguma_gun, engeller, dogrulama_yontemleri}')"
sart "yanlis parola (401)" "$(durum -X POST "$API/v1/hesap/ben/silme-talebi" -H "authorization: Bearer $OGR" -d '{"dogrulama":{"yontem":"parola","parola":"yanlis-parola"}}')" 401
sart "dogrulamasiz (400)" "$(durum -X POST "$API/v1/hesap/ben/silme-talebi" -H "authorization: Bearer $OGR" -d '{}')" 400
TALEP=$(j -X POST "$API/v1/hesap/ben/silme-talebi" -H "authorization: Bearer $OGR" -d "$(jq -nc --arg p "$PAROLA" '{dogrulama:{yontem:"parola",parola:$p},kaynak:"web"}')")
echo "$TALEP" | jq -c .talep
sart "talep beklemede" "$(echo "$TALEP" | jq -r .talep.durum)" beklemede
sart "ikinci talep (409)" "$(durum -X POST "$API/v1/hesap/ben/silme-talebi" -H "authorization: Bearer $OGR" -d "$(jq -nc --arg p "$PAROLA" '{dogrulama:{yontem:"parola",parola:$p}}')")" 409
sart "bekleyen talepte hesap calisir (ben 200)" "$(durum "$API/v1/hesap/ben" -H "authorization: Bearer $OGR")" 200
sart "geri al (200)" "$(sil "$API/v1/hesap/ben/silme-talebi" -H "authorization: Bearer $OGR")" 200
sart "geri alinca durum" "$(j "$API/v1/hesap/ben/silme-talebi" -H "authorization: Bearer $OGR" | jq -r .talep.durum)" geri_alindi
sart "ikinci geri al (404)" "$(sil "$API/v1/hesap/ben/silme-talebi" -H "authorization: Bearer $OGR")" 404
sleep 4
sart "geri alinan talepte veri yerinde (kullanici aktif)" "$(asql "select durum from hesap.kullanicilar where id = '$OG_K'")" aktif
sart "yeniden talep (201)" "$(durum -X POST "$API/v1/hesap/ben/silme-talebi" -H "authorization: Bearer $OGR" -d "$(jq -nc --arg p "$PAROLA" '{dogrulama:{yontem:"parola",parola:$p}}')")" 201
echo "talep: $(asql "select durum, planlanan_at - talep_at as soguma from hesap.silme_talepleri where kullanici_id = '$OG_K' and durum = 'beklemede'")"

adim "5) Sahip engeli: tek sahip ve kurumda baska uyeler var"
sart "sahip silme talebi (409)" "$(durum -X POST "$API/v1/hesap/ben/silme-talebi" -H "authorization: Bearer $S" -d "$(jq -nc --arg p "$PAROLA" '{dogrulama:{yontem:"parola",parola:$p}}')")" 409
echo "$(j -X POST "$API/v1/hesap/ben/silme-talebi" -H "authorization: Bearer $S" -d "$(jq -nc --arg p "$PAROLA" '{dogrulama:{yontem:"parola",parola:$p}}')" | jq -c '{kod: .error.code, kurumlar: .error.details.kurumlar}')"

adim "6) Soguma suresi zaman yolculuguyla bitirilir; worker (3 sn'de bir) anonimlestirir"
SID=$(echo "$OGR" | cut -d. -f2 | tr '_-' '/+' | awk '{ while (length($0) % 4) $0 = $0 "="; print }' | base64 -d 2>/dev/null | jq -r .sid)
asql "update hesap.silme_talepleri set talep_at = now() - interval '31 days', planlanan_at = now() - interval '1 day' where kullanici_id = '$OG_K' and durum = 'beklemede'" >/dev/null
bekle "talep tamamlandi" "[ \"\$(asql \"select durum from hesap.silme_talepleri where kullanici_id = '$OG_K' order by created_at desc limit 1\")\" = tamamlandi ] && echo 1"

adim "7) api: kisisel veri gitti, kanit ve defter kaldi"
asql "select durum, telefon_e164 is null as tel_yok, eposta is null as eposta_yok, gorunen_ad is null as ad_yok, anonimlestirildi_at is not null as zaman from hesap.kullanicilar where id = '$OG_K'"
sart "kullanici anonim" "$(asql "select durum || '/' || (eposta is null) || '/' || (gorunen_ad is null) from hesap.kullanicilar where id = '$OG_K'")" "silindi/true/true"
sart "hesaplar (giris yontemleri) silindi" "$(asql "select count(*) from hesap.hesaplar where kullanici_id = '$OG_K'")" 0
sart "oturumlar silindi" "$(asql "select count(*) from hesap.oturumlar where kullanici_id = '$OG_K'")" 0
sart "uyelik: ad ve no yok, ayrildi" "$(asql "select (gorunen_ad is null) || '/' || durum from hesap.uyelikler where id = '$OG_UYELIK'")" "true/ayrildi"
sart "riza kaniti duruyor (ip/user_agent yok)" "$(asql "select count(*) > 0 and bool_and(ip is null and user_agent is null) from hesap.rizalar where kullanici_id = '$OG_K'")" t
sart "soru mesaji metni silindi" "$(asql "select count(*) from ogrenme.soru_mesajlari where yazar_id = '$OG_UYELIK' and metin is distinct from '[silindi]'")" 0
sart "soru kaydi duruyor" "$(asql "select count(*) from ogrenme.sorular where ogrenci_id = '$OG_UYELIK'")" 1
sart "denetim kaydi" "$(asql "select count(*) from hesap.denetim_kayitlari where eylem = 'kvkk.hesap_sil' and hedef_id = '$OG_K'")" 1
sart "outbox: silindi olayi (kurum nil, kisisel veri yok)" "$(asql "select count(*) from ortak.outbox where subject = 'evt.hesap.kullanici.silindi.v1' and kurum_id = '00000000-0000-0000-0000-000000000000' and payload->'data'->>'kullanici_id' = '$OG_K' and payload::text !~* 'ogr$RUN|Ali'")" 1
sart "eski erisim belirteci artik 401 (sid iptali / kullanici yok)" "$(durum "$API/v1/hesap/ben" -H "authorization: Bearer $OGR")" 401
sart "diger ogrenci etkilenmedi" "$(asql "select durum from hesap.kullanicilar where id = '$DG_K'")" aktif
sart "finans defteri bozulmadi" "$(asql "select (select count(*) from finans.tahsilatlar where kurum_id = '$KURUM') || '/' || (select count(*) from finans.bakiye_hareketleri where kurum_id = '$KURUM') || '/' || (select coalesce(sum(tutar_kurus),0) from finans.tahsilatlar where kurum_id = '$KURUM')")" "$FINANS_ONCE"

adim "8) bildirim, motivasyon, medya, S3 (olay tuketicileri)"
bekle "bildirim: cihaz/kutu/kopya temizligi" "[ \"\$(bsql \"select (select count(*) from bildirim.cihazlar where kullanici_id = '$OG_K') + (select count(*) from bildirim.bildirimler where alici_id = '$OG_UYELIK') + (select count(*) from bildirim.kullanici_kopyalari where kullanici_id = '$OG_K' and durum <> 'silindi')\")\" = 0 ] && echo 1"
bsql "select durum from bildirim.kullanici_kopyalari where kullanici_id = '$OG_K'"
sart "bildirim: diger ogrencinin verisi duruyor (uyelik kopyasi)" "$(bsql "select count(*) from bildirim.uyelik_kopyalari where kullanici_id = '$DG_K'")" 1
bekle "motivasyon: karakter adi anonim" "[ \"\$(msql \"select ad from motivasyon.ogrenci_karakterleri where ogrenci_id = '$OG_UYELIK'\")\" = Anonim ] && echo 1"
sart "motivasyon: diger ogrencinin karakter adi duruyor" "$(msql "select ad from motivasyon.ogrenci_karakterleri where ogrenci_id = '$DG_UYELIK'")" "Digerinin Adi"
sart "motivasyon: XP defteri bozulmadi (anonim kaldi)" "$(msql "select count(*) || '/' || coalesce(sum(xp),0) from motivasyon.xp_hareketleri where ogrenci_id = '$OG_UYELIK'")" "$XP_ONCE"
bekle "medya: dosya silindi (S3'ten kalkti)" "[ \"\$(dsql \"select durum from medya.dosyalar where id = '$FOTO'\")\" = silindi ] && echo 1"
dsql "select durum, silme_nedeni, depolama_anahtari is null as anahtar_yok from medya.dosyalar where id = '$FOTO'"
sart "S3 nesnesi artik yok (404)" "$(s3durum "$ANAHTAR")" 404
sart "S3 kucuk resimler yok" "$(dsql "select count(*) from medya.kucuk_resimler where dosya_id = '$FOTO'")" 0

adim "OZET: tum KVKK kontrolleri gecti"
