import { describe, expect, it } from 'vitest';

import { hexNormalle, okunurMetinRengi, vurguDegiskenleri, vurguUygula } from './vurgu';

describe('vurgu', () => {
  it('hex rengi normallestirir, gecersizi reddeder', () => {
    expect(hexNormalle('0e9f8e')).toBe('#0E9F8E');
    expect(hexNormalle('#0E9F8E')).toBe('#0E9F8E');
    expect(hexNormalle('red')).toBeNull();
    expect(hexNormalle(null)).toBeNull();
  });

  it('acik zeminde koyu, koyu zeminde beyaz metin secer', () => {
    expect(okunurMetinRengi('#FFC38A')).toBe('#161B26');
    expect(okunurMetinRengi('#1A4FAD')).toBe('#FFFFFF');
  });

  it('kurum rengi CSS degiskenlerine donusur; gecersizde bos doner', () => {
    expect(vurguDegiskenleri('#7C5CE0')).toEqual({
      '--vurgu': '#7C5CE0',
      '--vurgu-uzeri': '#FFFFFF',
    });
    expect(vurguDegiskenleri('degil')).toEqual({});
  });

  it('uygula ve geri al', () => {
    const kok = document.createElement('html');
    const geriAl = vurguUygula(kok, '#0E9F8E');
    expect(kok.style.getPropertyValue('--vurgu')).toBe('#0E9F8E');
    geriAl();
    expect(kok.style.getPropertyValue('--vurgu')).toBe('');
  });
});
