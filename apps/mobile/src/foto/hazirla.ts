import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import {
  kaliteBul,
  kirpmaPikseli,
  kucultulmusBoyut,
  tamAlanMi,
  type Boyut,
  type KirpmaAlani,
} from './geometri';

export interface HazirFoto {
  uri: string;
  genislik: number;
  yukseklik: number;
  bayt: number;
  kalite: number;
}

export interface DuzenleSecenegi {
  /** Saat yonunde derece (90'in katlari). */
  dondur?: number;
  /** Dondurmeden SONRAKI goruntuye gore kirpma (0..1). */
  kirp?: KirpmaAlani;
}

/**
 * Fotografi yukleme icin hazirlar: dondurur, kirpar, uzun kenari 2000 px'e kucultur ve JPEG yazar
 * (HEIC medya servisinde kabul edilmez). Kalite 250-400 KB hedefi icin yuksekten dusuge denenir.
 * Her adim EXIF yonunu zaten uygular (cikti dik).
 */
export async function fotoHazirla(
  uri: string,
  kaynak: Boyut,
  secenek: DuzenleSecenegi = {},
): Promise<HazirFoto> {
  const derece = secenek.dondur ?? 0;
  let ctx = ImageManipulator.manipulate(uri);
  if (derece % 360 !== 0) ctx = ctx.rotate(derece);
  let boyut: Boyut = kaynak;
  if (derece % 180 !== 0) boyut = { genislik: kaynak.yukseklik, yukseklik: kaynak.genislik };
  if (secenek.kirp && !tamAlanMi(secenek.kirp)) {
    const k = kirpmaPikseli(secenek.kirp, boyut);
    ctx = ctx.crop(k);
    boyut = { genislik: k.width, yukseklik: k.height };
  }
  const hedef = kucultulmusBoyut(boyut);
  if (hedef.genislik !== boyut.genislik) ctx = ctx.resize({ width: hedef.genislik });
  const goruntu = await ctx.renderAsync();
  const sonuc = await kaliteBul(async (kalite) => {
    const dosya = await goruntu.saveAsync({ format: SaveFormat.JPEG, compress: kalite });
    const bilgi = await FileSystem.getInfoAsync(dosya.uri);
    return {
      uri: dosya.uri,
      genislik: dosya.width,
      yukseklik: dosya.height,
      bayt: bilgi.exists ? bilgi.size : 0,
    };
  });
  return sonuc;
}
