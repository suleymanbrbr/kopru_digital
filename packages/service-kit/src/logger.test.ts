import { describe, expect, it } from 'vitest';

import { urlTemizle } from './logger.js';

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
