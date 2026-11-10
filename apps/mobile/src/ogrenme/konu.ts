import { t, type MessageKey } from '@kopru/i18n';

import type { Konu } from '../api/ogrenmeTipleri';
import type { KvDepo } from '../depo/kv';

const TR_HARITA: Record<string, string> = {
  İ: 'i',
  I: 'i',
  ı: 'i',
  Ş: 's',
  ş: 's',
  Ç: 'c',
  ç: 'c',
  Ğ: 'g',
  ğ: 'g',
  Ö: 'o',
  ö: 'o',
  Ü: 'u',
  ü: 'u',
};

/**
 * Turkce harf duyarsiz arama anahtari: "Işık", "isik", "IŞIK" ve "İŞİK" ayni sonucu verir.
 * Cihaz yerel ayarina bagli degildir (Hermes'te `toLocaleLowerCase('tr')` guvenilmez).
 */
export function aramaAnahtari(metin: string): string {
  let s = '';
  for (const c of metin) s += TR_HARITA[c] ?? c;
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
}

/** Brans kodunun Turkce adi; bilinmiyorsa kod okunur hale getirilir ("fen_bilimleri" -> "Fen bilimleri"). */
export function bransAdi(kod: string): string {
  const anahtar = `mobil.brans.${kod}` as MessageKey;
  const ad = t(anahtar);
  if (ad !== anahtar) return ad;
  const duz = kod.replace(/_/g, ' ');
  return duz.charAt(0).toLocaleUpperCase('tr') + duz.slice(1);
}

/** Konularin branslari, Turkce sirayla. */
export function bransListesi(konular: readonly Konu[]): { kod: string; ad: string }[] {
  const kodlar = [...new Set(konular.map((k) => k.bransKodu))];
  return kodlar
    .map((kod) => ({ kod, ad: bransAdi(kod) }))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

export interface KonuSatiri {
  konu: Konu;
  /** 0: unite, 1: konu, 2: alt konu (girinti). */
  derinlik: number;
}

export interface KonuAgaciSecenegi {
  bransKodu?: string | null;
  arama?: string;
  /** Kullanimdan kalkanlar yeni secimde sunulmaz (varsayilan). */
  kalkanlariGoster?: boolean;
}

/**
 * unite > konu > alt konu agacini duz, girintili bir liste olarak dondurur. Aramada eslesen
 * konunun ustleri de gelir (baglam icin). `ustId` listede olmayan konu kok sayilir.
 */
export function konuAgaci(
  konular: readonly Konu[],
  { bransKodu, arama, kalkanlariGoster = false }: KonuAgaciSecenegi = {},
): KonuSatiri[] {
  const aday = konular.filter(
    (k) => (kalkanlariGoster || !k.kullanimdanKalkti) && (!bransKodu || k.bransKodu === bransKodu),
  );
  const id = new Map(aday.map((k) => [k.id, k]));
  const sorgu = arama ? aramaAnahtari(arama) : '';
  let gorunen = new Set(aday.map((k) => k.id));
  if (sorgu) {
    gorunen = new Set();
    const eslesen = new Set(
      aday.filter((k) => aramaAnahtari(k.ad).includes(sorgu)).map((k) => k.id),
    );
    for (const k of aday) {
      // Eslesen konunun ustleri (baglam) ve altlari (alt konu secilebilsin) de gelir.
      let simdiki: Konu | undefined = k;
      let altta = false;
      while (simdiki) {
        if (simdiki !== k && eslesen.has(simdiki.id)) altta = true;
        simdiki = simdiki.ustId ? id.get(simdiki.ustId) : undefined;
      }
      if (altta) gorunen.add(k.id);
      if (!eslesen.has(k.id)) continue;
      simdiki = k;
      while (simdiki && !gorunen.has(simdiki.id)) {
        gorunen.add(simdiki.id);
        simdiki = simdiki.ustId ? id.get(simdiki.ustId) : undefined;
      }
    }
  }
  const cocuklar = new Map<string | null, Konu[]>();
  for (const k of aday) {
    if (!gorunen.has(k.id)) continue;
    const ust = k.ustId && id.has(k.ustId) ? k.ustId : null;
    cocuklar.set(ust, [...(cocuklar.get(ust) ?? []), k]);
  }
  const satirlar: KonuSatiri[] = [];
  const ekle = (ust: string | null, derinlik: number) => {
    const liste = (cocuklar.get(ust) ?? []).sort(
      (a, b) => a.sira - b.sira || a.ad.localeCompare(b.ad, 'tr'),
    );
    for (const k of liste) {
      satirlar.push({ konu: k, derinlik });
      ekle(k.id, derinlik + 1);
    }
  };
  ekle(null, 0);
  // Koklerde brans bazli gruplama: once brans, sonra sira (brans filtresi yoksa karisik olmasin).
  return bransliSirala(satirlar);
}

function bransliSirala(satirlar: KonuSatiri[]): KonuSatiri[] {
  // Her kok (derinlik 0 ya da ustu olmayan) ve altindakiler bir blok: bloklari brans adina gore sirala.
  const bloklar: KonuSatiri[][] = [];
  for (const s of satirlar) {
    if (s.derinlik === 0 || bloklar.length === 0) bloklar.push([s]);
    else bloklar[bloklar.length - 1]?.push(s);
  }
  return bloklar
    .map((b, i) => ({ b, i }))
    .sort(
      (x, y) =>
        bransAdi(x.b[0]?.konu.bransKodu ?? '').localeCompare(
          bransAdi(y.b[0]?.konu.bransKodu ?? ''),
          'tr',
        ) || x.i - y.i,
    )
    .flatMap((x) => x.b);
}

/** Konu etiketi: kullanimdan kalkmissa "(kullanımdan kalktı)" eki (rozet metni) eklenir. */
export function konuEtiketi(k: Pick<Konu, 'ad' | 'kullanimdanKalkti'>): string {
  return k.kullanimdanKalkti ? `${k.ad} (${t('mobil.ogrenme.konu.kalkti')})` : k.ad;
}

// --- Son kullanilanlar (yerel) --------------------------------------------------------------

export const SON_KONU_SAYISI = 8;

function sonAnahtar(uyelikId: string): string {
  return `kopru.son-konular.${uyelikId}`;
}

/** Yerel depodan son kullanilan konu kimlikleri (en yeni basta). */
export function sonKonulariOku(depo: KvDepo, uyelikId: string): string[] {
  try {
    const v: unknown = JSON.parse(depo.getString(sonAnahtar(uyelikId)) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Konuyu listenin basina koyar (tekrar yok, en cok `SON_KONU_SAYISI`). */
export function sonKonuEkle(depo: KvDepo, uyelikId: string, konuId: string): string[] {
  const yeni = [konuId, ...sonKonulariOku(depo, uyelikId).filter((x) => x !== konuId)].slice(
    0,
    SON_KONU_SAYISI,
  );
  depo.set(sonAnahtar(uyelikId), JSON.stringify(yeni));
  return yeni;
}

/** Son kullanilanlari (kimlik sirasiyla) konulara cevirir; kalkan/silinen konular dusulur. */
export function sonKonular(
  konular: readonly Konu[],
  idler: readonly string[],
  bransKodu?: string | null,
): Konu[] {
  const sonuc: Konu[] = [];
  for (const id of idler) {
    const k = konular.find((x) => x.id === id);
    if (k && !k.kullanimdanKalkti && (!bransKodu || k.bransKodu === bransKodu)) sonuc.push(k);
  }
  return sonuc;
}
