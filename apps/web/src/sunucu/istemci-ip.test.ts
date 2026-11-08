import { afterEach, describe, expect, it, vi } from 'vitest';

import { istemciIpBasliklari, istemciIpCoz } from './istemci-ip';

describe('istemciIpCoz', () => {
  it('proxy yoksa baslik kullanilmaz', () => {
    expect(istemciIpCoz('203.0.113.9', 0)).toBeNull();
  });

  it('tek proxy: en sagdaki deger alinir, istemcinin yazdigi sol deger yok sayilir', () => {
    expect(istemciIpCoz('9.9.9.9, 203.0.113.9', 1)).toBe('203.0.113.9');
  });

  it('iki proxy: sagdan ikinci deger alinir', () => {
    expect(istemciIpCoz('9.9.9.9, 203.0.113.9, 10.0.0.2', 2)).toBe('203.0.113.9');
  });

  it('eksik zincir ve gecersiz deger reddedilir', () => {
    expect(istemciIpCoz('203.0.113.9', 2)).toBeNull();
    expect(istemciIpCoz('sahte', 1)).toBeNull();
    expect(istemciIpCoz(null, 1)).toBeNull();
  });
});

describe('istemciIpBasliklari', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('ayar yokken baslik uretmez', () => {
    expect(istemciIpBasliklari(new Headers({ 'x-forwarded-for': '203.0.113.9' }))).toEqual({});
  });

  it('ayar varken yalniz gercek adresi tek deger olarak iletir', () => {
    vi.stubEnv('WEB_GUVENILEN_PROXY_SAYISI', '1');
    expect(istemciIpBasliklari(new Headers({ 'x-forwarded-for': '9.9.9.9, 203.0.113.9' }))).toEqual(
      { 'x-forwarded-for': '203.0.113.9' },
    );
  });
});
