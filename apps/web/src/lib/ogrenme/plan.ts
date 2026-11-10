import type { PlanGorevi } from '@kopru/contracts';
import { t } from '@kopru/i18n';

import { haftaBasi, tarihEkle } from '@/lib/saat';

/**
 * Haftalik plan yardimcilari. Hafta Pazartesi-Pazar'dir ve Europe/Istanbul takvimiyle sunucuda
 * hesaplanir; istemci yalniz gosterim icin ayni kurali uygular (`@/lib/saat`).
 */

export { haftaBasi };

/** `7` gun: Pazartesi'den Pazar'a. */
export function haftaninGunleri(hafta: string): string[] {
  return Array.from({ length: 7 }, (_, i) => tarihEkle(hafta, i));
}

/** Gorevleri gune gore gruplar (gun -> sira, sonra ders); haftanin tum gunleri anahtardir. */
export function gunlereBol(
  gorevler: readonly PlanGorevi[],
  hafta: string,
): Map<string, PlanGorevi[]> {
  const harita = new Map<string, PlanGorevi[]>(haftaninGunleri(hafta).map((g) => [g, []]));
  for (const g of gorevler) harita.get(g.gun)?.push(g);
  for (const liste of harita.values()) {
    liste.sort((a, b) => a.sira - b.sira || a.brans_kodu.localeCompare(b.brans_kodu, 'tr'));
  }
  return harita;
}

/** "30 soru" / "45 dk". */
export function miktarEtiketi(hedefTuru: string, miktar: number): string {
  return t(hedefTuru === 'soru' ? 'ogrenme.plan.miktarSoru' : 'ogrenme.plan.miktarDakika', {
    n: miktar,
  });
}

/** Gerceklesen / hedef ("12 / 30 soru"); girilmemisse yalniz hedef. */
export function ilerlemeEtiketi(g: PlanGorevi): string {
  if (g.gerceklesen_miktar === null) return miktarEtiketi(g.hedef_turu, g.hedef_miktar);
  return t(g.hedef_turu === 'soru' ? 'ogrenme.plan.ilerlemeSoru' : 'ogrenme.plan.ilerlemeDakika', {
    yapilan: g.gerceklesen_miktar,
    hedef: g.hedef_miktar,
  });
}

/** Devredilmis (eski) gorev: duzenlenemez, gerceklesen girilemez. */
export const devredilmisMi = (g: PlanGorevi) => g.durum === 'devredildi';
/** Baska gunden tasinmis (devir yavrusu) gorev: "devredilen" isareti. */
export const devralindiMi = (g: PlanGorevi) => g.devreden_gorev_id !== null;

/** "Yarina tasi" hedefi: ayni haftanin sonraki gunu; Pazar'da yok (`null`). */
export function devirHedefi(g: PlanGorevi): string | null {
  const yarin = tarihEkle(g.gun, 1);
  return yarin <= tarihEkle(g.hafta_baslangic, 6) ? yarin : null;
}

export interface GorevFormu {
  gun: string;
  brans: string;
  hedefTuru: 'soru' | 'dakika';
  miktar: string;
}

export type GorevHatalari = Partial<Record<'gun' | 'brans' | 'miktar', string>>;

/** Gorev formunu dogrular; bos nesne = gecerli. Mesajlar `ogrenme.plan.hata.*`. */
export function gorevFormunuDogrula(f: GorevFormu, hafta: string): GorevHatalari {
  const hata: GorevHatalari = {};
  if (!haftaninGunleri(hafta).includes(f.gun)) hata.gun = t('ogrenme.plan.hata.gun');
  if (!f.brans) hata.brans = t('ogrenme.plan.hata.brans');
  const m = Number(f.miktar);
  if (!Number.isInteger(m) || m < 1 || m > 100_000) hata.miktar = t('ogrenme.plan.hata.miktar');
  return hata;
}

/** Plan kilitli mi: hafta sonundan (Pazar) 14 gun sonra. Sunucu kuraliyla ayni; asil denetim `api`da. */
export function haftaKilitliMi(hafta: string, bugun: string): boolean {
  return bugun > tarihEkle(hafta, 20);
}

/** Gorev durumu icin rozet tonu. */
export function gorevDurumTonu(g: PlanGorevi): 'basari' | 'uyari' | 'hata' | 'notr' {
  if (g.durum === 'tamam') return 'basari';
  if (g.durum === 'kismen') return 'uyari';
  if (g.durum === 'yapilmadi') return 'hata';
  return 'notr';
}
