/**
 * Soru fotografi isleme: 90 derece dondurme, kirpma cercevesi ve tarayicida canvas ile JPEG'e cevirme
 * (uzun kenar en cok ~2000 px). Hesaplar saf fonksiyonlardir (birim testli); canvas/bitmap adimlari
 * tarayiciya baglidir. HEIC'i tarayici cozerse (Safari) JPEG olur, cozemezse anlasilir hata verilir:
 * medya servisi HEIC kabul etmez.
 */

export const GORSEL_UZUN_KENAR = 2000;
export const GORSEL_JPEG_KALITE = 0.85;
/** Bundan buyuk kaynak dosyalar bellegi sisirmeden once reddedilir. */
export const GORSEL_KAYNAK_EN_FAZLA_BAYT = 40 * 1024 * 1024;
/** Kirpma cercevesinin her eksende en az kapladigi oran. */
export const KIRPMA_EN_AZ = 0.1;

export type Derece = 0 | 90 | 180 | 270;

/** Dondurulmus gorselin her kenarindan kirpilan oran (0..1). */
export interface Kirpma {
  sol: number;
  ust: number;
  sag: number;
  alt: number;
}

export const KIRPMA_YOK: Kirpma = { sol: 0, ust: 0, sag: 0, alt: 0 };

export const kirpmaVarMi = (k: Kirpma): boolean => k.sol > 0 || k.ust > 0 || k.sag > 0 || k.alt > 0;

const sinirla = (v: number, alt: number, ust: number) => Math.min(ust, Math.max(alt, v));

/** Tek bir kenari degistirir; cerceve `KIRPMA_EN_AZ`dan kuculemez ve kenarlar birbirini gecemez. */
export function kirpmaKenariAyarla(k: Kirpma, kenar: keyof Kirpma, deger: number): Kirpma {
  const karsit: Record<keyof Kirpma, keyof Kirpma> = {
    sol: 'sag',
    sag: 'sol',
    ust: 'alt',
    alt: 'ust',
  };
  const ust = 1 - KIRPMA_EN_AZ - k[karsit[kenar]];
  return { ...k, [kenar]: sinirla(deger, 0, Math.max(0, ust)) };
}

export function dondurBoyut(
  genislik: number,
  yukseklik: number,
  derece: Derece,
): { genislik: number; yukseklik: number } {
  return derece === 90 || derece === 270
    ? { genislik: yukseklik, yukseklik: genislik }
    : { genislik, yukseklik };
}

/** Saat yonunde (+1) ya da tersine (-1) 90 derece. */
export function sonrakiDerece(derece: Derece, yon: 1 | -1): Derece {
  return ((((derece + 90 * yon) % 360) + 360) % 360) as Derece;
}

/** Kirpma oranlarini piksel dikdortgenine cevirir (en az 1x1). */
export function kirpmaPikseli(k: Kirpma, genislik: number, yukseklik: number) {
  const x = Math.round(sinirla(k.sol, 0, 1) * genislik);
  const y = Math.round(sinirla(k.ust, 0, 1) * yukseklik);
  const sagX = Math.round((1 - sinirla(k.sag, 0, 1)) * genislik);
  const altY = Math.round((1 - sinirla(k.alt, 0, 1)) * yukseklik);
  return {
    x: Math.min(x, genislik - 1),
    y: Math.min(y, yukseklik - 1),
    genislik: Math.max(1, sagX - x),
    yukseklik: Math.max(1, altY - y),
  };
}

/** Uzun kenar `enCok`u gecmiyorsa olcek 1 (buyutme yok). */
export function hedefBoyut(genislik: number, yukseklik: number, enCok = GORSEL_UZUN_KENAR) {
  const uzun = Math.max(genislik, yukseklik);
  const olcek = uzun > enCok ? enCok / uzun : 1;
  return {
    genislik: Math.max(1, Math.round(genislik * olcek)),
    yukseklik: Math.max(1, Math.round(yukseklik * olcek)),
    olcek,
  };
}

export const heicMi = (dosya: { type: string; name?: string }): boolean =>
  /^image\/hei[cf]/i.test(dosya.type) || /\.hei[cf]$/i.test(dosya.name ?? '');

export type GorselHataKodu = 'heic' | 'cozulemedi' | 'cok_buyuk' | 'resim_degil';

export class GorselHatasi extends Error {
  constructor(public readonly kod: GorselHataKodu) {
    super(kod);
    this.name = 'GorselHatasi';
  }
}

interface DosyaOzeti {
  type: string;
  name?: string | undefined;
  size: number;
}

/** Dosya secimini onceden suzer (turu ve boyutu); gecerliyse `null`. */
export function dosyaSorunu(dosya: DosyaOzeti): GorselHataKodu | null {
  if (dosya.size > GORSEL_KAYNAK_EN_FAZLA_BAYT) return 'cok_buyuk';
  // HEIC cozulebilirse (Safari) kabul; cozemezse `bitmapAc` hata verir.
  if (heicMi(dosya)) return null;
  if (!dosya.type.startsWith('image/') || /svg/i.test(dosya.type)) return 'resim_degil';
  return null;
}

// --- Tarayiciya bagli adimlar -------------------------------------------------------------------

/** Dosyayi EXIF yonune gore cozer; HEIC'i cozemeyen tarayicida `heic` hatasi verir. */
export async function bitmapAc(dosya: Blob & { name?: string }): Promise<ImageBitmap> {
  const sorun = dosyaSorunu(dosya);
  if (sorun) throw new GorselHatasi(sorun);
  try {
    return await createImageBitmap(dosya, { imageOrientation: 'from-image' });
  } catch {
    throw new GorselHatasi(heicMi(dosya) ? 'heic' : 'cozulemedi');
  }
}

/** Gorseli saat yonunde `derece` kadar dondurulmus yeni bir canvas'a cizer. */
export function dondurulmusCanvas(
  kaynak: ImageBitmap | HTMLCanvasElement,
  derece: Derece,
): HTMLCanvasElement {
  const { genislik, yukseklik } = dondurBoyut(kaynak.width, kaynak.height, derece);
  const canvas = document.createElement('canvas');
  canvas.width = genislik;
  canvas.height = yukseklik;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new GorselHatasi('cozulemedi');
  ctx.translate(genislik / 2, yukseklik / 2);
  ctx.rotate((derece * Math.PI) / 180);
  ctx.drawImage(kaynak, -kaynak.width / 2, -kaynak.height / 2);
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, tur: string, kalite?: number): Promise<Blob> {
  return new Promise((coz, reddet) => {
    canvas.toBlob(
      (b) => {
        if (b) coz(b);
        else reddet(new GorselHatasi('cozulemedi'));
      },
      tur,
      kalite,
    );
  });
}

/** Dondur + kirp + uzun kenari sinirla + JPEG: yuklenecek dosya. */
export async function jpegeCevir(
  kaynak: ImageBitmap,
  { derece, kirpma }: { derece: Derece; kirpma: Kirpma },
  enCok = GORSEL_UZUN_KENAR,
  kalite = GORSEL_JPEG_KALITE,
): Promise<{ blob: Blob; genislik: number; yukseklik: number }> {
  const donuk = dondurulmusCanvas(kaynak, derece);
  const k = kirpmaPikseli(kirpma, donuk.width, donuk.height);
  const hedef = hedefBoyut(k.genislik, k.yukseklik, enCok);
  const canvas = document.createElement('canvas');
  canvas.width = hedef.genislik;
  canvas.height = hedef.yukseklik;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new GorselHatasi('cozulemedi');
  ctx.imageSmoothingQuality = 'high';
  // JPEG seffaflik bilmez: beyaz zemin.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(donuk, k.x, k.y, k.genislik, k.yukseklik, 0, 0, hedef.genislik, hedef.yukseklik);
  const blob = await canvasBlob(canvas, 'image/jpeg', kalite);
  return { blob, genislik: hedef.genislik, yukseklik: hedef.yukseklik };
}
