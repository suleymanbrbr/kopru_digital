import { describe, expect, it } from 'vitest';

import { EK_EN_FAZLA_BAYT, dosyaBoyutuMetni, ekDosyasiniDenetle, ekPdfMi } from './ek';

describe('ek dosya on kontrolu', () => {
  it('PDF ve JPEG/PNG/WebP kabul edilir; HEIC, SVG ve belge turleri reddedilir', () => {
    for (const type of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) {
      expect(ekDosyasiniDenetle({ type, size: 1000 }), type).toBeNull();
    }
    for (const type of ['image/heic', 'image/svg+xml', 'application/zip', '']) {
      expect(ekDosyasiniDenetle({ type, size: 1000 }), type).toBe('tur');
    }
  });

  it('bos dosya ve sinir asimi reddedilir; sinirin kendisi kabul edilir', () => {
    expect(ekDosyasiniDenetle({ type: 'application/pdf', size: 0 })).toBe('bos');
    expect(ekDosyasiniDenetle({ type: 'application/pdf', size: EK_EN_FAZLA_BAYT })).toBeNull();
    expect(ekDosyasiniDenetle({ type: 'application/pdf', size: EK_EN_FAZLA_BAYT + 1 })).toBe(
      'buyuk',
    );
  });

  it('boyut metni Turkce ondaliklidir', () => {
    expect(dosyaBoyutuMetni(512)).toBe('1 KB');
    expect(dosyaBoyutuMetni(348_160)).toBe('340 KB');
    expect(dosyaBoyutuMetni(1_258_291)).toBe('1,2 MB');
    expect(ekPdfMi('application/pdf')).toBe(true);
    expect(ekPdfMi('image/png')).toBe(false);
  });
});
