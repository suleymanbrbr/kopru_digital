import type { AbonelikOzeti } from '../api/abonelikTipleri';

export interface AktivasyonSecenekleri {
  getir: () => Promise<AbonelikOzeti>;
  /** Beklenen duruma ulasildi mi. */
  tamam: (o: AbonelikOzeti) => boolean;
  /** En cok bu kadar ms yoklanir (varsayilan 15 sn). */
  sureMs?: number;
  araMs?: number;
  simdi?: () => number;
  bekle?: (ms: number) => Promise<void>;
}

export type AktivasyonSonucu =
  { durum: 'tamam'; ozet: AbonelikOzeti } | { durum: 'zaman_asimi'; ozet: AbonelikOzeti | null };

export const AKTIVASYON_SURESI_MS = 15_000;
export const AKTIVASYON_ARALIGI_MS = 1_000;

/**
 * Satin alma sonrasi sunucuda aktivasyonu bekler: RevenueCat webhook'u gelene dek kisa
 * araliklarla `GET .../abonelik` yoklanir. Sure dolarsa "isleniyor" durumu doner (hata degil:
 * webhook gec gelebilir, abonelik sonradan aktif olur). Gecici ag hatalari yoklamayi bozmaz.
 */
export async function aktivasyonuBekle(s: AktivasyonSecenekleri): Promise<AktivasyonSonucu> {
  const simdi = s.simdi ?? (() => Date.now());
  const bekle = s.bekle ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const sure = s.sureMs ?? AKTIVASYON_SURESI_MS;
  const ara = s.araMs ?? AKTIVASYON_ARALIGI_MS;
  const baslangic = simdi();
  let son: AbonelikOzeti | null = null;
  for (;;) {
    try {
      son = await s.getir();
      if (s.tamam(son)) return { durum: 'tamam', ozet: son };
    } catch {
      // gecici hata: sure dolana dek denemeye devam
    }
    if (simdi() - baslangic + ara > sure) return { durum: 'zaman_asimi', ozet: son };
    await bekle(ara);
  }
}
