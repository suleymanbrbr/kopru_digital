/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion --
   react-test-renderer React 19'da kullanimdan kaldirildi ama React Native icin ek bagimlilik
   gerektirmeyen tek renderer; `props` tipsizdir (any). */
/**
 * Mock modda motivasyon ekranlari: Bugun karti, Karakterim (radar, seri, rozet, dolap), karakter
 * secimi, odak sayaci, XP geri bildirimi tetigi, ogretmen yildiz ve seri duraklatma.
 */
import { act } from 'react';
import { Alert } from 'react-native';

import { ApiHata } from '../api/tipler';
import type { XpOlayi } from '../motivasyon/xpYonetici';
import { GrupMotivasyonEkrani, duraklatmaHatasi } from './motivasyon/GrupMotivasyonEkrani';
import { KarakterSecimi } from './motivasyon/KarakterSecimi';
import { Karakterim, kuralAdi } from './Karakterim';
import { Odaklan, odakGorevleri } from './Odaklan';
import { OgrenciBugun } from './OgrenciBugun';
import { OgrenciKartiEkrani } from './OgrenciKartiEkrani';
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
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  // Her adlandirilmis disa aktarim (Path, Circle, Polygon ...) duz bir View olur.
  return new Proxy(
    { __esModule: true, default: View },
    { get: (hedef: Record<string, unknown>, ad: string) => (ad in hedef ? hedef[ad] : View) },
  );
});

afterEach(() => {
  temizle();
  jest.clearAllMocks();
});

async function ogrenciOrtami(giris: readonly [string, string] = OGRENCI): Promise<Ortam> {
  const o = ortamKur();
  await o.giris(...giris);
  return o;
}
// Atlas kurumu ogrencisi: karaktersiz baslar (ilk acilis secimi).
const ATLAS = ['+905551110005', 'uyelik-ogrenci-b'] as const;

describe('ogrenci Bugun: motivasyon karti', () => {
  it('karakter, seri alevi, gunun hedefi (2/3 gibi), bugunku XP ve buyuk Odaklan dugmesi', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OgrenciBugun />);
    expect(var_(r, 'bugun-motivasyon')).toBe(true);
    expect(var_(r, 'karakter-sahnesi')).toBe(true);
    const m = metinler(r);
    expect(m).toContain('günlük seri');
    expect(m).toContain('Günün hedefi');
    expect(m).toMatch(/0\/3 plan görevi/);
    expect(m).toContain('Bugün 0 XP kazandın');
    expect(var_(r, 'seviye-cubugu')).toBe(true);
    await testIDDokun(r, 'bugun-odaklan');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/odaklan');
  });

  it('karakter yoksa secime yonlendirir ("Karakter sec" karti)', async () => {
    const o = await ogrenciOrtami(ATLAS);
    const r = await ac(o, <OgrenciBugun />);
    expect(var_(r, 'karakter-sec-karti')).toBe(true);
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/karakter-sec');
    mockYonlendirici.push.mockClear();
    await testIDDokun(r, 'karakter-sec-dugme');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/karakter-sec');
  });

  it('oyunlastirma kapaliysa karakter, seri ve XP arayuzu yok; Odaklan kalir', async () => {
    const o = await ogrenciOrtami();
    modulAyarla(o, { oyunlastirma: false });
    const r = await ac(o, <OgrenciBugun />);
    expect(var_(r, 'bugun-motivasyon')).toBe(false);
    expect(var_(r, 'karakter-sahnesi')).toBe(false);
    expect(metinler(r)).not.toContain('XP');
    expect(etiketVarMi(r, 'Odaklan')).toBe(true);
  });
});

describe('Karakterim (yuva)', () => {
  it('karakter, seviye, beseli grafik (metin alternatifi), seri + takvim, rozetler, dolap, hareketler', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <Karakterim />);
    const m = metinler(r);
    expect(m).toContain('Közü');
    expect(var_(r, 'karakter-sahnesi')).toBe(true);
    expect(var_(r, 'seviye-cubugu')).toBe(true);
    const radar = r.root.findAll(
      (n) => n.props.testID === 'beceri-radari' && typeof n.type === 'string',
    )[0]!;
    expect(radar.props.accessibilityLabel).toContain('Sayısal');
    expect(radar.props.accessibilityLabel).toContain('Dil');
    expect(var_(r, 'seri-bolumu')).toBe(true);
    expect(var_(r, 'seri-takvim')).toBe(true);
    expect(var_(r, 'seri-dondurma')).toBe(true);
    expect(m).toContain('Dondurma hakkı');
    expect(var_(r, 'rozet-bolumu')).toBe(true);
    expect(var_(r, 'kozmetik-dolabi')).toBe(true);
    expect(var_(r, 'son-hareketler')).toBe(true);
    expect(var_(r, 'yildizlarim')).toBe(true);
    expect(m).toContain('Haftanın yıldızları');
    // takvimde renge dayanmayan gun durumlari: her hucrenin erisilebilirlik etiketi var
    const hucreler = r.root.findAll(
      (n) =>
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('seri-gun-') &&
        typeof n.type === 'string',
    );
    expect(hucreler.length).toBe(35);
    expect(hucreler.every((h) => String(h.props.accessibilityLabel).includes(':'))).toBe(true);
  });

  it('seri takvimi suclamaz: "kacirdin" metni yok', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <Karakterim />);
    expect(metinler(r)).not.toMatch(/kaçırdın|kaybettin|başarısız/i);
  });

  it('vitrin: en cok 3 rozet secilir, secim yerelde kalir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <Karakterim />);
    expect(metinler(r)).toContain('Vitrinde göstermek için en çok 3 rozet seç.');
    await testIDDokun(r, 'vitrin-odev_bronz');
    expect(metinler(r)).toContain('Ödev Arı · Bronz');
    await testIDDokun(r, 'vitrin-odev_bronz');
    expect(metinler(r)).toContain('Vitrinde göstermek için');
  });

  it('kilitli rozet ilerlemesi ve bronz/gumus kademesi metinle gosterilir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <Karakterim />);
    const m = metinler(r);
    expect(m).toContain('120/300');
    expect(m).toContain('Bronz');
    expect(m).toContain('Gümüş');
  });

  it('kostum dolabi: kusan / cikar; kilitlinin kosulu yazilir', async () => {
    const o = await ogrenciOrtami();
    const kusan = jest.spyOn(o.adaptorler.motivasyon, 'kusan');
    const r = await ac(o, <Karakterim />);
    const m = metinler(r);
    expect(m).toContain('Seviye 10 olunca açılır');
    expect(m).toContain('30 günlük seriye ulaşınca açılır');
    await testIDDokun(r, 'kusan-gozluk_yildiz');
    await bekle(60);
    expect(kusan).toHaveBeenCalledWith('gozluk', 'gozluk_yildiz');
    expect(metinler(r)).toContain('Yıldız gözlük');
    await testIDDokun(r, 'kusan-gozluk_yildiz'); // artik "Cikar"
    await bekle(60);
    const kozm = await o.adaptorler.motivasyon.kozmetikler();
    expect(kozm.find((k) => k.kod === 'gozluk_yildiz')?.kusanildi).toBe(false);
  });

  it('ad degistirme: uygunsuz ad anlasilir hata verir, uygun ad kaydedilir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <Karakterim />);
    await testIDDokun(r, 'ad-degistir-ac');
    await yaz(r, 'Karakterin adı', 'aptal');
    await testIDDokun(r, 'ad-kaydet');
    expect(metinler(r)).toContain('Bu ad uygun değil');
    await yaz(r, 'Karakterin adı', 'Parıltı');
    await testIDDokun(r, 'ad-kaydet');
    await bekle(60);
    expect((await o.adaptorler.motivasyon.karakter())?.ad).toBe('Parıltı');
  });

  it('tur degistirme tek sefer: ilkinden sonra dugme pasif ve aciklama gorunur', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <Karakterim />);
    await testIDDokun(r, 'tur-degistir-ac');
    await testIDDokun(r, 'tur-dinamo');
    await testIDDokun(r, 'karakter-onayla');
    await bekle(60);
    expect((await o.adaptorler.motivasyon.karakter())?.tur_kodu).toBe('dinamo');
    expect(metinler(r)).toContain('Tür değiştirme hakkını kullandın');
    const dugme = r.root.findAll(
      (n) => n.props.testID === 'tur-degistir-ac' && typeof n.type === 'string',
    )[0]!;
    expect(dugme.props.accessibilityState.disabled).toBe(true);
  });

  it('kural adlari Turkce, bilinmeyen kod okunur hale gelir', () => {
    expect(kuralAdi('plan_gorevi_tamam')).toBe('Plan görevi tamam');
    expect(kuralAdi('yeni_kural_kodu')).toBe('Yeni kural kodu');
  });
});

describe('karakter secimi (ilk acilis)', () => {
  it('3 tur + asama onizlemesi; ad zorunlu; uygunsuz ad hatasi; basarida bitti cagrilir', async () => {
    const o = await ogrenciOrtami(ATLAS);
    const bitti = jest.fn();
    const r = await ac(o, <KarakterSecimi mod="ilk" bitti={bitti} vazgec={jest.fn()} />);
    for (const t of ['kivilcim', 'dinamo', 'sedir']) expect(var_(r, `tur-${t}`)).toBe(true);
    expect(var_(r, 'asama-onizleme')).toBe(true);
    const onay = () =>
      r.root.findAll((n) => n.props.testID === 'karakter-onayla' && typeof n.type === 'string')[0]!;
    expect(onay().props.accessibilityState.disabled).toBe(true); // ad yok
    await testIDDokun(r, 'tur-sedir');
    await yaz(r, 'Karakterin adı', 'aptal');
    await testIDDokun(r, 'karakter-onayla');
    expect(metinler(r)).toContain('Bu ad uygun değil');
    expect(bitti).not.toHaveBeenCalled();
    await yaz(r, 'Karakterin adı', 'Çınar');
    await testIDDokun(r, 'karakter-onayla');
    await bekle(60);
    expect(bitti).toHaveBeenCalledTimes(1);
    const k = await o.adaptorler.motivasyon.karakter();
    expect(k).toMatchObject({ tur_kodu: 'sedir', ad: 'Çınar', tur_degistirme_hakki: 1 });
  });

  it('"Sonra secerim" gecer; secim yapilmadan karakter olusmaz', async () => {
    const o = await ogrenciOrtami(ATLAS);
    const vazgec = jest.fn();
    const r = await ac(o, <KarakterSecimi mod="ilk" bitti={jest.fn()} vazgec={vazgec} />);
    await testIDDokun(r, 'karakter-sonra');
    expect(vazgec).toHaveBeenCalled();
    expect(await o.adaptorler.motivasyon.karakter()).toBeNull();
  });

  it('Karakterim sekmesi karaktersiz ogrencide secimi acar', async () => {
    const o = await ogrenciOrtami(ATLAS);
    const r = await ac(o, <Karakterim />);
    expect(var_(r, 'karakter-secimi')).toBe(true);
  });
});

describe('odak sayaci (mock)', () => {
  it('serbest mod: sure secimi, baslat -> sayac, bitir -> kazanim; sunucuya baglanir', async () => {
    const o = await ogrenciOrtami();
    const baslat = jest.spyOn(o.adaptorler.motivasyon, 'odakBaslat');
    const r = await ac(o, <Odaklan />);
    expect(var_(r, 'odak-baslat')).toBe(true);
    await testIDDokun(r, 'odak-mod-serbest');
    expect(var_(r, 'odak-serbest')).toBe(true);
    await dokun(r, 'Süreyi 5 dakika azalt');
    expect(metinler(r)).toContain('25 dk');
    await testIDDokun(r, 'odak-baslat');
    await bekle(60);
    expect(baslat).toHaveBeenCalledTimes(1);
    expect(baslat.mock.calls[0]![0]).toMatchObject({ mod: 'serbest', planlananDk: 25 });
    expect(var_(r, 'odak-sure')).toBe(true);
    expect(metinler(r)).toContain('25:00');
    // "Bitir" onay penceresi
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await testIDDokun(r, 'odak-bitir');
    const dugmeler = alert.mock.calls[0]![2]!;
    await act(async () => {
      dugmeler.find((d) => d.style === 'destructive')!.onPress!();
    });
    await bekle(80);
    expect(var_(r, 'odak-sonuc')).toBe(true);
    expect(metinler(r)).toContain('Odak turunu erken bitirdin');
    expect(var_(r, 'odak-yeni-tur')).toBe(true);
    await testIDDokun(r, 'odak-yeni-tur');
    expect(var_(r, 'odak-baslat')).toBe(true);
    alert.mockRestore();
  });

  it('cevrimdisi baslat: kuyruk isi; bitirince "kaydediliyor" notu', async () => {
    const o = await ogrenciOrtami();
    o.cevrimici.deger = false;
    const r = await ac(o, <Odaklan />);
    await testIDDokun(r, 'odak-baslat');
    await bekle(60);
    expect(o.kuyruk.bekleyenler().map((i) => i.tur)).toEqual(['odak.baslat']);
    expect(metinler(r)).toContain('Bağlantı yok');
    await act(async () => {
      o.servisler.odak.bitir('yarida');
    });
    await bekle(60);
    expect(var_(r, 'odak-bekliyor')).toBe(true);
    expect(o.kuyruk.bekleyenler().map((i) => i.tur)).toEqual(['odak.baslat', 'odak.bitir']);
    o.cevrimici.deger = true;
    await act(async () => {
      await o.kuyruk.bosalt();
    });
    await bekle(60);
    expect(var_(r, 'odak-bekliyor')).toBe(false);
  });

  it('plan gorevi secimi yalniz dakika tipli gorevler icin; secilince oturuma baglanir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <Odaklan />);
    const dakikaGorevleri = r.root.findAll(
      (n) =>
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('odak-gorev-') &&
        typeof n.props.onPress === 'function',
    );
    expect(dakikaGorevleri.length).toBeGreaterThan(0);
    const baslat = jest.spyOn(o.adaptorler.motivasyon, 'odakBaslat');
    await act(async () => {
      (dakikaGorevleri[0]!.props.onPress as () => void)();
    });
    await testIDDokun(r, 'odak-baslat');
    await bekle(60);
    expect(baslat.mock.calls[0]![0].planGorevId).toBeTruthy();
    expect(var_(r, 'odak-gorev')).toBe(true);
    expect(odakGorevleri([])).toEqual([]);
  });

  it('409 acik oturum: devam eden oturum surdurulur ve bilgilendirilir', async () => {
    const o = await ogrenciOrtami();
    await o.adaptorler.motivasyon.odakBaslat({
      istemciId: '00000000-0000-7000-c000-000000000001',
      mod: 'serbest',
      planlananDk: 30,
      baslangicAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    });
    // Ekran acilinca sunucudaki acik oturum devralinir (baslat 409'u birim testte).
    const r = await ac(o, <Odaklan />);
    expect(var_(r, 'odak-baslat')).toBe(false);
    expect(var_(r, 'odak-sure')).toBe(true);
    expect(metinler(r)).toContain('kaldığın yerden');
  });

  it('uygulama yeniden acilinca (yukle) devam eden oturum sayacla gorunur', async () => {
    const o = await ogrenciOrtami();
    await act(async () => {
      await o.servisler.odak.baslat({ mod: '25_5', planlananDk: 25 });
    });
    const yeni = o.servisler.odak;
    expect(yeni.al().faz).toBe('calisiyor');
    const r = await ac(o, <Odaklan />);
    expect(var_(r, 'odak-sure')).toBe(true);
  });
});

describe('XP geri bildirimi (merkezi)', () => {
  it('plan gorevi tamamlaninca eylemTamam "+N XP" olayi uretir; kutlama icin seviye farki da gelir', async () => {
    const o = await ogrenciOrtami();
    const olaylar: XpOlayi[] = [];
    o.servisler.xp.abone((e) => olaylar.push(e));
    o.servisler.xp.gozlemle(await o.adaptorler.motivasyon.benim());
    const gorev = (await o.adaptorler.ogrenme.planim(new Date().toISOString().slice(0, 10)))
      .gorevler[0];
    // mock "tamam" XP'si (plan_gorevi) icin gorevi hedef miktarla yaz
    const g =
      gorev ??
      (await o.adaptorler.ogrenme.gorevlerim(new Date().toISOString().slice(0, 10))).gorevler[0]!;
    await o.adaptorler.ogrenme.gorevGerceklesen(g.id, g.hedefMiktar);
    await o.servisler.xp.eylemTamam();
    expect(olaylar).toHaveLength(1);
    expect(olaylar[0]!.fark.xp).toBe(5);
    expect(olaylar[0]!.fark.seviyeAtladi).toBe(false);
  });

  it('seviye atlama ve evrim: biriken XP asama sinirini gecince evrim olayi', async () => {
    const o = await ogrenciOrtami();
    const olaylar: XpOlayi[] = [];
    o.servisler.xp.abone((e) => olaylar.push(e));
    o.servisler.xp.gozlemle(await o.adaptorler.motivasyon.benim());
    // mock baslangic XP'si 620 (seviye 4); serbest odakla 20+ dk XP -> seviye 5 = evre 2
    const id = '00000000-0000-7000-c000-0000000000e1';
    await o.adaptorler.motivasyon.odakBaslat({
      istemciId: id,
      mod: 'serbest',
      planlananDk: 60,
      baslangicAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    });
    await o.adaptorler.motivasyon.odakBitir(id, 'tamam');
    await o.servisler.xp.eylemTamam();
    expect(olaylar).toHaveLength(1);
    expect(olaylar[0]!.fark).toMatchObject({
      seviyeAtladi: true,
      evrim: true,
      eskiAsama: 1,
      yeniAsama: 2,
    });
  });
});

describe('ogretmen: grup motivasyonu', () => {
  async function ogretmenOrtami() {
    const o = ortamKur();
    await o.giris(...OGRETMEN);
    modulAyarla(o, { oyunlastirma: true });
    return o;
  }

  it('haftanin yildizi: ogrenci sec, gerekce, kalan hak; ayni ogrenciye ikinci kez 409 mesaji', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <GrupMotivasyonEkrani grupId="grup-8a" grupAd="8-A Matematik" />);
    expect(metinler(r)).toContain('Bu hafta 3 hakkın kaldı (en çok 3).');
    const dugme = () =>
      r.root.findAll((n) => n.props.testID === 'yildiz-ver' && typeof n.type === 'string')[0]!;
    expect(dugme().props.accessibilityState.disabled).toBe(true); // ogrenci secilmedi
    await testIDDokun(r, 'yildiz-ogrenci-ogr-elif');
    await yaz(r, 'Gerekçe (isteğe bağlı)', 'Çok çalıştı');
    await testIDDokun(r, 'yildiz-ver');
    await bekle(80);
    expect(metinler(r)).toContain('Elif Kaya haftanın yıldızı oldu (+50 XP).');
    expect(metinler(r)).toContain('Bu hafta 2 hakkın kaldı');
    await testIDDokun(r, 'yildiz-ogrenci-ogr-elif');
    await testIDDokun(r, 'yildiz-ver');
    await bekle(80);
    expect(metinler(r)).toContain('Bu öğrenci bu hafta zaten haftanın yıldızı oldu.');
  });

  it('haftalik sinir dolunca 409 mesaji ve dugme pasif', async () => {
    const o = await ogretmenOrtami();
    for (const id of ['ogr-elif', 'ogr-mert', 'ogr-zeynep']) {
      await o.adaptorler.motivasyon.yildizVer({ ogrenciId: id, grupId: 'grup-8a' });
    }
    const r = await ac(o, <GrupMotivasyonEkrani grupId="grup-8a" grupAd="8-A" />);
    expect(metinler(r)).toContain('Bu hafta 0 hakkın kaldı');
    expect(metinler(r)).toContain('Bu hafta verebileceğin yıldız hakkı doldu.');
    const dugme = r.root.findAll(
      (n) => n.props.testID === 'yildiz-ver' && typeof n.type === 'string',
    )[0]!;
    expect(dugme.props.accessibilityState.disabled).toBe(true);
  });

  it('seri duraklatma: dogrulama, olusturma, liste ve iptal', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <GrupMotivasyonEkrani grupId="grup-8a" grupAd="8-A" />);
    await yaz(r, 'Bitiş günü (YYYY-AA-GG)', '2020-01-01');
    await testIDDokun(r, 'duraklat-baslat');
    expect(var_(r, 'duraklat-hata')).toBe(true);
    // gecerli aralik (varsayilan: bugun .. bugun+6)
    await yaz(
      r,
      'Bitiş günü (YYYY-AA-GG)',
      new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
    );
    await testIDDokun(r, 'duraklat-baslat');
    await bekle(80);
    const liste = await o.adaptorler.motivasyon.duraklatmalar('grup-8a');
    expect(liste).toHaveLength(1);
    expect(metinler(r)).toContain('Etkin');
    // ayni aralik: cakisma
    await testIDDokun(r, 'duraklat-baslat');
    await bekle(80);
    expect(metinler(r)).toContain('zaten bir duraklatma var');
    // iptal
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await testIDDokun(r, `duraklatma-iptal-${liste[0]!.id}`);
    await act(async () => {
      alert.mock.calls[0]![2]!.find((d) => d.style === 'destructive')!.onPress!();
    });
    await bekle(80);
    expect(metinler(r)).toContain('İptal edildi');
    alert.mockRestore();
  });

  it('tarih araligi dogrulamasi: <= 31 gun, gecmis gun yok, sira', () => {
    const bugun = '2026-11-12';
    expect(duraklatmaHatasi('2026-11-12', '2026-12-12', bugun)).toBeNull(); // 31 gun
    expect(duraklatmaHatasi('2026-11-12', '2026-12-13', bugun)).toContain('en çok 31 gün');
    expect(duraklatmaHatasi('2026-11-11', '2026-11-20', bugun)).toContain('geçmişte');
    expect(duraklatmaHatasi('2026-11-20', '2026-11-15', bugun)).toContain('önce olamaz');
    expect(duraklatmaHatasi('20-11-2026', '2026-11-25', bugun)).toContain('YYYY-AA-GG');
  });

  it('modul kapaliysa ekran bilgi verir ve islem sunmaz', async () => {
    const o = await ogretmenOrtami();
    modulAyarla(o, { oyunlastirma: false });
    const r = await ac(o, <GrupMotivasyonEkrani grupId="grup-8a" grupAd="8-A" />);
    expect(var_(r, 'yildiz-bolumu')).toBe(false);
    expect(metinler(r)).toContain('oyunlaştırma modülü kapalı');
  });

  it('ogrenci kartinda motivasyon ozeti (seviye, grafik, seri, rozet); modul kapaliysa yok', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <OgrenciKartiEkrani ogrenciId="ogr-elif" ad="Elif Kaya" />);
    expect(var_(r, 'ogrenci-motivasyon')).toBe(true);
    expect(metinler(r)).toMatch(/rozet/);
    expect(var_(r, 'beceri-radari')).toBe(true);
    modulAyarla(o, { oyunlastirma: false });
    const r2 = await ac(o, <OgrenciKartiEkrani ogrenciId="ogr-elif" ad="Elif Kaya" />);
    expect(var_(r2, 'ogrenci-motivasyon')).toBe(false);
  });

  it('ozet 404 (kapsam disi) kartı sessizce gizler', async () => {
    const o = await ogretmenOrtami();
    jest
      .spyOn(o.adaptorler.motivasyon, 'ogrenciOzeti')
      .mockRejectedValue(new ApiHata('bulunamadi'));
    const r = await ac(o, <OgrenciKartiEkrani ogrenciId="ogr-x" ad="X" />);
    expect(var_(r, 'ogrenci-motivasyon')).toBe(false);
  });
});
