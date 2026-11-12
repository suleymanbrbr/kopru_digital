import type { GeriBildirimDeger } from '@kopru/contracts';

import { bugunYerel, tarihEkle } from '@/lib/saat';

export const GERI_BILDIRIM_DEGERLERI = [
  'anladim',
  'kismen',
  'anlamadim',
] as const satisfies readonly GeriBildirimDeger[];

/** 0-1 orani `%85` metnine cevirir. */
export function yuzdeYaz(oran: number): string {
  return `%${String(Math.round(oran * 100))}`;
}

/** Bugun dahil son `gun` gunluk tarih araligi (kurum yerel gunu). */
export function sonGunlerAraligi(
  gun: number,
  saatDilimi: string,
  simdi: Date = new Date(),
): { baslangic: string; bitis: string } {
  const bitis = bugunYerel(saatDilimi, simdi);
  return { baslangic: tarihEkle(bitis, -(gun - 1)), bitis };
}

/** Geri bildirim penceresi dolmadan mi (`son_verme_at` henuz gecmedi)? */
export function degistirilebilirMi(sonVermeAt: string, simdi: number = Date.now()): boolean {
  return Date.parse(sonVermeAt) > simdi;
}

/** Sayilardan oran (toplam 0 ise hepsi 0); sunucu orani yoksa (ders ozeti) istemcide hesaplanir. */
export function oranlar(sayilar: { anladim: number; kismen: number; anlamadim: number }) {
  const toplam = sayilar.anladim + sayilar.kismen + sayilar.anlamadim;
  const o = (n: number) => (toplam === 0 ? 0 : n / toplam);
  return {
    anladim: o(sayilar.anladim),
    kismen: o(sayilar.kismen),
    anlamadim: o(sayilar.anlamadim),
  };
}
