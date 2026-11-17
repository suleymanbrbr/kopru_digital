import { MOTIVASYON_KOZMETIK_SLOTLARI } from '@kopru/contracts';
import { t } from '@kopru/i18n';

export interface AcilmaKosulu {
  rozet?: string | undefined;
  rozet_adi?: string | undefined;
  seviye?: number | undefined;
  seri?: number | undefined;
}

/**
 * Kilitli kozmetigin acilma kosulu metni (i18n'den; sunucu metin gondermez). Rozet adi sunucudan
 * Turkce gelir; yoksa rozet kodu yerine genel bir ifade kullanilir.
 */
export function kilitMetni(k: AcilmaKosulu): string {
  if (k.seri !== undefined) return t('motivasyon.kozmetik.kilit.seri', { n: k.seri });
  if (k.seviye !== undefined) return t('motivasyon.kozmetik.kilit.seviye', { n: k.seviye });
  if (k.rozet !== undefined) {
    return k.rozet_adi
      ? t('motivasyon.kozmetik.kilit.rozet', { ad: k.rozet_adi })
      : t('motivasyon.kozmetik.kilit.rozetAdsiz');
  }
  return t('motivasyon.kozmetik.kilit.bilinmiyor');
}

export type KozmetikSlotu = (typeof MOTIVASYON_KOZMETIK_SLOTLARI)[number];

/** Kozmetikleri yuvaya gore gruplar (yuva sirasi sabit; icinde: sahip olunanlar once). */
export function yuvayaGoreGrupla<T extends { slot: KozmetikSlotu; sahip: boolean; ad: string }>(
  liste: readonly T[],
): { slot: KozmetikSlotu; ogeler: T[] }[] {
  return MOTIVASYON_KOZMETIK_SLOTLARI.map((slot) => ({
    slot,
    ogeler: liste
      .filter((k) => k.slot === slot)
      .sort((a, b) => Number(b.sahip) - Number(a.sahip) || a.ad.localeCompare(b.ad, 'tr')),
  })).filter((g) => g.ogeler.length > 0);
}
