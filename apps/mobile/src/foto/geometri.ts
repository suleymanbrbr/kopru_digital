/** Fotograf hazirlama ve kirpma icin saf geometri (birim testli). */

/** Yuklenecek fotografin uzun kenari (px). Sartname: dosya 250-400 KB. */
export const FOTO_EN_UZUN_KENAR = 2000;
/** Dosya boyutu hedefi (bayt): bu aralikta kalan ilk kalite secilir. */
export const FOTO_HEDEF_BAYT = { en_az: 250 * 1024, en_cok: 400 * 1024 } as const;
/** Yukleme icin JPEG kalite basamaklari (yuksekten dusuge). */
export const FOTO_KALITELER = [0.8, 0.7, 0.6, 0.5, 0.4] as const;

export interface Boyut {
  genislik: number;
  yukseklik: number;
}

/** Uzun kenar `enUzun`dan buyukse oranli kucultur; degilse ayni boyut. */
export function kucultulmusBoyut(b: Boyut, enUzun: number = FOTO_EN_UZUN_KENAR): Boyut {
  const uzun = Math.max(b.genislik, b.yukseklik);
  if (uzun <= enUzun) return { ...b };
  const olcek = enUzun / uzun;
  return {
    genislik: Math.max(1, Math.round(b.genislik * olcek)),
    yukseklik: Math.max(1, Math.round(b.yukseklik * olcek)),
  };
}

/** 90 derecenin katlarinda dondurmede boyut degisimi. */
export function dondurulmusBoyut(b: Boyut, derece: number): Boyut {
  const d = ((derece % 360) + 360) % 360;
  return d === 90 || d === 270 ? { genislik: b.yukseklik, yukseklik: b.genislik } : { ...b };
}

/** Kirpma dikdortgeni: 0..1 (goruntu genislik/yuksekligine gore). */
export interface KirpmaAlani {
  x: number;
  y: number;
  g: number;
  y2: number;
}

export const TUM_ALAN: KirpmaAlani = { x: 0, y: 0, g: 1, y2: 1 };
/** Kirpma alani her kenarda en az bu orani korur (cok kucuk kirpmayi onler). */
export const KIRPMA_EN_AZ = 0.15;

export type Kose = 'ust-sol' | 'ust-sag' | 'alt-sol' | 'alt-sag';

/** Bir kosesini hedef noktaya (0..1) tasir; kenarlar sinirlarda ve en az `KIRPMA_EN_AZ` kalir. */
export function koseyiTasi(a: KirpmaAlani, kose: Kose, nx: number, ny: number): KirpmaAlani {
  const sinir = (v: number) => Math.max(0, Math.min(1, v));
  let sol = a.x;
  let ust = a.y;
  let sag = a.x + a.g;
  let alt = a.y + a.y2;
  const x = sinir(nx);
  const y = sinir(ny);
  if (kose === 'ust-sol' || kose === 'alt-sol') sol = Math.min(x, sag - KIRPMA_EN_AZ);
  else sag = Math.max(x, sol + KIRPMA_EN_AZ);
  if (kose === 'ust-sol' || kose === 'ust-sag') ust = Math.min(y, alt - KIRPMA_EN_AZ);
  else alt = Math.max(y, ust + KIRPMA_EN_AZ);
  return { x: sol, y: ust, g: sag - sol, y2: alt - ust };
}

/** Kirpma alanini goruntu piksellerine cevirir (tam sayi; goruntu disina tasmaz). */
export function kirpmaPikseli(
  a: KirpmaAlani,
  b: Boyut,
): { originX: number; originY: number; width: number; height: number } {
  const originX = Math.max(0, Math.min(b.genislik - 1, Math.round(a.x * b.genislik)));
  const originY = Math.max(0, Math.min(b.yukseklik - 1, Math.round(a.y * b.yukseklik)));
  const width = Math.max(1, Math.min(b.genislik - originX, Math.round(a.g * b.genislik)));
  const height = Math.max(1, Math.min(b.yukseklik - originY, Math.round(a.y2 * b.yukseklik)));
  return { originX, originY, width, height };
}

export function tamAlanMi(a: KirpmaAlani): boolean {
  return a.x <= 0.001 && a.y <= 0.001 && a.g >= 0.998 && a.y2 >= 0.998;
}

/**
 * Kaliteleri yuksekten dusuge dener (`kaydet` dosyayi o kaliteyle yazar ve baytini dondurur); ilk
 * `en_cok` altina giren kalmaktadir. Hicbiri girmezse sonuncu (en kucuk) kalite kalir.
 */
export async function kaliteBul<T extends { bayt: number }>(
  kaydet: (kalite: number) => Promise<T>,
  hedef: { en_cok: number } = FOTO_HEDEF_BAYT,
  kaliteler: readonly number[] = FOTO_KALITELER,
): Promise<T & { kalite: number }> {
  let son: (T & { kalite: number }) | undefined;
  for (const kalite of kaliteler) {
    son = { ...(await kaydet(kalite)), kalite };
    if (son.bayt <= hedef.en_cok) return son;
  }
  if (!son) throw new Error('kalite listesi bos');
  return son;
}

/** `genislik x yukseklik` goruntusunun `kap` icindeki "contain" yerlesimi. */
export function sigdir(
  b: Boyut,
  kap: Boyut,
): { genislik: number; yukseklik: number; sol: number; ust: number } {
  const olcek = Math.min(kap.genislik / b.genislik, kap.yukseklik / b.yukseklik);
  const genislik = b.genislik * olcek;
  const yukseklik = b.yukseklik * olcek;
  return {
    genislik,
    yukseklik,
    sol: (kap.genislik - genislik) / 2,
    ust: (kap.yukseklik - yukseklik) / 2,
  };
}
