import type { BantTespiti, Oneri, Zorluk } from '@kopru/contracts';

/**
 * Zorluk bandi tespiti ve ogretmene oneriler (saf fonksiyonlar; veritabani ve saat yok).
 * Tum esikler ve kurallar BU DOSYADADIR (sartname: "kurallar ve esikler kodda tek yerde, belgelidir";
 * docs/schema/api.md "Zorluk bandi tespiti ve oneriler"). Oneriler kural tabanlidir ve ogretmen onaylidir:
 * burada hicbir seyin ogrenciye otomatik gitmesi yoktur, cagiran yalniz personel yanitina ekler.
 *
 * Basari = dogru / cozulen (cozulen = dogru + yanlis + bos), 0..1.
 */

/** Bant (kolay/orta/zor) basina en az bu kadar soru yoksa o bant icin tespit yapilmaz ("veri az"). */
export const BANT_EN_AZ_SORU = 10;
/** Bir banttaki basari, bir onceki yeterli banttan en az bu kadar (puan, 0..1) dusukse "belirgin dusus". */
export const BANT_DUSUS_ESIGI = 0.2;
/** Belirgin dusus bandinin basarisi bu degerin altinda olmali (95 -> 80 gibi dususler zorluk sayilmaz). */
export const BANT_DUSUK_BASARI_ESIGI = 0.7;
/** Karsilastirilacak onceki bant yoksa (tek yeterli bant) kolay/orta bantta bu altindaki basari zorlanmadir. */
export const BANT_MUTLAK_ZORLANMA_ESIGI = 0.5;
/** "Gorev oner": onerilen soru sayisi. */
export const GOREV_ONER_SORU_SAYISI = 20;
/** "Birebir ders gerekebilir": son bu kadar gunde zor bant basarisi... */
export const BIREBIR_PENCERE_GUN = 14;
/** ...bu degerin altindaysa (ve toplam en az `BANT_EN_AZ_SORU` soruysa)... */
export const BIREBIR_ZOR_BASARI_ESIGI = 0.3;
/** ...ve iki yarim pencere (7 gun) karsilastirilabiliyorsa (her biri en az bu kadar soru) son hafta onceki haftadan... */
export const BIREBIR_HAFTA_EN_AZ_SORU = 5;
/** ...en az bu kadar (puan) iyilesmediyse "duzelmiyor" sayilir. */
export const BIREBIR_DUZELME_ESIGI = 0.1;
/** Sinif gorunumunde bir ogrencinin "zorlaniyor" sayilmasi icin en az soru ve basari ust siniri. */
export const SINIF_ZORLANAN_EN_AZ_SORU = 5;
export const SINIF_ZORLANAN_BASARI_ESIGI = 0.5;
/** Sinif gorunumunde "en cok zorlanilan konu" listesine girmek icin konudaki en az toplam soru. */
export const SINIF_KONU_EN_AZ_SORU = BANT_EN_AZ_SORU;
export const SINIF_EN_COK_ZORLANILAN = 5;
/** ...ve konunun sinif basarisi bu degerin altindaysa "en cok zorlanilan konular" listesine girer. */
export const SINIF_ZORLANILAN_KONU_BASARI_ESIGI = 0.7;

const BANTLAR: readonly Zorluk[] = ['kolay', 'orta', 'zor'];

export interface BantVerisi {
  cozulen: number;
  dogru: number;
}
export type BantHaritasi = Record<Zorluk, BantVerisi>;

/** 3 ondalik yuvarlanmis basari; `cozulen` 0 ise null. */
export function basariOrani(dogru: number, cozulen: number): number | null {
  return cozulen <= 0 ? null : Math.round((dogru / cozulen) * 1000) / 1000;
}

/**
 * Konudaki zorluk bandi tespiti.
 *  1. Yeterli (>= `BANT_EN_AZ_SORU` soru) bantlar secilir; digerleri `bant_basarilari`nda null.
 *  2. En az iki yeterli bant varsa, kolaydan zora sirayla: bir onceki yeterli banda gore basari
 *     `BANT_DUSUS_ESIGI` kadar dustuyse ve bu bandin basarisi `BANT_DUSUK_BASARI_ESIGI` altindaysa o bant
 *     "zorlaniyor" (ilk bulunan; ornek kolay %90, orta %60, zor %25 -> orta).
 *  3. Ilk yeterli bant kolay/orta ise ve basari `BANT_MUTLAK_ZORLANMA_ESIGI` altindaysa (karsilastirilacak
 *     onceki bant yoktur) o bant zorlaniyor. Yalniz bir yeterli bant varsa ve zor ise ya da basari yuksekse
 *     tespit yapilmaz (zor zaten zordur) -> "veri az".
 *  4. Hic yeterli bant yoksa "veri az". Dusus yoksa "tespit yok" (sorun saptanmadi).
 */
export function bantTespit(bantlar: BantHaritasi): BantTespiti {
  const basarilar: BantTespiti['bant_basarilari'] = { kolay: null, orta: null, zor: null };
  const yeterli: { bant: Zorluk; basari: number }[] = [];
  for (const b of BANTLAR) {
    const { cozulen, dogru } = bantlar[b];
    if (cozulen >= BANT_EN_AZ_SORU) {
      const basari = basariOrani(dogru, cozulen) ?? 0;
      basarilar[b] = basari;
      yeterli.push({ bant: b, basari });
    }
  }
  const sonuc = (durum: BantTespiti['durum'], bant: Zorluk | null): BantTespiti => ({
    durum,
    bant,
    bant_basarilari: basarilar,
  });

  if (yeterli.length === 0) return sonuc('veri_az', null);
  // Ilk yeterli bant kolay/orta ise ve basari mutlak olarak dusukse, dusus aramadan o bant zorlanmadir.
  const ilk = yeterli[0];
  if (ilk && ilk.bant !== 'zor' && ilk.basari < BANT_MUTLAK_ZORLANMA_ESIGI) {
    return sonuc('zorlaniyor', ilk.bant);
  }
  if (yeterli.length === 1) return sonuc('veri_az', null);
  for (let i = 1; i < yeterli.length; i += 1) {
    const once = yeterli[i - 1];
    const bu = yeterli[i];
    if (!once || !bu) continue;
    // Kayan nokta payi: 0.9 - 0.7 gibi farklar 0.2'nin hemen altinda cikabilir.
    if (once.basari - bu.basari >= BANT_DUSUS_ESIGI - 1e-9 && bu.basari < BANT_DUSUK_BASARI_ESIGI) {
      return sonuc('zorlaniyor', bu.bant);
    }
  }
  return sonuc('tespit_yok', null);
}

export interface KonuBilgisi {
  brans_kodu: string;
  konu_id: string;
  konu_ad: string | null;
}

/** "Gorev oner": zorlanilan konuda zorlanilan bantta `GOREV_ONER_SORU_SAYISI` soruluk gorev. */
export function gorevOner(konu: KonuBilgisi, tespit: BantTespiti): Oneri | null {
  if (tespit.durum !== 'zorlaniyor' || tespit.bant === null) return null;
  return {
    tur: 'gorev_oner',
    brans_kodu: konu.brans_kodu,
    konu_id: konu.konu_id,
    konu_ad: konu.konu_ad,
    zorluk: tespit.bant,
    soru_sayisi: GOREV_ONER_SORU_SAYISI,
    basari: tespit.bant_basarilari[tespit.bant],
  };
}

export interface ZorHaftalari {
  /** Penceredeki ilk 7 gun (daha eski). */
  onceki: BantVerisi;
  /** Penceredeki son 7 gun. */
  son: BantVerisi;
}

/**
 * "Birebir ders gerekebilir": son `BIREBIR_PENCERE_GUN` gunde zor bantta en az `BANT_EN_AZ_SORU` soru ve
 * basari `BIREBIR_ZOR_BASARI_ESIGI` altinda ve duzelmiyor. Duzelme: her iki hafta da en az
 * `BIREBIR_HAFTA_EN_AZ_SORU` soruluksa son hafta, onceki haftadan `BIREBIR_DUZELME_ESIGI` kadar iyi
 * olmali; karsilastirilamiyorsa (bir hafta verisiz) iyilesme kanitlanamadigi icin duzelmiyor sayilir.
 */
export function birebirDersGerekli(konu: KonuBilgisi, zor: ZorHaftalari): Oneri | null {
  const cozulen = zor.onceki.cozulen + zor.son.cozulen;
  const dogru = zor.onceki.dogru + zor.son.dogru;
  if (cozulen < BANT_EN_AZ_SORU) return null;
  const basari = basariOrani(dogru, cozulen);
  if (basari === null || basari >= BIREBIR_ZOR_BASARI_ESIGI) return null;
  const onceki =
    zor.onceki.cozulen >= BIREBIR_HAFTA_EN_AZ_SORU
      ? basariOrani(zor.onceki.dogru, zor.onceki.cozulen)
      : null;
  const son =
    zor.son.cozulen >= BIREBIR_HAFTA_EN_AZ_SORU
      ? basariOrani(zor.son.dogru, zor.son.cozulen)
      : null;
  if (onceki !== null && son !== null && son - onceki >= BIREBIR_DUZELME_ESIGI - 1e-9) return null;
  return {
    tur: 'birebir_ders',
    brans_kodu: konu.brans_kodu,
    konu_id: konu.konu_id,
    konu_ad: konu.konu_ad,
    zor_basari: basari,
    onceki_hafta_basari: onceki,
    son_hafta_basari: son,
  };
}

/** Bant tespitinin kotuluk sirasi: 0 sorun yok / veri yok, 1 zor, 2 orta, 3 kolay bantta zorlanma. */
function bantDerecesi(t: BantTespiti): number | null {
  if (t.durum === 'veri_az') return null;
  if (t.durum === 'tespit_yok') return 0;
  return t.bant === 'kolay' ? 3 : t.bant === 'orta' ? 2 : 1;
}

/** Iki donemin tespitini karsilastirir; birinde veri yoksa "belirsiz". */
export function bantDegisimi(
  onceki: BantTespiti,
  simdiki: BantTespiti,
): 'iyilesti' | 'ayni' | 'kotulesti' | 'belirsiz' {
  const a = bantDerecesi(onceki);
  const b = bantDerecesi(simdiki);
  if (a === null || b === null) return 'belirsiz';
  if (b < a) return 'iyilesti';
  if (b > a) return 'kotulesti';
  return 'ayni';
}

/** Gorev basligi: "Genetik: orta seviyeden 20 soru" (planda/odevde gorunen baslik). */
const ZORLUK_BASLIK: Record<Zorluk, string> = {
  kolay: 'kolay',
  orta: 'orta',
  zor: 'zor',
};
export function gorevBasligi(konuAd: string | null, zorluk: Zorluk, soruSayisi: number): string {
  const ad = konuAd ?? 'Konu';
  return `${ad}: ${ZORLUK_BASLIK[zorluk]} seviyeden ${String(soruSayisi)} soru`.slice(0, 200);
}
