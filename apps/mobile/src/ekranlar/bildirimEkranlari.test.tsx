/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion --
   react-test-renderer React 19'da kullanimdan kaldirildi ama React Native icin ek bagimlilik
   gerektirmeyen tek renderer; `props` tipsizdir (any). */
/** Bildirim ekranlari (mock modda): zil, izin karti, kutu, tercihler, uygulama ici afis. */
import { act } from 'react';

import type { BildirimRotasi } from '../bildirim/baglanti';
import { BildirimAfisi } from './bildirim/BildirimAfisi';
import { BildirimIzinKarti } from './bildirim/BildirimIzinKarti';
import { BildirimKutusu } from './bildirim/BildirimKutusu';
import { BildirimTercihleri } from './bildirim/BildirimTercihleri';
import { BildirimZili } from './bildirim/BildirimZili';
import {
  OGRENCI,
  OGRETMEN,
  ac,
  bekle,
  dokun,
  etiketVarMi,
  metinler,
  ortamKur,
  temizle,
  var_,
  type Ortam,
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

afterEach(() => {
  temizle();
  jest.clearAllMocks();
});

async function girisliOrtam(rol: readonly [string, string] = OGRENCI): Promise<Ortam> {
  const o = ortamKur();
  await o.giris(rol[0], rol[1]);
  return o;
}

const noktaSayisi = (r: Parameters<typeof var_>[0]) =>
  r.root.findAll((n) => n.props.testID === 'bildirim-okunmamis-nokta' && typeof n.type === 'string')
    .length;

async function anahtarDegistir(r: Parameters<typeof var_>[0], etiket: string, deger: boolean) {
  const s = r.root.findAll(
    (n) => n.props.accessibilityLabel === etiket && typeof n.props.onValueChange === 'function',
  )[0];
  if (!s) throw new Error(`Anahtar bulunamadi: ${etiket}\n${metinler(r)}`);
  await act(async () => {
    (s.props.onValueChange as (v: boolean) => void)(deger);
  });
  await bekle();
}

describe('BildirimZili', () => {
  it('okunmamis sayisini rozetle gosterir ve rozeti uygulama simgesine yazar', async () => {
    const o = await girisliOrtam();
    const r = await ac(o, <BildirimZili />);
    expect(metinler(r)).toContain('3');
    expect(var_(r, 'bildirim-rozeti')).toBe(true);
    expect(o.push.rozet).toBe(3);
    expect(etiketVarMi(r, 'Bildirimler, 3 okunmamış')).toBe(true);
    await dokun(r, 'Bildirimler, 3 okunmamış');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/bildirimler');
  });

  it('okunmamis yoksa rozet cizilmez', async () => {
    const o = await girisliOrtam();
    await o.adaptorler.bildirim.tumunuOku();
    const r = await ac(o, <BildirimZili />);
    expect(var_(r, 'bildirim-rozeti')).toBe(false);
    expect(o.push.rozet).toBe(0);
  });
});

describe('BildirimIzinKarti', () => {
  it('izin sorulmadiysa aciklama karti gorunur; kabulde sistem izni istenir ve cihaz kaydedilir', async () => {
    const o = await girisliOrtam();
    const kaydet = jest.spyOn(o.adaptorler.bildirim, 'cihazKaydet');
    const kapat = o.servisler.bildirim.baslat();
    await bekle();
    const r = await ac(o, <BildirimIzinKarti />);
    expect(var_(r, 'bildirim-izin-karti')).toBe(true);
    expect(metinler(r)).toContain('Ödev ve cevap bildirimlerini kaçırma');
    expect(o.push.izinIstekSayisi).toBe(0);
    await dokun(r, 'Bildirimleri aç');
    await bekle(30);
    expect(o.push.izinIstekSayisi).toBe(1);
    expect(kaydet).toHaveBeenCalledTimes(1);
    expect(var_(r, 'bildirim-izin-karti')).toBe(false);
    kapat();
  });

  it('ogretmen icin metin personele uyarlanir', async () => {
    const o = await girisliOrtam(OGRETMEN);
    const kapat = o.servisler.bildirim.baslat();
    await bekle();
    const r = await ac(o, <BildirimIzinKarti />);
    expect(metinler(r)).toContain('Gelen soruları ve dersleri kaçırma');
    kapat();
  });

  it('"Simdi degil" karti gizler', async () => {
    const o = await girisliOrtam();
    const kapat = o.servisler.bildirim.baslat();
    await bekle();
    const r = await ac(o, <BildirimIzinKarti />);
    await dokun(r, 'Şimdi değil');
    expect(var_(r, 'bildirim-izin-karti')).toBe(false);
    expect(o.push.izinIstekSayisi).toBe(0);
    kapat();
  });

  it('reddedildiyse nazik kart ayarlara yonlendirir', async () => {
    const o = await girisliOrtam();
    o.push.izin = 'reddedildi';
    const kapat = o.servisler.bildirim.baslat();
    await bekle();
    const r = await ac(o, <BildirimIzinKarti />);
    expect(metinler(r)).toContain('Bildirimler kapalı');
    await dokun(r, 'Ayarları aç');
    expect(o.push.ayarlarAcildi).toBe(1);
    kapat();
  });

  it('izin verildiyse hicbir sey cizilmez', async () => {
    const o = await girisliOrtam();
    o.push.izin = 'verildi';
    const kapat = o.servisler.bildirim.baslat();
    await bekle();
    const r = await ac(o, <BildirimIzinKarti />);
    expect(var_(r, 'bildirim-izin-karti')).toBe(false);
    kapat();
  });
});

describe('BildirimKutusu', () => {
  it('bildirimleri listeler; okunmamislar vurgulanir', async () => {
    const o = await girisliOrtam();
    const r = await ac(o, <BildirimKutusu />);
    const m = metinler(r);
    expect(m).toContain('Sorun cevaplandı');
    expect(m).toContain('Yeni ödev');
    expect(m).toContain('Kurumdan duyuru');
    expect(noktaSayisi(r)).toBe(3);
  });

  it('dokununca hedefe gider ve bildirim okundu olur', async () => {
    const o = await girisliOrtam();
    const rotalar: BildirimRotasi[] = [];
    o.servisler.bildirim.yonlendirmeBagla((x) => rotalar.push(x));
    const r = await ac(o, <BildirimKutusu />);
    const etiket = r.root.findAll(
      (n) =>
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.includes('Sorun cevaplandı') &&
        typeof n.props.onPress === 'function' &&
        !n.props.accessibilityLabel.includes('arşivle'),
    )[0];
    expect(etiket).toBeDefined();
    await act(async () => {
      (etiket!.props.onPress as () => void)();
    });
    await bekle(30);
    expect(rotalar).toEqual([
      { pathname: '/(uygulama)/soru/[id]', params: { id: '0190f3a0-0000-7000-8000-0000000000a1' } },
    ]);
    expect(noktaSayisi(r)).toBe(2);
  });

  it('hedefi olmayan bildirime dokunmak yalnizca okundu yapar (gezinme yok)', async () => {
    const o = await girisliOrtam();
    o.adaptorler.bildirim.tumunuOku = async () => 0;
    const rotalar: BildirimRotasi[] = [];
    o.servisler.bildirim.yonlendirmeBagla((x) => rotalar.push(x));
    const ekle = await o.adaptorler.bildirim.kutu({ limit: 50 });
    const duyuru = ekle.ogeler.find((x) => x.kategori === 'duyuru')!;
    expect(duyuru.derin_baglanti).toBeNull();
    const r = await ac(o, <BildirimKutusu />);
    const dugme = r.root.findAll(
      (n) =>
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.includes('Kurumdan duyuru') &&
        typeof n.props.onPress === 'function' &&
        !n.props.accessibilityLabel.includes('arşivle'),
    )[0]!;
    await act(async () => {
      (dugme.props.onPress as () => void)();
    });
    await bekle();
    expect(rotalar).toEqual([]);
  });

  it('"Tumunu okundu say" tum noktalari kaldirir', async () => {
    const o = await girisliOrtam();
    const r = await ac(o, <BildirimKutusu />);
    await dokun(r, 'Tümünü okundu say');
    await bekle(30);
    expect(noktaSayisi(r)).toBe(0);
    expect(o.push.rozet).toBe(0);
  });

  it('arsivle satiri listeden kaldirir', async () => {
    const o = await girisliOrtam();
    const r = await ac(o, <BildirimKutusu />);
    await dokun(r, 'Sorun cevaplandı bildirimini arşivle');
    await bekle(30);
    expect(metinler(r)).not.toContain('Sorduğun soruya cevap geldi');
    expect(metinler(r)).toContain('Yeni ödev');
  });

  it('hata durumunda tekrar dene gosterir', async () => {
    const o = await girisliOrtam();
    o.adaptorler.bildirim.kutu = () => Promise.reject(new Error('x'));
    const r = await ac(o, <BildirimKutusu />);
    expect(metinler(r)).toContain('Yüklenemedi');
    expect(etiketVarMi(r, 'Tekrar dene')).toBe(true);
  });

  it('bos kutuda aciklayici durum gosterir', async () => {
    const o = await girisliOrtam();
    o.adaptorler.bildirim.kutu = () => Promise.resolve({ ogeler: [], sonrakiImlec: null });
    const r = await ac(o, <BildirimKutusu />);
    expect(metinler(r)).toContain('Henüz bildirimin yok.');
  });

  it('cevrimdisiyken onbellekteki liste kalir ve bilgi notu gosterilir', async () => {
    const o = await girisliOrtam();
    const r = await ac(o, <BildirimKutusu />);
    expect(noktaSayisi(r)).toBe(3);
    // Baglanti kesilir, yenileme hatasi: onbellekteki liste ekranda kalir.
    o.adaptorler.bildirim.kutu = () => Promise.reject(new Error('cevrimdisi'));
    await act(async () => {
      await o.queryClient.invalidateQueries({ queryKey: ['bildirim'] });
    });
    await bekle(30);
    expect(metinler(r)).toContain('Sorun cevaplandı');
    expect(var_(r, 'bildirim-onbellek')).toBe(true);
  });
});

describe('BildirimTercihleri', () => {
  it('kategorileri listeler; sistem kilitlidir', async () => {
    const o = await girisliOrtam();
    const r = await ac(o, <BildirimTercihleri />);
    const m = metinler(r);
    for (const ad of ['Ders', 'Ödev', 'Soru sor', 'Duyurular', 'Hesap ve güvenlik']) {
      expect(m).toContain(ad);
    }
    const sistem = r.root.findAll(
      (n) =>
        n.props.accessibilityLabel === 'Hesap ve güvenlik' &&
        typeof n.props.onValueChange === 'function',
    )[0];
    expect(sistem?.props.disabled).toBe(true);
    expect(m).toContain('Bu bildirim kapatılamaz.');
  });

  it('kategori anahtari sunucuya yazilir', async () => {
    const o = await girisliOrtam();
    const r = await ac(o, <BildirimTercihleri />);
    await anahtarDegistir(r, 'Soru sor', false);
    const liste = await o.adaptorler.bildirim.tercihler();
    expect(liste.find((h) => h.kategori === 'soru' && h.kanal === 'push')?.acik).toBe(false);
    expect(liste.find((h) => h.kategori === 'odev' && h.kanal === 'push')?.acik).toBe(true);
  });

  it('yazim hatasinda onceki deger geri gelir ve hata gosterilir', async () => {
    const o = await girisliOrtam();
    const r = await ac(o, <BildirimTercihleri />);
    o.adaptorler.bildirim.tercihGuncelle = () => Promise.reject(new Error('x'));
    await anahtarDegistir(r, 'Ödev', false);
    const a = r.root.findAll(
      (n) => n.props.accessibilityLabel === 'Ödev' && typeof n.props.onValueChange === 'function',
    )[0];
    expect(a?.props.value).toBe(true);
    expect(metinler(r)).toContain('Değişiklik kaydedilemedi');
  });

  it('sessiz saat: saat adimi, gun ve kapatma', async () => {
    const o = await girisliOrtam();
    const r = await ac(o, <BildirimTercihleri />);
    expect(metinler(r)).toContain('22:00');
    expect(metinler(r)).toContain('08:00');
    await dokun(r, 'Başlangıç saatini 30 dakika ileri al');
    await bekle(30);
    expect((await o.adaptorler.bildirim.ayarlar()).sessiz_baslangic).toBe('22:30');
    await dokun(r, 'Bitiş saatini 30 dakika geri al');
    await bekle(30);
    expect((await o.adaptorler.bildirim.ayarlar()).sessiz_bitis).toBe('07:30');
    await dokun(r, 'Paz');
    await bekle(30);
    expect((await o.adaptorler.bildirim.ayarlar()).sessiz_gunler).toEqual([1, 2, 3, 4, 5, 6]);
    await anahtarDegistir(r, 'Sessiz saatleri kullan', false);
    expect((await o.adaptorler.bildirim.ayarlar()).sessiz_gunler).toEqual([]);
    expect(var_(r, 'sessiz-gun-1')).toBe(false);
  });

  it('ders hatirlatma suresi secilir', async () => {
    const o = await girisliOrtam();
    const r = await ac(o, <BildirimTercihleri />);
    await dokun(r, '2 saat');
    await bekle(30);
    expect((await o.adaptorler.bildirim.ayarlar()).ders_hatirlatma_dk).toBe(120);
    await dokun(r, 'Kapalı');
    await bekle(30);
    expect((await o.adaptorler.bildirim.ayarlar()).ders_hatirlatma_dk).toBe(0);
  });

  it('izin kapaliysa uyari ve izin dugmesi gosterir', async () => {
    const o = await girisliOrtam();
    o.push.izin = 'reddedildi';
    const kapat = o.servisler.bildirim.baslat();
    await bekle();
    const r = await ac(o, <BildirimTercihleri />);
    expect(var_(r, 'tercih-izin-kapali')).toBe(true);
    await dokun(r, 'Ayarları aç');
    expect(o.push.ayarlarAcildi).toBe(1);
    kapat();
  });
});

describe('BildirimAfisi', () => {
  it('onde gelen bildirimi gosterir; dokununca hedefe gider', async () => {
    const o = await girisliOrtam();
    const rotalar: BildirimRotasi[] = [];
    o.servisler.bildirim.yonlendirmeBagla((x) => rotalar.push(x));
    const kapat = o.servisler.bildirim.baslat();
    const r = await ac(o, <BildirimAfisi />);
    expect(var_(r, 'bildirim-afisi')).toBe(false);
    await act(async () => {
      o.push.gelenGonder({
        derinBaglanti: 'kopru://bugun',
        bildirimId: null,
        kurumId: null,
        baslik: 'Yeni ödev',
        govde: 'Matematik dersinden yeni bir ödevin var.',
      });
    });
    expect(var_(r, 'bildirim-afisi')).toBe(true);
    expect(metinler(r)).toContain('Yeni ödev');
    await dokun(r, 'Yeni ödev. Açmak için dokun.');
    expect(rotalar).toEqual([{ pathname: '/bugun', navigate: true }]);
    expect(var_(r, 'bildirim-afisi')).toBe(false);
    kapat();
  });

  it('kapat dugmesi afisi kaldirir', async () => {
    const o = await girisliOrtam();
    const kapat = o.servisler.bildirim.baslat();
    const r = await ac(o, <BildirimAfisi />);
    await act(async () => {
      o.push.gelenGonder({
        derinBaglanti: null,
        bildirimId: null,
        kurumId: null,
        baslik: 'Selam',
        govde: '',
      });
    });
    await dokun(r, 'Bildirimi kapat');
    expect(var_(r, 'bildirim-afisi')).toBe(false);
    kapat();
  });
});
