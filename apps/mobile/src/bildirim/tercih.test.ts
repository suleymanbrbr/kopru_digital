import { gunDegistir, saatKaydir, sessizSaatAcikMi } from './tercih';

describe('saatKaydir', () => {
  it('ileri ve geri kaydirir, gece yarisini asar', () => {
    expect(saatKaydir('22:00', 30)).toBe('22:30');
    expect(saatKaydir('23:45', 30)).toBe('00:15');
    expect(saatKaydir('00:00', -30)).toBe('23:30');
    expect(saatKaydir('08:00', -30)).toBe('07:30');
  });

  it('gecersiz saati degistirmez', () => {
    expect(saatKaydir('25:00', 30)).toBe('25:00');
    expect(saatKaydir('abc', 30)).toBe('abc');
  });
});

describe('gunDegistir', () => {
  it('acar, kapatir ve siralar', () => {
    expect(gunDegistir([1, 2, 3], 5)).toEqual([1, 2, 3, 5]);
    expect(gunDegistir([1, 2, 3], 2)).toEqual([1, 3]);
    expect(gunDegistir([], 7)).toEqual([7]);
    expect(gunDegistir([4], 4)).toEqual([]);
  });
});

describe('sessizSaatAcikMi', () => {
  it('bos gun listesi kapali demektir', () => {
    expect(sessizSaatAcikMi([])).toBe(false);
    expect(sessizSaatAcikMi([1])).toBe(true);
  });
});
