import { describe, expect, it } from 'vitest';

import { cihazAdiCoz } from './cihaz-adi.js';

describe('cihazAdiCoz', () => {
  const durumlar: [string, string | null][] = [
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      'iPhone · Safari',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Mac · Chrome',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'Windows · Edge',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
      'Windows · Firefox',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'Android · Chrome',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
      'iPhone · Chrome',
    ],
    ['Kopru-Mobil/1 (ios)', 'iOS · Köprü uygulaması'],
    ['Kopru-Mobil/1 (android)', 'Android · Köprü uygulaması'],
    ['node', null],
    ['curl/8.4.0', null],
    ['', null],
  ];
  it.each(durumlar)('%s', (ua, beklenen) => {
    expect(cihazAdiCoz(ua)).toBe(beklenen);
  });
  it('bos ve null', () => {
    expect(cihazAdiCoz(null)).toBeNull();
    expect(cihazAdiCoz(undefined)).toBeNull();
  });
});
