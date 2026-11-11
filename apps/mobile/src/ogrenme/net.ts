import type { DenemeBolumGirdisi, DenemeKuraliBolumu } from '../api/ogrenmeTipleri';

/** Iki ondalik basamaga yuvarlar (sunucudaki `numeric(6,2)` ile ayni). */
export function yuvarla2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Net = dogru - yanlis * katsayi (LGS 0.3333, TYT/AYT/YDT 0.25), 2 ondalik.
 * Ornek: LGS 20 dogru 3 yanlis -> 19.00; 1 yanlis -> 19.67; TYT 40 dogru 4 yanlis -> 39.00.
 */
export function netHesapla(dogru: number, yanlis: number, yanlisKatsayisi: number): number {
  return yuvarla2(dogru - yanlis * yanlisKatsayisi);
}

/** Turkce gosterim: 19,67. */
export function netBicimle(net: number): string {
  return net.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type BolumHatasi = 'gecersiz' | 'asim' | 'toplam';

export type BolumSonucu =
  | { ok: true; girdi: DenemeBolumGirdisi; bos: number; net: number }
  | { ok: false; hata: BolumHatasi };

function tamSayi(metin: string): number | null {
  const m = metin.trim();
  if (m === '') return null;
  return /^\d{1,4}$/.test(m) ? Number(m) : Number.NaN;
}

/**
 * Bir bolumun girdisini dogrular: bos alanlar 0 sayilir; `bos` yazilmazsa
 * `soruSayisi - dogru - yanlis` hesaplanir; yazilirsa `dogru + yanlis + bos = soruSayisi` olmalidir.
 *  - `gecersiz`: sayi degil; `asim`: dogru + yanlis soru sayisini asiyor; `toplam`: bos ile toplam tutmuyor.
 */
export function bolumKur(
  bolum: Pick<DenemeKuraliBolumu, 'bolumKodu' | 'soruSayisi'>,
  dogruMetni: string,
  yanlisMetni: string,
  bosMetni: string,
  yanlisKatsayisi: number,
): BolumSonucu {
  const d = tamSayi(dogruMetni) ?? 0;
  const y = tamSayi(yanlisMetni) ?? 0;
  const bYazildi = tamSayi(bosMetni);
  if (Number.isNaN(d) || Number.isNaN(y) || (bYazildi !== null && Number.isNaN(bYazildi))) {
    return { ok: false, hata: 'gecersiz' };
  }
  if (d + y > bolum.soruSayisi) return { ok: false, hata: 'asim' };
  const bos = bYazildi ?? bolum.soruSayisi - d - y;
  if (d + y + bos !== bolum.soruSayisi) return { ok: false, hata: 'toplam' };
  return {
    ok: true,
    girdi: { bolumKodu: bolum.bolumKodu, dogru: d, yanlis: y, bos },
    bos,
    net: netHesapla(d, y, yanlisKatsayisi),
  };
}
