import type { Rol, Uyelik } from '../api/tipler';

/** Ayni bireysel kurumda birden fazla uyelik varsa hangisi secilir: sahip > yonetici > ogretmen... */
const ONCELIK: Record<Rol, number> = { sahip: 0, yonetici: 1, ogretmen: 2, ogrenci: 3, veli: 4 };

/**
 * Kurum secimi listesi. Bireysel kurumda (`kurumTur === 'bireysel'`, solo hoca) kurum basina TEK
 * satir gosterilir ve sahip uyeligi secilir: "Ogretmen" uyeligi atama olmadigi icin ogrencileri
 * gostermez. Diger kurum turlerinde her uyelik ayri satirdir (rol farki anlamlidir).
 */
export function kurumSecenekleri<T extends Uyelik>(uyelikler: readonly T[]): T[] {
  const sonuc: T[] = [];
  const bireysel = new Map<string, number>();
  for (const u of uyelikler) {
    if (u.kurumTur !== 'bireysel') {
      sonuc.push(u);
      continue;
    }
    const idx = bireysel.get(u.kurumId);
    if (idx === undefined) {
      bireysel.set(u.kurumId, sonuc.length);
      sonuc.push(u);
      continue;
    }
    const mevcut = sonuc[idx];
    if (mevcut && ONCELIK[u.rol] < ONCELIK[mevcut.rol]) sonuc[idx] = u;
  }
  return sonuc;
}
