import { t } from '@kopru/i18n';

const DK = 60_000;
const SA = 3_600_000;
const GUN = 86_400_000;

/** Yerel (saat dilimine gore) takvim gunu numarasi; "dun" ayrimi icin. */
function takvimGunu(ms: number, saatDilimi: string): number {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: saatDilimi,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
  return Math.floor(Date.parse(`${p}T00:00:00Z`) / GUN);
}

/**
 * Goreli zaman (Turkce): az once, N dk once, N sa once, dun, N gun once; 7 gunden eskisi tarih.
 * `simdi` ve `saatDilimi` parametreleri testte sabitlenir.
 */
export function goreliZaman(
  iso: string,
  simdi: number = Date.now(),
  saatDilimi = 'Europe/Istanbul',
): string {
  const an = Date.parse(iso);
  if (Number.isNaN(an)) return '';
  const fark = simdi - an;
  if (fark < DK) return t('bildirim.zaman.azOnce');
  if (fark < SA) return t('bildirim.zaman.dakika', { n: Math.floor(fark / DK) });
  const gunFarki = takvimGunu(simdi, saatDilimi) - takvimGunu(an, saatDilimi);
  if (gunFarki <= 0) return t('bildirim.zaman.saat', { n: Math.floor(fark / SA) });
  if (gunFarki === 1) return t('bildirim.zaman.dun');
  if (gunFarki < 7) return t('bildirim.zaman.gun', { n: gunFarki });
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeZone: saatDilimi }).format(
    new Date(an),
  );
}
