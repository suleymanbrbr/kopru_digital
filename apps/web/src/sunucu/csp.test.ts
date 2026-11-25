import { describe, expect, it } from 'vitest';

import { cspOlustur, ekKaynaklariOku, sabitBasliklar } from './csp';

describe('cspOlustur', () => {
  it('uretimde eval yok, cerceveleme/object/base kapali', () => {
    const csp = cspOlustur({ uretim: true });
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("default-src 'self'");
  });

  it('gelistirmede eval izinli', () => {
    expect(cspOlustur({ uretim: false })).toContain("'unsafe-eval'");
  });

  it('ek kaynaklar img/media/connect icine girer, script icine girmez', () => {
    const csp = cspOlustur({ uretim: true, ekKaynaklar: ['https://depo.example.com'] });
    const yonerge = (ad: string) => csp.split('; ').find((y) => y.startsWith(`${ad} `)) ?? '';
    expect(yonerge('img-src')).toContain('https://depo.example.com');
    expect(yonerge('connect-src')).toContain('https://depo.example.com');
    expect(yonerge('script-src')).not.toContain('depo.example.com');
  });
});

describe('ekKaynaklariOku', () => {
  it('yalniz http(s) origin kabul eder; enjeksiyon denemeleri atilir', () => {
    expect(
      ekKaynaklariOku(
        'https://a.example.com, *, data:, https://b.example.com/yol; script-src *',
        true,
      ),
    ).toEqual(['https://a.example.com']);
  });

  it('gelistirmede varsayilan yerel depolama', () => {
    expect(ekKaynaklariOku(undefined, false)).toEqual(['http://localhost:9000']);
    expect(ekKaynaklariOku(undefined, true)).toEqual([]);
  });
});

describe('sabitBasliklar', () => {
  it('HSTS yalniz uretimde; diger basliklar her zaman', () => {
    const anahtarlar = (u: boolean) => sabitBasliklar(u).map((b) => b.key);
    expect(anahtarlar(true)).toContain('Strict-Transport-Security');
    expect(anahtarlar(false)).not.toContain('Strict-Transport-Security');
    for (const k of [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(anahtarlar(false)).toContain(k);
    }
  });
});
