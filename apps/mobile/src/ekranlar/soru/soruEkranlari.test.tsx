/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment --
   react-test-renderer React 19'da kullanimdan kaldirildi; `props` tipsizdir (any). */
/**
 * "Soru sor" ekranlari (mock adaptor, gercek yukleme/gonderim yoneticileri): kota, soru detayi
 * (anladim, takip), ogretmen kuyrugu ve cevap, musaitlik, modul gizleme.
 */
import { t } from '@kopru/i18n';
import { act } from 'react';

import { gorunenSekmeler } from '../../nav/yapilandirma';
import { BekleyenSorularKarti } from '../../soru/BugunKartlari';
import {
  OGRENCI,
  OGRETMEN,
  ac,
  bekle,
  dokun,
  etiketVarMi,
  metinler,
  modulAyarla,
  ortamKur,
  temizle,
  testIDDokun,
  var_,
  yaz,
  type Ortam,
} from '../testYardimcisi';
import { CevapEkrani } from './CevapEkrani';
import { GelenSorularEkrani } from './GelenSorularEkrani';
import { SoruDetayEkrani } from './SoruDetayEkrani';
import { SoruSorSekmesi } from './SoruSorSekmesi';
import { SorularimEkrani } from './SorularimEkrani';

const mockYonlendirici = {
  push: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
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
// Yerel modul gerektiren bagimliliklar:
jest.mock('../../soru/CizimEkrani', () => ({ CizimEkrani: () => null }));
jest.mock('../../soru/FotoDuzenle', () => ({ FotoDuzenle: () => null }));
jest.mock('../../soru/SesKaydedici', () => ({ SesKaydedici: () => null }));
jest.mock('../../soru/SesOynatici', () => ({
  SesOynatici: () => null,
  MiniAnlatimOynatici: () => null,
}));
jest.mock('../../foto/al', () => ({
  kameradanAl: jest.fn(),
  galeridenAl: jest.fn(),
}));
jest.mock('../KonuSecici', () => ({
  KonuSecici: () => null,
  KONU_SECIMI_BOS: { bransKodu: null, konuId: null },
}));

afterEach(() => {
  temizle();
  jest.clearAllMocks();
});

async function ogrenciOrtami(): Promise<Ortam> {
  const o = ortamKur();
  await o.giris(...OGRENCI);
  return o;
}
async function ogretmenOrtami(): Promise<Ortam> {
  const o = ortamKur();
  await o.giris(...OGRETMEN);
  return o;
}
async function gonderimBitir(o: Ortam) {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await o.yukleme.calistir();
      o.gonderim.ilerlet();
      await o.kuyruk.bosalt();
    });
    await bekle(5);
  }
}

describe('ogrenci', () => {
  it('Soru sor sekmesi: kota, buyuk dugme ve son sorular gorunur', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <SoruSorSekmesi />);
    const m = metinler(r);
    expect(m).toContain(t('mobil.soru.ogrenci.sorBuyuk'));
    expect(m).toMatch(/soru hakkın kaldı/);
    expect(m).toContain('Üslü sayılarda');
    expect(var_(r, 'soru-sor-dugmesi')).toBe(true);
  });

  it('kota dolunca acik mesaj ve sifirlanma zamani gorunur, soru sorma kapanir', async () => {
    const o = await ogrenciOrtami();
    // Gunluk limit 3: gun icinde 3 soruya ulasana dek gonder (tohumlar sayilabilir; 429 yok sayilir).
    for (let i = 0; i < 4; i++) {
      await o.adaptorler.soru
        .soruSor({
          bransKodu: 'matematik',
          fotograflar: [`f${String(i)}`],
          istekId: `istek-${String(i)}`,
        })
        .catch(() => undefined);
    }
    const r = await ac(o, <SoruSorSekmesi />);
    const m = metinler(r);
    expect(m).toContain(t('mobil.soru.kota.doldu'));
    expect(m).toMatch(/yenilenir/);
    const dugme = r.root.findAll((n) => n.props.testID === 'soru-sor-dugmesi')[0];
    expect(dugme?.props.disabled).toBe(true);
  });

  it('Sorularim: durum suzgeci ve arama', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <SorularimEkrani />);
    expect(metinler(r)).toContain('Üslü sayılarda');
    expect(metinler(r)).toContain('Bileşke kuvveti');
    await testIDDokun(r, 'suzgec-acik');
    expect(metinler(r)).toContain('Bileşke kuvveti');
    expect(metinler(r)).not.toContain('Üslü sayılarda');
    await testIDDokun(r, 'suzgec-cozuldu');
    expect(metinler(r)).toContain('Mol kavramı');
    await dokun(r, t('mobil.soru.liste.tum'));
    await yaz(r, t('mobil.soru.liste.ara'), 'bileşke');
    await bekle(400);
    await bekle(100);
    expect(metinler(r)).toContain('Bileşke kuvveti');
    expect(metinler(r)).not.toContain('Mol kavramı');
  });

  it('detay: cevap, anladim ile cozuldu olur', async () => {
    const o = await ogrenciOrtami();
    const liste = await o.adaptorler.soru.sorularim({ durum: 'cevaplandi' }, null);
    const id = liste.sorular[0]?.id ?? '';
    const r = await ac(o, <SoruDetayEkrani id={id} />);
    expect(metinler(r)).toContain('Tabanlar aynıysa');
    expect(var_(r, 'durum-cevaplandi')).toBe(true);
    await testIDDokun(r, 'anladim');
    await bekle(60);
    expect(var_(r, 'durum-cozuldu')).toBe(true);
    expect(metinler(r)).toContain(t('mobil.soru.detay.anladimOnay'));
    expect(var_(r, 'yeniden-ac')).toBe(true);
  });

  it('detay: hala anlamadim takip sorusunu kuyruktan gonderir', async () => {
    const o = await ogrenciOrtami();
    const liste = await o.adaptorler.soru.sorularim({ durum: 'cevaplandi' }, null);
    const id = liste.sorular[0]?.id ?? '';
    const r = await ac(o, <SoruDetayEkrani id={id} />);
    await testIDDokun(r, 'anlamadim');
    expect(var_(r, 'takip-formu')).toBe(true);
    await yaz(r, t('mobil.soru.detay.takipYaz'), 'Üçüncü adımı anlamadım');
    await testIDDokun(r, 'takip-gonder');
    await gonderimBitir(o);
    const d = await o.adaptorler.soru.soru(id);
    expect(d.durum).toBe('takip_bekliyor');
    expect(d.mesajlar.at(-1)?.metin).toBe('Üçüncü adımı anlamadım');
  });

  it('uygunsuz icerik bildirimi', async () => {
    const o = await ogrenciOrtami();
    const liste = await o.adaptorler.soru.sorularim({}, null);
    const r = await ac(o, <SoruDetayEkrani id={liste.sorular[0]?.id ?? ''} />);
    await testIDDokun(r, 'bildir');
    expect(var_(r, 'bildir-formu')).toBe(true);
    await testIDDokun(r, 'bildir-gonder');
    await bekle(60);
    expect(var_(r, 'bildirildi')).toBe(true);
  });
});

describe('ogretmen', () => {
  it('kuyruk en eski once; sayi ve musaitlik anahtari', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <GelenSorularEkrani />);
    const m = metinler(r);
    expect(m).toContain(t('mobil.soru.ogretmen.bekleyenBaslik', { n: 3 }));
    // En eski (26 saat onceki takip bekleyen) once.
    expect(m.indexOf('Mert Demir')).toBeLessThan(m.indexOf('Deniz Aydın'));
    const anahtar = r.root.findAll(
      (n) =>
        n.props.accessibilityLabel === t('mobil.soru.ogretmen.musait') &&
        typeof n.props.onValueChange === 'function',
    )[0];
    await act(async () => {
      (anahtar?.props.onValueChange as (v: boolean) => void)(true);
    });
    await bekle(60);
    expect((await o.adaptorler.soru.musaitlik()).musait).toBe(false);
  });

  it('Bugun karti: cevap bekleyen sayisi ve en eski soru', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <BekleyenSorularKarti />);
    const m = metinler(r);
    expect(m).toContain(t('mobil.soru.ogretmen.bekleyenBaslik', { n: 3 }));
    expect(var_(r, 'en-eski')).toBe(true);
  });

  it('modul kapaliysa Bugun karti gorunmez', async () => {
    const o = await ogretmenOrtami();
    modulAyarla(o, { soru_sor: false });
    const r = await ac(o, <BekleyenSorularKarti />);
    expect(var_(r, 'bekleyen-sorular')).toBe(false);
  });

  it('cevap: metin ve "derste konusalim" gonderilir, soru cevaplandi olur', async () => {
    const o = await ogretmenOrtami();
    const kuyruk = await o.adaptorler.soru.gelenSorular({}, null);
    const id = kuyruk.sorular.find((s) => s.durum === 'acik')?.id ?? '';
    const r = await ac(o, <CevapEkrani id={id} />);
    // Bos cevap gonderilemez.
    await testIDDokun(r, 'cevap-gonder');
    expect(metinler(r)).toContain(t('mobil.soru.cevap.bos'));
    await yaz(r, t('mobil.soru.cevap.metin'), 'Şöyle çöz');
    const anahtar = r.root.findAll(
      (n) =>
        n.props.accessibilityLabel === t('mobil.soru.cevap.dersteKonusalim') &&
        typeof n.props.onValueChange === 'function',
    )[0];
    await act(async () => {
      (anahtar?.props.onValueChange as (v: boolean) => void)(true);
    });
    await testIDDokun(r, 'cevap-gonder');
    await gonderimBitir(o);
    const d = await o.adaptorler.soru.soru(id);
    expect(d.durum).toBe('cevaplandi');
    const cevap = d.mesajlar.at(-1);
    expect(cevap?.metin).toBe('Şöyle çöz');
    expect(cevap?.dersteKonusalim).toBe(true);
    expect(mockYonlendirici.replace).toHaveBeenCalled();
  });
});

describe('modul gizleme', () => {
  it('soru_sor kapaliyken ogrenci ve ogretmen sekmeleri gizlenir', () => {
    const acik = { soru_sor: true } as never;
    const kapali = { soru_sor: false } as never;
    expect(gorunenSekmeler('ogrenci', acik).some((s) => s.ad === 'soru-sor')).toBe(true);
    expect(gorunenSekmeler('ogrenci', kapali).some((s) => s.ad === 'soru-sor')).toBe(false);
    expect(gorunenSekmeler('ogretmen', acik).some((s) => s.ad === 'sorular')).toBe(true);
    expect(gorunenSekmeler('ogretmen', kapali).some((s) => s.ad === 'sorular')).toBe(false);
  });

  it('modul kapaliyken ogrenci ekrani sorgu yapmaz', async () => {
    const o = await ogrenciOrtami();
    modulAyarla(o, { soru_sor: false });
    const r = await ac(o, <SoruSorSekmesi />);
    expect(metinler(r)).not.toMatch(/soru hakkın kaldı/);
    expect(etiketVarMi(r, t('mobil.soru.ogrenci.sorBuyuk'))).toBe(true);
  });
});
