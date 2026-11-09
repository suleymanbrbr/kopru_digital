import { tlMetniniKurusaCevir } from '@kopru/i18n';

export type RozetDurumu = 'yok' | 'dusuk' | 'bitti';

/**
 * Kalan ders rozeti: `kalan <= 0` kirmizi ("bitti"), `kalan <= esik` sari ("dusuk"), aksi rozet yok.
 * Renk tek sinyal degildir: arayuz metin ve ikon da gosterir. Yalniz paket modelinde anlamlidir.
 */
export function rozetDurumu(kalan: number, esik: number): RozetDurumu {
  if (kalan <= 0) return 'bitti';
  if (kalan <= esik) return 'dusuk';
  return 'yok';
}

export type TutarSonucu = { ok: true; kurus: number } | { ok: false; hata: 'bos' | 'gecersiz' };

/** Kullanicinin yazdigi TL tutari; kayan nokta yok. Sifir ve negatif gecersizdir. */
export function tutarCoz(metin: string): TutarSonucu {
  if (metin.trim() === '') return { ok: false, hata: 'bos' };
  const kurus = tlMetniniKurusaCevir(metin.trim());
  if (kurus === null || kurus <= 0) return { ok: false, hata: 'gecersiz' };
  return { ok: true, kurus };
}

/** `+90 532 111 22 33` / `0532...` -> wa.me icin yalniz rakam (E.164 rakamlari); gecersizse null. */
export function whatsappNumarasi(telefon: string | null): string | null {
  if (!telefon) return null;
  const rakam = telefon.replace(/\D/g, '');
  if (rakam.length === 10 && rakam.startsWith('5')) return `90${rakam}`;
  if (rakam.length === 11 && rakam.startsWith('05')) return `9${rakam}`;
  if (rakam.length >= 11 && rakam.length <= 15 && !rakam.startsWith('0')) return rakam;
  return null;
}

/** WhatsApp baglantisi; metin kullanicinin duzenledigi hazir metindir. */
export function whatsappBaglantisi(telefon: string | null, metin: string): string | null {
  const no = whatsappNumarasi(telefon);
  return no ? `https://wa.me/${no}?text=${encodeURIComponent(metin)}` : null;
}

/** Turkce siralama (`tr` locale): I/i, i/İ, ş, ç, ğ, ö, ü dogru siralanir. */
export function trSirala<T>(liste: readonly T[], anahtar: (x: T) => string): T[] {
  return [...liste].sort((a, b) => anahtar(a).localeCompare(anahtar(b), 'tr'));
}
