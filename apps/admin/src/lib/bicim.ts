const TARIH_SAAT = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});
const TARIH = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeZone: 'Europe/Istanbul',
});

/** ISO zamanini Istanbul saatiyle gosterir; gecersizse bos. */
export function tarihSaat(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : TARIH_SAAT.format(d);
}

export function tarih(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : TARIH.format(d);
}

/** Saniye -> `mm:ss` (negatif 00:00). */
export function dakikaSaniye(toplamSn: number): { dk: string; sn: string } {
  const s = Math.max(0, Math.floor(toplamSn));
  return { dk: String(Math.floor(s / 60)).padStart(2, '0'), sn: String(s % 60).padStart(2, '0') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidMi = (v: string): boolean => UUID.test(v.trim());

/** `datetime-local` degerini (yerel Istanbul zamani) ISO UTC'ye cevirir; bos/gecersiz `undefined`. */
export function yerelIso(deger: string): string | undefined {
  if (!deger) return undefined;
  // Tarayicinin saat dilimi yerine sabit Istanbul (UTC+3, DST yok) kullanilir.
  const d = new Date(`${deger}:00+03:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Kod gibi `snake_case` adi okunur hale getirir (bilinmeyen kural kodlari icin). */
export function kodAdi(kod: string): string {
  const s = kod.replace(/[_-]+/g, ' ');
  return s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);
}
