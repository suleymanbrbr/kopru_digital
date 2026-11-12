/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion --
   react-test-renderer React 19'da kullanimdan kaldirildi ama React Native icin ek bagimlilik
   gerektirmeyen tek renderer; `props` tipsizdir (any). */
/**
 * Ders kayitlari ve geri bildirim ekranlari (mock adaptor): ogrenci Bugun geri bildirim karti
 * (tek dokunus, iyimser, cevrimdisi kuyruk, degistirme, modul gizleme), Kayitlarim (suzgec, tarayicida
 * acma, parola kopyalama, izledim, acilmiyor), ogretmen kayit ekleme ve ders karti paneli.
 */
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { act } from 'react';

import { MOCK_SAAT_DILIMI } from '../api/mockOperasyon';
import type { Ders } from '../api/operasyonTipleri';
import { bugunTarihi, tarihEkle, yerelSaat, yerelTarih } from '../lib/saat';
import { DersKayitPaneli } from './DersKayitPaneli';
import { GeriBildirimKartlari } from './GeriBildirimKartlari';
import { KayitEkleEkrani } from './KayitEkleEkrani';
import { KayitlarimEkrani } from './KayitlarimEkrani';
import { KayitlarimGirisi } from './KayitlarimGirisi';
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
} from './testYardimcisi';

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
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn().mockResolvedValue({ type: 'dismiss' }),
}));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
  getStringAsync: jest.fn().mockResolvedValue(''),
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

const tarayici = WebBrowser.openBrowserAsync as jest.Mock;
const pano = Clipboard.setStringAsync as jest.Mock;
const panoOku = Clipboard.getStringAsync as jest.Mock;

async function ogrenciOrtami(): Promise<Ortam> {
  const o = ortamKur();
  await o.giris(...OGRENCI);
  return o;
}

/** 8-A grubuna 10 dk once biten 30 dk'lik ders ekler (ogrenci katilimci; geri bildirim penceresinde). */
async function bitmisDersEkle(o: Ortam, baslik = 'Geometri'): Promise<Ders> {
  const baslangic = Date.now() - 40 * 60_000;
  const s = await o.adaptorler.ders.dersOlustur({
    grupId: 'g-8a',
    tarih: yerelTarih(baslangic, MOCK_SAAT_DILIMI),
    saat: yerelSaat(baslangic, MOCK_SAAT_DILIMI),
    sureDk: 30,
    haftalik: false,
    baslik,
    cakismaOnayli: true,
  });
  return s.dersler[0]!;
}

/** Mock tohum dersleri de bekleyen olabilir: "N ders daha" aciksa tum kartlar gorunsun. */
async function genislet(r: Parameters<typeof dokun>[0]) {
  if (var_(r, 'geri-bildirim-daha')) await testIDDokun(r, 'geri-bildirim-daha');
}

describe('ogrenci Bugun: geri bildirim karti', () => {
  it('bitmis ders icin soru gosterilir; tek dokunusla gonderilir, iyimser tesekkur, sunucuda kayit', async () => {
    const o = await ogrenciOrtami();
    const ders = await bitmisDersEkle(o);
    const r = await ac(o, <GeriBildirimKartlari />);
    await genislet(r);
    expect(metinler(r)).toContain('Bugünkü ders nasıldı?');
    expect(var_(r, `geri-bildirim-kart-${ders.id}`)).toBe(true);
    expect(etiketVarMi(r, 'Geometri dersi: Anladım')).toBe(true);
    expect(etiketVarMi(r, 'Geometri dersi: Kısmen')).toBe(true);
    expect(etiketVarMi(r, 'Geometri dersi: Anlamadım')).toBe(true);

    await dokun(r, 'Geometri dersi: Anladım'); // tek dokunus
    await bekle(60);
    expect(metinler(r)).toContain('Teşekkürler! Cevabın: Anladım');
    // Karttaki soru butonlari kalkar (mock tohum dersleri saate gore ayri kartlar uretebilir).
    expect(etiketVarMi(r, 'Geometri dersi: Anladım')).toBe(false);
    expect(o.kuyruk.bekleyenler()).toHaveLength(0);
    const sunucu = await o.adaptorler.kayit.dersGeriBildirimleri(ders.id);
    expect(sunucu.ozet).toMatchObject({ anladim: 1, kismen: 0, anlamadim: 0, toplam: 1 });
  });

  it('cevrimdisiyken kuyruga alinir ("gonderilmedi"), baglanti gelince eslesir', async () => {
    const o = await ogrenciOrtami();
    const ders = await bitmisDersEkle(o);
    const r = await ac(o, <GeriBildirimKartlari />);
    await genislet(r);
    o.cevrimici.deger = false;
    await dokun(r, 'Geometri dersi: Kısmen');
    expect(metinler(r)).toContain('Teşekkürler! Cevabın: Kısmen');
    expect(var_(r, 'geri-bildirim-bekliyor')).toBe(true);
    expect(o.kuyruk.bekleyenler()).toHaveLength(1);
    o.cevrimici.deger = true;
    await act(async () => {
      await o.kuyruk.bosalt();
    });
    await bekle();
    expect(o.kuyruk.bekleyenler()).toHaveLength(0);
    expect(var_(r, 'geri-bildirim-bekliyor')).toBe(false);
    const sunucu = await o.adaptorler.kayit.dersGeriBildirimleri(ders.id);
    expect(sunucu.ozet.kismen).toBe(1);
  });

  it('degistirilebilir: son deger kazanir; not eklenir ve ogretmen gorur', async () => {
    const o = await ogrenciOrtami();
    const ders = await bitmisDersEkle(o);
    const r = await ac(o, <GeriBildirimKartlari />);
    await genislet(r);
    await dokun(r, 'Geometri dersi: Anladım');
    await dokun(r, 'Cevabı değiştir');
    expect(etiketVarMi(r, 'Geometri dersi: Kısmen')).toBe(true);
    await dokun(r, 'Geometri dersi: Anlamadım');
    expect(metinler(r)).toContain('Teşekkürler! Cevabın: Anlamadım');

    await dokun(r, 'Zorlandığın konu ya da not ekle');
    await yaz(r, 'Not (isteğe bağlı)', 'Açıları karıştırıyorum');
    await dokun(r, 'Gönder');
    await bekle(60);
    expect(metinler(r)).toContain('Teşekkürler! Cevabın: Anlamadım'); // deger korunur
    const sunucu = await o.adaptorler.kayit.dersGeriBildirimleri(ders.id);
    expect(sunucu.ozet).toMatchObject({ anladim: 0, anlamadim: 1, toplam: 1 });
    expect(sunucu.satirlar[0]?.not).toBe('Açıları karıştırıyorum');
    expect(sunucu.satirlar[0]?.ad).toBe('Deniz Yılmaz');
  });

  it('en fazla bir tam kart: en son biten ders ustte, digerleri "N ders daha" altinda', async () => {
    const o = await ogrenciOrtami();
    const eski = await bitmisDersEkle(o, 'Eski ders');
    const yeni = await bitmisDersEkle(o, 'Yeni ders');
    // Eski dersi 3 saat once bitmis say: yeni ders (10 dk once) tek tam kart olur.
    const sorgu = await o.adaptorler.kayit.geriBildirimBekleyen();
    expect(sorgu.map((b) => b.dersId)).toEqual(expect.arrayContaining([eski.id, yeni.id]));
    const r = await ac(o, <GeriBildirimKartlari />);
    expect(var_(r, 'geri-bildirim-daha')).toBe(true);
    expect(
      var_(r, `geri-bildirim-kart-${yeni.id}`) || var_(r, `geri-bildirim-kart-${eski.id}`),
    ).toBe(true);
    const tamKart = r.root.findAll(
      (n) =>
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('geri-bildirim-kart-') &&
        typeof n.type === 'string',
    );
    expect(tamKart).toHaveLength(1);
    expect(metinler(r)).toMatch(/\d+ ders daha/);
    await testIDDokun(r, 'geri-bildirim-daha');
    const hepsi = r.root.findAll(
      (n) =>
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('geri-bildirim-kart-') &&
        typeof n.type === 'string',
    );
    expect(hepsi.length).toBeGreaterThan(1);
  });

  it('cevaplanan ilk kart yerinde kalir (tesekkur durumuna gecer, "daha" listesine kaymaz)', async () => {
    const o = await ogrenciOrtami();
    const ders = await bitmisDersEkle(o, 'Birinci');
    await bitmisDersEkle(o, 'Ikinci');
    const r = await ac(o, <GeriBildirimKartlari />);
    const ilkId = r.root.findAll(
      (n) =>
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('geri-bildirim-kart-') &&
        typeof n.type === 'string',
    )[0]?.props.testID as string;
    expect(ilkId).toBeTruthy();
    await testIDDokun(r, 'geri-bildirim-anladim');
    await bekle(60);
    expect(metinler(r)).toContain('Teşekkürler! Cevabın: Anladım');
    const sonra = r.root.findAll(
      (n) =>
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('geri-bildirim-kart-') &&
        typeof n.type === 'string',
    )[0]?.props.testID as string;
    expect(sonra).toBe(ilkId);
    expect(ders.id).toBeTruthy();
  });

  it('modul kapaliysa kart hic gorunmez', async () => {
    const o = await ogrenciOrtami();
    await bitmisDersEkle(o);
    modulAyarla(o, { geri_bildirim: false });
    const r = await ac(o, <GeriBildirimKartlari />);
    await genislet(r);
    expect(var_(r, 'geri-bildirim-kartlari')).toBe(false);
    expect(metinler(r)).not.toContain('Bugünkü ders nasıldı?');
  });

  it('derse katilmayan (gelmedi) ogrenciye kart gosterilmez; sunucu da reddeder', async () => {
    const o = await ogrenciOrtami();
    const ders = await bitmisDersEkle(o);
    await o.adaptorler.ders.yoklamaKaydet(
      ders.id,
      [
        {
          ogrenciId: 'uyelik-ogrenci-a',
          durum: 'gelmedi',
          isaretlenmeAt: new Date().toISOString(),
        },
      ],
      'istek-1',
    );
    const r = await ac(o, <GeriBildirimKartlari />);
    await genislet(r);
    expect(var_(r, `geri-bildirim-kart-${ders.id}`)).toBe(false);
    await expect(
      o.adaptorler.kayit.geriBildirimVer(ders.id, { deger: 'anladim' }),
    ).rejects.toMatchObject({ ayrinti: 'geri_bildirim_yoklama_uygun_degil' });
  });
});

/** Ayni etiketli birden cok girdi varken testID ile yazar. */
function yazID(r: Parameters<typeof yaz>[0], testID: string, deger: string) {
  const girdi = r.root.findAll(
    (n) => n.props.testID === testID && typeof n.props.onChangeText === 'function',
  )[0];
  if (!girdi) throw new Error(`Girdi bulunamadi: ${testID}`);
  act(() => {
    (girdi.props.onChangeText as (v: string) => void)(deger);
  });
}

describe('ogrenci Kayitlarim', () => {
  it('ogretmenin ekledigi parola listede yok (parola_var), tekil okumada ogrenciye gelir', async () => {
    const o = await ogrenciOrtami();
    const ders = await bitmisDersEkle(o);
    const [k] = await o.adaptorler.kayit.kaynakEkle(ders.id, [
      { baslik: 'Kayıt', url: 'https://zoom.us/rec/x', parola: 'gizli123' },
    ]);
    const liste = await o.adaptorler.kayit.kayitlarim({}, null);
    const satir = liste.kayitlar.find((x) => x.id === k!.id)!;
    expect(satir.parolaVar).toBe(true);
    expect('parola' in satir).toBe(false);
    expect((await o.adaptorler.kayit.kayit(k!.id)).parola).toBe('gizli123');
  });

  it('izlenmemis kayitlar listelenir; tur suzgeci materyali ayirir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <KayitlarimEkrani />);
    const m = metinler(r);
    expect(m).toContain('Denklemler kaydı');
    expect(m).toContain('Üslü sayılar kaydı');
    expect(m).toContain('Üslü sayılar konu anlatımı');
    expect(m).toContain('Parola var'); // Zoom kaydi
    await testIDDokun(r, 'suzgec-ac');
    await dokun(r, 'Materyal');
    await bekle(60);
    const m2 = metinler(r);
    expect(m2).toContain('Üslü sayılar konu anlatımı');
    expect(m2).not.toContain('Denklemler kaydı');
    expect(m2).toContain('Materyal'); // ozet satiri secimi metinle de gosterir
  });

  it('2. dokunus: kayda dokununca parola kopyalanir ve uygulama ici tarayicida acilir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <KayitlarimEkrani />);
    await testIDDokun(r, 'kayit-ac-kaynak-zoom-denklem');
    await bekle(60);
    expect(pano).toHaveBeenCalledWith('x7Kq2!mR');
    expect(tarayici).toHaveBeenCalledWith('https://us02web.zoom.us/rec/share/mock-denklemler');
    expect(var_(r, 'kayit-izledin-mi')).toBe(true);
    expect(metinler(r)).toContain('Parola kopyalandı. Tarayıcıda yapıştır.');
  });

  it('parolasiz kayitta pano kullanilmaz; tarayici hata verirse mesaj gosterilir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <KayitlarimEkrani />);
    await testIDDokun(r, 'kayit-ac-kaynak-youtube-materyal');
    await bekle(60);
    expect(pano).not.toHaveBeenCalled();
    expect(tarayici).toHaveBeenCalledWith('https://www.youtube.com/watch?v=mock-uslu');
    tarayici.mockRejectedValueOnce(new Error('acilamadi'));
    await testIDDokun(r, 'kayit-ac-kaynak-drive-uslu');
    await bekle(60);
    expect(var_(r, 'kayit-hata')).toBe(true);
  });

  it('"izledim" tarayicidan donunce ya da satirdan acikca isaretlenir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <KayitlarimEkrani />);
    await testIDDokun(r, 'kayit-ac-kaynak-drive-uslu');
    await bekle(60);
    await testIDDokun(r, 'kayit-son-izledim');
    await bekle(60);
    expect(var_(r, 'kayit-izledin-mi')).toBe(false);
    expect(metinler(r)).toContain('İzledin olarak işaretlendi.');
    const k = await o.adaptorler.kayit.kayit('kaynak-drive-uslu');
    expect(k.izlendi).toBe(true);
    // Satirdaki acik dugme
    await testIDDokun(r, 'kayit-izledim-kaynak-youtube-materyal');
    await bekle(60);
    expect((await o.adaptorler.kayit.kayit('kaynak-youtube-materyal')).izlendi).toBe(true);
    expect(var_(r, 'kayit-izledim-kaynak-youtube-materyal')).toBe(false);
  });

  it('"acilmiyor" bildirimi: neden + aciklama gider, kayit bozuk uyarisi alir, ogretmen gorur', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <KayitlarimEkrani />);
    await testIDDokun(r, 'kayit-ac-kaynak-zoom-denklem');
    await bekle(60);
    await testIDDokun(r, 'kayit-son-sorun');
    await dokun(r, 'Parola çalışmıyor');
    await yaz(r, 'Açıklama (isteğe bağlı)', 'Parolayı yapıştırınca hata veriyor');
    await testIDDokun(r, 'sorun-gonder');
    await bekle(60);
    expect(metinler(r)).toContain('Öğretmenine haber verildi');
    expect(var_(r, 'kayit-uyari-kaynak-zoom-denklem')).toBe(true);
    const liste = await o.adaptorler.kayit.kaynaklar({});
    expect(liste.find((k) => k.id === 'kaynak-zoom-denklem')?.acikSorunSayisi).toBe(1);
    // ikinci bildirim reddedilir
    await expect(
      o.adaptorler.kayit.sorunBildir('kaynak-zoom-denklem', 'diger'),
    ).rejects.toMatchObject({ ayrinti: 'kaynak_sorun_zaten_acik' });
  });

  it("imlecli sayfalama: sonraki sayfa imlecle istenir; mock 30'luk sayfa verir", async () => {
    const o = await ogrenciOrtami();
    const ders = await bitmisDersEkle(o);
    for (let i = 0; i < 2; i++) {
      await o.adaptorler.kayit.kaynakEkle(
        ders.id,
        Array.from({ length: 16 }, (_, n) => ({
          baslik: `Ek kayıt ${String(i * 16 + n)}`,
          url: `https://ornek.com/${String(i * 16 + n)}`,
        })),
      );
    }
    const ilk = await o.adaptorler.kayit.kayitlarim({}, null);
    expect(ilk.kayitlar).toHaveLength(30);
    expect(ilk.sonrakiImlec).not.toBeNull();
    const ikinci = await o.adaptorler.kayit.kayitlarim({}, ilk.sonrakiImlec);
    expect(ikinci.kayitlar).toHaveLength(5); // 3 tohum + 32 eklenen = 35
    expect(ikinci.sonrakiImlec).toBeNull();

    const spy = jest.spyOn(o.adaptorler.kayit, 'kayitlarim');
    const r = await ac(o, <KayitlarimEkrani />);
    const liste = r.root.findAll((n) => typeof n.props.onEndReached === 'function')[0]!;
    act(() => {
      (liste.props.onEndReached as () => void)();
    });
    await bekle(60);
    expect(spy.mock.calls.map((c) => c[1])).toEqual([null, ilk.sonrakiImlec]);
  });

  it("giris karti: izlenmemis sayisini gosterir ve Kayitlarim'i acar; modul kapaliysa gizli", async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <KayitlarimGirisi />);
    expect(metinler(r)).toContain('3 yeni kayıt seni bekliyor.');
    await testIDDokun(r, 'kayitlarim-giris');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/kayitlarim');
  });

  it('kayitlar modulu kapaliysa giris karti gizli', async () => {
    const o = await ogrenciOrtami();
    modulAyarla(o, { kayitlar: false });
    const r = await ac(o, <KayitlarimGirisi />);
    expect(var_(r, 'kayitlarim-giris')).toBe(false);
  });

  it('ogretmen rolunde Kayitlarim giris karti cizilmez', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const r = await ac(o, <KayitlarimGirisi />);
    expect(var_(r, 'kayitlarim-giris')).toBe(false);
  });
});

describe('ogretmen: kayit ekle', () => {
  const dersEkrani = (d: Ders) => (
    <KayitEkleEkrani dersId={d.id} baslik="Geometri" baslangic={d.baslangic} />
  );

  async function ogretmenDersi() {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const ders = await bitmisDersEkle(o);
    return { o, ders };
  }

  it('baglanti yapistirilinca saglayici taninir; Drive uyarisi; gecersiz baglanti hata verir', async () => {
    const { o, ders } = await ogretmenDersi();
    const r = await ac(o, dersEkrani(ders));
    await yaz(r, 'Kayıt bağlantısı', 'https://drive.google.com/file/d/1/view');
    expect(metinler(r)).toContain('Google Drive bağlantısı tanındı.');
    expect(var_(r, 'drive-uyari-1')).toBe(true);
    expect(metinler(r)).toContain('Paylaşım ayarını kontrol et');
    await yaz(r, 'Kayıt bağlantısı', 'http://ornek.com/a');
    expect(metinler(r)).toContain('Bağlantı https:// ile başlamalı.');
    expect(var_(r, 'drive-uyari-1')).toBe(false);
    await testIDDokun(r, 'kayit-kaydet');
    expect(var_(r, 'kayit-eklendi')).toBe(false);
    expect(await o.adaptorler.kayit.kaynaklar({ dersId: ders.id })).toHaveLength(0);
  });

  it('panodan yapistir + kaydet: varsayilan baslikla eklenir, listede gorunur', async () => {
    const { o, ders } = await ogretmenDersi();
    const r = await ac(o, dersEkrani(ders));
    panoOku.mockResolvedValueOnce('  https://us02web.zoom.us/rec/share/xyz ');
    await dokun(r, 'Panodaki bağlantıyı yapıştır');
    expect(metinler(r)).toContain('Zoom bağlantısı tanındı.');
    await testIDDokun(r, 'kayit-kaydet');
    await bekle(60);
    expect(var_(r, 'kayit-eklendi')).toBe(true);
    const liste = await o.adaptorler.kayit.kaynaklar({ dersId: ders.id });
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({
      baslik: 'Geometri kaydı',
      saglayici: 'zoom',
      url: 'https://us02web.zoom.us/rec/share/xyz',
      parolaVar: false,
    });
  });

  it('pano bos ya da baglanti degilse uyari verir', async () => {
    const { o, ders } = await ogretmenDersi();
    const r = await ac(o, dersEkrani(ders));
    panoOku.mockResolvedValueOnce('merhaba');
    await dokun(r, 'Panodaki bağlantıyı yapıştır');
    expect(metinler(r)).toContain('Panoda bir bağlantı yok.');
  });

  it('parola ve son erisim ayrintilari; ogrenci parolayi tekil okumada gorur', async () => {
    const { o, ders } = await ogretmenDersi();
    const r = await ac(o, dersEkrani(ders));
    await yaz(r, 'Kayıt bağlantısı', 'zoom.us/rec/share/abc');
    await testIDDokun(r, 'link-ayrinti-1');
    await yaz(r, 'Zoom kayıt parolası (isteğe bağlı)', 'gizli123');
    await dokun(r, '30 gün');
    await testIDDokun(r, 'kayit-kaydet');
    await bekle(60);
    const [k] = await o.adaptorler.kayit.kaynaklar({ dersId: ders.id });
    expect(k?.parolaVar).toBe(true);
    const fark = Date.parse(k!.gecerlilikBitis!) - Date.now();
    expect(fark).toBeGreaterThan(29 * 24 * 3_600_000);
    expect(fark).toBeLessThan(31 * 24 * 3_600_000);
  });

  it('birden cok baglanti tek istekte: numarali basliklar', async () => {
    const { o, ders } = await ogretmenDersi();
    const r = await ac(o, dersEkrani(ders));
    await yaz(r, 'Kayıt bağlantısı', 'https://youtu.be/a');
    await testIDDokun(r, 'baska-link');
    expect(var_(r, 'link-blogu-2')).toBe(true);
    yazID(r, 'link-url-2', 'https://youtu.be/b');
    await testIDDokun(r, 'kayit-kaydet');
    await bekle(60);
    const liste = await o.adaptorler.kayit.kaynaklar({ dersId: ders.id });
    expect(liste.map((k) => k.baslik).sort()).toEqual(['Geometri kaydı 1', 'Geometri kaydı 2']);
  });

  it('cevrimdisiyken kaydetme acik hata verir (kuyruga girmez)', async () => {
    const { o, ders } = await ogretmenDersi();
    const r = await ac(o, dersEkrani(ders));
    await yaz(r, 'Kayıt bağlantısı', 'https://youtu.be/a');
    o.cevrimici.deger = false;
    await testIDDokun(r, 'kayit-kaydet');
    await bekle(60);
    expect(var_(r, 'kayit-ekle-hata')).toBe(true);
    expect(var_(r, 'kayit-eklendi')).toBe(false);
  });
});

describe('ogretmen ders karti paneli', () => {
  async function kur() {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const ders = await bitmisDersEkle(o);
    return { o, ders };
  }

  it('"Kayit ekle" kayit ekranina yonlendirir; kayit yokken ozet "Kayit eklenmedi"', async () => {
    const { o, ders } = await kur();
    const r = await ac(o, <DersKayitPaneli ders={ders} ad="Geometri" kaynaklar={[]} />);
    expect(metinler(r)).toContain('Kayıt eklenmedi');
    await dokun(r, 'Geometri dersine kayıt ekle');
    expect(mockYonlendirici.push).toHaveBeenCalledWith({
      pathname: '/kayit-ekle',
      params: { dersId: ders.id, baslik: 'Geometri', baslangic: ders.baslangic },
    });
  });

  it('izleyen sayisi ve izleyenler; acik sorun uyarisi; geri bildirim ozeti ve notlar', async () => {
    const o = ortamKur();
    await o.giris(...OGRENCI);
    const ders = await bitmisDersEkle(o);
    const [kaynak] = await o.adaptorler.kayit.kaynakEkle(ders.id, [
      { baslik: 'Geometri kaydı', url: 'https://youtu.be/abc' },
    ]);
    await o.adaptorler.kayit.izledim(kaynak!.id);
    await o.adaptorler.kayit.sorunBildir(kaynak!.id, 'acilmiyor');
    await o.adaptorler.kayit.geriBildirimVer(ders.id, {
      deger: 'kismen',
      not: 'Üçgenler zor',
    });
    const kaynaklar = await o.adaptorler.kayit.kaynaklar({ dersId: ders.id });
    const r = await ac(o, <DersKayitPaneli ders={ders} ad="Geometri" kaynaklar={kaynaklar} />);
    expect(metinler(r)).toContain('1 kayıt, 1/4 izledi');
    await testIDDokun(r, `kayit-panel-ac-${ders.id}`);
    await bekle(60);
    expect(var_(r, `kaynak-sorun-${kaynak!.id}`)).toBe(true);
    await testIDDokun(r, `kaynak-ac-${kaynak!.id}`);
    await bekle(60);
    expect(metinler(r)).toContain('İzleyenler: Deniz Yılmaz');
    expect(metinler(r)).toContain('İzlemeyenler:');
    expect(var_(r, `geri-bildirim-ozet-${ders.id}`)).toBe(true);
    expect(metinler(r)).toContain('Anladım 0, kısmen 1, anlamadım 0');
    expect(metinler(r)).toContain('1/4 öğrenci cevapladı');
    expect(metinler(r)).toContain('Deniz Yılmaz: Kısmen · Üçgenler zor');
  });

  it('modul kapaliysa ilgili parca gizlenir (kayitlar -> buton; geri_bildirim -> ozet)', async () => {
    const { o, ders } = await kur();
    modulAyarla(o, { kayitlar: false });
    const r = await ac(o, <DersKayitPaneli ders={ders} ad="Geometri" kaynaklar={[]} />);
    expect(etiketVarMi(r, 'Geometri dersine kayıt ekle')).toBe(false);
    expect(metinler(r)).toContain('Geri bildirim'); // yalniz geri bildirim parcasi kaldi
  });

  it('iki modul de kapaliysa panel hic cizilmez', async () => {
    const { o, ders } = await kur();
    modulAyarla(o, { kayitlar: false, geri_bildirim: false });
    const r = await ac(o, <DersKayitPaneli ders={ders} ad="Geometri" kaynaklar={[]} />);
    expect(var_(r, `kayit-panel-${ders.id}`)).toBe(false);
  });

  it('iptal edilmis derste panel yok; baslamamis derste geri bildirim ozeti yok', async () => {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    const gelecek = await o.adaptorler.ders.dersOlustur({
      grupId: 'g-8a',
      tarih: tarihEkle(bugunTarihi(MOCK_SAAT_DILIMI), 5),
      saat: '10:00',
      sureDk: 60,
      haftalik: false,
      cakismaOnayli: true,
    });
    const d = gelecek.dersler[0]!;
    const r = await ac(o, <DersKayitPaneli ders={d} ad="Ders" kaynaklar={[]} />);
    expect(etiketVarMi(r, 'Ders dersine kayıt ekle')).toBe(true);
    await testIDDokun(r, `kayit-panel-ac-${d.id}`);
    expect(var_(r, `geri-bildirim-ozet-${d.id}`)).toBe(false);
    const r2 = await ac(
      o,
      <DersKayitPaneli ders={{ ...d, durum: 'iptal' }} ad="Ders" kaynaklar={[]} />,
    );
    expect(var_(r2, `kayit-panel-${d.id}`)).toBe(false);
  });
});
