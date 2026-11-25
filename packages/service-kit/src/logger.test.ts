import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger, GIZLI_ALANLAR, gizliTemizle, urlTemizle } from './logger.js';

describe('urlTemizle', () => {
  it('dogrulama belirtecini maskeler, diger sorguyu korur', () => {
    expect(urlTemizle('/auth/eposta/dogrula?belirtec=abc.def&x=1')).toBe(
      '/auth/eposta/dogrula?belirtec=[gizli]&x=1',
    );
    expect(urlTemizle('/auth/callback/google?state=s&code=c')).toBe(
      '/auth/callback/google?state=[gizli]&code=[gizli]',
    );
    expect(urlTemizle('/v1/hesap/ben')).toBe('/v1/hesap/ben');
  });
});

describe('redaksiyon', () => {
  const yaz = (nesne: Record<string, unknown>): string => {
    let cikti = '';
    const hedef = new Writable({
      write(parca: Buffer, _kodlama, bitti) {
        cikti += parca.toString();
        bitti();
      },
    });
    createLogger('test', { LOG_LEVEL: 'info', NODE_ENV: 'test' }, hedef).info(nesne, 'deneme');
    return cikti;
  };

  it('girdi nesnesini degistirmez; Error ve dizilere dogru davranir', () => {
    const girdi = { liste: [{ telefon: '+905551112233' }], err: new Error('x') };
    const sonuc = gizliTemizle(girdi);
    expect(girdi.liste[0]?.telefon).toBe('+905551112233');
    expect(sonuc.liste[0]).toEqual({ telefon: '[gizli]' });
    expect(sonuc.err).toBe(girdi.err);
    expect(yaz({ olay: { a: [[{ eposta: 'a@b.c' }]] } })).not.toContain('a@b.c');
  });

  it('hata nesnesi ve korelasyon_id loga normal yazilir', () => {
    const satir = yaz({ err: new Error('baglanti koptu'), korelasyon_id: 'k-1' });
    expect(satir).toContain('baglanti koptu');
    expect(satir).toContain('k-1');
  });

  it('bilinen kisisel veri/sir alanlari kokte ve 1-2 seviye altinda maskelenir', () => {
    const DEGER = 'SIZINTI-DEGERI-123';
    for (const alan of GIZLI_ALANLAR) {
      for (const nesne of [
        { [alan]: DEGER },
        { kisi: { [alan]: DEGER } },
        { olay: { veri: { [alan]: DEGER } } },
      ]) {
        const cikti = yaz(nesne);
        expect(cikti, alan).not.toContain(DEGER);
        expect(cikti, alan).toContain('[gizli]');
      }
    }
  });

  it('istek basliklari maskelenir, korelasyon ve hata alanlari korunur', () => {
    const cikti = yaz({
      req: { headers: { authorization: 'Bearer abc', cookie: 'sid=1', 'x-api-key': 'k' } },
      korelasyon_id: 'kor-1',
      err: { type: 'Error', message: 'bozuk' },
    });
    expect(cikti).not.toContain('Bearer abc');
    expect(cikti).not.toContain('sid=1');
    expect(cikti).toContain('kor-1');
    expect(cikti).toContain('bozuk');
  });
});
