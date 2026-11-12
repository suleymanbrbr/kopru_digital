/**
 * Gorsel kodlama ayarlarini olcer (docs/gelistirme.md "medya"): 12 MP (4032x3024) telefon fotografi
 * benzeri sentetik defter sayfasi (kagit dokusu + el yazisi benzeri cizgiler + metin + golge + hafif
 * bulaniklik + sensor gurultusu) uretir ve uzun kenar / JPEG kalite kombinasyonlari icin dosya boyutunu
 * ve okunurluk olcusu olan SSIM-benzeri ortalama mutlak farki (yeniden olceklenmis kaynak ile) yazar.
 * Ek olarak komut satirinda verilen gercek bir fotografi (`--dosya yol.jpg`) ayni tabloya ekler.
 *
 * Kullanim: pnpm --filter @kopru/medya olc:gorsel [--dosya yol] [--cikti klasor]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import sharp from 'sharp';

const { values } = parseArgs({
  options: { dosya: { type: 'string' }, cikti: { type: 'string' } },
});

const GENISLIK = 4032;
const YUKSEKLIK = 3024;

/** Defter sayfasi benzeri sahne: metin satirlari, denklem benzeri serbest cizgiler, ruled cizgiler. */
export async function sentetikDefterSayfasi(): Promise<Buffer> {
  const satirlar: string[] = [];
  const metinler = [
    'Soru 12: x^2 - 5x + 6 = 0 denkleminin kokleri',
    'Cozum: (x - 2)(x - 3) = 0  =>  x = 2  veya  x = 3',
    'Not: diskriminant D = b^2 - 4ac = 25 - 24 = 1',
    'Kokler toplami = -b/a = 5, carpimi = c/a = 6',
    'Ornek 4: f(x) = 3x + 2 ise f(4) = 14 bulunur',
    'Dikkat: isaret hatasi yapma, parantezi ac!',
  ];
  let y = 330;
  for (const m of metinler) {
    satirlar.push(
      `<text x="260" y="${String(y)}" font-family="Helvetica, Arial, sans-serif" font-size="92" fill="#1c2a6b" transform="rotate(-0.6 260 ${String(y)})">${m}</text>`,
    );
    y += 190;
  }
  const cizgiler: string[] = [];
  for (let cy = 250; cy < YUKSEKLIK; cy += 190) {
    cizgiler.push(
      `<line x1="120" y1="${String(cy)}" x2="${String(GENISLIK - 120)}" y2="${String(cy + 8)}" stroke="#9db7d8" stroke-width="4"/>`,
    );
  }
  // El yazisi benzeri serbest cizgiler.
  let serbest = '';
  for (let i = 0; i < 40; i++) {
    const x0 = 300 + ((i * 331) % 3000);
    const y0 = 1500 + ((i * 197) % 1300);
    serbest += `<path d="M ${String(x0)} ${String(y0)} q 40 -60 80 0 t 80 0 t 80 10" stroke="#222" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(GENISLIK)}" height="${String(YUKSEKLIK)}">
    <defs>
      <radialGradient id="golge" cx="50%" cy="45%" r="75%">
        <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.45"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="#f4efe2"/>
    ${cizgiler.join('')}${satirlar.join('')}${serbest}
    <rect width="100%" height="100%" fill="url(#golge)"/>
  </svg>`;

  const sayfa = await sharp(Buffer.from(svg)).png().toBuffer();
  // Kagit dokusu + sensor gurultusu: ayni boyutta gauss gurultusu uzerine bindirilir.
  const gurultu = await sharp({
    create: {
      width: GENISLIK,
      height: YUKSEKLIK,
      channels: 3,
      background: '#808080',
      noise: { type: 'gaussian', mean: 128, sigma: 14 },
    },
  })
    .png()
    .toBuffer();
  // Once odak bulanikligi, sonra sensor gurultusu (gercek fotografta gurultu bulaniklastirilmaz).
  const bulanik = await sharp(sayfa).blur(1.1).png().toBuffer();
  return sharp(bulanik)
    .composite([{ input: gurultu, blend: 'overlay' }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

/** Kaynagin 2000 px'e kucultulmus kopyasi ile aday arasindaki ortalama mutlak piksel farki (0-255). */
async function ortalamaFark(kaynak: Buffer, aday: Buffer, genislik: number, yukseklik: number) {
  const a = await sharp(kaynak)
    .resize(genislik, yukseklik, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();
  const b = await sharp(aday)
    .resize(genislik, yukseklik, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();
  let toplam = 0;
  for (let i = 0; i < a.length; i++) toplam += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return toplam / a.length;
}

async function olc(ad: string, kaynak: Buffer, cikti?: string) {
  const meta = await sharp(kaynak).metadata();
  console.log(
    `\n== ${ad}: ${String(meta.width)}x${String(meta.height)}, kaynak ${String(Math.round(kaynak.length / 1024))} KB`,
  );
  console.log('uzun kenar  kalite  boyut(KB)  sure(ms)  ort.fark(0-255)');
  for (const uzun of [1600, 2000, 2400]) {
    for (const kalite of [70, 78, 85]) {
      const t0 = performance.now();
      const veri = await sharp(kaynak)
        .rotate()
        .resize({ width: uzun, height: uzun, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: kalite, mozjpeg: true, chromaSubsampling: '4:2:0' })
        .toBuffer();
      const ms = Math.round(performance.now() - t0);
      const fark = await ortalamaFark(kaynak, veri, 1000, 750);
      const isaret = uzun === 2000 && kalite === 78 ? '  <- secilen' : '';
      console.log(
        `${String(uzun).padStart(10)}  ${String(kalite).padStart(6)}  ${String(Math.round(veri.length / 1024)).padStart(9)}  ${String(ms).padStart(8)}  ${fark.toFixed(2).padStart(9)}${isaret}`,
      );
      if (cikti && uzun === 2000 && kalite === 78) {
        await writeFile(join(cikti, `${ad}-2000-q78.jpg`), veri);
      }
    }
  }
}

if (values.cikti) await mkdir(values.cikti, { recursive: true });
const sayfa = await sentetikDefterSayfasi();
if (values.cikti) await writeFile(join(values.cikti, 'sentetik-kaynak.jpg'), sayfa);
await olc('sentetik-defter', sayfa, values.cikti);
if (values.dosya) await olc('dosya', await readFile(values.dosya), values.cikti);
