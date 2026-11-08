/**
 * Saat dilimi donusumleri (saf fonksiyonlar, yeni bagimlilik yok; `Intl.DateTimeFormat`).
 * Seri dersleri yerel tarih+saat olarak tanimlanir ve her ders icin `saat_dilimi`ne gore UTC'ye cevrilir;
 * boylece yaz saati gecislerinde yerel saat sabit kalir (UTC anlari kayar).
 */

const bicimleyiciler = new Map<string, Intl.DateTimeFormat>();

function bicimleyici(saatDilimi: string): Intl.DateTimeFormat {
  let b = bicimleyiciler.get(saatDilimi);
  if (!b) {
    b = new Intl.DateTimeFormat('en-US', {
      timeZone: saatDilimi,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    bicimleyiciler.set(saatDilimi, b);
  }
  return b;
}

/** Gecerli bir IANA saat dilimi mi? */
export function saatDilimiGecerliMi(saatDilimi: string): boolean {
  try {
    bicimleyici(saatDilimi);
    return true;
  } catch {
    return false;
  }
}

interface YerelParcalar {
  yil: number;
  ay: number;
  gun: number;
  saat: number;
  dakika: number;
  saniye: number;
}

function yerelParcalar(ms: number, saatDilimi: string): YerelParcalar {
  const deger: Record<string, number> = {};
  for (const p of bicimleyici(saatDilimi).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') deger[p.type] = Number(p.value);
  }
  return {
    yil: deger.year ?? 0,
    ay: deger.month ?? 0,
    gun: deger.day ?? 0,
    saat: deger.hour ?? 0,
    dakika: deger.minute ?? 0,
    saniye: deger.second ?? 0,
  };
}

/** Anin yerel "duvar saati"ni UTC gibi okunmus milisaniye olarak verir. */
function duvarMs(ms: number, saatDilimi: string): number {
  const p = yerelParcalar(ms, saatDilimi);
  return Date.UTC(p.yil, p.ay - 1, p.gun, p.saat, p.dakika, p.saniye);
}

/** UTC'den farki (ms): yerel duvar saati - UTC. Dogu dilimleri pozitif. */
function ofsetMs(ms: number, saatDilimi: string): number {
  return duvarMs(ms, saatDilimi) - Math.floor(ms / 1000) * 1000;
}

const TARIH_DESENI = /^(\d{4})-(\d{2})-(\d{2})$/;
const SAAT_DESENI = /^(\d{2}):(\d{2})(?::\d{2})?$/;

/**
 * Yerel tarih + saati UTC ani olarak cevirir.
 * - Normal gun: tek sonuc.
 * - Yaz saatine ileri gecis (var olmayan saat, orn. Berlin 02:30): gecisten sonraki saate kaydirilir (03:30).
 * - Geri gecis (iki kez yasanan saat): ilk yasanan an secilir.
 */
export function yerelDenUtc(tarih: string, saat: string, saatDilimi: string): Date {
  const t = TARIH_DESENI.exec(tarih);
  const s = SAAT_DESENI.exec(saat);
  if (!t || !s) throw new Error(`Geçersiz yerel zaman: ${tarih} ${saat}`);
  const duvar = Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]), Number(s[1]), Number(s[2]));
  const gunMs = 86_400_000;
  const once = ofsetMs(duvar - gunMs, saatDilimi);
  const sonra = ofsetMs(duvar + gunMs, saatDilimi);
  const adaylar = [...new Set([duvar - once, duvar - sonra])].filter(
    (a) => duvarMs(a, saatDilimi) === duvar,
  );
  if (adaylar.length === 0) return new Date(duvar - once); // bosluk: gecis oncesi ofsetle ileri kayar
  return new Date(Math.min(...adaylar));
}

/** UTC anini kurumun yerel tarih ve saatine cevirir (`YYYY-MM-DD`, `HH:MM`). */
export function utcdenYerel(an: Date, saatDilimi: string): { tarih: string; saat: string } {
  const p = yerelParcalar(an.getTime(), saatDilimi);
  const iki = (n: number) => String(n).padStart(2, '0');
  return {
    tarih: `${String(p.yil).padStart(4, '0')}-${iki(p.ay)}-${iki(p.gun)}`,
    saat: `${iki(p.saat)}:${iki(p.dakika)}`,
  };
}

/** `YYYY-MM-DD` tarihine gun ekler (UTC takvim aritmetigi, saat dilimi etkisiz). */
export function tarihEkle(tarih: string, gun: number): string {
  const t = TARIH_DESENI.exec(tarih);
  if (!t) throw new Error(`Geçersiz tarih: ${tarih}`);
  const d = new Date(Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]) + gun));
  return d.toISOString().slice(0, 10);
}

/** 0 = Pazartesi ... 6 = Pazar. */
export function haftaninGunu(tarih: string): number {
  const t = TARIH_DESENI.exec(tarih);
  if (!t) throw new Error(`Geçersiz tarih: ${tarih}`);
  const jsGun = new Date(Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]))).getUTCDay();
  return (jsGun + 6) % 7;
}

/** Yerel takvimde bugunun tarihi. */
export function bugunYerel(saatDilimi: string, simdi: Date = new Date()): string {
  return utcdenYerel(simdi, saatDilimi).tarih;
}
