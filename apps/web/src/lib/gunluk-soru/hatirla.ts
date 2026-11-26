import type { Zorluk } from '@kopru/contracts';

/**
 * Hizli giris formunun son secimleri (15 sn calisma citi): ders, ders basina konu/zorluk/kaynak.
 * Tarayici depolamasi kapaliysa sessizce vazgecilir; form yine calisir.
 */

export interface SonKaynak {
  tur: 'yok' | 'test' | 'serbest';
  kitapId?: string;
  testId?: string;
  metin?: string;
}

export interface DersTercihi {
  konuId?: string;
  zorluk?: Zorluk;
  kaynak?: SonKaynak;
}

export interface SonTercihler {
  brans?: string;
  dersler: Record<string, DersTercihi>;
}

const ANAHTAR = (kurumId: string) => `kopru.gunlukSoru.son.${kurumId}`;

export function tercihleriOku(kurumId: string): SonTercihler {
  try {
    const ham = globalThis.localStorage.getItem(ANAHTAR(kurumId));
    const veri: unknown = ham ? JSON.parse(ham) : null;
    if (typeof veri === 'object' && veri !== null && 'dersler' in veri) {
      const v = veri as SonTercihler;
      if (typeof v.dersler === 'object') return { dersler: v.dersler, brans: v.brans };
    }
  } catch {
    /* depolama kapali ya da bozuk: bos tercihle devam */
  }
  return { dersler: {} };
}

export function tercihleriYaz(kurumId: string, brans: string, tercih: DersTercihi): SonTercihler {
  const onceki = tercihleriOku(kurumId);
  const yeni: SonTercihler = {
    brans,
    dersler: { ...onceki.dersler, [brans]: { ...onceki.dersler[brans], ...tercih } },
  };
  try {
    globalThis.localStorage.setItem(ANAHTAR(kurumId), JSON.stringify(yeni));
  } catch {
    /* depolama kapali: yalniz oturum icinde calisir */
  }
  return yeni;
}

/** Test/serbest metin satirlarini `ad, sayi` biciminden ayristirir (kaynak kitap formu). */
export function testSatirlariniAyristir(
  metin: string,
): { testler: { ad: string; soru_sayisi: number }[] } | { hataliSatir: number } {
  const testler: { ad: string; soru_sayisi: number }[] = [];
  const satirlar = metin.split('\n');
  for (let i = 0; i < satirlar.length; i += 1) {
    const satir = (satirlar[i] ?? '').trim();
    if (satir === '') continue;
    const m = /^(.+?)[,;\t]\s*(\d{1,3})$/.exec(satir);
    const sayi = m ? Number(m[2]) : 0;
    const ad = m?.[1]?.trim() ?? '';
    if (!m || ad === '' || ad.length > 200 || sayi < 1 || sayi > 500) {
      return { hataliSatir: i + 1 };
    }
    testler.push({ ad, soru_sayisi: sayi });
  }
  return { testler };
}
