import type { AnalizZorlugu, Hucre, KonuAnaliziSema, Oneri } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import type { z } from 'zod';

/**
 * Konu x zorluk tablosunun gosterim kurallari (yalniz sunum; bant tespiti ve oneriler `api`dadir).
 * Renk tek basina anlam tasimaz: her hucre yuzde, soru sayisi ve seviye metnini de tasir.
 */

/** Basari bu degerin ustundeyse "iyi" (0..1). */
export const IYI_ESIGI = 0.7;
/** Basari bu degerin ustundeyse "orta", altinda "zayif" (0..1). */
export const ORTA_ESIGI = 0.5;
/** Hucrede bu kadardan az soru "veri az" sayilir (`api` bant esigiyle ayni). */
export const VERI_AZ_ESIGI = 10;

export type Seviye = 'iyi' | 'orta' | 'zayif' | 'veriAz' | 'bos';

export function seviyeBul(h: Hucre): Seviye {
  if (h.cozulen === 0) return 'bos';
  if (h.cozulen < VERI_AZ_ESIGI || h.basari === null) return 'veriAz';
  if (h.basari >= IYI_ESIGI) return 'iyi';
  if (h.basari >= ORTA_ESIGI) return 'orta';
  return 'zayif';
}

export const SEVIYE_SINIFI: Record<Seviye, string> = {
  iyi: 'bg-basari-yumusak text-metin',
  orta: 'bg-uyari-yumusak text-metin',
  zayif: 'bg-hata-yumusak text-metin',
  veriAz: 'bg-yuzey-ikincil text-metin-ikincil',
  bos: 'bg-transparent text-metin-ikincil',
};

/** 0-1 orani tam yuzdeye yuvarlar. */
export function yuzdeSayisi(oran: number | null): number {
  return oran === null ? 0 : Math.round(oran * 100);
}

export function zorlukAdi(z: AnalizZorlugu): string {
  return t(`gunlukSoru.zorluk.${z}`);
}

export function seviyeAdi(s: Seviye): string {
  return s === 'bos' ? t('gunlukSoru.analiz.hucreBos') : t(`gunlukSoru.analiz.seviye.${s}`);
}

type KonuAnalizi = z.infer<typeof KonuAnaliziSema>;

/** "Belirtilmemis" sutunu (odev teslimleri) yalniz en az bir konuda dolu ise gosterilir. */
export function belirtilmemisVar(konular: readonly KonuAnalizi[]): boolean {
  return konular.some((k) => k.hucreler.belirtilmemis.cozulen > 0);
}

export interface BantMetni {
  metin: string;
  ton: 'hata' | 'notr' | 'basari';
}

export function bantMetni(k: KonuAnalizi): BantMetni {
  if (k.bant.durum === 'zorlaniyor' && k.bant.bant) {
    return {
      metin: t('gunlukSoru.bant.zorlaniyor', { bant: zorlukAdi(k.bant.bant) }),
      ton: 'hata',
    };
  }
  if (k.bant.durum === 'tespit_yok') {
    return { metin: t('gunlukSoru.bant.tespitYok'), ton: 'basari' };
  }
  return { metin: t('gunlukSoru.bant.veriAz'), ton: 'notr' };
}

/** Konuya ait "birebir ders gerekebilir" onerisi var mi? */
export function birebirVarMi(oneriler: readonly Oneri[] | undefined, konuId: string): boolean {
  return (oneriler ?? []).some((o) => o.tur === 'birebir_ders' && o.konu_id === konuId);
}

export type AnalizDonemi = '7' | '30' | 'donem';
export const DONEMLER: readonly AnalizDonemi[] = ['7', '30', 'donem'];

export function donemAdi(d: AnalizDonemi): string {
  return d === '7'
    ? t('gunlukSoru.analiz.donemler.gun7')
    : d === '30'
      ? t('gunlukSoru.analiz.donemler.gun30')
      : t('gunlukSoru.analiz.donemler.donem');
}
