/**
 * Seviye egrisi (docs/schema/motivasyon.md "Seviye egrisi"). Migration'daki `motivasyon.seviyeler` tohumu bu
 * fonksiyonla uretilmis degerlerdir (`seviye-egrisi.test.ts` tohumun bu fonksiyonla ayni oldugunu denetler);
 * canlida degerler tabloda degistirilebilir, bu dosya yalniz tohumun ve hedef denetiminin kaynagidir.
 *
 * Hedefler (ozellik sartnamesi "XP ve seviye"): ilk gun seviye 3, ilk hafta seviye 5 (ilk evrim), duzenli
 * calisanda ~2 ayda seviye 12, ~4,5 ayda seviye 25, bir yilda seviye 40. Sabit gunluk hiz altinda bu
 * noktalar tek bir duzgun (maliyeti hep artan) egriye oturmaz; bu yuzden capa noktalarindan gecen, her
 * aralikta maliyeti artan parcali bir egri secildi (seviye 12'den sonra kisa bir "evrim sonrasi" ucuzlugu
 * vardir; ayrinti docs/schema/motivasyon.md).
 */

export const SEVIYE_SINIRI = 60;

/** [seviye, gereken toplam XP]. 1..5 elle (ilk gun ve ilk hafta hedefleri), sonrasi hedef gunlerden. */
export const SEVIYE_CAPALARI: readonly (readonly [number, number])[] = [
  [1, 0],
  [2, 20],
  [3, 60],
  [4, 170],
  [5, 380],
  [12, 3300],
  [25, 7500],
  [40, 20000],
];

/** Aralik ici maliyet artisi: `T(n) = T0 + dT * ((n - n0) / (n1 - n0)) ** US`. */
const ARALIK_US = 1.15;
/** Seviye 40'tan sonra (41..60) her seviyenin maliyeti bir oncekinin bu kati. */
const SONRASI_CARPAN = 1.06;

const yuvarla10 = (n: number) => Math.round(n / 10) * 10;

export interface SeviyeSatiri {
  seviye: number;
  gereken_toplam_xp: number;
}

export function seviyeEgrisi(): SeviyeSatiri[] {
  const toplam = new Map<number, number>(SEVIYE_CAPALARI);
  for (const [i, [n0, t0]] of SEVIYE_CAPALARI.entries()) {
    const sonraki = SEVIYE_CAPALARI[i + 1];
    if (!sonraki) break;
    const [n1, t1] = sonraki;
    for (let n = n0 + 1; n < n1; n++) {
      if (n0 < 5) continue; // 1..5 capalari elle verildi
      toplam.set(n, yuvarla10(t0 + (t1 - t0) * ((n - n0) / (n1 - n0)) ** ARALIK_US));
    }
  }
  let maliyet = (toplam.get(40) ?? 0) - (toplam.get(39) ?? 0);
  for (let n = 41; n <= SEVIYE_SINIRI; n++) {
    maliyet = yuvarla10(maliyet * SONRASI_CARPAN);
    toplam.set(n, (toplam.get(n - 1) ?? 0) + maliyet);
  }
  return Array.from({ length: SEVIYE_SINIRI }, (_, i) => ({
    seviye: i + 1,
    gereken_toplam_xp: toplam.get(i + 1) ?? 0,
  }));
}

/** Toplam XP'nin ulastirdigi en yuksek seviye. */
export function seviyeHesapla(egri: readonly SeviyeSatiri[], toplamXp: number): number {
  let seviye = 1;
  for (const s of egri) if (s.gereken_toplam_xp <= toplamXp) seviye = s.seviye;
  return seviye;
}
