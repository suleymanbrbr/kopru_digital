import type { MotivasyonDurumu } from '../api/motivasyonTipleri';

export interface XpFarki {
  /** Kazanilan XP (> 0 ya da seviye/rozet degisimi). */
  xp: number;
  seviyeAtladi: boolean;
  eskiSeviye: number;
  yeniSeviye: number;
  /** Karakterin asamasi yukseldi: evrim sahnesi. */
  evrim: boolean;
  eskiAsama: number | null;
  yeniAsama: number | null;
  /** Yeni kazanilan rozetlerin adlari (sunucudan Turkce gelir). */
  yeniRozetler: string[];
}

/**
 * Iki `benim` anligi arasindaki fark. Hicbir sey kazanilmadiysa (XP artmadi, seviye ve rozet ayni)
 * `null`: ters kayit (negatif XP) kutlama uretmez.
 */
export function xpFarki(onceki: MotivasyonDurumu, yeni: MotivasyonDurumu): XpFarki | null {
  const xp = yeni.toplam_xp - onceki.toplam_xp;
  const eskiKodlar = new Set(onceki.rozetler.kazanilan.map((r) => r.kod));
  const yeniRozetler = yeni.rozetler.kazanilan
    .filter((r) => !eskiKodlar.has(r.kod))
    .map((r) => r.ad);
  const seviyeAtladi = yeni.seviye > onceki.seviye;
  const eskiAsama = onceki.karakter?.asama ?? null;
  const yeniAsama = yeni.karakter?.asama ?? null;
  const evrim = eskiAsama !== null && yeniAsama !== null && yeniAsama > eskiAsama;
  if (xp <= 0 && !seviyeAtladi && yeniRozetler.length === 0) return null;
  return {
    xp: Math.max(xp, 0),
    seviyeAtladi,
    eskiSeviye: onceki.seviye,
    yeniSeviye: yeni.seviye,
    evrim,
    eskiAsama,
    yeniAsama,
    yeniRozetler,
  };
}

/** Seviye ilerleme orani (0..1); son seviyede 1. */
export function seviyeOrani(
  d: Pick<MotivasyonDurumu, 'toplam_xp' | 'seviye_baslangic_xp' | 'sonraki_seviye_xp'>,
): number {
  if (d.sonraki_seviye_xp === null) return 1;
  const aralik = d.sonraki_seviye_xp - d.seviye_baslangic_xp;
  if (aralik <= 0) return 1;
  return Math.min(Math.max((d.toplam_xp - d.seviye_baslangic_xp) / aralik, 0), 1);
}
