import { varsayilanKuralKodu } from './denemeTuru';

const kurallar = ['ayt', 'lgs', 'tyt', 'ydt'].map((kod) => ({ kod })); // katalog alfabetik gelir

describe('varsayilanKuralKodu', () => {
  it('gecmis yoksa alfabetik ilk (ayt) degil, sartname sirasindaki ilk tur (lgs)', () => {
    expect(varsayilanKuralKodu(kurallar)).toBe('lgs');
    expect(varsayilanKuralKodu(kurallar, [])).toBe('lgs');
  });

  it('en son girilen deneme turunu secer', () => {
    const gecmis = [
      { kuralKodu: 'tyt', sinavTarihi: '2026-10-01' },
      { kuralKodu: 'ayt', sinavTarihi: '2026-11-15' },
      { kuralKodu: 'tyt', sinavTarihi: '2026-11-01' },
    ];
    expect(varsayilanKuralKodu(kurallar, gecmis)).toBe('ayt');
  });

  it('kurallarda artik olmayan gecmis turu atlanir', () => {
    const gecmis = [
      { kuralKodu: 'eski', sinavTarihi: '2026-11-20' },
      { kuralKodu: 'tyt', sinavTarihi: '2026-11-01' },
    ];
    expect(varsayilanKuralKodu(kurallar, gecmis)).toBe('tyt');
  });

  it('sartname turlerinden hicbiri yoksa katalogdaki ilk; kural yoksa undefined', () => {
    expect(varsayilanKuralKodu([{ kod: 'ozel-a' }, { kod: 'ozel-b' }])).toBe('ozel-a');
    expect(varsayilanKuralKodu([])).toBeUndefined();
  });
});
