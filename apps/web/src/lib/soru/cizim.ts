import { SORU_CIZIM_EN_FAZLA_BAYT } from '@kopru/contracts';

/**
 * Fotograf uzerine cizim: vektor cizgi modeli (geri al/yinele, sadelestirme, `cizim_verisi` boyut siniri)
 * ve canvas'a cizim. Noktalar gorselin genislik/yuksekligine gore 0..1 normalize edilir; boylece cizim
 * her ekran boyutunda ve yuklenecek duzlestirilmis gorselde ayni yerde durur.
 */

export type CizimAraci = 'kalem' | 'silgi';

export interface Cizgi {
  arac: CizimAraci;
  renk: string;
  /** Gorselin kisa kenarina orani. */
  kalinlik: number;
  /** `[x0, y0, x1, y1, ...]` (0..1). */
  noktalar: number[];
}

export interface CizimGecmisi {
  cizgiler: Cizgi[];
  /** Geri alinanlar (en son geri alinan sonda). Yeni cizgi bunu temizler. */
  yinelenecek: Cizgi[];
}

export const CIZIM_RENKLERI = [
  { kod: 'kirmizi', hex: '#dc2626' },
  { kod: 'mavi', hex: '#2563eb' },
  { kod: 'yesil', hex: '#15803d' },
] as const;
export type CizimRengi = (typeof CIZIM_RENKLERI)[number]['kod'];

export const KALEM_KALINLIGI = 0.006;
export const SILGI_KALINLIGI = 0.03;

export const cizimBos = (): CizimGecmisi => ({ cizgiler: [], yinelenecek: [] });

export const cizgiEkle = (g: CizimGecmisi, c: Cizgi): CizimGecmisi => ({
  cizgiler: [...g.cizgiler, c],
  yinelenecek: [],
});

export function cizimGeriAl(g: CizimGecmisi): CizimGecmisi {
  const son = g.cizgiler[g.cizgiler.length - 1];
  if (!son) return g;
  return { cizgiler: g.cizgiler.slice(0, -1), yinelenecek: [...g.yinelenecek, son] };
}

export function cizimYinele(g: CizimGecmisi): CizimGecmisi {
  const son = g.yinelenecek[g.yinelenecek.length - 1];
  if (!son) return g;
  return { cizgiler: [...g.cizgiler, son], yinelenecek: g.yinelenecek.slice(0, -1) };
}

export const geriAlinabilir = (g: CizimGecmisi) => g.cizgiler.length > 0;
export const yinelenebilir = (g: CizimGecmisi) => g.yinelenecek.length > 0;

/** Gorunur bir sey cizilmis mi? Yalniz silgi cizgileri "cizim" sayilmaz. */
export const cizimVarMi = (g: CizimGecmisi): boolean => g.cizgiler.some((c) => c.arac === 'kalem');

export interface CizimVerisi {
  surum: 1;
  genislik: number;
  yukseklik: number;
  cizgiler: Cizgi[];
}

const yuvarla = (n: number) => Math.round(n * 10_000) / 10_000;

/** Birbirine `esik`ten yakin noktalari atar (son nokta korunur). */
export function noktalariSadelestir(noktalar: readonly number[], esik: number): number[] {
  if (noktalar.length <= 4) return [...noktalar];
  const cikti: number[] = [noktalar[0] ?? 0, noktalar[1] ?? 0];
  for (let i = 2; i < noktalar.length - 2; i += 2) {
    const x = noktalar[i] ?? 0;
    const y = noktalar[i + 1] ?? 0;
    const sx = cikti[cikti.length - 2] ?? 0;
    const sy = cikti[cikti.length - 1] ?? 0;
    if (Math.hypot(x - sx, y - sy) >= esik) cikti.push(x, y);
  }
  cikti.push(noktalar[noktalar.length - 2] ?? 0, noktalar[noktalar.length - 1] ?? 0);
  return cikti;
}

export const veriBayti = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v)).length;

/** Her ikinci noktayi atar (ilk ve son korunur); sadelestirme yetmediginde son care. */
function noktalariSeyrelt(noktalar: readonly number[]): number[] {
  const n = noktalar.length / 2;
  if (n <= 2) return [...noktalar];
  const cikti: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (i % 2 === 0 || i === n - 1) cikti.push(noktalar[i * 2] ?? 0, noktalar[i * 2 + 1] ?? 0);
  }
  return cikti;
}

/**
 * `cizim_verisi` olusturur; JSON boyutu `enFazla` baytin altina inene kadar once yakin noktalari atar, sonra
 * noktalari seyreltir (api 256 KB'tan buyugu reddeder).
 */
export function cizimVerisiYap(
  g: CizimGecmisi,
  genislik: number,
  yukseklik: number,
  enFazla = SORU_CIZIM_EN_FAZLA_BAYT,
): CizimVerisi {
  const yap = (esik: number): CizimVerisi => ({
    surum: 1,
    genislik,
    yukseklik,
    cizgiler: g.cizgiler.map((c) => ({
      ...c,
      noktalar: noktalariSadelestir(c.noktalar, esik).map(yuvarla),
    })),
  });
  let veri = yap(0.0005);
  for (let esik = 0.001; veriBayti(veri) > enFazla && esik < 0.2; esik *= 2) {
    veri = yap(esik);
  }
  for (let tur = 0; veriBayti(veri) > enFazla && tur < 12; tur += 1) {
    veri = {
      ...veri,
      cizgiler: veri.cizgiler.map((c) => ({ ...c, noktalar: noktalariSeyrelt(c.noktalar) })),
    };
  }
  return veri;
}

/** Cizgileri 2B baglama cizer (`destination-out` ile silgi); baglam seffaf bir katman olmalidir. */
export function cizgileriCiz(
  ctx: CanvasRenderingContext2D,
  cizgiler: readonly Cizgi[],
  genislik: number,
  yukseklik: number,
): void {
  const kisa = Math.min(genislik, yukseklik);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const c of cizgiler) {
    const n = c.noktalar.length / 2;
    if (n === 0) continue;
    ctx.globalCompositeOperation = c.arac === 'silgi' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = c.renk;
    ctx.fillStyle = c.renk;
    ctx.lineWidth = Math.max(1, c.kalinlik * kisa);
    const x0 = (c.noktalar[0] ?? 0) * genislik;
    const y0 = (c.noktalar[1] ?? 0) * yukseklik;
    if (n === 1) {
      ctx.beginPath();
      ctx.arc(x0, y0, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < n; i += 1) {
      ctx.lineTo((c.noktalar[i * 2] ?? 0) * genislik, (c.noktalar[i * 2 + 1] ?? 0) * yukseklik);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}
