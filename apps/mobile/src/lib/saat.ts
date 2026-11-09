/**
 * Kurumun saat dilimine gore tarih/saat islemleri. Cihaz saat dilimine GUVENILMEZ: tum yerel
 * gosterim ve gun sinirlari `Intl.DateTimeFormat({ timeZone })` ile hesaplanir.
 * Tarih `YYYY-MM-DD`, saat `SS:DD` (24 saat), anlar ISO-8601 UTC metnidir.
 */

export const VARSAYILAN_SAAT_DILIMI = 'Europe/Istanbul';

interface Parcalar {
  y: number;
  m: number;
  d: number;
  sa: number;
  dk: number;
  sn: number;
}

const bicimleyiciler = new Map<string, Intl.DateTimeFormat>();

function bicimleyici(tz: string): Intl.DateTimeFormat {
  let f = bicimleyiciler.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    bicimleyiciler.set(tz, f);
  }
  return f;
}

function yerelParcalar(ms: number, tz: string): Parcalar {
  const p: Record<string, number> = {};
  for (const x of bicimleyici(tz).formatToParts(new Date(ms))) {
    if (x.type !== 'literal') p[x.type] = Number(x.value);
  }
  return {
    y: p.year ?? 1970,
    m: p.month ?? 1,
    d: p.day ?? 1,
    sa: (p.hour ?? 0) % 24,
    dk: p.minute ?? 0,
    sn: p.second ?? 0,
  };
}

/** Yerel duvar saati ile UTC arasindaki fark (ms): yerel = utc + ofset. */
function ofset(ms: number, tz: string): number {
  const p = yerelParcalar(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.sa, p.dk, p.sn) - Math.floor(ms / 1000) * 1000;
}

const iki = (n: number) => String(n).padStart(2, '0');

/** Aninin kurum saat dilimindeki yerel gunu (`YYYY-MM-DD`). */
export function yerelTarih(an: string | number, tz: string): string {
  const p = yerelParcalar(typeof an === 'number' ? an : Date.parse(an), tz);
  return `${String(p.y)}-${iki(p.m)}-${iki(p.d)}`;
}

/** Aninin kurum saat dilimindeki yerel saati (`SS:DD`). */
export function yerelSaat(an: string | number, tz: string): string {
  const p = yerelParcalar(typeof an === 'number' ? an : Date.parse(an), tz);
  return `${iki(p.sa)}:${iki(p.dk)}`;
}

/** Kurum yerel tarih+saatini UTC anina (ISO) cevirir (yaz saati gecisine dayanikli). */
export function yerelDenUtc(tarih: string, saat: string, tz: string): string {
  const [y, m, d] = tarih.split('-').map(Number) as [number, number, number];
  const [sa, dk] = saat.split(':').map(Number) as [number, number];
  const naif = Date.UTC(y, m - 1, d, sa, dk);
  let utc = naif - ofset(naif, tz);
  utc = naif - ofset(utc, tz);
  return new Date(utc).toISOString();
}

/** `n` gun sonraki (ya da onceki) tarih. */
export function tarihEkle(tarih: string, n: number): string {
  const [y, m, d] = tarih.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Yerel gunun UTC sinirlari: [baslangic, bitis). */
export function gunAraligi(tarih: string, tz: string): { baslangic: string; bitis: string } {
  return {
    baslangic: yerelDenUtc(tarih, '00:00', tz),
    bitis: yerelDenUtc(tarihEkle(tarih, 1), '00:00', tz),
  };
}

export function bugunTarihi(tz: string, simdi: number = Date.now()): string {
  return yerelTarih(simdi, tz);
}

const GUNLER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type GunKodu = (typeof GUNLER)[number];

/** Tarihin haftanin gunu (RFC 5545 kodu). */
export function haftaninGunu(tarih: string): GunKodu {
  const [y, m, d] = tarih.split('-').map(Number) as [number, number, number];
  const g = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Pazar
  return GUNLER[(g + 6) % 7] ?? 'MO';
}

function utcOgle(tarih: string): Date {
  return new Date(`${tarih}T12:00:00Z`);
}

/** "Pazartesi, 9 Kasim" */
export function gunBasligi(tarih: string): string {
  try {
    return utcOgle(tarih).toLocaleDateString('tr-TR', {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return tarih;
  }
}

/** Gun seridi icin kisa gun adi: "Pzt". */
export function gunKisa(tarih: string): string {
  try {
    return utcOgle(tarih).toLocaleDateString('tr-TR', { timeZone: 'UTC', weekday: 'short' });
  } catch {
    return '';
  }
}

export function gunNumarasi(tarih: string): number {
  return Number(tarih.slice(8, 10));
}

/** "14:00-15:00" (kurum saat diliminde). */
export function saatAraligi(baslangic: string, bitis: string, tz: string): string {
  return `${yerelSaat(baslangic, tz)}–${yerelSaat(bitis, tz)}`;
}

/** "9 Kas 14:30" (kurum saat diliminde). */
export function kisaZaman(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      timeZone: tz,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Dakika farki (bitis - baslangic). */
export function sureDakika(baslangic: string, bitis: string): number {
  return Math.round((Date.parse(bitis) - Date.parse(baslangic)) / 60_000);
}

/** Gecerli `YYYY-MM-DD` mi (gercek takvim gunu)? */
export function tarihGecerliMi(metin: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metin)) return false;
  return tarihEkle(metin, 0) === metin;
}

/** Gecerli `SS:DD` mi? */
export function saatGecerliMi(metin: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(metin);
}
