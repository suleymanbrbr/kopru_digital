/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion --
   react-test-renderer React 19'da kullanimdan kaldirildi ama React Native icin ek bagimlilik
   gerektirmeyen tek renderer; `props` tipsizdir (any). */
/**
 * Ogretmen degerlendirmesi, kaynak onerisi ve kocluk mobil ekranlari (mock mod): Bugun hatirlatma
 * karti, yazma/duzenleme/geri cekme, kocluk gorunumu, kaynak onerisi, ogrencinin "Ogretmenim"i
 * (gizli degerlendirme gorunmez), oneriden "Soru cozdum" on doldurma ve "Basladi" dongusu.
 */
import { act } from 'react';
import { Linking } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';

import { MOCK_GIZLI_YORUM, MOCK_GORUNUR_YORUM } from '../api/mockDegerlendirme';
import { MOCK_SAAT_DILIMI } from '../api/mockOperasyon';
import { bugunTarihi } from '../lib/saat';
import { DegerlendirmeFormu } from './degerlendirme/DegerlendirmeFormu';
import { KaynakOneriFormu } from './degerlendirme/KaynakOneriFormu';
import { KoclukEkrani } from './degerlendirme/KoclukEkrani';
import { OgretmenimEkrani } from './degerlendirme/OgretmenimEkrani';
import { GunlukSoruFormu } from './gunluk/GunlukSoruFormu';
import { OgrenciBugun } from './OgrenciBugun';
import { OgrenciKartiEkrani } from './OgrenciKartiEkrani';
import { OgretmenBugun } from './OgretmenBugun';
import {
  OGRENCI,
  OGRETMEN,
  ac,
  bekle,
  bul,
  dokun,
  metinler,
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
jest.mock('../foto/al', () => ({
  kameradanAl: jest.fn(() => Promise.resolve({ durum: 'iptal' })),
  galeridenAl: jest.fn(() => Promise.resolve({ durum: 'iptal' })),
}));
jest.mock('../foto/hazirla', () => ({ fotoHazirla: jest.fn() }));

afterEach(() => {
  temizle();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

const DENIZ = 'uyelik-ogrenci-a';
const bugun = () => bugunTarihi(MOCK_SAAT_DILIMI);

async function ogretmenOrtami(): Promise<Ortam> {
  const o = ortamKur();
  await o.giris(...OGRETMEN);
  return o;
}
async function ogrenciOrtami(): Promise<Ortam> {
  const o = ortamKur();
  await o.giris(...OGRENCI);
  return o;
}

/** Anahtar (Switch) degerini degistirir. */
function anahtar(r: ReactTestRenderer, etiket: string, deger: boolean) {
  const n = r.root.findAll(
    (x) => x.props.accessibilityLabel === etiket && typeof x.props.onValueChange === 'function',
  )[0];
  if (!n) throw new Error(`Anahtar bulunamadi: ${etiket}`);
  act(() => {
    (n.props.onValueChange as (v: boolean) => void)(deger);
  });
}

describe('Bugun: bu hafta degerlendirmesi olmayan ogrenciler (ogretmen)', () => {
  it('kart sayaci ve ogrenciler; ogrenciye dokununca yazma ekrani acilir', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <OgretmenBugun />);
    expect(var_(r, 'degerlendirme-hatirlatma')).toBe(true);
    expect(metinler(r)).toContain('5 öğrenciden 5 tanesi bekliyor');
    // Ilk dort ogrenci listelenir, kalani "N daha var".
    expect(metinler(r)).toContain('1 öğrenci daha var');
    // En eski / hic yazilmayan once: Deniz (gecen hafta yazildi) listenin sonundadir.
    await testIDDokun(r, 'hatirlatma-ogrenci-ogr-elif');
    expect(mockYonlendirici.push).toHaveBeenCalledWith({
      pathname: '/degerlendirme-yaz',
      params: { ogrenciId: 'ogr-elif', ad: 'Elif Kaya' },
    });
  });

  it('yazilan ogrenci karttan duser; hepsi yazilinca bos metin', async () => {
    const o = await ogretmenOrtami();
    const d = o.adaptorler.degerlendirme;
    const h = await d.hatirlatma();
    for (const x of h.ogrenciler) {
      await d.degerlendirmeYaz(x.ogrenciId, {
        donemBaslangic: bugun(),
        olcekler: { calisma_duzeni: 3 },
        ogrenciGorur: false,
      });
    }
    const r = await ac(o, <OgretmenBugun />);
    expect(var_(r, 'degerlendirme-hatirlatma-bos')).toBe(true);
    expect(metinler(r)).toContain('Bu hafta tüm öğrencilerin için değerlendirme yazdın.');
  });

  it('ogrenci kartinda Kocluk bolumu ve hizli yaz', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <OgrenciKartiEkrani ogrenciId={DENIZ} ad="Deniz Yılmaz" />);
    expect(var_(r, 'kocluk-girisi')).toBe(true);
    await testIDDokun(r, 'kocluk-ac');
    expect(mockYonlendirici.push).toHaveBeenCalledWith({
      pathname: '/kocluk',
      params: { ogrenciId: DENIZ, ad: 'Deniz Yılmaz' },
    });
    await testIDDokun(r, 'kocluk-hizli-yaz');
    expect(mockYonlendirici.push).toHaveBeenLastCalledWith({
      pathname: '/degerlendirme-yaz',
      params: { ogrenciId: DENIZ, ad: 'Deniz Yılmaz' },
    });
  });
});

describe('Degerlendirme formu', () => {
  it('donem bu hafta on secili; 4 olcek, yorum, kaydet: kayit olusur ve ogrenci gorsun KAPALI gider', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <DegerlendirmeFormu ogrenciId={DENIZ} ad="Deniz Yılmaz" />);
    expect(metinler(r)).toContain('Bu hafta (');
    // Hepsi tek dokunus: 4 olcek + kaydet.
    await testIDDokun(r, 'olcek-calisma_duzeni-4');
    await testIDDokun(r, 'olcek-derse_katilim-5');
    await testIDDokun(r, 'olcek-odev_disiplini-3');
    await testIDDokun(r, 'olcek-anlama_duzeyi-2');
    await yaz(r, 'Yorum', 'Derse hazırlıklı geliyor.');
    // Anahtar kapali: aciklama gorunur ve ogrenci gormez.
    expect(metinler(r)).toContain('Kapalı: bu yorumu yalnızca öğrencinin öğretmenleri');
    await testIDDokun(r, 'degerlendirme-kaydet');
    expect(mockYonlendirici.back).toHaveBeenCalled();
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    const yeni = k.degerlendirmeler.degerlendirmeler.find(
      (x) => x.yorum === 'Derse hazırlıklı geliyor.',
    );
    expect(yeni).toMatchObject({
      ogrenciGorur: false,
      benim: true,
      olcekler: {
        calisma_duzeni: 4,
        derse_katilim: 5,
        odev_disiplini: 3,
        anlama_duzeyi: 2,
      },
    });
    expect(yeni?.donemBitis).not.toBe(yeni?.donemBaslangic);
  });

  it('olcege tekrar dokunmak secimi kaldirir; yalniz bir olcekle kaydedilir', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <DegerlendirmeFormu ogrenciId={DENIZ} ad="Deniz" />);
    await testIDDokun(r, 'olcek-calisma_duzeni-4');
    await testIDDokun(r, 'olcek-calisma_duzeni-4');
    await testIDDokun(r, 'degerlendirme-kaydet');
    expect(metinler(r)).toContain('Yorum yaz ya da en az bir ölçek seç.');
    expect(mockYonlendirici.back).not.toHaveBeenCalled();
    await testIDDokun(r, 'olcek-anlama_duzeyi-5');
    await testIDDokun(r, 'degerlendirme-kaydet');
    expect(mockYonlendirici.back).toHaveBeenCalled();
  });

  it('bos form: hata gosterir, kayit olusmaz', async () => {
    const o = await ogretmenOrtami();
    const once = (await o.adaptorler.degerlendirme.kocluk(DENIZ)).degerlendirmeler.degerlendirmeler;
    const r = await ac(o, <DegerlendirmeFormu ogrenciId={DENIZ} ad="Deniz" />);
    await testIDDokun(r, 'degerlendirme-kaydet');
    expect(metinler(r)).toContain('Yorum yaz ya da en az bir ölçek seç.');
    const sonra = (await o.adaptorler.degerlendirme.kocluk(DENIZ)).degerlendirmeler
      .degerlendirmeler;
    expect(sonra).toHaveLength(once.length);
  });

  it('ogrenci gorsun acilinca aciklama degisir ve kayit gorunur gider', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <DegerlendirmeFormu ogrenciId={DENIZ} ad="Deniz" />);
    anahtar(r, 'Öğrenci görsün', true);
    expect(metinler(r)).toContain('bildirim alır');
    await testIDDokun(r, 'olcek-calisma_duzeni-5');
    await yaz(r, 'Yorum', 'Harika hafta!');
    await testIDDokun(r, 'degerlendirme-kaydet');
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    expect(
      k.degerlendirmeler.degerlendirmeler.find((x) => x.yorum === 'Harika hafta!'),
    ).toMatchObject({ ogrenciGorur: true });
  });

  it('ders secimi istege baglidir ve govdeye girer', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <DegerlendirmeFormu ogrenciId={DENIZ} ad="Deniz" />);
    await testIDDokun(r, 'degerlendirme-ders-ac');
    await testIDDokun(r, 'degerlendirme-ders-matematik');
    await testIDDokun(r, 'olcek-calisma_duzeni-3');
    await testIDDokun(r, 'degerlendirme-kaydet');
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    expect(
      k.degerlendirmeler.degerlendirmeler.find(
        (x) => x.benim && x.bransKodu === 'matematik' && x.olcekler.calisma_duzeni === 3,
      ),
    ).toBeDefined();
  });

  it('cevrimdisiyken kuyruklanmaz: acik hata mesaji, kayit olusmaz', async () => {
    const o = await ogretmenOrtami();
    const once = (await o.adaptorler.degerlendirme.kocluk(DENIZ)).degerlendirmeler.degerlendirmeler;
    const r = await ac(o, <DegerlendirmeFormu ogrenciId={DENIZ} ad="Deniz" />);
    o.cevrimici.deger = false;
    await testIDDokun(r, 'olcek-calisma_duzeni-3');
    await testIDDokun(r, 'degerlendirme-kaydet');
    expect(var_(r, 'degerlendirme-hata')).toBe(true);
    expect(mockYonlendirici.back).not.toHaveBeenCalled();
    o.cevrimici.deger = true;
    const sonra = (await o.adaptorler.degerlendirme.kocluk(DENIZ)).degerlendirmeler
      .degerlendirmeler;
    expect(sonra).toHaveLength(once.length);
  });

  it('duzenleme: mevcut degerler yuklenir, kaydedince guncellenir; eski surum 409 mesaji', async () => {
    const o = await ogretmenOrtami();
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    const benim = k.degerlendirmeler.degerlendirmeler.find((x) => x.benim && x.duzenlenebilir)!;
    const r = await ac(o, <DegerlendirmeFormu ogrenciId={DENIZ} ad="Deniz" duzelt={benim.id} />);
    expect(metinler(r)).toContain('Değerlendirmeyi düzenle');
    const yorum = bul(r, 'degerlendirme-yorum');
    expect(yorum.props.value).toBe(MOCK_GORUNUR_YORUM);
    expect(metinler(r)).toContain('Yazıldıktan sonra 7 gün içinde düzenlenebilir.');
    // Baska bir cihazdan surum degisti: kaydetme 409 surum cakismasi.
    await o.adaptorler.degerlendirme.degerlendirmeDuzenle(benim.id, {
      yorum: 'Baska cihaz',
      surum: benim.surum,
    });
    await yaz(r, 'Yorum', 'Telefondan düzenledim.');
    await testIDDokun(r, 'degerlendirme-kaydet');
    expect(metinler(r)).toContain('Kayıt bu arada değişti. Güncel hali yüklendi');
    expect(mockYonlendirici.back).not.toHaveBeenCalled();
    // Guncel hali (diger cihazdaki yorum) forma yeniden yuklenir ve tekrar kaydedilebilir.
    expect(bul(r, 'degerlendirme-yorum').props.value).toBe('Baska cihaz');
    await yaz(r, 'Yorum', 'Telefondan düzenledim.');
    await testIDDokun(r, 'degerlendirme-kaydet');
    expect(mockYonlendirici.back).toHaveBeenCalled();
  });

  it('duzenleme basarili: yorum ve gorunurluk guncellenir', async () => {
    const o = await ogretmenOrtami();
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    const benim = k.degerlendirmeler.degerlendirmeler.find((x) => x.benim && x.duzenlenebilir)!;
    const r = await ac(o, <DegerlendirmeFormu ogrenciId={DENIZ} ad="Deniz" duzelt={benim.id} />);
    await yaz(r, 'Yorum', 'Güncel yorum');
    anahtar(r, 'Öğrenci görsün', false);
    await testIDDokun(r, 'degerlendirme-kaydet');
    expect(mockYonlendirici.back).toHaveBeenCalled();
    const sonra = (await o.adaptorler.degerlendirme.kocluk(DENIZ)).degerlendirmeler
      .degerlendirmeler;
    expect(sonra.find((x) => x.id === benim.id)).toMatchObject({
      yorum: 'Güncel yorum',
      ogrenciGorur: false,
      surum: benim.surum + 1,
    });
  });
});

describe('Kocluk ekrani (personel)', () => {
  it('tek ekranda zaman cizelgesi, olcekler, kaynaklar, oneriler, konu ve plan ozeti', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <KoclukEkrani ogrenciId={DENIZ} ad="Deniz Yılmaz" />);
    const m = metinler(r);
    // Zaman cizelgesi: iki ogretmen, gorunurluk isaretli.
    expect(var_(r, 'zaman-cizelgesi')).toBe(true);
    expect(m).toContain('Ayşe Kaya (sen)');
    expect(m).toContain('Mehmet Demir');
    expect(m).toContain(MOCK_GIZLI_YORUM);
    expect(m).toContain('Öğrenci görüyor');
    expect(m).toContain('Öğrenciye kapalı');
    // Son 4 hafta: okunakli liste.
    expect(var_(r, 'olcek-egilimi')).toBe(true);
    expect(m).toContain('Çalışma düzeni 4/5');
    expect(m).toContain('4 hafta ortalaması');
    // Kullanilan ve onerilen kaynaklar.
    expect(m).toContain('Esen Soru Bankası');
    expect(m).toContain('2 / 4 test');
    expect(m).toContain('Okul fasikülü');
    expect(m).toContain('Başladı');
    expect(m).toContain('Henüz başlamadı');
    expect(m).toContain('Takip edilemez');
    // Konu analizi ve plan/odev ozeti.
    expect(var_(r, 'konu-ozeti')).toBe(true);
    expect(m).toContain('Son 30 gün:');
    expect(m).toContain('Bu haftanın planı: 2 / 5 görev tamam');
    expect(m).toContain('Açık ödev: 2 (geciken: 1)');
    await testIDDokun(r, 'kocluk-konu-analizi-ac');
    expect(mockYonlendirici.push).toHaveBeenCalledWith({
      pathname: '/konu-analizi',
      params: { ogrenciId: DENIZ, ad: 'Deniz Yılmaz' },
    });
  });

  it('yaz ve oner dugmeleri ilgili ekranlara gider', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <KoclukEkrani ogrenciId={DENIZ} ad="Deniz Yılmaz" />);
    await testIDDokun(r, 'kocluk-degerlendirme-yaz');
    expect(mockYonlendirici.push).toHaveBeenCalledWith({
      pathname: '/degerlendirme-yaz',
      params: { ogrenciId: DENIZ, ad: 'Deniz Yılmaz' },
    });
    await testIDDokun(r, 'kocluk-kaynak-oner');
    expect(mockYonlendirici.push).toHaveBeenLastCalledWith({
      pathname: '/kaynak-oner',
      params: { ogrenciId: DENIZ, ad: 'Deniz Yılmaz' },
    });
  });

  it('yalniz yazar duzenler ve geri ceker (baskasinin kartinda dugme yok); geri cekme iki adimli', async () => {
    const o = await ogretmenOrtami();
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    const liste = k.degerlendirmeler.degerlendirmeler;
    const benim = liste.find((x) => x.benim && x.duzenlenebilir)!;
    const baskasi = liste.find((x) => !x.benim)!;
    const eski = liste.find((x) => x.benim && !x.duzenlenebilir)!;
    const r = await ac(o, <KoclukEkrani ogrenciId={DENIZ} ad="Deniz Yılmaz" />);
    expect(var_(r, `degerlendirme-duzenle-${benim.id}`)).toBe(true);
    expect(var_(r, `degerlendirme-geri-cek-${benim.id}`)).toBe(true);
    // 7 gunu gecen kendi kaydi duzenlenemez ama geri cekilebilir.
    expect(var_(r, `degerlendirme-duzenle-${eski.id}`)).toBe(false);
    expect(var_(r, `degerlendirme-geri-cek-${eski.id}`)).toBe(true);
    // Baskasinin kaydinda ikisi de yok (sahip/yonetici degil).
    expect(var_(r, `degerlendirme-duzenle-${baskasi.id}`)).toBe(false);
    expect(var_(r, `degerlendirme-geri-cek-${baskasi.id}`)).toBe(false);

    await testIDDokun(r, `degerlendirme-duzenle-${benim.id}`);
    expect(mockYonlendirici.push).toHaveBeenCalledWith({
      pathname: '/degerlendirme-yaz',
      params: { ogrenciId: DENIZ, ad: 'Deniz Yılmaz', duzelt: benim.id },
    });

    await testIDDokun(r, `degerlendirme-geri-cek-${benim.id}`);
    expect(var_(r, `geri-cek-onay-${benim.id}`)).toBe(true);
    // Vazgec: kayit yerinde.
    await dokun(r, 'Vazgeç');
    expect(var_(r, `geri-cek-onay-${benim.id}`)).toBe(false);
    expect(var_(r, `degerlendirme-${benim.id}`)).toBe(true);
    // Onayla: kayit cizelgeden kalkar ve ogrenci artik gormez.
    await testIDDokun(r, `degerlendirme-geri-cek-${benim.id}`);
    await testIDDokun(r, `geri-cek-evet-${benim.id}`);
    await bekle();
    expect(var_(r, `degerlendirme-${benim.id}`)).toBe(false);
    expect(metinler(r)).not.toContain(MOCK_GORUNUR_YORUM);
    await o.giris(...OGRENCI);
    expect((await o.adaptorler.degerlendirme.degerlendirmelerim()).degerlendirmeler).toHaveLength(
      0,
    );
  });

  it('21+ degerlendirme: Daha fazla goster ikinci sayfayi yukler', async () => {
    const o = await ogretmenOrtami();
    const d = o.adaptorler.degerlendirme;
    for (let i = 0; i < 18; i++) {
      await d.degerlendirmeYaz(DENIZ, {
        donemBaslangic: bugun(),
        olcekler: { calisma_duzeni: 3 },
        yorum: `Toplu ${String(i)}`,
        ogrenciGorur: false,
      });
    }
    const r = await ac(o, <KoclukEkrani ogrenciId={DENIZ} ad="Deniz Yılmaz" />);
    const kartSayisi = () =>
      r.root.findAll(
        (n) => typeof n.type === 'string' && /^degerlendirme-dg-\d+$/.test(String(n.props.testID)),
      ).length;
    expect(kartSayisi()).toBe(20);
    expect(var_(r, 'zaman-daha-fazla')).toBe(true);
    await testIDDokun(r, 'zaman-daha-fazla');
    expect(var_(r, 'zaman-daha-fazla')).toBe(false);
    expect(kartSayisi()).toBe(21);
    expect(metinler(r)).toContain('Önceki dönem: ödev düzeni oturmadı');
  });

  it('kendi onerisini geri ceker; baskasinin onerisinde dugme yok', async () => {
    const o = await ogretmenOrtami();
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    const benim = k.oneriler.find((x) => x.benim)!;
    const baskasi = k.oneriler.find((x) => !x.benim)!;
    const r = await ac(o, <KoclukEkrani ogrenciId={DENIZ} ad="Deniz Yılmaz" />);
    expect(var_(r, `oneri-geri-cek-${baskasi.id}`)).toBe(false);
    await testIDDokun(r, `oneri-geri-cek-${benim.id}`);
    await testIDDokun(r, `oneri-geri-cek-evet-${benim.id}`);
    expect(var_(r, `oneri-${benim.id}`)).toBe(false);
  });

  it('degerlendirme olmayan ogrenci icin bos durum', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <KoclukEkrani ogrenciId="ogr-zeynep" ad="Zeynep" />);
    expect(metinler(r)).toContain('Henüz değerlendirme yok');
    expect(metinler(r)).toContain('Son 4 haftada ölçek verisi yok.');
    expect(metinler(r)).toContain('Henüz kaynak önerilmedi');
  });
});

describe('Kaynak oner (personel)', () => {
  it('kitaptan test: kitap, test, konu notu; oneri ogrencinin listesine duser', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <KaynakOneriFormu ogrenciId={DENIZ} ad="Deniz" />);
    await dokun(r, 'Kitaptan test');
    await testIDDokun(r, 'oneri-kitap-kitap-fen');
    await testIDDokun(r, 'oneri-test-kitap-fen-t1');
    await yaz(r, 'Not (isteğe bağlı)', 'Önce ilk 5 soru');
    await testIDDokun(r, 'oneri-gonder');
    expect(mockYonlendirici.back).toHaveBeenCalled();
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    expect(k.oneriler.find((x) => x.kaynakTestId === 'kitap-fen-t1')).toMatchObject({
      tur: 'kaynak_kitap_testi',
      notMetni: 'Önce ilk 5 soru',
      benim: true,
    });
    await o.giris(...OGRENCI);
    const benim = await o.adaptorler.degerlendirme.kaynakOnerilerim();
    expect(benim.some((x) => x.kaynakTestId === 'kitap-fen-t1')).toBe(true);
  });

  it('dogrulama: kitap yok, test yok, gecersiz baglanti, baslik yok', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <KaynakOneriFormu ogrenciId={DENIZ} ad="Deniz" />);
    await testIDDokun(r, 'oneri-gonder');
    expect(metinler(r)).toContain('Bir kitap seç.');
    await dokun(r, 'Bağlantı');
    await yaz(r, 'Bağlantı', 'javascript:alert(1)');
    await testIDDokun(r, 'oneri-gonder');
    expect(metinler(r)).toContain('http ya da https ile başlayan geçerli bir adres gir.');
    expect(metinler(r)).toContain('Bir başlık yaz.');
    expect(mockYonlendirici.back).not.toHaveBeenCalled();
    await yaz(r, 'Bağlantı', 'https://example.com/konu');
    await yaz(r, 'Başlık', 'Konu anlatımı');
    await testIDDokun(r, 'oneri-gonder');
    expect(mockYonlendirici.back).toHaveBeenCalled();
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    expect(k.oneriler.find((x) => x.baslik === 'Konu anlatımı')).toMatchObject({
      tur: 'link',
      baglantiUrl: 'https://example.com/konu',
      basladi: null,
    });
  });

  it('serbest kaynak', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <KaynakOneriFormu ogrenciId={DENIZ} ad="Deniz" />);
    await dokun(r, 'Serbest kaynak');
    await yaz(r, 'Başlık', 'Okul fasikülü 3');
    await testIDDokun(r, 'oneri-gonder');
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    expect(k.oneriler.find((x) => x.baslik === 'Okul fasikülü 3')).toMatchObject({
      tur: 'serbest',
    });
  });
});

describe('Ogretmenim (ogrenci)', () => {
  it('yalniz kendisine gorunur degerlendirme gelir; gizli yorum, gorunurluk ve yazar kimligi yok', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OgretmenimEkrani bolum="degerlendirmeler" />);
    const m = metinler(r);
    expect(var_(r, 'ogretmenim-degerlendirmeler')).toBe(true);
    expect(m).toContain(MOCK_GORUNUR_YORUM);
    expect(m).toContain('Ayşe Kaya');
    expect(m).not.toContain('GIZLI');
    expect(m).not.toContain('Mehmet Demir');
    // Ogrenci gorunurluk rozeti ya da duzenle/geri cek gormez.
    expect(m).not.toContain('Öğrenci görüyor');
    expect(m).not.toContain('Öğrenciye kapalı');
    expect(m).not.toContain('Geri çek');
    expect(m).not.toContain('Düzenle');
    expect(
      r.root.findAll(
        (n) =>
          typeof n.type === 'string' &&
          String(n.props.testID ?? '').startsWith('benim-degerlendirme-'),
      ),
    ).toHaveLength(1);
  });

  it('onerilen kaynaklar: Basladi durumu, Soru cozdum ve link icin Baglantiyi ac', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OgretmenimEkrani />);
    const m = metinler(r);
    expect(m).toContain('Öğretmenimin önerdikleri');
    expect(m).toContain('Esen Soru Bankası · Test 3: Kareköklü sayılar');
    expect(m).toContain('Önce ilk 10 soruyu çöz.');
    expect(m).toContain('Başladı');
    expect(m).toContain('Henüz başlamadı');
    // Gizli yorumu yazan ogretmenin ONERISI gorunur (oneri her zaman ogrenciye aittir).
    expect(m).toContain('Mehmet Demir');
    expect(m).not.toContain('GIZLI');
    const oneriler = await o.adaptorler.degerlendirme.kaynakOnerilerim();
    const test3 = oneriler.find((x) => x.kaynakTestId === 'kitap-esen-t3')!;
    const link = oneriler.find((x) => x.tur === 'link')!;
    expect(var_(r, `oneri-baglanti-${test3.id}`)).toBe(false);
    expect(var_(r, `oneri-soru-cozdum-${link.id}`)).toBe(false);
    // Ogrenci geri cekme dugmesi gormez.
    expect(var_(r, `oneri-geri-cek-${test3.id}`)).toBe(false);
    await testIDDokun(r, `oneri-soru-cozdum-${test3.id}`);
    expect(mockYonlendirici.push).toHaveBeenCalledWith({
      pathname: '/gunluk-soru-yeni',
      params: {
        kaynakKitapId: 'kitap-esen',
        kaynakKitapAd: 'Esen Soru Bankası',
        kaynakTestId: 'kitap-esen-t3',
        kaynakTestAd: 'Test 3: Kareköklü sayılar',
        bransKodu: 'matematik',
        konuId: 'konu-m-koklu',
      },
    });
  });

  it('link onerisi: guvenli baglanti sistemde acilir', async () => {
    const o = await ogrenciOrtami();
    const ac_ = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const r = await ac(o, <OgretmenimEkrani />);
    const link = (await o.adaptorler.degerlendirme.kaynakOnerilerim()).find(
      (x) => x.tur === 'link',
    )!;
    await testIDDokun(r, `oneri-baglanti-${link.id}`);
    expect(ac_).toHaveBeenCalledWith('https://example.com/uslu-sayilar');
  });

  it('bildirim derin baglantisi: ilgili bolum acik gelir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OgretmenimEkrani bolum="degerlendirmeler" />);
    expect(var_(r, 'ogretmenim-degerlendirmeler')).toBe(true);
    expect(var_(r, 'ogretmenim-oneriler')).toBe(false);
    await testIDDokun(r, 'ogretmenim-sekme-oneriler');
    expect(var_(r, 'ogretmenim-oneriler')).toBe(true);
  });

  it('degerlendirme olmayan ogrenci: bos durum metni', async () => {
    const o = await ogrenciOrtami();
    // Geri cekilince ogrenciden kalkar.
    await o.giris(...OGRETMEN);
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    for (const x of k.degerlendirmeler.degerlendirmeler) {
      if (x.benim) await o.adaptorler.degerlendirme.degerlendirmeGeriCek(x.id);
    }
    await o.giris(...OGRENCI);
    const r = await ac(o, <OgretmenimEkrani bolum="degerlendirmeler" />);
    expect(metinler(r)).toContain('Öğretmenin henüz seninle paylaştığı bir değerlendirme yok.');
  });

  it('Bugun karti: bekleyen oneri sayisi ve Ogretmenim girisi', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OgrenciBugun />);
    expect(var_(r, 'ogretmenim-girisi')).toBe(true);
    expect(metinler(r)).toContain('1 kaynak önerisi seni bekliyor.');
    await testIDDokun(r, 'bugun-ogretmenim');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/ogretmenim');
  });
});

describe('Oneriden "Soru cozdum" (on doldurma ve Basladi dongusu)', () => {
  it('kitap + test + ders + konu on secili; kaydedince ogretmen koclukta Basladi gorur', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(
      o,
      <GunlukSoruFormu
        bransKodu="matematik"
        konuId="konu-m-koklu"
        kaynakKitapId="kitap-esen"
        kaynakKitapAd="Esen Soru Bankası"
        kaynakTestId="kitap-esen-t3"
        kaynakTestAd="Test 3: Kareköklü sayılar"
      />,
    );
    // Kaynak on secili: test secimi kapali, secili test gorunur.
    expect(var_(r, 'secili-test')).toBe(true);
    expect(metinler(r)).toContain('Esen Soru Bankası · Test 3: Kareköklü sayılar');
    expect(metinler(r)).toContain('Kareköklü Sayılar');
    await dokun(r, 'Orta');
    await yaz(r, 'Doğru sayısı', '9');
    await yaz(r, 'Yanlış sayısı', '4');
    await yaz(r, 'Boş sayısı', '2');
    await testIDDokun(r, 'gunluk-kaydet');
    await bekle(60);
    const kayitlar = (await o.adaptorler.gunlukSoru.kayitlarim({ gun: bugun() })).kayitlar;
    expect(kayitlar.find((k) => k.kaynakTestId === 'kitap-esen-t3')).toMatchObject({
      kaynakKitapId: 'kitap-esen',
      bransKodu: 'matematik',
      konuId: 'konu-m-koklu',
      dogru: 9,
    });
    // Ogretmen koclukta artik "Basladi" gorur.
    await o.giris(...OGRETMEN);
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    expect(k.oneriler.find((x) => x.kaynakTestId === 'kitap-esen-t3')).toMatchObject({
      basladi: true,
      kayitSayisi: 1,
    });
    const rk = await ac(o, <KoclukEkrani ogrenciId={DENIZ} ad="Deniz Yılmaz" />);
    expect(metinler(rk)).not.toContain('Henüz başlamadı');
  });

  it('gonderim tamamlaninca acik Ogretmenim listesi "Basladi"ya guncellenir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OgretmenimEkrani />);
    const test3 = (await o.adaptorler.degerlendirme.kaynakOnerilerim()).find(
      (x) => x.kaynakTestId === 'kitap-esen-t3',
    )!;
    expect(bul(r, `oneri-durum-${test3.id}`).props.accessibilityLabel).toBe('Henüz başlamadı');
    await o.gonderim.baslat({
      tur: 'gunluk_soru',
      baslik: 'Kareköklü Sayılar',
      govde: {
        tur: 'gunluk_soru',
        gun: bugun(),
        bransKodu: 'matematik',
        konuId: 'konu-m-koklu',
        zorluk: 'orta',
        kaynakTestId: 'kitap-esen-t3',
        dogru: 4,
        yanlis: 1,
        bos: 0,
        fotograflar: [],
      },
      dosyalar: {},
    });
    await bekle(80);
    expect(bul(r, `oneri-durum-${test3.id}`).props.accessibilityLabel).toContain('Başladı');
  });

  it('yalniz kitap onerildiyse kitap secili ve test listesi acik gelir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(
      o,
      <GunlukSoruFormu
        bransKodu="matematik"
        kaynakKitapId="kitap-esen"
        kaynakKitapAd="Esen Soru Bankası"
      />,
    );
    expect(var_(r, 'test-listesi')).toBe(true);
    expect(var_(r, 'test-kitap-esen-t1')).toBe(true);
    expect(metinler(r)).toContain('Test 3: Kareköklü sayılar');
  });

  it('serbest oneri: kaynak metni on dolu', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <GunlukSoruFormu kaynakMetin="Okul fasikülü" />);
    const girdi = bul(r, 'kaynak-metin');
    expect(girdi.props.value).toBe('Okul fasikülü');
  });
});
