/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion --
   react-test-renderer React 19'da kullanimdan kaldirildi ama React Native icin ek bagimlilik
   gerektirmeyen tek renderer; `props` tipsizdir (any). */
/** Hesabim (mock modda): verilerimi indir, hesap silme akisi, bekleyen talep ve geri alma, engel. */
import { t } from '@kopru/i18n';
import { Linking } from 'react-native';

import { veriyiPaylas } from '../hesap/veriDisaAktar';
import { Hesabim } from './hesabim/Hesabim';
import { OgrenciBugun } from './OgrenciBugun';
import {
  OGRENCI,
  ac,
  bekle,
  dokun,
  etiketVarMi,
  metinler,
  ortamKur,
  temizle,
  testIDDokun,
  var_,
  yaz,
} from './testYardimcisi';

const mockYonlendirici = {
  push: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  canGoBack: () => true,
};
jest.mock('expo-router', () => ({
  useRouter: () => mockYonlendirici,
  useLocalSearchParams: () => ({}),
}));
jest.mock('../hesap/veriDisaAktar', () => ({
  veriyiPaylas: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../tema/TemaSaglayici', () => ({
  useTema: () => ({
    sema: 'acik',
    renkler: require('../tema/degiskenler').etkinRenkler('acik', null),
  }),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: () => () => undefined },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../karakter/Companion', () => ({ Companion: () => null }));

afterEach(() => {
  temizle();
  jest.clearAllMocks();
});

const SAHIP_ENGELLI = ['+905551110007', 'uyelik-ogretmen-a'] as const;

describe('Hesabim', () => {
  it('verilerimi indir: JSON paylas sayfasina verilir', async () => {
    const o = ortamKur();
    await o.giris(...OGRENCI);
    const r = await ac(o, <Hesabim />);
    await dokun(r, t('mobil.hesabim.verilerimDugme'));
    expect(veriyiPaylas).toHaveBeenCalledTimes(1);
    const dosya = (veriyiPaylas as jest.Mock).mock.calls[0]![0] as { icerik: string };
    expect(JSON.parse(dosya.icerik)).toHaveProperty('kullanici_id');
  });

  it('silme: dogrulama -> onay -> talep; bekleyen talep ve geri alma', async () => {
    const o = ortamKur();
    await o.giris(...OGRENCI);
    const r = await ac(o, <Hesabim />);
    expect(metinler(r)).toContain('30 gün');
    await testIDDokun(r, 'silme-baslat');
    expect(var_(r, 'silme-dogrulama')).toBe(true);

    // Kod gonderilmeden devam edilemez; yanlis kodla onaya gidilir ama sunucu reddeder.
    await testIDDokun(r, 'silme-kod-gonder');
    await yaz(r, t('mobil.hesabim.kodEtiketi'), '000000');
    await testIDDokun(r, 'silme-devam');
    expect(var_(r, 'silme-onay')).toBe(true);
    await testIDDokun(r, 'silme-gonder');
    expect(metinler(r)).toContain(t('mobil.hesabim.dogrulamaHatali'));
    expect(var_(r, 'silme-dogrulama')).toBe(true);

    await yaz(r, t('mobil.hesabim.kodEtiketi'), '123456');
    await testIDDokun(r, 'silme-devam');
    await testIDDokun(r, 'silme-gonder');
    expect(var_(r, 'silme-bekliyor')).toBe(true);
    expect(var_(r, 'silme-baslat')).toBe(false);

    await testIDDokun(r, 'silme-geri-al');
    expect(var_(r, 'silme-bekliyor')).toBe(false);
    expect(var_(r, 'silme-baslat')).toBe(true);
    expect(metinler(r)).toContain(t('mobil.hesabim.geriAlindi'));
  });

  it('bekleyen talep Bugun ekraninda serit gosterir', async () => {
    const o = ortamKur();
    await o.giris(...OGRENCI);
    await o.adaptorler.hesap.silmeTalebiAc({ yontem: 'otp', kod: '123456' });
    const r = await ac(o, <OgrenciBugun />);
    expect(var_(r, 'silme-serit')).toBe(true);
  });

  it('kurum sahibi engeli: aciklama ve destek, sil dugmesi yok', async () => {
    const o = ortamKur();
    await o.giris(...SAHIP_ENGELLI);
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const r = await ac(o, <Hesabim />);
    expect(var_(r, 'silme-engel')).toBe(true);
    expect(var_(r, 'silme-baslat')).toBe(false);
    expect(etiketVarMi(r, t('mobil.hesabim.destekDugme'))).toBe(true);
    await dokun(r, t('mobil.hesabim.destekDugme'));
    expect(spy).toHaveBeenCalled();
    await bekle();
  });
});
