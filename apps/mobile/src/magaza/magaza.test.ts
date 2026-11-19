import type { AbonelikPlani } from '../api/abonelikTipleri';
import { MOCK_PLANLAR } from '../api/mockAbonelik';
import { magazaSaglayiciSec } from './index';
import { revenueCatSaglayicisi, type RevenueCatModulu } from './revenuecat';
import { sahteMagazaOlustur } from './sahte';
import { aboneligiYonetUrl, MagazaHatasi } from './tipler';

const plan = (
  kod: string,
  magazaUrunKodlari: AbonelikPlani['magazaUrunKodlari'],
): AbonelikPlani => ({
  kod,
  ad: kod,
  kurumTuru: 'kurum',
  aylikFiyatKurus: 1,
  yillikFiyatKurus: null,
  maxOgrenci: 1,
  maxOgretmen: 1,
  magazaUrunKodlari,
});
const PLANLAR = [plan('kurum', { apple: 'kopru.kurum.aylik' }), plan('bos', null)];

describe('magazaSaglayiciSec', () => {
  const taban = { planlar: () => Promise.resolve(MOCK_PLANLAR) };
  it('anahtar yoksa sahte', () => {
    expect(
      magazaSaglayiciSec({ ...taban, apiAnahtari: '', expoGo: false, platform: 'ios' }).tur,
    ).toBe('sahte');
  });
  it('Expo Go ya da web: anahtar olsa da sahte (native modul yuklenmez)', () => {
    expect(
      magazaSaglayiciSec({ ...taban, apiAnahtari: 'appl_x', expoGo: true, platform: 'ios' }).tur,
    ).toBe('sahte');
    expect(
      magazaSaglayiciSec({ ...taban, apiAnahtari: 'appl_x', expoGo: false, platform: 'web' }).tur,
    ).toBe('sahte');
  });
  it('anahtar + desteklenen platform: RevenueCat (tembel; secim modulu yuklemez)', () => {
    expect(
      magazaSaglayiciSec({ ...taban, apiAnahtari: 'appl_x', expoGo: false, platform: 'android' })
        .tur,
    ).toBe('revenuecat');
  });
});

function sahteModul() {
  const cagrilar: string[] = [];
  const modul: RevenueCatModulu = {
    configure: (c) => cagrilar.push(`configure:${c.apiKey}`),
    logIn: (id) => Promise.resolve(void cagrilar.push(`logIn:${id}`)),
    logOut: () => Promise.resolve(void cagrilar.push('logOut')),
    getOfferings: () =>
      Promise.resolve({
        all: {
          default: {
            availablePackages: [
              {
                identifier: '$rc_monthly',
                product: { identifier: 'kopru.kurum.aylik', priceString: '₺4.999,99' },
              },
              { identifier: 'x', product: { identifier: 'ilgisiz.urun', priceString: '₺1' } },
            ],
          },
        },
      }),
    purchasePackage: () => Promise.resolve({}),
    restorePurchases: () => Promise.resolve({}),
  };
  return { modul, cagrilar };
}

describe('revenueCatSaglayicisi', () => {
  it('tembel configure bir kez; logIn kurum kimligiyle, tekrar cagri etkisiz', async () => {
    const { modul, cagrilar } = sahteModul();
    const s = revenueCatSaglayicisi({
      apiAnahtari: 'k',
      planlar: () => Promise.resolve(PLANLAR),
      kanal: 'apple',
      modul: () => modul,
    });
    expect(cagrilar).toEqual([]);
    await s.logIn('kurum-1');
    await s.logIn('kurum-1');
    expect(cagrilar).toEqual(['configure:k', 'logIn:kurum-1']);
    await s.logOut();
    expect(cagrilar.at(-1)).toBe('logOut');
  });

  it('teklifler: yalniz api urun koduyla eslenen urunler; kodu olmayan plan teklifsiz', async () => {
    const { modul } = sahteModul();
    const s = revenueCatSaglayicisi({
      apiAnahtari: 'k',
      planlar: () => Promise.resolve(PLANLAR),
      kanal: 'apple',
      modul: () => modul,
    });
    const t = await s.teklifleriGetir();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ planKodu: 'kurum', periyot: 'aylik', fiyatMetni: '₺4.999,99' });
  });

  it('kullanici iptali: durum iptal; diger hata: MagazaHatasi', async () => {
    const { modul } = sahteModul();
    const s = revenueCatSaglayicisi({
      apiAnahtari: 'k',
      planlar: () => Promise.resolve(PLANLAR),
      kanal: 'apple',
      modul: () => modul,
    });
    const teklif = { urunId: 'u', planKodu: 'kurum', periyot: 'aylik' as const, fiyatMetni: '' };
    modul.purchasePackage = () =>
      Promise.reject(Object.assign(new Error('x'), { userCancelled: true }));
    expect(await s.satinAl(teklif)).toEqual({ durum: 'iptal' });
    modul.purchasePackage = () => Promise.reject(new Error('odeme reddedildi'));
    await expect(s.satinAl(teklif)).rejects.toBeInstanceOf(MagazaHatasi);
  });
});

describe('sahte magaza ve yonetim baglantisi', () => {
  it('sonraki sonucu tek kullanimlik; satinAlindi kancasi kurumla cagrilir', async () => {
    const alinan: string[] = [];
    const m = sahteMagazaOlustur({ satinAlindi: (t, k) => void alinan.push(`${t.planKodu}:${k}`) });
    await m.logIn('kurum-9');
    const teklif = (await m.teklifleriGetir())[0];
    if (!teklif) throw new Error('teklif yok');
    m.sonraki = { durum: 'iptal' };
    expect(await m.satinAl(teklif)).toEqual({ durum: 'iptal' });
    expect(await m.satinAl(teklif)).toEqual({ durum: 'tamam' });
    expect(alinan).toEqual([`${teklif.planKodu}:kurum-9`]);
  });

  it('abonelik yonetim adresi platform ayar sayfasidir (web satin alma degil)', () => {
    expect(aboneligiYonetUrl('ios')).toBe('https://apps.apple.com/account/subscriptions');
    expect(aboneligiYonetUrl('android')).toContain('play.google.com/store/account/subscriptions');
  });
});
