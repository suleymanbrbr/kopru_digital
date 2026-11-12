/**
 * Fotograf uzerine cizim modeli (saf mantik; Skia/React bagimliligi yok, birim testlidir).
 *
 * Kalici bicim (`cizim_verisi`, api'de serbest JSON, en cok 256 KB) — SURUM 1:
 *
 * ```json
 * {
 *   "v": 1,
 *   "oran": 1.3333,          // fotograf yuksekligi / genisligi (cizim koordinat uzayinin en-boy orani)
 *   "zamanli": true,          // true: noktalar (x, y, t) uclusu; false: (x, y) ikilisi
 *   "sure_ms": 42000,         // yalniz zamanli: son noktanin zamani (ses kaydi suresi en az bu kadardir)
 *   "cizgiler": [
 *     { "a": "kirmizi",       // arac: "kirmizi" | "mavi" | "siyah" | "silgi"
 *       "k": 60,              // kalinlik: fotograf genisliginin on binde biri
 *       "n": [120, 340, 0, 130, 352, 16, ...] }   // x ve y: 0..10000 (x genislige, y yukseklige gore), t: ms
 *   ]
 * }
 * ```
 *
 * `t` "mini anlatim"da ses kaydinin BASLANGICINA gore milisaniyedir: oynatici sesi calarken
 * `gorunenCizgiler(cizgiler, sesPozisyonuMs)` ile o ana kadar cizilen noktalari gosterir. Zaman
 * damgasi olmayan (yalniz cizimli fotograf) cevaplarda `zamanli` false'tur ve `t` yazilmaz.
 * Silgi cizgisi (`"a": "silgi"`) altindaki cizgileri piksel duzeyinde siler (cizim katmaninda
 * `clear` karisimi); fotograf etkilenmez. Bu bicim kendi basina gosterilebilir: duzlestirilmis gorsel
 * (`soru_cizim`) asil gosterimdir, vektor veri yalniz mini anlatim oynaticisi icindir.
 */

export const CIZIM_SURUMU = 1;
/** Koordinat izgarasi: x ve y 0..IZGARA arasi tam sayi. */
export const IZGARA = 10_000;
/** api siniri (`SORU_CIZIM_EN_FAZLA_BAYT`). */
export const CIZIM_EN_FAZLA_BAYT = 256 * 1024;

export type KalemRengi = 'kirmizi' | 'mavi' | 'siyah';
export type Arac = KalemRengi | 'silgi';
export const KALEM_RENKLERI: readonly KalemRengi[] = ['kirmizi', 'mavi', 'siyah'];
export const KALEM_HEX: Record<KalemRengi, string> = {
  kirmizi: '#E5383B',
  mavi: '#1D6FF2',
  siyah: '#111111',
};

/** Kalinlik on binde birler (fotograf genisligine gore). */
export const KALEM_KALINLIGI = 45;
export const SILGI_KALINLIGI = 220;

/** Calisma zamani noktasi: x, y 0..1 (genislik/yukseklige gore), t ms. */
export interface Nokta {
  x: number;
  y: number;
  t: number;
}

export interface Cizgi {
  arac: Arac;
  /** Fotograf genisliginin on binde biri. */
  kalinlik: number;
  noktalar: Nokta[];
}

export interface CizimVerisi {
  v: number;
  oran: number;
  zamanli: boolean;
  sure_ms?: number;
  cizgiler: { a: Arac; k: number; n: number[] }[];
}

export class CizimCokBuyukHatasi extends Error {
  constructor(readonly bayt: number) {
    super(`Cizim verisi ${String(bayt)} bayt; en cok ${String(CIZIM_EN_FAZLA_BAYT)}.`);
    this.name = 'CizimCokBuyukHatasi';
  }
}

// --- Geri al / yinele ---------------------------------------------------------------------

export interface CizimDurumu {
  cizgiler: readonly Cizgi[];
  /** Geri alinan cizgiler (yinele icin; son geri alinan sonda). */
  yigin: readonly Cizgi[];
}

export const BOS_CIZIM: CizimDurumu = { cizgiler: [], yigin: [] };

/** Yeni cizgi ekler; yinele yigini temizlenir (klasik editor davranisi). */
export function cizgiEkle(d: CizimDurumu, c: Cizgi): CizimDurumu {
  if (c.noktalar.length === 0) return d;
  return { cizgiler: [...d.cizgiler, c], yigin: [] };
}

export function geriAl(d: CizimDurumu): CizimDurumu {
  const son = d.cizgiler[d.cizgiler.length - 1];
  if (!son) return d;
  return { cizgiler: d.cizgiler.slice(0, -1), yigin: [...d.yigin, son] };
}

export function yinele(d: CizimDurumu): CizimDurumu {
  const son = d.yigin[d.yigin.length - 1];
  if (!son) return d;
  return { cizgiler: [...d.cizgiler, son], yigin: d.yigin.slice(0, -1) };
}

export const geriAlinabilir = (d: CizimDurumu) => d.cizgiler.length > 0;
export const yinelenebilir = (d: CizimDurumu) => d.yigin.length > 0;

export function temizle(d: CizimDurumu): CizimDurumu {
  return d.cizgiler.length === 0 ? d : { cizgiler: [], yigin: [] };
}

// --- Sadelestirme (Ramer-Douglas-Peucker) -------------------------------------------------

function noktaDogruMesafesi(p: Nokta, a: Nokta, b: Nokta): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const uz2 = dx * dx + dy * dy;
  if (uz2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / uz2));
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}

/** `esik`: 0..1 koordinat uzayinda sapma esigi. Ilk ve son nokta korunur (zamanlari dahil). */
export function sadelestir(noktalar: readonly Nokta[], esik: number): Nokta[] {
  if (noktalar.length <= 2 || esik <= 0) return [...noktalar];
  const tut = new Array<boolean>(noktalar.length).fill(false);
  tut[0] = true;
  tut[noktalar.length - 1] = true;
  const nk = (i: number): Nokta => {
    const n = noktalar[i];
    if (!n) throw new Error('nokta indeksi');
    return n;
  };
  const yigin: [number, number][] = [[0, noktalar.length - 1]];
  for (let aralik = yigin.pop(); aralik; aralik = yigin.pop()) {
    const [bas, son] = aralik;
    let enUzak = -1;
    let indeks = -1;
    for (let i = bas + 1; i < son; i++) {
      const m = noktaDogruMesafesi(nk(i), nk(bas), nk(son));
      if (m > enUzak) {
        enUzak = m;
        indeks = i;
      }
    }
    if (enUzak > esik && indeks > 0) {
      tut[indeks] = true;
      yigin.push([bas, indeks], [indeks, son]);
    }
  }
  return noktalar.filter((_, i) => tut[i]);
}

// --- Serilestirme -------------------------------------------------------------------------

const sinirla = (v: number) => Math.max(0, Math.min(IZGARA, Math.round(v * IZGARA)));

function kur(
  cizgiler: readonly Cizgi[],
  oran: number,
  zamanli: boolean,
  esik: number,
): CizimVerisi {
  let sure = 0;
  const cikti = cizgiler
    .map((c) => {
      const nokta = sadelestir(c.noktalar, esik);
      const n: number[] = [];
      for (const p of nokta) {
        n.push(sinirla(p.x), sinirla(p.y));
        if (zamanli) {
          const t = Math.max(0, Math.round(p.t));
          n.push(t);
          if (t > sure) sure = t;
        }
      }
      return { a: c.arac, k: Math.round(c.kalinlik), n };
    })
    .filter((c) => c.n.length > 0);
  return {
    v: CIZIM_SURUMU,
    oran: Math.round(oran * 10_000) / 10_000,
    zamanli,
    ...(zamanli ? { sure_ms: sure } : {}),
    cizgiler: cikti,
  };
}

/** Sadelestirme esikleri (0..1): once ince, sonra kaba; her adimda sinira bakilir. */
const ESIKLER = [0.0006, 0.0012, 0.0025, 0.005, 0.01, 0.02, 0.04] as const;

export function veriBayti(v: CizimVerisi): number {
  // JSON yalniz ASCII uretir (sayilar, sabit anahtarlar): karakter sayisi = bayt sayisi.
  return JSON.stringify(v).length;
}

/**
 * Cizgileri `cizim_verisi`ne cevirir. 256 KB'i asarsa esigi kabalastirarak sadelestirir; en kaba
 * esikte de asarsa `CizimCokBuyukHatasi` firlatir. `oran`: fotograf yuksekligi / genisligi.
 */
export function serilestir(
  cizgiler: readonly Cizgi[],
  oran: number,
  secenek: { zamanli?: boolean; enFazlaBayt?: number } = {},
): CizimVerisi {
  const zamanli = secenek.zamanli ?? false;
  const sinir = secenek.enFazlaBayt ?? CIZIM_EN_FAZLA_BAYT;
  let son = kur(cizgiler, oran, zamanli, ESIKLER[0]);
  for (const esik of ESIKLER) {
    son = kur(cizgiler, oran, zamanli, esik);
    if (veriBayti(son) <= sinir) return son;
  }
  throw new CizimCokBuyukHatasi(veriBayti(son));
}

/** `cizim_verisi`ni (api'den gelen serbest JSON) cizgilere cevirir; gecersizse null. */
export function cozumle(
  ham: unknown,
): { cizgiler: Cizgi[]; oran: number; zamanli: boolean } | null {
  if (!ham || typeof ham !== 'object' || Array.isArray(ham)) return null;
  const v = ham as Partial<CizimVerisi>;
  if (v.v !== CIZIM_SURUMU || !Array.isArray(v.cizgiler) || typeof v.oran !== 'number') {
    return null;
  }
  const zamanli = v.zamanli === true;
  const adim = zamanli ? 3 : 2;
  const cizgiler: Cizgi[] = [];
  for (const c of v.cizgiler) {
    if (!Array.isArray(c.n) || (c.a !== 'silgi' && !KALEM_RENKLERI.includes(c.a))) continue;
    const noktalar: Nokta[] = [];
    for (let i = 0; i + adim <= c.n.length; i += adim) {
      noktalar.push({
        x: (c.n[i] ?? 0) / IZGARA,
        y: (c.n[i + 1] ?? 0) / IZGARA,
        t: zamanli ? (c.n[i + 2] ?? 0) : 0,
      });
    }
    cizgiler.push({ arac: c.a, kalinlik: c.k, noktalar });
  }
  return { cizgiler, oran: v.oran, zamanli };
}

// --- Mini anlatim: zaman eslemesi ---------------------------------------------------------

/**
 * Ses pozisyonu `tMs`'de gorunmesi gereken cizgiler: ilk noktasi `tMs`'den sonra olan cizgi henuz
 * yoktur; suren cizgi yalniz `t <= tMs` noktalariyla (kismi) gosterilir. Girdi `t` noktalara gore
 * artan olmalidir (kayitta zaten oyledir).
 */
export function gorunenCizgiler(cizgiler: readonly Cizgi[], tMs: number): Cizgi[] {
  const sonuc: Cizgi[] = [];
  for (const c of cizgiler) {
    const ilk = c.noktalar[0];
    if (!ilk || ilk.t > tMs) continue;
    const sonNokta = c.noktalar.at(-1) ?? ilk;
    if (sonNokta.t <= tMs) {
      sonuc.push(c);
      continue;
    }
    sonuc.push({ ...c, noktalar: c.noktalar.filter((p) => p.t <= tMs) });
  }
  return sonuc;
}

/** Son noktanin zamani (ms); cizgi yoksa 0. */
export function cizimSuresiMs(cizgiler: readonly Cizgi[]): number {
  let m = 0;
  for (const c of cizgiler) for (const p of c.noktalar) if (p.t > m) m = p.t;
  return m;
}

/** Ses kaydi icin sure siniri: istenen saniye (en az 1, en cok 180). */
export function sesSuresiSn(ms: number): number {
  return Math.max(1, Math.min(180, Math.round(ms / 1000)));
}
