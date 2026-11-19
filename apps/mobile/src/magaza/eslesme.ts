import type { AbonelikPeriyodu } from '../api/abonelikTipleri';

/**
 * Magaza urun kimligini plan koduna ve periyoda esler. Api `/planlar` yanitinda
 * `magaza_urun_kodlari` henuz donmedigi icin kural adlandirmadir: urun kimligi, plan kodunu bir
 * parca olarak icerir (`kopru.kurum.aylik`, Google icin `kopru_kurum:aylik`). Periyot parcasi
 * `yillik`/`yearly`/`annual` ise yillik, yoksa aylik sayilir.
 */
export function urundenPlan(
  urunId: string,
  planKodlari: readonly string[],
): { planKodu: string; periyot: AbonelikPeriyodu } | null {
  const parcalar = urunId
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const kod = planKodlari.find((k) => parcalar.includes(k.toLowerCase()));
  if (!kod) return null;
  const yillik = parcalar.some((p) => p === 'yillik' || p === 'yearly' || p === 'annual');
  return { planKodu: kod, periyot: yillik ? 'yillik' : 'aylik' };
}
