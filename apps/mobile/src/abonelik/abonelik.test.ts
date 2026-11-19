import type { AbonelikOzeti } from '../api/abonelikTipleri';
import { MOCK_PLANLAR } from '../api/mockAbonelik';
import { ApiHata } from '../api/tipler';
import { aktivasyonuBekle } from './aktivasyon';
import { durumOzetle, kalanGun, seritTuru } from './durum';
import { abonelikUyariYoneticisi, hatalariGozle } from './uyari';

const GUN = 86_400_000;
const SIMDI = Date.parse('2026-11-19T09:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function ozet(kismi: Partial<NonNullable<AbonelikOzeti['abonelik']>> | null): AbonelikOzeti {
  const plan = MOCK_PLANLAR[0];
  if (!plan) throw new Error('plan');
  return {
    abonelik: kismi
      ? {
          durum: 'aktif',
          kaynak: 'apple',
          plan,
          periyot: 'aylik',
          denemeBitis: null,
          ekSureBitis: null,
          donemBitis: iso(SIMDI + 30 * GUN),
          iptalIstendi: null,
          otomatikYenileme: true,
          ...kismi,
        }
      : null,
    kullanim: { ogrenci: { mevcut: 1, ustSinir: 15 }, ogretmen: { mevcut: 1, ustSinir: 1 } },
    ucretsiz: kismi === null,
    yazmaKilitli: false,
  };
}

describe('durumOzetle', () => {
  it('kalanGun yukari yuvarlar, gecmise 0 verir', () => {
    expect(kalanGun(iso(SIMDI + 2 * GUN + 1000), SIMDI)).toBe(3);
    expect(kalanGun(iso(SIMDI - 1), SIMDI)).toBe(0);
    expect(kalanGun(null, SIMDI)).toBe(0);
  });

  it('deneme: kalan gun, satin alma acik; <=3 gun uyarisi', () => {
    const d = durumOzetle(
      ozet({ durum: 'deneme', kaynak: 'deneme', denemeBitis: iso(SIMDI + 12 * GUN) }),
      'ios',
      SIMDI,
    );
    expect(d).toMatchObject({
      durum: 'deneme',
      kalanGun: 12,
      satinAlmaKapali: null,
      denemeBitiyor: false,
    });
    const yakin = durumOzetle(
      ozet({ durum: 'deneme', kaynak: 'deneme', denemeBitis: iso(SIMDI + 3 * GUN) }),
      'ios',
      SIMDI,
    );
    expect(yakin.denemeBitiyor).toBe(true);
  });

  it('iyzico / kurumsal / baska magaza etkinse satin alma kapali', () => {
    expect(durumOzetle(ozet({ kaynak: 'iyzico' }), 'ios', SIMDI).satinAlmaKapali).toBe('web');
    expect(durumOzetle(ozet({ kaynak: 'kurumsal' }), 'android', SIMDI).satinAlmaKapali).toBe(
      'kurumsal',
    );
    expect(durumOzetle(ozet({ kaynak: 'apple' }), 'android', SIMDI).satinAlmaKapali).toBe(
      'baska_kanal',
    );
    expect(durumOzetle(ozet({ kaynak: 'apple' }), 'ios', SIMDI)).toMatchObject({
      satinAlmaKapali: null,
      magazaYonetilebilir: true,
    });
  });

  it('sona ermis / iptal edilmis abonelik yeniden satin almaya izin verir', () => {
    expect(
      durumOzetle(ozet({ durum: 'sona_erdi', kaynak: 'iyzico' }), 'ios', SIMDI).satinAlmaKapali,
    ).toBeNull();
  });

  it('iptal: donem sonu gosterilir', () => {
    const d = durumOzetle(
      ozet({
        otomatikYenileme: false,
        iptalIstendi: iso(SIMDI - GUN),
        donemBitis: iso(SIMDI + 9 * GUN),
      }),
      'ios',
      SIMDI,
    );
    expect(d.iptalBitis).toBe(iso(SIMDI + 9 * GUN));
  });

  it('web (magaza yok): satin alma kapali', () => {
    expect(durumOzetle(ozet(null), 'web', SIMDI).satinAlmaKapali).toBe('magaza_yok');
  });

  it('seritTuru: yazma kilidi once, sonra deneme uyarisi', () => {
    const yakin = ozet({ durum: 'deneme', kaynak: 'deneme', denemeBitis: iso(SIMDI + GUN) });
    expect(seritTuru(yakin, false, 'ios', SIMDI)).toBe('deneme_bitiyor');
    expect(seritTuru(yakin, true, 'ios', SIMDI)).toBe('salt_okunur');
    expect(seritTuru({ ...yakin, yazmaKilitli: true }, false, 'ios', SIMDI)).toBe('salt_okunur');
    expect(seritTuru(ozet({ kaynak: 'apple' }), false, 'ios', SIMDI)).toBeNull();
    expect(seritTuru(undefined, false, 'ios', SIMDI)).toBeNull();
  });
});

describe('aktivasyonuBekle', () => {
  function zaman() {
    const z = { t: 0 };
    return {
      z,
      simdi: () => z.t,
      bekle: (ms: number) => Promise.resolve().then(() => void (z.t += ms)),
    };
  }

  it('aktif olunca erken doner', async () => {
    const { simdi, bekle } = zaman();
    let sira = 0;
    const r = await aktivasyonuBekle({
      getir: () =>
        Promise.resolve(
          ozet(++sira < 3 ? { durum: 'deneme', kaynak: 'deneme' } : { durum: 'aktif' }),
        ),
      tamam: (o) => o.abonelik?.durum === 'aktif',
      simdi,
      bekle,
    });
    expect(r.durum).toBe('tamam');
    expect(sira).toBe(3);
  });

  it('15 sn icinde aktif olmazsa zaman_asimi (isleniyor)', async () => {
    const { z, simdi, bekle } = zaman();
    let cagri = 0;
    const r = await aktivasyonuBekle({
      getir: () => {
        cagri++;
        return Promise.resolve(ozet({ durum: 'deneme', kaynak: 'deneme' }));
      },
      tamam: (o) => o.abonelik?.durum === 'aktif',
      simdi,
      bekle,
    });
    expect(r.durum).toBe('zaman_asimi');
    expect(z.t).toBeLessThanOrEqual(15_000);
    expect(cagri).toBeGreaterThan(10);
    expect(cagri).toBeLessThanOrEqual(16);
  });

  it('gecici ag hatasi yoklamayi bozmaz', async () => {
    const { simdi, bekle } = zaman();
    let sira = 0;
    const r = await aktivasyonuBekle({
      getir: () => {
        if (++sira < 3) return Promise.reject(new ApiHata('ag'));
        return Promise.resolve(ozet({ durum: 'aktif' }));
      },
      tamam: (o) => o.abonelik?.durum === 'aktif',
      simdi,
      bekle,
    });
    expect(r.durum).toBe('tamam');
  });
});

describe('abonelikUyariYoneticisi ve hatalariGozle', () => {
  it('402 plan_limiti detayi, 402 abonelik_gerekli ve 403 kurum_askida isaretlenir', () => {
    const y = abonelikUyariYoneticisi();
    y.hataIsle(new Error('ilgisiz'));
    expect(y.depo.al()).toEqual({ saltOkunur: false, askida: false, limit: null });
    y.hataIsle(
      new ApiHata('plan_limiti', undefined, {
        detay: { limit: 'max_ogrenci', mevcut: 15, ust_sinir: 15 },
      }),
    );
    expect(y.depo.al().limit).toMatchObject({
      limit: 'max_ogrenci',
      mevcut: 15,
      ustSinir: 15,
      anahtar: 1,
    });
    y.hataIsle(new ApiHata('plan_limiti'));
    expect(y.depo.al().limit).toMatchObject({ limit: null, mevcut: null, anahtar: 2 });
    y.hataIsle(new ApiHata('abonelik_gerekli'));
    y.hataIsle(new ApiHata('kurum_askida'));
    expect(y.depo.al()).toMatchObject({ saltOkunur: true, askida: true });
    y.sifirla();
    expect(y.depo.al()).toEqual({ saltOkunur: false, askida: false, limit: null });
  });

  it('hatalariGozle: hata bildirilir ve aynen firlatilir; auth haric; basarida dokunmaz', async () => {
    const goren: unknown[] = [];
    const e = new ApiHata('plan_limiti');
    const sarili = hatalariGozle(
      {
        ders: { ekle: () => Promise.reject(e), oku: () => Promise.resolve(5), senk: () => 7 },
        auth: { giris: () => Promise.reject(new ApiHata('kurum_askida')) },
      },
      (x) => goren.push(x),
    );
    await expect(sarili.ders.ekle()).rejects.toBe(e);
    expect(await sarili.ders.oku()).toBe(5);
    expect(sarili.ders.senk()).toBe(7);
    await expect(sarili.auth.giris()).rejects.toBeInstanceOf(ApiHata);
    expect(goren).toEqual([e]);
  });
});
