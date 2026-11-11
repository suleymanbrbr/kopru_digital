/**
 * yukleme-akisi.sh icin ornek icerik uretir ve inceler.
 *   tsx scripts/ornek-uret.ts jpeg <cikti.jpg>      EXIF (GPS konumu, yon=6) iceren 3000x2000 JPEG
 *   tsx scripts/ornek-uret.ts mp3 <cikti.mp3> <sn>  gecerli, sessiz MP3 (sure saniye)
 *   tsx scripts/ornek-uret.ts wav <cikti.wav> <sn>  sessiz WAV (macOS `afconvert` ile m4a'ya cevrilir)
 *   tsx scripts/ornek-uret.ts incele <dosya>        {format, genislik, yukseklik, exif, gps} JSON
 */
import { readFile, writeFile } from 'node:fs/promises';

import sharp from 'sharp';

const [komut, yol, arg] = process.argv.slice(2);
if (!komut || !yol) throw new Error('Kullanım: ornek-uret.ts <jpeg|mp3|wav|incele> <dosya> [sn]');

if (komut === 'jpeg') {
  const govde = await sharp({
    create: {
      width: 3000,
      height: 2000,
      channels: 3,
      background: '#d8d2c0',
      noise: { type: 'gaussian', mean: 128, sigma: 25 },
    },
  })
    .withExif({
      IFD0: { Make: 'TestKamera', Copyright: 'gizli-sahip' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '41/1 0/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '29/1 0/1 0/1',
      },
    })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 92 })
    .toBuffer();
  await writeFile(yol, govde);
} else if (komut === 'mp3') {
  const sn = Number(arg ?? '10');
  // MPEG-2 Layer III, 8 kbps, 22.05 kHz, mono: kare 26 bayt / 576 ornek.
  const kare = Buffer.alloc(26);
  kare.set([0xff, 0xf3, 0x10, 0xc0]);
  const adet = Math.ceil((sn * 22050) / 576);
  await writeFile(yol, Buffer.concat(Array.from({ length: adet }, () => kare)));
} else if (komut === 'wav') {
  const sn = Number(arg ?? '5');
  const hz = 8000;
  const veri = Buffer.alloc(sn * hz * 2);
  const baslik = Buffer.alloc(44);
  baslik.write('RIFF', 0);
  baslik.writeUInt32LE(36 + veri.length, 4);
  baslik.write('WAVEfmt ', 8);
  baslik.writeUInt32LE(16, 16);
  baslik.writeUInt16LE(1, 20);
  baslik.writeUInt16LE(1, 22);
  baslik.writeUInt32LE(hz, 24);
  baslik.writeUInt32LE(hz * 2, 28);
  baslik.writeUInt16LE(2, 32);
  baslik.writeUInt16LE(16, 34);
  baslik.write('data', 36);
  baslik.writeUInt32LE(veri.length, 40);
  await writeFile(yol, Buffer.concat([baslik, veri]));
} else if (komut === 'incele') {
  const meta = await sharp(await readFile(yol)).metadata();
  const exif = meta.exif ? meta.exif.toString('latin1') : '';
  console.log(
    JSON.stringify({
      format: meta.format,
      genislik: meta.width,
      yukseklik: meta.height,
      exif: meta.exif !== undefined,
      gps: exif.includes('GPS') || exif.includes('gizli-sahip'),
      yon: meta.orientation ?? null,
    }),
  );
} else {
  throw new Error(`Bilinmeyen komut: ${komut}`);
}
