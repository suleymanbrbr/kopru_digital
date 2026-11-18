/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-return --
   react-test-renderer React 19'da kullanimdan kaldirildi ama React Native icin ek bagimlilik
   gerektirmeyen tek renderer; `props` tipsizdir (any). */
/** Duyuru ekranlari (mock modda): liste, detay, yazma, Bugun karti, kart bazli hata yalitimi. */
import * as WebBrowser from 'expo-web-browser';
import { act } from 'react';
import { Alert } from 'react-native';

import { ApiHata } from '../api/tipler';
import { DuyuruDetay } from './duyuru/DuyuruDetay';
import { DuyuruListesi } from './duyuru/DuyuruListesi';
import { DuyuruYaz } from './duyuru/DuyuruYaz';
import { OgrenciBugun } from './OgrenciBugun';
import { OgretmenBugun } from './OgretmenBugun';
import {
  OGRENCI,
  OGRETMEN,
  ac,
  bekle,
  bul,
  dokun,
  metinler,
  modulAyarla,
  ortamKur,
  temizle,
  testIDDokun,
  var_,
  yaz,
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
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn().mockResolvedValue({ type: 'dismiss' }),
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
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return new Proxy(
    { __esModule: true, default: View },
    { get: (hedef: Record<string, unknown>, ad: string) => (ad in hedef ? hedef[ad] : View) },
  );
});

const D1 = '0190f3a0-0000-7000-8000-0000000000d1'; // sabit, ogrenci okumus
const D2 = '0190f3a0-0000-7000-8000-0000000000d2'; // okunmamis
const D3 = '0190f3a0-0000-7000-8000-0000000000d3'; // taslak

afterEach(() => {
  temizle();
  jest.clearAllMocks();
});

async function girisli(rol: readonly [string, string]): Promise<Ortam> {
  const o = ortamKur();
  await o.giris(rol[0], rol[1]);
  return o;
}

describe('Duyuru listesi (alici)', () => {
  it('sabit duyuru uste gelir, okunmamis vurgulanir, personel sekmeleri ogrenciye yok', async () => {
    const o = await girisli(OGRENCI);
    const r = await ac(o, <DuyuruListesi />);
    const m = metinler(r);
    expect(m.indexOf('Hafta sonu telafi dersi')).toBeLessThan(m.indexOf('Deneme sınavı cuma günü'));
    expect(
      r.root.findAll(
        (n) => n.props.testID === 'duyuru-okunmamis-nokta' && typeof n.type === 'string',
      ),
    ).toHaveLength(1);
    expect(var_(r, 'duyuru-yeni')).toBe(false);
    expect(var_(r, 'duyuru-sekme-yazdiklarim')).toBe(false);
    expect(m).not.toContain('Veli toplantısı'); // taslak alicida yok
  });

  it('dokununca detaya gider', async () => {
    const o = await girisli(OGRENCI);
    const r = await ac(o, <DuyuruListesi />);
    await testIDDokun(r, `duyuru-${D2}`);
    expect(mockYonlendirici.push).toHaveBeenCalledWith({
      pathname: '/duyuru/[id]',
      params: { id: D2 },
    });
  });

  it('servis hatasinda hata durumu ve tekrar dene gosterir', async () => {
    const o = await girisli(OGRENCI);
    o.adaptorler.bildirim.duyurularim = () => Promise.reject(new ApiHata('sunucu'));
    const r = await ac(o, <DuyuruListesi />);
    expect(metinler(r)).toContain('Tekrar dene');
  });
});

describe('Duyuru detayi', () => {
  it('acinca okundu olur ve liste okunmamis vurgusunu kaldirir', async () => {
    const o = await girisli(OGRENCI);
    expect(
      (await o.adaptorler.bildirim.duyurularim()).ogeler.find((x) => x.id === D2)?.okundu_at,
    ).toBeNull();
    const r = await ac(o, <DuyuruDetay id={D2} />);
    await bekle(60);
    expect(metinler(r)).toContain('Deneme sınavı cuma günü');
    const sonra = await o.adaptorler.bildirim.duyurularim();
    expect(sonra.ogeler.find((x) => x.id === D2)?.okundu_at).not.toBeNull();
    expect(var_(r, 'duyuru-yonetim')).toBe(false);
  });

  it('baglanti uygulama ici tarayicida acilir', async () => {
    const o = await girisli(OGRENCI);
    const r = await ac(o, <DuyuruDetay id={D1} />);
    const link = r.root.findAll(
      (n) => n.props.accessibilityRole === 'link' && typeof n.props.onPress === 'function',
    )[0]!;
    await act(async () => {
      (link.props.onPress as () => void)();
    });
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://ornek.com/telafi');
  });
});

describe('Duyuru yazma (ogretmen)', () => {
  it('taslak kaydeder; yayinlayinca onay sorulur ve okunan/alici sayaci gorunur', async () => {
    const o = await girisli(OGRETMEN);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const r = await ac(o, <DuyuruYaz />);
    await yaz(r, 'Başlık', 'Yarın sınav');
    await act(async () => {
      (bul(r, 'duyuru-govde-girdi').props.onChangeText as (v: string) => void)(
        'Kalem getirin https://ornek.com',
      );
    });
    expect(metinler(r)).toContain('31 / 4000');
    // Hedef secilmeden eksik uyarisi
    await testIDDokun(r, 'duyuru-yayinla-dugme');
    expect(metinler(r)).toContain('Başlık, metin ve alıcı seçimi gerekli.');
    expect(alert).not.toHaveBeenCalled();

    await testIDDokun(r, 'duyuru-hedef-g-8a');
    await testIDDokun(r, 'duyuru-yayinla-dugme');
    expect(alert).toHaveBeenCalledTimes(1);
    const dugmeler = alert.mock.calls[0]![2]!;
    await act(async () => {
      dugmeler[1]!.onPress!();
    });
    await bekle(60);
    const yonetim = await o.adaptorler.bildirim.duyuruYonetim();
    const yeni = yonetim.ogeler.find((x) => x.baslik === 'Yarın sınav')!;
    expect(yeni.durum).toBe('yayinda');
    expect(yeni.hedef_id).toBe('g-8a');
    expect(mockYonlendirici.replace).toHaveBeenCalledWith({
      pathname: '/duyuru/[id]',
      params: { id: yeni.id },
    });
  });

  it('yonetici tum kuruma yazabilir; ogretmende "Tum kurum" secenegi yok', async () => {
    const og = await girisli(OGRETMEN);
    const r1 = await ac(og, <DuyuruYaz />);
    expect(var_(r1, 'duyuru-hedef-kurum')).toBe(false);
    temizle();
    const o = ortamKur();
    await o.giris('+905551110003', 'uyelik-yonetici-a');
    const r2 = await ac(o, <DuyuruYaz />);
    expect(var_(r2, 'duyuru-hedef-kurum')).toBe(true);
  });

  it('personel "Yazdiklarim"da okunan / alici sayisini gorur', async () => {
    const o = await girisli(OGRETMEN);
    const r = await ac(o, <DuyuruListesi />);
    await testIDDokun(r, 'duyuru-sekme-yazdiklarim');
    await bekle(60);
    expect(metinler(r)).toContain('5 / 12 kişi okudu');
    expect(metinler(r)).toContain('Taslak');
    expect(var_(r, `duyuru-yazar-${D3}`)).toBe(true);
  });

  it('detayda taslak yayinlanir (onayli) ve arsivlenir', async () => {
    const o = await girisli(OGRETMEN);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const r = await ac(o, <DuyuruDetay id={D3} />);
    await testIDDokun(r, 'duyuru-yayinla');
    await act(async () => {
      alert.mock.calls[0]![2]![1]!.onPress!();
    });
    await bekle(60);
    expect(metinler(r)).toContain('0 / 12 kişi okudu');
    await testIDDokun(r, 'duyuru-arsivle');
    await act(async () => {
      alert.mock.calls[1]![2]![1]!.onPress!();
    });
    await bekle(60);
    const arsiv = await o.adaptorler.bildirim.duyuruYonetim({ durum: 'arsiv' });
    expect(arsiv.ogeler.some((x) => x.id === D3)).toBe(true);
  });

  it('ogrenci yazma uclarinda 403 alir', async () => {
    const o = await girisli(OGRENCI);
    await expect(
      o.adaptorler.bildirim.duyuruTaslak({ baslik: 'x', govde: 'y', hedef_turu: 'kurum' }),
    ).rejects.toMatchObject({ kod: 'izin_yok' });
  });
});

describe('Bugun: duyuru karti ve kart bazli hata', () => {
  it('ogrenci Bugun okunmamis duyuruyu kartta gosterir; modul kapaliysa gizler', async () => {
    const o = await girisli(OGRENCI);
    const r = await ac(o, <OgrenciBugun />);
    expect(var_(r, 'bugun-duyurular')).toBe(true);
    expect(metinler(r)).toContain('1 yeni duyuru');
    await testIDDokun(r, `bugun-duyuru-${D2}`);
    expect(mockYonlendirici.push).toHaveBeenCalledWith({
      pathname: '/duyuru/[id]',
      params: { id: D2 },
    });
    await testIDDokun(r, 'bugun-duyurular-tumu');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/duyurular');
    temizle();

    const k = await girisli(OGRENCI);
    modulAyarla(k, { duyuru: false });
    const r2 = await ac(k, <OgrenciBugun />);
    expect(var_(r2, 'bugun-duyurular')).toBe(false);
  });

  it('motivasyon servisi yanit vermezse yalniz o kart hata gosterir', async () => {
    const o = await girisli(OGRENCI);
    o.adaptorler.motivasyon.benim = () => Promise.reject(new ApiHata('sunucu'));
    o.adaptorler.motivasyon.seri = () => Promise.reject(new ApiHata('sunucu'));
    const r = await ac(o, <OgrenciBugun />);
    await bekle(60);
    const m = metinler(r);
    expect(m.match(/Tekrar dene/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    // Ekranin geri kalani calisir: gorevler, duyuru, eylemler.
    expect(m).toContain('Bugünkü görevler');
    expect(m).toContain('Odaklan');
    expect(m).toContain('Soru sor');
    expect(m).toContain('Deneme sınavı cuma günü');
    expect(m).not.toContain('Yüklenemedi');
  });

  it('ogretmen Bugun: dersler saat sirali, yoklamasi alinmamis isaretli, hizli eylemler', async () => {
    const o = await girisli(OGRETMEN);
    const r = await ac(o, <OgretmenBugun />);
    const m = metinler(r);
    expect(m).toContain('Hızlı eylemler');
    expect(m.indexOf('08:00')).toBeLessThan(m.indexOf('11:00'));
    expect(m).toContain('Yoklaması alınmadı');
    await testIDDokun(r, 'hizli-ders-ekle');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/ders-ekle');
    await testIDDokun(r, 'hizli-odev-ver');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/odev-ver');
    await testIDDokun(r, 'hizli-ogrenci-ekle');
    expect(mockYonlendirici.navigate).toHaveBeenCalledWith('/ogrenciler');
    // Tek dokunusla yoklama: birebir ders satirinda "Geldi".
    await dokun(r, 'Mert Aydın geldi');
    expect(metinler(r)).toContain('Yoklama alındı');
  });

  it('ogretmen Bugun: soru servisi hata verirse yalniz o kart hata gosterir', async () => {
    const o = await girisli(OGRETMEN);
    o.adaptorler.soru.gelenSoruSayisi = () => Promise.reject(new ApiHata('sunucu'));
    const r = await ac(o, <OgretmenBugun />);
    await bekle(60);
    const m = metinler(r);
    expect(m).toContain('Cevap bekleyen sorular');
    expect(m).toContain('Tekrar dene');
    expect(m).toContain('Bugünkü dersler');
    expect(m).toContain('Hızlı eylemler');
  });
});
