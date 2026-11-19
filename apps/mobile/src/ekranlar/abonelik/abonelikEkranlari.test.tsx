/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion --
   react-test-renderer React 19'da kullanimdan kaldirildi ama React Native icin ek bagimlilik
   gerektirmeyen tek renderer; `props` tipsizdir (any). */
/** Abonelik ekrani, limit/askı sayfalari, seritler ve platform mesaji (mock adaptor + sahte magaza). */
import { Linking } from 'react-native';

import { mockAbonelikKontrolu } from '../../api/mock';
import { MOCK_PLATFORM_MESAJI } from '../../api/mockAbonelik';
import { ApiHata } from '../../api/tipler';
import { MagazaHatasi, sahteMagazaOlustur } from '../../magaza';
import {
  OGRETMEN,
  ac,
  bekle,
  dokun,
  etiketVarMi,
  metinler,
  ortamKur,
  temizle,
  testIDDokun,
  var_,
  type Ortam,
} from '../testYardimcisi';
import { AbonelikEkrani } from './AbonelikEkrani';
import {
  AbonelikSeridi,
  AskiEkrani,
  PlanLimitiSayfasi,
  PlatformMesajiAfisi,
} from './AbonelikKatmanlari';

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
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../tema/TemaSaglayici', () => ({
  useTema: () => ({
    sema: 'acik',
    renkler: require('../../tema/degiskenler').etkinRenkler('acik', null),
  }),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: () => () => undefined },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const SAHIP = ['+905551110004', 'uyelik-sahip-a'] as const;
const SATIN_AL_BASLANGIC = 'Satın al: Başlangıç, Aylık, ₺299,99';

afterEach(() => {
  temizle();
  jest.clearAllMocks();
});

async function girisli(
  rol: readonly [string, string],
  ...senaryo: Parameters<ReturnType<typeof mockAbonelikKontrolu>['senaryo']>
): Promise<Ortam> {
  const o = ortamKur();
  mockAbonelikKontrolu(o.adaptorler).senaryo(...senaryo);
  await o.giris(rol[0], rol[1]);
  return o;
}

const kontrol = (o: Ortam) => mockAbonelikKontrolu(o.adaptorler);
const magazaDegistir = (o: Ortam, m: ReturnType<typeof sahteMagazaOlustur>) => {
  (o.servisler as { magaza: unknown }).magaza = m;
  return m;
};
const HIZLI = { sureMs: 60, araMs: 10 };

describe('abonelik ekrani: durumlar', () => {
  it('deneme: plan, kalan gun, kullanim cubuklari ve magaza planlari', async () => {
    const o = await girisli(SAHIP, 'deneme');
    const r = await ac(o, <AbonelikEkrani platform="ios" />);
    const m = metinler(r);
    expect(m).toContain('Başlangıç');
    expect(m).toContain('Deneme');
    expect(m).toContain('Denemenin bitmesine 12 gün kaldı.');
    const cubuk = r.root.findAll(
      (n) => n.props.testID === 'kullanim-ogrenci' && typeof n.type === 'string',
    )[0]!;
    expect(cubuk.props.accessibilityLabel).toBe('Öğrenci: 9 / 15');
    expect(cubuk.props.accessibilityValue).toEqual({ min: 0, max: 15, now: 9 });
    expect(etiketVarMi(r, SATIN_AL_BASLANGIC)).toBe(true);
    expect(etiketVarMi(r, 'Satın alımları geri yükle')).toBe(true);
    // Deneme/mağaza dışı abonelik: "aboneliği yönet" yok
    expect(etiketVarMi(r, 'Aboneliği yönet')).toBe(false);
  });

  it.each([
    ['ek_sure', 'Ek süre', 'ek süren 5 gün'],
    ['askida', 'Askıda', 'Aboneliğin askıda'],
    ['iptal', 'Aktif', 'iptal edildi'],
  ] as const)('%s durumu metni', async (senaryo, durum, parca) => {
    const o = await girisli(SAHIP, senaryo);
    const r = await ac(o, <AbonelikEkrani platform="ios" />);
    expect(metinler(r)).toContain(durum);
    expect(metinler(r)).toContain(parca);
  });

  it('sahip olmayan rol ekrani gormez ve abonelik ucu cagrilmaz', async () => {
    const o = await girisli(OGRETMEN, 'deneme');
    const r = await ac(o, <AbonelikEkrani platform="ios" />);
    expect(metinler(r)).toContain('yalnızca kurum sahibi görebilir');
    expect(kontrol(o).ozetCagrilari()).toBe(0);
  });

  it('iyzico / kurumsal / baska magaza: satin alma kapali ve aciklama', async () => {
    for (const [s, parca] of [
      ['aktif_iyzico', 'web sitesinden yönetiliyor'],
      ['kurumsal', 'kurumsal sözleşmeyle'],
    ] as const) {
      const o = await girisli(SAHIP, s);
      const r = await ac(o, <AbonelikEkrani platform="ios" />);
      expect(var_(r, 'satin-alma-kapali')).toBe(true);
      expect(metinler(r)).toContain(parca);
      expect(etiketVarMi(r, SATIN_AL_BASLANGIC)).toBe(false);
      expect(
        r.root.findAll((n) => String(n.props.testID ?? '').startsWith('satin-al-')),
      ).toHaveLength(0);
      temizle();
    }
    const o = await girisli(SAHIP, 'aktif_apple');
    const r = await ac(o, <AbonelikEkrani platform="android" />);
    expect(var_(r, 'satin-alma-kapali')).toBe(true);
    expect(metinler(r)).toContain('başka bir mağazada');
  });

  it('magaza urunu yoksa plan "Yakinda"', async () => {
    const o = await girisli(SAHIP, 'deneme');
    magazaDegistir(o, sahteMagazaOlustur({ teklifler: [] }));
    const r = await ac(o, <AbonelikEkrani platform="ios" />);
    expect(var_(r, 'plan-yakinda-baslangic')).toBe(true);
    expect(metinler(r)).toContain('Yakında');
    expect(etiketVarMi(r, SATIN_AL_BASLANGIC)).toBe(false);
  });

  it('magaza aboneligi: "Aboneligi yonet" platform ayar sayfasini acar', async () => {
    const acilan = jest.spyOn(Linking, 'openURL').mockImplementation(() => Promise.resolve());
    const o = await girisli(SAHIP, 'aktif_apple');
    const r = await ac(o, <AbonelikEkrani platform="ios" />);
    expect(metinler(r)).toContain('Aktif · App Store');
    await dokun(r, 'Aboneliği yönet');
    expect(acilan).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');
    // mevcut plan butonu devre disi
    expect(etiketVarMi(r, 'Mevcut planın')).toBe(true);
  });
});

describe('abonelik ekrani: satin alma akisi (sahte saglayici)', () => {
  it('satin al -> logIn(kurum) -> sunucuda aktivasyon beklenir -> aktif', async () => {
    const o = await girisli(SAHIP, 'deneme');
    const r = await ac(o, <AbonelikEkrani platform="ios" yoklama={{ araMs: 5 }} />);
    await dokun(r, SATIN_AL_BASLANGIC);
    await bekle(60);
    const c = o.magaza.cagrilar;
    expect(c.filter((x) => x.startsWith('logIn')).every((x) => x === 'logIn:kurum-a')).toBe(true);
    expect(c.indexOf('logIn:kurum-a')).toBeLessThan(c.indexOf('satinAl:kopru.baslangic.aylik'));
    expect(metinler(r)).toContain('Aboneliğin etkinleşti');
    expect(metinler(r)).toContain('Aktif · App Store');
    expect(var_(r, 'abonelik-mesaj')).toBe(true);
  });

  it('webhook gelmezse zaman asimi: "isleniyor" mesaji ve Durumu yenile', async () => {
    const o = await girisli(SAHIP, 'deneme');
    magazaDegistir(o, sahteMagazaOlustur()); // sunucu aktivasyonu tetiklenmez
    const r = await ac(o, <AbonelikEkrani platform="ios" yoklama={HIZLI} />);
    await dokun(r, SATIN_AL_BASLANGIC);
    await bekle(150);
    expect(metinler(r)).toContain('Ödemen işleniyor');
    expect(metinler(r)).not.toContain('Aboneliğin etkinleşti');
    expect(etiketVarMi(r, 'Durumu yenile')).toBe(true);
    // webhook sonradan geldi
    kontrol(o).satinAlindi('baslangic', 'apple');
    await dokun(r, 'Durumu yenile');
    expect(metinler(r)).toContain('Aktif · App Store');
  });

  it('kullanici iptal ederse hata degil bilgi mesaji; yoklama yapilmaz', async () => {
    const o = await girisli(SAHIP, 'deneme');
    const m = magazaDegistir(o, sahteMagazaOlustur());
    m.sonraki = { durum: 'iptal' };
    const r = await ac(o, <AbonelikEkrani platform="ios" yoklama={HIZLI} />);
    const once = kontrol(o).ozetCagrilari();
    await dokun(r, SATIN_AL_BASLANGIC);
    expect(metinler(r)).toContain('Satın alma iptal edildi.');
    expect(kontrol(o).ozetCagrilari()).toBe(once);
  });

  it('magaza hatasi: Turkce hata mesaji', async () => {
    const o = await girisli(SAHIP, 'deneme');
    const m = magazaDegistir(o, sahteMagazaOlustur());
    m.sonraki = new MagazaHatasi('satin_alma_basarisiz');
    const r = await ac(o, <AbonelikEkrani platform="ios" yoklama={HIZLI} />);
    await dokun(r, SATIN_AL_BASLANGIC);
    expect(metinler(r)).toContain('Satın alma tamamlanamadı');
  });

  it('geri yukle: aktif abonelik bulunursa basari, bulunmazsa bilgi', async () => {
    const o = await girisli(SAHIP, 'deneme');
    const bulunmaz = magazaDegistir(o, sahteMagazaOlustur());
    const r = await ac(o, <AbonelikEkrani platform="ios" yoklama={HIZLI} />);
    await dokun(r, 'Satın alımları geri yükle');
    await bekle(120);
    expect(bulunmaz.cagrilar).toContain('geriYukle');
    expect(metinler(r)).toContain('etkin bir abonelik bulunamadı');
  });

  it('geri yukle: magaza aboneligi bulunursa sunucuda aktif gorunur', async () => {
    const o = await girisli(SAHIP, 'deneme');
    magazaDegistir(
      o,
      sahteMagazaOlustur({
        geriYuklendi: () => {
          kontrol(o).satinAlindi('baslangic', 'apple');
        },
      }),
    );
    const r = await ac(o, <AbonelikEkrani platform="ios" yoklama={HIZLI} />);
    await dokun(r, 'Satın alımları geri yükle');
    await bekle(60);
    expect(metinler(r)).toContain('Aboneliğin geri yüklendi.');
  });
});

describe('limit, askı, şerit ve platform mesajı', () => {
  it('plan limiti: sahibe "Planini yukselt" abonelik ekranina gider', async () => {
    const o = await girisli(SAHIP, 'limit_dolu');
    o.servisler.abonelikUyari.hataIsle(
      new ApiHata('plan_limiti', undefined, {
        detay: { limit: 'max_ogrenci', mevcut: 15, ust_sinir: 15 },
      }),
    );
    const r = await ac(o, <PlanLimitiSayfasi />);
    expect(metinler(r)).toContain('Öğrenci sınırı: 15 / 15');
    await dokun(r, 'Planını yükselt');
    expect(mockYonlendirici.replace).toHaveBeenCalledWith('/abonelik');
    expect(o.servisler.abonelikUyari.depo.al().limit).toBeNull();
  });

  it('plan limiti sayfasi aciksa yeni olaylar yok sayilir; sayfa kapaninca (yana kaydirma dahil) temizlenir', async () => {
    const o = await girisli(SAHIP, 'limit_dolu');
    const limit = (ust: number) =>
      new ApiHata('plan_limiti', undefined, {
        detay: { limit: 'max_ogrenci', mevcut: ust, ust_sinir: ust },
      });
    o.servisler.abonelikUyari.hataIsle(limit(15));
    await ac(o, <PlanLimitiSayfasi />);
    o.servisler.abonelikUyari.hataIsle(limit(99));
    expect(o.servisler.abonelikUyari.depo.al().limit).toMatchObject({ mevcut: 15, anahtar: 1 });
    temizle(); // sayfa unmount (dugmesiz kapanis)
    expect(o.servisler.abonelikUyari.depo.al().limit).toBeNull();
    o.servisler.abonelikUyari.hataIsle(limit(20));
    expect(o.servisler.abonelikUyari.depo.al().limit).toMatchObject({ mevcut: 20, anahtar: 2 });
  });

  it('plan limiti: diger rollere "kurum sahibine bildir", yukseltme dugmesi yok', async () => {
    const o = await girisli(OGRETMEN, 'limit_dolu');
    o.servisler.abonelikUyari.hataIsle(
      new ApiHata('plan_limiti', undefined, {
        detay: { limit: 'max_ogretmen', mevcut: 1, ust_sinir: 1 },
      }),
    );
    const r = await ac(o, <PlanLimitiSayfasi />);
    expect(metinler(r)).toContain('kurum sahibine');
    expect(etiketVarMi(r, 'Planını yükselt')).toBe(false);
    await dokun(r, 'Tamam');
    expect(mockYonlendirici.back).toHaveBeenCalled();
  });

  it('mock yazma 402 plan_limiti hatasi uyari durumunu besler', async () => {
    const o = await girisli(OGRETMEN, 'limit_dolu');
    await expect(o.adaptorler.ders.dersOlustur({} as never)).rejects.toMatchObject({
      kod: 'plan_limiti',
    });
    // Servisler katmaninda hatalariGozle sarar; burada dogrudan adaptor hatasi:
    o.servisler.abonelikUyari.hataIsle(kontrol(o).yazmaHatasi());
    expect(o.servisler.abonelikUyari.depo.al().limit?.mevcut).toBe(15);
  });

  it('kurum_askida: ask i ekrani, tekrar dene isareti kaldirir', async () => {
    const o = await girisli(OGRETMEN, 'kurum_askida');
    o.servisler.abonelikUyari.hataIsle(new ApiHata('kurum_askida'));
    const r = await ac(o, <AskiEkrani />);
    expect(var_(r, 'aski-ekrani')).toBe(true);
    expect(metinler(r)).toContain('Kurumun askıya alındı');
    expect(metinler(r)).toContain('Verilerin silinmedi');
    await dokun(r, 'Tekrar dene');
    expect(o.servisler.abonelikUyari.depo.al().askida).toBe(false);
  });

  it('salt okunur seridi: abonelik_gerekli sonrasi tum rollerde; sahibe dokununca abonelik ekrani', async () => {
    const ogr = await girisli(OGRETMEN, 'salt_okunur');
    ogr.servisler.abonelikUyari.hataIsle(new ApiHata('abonelik_gerekli'));
    const r1 = await ac(ogr, <AbonelikSeridi />);
    expect(var_(r1, 'abonelik-serit')).toBe(true);
    expect(metinler(r1)).toContain('yeni kayıt ekleyemezsin');
    temizle();

    const o = await girisli(SAHIP, 'salt_okunur');
    const r2 = await ac(o, <AbonelikSeridi />);
    expect(metinler(r2)).toContain('Aboneliği yenile');
    await testIDDokun(r2, 'abonelik-serit');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/abonelik');
  });

  it('deneme bitisine <=3 gun: yalniz sahibe afis; 12 gunde yok', async () => {
    const yakin = await girisli(SAHIP, 'deneme_bitiyor');
    const r = await ac(yakin, <AbonelikSeridi />);
    expect(metinler(r)).toContain('Denemenin bitmesine 2 gün kaldı');
    temizle();
    const uzak = await girisli(SAHIP, 'deneme');
    expect(var_(await ac(uzak, <AbonelikSeridi />), 'abonelik-serit')).toBe(false);
    temizle();
    const ogr = await girisli(OGRETMEN, 'deneme_bitiyor');
    expect(var_(await ac(ogr, <AbonelikSeridi />), 'abonelik-serit')).toBe(false);
    expect(kontrol(ogr).ozetCagrilari()).toBe(0);
  });

  it('platform mesaji: gorunur, kapatilinca mesaj kimligiyle hatirlanir, yeni mesaj yeniden gorunur', async () => {
    const o = await girisli(OGRETMEN, 'mesaj');
    const r = await ac(o, <PlatformMesajiAfisi />);
    expect(metinler(r)).toContain('Planlı bakım');
    await testIDDokun(r, 'platform-mesaji-kapat');
    expect(var_(r, 'platform-mesaji')).toBe(false);
    temizle();

    // yeniden acilista ayni mesaj kapali kalir
    const r2 = await ac(o, <PlatformMesajiAfisi />);
    expect(var_(r2, 'platform-mesaji')).toBe(false);
    temizle();

    // yeni kimlikli mesaj gorunur
    kontrol(o).mesajiAyarla({ ...MOCK_PLATFORM_MESAJI, id: 'yeni-mesaj', baslik: 'Yeni duyuru' });
    o.servisler.queryClient.clear();
    const r3 = await ac(o, <PlatformMesajiAfisi />);
    expect(metinler(r3)).toContain('Yeni duyuru');
  });

  it('platform mesaji yoksa afis cizilmez', async () => {
    const o = await girisli(OGRETMEN, 'deneme');
    const r = await ac(o, <PlatformMesajiAfisi />);
    expect(var_(r, 'platform-mesaji')).toBe(false);
  });
});
