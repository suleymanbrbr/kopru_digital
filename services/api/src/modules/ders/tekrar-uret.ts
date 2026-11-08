import { TEKRAR_GUNLERI, type TekrarKurali } from '@kopru/contracts';

import { haftaninGunu, tarihEkle } from './zaman.js';

export interface TekrarGirdisi {
  kural: TekrarKurali;
  /** Yerel baslangic gunu (`YYYY-MM-DD`); ilk ders bu gune veya sonrasina duser. */
  baslangicTarihi: string;
  bitisTarihi: string | null;
  adet: number | null;
  /** Uretimin ust sinir gunu (dahil). */
  ufukTarihi: string;
}

export interface TekrarOlusumu {
  /** Serideki 0 tabanli sira; baslangictan itibaren tum olusumlar sayilir (ufuktan bagimsiz). */
  sira: number;
  tarih: string;
}

export interface TekrarSonucu {
  olusumlar: TekrarOlusumu[];
  /** Seri sona erdi: adet doldu ya da bitis tarihi gecildi (ufuk yuzunden kesilmedi). */
  bitti: boolean;
}

const MAKS_ADIM = 5000;

/**
 * Tekrar kuralindan yerel tarihleri uretir (saf, deterministik). `sira` ufuk degisse de ayni tarih
 * icin ayni kalir; boylece `UNIQUE (seri_id, seri_sirasi)` seri uretimini idempotent yapar.
 *
 * - DAILY: baslangictan itibaren her `interval` gunde bir; `BYDAY` varsa yalniz o gunler (suzgec).
 * - WEEKLY: baslangic haftasindan (Pazartesi) itibaren her `interval` haftada, `BYDAY` gunlerinde
 *   (bos: baslangic gununun haftanin gunu); baslangictan onceki gunler atlanir.
 */
export function tekrarOlusumlari(g: TekrarGirdisi): TekrarSonucu {
  const adaylar = function* (): Generator<string> {
    if (g.kural.freq === 'DAILY') {
      for (let k = 0; k < MAKS_ADIM; k++) {
        const tarih = tarihEkle(g.baslangicTarihi, k * g.kural.interval);
        const gun = TEKRAR_GUNLERI[haftaninGunu(tarih)];
        if (g.kural.byday.length === 0 || (gun && g.kural.byday.includes(gun))) yield tarih;
      }
      return;
    }
    const gunler =
      g.kural.byday.length > 0
        ? g.kural.byday.map((b) => TEKRAR_GUNLERI.indexOf(b))
        : [haftaninGunu(g.baslangicTarihi)];
    const hafta0 = tarihEkle(g.baslangicTarihi, -haftaninGunu(g.baslangicTarihi));
    for (let w = 0; w < MAKS_ADIM; w++) {
      const haftaBasi = tarihEkle(hafta0, w * g.kural.interval * 7);
      for (const gun of gunler) {
        const tarih = tarihEkle(haftaBasi, gun);
        if (tarih >= g.baslangicTarihi) yield tarih;
      }
    }
  };

  const olusumlar: TekrarOlusumu[] = [];
  let sira = 0;
  for (const tarih of adaylar()) {
    if (g.adet !== null && sira >= g.adet) return { olusumlar, bitti: true };
    if (g.bitisTarihi !== null && tarih > g.bitisTarihi) return { olusumlar, bitti: true };
    if (tarih > g.ufukTarihi) return { olusumlar, bitti: false };
    olusumlar.push({ sira, tarih });
    sira++;
    if (g.adet !== null && sira >= g.adet) return { olusumlar, bitti: true };
  }
  return { olusumlar, bitti: false };
}
