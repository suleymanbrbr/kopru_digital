import { t, type MessageKey } from '@kopru/i18n';

import { trKarsilastir } from '@/lib/sirala';

/**
 * Brans kodlari `ortak.bransler` referans tablosunun tohumudur (docs/schema/api.md). `api` bu liste
 * icin henuz bir uc nokta sunmuyor; ad metinleri `packages/i18n` icindedir. Uc nokta gelince bu
 * dizi onun yanitiyla degistirilir.
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

/** Turkce siralanmis, "diger" sonda. */
export function siraliBransler(): { kod: string; ad: string }[] {
  const liste: { kod: string; ad: string }[] = BRANS_KODLARI.filter((k) => k !== 'diger')
    .map((kod) => ({ kod, ad: bransAdi(kod) }))
    .sort((a, b) => trKarsilastir(a.ad, b.ad));
  return [...liste, { kod: 'diger', ad: bransAdi('diger') }];
}
