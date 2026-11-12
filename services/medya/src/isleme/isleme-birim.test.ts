import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { chromeM4a, chromeWebm, jpegExifli, mp3, png, webmUzat } from '../test/yardimcilar.js';
import { gorselIsle } from './gorsel.js';
import { icerikTuruTespit, mimeUyusuyor } from './icerik.js';
import { oggOpusSuresi, sesSuresiSn, webmSuresi } from './ses.js';

describe('icerik turu (bayt imzasi)', () => {
  it('JPEG, PNG ve MP3 taninir; metin taninmaz', async () => {
    expect(await icerikTuruTespit(await jpegExifli(64, 64))).toBe('image/jpeg');
    expect(await icerikTuruTespit(await png())).toBe('image/png');
    expect(await icerikTuruTespit(mp3(2))).toBe('audio/mpeg');
    expect(await icerikTuruTespit(Buffer.from('merhaba, bu duz metin'))).toBeUndefined();
  });

  it('.jpg diye gonderilen PNG bildirilenle uyusmaz', async () => {
    const tespit = await icerikTuruTespit(await png());
    expect(mimeUyusuyor('image/jpeg', tespit)).toBe(false);
    expect(mimeUyusuyor('image/png', tespit)).toBe(true);
  });

  it('esdeger kapsayici adlari kabul edilir (m4a, webm)', () => {
    expect(mimeUyusuyor('audio/mp4', 'audio/x-m4a')).toBe(true);
    expect(mimeUyusuyor('audio/mp4', 'video/mp4')).toBe(true);
    expect(mimeUyusuyor('audio/webm', 'video/webm')).toBe(true);
    expect(mimeUyusuyor('audio/ogg', 'audio/opus')).toBe(true);
    expect(mimeUyusuyor('audio/mpeg', 'audio/mp4')).toBe(false);
    expect(mimeUyusuyor('image/png', undefined)).toBe(false);
  });
});

describe('gorsel isleme', () => {
  it('EXIF/GPS silinir, yon duzeltilir, uzun kenar sinirlanir', async () => {
    const girdi = await jpegExifli(3000, 2000);
    const once = await sharp(girdi).metadata();
    expect(once.exif).toBeDefined();
    expect(once.orientation).toBe(6);

    const { asil } = await gorselIsle(girdi, 'soru_fotografi', 'image/jpeg', { kucukResim: true });
    const sonra = await sharp(asil.govde).metadata();
    expect(sonra.exif).toBeUndefined();
    expect(sonra.icc).toBeUndefined();
    expect(sonra.orientation).toBeUndefined();
    // yon=6 (90 derece): 3000x2000 -> goruntude 2000x3000; uzun kenar 2000'e iner -> 1333x2000
    expect(asil.yukseklik).toBe(2000);
    expect(asil.genislik).toBeLessThan(asil.yukseklik);
    expect(asil.mime).toBe('image/jpeg');
    expect(asil.govde.includes(Buffer.from('gizli-sahip'))).toBe(false);
  });

  it('kucuk (256) ve orta (1024) WebP uretilir', async () => {
    const { kucukResimler } = await gorselIsle(
      await jpegExifli(2400, 1600),
      'soru_fotografi',
      'image/jpeg',
      { kucukResim: true },
    );
    expect(kucukResimler.map((k) => k.varyant)).toEqual(['kucuk', 'orta']);
    const kucuk = kucukResimler[0];
    const orta = kucukResimler[1];
    expect(Math.max(kucuk?.genislik ?? 0, kucuk?.yukseklik ?? 0)).toBe(256);
    expect(Math.max(orta?.genislik ?? 0, orta?.yukseklik ?? 0)).toBe(1024);
    expect(kucuk?.mime).toBe('image/webp');
    expect((await sharp(kucuk?.govde).metadata()).format).toBe('webp');
  });

  it('kucuk resim istenmezse uretilmez; kucuk gorsel buyutulmez', async () => {
    const sonuc = await gorselIsle(await png(300, 200), 'soru_cizim', 'image/png', {
      kucukResim: false,
    });
    expect(sonuc.kucukResimler).toEqual([]);
    expect(sonuc.asil.mime).toBe('image/png');
    expect(sonuc.asil.genislik).toBe(300);
  });

  it('bozuk gorsel firlatir', async () => {
    await expect(
      gorselIsle(Buffer.from('JFIF degil'), 'soru_fotografi', 'image/jpeg', { kucukResim: false }),
    ).rejects.toThrow();
  });
});

describe('ses suresi', () => {
  it('MP3 suresi saniye olarak okunur', async () => {
    const sure = await sesSuresiSn(mp3(30), 'audio/mpeg');
    expect(sure).toBeGreaterThanOrEqual(29);
    expect(sure).toBeLessThanOrEqual(31);
  });

  it('180 sn uzeri sure olculur', async () => {
    const sure = await sesSuresiSn(mp3(200), 'audio/mpeg');
    expect(sure).toBeGreaterThan(180);
  });

  it('Chrome MediaRecorder WebM/Opus (basliksiz sure) 5 sn olarak olculur (Chrome decodeAudioData: 4.92)', async () => {
    const sure = await sesSuresiSn(chromeWebm(), 'audio/webm');
    expect(sure).toBe(5);
  });

  it('WebM suresi ham olarak da dogru (5 sn kayit, 1 sn parca)', () => {
    const sn = webmSuresi(chromeWebm());
    expect(sn).toBeGreaterThan(4.7);
    expect(sn).toBeLessThan(5.1);
  });

  it('180 sn ustu WebM olculur', async () => {
    const sure = await sesSuresiSn(webmUzat(200_000), 'audio/webm');
    expect(sure).toBe(200);
  });

  it('Safari tipi audio/mp4 (fMP4/AAC, Chrome kaydi) suresi okunur', async () => {
    const sure = await sesSuresiSn(chromeM4a(), 'audio/mp4');
    expect(sure).toBe(3);
  });

  it('WebM olmayan ya da bloksuz veri icin null', () => {
    expect(webmSuresi(Buffer.from('merhaba dunya'))).toBeNull();
    expect(webmSuresi(chromeWebm().subarray(0, 120))).toBeNull();
  });

  it('Ogg/Opus: son sayfa granule konumundan sure (sentetik sayfalar)', () => {
    const sayfa = (granule: bigint, icerik: Buffer) => {
      const bas = Buffer.alloc(27);
      bas.write('OggS', 0, 'latin1');
      bas.writeBigInt64LE(granule, 6);
      return Buffer.concat([bas, icerik]);
    };
    const opusBas = Buffer.alloc(19);
    opusBas.write('OpusHead', 0, 'latin1');
    opusBas.writeUInt16LE(312, 10);
    const ogg = Buffer.concat([
      sayfa(0n, opusBas),
      sayfa(BigInt(48000 * 5 + 312), Buffer.alloc(10)),
    ]);
    expect(oggOpusSuresi(ogg)).toBeCloseTo(5, 3);
    expect(oggOpusSuresi(Buffer.from('OggSxxxx'))).toBeNull();
  });
});
