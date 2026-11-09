/**
 * Hafta ve saat dilimi yardimcilari. Tarayicinin saat dilimine guvenilmez: tum yerel gosterim ve
 * hesaplar kurumun `saat_dilimi` (IANA) ile yapilir. Yerel tarihler `YYYY-MM-DD`, saatler `SS:DD`.
 */

export const VARSAYILAN_SAAT_DILIMI = 'Europe/Istanbul';
const GUN_MS = 86_400_000;

function parcalar(an: Date, saatDilimi: string) {
  const bicim = new Intl.DateTimeFormat('en-CA', {
    timeZone: saatDilimi,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const harita: Record<string, string> = {};
  for (const p of bicim.formatToParts(an)) harita[p.type] = p.value;
  return {
    y: Number(harita.year),
    a: Number(harita.month),
    g: Number(harita.day),
    sa: Number(harita.hour),
    dk: Number(harita.minute),
    sn: Number(harita.second),
  };
}

const iki = (n: number) => String(n).padStart(2, '0');

/** UTC aninin yerel tarihi (`YYYY-MM-DD`). */
export function yerelTarih(iso: string | Date, saatDilimi: string): string {
  const p = parcalar(typeof iso === 'string' ? new Date(iso) : iso, saatDilimi);
  return `${String(p.y)}-${iki(p.a)}-${iki(p.g)}`;
}

/** UTC aninin yerel saati (`SS:DD`). */
export function yerelSaat(iso: string | Date, saatDilimi: string): string {
  const p = parcalar(typeof iso === 'string' ? new Date(iso) : iso, saatDilimi);
  return `${iki(p.sa)}:${iki(p.dk)}`;
}

/** Saat diliminin o andaki UTC'den farki (ms). */
function sapma(an: Date, saatDilimi: string): number {
  const p = parcalar(an, saatDilimi);
  return Date.UTC(p.y, p.a - 1, p.g, p.sa, p.dk, p.sn) - Math.floor(an.getTime() / 1000) * 1000;
}

/** Yerel tarih + saati UTC ISO'ya cevirir (yaz saati gecisine dayanikli). */
export function yerelUtc(tarih: string, saat: string, saatDilimi: string): string {
  const [y, a, g] = tarih.split('-').map(Number);
  const [sa, dk] = saat.split(':').map(Number);
  const duvar = Date.UTC(y ?? 1970, (a ?? 1) - 1, g ?? 1, sa ?? 0, dk ?? 0);
  let tahmin = duvar - sapma(new Date(duvar), saatDilimi);
  tahmin = duvar - sapma(new Date(tahmin), saatDilimi);
  return new Date(tahmin).toISOString();
}

export function tarihEkle(tarih: string, gun: number): string {
  return new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_MS).toISOString().slice(0, 10);
}

/** 0 = Pazartesi ... 6 = Pazar. */
export function haftaninGunu(tarih: string): number {
  return (new Date(`${tarih}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Tarihin ait oldugu haftanin Pazartesi'si. */
export function haftaBasi(tarih: string): string {
  return tarihEkle(tarih, -haftaninGunu(tarih));
}

/** Haftanin 7 gunu (Pazartesi baslangic). */
export function haftaGunleri(haftaBasiTarihi: string): string[] {
  return Array.from({ length: 7 }, (_, i) => tarihEkle(haftaBasiTarihi, i));
}

/** Haftanin UTC sorgu araligi: yerel Pazartesi 00:00 - sonraki Pazartesi 00:00. */
export function haftaAraligi(haftaBasiTarihi: string, saatDilimi: string) {
  return {
    baslangic: yerelUtc(haftaBasiTarihi, '00:00', saatDilimi),
    bitis: yerelUtc(tarihEkle(haftaBasiTarihi, 7), '00:00', saatDilimi),
  };
}

export function bugunYerel(saatDilimi: string, simdi: Date = new Date()): string {
  return yerelTarih(simdi, saatDilimi);
}

/** `2026-11-09` -> "9 Kasım Pazartesi". */
export function gunEtiketi(tarih: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(new Date(`${tarih}T00:00:00Z`));
}

export function kisaGunEtiketi(tarih: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${tarih}T00:00:00Z`));
}

export function haftaEtiketi(haftaBasiTarihi: string): string {
  const bicim = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  });
  const bas = new Date(`${haftaBasiTarihi}T00:00:00Z`);
  const son = new Date(`${tarihEkle(haftaBasiTarihi, 6)}T00:00:00Z`);
  return `${bicim.format(bas)} - ${bicim.format(son)}`;
}

/** Yerel gun + saat araligi etiketi: "16:00-17:00". */
export function saatAraligi(baslangic: string, bitis: string, saatDilimi: string): string {
  return `${yerelSaat(baslangic, saatDilimi)}-${yerelSaat(bitis, saatDilimi)}`;
}

/** Iki an arasi dakika. */
export function sureDakika(baslangic: string, bitis: string): number {
  return Math.round((Date.parse(bitis) - Date.parse(baslangic)) / 60_000);
}

/** `YYYY-MM` (yerel ay). */
export function yerelAy(saatDilimi: string, simdi: Date = new Date()): string {
  return yerelTarih(simdi, saatDilimi).slice(0, 7);
}
