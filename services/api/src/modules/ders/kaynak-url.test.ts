import { randomBytes } from 'node:crypto';

import { AppError } from '@kopru/service-kit';
import { describe, expect, it } from 'vitest';

import { anahtarCoz, parolaCoz, parolaSifrele } from './kaynak-sifre.js';
import { kaynakUrlCoz } from './kaynak-url.js';

describe('kaynakUrlCoz: saglayici tanima', () => {
  it.each([
    ['https://zoom.us/rec/share/abc', 'zoom'],
    ['https://us02web.zoom.us/rec/share/abc', 'zoom'],
    ['https://drive.google.com/file/d/1/view', 'drive'],
    ['https://docs.google.com/document/d/1', 'drive'],
    ['https://www.youtube.com/watch?v=1', 'youtube'],
    ['https://m.youtube.com/watch?v=1', 'youtube'],
    ['https://youtu.be/abc', 'youtube'],
    ['https://onedrive.live.com/?id=1', 'onedrive'],
    ['https://1drv.ms/v/s!abc', 'onedrive'],
    ['https://okul-my.sharepoint.com/:v:/g/abc', 'onedrive'],
    ['https://ornek.com/ders.pdf', 'diger'],
    ['HTTPS://ZOOM.US/rec/x', 'zoom'],
  ])('%s -> %s', (url, saglayici) => {
    expect(kaynakUrlCoz(url).saglayici).toBe(saglayici);
  });

  it.each([
    'https://evilzoom.us/rec/x',
    'https://zoom.us.evil.com/rec/x',
    'https://notyoutube.com/watch',
    'https://drive.google.com.evil.io/x',
    'https://evil.com/?u=https://zoom.us/x',
  ])('benzer alan adi taninmaz: %s', (url) => {
    expect(kaynakUrlCoz(url).saglayici).toBe('diger');
  });

  it('buyuk harfli sema veritabani CHECK icin kucuge cevrilir, yol korunur', () => {
    expect(kaynakUrlCoz('  HTTPS://ZOOM.US/rec/AbC ').url).toBe('https://ZOOM.US/rec/AbC');
  });

  it('kullanici bilgisiyle alan adi gizleme (zoom.us@evil.com) reddedilir', () => {
    expect(() => kaynakUrlCoz('https://zoom.us@evil.com/x')).toThrow(AppError);
  });

  it.each([
    'http://zoom.us/rec/x',
    'ftp://zoom.us/x',
    'javascript:alert(1)',
    '//zoom.us/x',
    'https://',
    'https:// bosluklu.com',
    'zoom.us/rec/x',
  ])('gecersiz url 422 kaynak_url_gecersiz: %s', (url) => {
    try {
      kaynakUrlCoz(url);
      expect.unreachable('hata beklenirdi');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(422);
      expect((err as AppError).code).toBe('kaynak_url_gecersiz');
    }
  });

  it('2000 karakter sinir: 2000 gecer, 2001 reddedilir', () => {
    const taban = 'https://ornek.com/';
    expect(() => kaynakUrlCoz(taban + 'a'.repeat(2000 - taban.length))).not.toThrow();
    expect(() => kaynakUrlCoz(taban + 'a'.repeat(2001 - taban.length))).toThrow(AppError);
  });
});

describe('parola sifreleme (AES-256-GCM)', () => {
  const anahtar = randomBytes(32);

  it('sifrele -> coz ayni metni verir; ayni parola her seferinde farkli sifreli veri uretir', () => {
    const a = parolaSifrele('Pa$$wörd-123', anahtar);
    const b = parolaSifrele('Pa$$wörd-123', anahtar);
    expect(a.equals(b)).toBe(false);
    expect(a.toString('utf8')).not.toContain('Pa$$w');
    expect(parolaCoz(a, anahtar)).toBe('Pa$$wörd-123');
  });

  it('yanlis anahtar ya da kurcalanmis veri cozulemez (GCM etiketi)', () => {
    const veri = parolaSifrele('gizli', anahtar);
    expect(() => parolaCoz(veri, randomBytes(32))).toThrow();
    const bozuk = Buffer.from(veri);
    bozuk[bozuk.length - 1] = (bozuk[bozuk.length - 1] ?? 0) ^ 1;
    expect(() => parolaCoz(bozuk, anahtar)).toThrow();
  });

  it('anahtar 32 bayt base64 olmali', () => {
    expect(anahtarCoz(randomBytes(32).toString('base64'))?.length).toBe(32);
    expect(anahtarCoz(randomBytes(16).toString('base64'))).toBeNull();
  });
});
