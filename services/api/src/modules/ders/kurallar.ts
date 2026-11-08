/**
 * Gec iptal kurali. Esik (saat) kurumun kredi politikasindan gelir (`finans`: `gecIptalSaatiBul`,
 * `kredi_politikalari.gec_iptal_saat`, varsayilan 24); bu dosya yalniz karsilastirmayi yapar, hicbir
 * cagri yeri saat degerini kendisi yazmaz.
 */

/** Ogrenci iptali `baslangicAt`e `esikSaat` saatten az kala (ya da sonra) yapildiysa true. */
export function gecIptalMi(baslangicAt: Date, simdi: Date, esikSaat: number): boolean {
  return baslangicAt.getTime() - simdi.getTime() < esikSaat * 3_600_000;
}
