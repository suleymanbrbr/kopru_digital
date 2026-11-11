import type { MedyaDosyaTuru } from '@kopru/contracts';
import sharp from 'sharp';

/**
 * Gorsel yeniden kodlama (docs/schema/medya.md "Guvenlik"): EXIF/konum/ICC silinir, yon duzeltilir, uzun
 * kenar sinirlanir; kucuk resimler `kucuk` 256 px ve `orta` 1024 px WebP.
 *
 * Secilen degerlerin gerekcesi ve olculen boyutlar docs/gelistirme.md "medya" bolumundedir
 * (`pnpm --filter @kopru/medya olc:gorsel`). Ozet: defter/soru fotografi 12 MP telefon kamerasindan
 * uzun kenar 2000 px + JPEG kalite 78 (mozjpeg, 4:2:0) ile ortalama ~250-400 KB olur; el yazisi ve basili
 * metin 2000 px'te okunur kalir.
 */

export interface GorselProfili {
  /** Uzun kenar siniri (px); kucuk gorseller buyutulmez. */
  uzunKenar: number;
  cikti: 'jpeg' | 'png' | 'ayni';
  /** JPEG/WebP kalitesi. */
  kalite: number;
  /** PNG cikti icin 256 renk paletine indirger (cizim/logo; fotograf degil). */
  palet?: boolean;
}

export const FOTOGRAF_PROFILI: GorselProfili = { uzunKenar: 2000, cikti: 'jpeg', kalite: 78 };

/** Tur -> profil. Cizim ve logo: format korunur (PNG saydamligi/keskin cizgi), foto: JPEG. */
export function gorselProfili(tur: MedyaDosyaTuru): GorselProfili {
  switch (tur) {
    case 'soru_cizim':
      return { uzunKenar: 2000, cikti: 'ayni', kalite: 80, palet: true };
    case 'kurum_logosu':
      return { uzunKenar: 1024, cikti: 'ayni', kalite: 85 };
    case 'avatar':
      return { uzunKenar: 1024, cikti: 'jpeg', kalite: 80 };
    default:
      return FOTOGRAF_PROFILI;
  }
}

/** Dekompresyon bombasi korumasi: ~100 megapiksel ustu girdi reddedilir. */
export const AZAMI_GIRDI_PIKSEL = 100_000_000;

export const KUCUK_RESIM_VARYANTLARI = [
  { varyant: 'kucuk', uzunKenar: 256, kalite: 72 },
  { varyant: 'orta', uzunKenar: 1024, kalite: 78 },
] as const;

export interface IslenmisGorsel {
  govde: Buffer;
  mime: string;
  genislik: number;
  yukseklik: number;
}

export interface KucukResim extends IslenmisGorsel {
  varyant: 'kucuk' | 'orta';
}

export interface GorselSonucu {
  asil: IslenmisGorsel;
  kucukResimler: KucukResim[];
}

/** `tespitMime`: bayt imzasindan bulunan gercek tur (`ayni` cikti icin). */
export async function gorselYenidenKodla(
  girdi: Buffer,
  profil: GorselProfili,
  tespitMime: string,
): Promise<IslenmisGorsel> {
  let hat = sharp(girdi, { limitInputPixels: AZAMI_GIRDI_PIKSEL })
    // EXIF yonunu piksellere uygular; sonraki `toBuffer` hicbir metaveri (EXIF/GPS/ICC) yazmaz.
    .rotate()
    .resize({
      width: profil.uzunKenar,
      height: profil.uzunKenar,
      fit: 'inside',
      withoutEnlargement: true,
    });

  const cikti = profil.cikti === 'ayni' ? (tespitMime === 'image/png' ? 'png' : tespitMime === 'image/webp' ? 'webp' : 'jpeg') : profil.cikti;
  let mime: string;
  if (cikti === 'jpeg') {
    // Saydamlik JPEG'de yok: beyaza yassilastir (cizim/fotograf).
    hat = hat.flatten({ background: '#ffffff' }).jpeg({
      quality: profil.kalite,
      mozjpeg: true,
      chromaSubsampling: '4:2:0',
    });
    mime = 'image/jpeg';
  } else if (cikti === 'png') {
    hat = hat.png({
      compressionLevel: 9,
      ...(profil.palet ? { palette: true, quality: 90, effort: 7 } : {}),
    });
    mime = 'image/png';
  } else {
    hat = hat.webp({ quality: profil.kalite });
    mime = 'image/webp';
  }
  const { data, info } = await hat.toBuffer({ resolveWithObject: true });
  return { govde: data, mime, genislik: info.width, yukseklik: info.height };
}

export async function kucukResimleriUret(yenidenKodlanmis: Buffer): Promise<KucukResim[]> {
  const sonuc: KucukResim[] = [];
  for (const v of KUCUK_RESIM_VARYANTLARI) {
    const { data, info } = await sharp(yenidenKodlanmis)
      .resize({
        width: v.uzunKenar,
        height: v.uzunKenar,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: v.kalite })
      .toBuffer({ resolveWithObject: true });
    sonuc.push({
      varyant: v.varyant,
      govde: data,
      mime: 'image/webp',
      genislik: info.width,
      yukseklik: info.height,
    });
  }
  return sonuc;
}

/** Tam gorsel isleme: yeniden kodla + kucuk resimler. Bozuk/desteklenmeyen girdi firlatir. */
export async function gorselIsle(
  girdi: Buffer,
  tur: MedyaDosyaTuru,
  tespitMime: string,
  options: { kucukResim: boolean },
): Promise<GorselSonucu> {
  const asil = await gorselYenidenKodla(girdi, gorselProfili(tur), tespitMime);
  const kucukResimler = options.kucukResim ? await kucukResimleriUret(asil.govde) : [];
  return { asil, kucukResimler };
}
