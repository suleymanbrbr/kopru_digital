/**
 * Mock modda (EXPO_PUBLIC_API_MOCK) tum yeni ekranlarin Jest duzeyinde render edildigini ve temel
 * akislarin calistigini gosterir. Metro/simulator yerine react-test-renderer kullanilir; veri mock
 * adaptorlerden gelir (`gecikme: 0`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { ReactElement } from 'react';

import { ApiHata } from '../api/tipler';
import { mockAdaptorler } from '../api/mock';
import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { bellekKv } from '../depo/kv';
import { OfflineKuyruk } from '../offline/kuyruk';
import { yoklamaIsleyicisiKaydet } from '../offline/yoklama';
import { oturumYoneticisiOlustur } from '../oturum/yonetici';
import { ServisBaglami } from '../uygulama/baglam';
import type { Servisler } from '../uygulama/servisler';
import { BasarisizIsler } from './BasarisizIsler';
import { BekleyenYoklamaKartlari } from './BekleyenYoklamaKartlari';
import { DersFormu } from './DersFormu';
import { DerslerEkrani } from './DerslerEkrani';
import { OdemeAlEkrani } from './OdemeAlEkrani';
import { OgrenciBugun } from './OgrenciBugun';
import { OgrenciKartiEkrani } from './OgrenciKartiEkrani';
import { OgrencilerEkrani } from './OgrencilerEkrani';
import { OgretmenBugun } from './OgretmenBugun';
import { PaketSatEkrani } from './PaketSatEkrani';
import { YoklamaEkrani } from './YoklamaEkrani';

const mockYonlendirici = { push: jest.fn(), back: jest.fn(), navigate: jest.fn() };
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

const render: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of render.splice(0)) act(() => r.unmount());
  jest.clearAllMocks();
});

interface Ortam {
  servisler: Servisler;
  cevrimici: { deger: boolean };
  giris: (telefon: string, uyelikId: string) => Promise<void>;
  adaptorler: Servisler['adaptorler'];
  kuyruk: OfflineKuyruk;
}

/** Mock adaptorler + gercek oturum yoneticisi + bellek ici kuyruk. */
function ortamKur(): Ortam {
  const depo = bellekBelirtecDeposu();
  const adaptorler = mockAdaptorler(depo, 0);
  const oturum = oturumYoneticisiOlustur({ adaptorler });
  const cevrimici = { deger: true };
  const kuyruk = new OfflineKuyruk({
    depo: bellekKv(),
    yeniId: (() => {
      let n = 0;
      return () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
    })(),
    kapsam: () => {
      const d = oturum.depo.al();
      return d.asama === 'giris' ? (d.aktif?.uyelik.uyelikId ?? null) : null;
    },
    cevrimiciMi: () => cevrimici.deger,
    gecikme: () => 0,
  });
  yoklamaIsleyicisiKaydet(kuyruk, () => adaptorler.ders);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } },
  });
  const servisler = {
    adaptorler,
    oturum,
    queryClient,
    kuyruk,
    agGozlemcisi: {
      cevrimiciMi: () => cevrimici.deger,
      abone: () => () => undefined,
    },
  } as unknown as Servisler;
  return {
    servisler,
    cevrimici,
    adaptorler,
    kuyruk,
    giris: async (telefon, uyelikId) => {
      await adaptorler.auth.otpDogrula(telefon, '123456');
      await oturum.girisTamamlandi();
      await oturum.kvkkKabulEt();
      await oturum.uyelikSec(uyelikId);
    },
  };
}

async function bekle(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function ac(o: Ortam, ekran: ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(
      <ServisBaglami.Provider value={o.servisler}>
        <QueryClientProvider client={o.servisler.queryClient}>{ekran}</QueryClientProvider>
      </ServisBaglami.Provider>,
    );
  });
  render.push(r);
  await bekle();
  await bekle();
  return r;
}

type Dugum = ReturnType<ReactTestRenderer['toJSON']>;

function duzMetin(d: unknown): string {
  if (d === null || d === undefined) return '';
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(duzMetin).join('');
  const n = d as { children?: unknown };
  return duzMetin(n.children);
}

/** Render agacindaki tum `Text` kuyruklarinin metni (` | ` ile ayrilmis). */
function metinler(r: ReactTestRenderer): string {
  const parcalar: string[] = [];
  const gez = (d: Dugum | unknown) => {
    if (d === null || d === undefined || typeof d === 'string') return;
    if (Array.isArray(d)) {
      d.forEach(gez);
      return;
    }
    const n = d as { type: string; children?: unknown };
    if (n.type === 'Text') parcalar.push(duzMetin(n.children));
    else gez(n.children);
  };
  gez(r.toJSON());
  return parcalar.join(' | ');
}

function bul(r: ReactTestRenderer, testID: string): ReactTestInstance {
  return r.root.findAll((n) => n.props.testID === testID && typeof n.type === 'string')[0]!;
}

function etiketle(r: ReactTestRenderer, etiket: string): ReactTestInstance {
  const bulunan = r.root.findAll(
    (n) => n.props.accessibilityLabel === etiket && typeof n.props.onPress === 'function',
  );
  if (bulunan.length === 0) throw new Error(`Etiket bulunamadi: ${etiket}\n${metinler(r)}`);
  return bulunan[0]!;
}

async function dokun(r: ReactTestRenderer, etiket: string) {
  const dugme = etiketle(r, etiket);
  await act(async () => {
    (dugme.props.onPress as () => void)();
  });
  await bekle();
}

async function yaz(r: ReactTestRenderer, etiket: string, deger: string) {
  const girdi = r.root.findAll(
    (n) => n.props.accessibilityLabel === etiket && typeof n.props.onChangeText === 'function',
  )[0];
  if (!girdi) throw new Error(`Girdi bulunamadi: ${etiket}`);
  await act(async () => {
    (girdi.props.onChangeText as (v: string) => void)(deger);
  });
}

const OGRETMEN = ['+905551110001', 'uyelik-ogretmen-a'] as const;
const OGRENCI = ['+905551110002', 'uyelik-ogrenci-a'] as const;

describe('mock modda yeni ekranlar render edilir', () => {
  it('OgretmenBugun: yoklama kartlari ve bugunku dersler', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const r = await ac(o, <OgretmenBugun />);
    const m = metinler(r);
    expect(m).toContain('Yoklama bekleyen dersler');
    expect(m).toContain('Bugünkü dersler');
    expect(m).toContain('Elif Kaya');
    expect(m).toContain('Mert Aydın');
  });

  it('yoklama modulu kapaliysa kartlar gorunmez', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const d = o.servisler.oturum.depo.al();
    if (d.asama !== 'giris' || !d.aktif) throw new Error('giris bekleniyordu');
    o.servisler.oturum.depo.ayarla({
      aktif: { ...d.aktif, moduller: { ...d.aktif.moduller, yoklama: false } },
    });
    const r = await ac(o, <OgretmenBugun />);
    expect(metinler(r)).not.toContain('Yoklama bekleyen dersler');
  });

  it('DerslerEkrani: gun seridi, liste ve "Ders ekle"', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const r = await ac(o, <DerslerEkrani />);
    const m = metinler(r);
    expect(m).toContain('Dersler');
    expect(m).toContain('Mert Aydın');
    expect(m).toContain('Haftalık' === m ? '' : 'Ders ekle');
    await dokun(r, 'Ders ekle');
    expect(mockYonlendirici.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/ders-ekle' }),
    );
  });

  it('DersFormu: tekrarlayan ders 4 dokunusta (varsayilanlar dolu)', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const olustur = jest.spyOn(o.adaptorler.ders, 'dersOlustur');
    const r = await ac(o, <DersFormu />);
    // 1: "+" (onceki ekran) 2: kime sec 3: (haftalik varsayilan acik) 4: kaydet
    await dokun(r, 'Elif Kaya · Birebir');
    await dokun(r, 'Haftalık dersleri kaydet');
    expect(olustur).toHaveBeenCalledTimes(1);
    expect(olustur.mock.calls[0]?.[0]).toMatchObject({
      grupId: 'g-elif',
      haftalik: true,
      sureDk: 60,
      saat: '16:00',
      cakismaOnayli: false,
    });
    expect(mockYonlendirici.back).toHaveBeenCalled();
  });

  it('DersFormu: 409 ders_cakismasi onay ister, onayla cakisma_onayli:true gider', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const olustur = jest.spyOn(o.adaptorler.ders, 'dersOlustur');
    const r = await ac(o, <DersFormu />);
    await dokun(r, 'Elif Kaya · Birebir');
    await yaz(r, 'Saat', '11:00'); // Mert ile 11:00 dersi var
    await dokun(r, 'Haftalık dersleri kaydet');
    expect(bul(r, 'cakisma-onayi')).toBeDefined();
    expect(metinler(r)).toContain('Bu saatte başka dersin var');
    await dokun(r, 'Yine de kaydet');
    expect(olustur).toHaveBeenCalledTimes(2);
    expect(olustur.mock.calls[1]?.[0]).toMatchObject({ cakismaOnayli: true });
  });

  it('DersFormu: brans_gerekli ise brans sorulur', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const r = await ac(o, <DersFormu />);
    await dokun(r, 'Mert Aydın · Birebir');
    await dokun(r, 'Haftalık dersleri kaydet');
    expect(bul(r, 'brans-sor')).toBeDefined();
    await dokun(r, 'Fizik');
    await yaz(r, 'Saat', '19:00');
    await dokun(r, 'Haftalık dersleri kaydet');
    expect(mockYonlendirici.back).toHaveBeenCalled();
  });

  it('YoklamaEkrani: grup, varsayilan herkes geldi, yalniz gelmeyen isaretlenir', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const bekleyen = await o.adaptorler.ders.yoklamaBekleyen();
    const grupDersi = bekleyen.find((d) => d.katilimciSayisi === 4);
    if (!grupDersi) throw new Error('grup dersi bekleniyordu');
    const kaydet = jest.spyOn(o.adaptorler.ders, 'yoklamaKaydet');
    const r = await ac(
      o,
      <YoklamaEkrani dersId={grupDersi.id} baslik="Denklemler" baslangic={grupDersi.baslangic} />,
    );
    expect(metinler(r)).toContain('Zeynep Demir');
    await dokun(r, 'Can Özkan, Gelmedi');
    await dokun(r, 'Yoklamayı kaydet');
    expect(metinler(r)).toContain('Yoklama alındı');
    await bekle(60);
    expect(kaydet).toHaveBeenCalledTimes(1);
    const satirlar = kaydet.mock.calls[0]?.[1] ?? [];
    expect(satirlar.map((s) => [s.ogrenciId, s.durum])).toEqual(
      expect.arrayContaining([
        ['ogr-can', 'gelmedi'],
        ['ogr-zeynep', 'geldi'],
        ['ogr-elif', 'geldi'],
      ]),
    );
    // Idempotency-Key kuyruktaki istekId'dir; tum satirlar ayni dokunma anini tasir.
    expect(new Set(satirlar.map((s) => s.isaretlenmeAt)).size).toBe(1);
  });

  it('birebir "Geldi" tek dokunus; cevrimdisiyken kuyruga alinir ve kart "alindi" gosterir', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const r = await ac(o, <BekleyenYoklamaKartlari />);
    o.cevrimici.deger = false;
    const etiket = 'Elif Kaya geldi';
    await dokun(r, etiket);
    expect(o.kuyruk.bekleyenler()).toHaveLength(1);
    expect(o.kuyruk.bekleyenler()[0]?.tur).toBe('yoklama.kaydet');
    expect(metinler(r)).toContain('Yoklama alındı');
    // baglanti gelince eslesir
    o.cevrimici.deger = true;
    await act(async () => {
      await o.kuyruk.bosalt();
    });
    expect(o.kuyruk.bekleyenler()).toHaveLength(0);
    expect(o.kuyruk.basarisizlar()).toHaveLength(0);
  });

  it('BasarisizIsler: kalici hata Turkce nedenle listelenir; tekrar dene / vazgec', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    jest
      .spyOn(o.adaptorler.ders, 'yoklamaKaydet')
      .mockRejectedValue(new ApiHata('izin_yok', 'x', { durum: 403, ayrinti: 'yoklama_kilitli' }));
    o.kuyruk.ekle('yoklama.kaydet', {
      dersId: 'd1',
      dersBaslik: 'Denklemler',
      dersBaslangic: '2026-11-09T08:00:00.000Z',
      satirlar: [
        { ogrenciId: 'ogr-can', durum: 'geldi', isaretlenmeAt: '2026-11-09T08:05:00.000Z' },
      ],
    });
    await act(async () => {
      await o.kuyruk.bosalt();
    });
    expect(o.kuyruk.basarisizlar()).toHaveLength(1);
    const r = await ac(o, <BasarisizIsler />);
    expect(metinler(r)).toContain('kilitlendi');
    expect(metinler(r)).toContain('Denklemler');
    await dokun(r, 'Tekrar dene');
    expect(o.kuyruk.basarisizlar().length + o.kuyruk.bekleyenler().length).toBe(1);
  });

  it('OgrencilerEkrani: kalan ders rozetleri (sari/kirmizi, metinli) ve Turkce siralama', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const r = await ac(o, <OgrencilerEkrani />);
    const m = metinler(r);
    expect(m).toContain('1 ders kaldı'); // Elif: esik 2 -> sari
    expect(m).toContain('Ders kalmadı'); // Mert: 0 -> kirmizi
    expect(bul(r, 'rozet-dusuk')).toBeDefined();
    expect(bul(r, 'rozet-bitti')).toBeDefined();
    expect(m.indexOf('Can Özkan')).toBeLessThan(m.indexOf('Elif Kaya'));
    expect(m.indexOf('Elif Kaya')).toBeLessThan(m.indexOf('Zeynep Demir'));
  });

  it('finans modulu kapaliysa ogrenci listesi gorunmez', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const d = o.servisler.oturum.depo.al();
    if (d.asama !== 'giris' || !d.aktif) throw new Error('giris bekleniyordu');
    o.servisler.oturum.depo.ayarla({
      aktif: { ...d.aktif, moduller: { ...d.aktif.moduller, finans: false } },
    });
    const r = await ac(o, <OgrencilerEkrani />);
    expect(metinler(r)).not.toContain('Elif Kaya |'.slice(0, 9) + ' ders kaldı');
    expect(r.root.findAll((n) => n.props.testID === 'ogrenci-ogr-elif')).toHaveLength(0);
  });

  it('OgrenciKartiEkrani: bakiye TL, paketler, odeyen ve WhatsApp (yalniz dokununca)', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const r = await ac(o, <OgrenciKartiEkrani ogrenciId="ogr-elif" ad="Elif Kaya" />);
    const m = metinler(r);
    expect(m).toContain('Borç');
    expect(m.replace(/\s/g, ' ')).toContain('1.500,00');
    expect(m).toContain('Ayşe Kaya');
    expect(m).toContain('Paket sat');
    expect(m).toContain('Ödeme al');
    await dokun(r, 'WhatsApp ile hatırlat');
    expect(bul(r, 'whatsapp-hatirlat')).toBeDefined();
    const metin = r.root.findAll(
      (n) => n.props.accessibilityLabel?.startsWith?.('Mesaj') && n.props.value,
    )[0];
    expect(metin?.props.value).toContain('Elif Kaya');
    // telefonu olmayan odeyen
    const r2 = await ac(o, <OgrenciKartiEkrani ogrenciId="ogr-mert" ad="Mert Aydın" />);
    expect(metinler(r2)).toContain('Ödeyen telefon numarası kayıtlı değil');
  });

  it('PaketSatEkrani: paket sec -> kaydet (varsayilan tamami/nakit); model hatasi mesaji', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const sat = jest.spyOn(o.adaptorler.finans, 'paketSat');
    const r = await ac(o, <PaketSatEkrani ogrenciId="ogr-zeynep" ad="Zeynep Demir" />);
    expect(metinler(r)).toContain('8 ders paketi');
    await dokun(r, '8 ders paketi, 8 ders, ₺3.200,00'.replace('₺', '₺'));
    await dokun(r, 'Satışı kaydet');
    expect(sat.mock.calls[0]?.[0]).toMatchObject({
      paketId: 'paket-8',
      odeme: { tur: 'tamami', yontem: 'nakit' },
    });
    expect(metinler(r)).toContain('Paket satıldı. Kalan ders: 16.');

    const r2 = await ac(o, <PaketSatEkrani ogrenciId="ogr-can" ad="Can Özkan" />);
    await dokun(r2, '8 ders paketi, 8 ders, ₺3.200,00');
    await dokun(r2, 'Satışı kaydet');
    expect(metinler(r2)).toContain('finans modelini paket olarak değiştir');
  });

  it('OdemeAlEkrani: gecersiz giriste alan hatasi; cift dokunus tek kayit', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const al = jest.spyOn(o.adaptorler.finans, 'tahsilatAl');
    const r = await ac(o, <OdemeAlEkrani ogrenciId="ogr-elif" ad="Elif Kaya" />);
    await dokun(r, 'Ödemeyi kaydet');
    expect(metinler(r)).toContain('Tutarı gir.');
    await yaz(r, 'Alınan tutar (₺)', 'abc');
    await dokun(r, 'Ödemeyi kaydet');
    expect(metinler(r)).toContain('Geçerli bir tutar gir');
    expect(al).not.toHaveBeenCalled();

    await yaz(r, 'Alınan tutar (₺)', '1.500,50');
    const dugme = etiketle(r, 'Ödemeyi kaydet');
    await act(async () => {
      (dugme.props.onPress as () => void)();
      (dugme.props.onPress as () => void)(); // cift dokunus
    });
    await bekle();
    expect(al).toHaveBeenCalledTimes(1);
    expect(al.mock.calls[0]?.[0]).toMatchObject({ tutarKurus: 150050, yontem: 'nakit' });
    expect(metinler(r).replace(/\s/g, ' ')).toContain('1.500,50');
  });

  it('OdemeAlEkrani: hata sonrasi ayni tutarla tekrar ayni Idempotency-Key, tutar degisirse yenisi', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const al = jest
      .spyOn(o.adaptorler.finans, 'tahsilatAl')
      .mockRejectedValueOnce(new ApiHata('ag'))
      .mockRejectedValueOnce(new ApiHata('ag'))
      .mockResolvedValue({ tekrar: false });
    const r = await ac(o, <OdemeAlEkrani ogrenciId="ogr-elif" ad="Elif Kaya" />);
    await yaz(r, 'Alınan tutar (₺)', '600');
    await dokun(r, 'Ödemeyi kaydet');
    await dokun(r, 'Ödemeyi kaydet');
    await yaz(r, 'Alınan tutar (₺)', '700');
    await dokun(r, 'Ödemeyi kaydet');
    const anahtarlar = al.mock.calls.map((c) => c[1]);
    expect(anahtarlar[0]).toBe(anahtarlar[1]);
    expect(anahtarlar[2]).not.toBe(anahtarlar[0]);
  });
});

describe('ogrenci bugun ekrani', () => {
  it('bugunku/yaklasan dersler, kalan ders, ogretmen notu; fiyat/borc/tahsilat yok', async () => {
    const o = ortamKur();
    // Ogretmen: yoklama al ve "ogrenciye gorunsun" not yaz.
    await o.giris(...OGRETMEN);
    const bekleyen = await o.adaptorler.ders.yoklamaBekleyen();
    const grupDersi = bekleyen.find((d) => d.katilimciSayisi === 4);
    if (!grupDersi) throw new Error('grup dersi bekleniyordu');
    await o.adaptorler.ders.yoklamaKaydet(
      grupDersi.id,
      [
        {
          ogrenciId: 'uyelik-ogrenci-a',
          durum: 'geldi',
          not: 'Üslü sayılar tekrarı yap',
          notGorunurluk: 'ogrenciye',
          isaretlenmeAt: new Date().toISOString(),
        },
        {
          ogrenciId: 'ogr-can',
          durum: 'geldi',
          not: 'Sadece öğretmen görür',
          notGorunurluk: 'ogretmene_ozel',
          isaretlenmeAt: new Date().toISOString(),
        },
      ],
      '00000000-0000-7000-8000-0000000000aa',
    );
    // Ogrenci olarak giris
    await o.giris(...OGRENCI);
    const r = await ac(o, <OgrenciBugun />);
    const m = metinler(r);
    expect(m).toContain('Bugünkü dersler');
    expect(m).toContain('Yaklaşan dersler');
    expect(m).toContain('Kalan dersin: 5');
    expect(m).toContain('Üslü sayılar tekrarı yap');
    expect(m).not.toContain('Sadece öğretmen görür');
    // Fiyat, borc, tahsilat, TL tutari ogrenci ekraninda yok.
    expect(m).not.toMatch(/₺|Borç|Alacak|Bakiye|Ödeme|tahsilat|fiyat/i);
    expect(m).not.toContain('Paket sat');
  });

  it('kalan_kredi null ise (kurum ayari kapali) kalan ders hic gosterilmez', async () => {
    const o = ortamKur();
    jest.spyOn(o.adaptorler.finans, 'ogrenciKarti').mockResolvedValue({
      gorunum: 'ogrenci',
      ogrenciId: 'uyelik-ogrenci-a',
      kalanKredi: null,
    });
    await o.giris(...OGRENCI);
    const r = await ac(o, <OgrenciBugun />);
    expect(metinler(r)).not.toContain('Kalan dersin');
    expect(r.root.findAll((n) => n.props.testID === 'kalan-ders')).toHaveLength(0);
  });
});
