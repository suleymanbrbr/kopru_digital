import type { MotivasyonOgrenciDurumu } from '@kopru/contracts';

/** XP farki hesabi icin gereken en az durum (ogrenci durumunun alt kumesi). */
export type XpAnligi = Pick<MotivasyonOgrenciDurumu, 'toplam_xp' | 'seviye'> & {
  karakter?: { asama: number } | null;
};

export interface XpFarki {
  /** Kazanilan XP (her zaman pozitif). */
  xp: number;
  seviyeAtladi: boolean;
  yeniSeviye: number;
  /** Karakter yeni asamaya gecti (evrim). */
  evrim: boolean;
  yeniAsama: number | null;
}

/**
 * Iki anlik arasindaki XP farki. Fark yoksa (ya da ters kayit yuzunden azaldiysa) ve seviye/asama
 * degismediyse `null`: o zaman kullaniciya gosterilecek bir sey yoktur.
 */
export function xpFarki(once: XpAnligi | undefined, sonra: XpAnligi): XpFarki | null {
  if (!once) return null;
  const xp = sonra.toplam_xp - once.toplam_xp;
  const seviyeAtladi = sonra.seviye > once.seviye;
  const evrim =
    once.karakter != null && sonra.karakter != null && sonra.karakter.asama > once.karakter.asama;
  if (xp <= 0 && !seviyeAtladi && !evrim) return null;
  return {
    xp: Math.max(0, xp),
    seviyeAtladi,
    yeniSeviye: sonra.seviye,
    evrim,
    yeniAsama: evrim ? (sonra.karakter?.asama ?? null) : null,
  };
}

/** Sonraki seviyeye ilerleme: yuzde (0-100), kalan XP; son seviyede `tamam`. */
export function seviyeIlerlemesi(
  d: Pick<
    MotivasyonOgrenciDurumu,
    'toplam_xp' | 'seviye_baslangic_xp' | 'sonraki_seviye_xp' | 'sonraki_seviyeye_kalan'
  >,
): { yuzde: number; kalan: number | null; tamam: boolean } {
  if (d.sonraki_seviye_xp === null) return { yuzde: 100, kalan: null, tamam: true };
  const aralik = d.sonraki_seviye_xp - d.seviye_baslangic_xp;
  const ilerleme = d.toplam_xp - d.seviye_baslangic_xp;
  const yuzde = aralik > 0 ? Math.round((ilerleme / aralik) * 100) : 0;
  return {
    yuzde: Math.min(100, Math.max(0, yuzde)),
    kalan: d.sonraki_seviyeye_kalan ?? Math.max(0, d.sonraki_seviye_xp - d.toplam_xp),
    tamam: false,
  };
}

/** Gunluk tavan ilerlemesi (kullanilan / ust sinir), 0-100. */
export function yuzde(deger: number, ust: number): number {
  return ust > 0 ? Math.min(100, Math.max(0, Math.round((deger / ust) * 100))) : 0;
}

const XP_OLASI: readonly { servis: string; yontem: string; desen: RegExp }[] = [
  // Plan gorevi gerceklesen miktar
  { servis: 'ogrenme', yontem: 'PUT', desen: /^kurumlar\/[^/]+\/gorevler\/[^/]+\/gerceklesen$/ },
  // Odev teslim
  {
    servis: 'ogrenme',
    yontem: 'POST',
    desen: /^kurumlar\/[^/]+\/ogrenci-odevleri\/[^/]+\/teslim$/,
  },
  // Soru sor ve "anladim"
  { servis: 'ogrenme', yontem: 'POST', desen: /^kurumlar\/[^/]+\/sorular$/ },
  { servis: 'ogrenme', yontem: 'POST', desen: /^kurumlar\/[^/]+\/sorular\/[^/]+\/anladim$/ },
  // Ders sonu geri bildirim
  { servis: 'ders', yontem: 'PUT', desen: /^kurumlar\/[^/]+\/dersler\/[^/]+\/geri-bildirim$/ },
  // Kayit izleme
  { servis: 'ders', yontem: 'POST', desen: /^kurumlar\/[^/]+\/kayitlarim\/[^/]+\/izledim$/ },
  // Odak bitisi
  {
    servis: 'motivasyon',
    yontem: 'POST',
    desen: /^kurumlar\/[^/]+\/odak-oturumlari\/[^/]+\/bitir$/,
  },
];

/** Bu basarili istek ogrenciye XP kazandirmis olabilir mi? (geri bildirim tetikleyicisi) */
export function xpOlasiMi(servis: string, yontem: string, yol: string): boolean {
  const y = yontem.toUpperCase();
  return XP_OLASI.some((o) => o.servis === servis && o.yontem === y && o.desen.test(yol));
}

/** Pencere olayinin adi: `servisIstek` basarili bir XP'li eylemden sonra bunu yayar. */
export const XP_OLAYI = 'kopru:xp-olasi';

/** `benim` yeniden cekme araligi (ms): sunucu XP'yi olay isleyicisiyle gecikmeli yazabilir. */
export const XP_YENIDEN_CEKME_MS: readonly number[] = [900, 2000, 4000, 7000];
