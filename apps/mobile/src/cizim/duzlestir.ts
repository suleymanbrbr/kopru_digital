import {
  BlendMode,
  ImageFormat,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
} from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';

import { kaliteBul } from '../foto/geometri';
import { KALEM_HEX, type Cizgi } from './model';
import { cizgiPx, yolOlustur } from './yol';

export interface DuzlestirilmisGorsel {
  uri: string;
  genislik: number;
  yukseklik: number;
  bayt: number;
}

/**
 * Fotograf + cizgileri tek JPEG'e duzlestirir (`soru_cizim`; ogrenci bunu dogrudan gorur). Cizim
 * katmani ayri bir `saveLayer`dir: silgi (`clear`) yalniz cizgileri siler. Cikti genisligi en cok
 * `enFazlaGenislik` px.
 */
export async function cizimiDuzlestir(
  kaynakUri: string,
  cizgiler: readonly Cizgi[],
  enFazlaGenislik = 1600,
): Promise<DuzlestirilmisGorsel> {
  const veri = await Skia.Data.fromURI(kaynakUri);
  const foto = Skia.Image.MakeImageFromEncoded(veri);
  if (!foto) throw new Error('Fotoğraf okunamadı.');
  const olcek = Math.min(1, enFazlaGenislik / foto.width());
  const g = Math.round(foto.width() * olcek);
  const y = Math.round(foto.height() * olcek);
  const yuzey = Skia.Surface.Make(g, y);
  if (!yuzey) throw new Error('Çizim yüzeyi oluşturulamadı.');
  const tuval = yuzey.getCanvas();
  tuval.drawImageRect(
    foto,
    Skia.XYWHRect(0, 0, foto.width(), foto.height()),
    Skia.XYWHRect(0, 0, g, y),
    Skia.Paint(),
  );
  tuval.saveLayer();
  for (const c of cizgiler) {
    const p = Skia.Paint();
    p.setAntiAlias(true);
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(cizgiPx(c, g));
    p.setStrokeCap(StrokeCap.Round);
    p.setStrokeJoin(StrokeJoin.Round);
    if (c.arac === 'silgi') p.setBlendMode(BlendMode.Clear);
    else p.setColor(Skia.Color(KALEM_HEX[c.arac]));
    tuval.drawPath(yolOlustur(c.noktalar, g, y), p);
  }
  tuval.restore();
  yuzey.flush();
  const goruntu = yuzey.makeImageSnapshot();
  const dizin = FileSystem.cacheDirectory ?? '';
  const sonuc = await kaliteBul(async (kalite) => {
    const b64 = goruntu.encodeToBase64(ImageFormat.JPEG, Math.round(kalite * 100));
    const uri = `${dizin}cizim-${String(Date.now())}-${String(Math.round(kalite * 100))}.jpg`;
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
    const bilgi = await FileSystem.getInfoAsync(uri);
    return { uri, bayt: bilgi.exists ? bilgi.size : 0 };
  });
  return { uri: sonuc.uri, genislik: g, yukseklik: y, bayt: sonuc.bayt };
}
