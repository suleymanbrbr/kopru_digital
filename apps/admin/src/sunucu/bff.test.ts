import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { ayniKaynakMi } from './bff';

const istek = (basliklar: Record<string, string>) =>
  new NextRequest('http://panel.test/api/oturum/cikis', { method: 'POST', headers: basliklar });

describe('ayniKaynakMi (CSRF)', () => {
  const host = { host: 'panel.test' };

  it('ayni origin kabul; baska/null origin ve benzer alan adi reddedilir', () => {
    expect(ayniKaynakMi(istek({ ...host, origin: 'http://panel.test' }))).toBe(true);
    expect(ayniKaynakMi(istek({ ...host, origin: 'http://evil.test' }))).toBe(false);
    expect(ayniKaynakMi(istek({ ...host, origin: 'null' }))).toBe(false);
    expect(ayniKaynakMi(istek({ ...host, origin: 'http://panel.test.evil.test' }))).toBe(false);
  });

  it('Sec-Fetch-Site cross-site/same-site reddedilir; Origin yoksa Referer denetlenir', () => {
    expect(ayniKaynakMi(istek({ ...host, 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(ayniKaynakMi(istek({ ...host, 'sec-fetch-site': 'same-site' }))).toBe(false);
    expect(ayniKaynakMi(istek({ ...host, 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(ayniKaynakMi(istek({ ...host, referer: 'http://evil.test/x' }))).toBe(false);
  });
});
