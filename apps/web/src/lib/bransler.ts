import { t, type MessageKey } from '@kopru/i18n';

import { trKarsilastir } from '@/lib/sirala';

/**
 * Brans listesi `GET /v1/hesap/bransler` ucundan gelir (`useBransler`, `lib/bransler-sorgu.ts`).
 * Bu dizi yalniz yedektir: uc yanit verene kadar ya da ulasilamazsa secenekler bos kalmasin diye
 * `ortak.bransler` tohumunun kodlari kullanilir; ad metinleri `packages/i18n` icindedir.
 */
export const BRANS_KODLARI = [
  'matematik',
  'fizik',
  'kimya',
  'biyoloji',
  'turkce',
  'edebiyat',
  'tarih',
  'cografya',
  'felsefe',
  'din_kulturu',
  'ingilizce',
  'fen_bilimleri',
  'sosyal_bilgiler',
  'geometri',
  'inkilap_tarihi',
  'almanca',
  'diger',
] as const;

export function bransAdi(kod: string): string {
  const anahtar = `hesap.brans.${kod}`;
  const ad = t(anahtar as MessageKey);
  return ad === anahtar ? kod : ad;
}

/** Turkce siralanmis, "diger" sonda. `kaynak` verilmezse yedek kod listesi kullanilir. */
export function siraliBransler(
  kaynak?: readonly { kod: string; ad: string }[],
): { kod: string; ad: string }[] {
  const girdi = kaynak ?? BRANS_KODLARI.map((kod) => ({ kod, ad: bransAdi(kod) }));
  const liste = girdi
    .filter((b) => b.kod !== 'diger')
    .map((b) => ({ kod: b.kod, ad: b.ad }))
    .sort((a, b) => trKarsilastir(a.ad, b.ad));
  const diger = girdi.find((b) => b.kod === 'diger');
  return [...liste, { kod: 'diger', ad: diger?.ad ?? bransAdi('diger') }];
}
