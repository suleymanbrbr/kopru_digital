import type { Deneme, DenemeKurali } from '../api/ogrenmeTipleri';

/**
 * Sartnamedeki tur sirasi (LGS, TYT, AYT, YDT, sonra ozel turler). Gecmisi olmayan ogrenci icin
 * varsayilan bu siradaki ilk kuraldir; katalog siralamasi (alfabetik) varsayilan sayilmaz.
 */
export const DENEME_TURU_SIRASI: readonly string[] = ['lgs', 'tyt', 'ayt', 'ydt'];

/**
 * Giris formunda on secili sinav turu: ogrencinin en son girdigi deneme turu (sinav tarihi en yeni;
 * esitlikte listedeki ilk). Gecmis yoksa ya da tur artik kurallarda yoksa sartname sirasindaki ilk kural.
 */
export function varsayilanKuralKodu(
  kurallar: readonly Pick<DenemeKurali, 'kod'>[],
  gecmis: readonly Pick<Deneme, 'kuralKodu' | 'sinavTarihi'>[] = [],
): string | undefined {
  const mevcut = new Set(kurallar.map((k) => k.kod));
  let enYeni: Pick<Deneme, 'kuralKodu' | 'sinavTarihi'> | undefined;
  for (const d of gecmis) {
    if (!mevcut.has(d.kuralKodu)) continue;
    if (!enYeni || d.sinavTarihi > enYeni.sinavTarihi) enYeni = d;
  }
  if (enYeni) return enYeni.kuralKodu;
  const sirali = DENEME_TURU_SIRASI.find((k) => mevcut.has(k));
  return sirali ?? kurallar[0]?.kod;
}
