/**
 * Deneme neti: yalniz GOSTERIM icin onizleme. Net degeri sunucudan gelir (veritabani uretilmis sutunu);
 * burada ayni formul tam sayi aritmetigiyle uygulanir (katsayi 4 ondalik), kayan nokta hatasi olmaz.
 */

/** `dogru - yanlis * katsayi`, 2 ondalik. LGS 20d/3y -> 19.00; 1y -> 19.67; TYT 40d/4y -> 39.00. */
export function netHesapla(dogru: number, yanlis: number, katsayi: number): number {
  const kat = Math.round(katsayi * 10_000);
  return Math.round((dogru * 10_000 - yanlis * kat) / 100) / 100;
}

/** 2 ondalik, Turkce ayracli net metni (`19,67`). */
export function netMetni(net: number): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.round(net * 100) / 100);
}

export type BolumHatasi = 'sayi' | 'asiyor' | 'bosToplam' | null;

/** Bos metin 0 sayilir; tam sayi degilse ya da toplam sorulari asarsa hata anahtari doner. */
export function bolumDogrula(
  soruSayisi: number,
  dogru: string,
  yanlis: string,
  bos: string,
): BolumHatasi {
  const s = (v: string) => (v.trim() === '' ? 0 : Number(v));
  const [d, y, b] = [s(dogru), s(yanlis), s(bos)];
  if (![d, y, b].every((x) => Number.isInteger(x) && x >= 0)) return 'sayi';
  if (d + y > soruSayisi) return 'asiyor';
  if (bos.trim() !== '' && d + y + b !== soruSayisi) return 'bosToplam';
  return null;
}

/** Girilen metinden `bos` hesaplar (soru - dogru - yanlis); gecersizse `null`. */
export function bosHesapla(soruSayisi: number, dogru: string, yanlis: string): number | null {
  const d = dogru.trim() === '' ? 0 : Number(dogru);
  const y = yanlis.trim() === '' ? 0 : Number(yanlis);
  if (!Number.isInteger(d) || !Number.isInteger(y) || d < 0 || y < 0 || d + y > soruSayisi) {
    return null;
  }
  return soruSayisi - d - y;
}
