import { e164, telefonBicimle, ulusalNumara } from './telefon';

describe('telefon', () => {
  it('cesitli girdileri E.164e cevirir', () => {
    for (const g of ['555 111 00 01', '0555 111 00 01', '+90 555 111 00 01', '905551110001']) {
      expect(e164(g)).toBe('+905551110001');
    }
  });
  it('gecersiz numarayi reddeder', () => {
    for (const g of ['', '123', '4551110001', '55511100']) expect(ulusalNumara(g)).toBeNull();
  });
  it('yazarken bicimler', () => {
    expect(telefonBicimle('5551110001')).toBe('555 111 00 01');
    expect(telefonBicimle('0555')).toBe('555');
    expect(telefonBicimle('55511')).toBe('555 11');
  });
});
