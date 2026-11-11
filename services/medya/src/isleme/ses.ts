import { parseBuffer } from 'music-metadata';

/**
 * Ses suresini (saniye, en yakin tam sayiya yuvarlanmis) cikarir. Sure bulunamazsa ve bit hizi da bilinmiyorsa `null`
 * (cagiran dosyayi `bozuk_dosya` sayar: suresi dogrulanamayan ses 180 sn sinirini asabilir).
 * Cozumlenemeyen/bozuk icerik firlatir.
 */
export async function sesSuresiSn(govde: Buffer, mime: string): Promise<number | null> {
  const meta = await parseBuffer(new Uint8Array(govde), { mimeType: mime, size: govde.length }, {
    duration: true,
  });
  let sure = meta.format.duration;
  if ((sure === undefined || !Number.isFinite(sure)) && meta.format.bitrate) {
    sure = (govde.length * 8) / meta.format.bitrate;
  }
  if (sure === undefined || !Number.isFinite(sure) || sure < 0) return null;
  return Math.round(sure);
}
