/**
 * Gec iptal esigi (saat).
 *
 * Bu paket icin SABIT 24 saattir: ogrenci kaynakli bir iptal, ders baslangicina 24 saatten az kala
 * yapildiysa `gec_iptal = true` olur. Sonraki paket bu fonksiyonu `finans` politikasina (kurumun
 * iptal/ucret kurali, kredi dusumu) baglayacak; bu yuzden esik tek bir yerde, bir fonksiyondadir ve
 * hicbir cagri yeri 24 degerini kendisi yazmaz. Bu pakette kredi/ucret etkisi YOKTUR.
 */
export function gecIptalSaati(): number {
  return 24;
}

/** Ogrenci iptali `baslangicAt`e `gecIptalSaati()` saatten az kala (ya da sonra) yapildiysa true. */
export function gecIptalMi(baslangicAt: Date, simdi: Date): boolean {
  return baslangicAt.getTime() - simdi.getTime() < gecIptalSaati() * 3_600_000;
}
