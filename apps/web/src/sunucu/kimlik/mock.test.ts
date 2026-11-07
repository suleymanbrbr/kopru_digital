import { describe, expect, it } from 'vitest';

import { KimlikHatasi } from './arayuz';
import { MOCK_KOD, MOCK_RIZA_SURUMU, mockKimlik } from './mock';

describe('mock kimlik adaptoru', () => {
  const adaptor = mockKimlik();

  it('gecersiz telefonu ve yanlis kodu reddeder', async () => {
    await expect(adaptor.kodIste('123')).rejects.toMatchObject({ kod: 'telefon_gecersiz' });
    await expect(adaptor.kodDogrula('+905321234567', '000000')).rejects.toBeInstanceOf(
      KimlikHatasi,
    );
  });

  it('riza kabul edilene kadar rizaGerekli doner, sonra kalkar', async () => {
    const { oturumBelirteci } = await adaptor.kodDogrula('+905321234567', MOCK_KOD);
    const ilk = await adaptor.oturumAl(oturumBelirteci);
    expect(ilk.oturum.rizaGerekli).toBe(true);
    expect(ilk.oturum.uyelikler.map((u) => u.rol)).toEqual([
      'ogretmen',
      'yonetici',
      'ogrenci',
      'sahip',
    ]);

    const kabul = await adaptor.rizaKabul(oturumBelirteci, MOCK_RIZA_SURUMU);
    const son = await adaptor.oturumAl(kabul.oturumBelirteci);
    expect(son.oturum.rizaGerekli).toBe(false);
  });

  it('uyelik secimi etkin uyelige yazilir ve belirteci dondurur', async () => {
    const { oturumBelirteci } = await adaptor.kodDogrula('+905321234567', MOCK_KOD);
    const sonuc = await adaptor.oturumAl(oturumBelirteci, { kurumId: 'kurum-atlas' });
    expect(sonuc.oturum.aktifUyelikId).toBe('uyelik-atlas-ogrenci');
    expect(sonuc.oturumBelirteci).toBeDefined();
    await expect(adaptor.oturumAl(oturumBelirteci, { kurumId: 'yok' })).rejects.toMatchObject({
      durum: 403,
    });
  });

  it('gecersiz oturum belirteci 401 verir', async () => {
    await expect(adaptor.oturumAl('bozuk')).rejects.toMatchObject({ durum: 401 });
  });

  it('kurum baglami kapali modulleri disarida birakir', async () => {
    const { oturumBelirteci } = await adaptor.kodDogrula('+905321234567', MOCK_KOD);
    const baglam = await adaptor.kurumBaglami(oturumBelirteci, 'x', 'kurum-mavi');
    expect(baglam.moduller).not.toContain('finans');
    expect(baglam.moduller).toContain('odev');
  });
});
