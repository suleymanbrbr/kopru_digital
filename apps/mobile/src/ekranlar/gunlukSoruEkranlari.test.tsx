/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion --
   react-test-renderer React 19'da kullanimdan kaldirildi ama React Native icin ek bagimlilik
   gerektirmeyen tek renderer; `props` tipsizdir (any). */
/**
 * Gunluk soru takibi mobil ekranlari (mock mod): form akisi, cevrimdisi kuyruk ve idempotent tekrar,
 * duzelt/sil (ayni gun), kendi analizi (oneri yok), ogretmen analizi (bant, oneri, hucre ayrintisi,
 * onayli "Gorev ver"), kaynak kitap ilerlemesi. Mock tohumlari simdiki zamana baglidir; tarihler
 * `bugunTarihi` ile hesaplanir.
 */
import type { ReactTestRenderer } from 'react-test-renderer';

import { MOCK_SAAT_DILIMI } from '../api/mockOperasyon';
import { bugunTarihi, tarihEkle } from '../lib/saat';
import { GunlukKayitlarim } from './gunluk/GunlukKayitlarim';
import { GunlukSoruFormu } from './gunluk/GunlukSoruFormu';
import { KaynakKitaplarEkrani } from './gunluk/KaynakKitaplarEkrani';
import { KonuAnaliziEkrani } from './gunluk/KonuAnaliziEkrani';
import { OgrenciBugun } from './OgrenciBugun';
import { OgrenciKartiEkrani } from './OgrenciKartiEkrani';
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
});

const bugun = () => bugunTarihi(MOCK_SAAT_DILIMI);

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

/** Formu doldurur: ders, son konu cipi, zorluk ve D/Y/B sayilari. */
async function formDoldur(r: ReactTestRenderer, sayilar: [string, string, string]) {
  await testIDDokun(r, 'ders-matematik');
  await testIDDokun(r, 'son-konu-konu-m-uslu');
  await dokun(r, 'Orta');
  await yaz(r, 'Doğru sayısı', sayilar[0]);
  await yaz(r, 'Yanlış sayısı', sayilar[1]);
  await yaz(r, 'Boş sayısı', sayilar[2]);
}

async function benimBugunum(o: Ortam) {
  const s = await o.adaptorler.gunlukSoru.kayitlarim({ gun: bugun() });
  return s.kayitlar;
}

describe('Soru cozdum formu (ogrenci)', () => {
  it('ders > son konu > zorluk > sayilar; kaydet kayit olusturur ve son secim hatirlanir', async () => {
    const o = await ogrenciOrtami();
    const once = (await benimBugunum(o)).length;
    const r = await ac(o, <GunlukSoruFormu />);
    // Son kullanilan konular sunucudan gelir (Deniz'in gecmis kayitlari).
    await testIDDokun(r, 'ders-matematik');
    expect(var_(r, 'son-konular-ciplari')).toBe(true);
    await formDoldur(r, ['12', '6', '2']);
    expect(metinler(r)).toContain('20 soru');
    expect(metinler(r)).toContain('Üslü Sayılar · Orta · 12 doğru, 6 yanlış, 2 boş');
    await testIDDokun(r, 'gunluk-kaydet');
    await bekle(60);
    const sonra = await benimBugunum(o);
    expect(sonra).toHaveLength(once + 1);
    const yeni = sonra.find((k) => k.dogru === 12 && k.yanlis === 6 && k.bos === 2);
    expect(yeni).toMatchObject({
      bransKodu: 'matematik',
      konuId: 'konu-m-uslu',
      zorluk: 'orta',
      gun: bugun(),
      toplam: 20,
    });
    expect(mockYonlendirici.back).toHaveBeenCalled();
    // Son secim cihazda hatirlanir: yeni form ayni ders/konu/zorlukla acilir.
    const r2 = await ac(o, <GunlukSoruFormu />);
    expect(metinler(r2)).toContain('Üslü Sayılar');
    await yaz(r2, 'Doğru sayısı', '5');
    expect(metinler(r2)).toContain('Üslü Sayılar · Orta · 5 doğru');
  });

  it('bos toplam: hata gosterir, kayit olusmaz', async () => {
    const o = await ogrenciOrtami();
    const once = (await benimBugunum(o)).length;
    const r = await ac(o, <GunlukSoruFormu />);
    await testIDDokun(r, 'gunluk-kaydet');
    expect(metinler(r)).toContain('En az bir soru gir.');
    expect(await benimBugunum(o)).toHaveLength(once);
    expect(o.gonderim.liste().filter((g) => g.tur === 'gunluk_soru')).toHaveLength(0);
  });

  it('+/- dugmeleri 0..500 araliginda; sayi alani rakam disini atar', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <GunlukSoruFormu />);
    await testIDDokun(r, 'sayi-dogru-arttir');
    await testIDDokun(r, 'sayi-dogru-arttir');
    await testIDDokun(r, 'sayi-yanlis-arttir');
    expect(metinler(r)).toContain('3 soru');
    await testIDDokun(r, 'sayi-dogru-azalt');
    expect(metinler(r)).toContain('2 soru');
    // Alan basina en cok 500; toplam 500'u asarsa kaydetmeden uyarir (api 422 vermeden once).
    await yaz(r, 'Doğru sayısı', 'a9b9c9');
    expect(metinler(r)).toContain('501 soru');
    await testIDDokun(r, 'gunluk-kaydet');
    expect(metinler(r)).toContain('Toplam soru sayısı 1 ile 500 arasında olmalı.');
    expect(o.gonderim.liste().filter((g) => g.tur === 'gunluk_soru')).toHaveLength(0);
  });

  it('cevrimdisi: kayit cihazda kuyruga girer, baglanti gelince bir kez gonderilir; tekrar ayni kaydi verir', async () => {
    const o = await ogrenciOrtami();
    const once = (await benimBugunum(o)).length;
    // Form acilirken cevrimiciydi (son kullanilanlar ve konular onbellekte); sonra baglanti gider.
    const r = await ac(o, <GunlukSoruFormu />);
    o.cevrimici.deger = false;
    await bekle(60);
    await formDoldur(r, ['9', '1', '0']);
    await testIDDokun(r, 'gunluk-kaydet');
    await bekle(60);
    // Cevrimdisiyken sunucuya hicbir sey gitmedi; is kalici kuyrukta, gonderim "gonderiliyor".
    expect(o.kuyruk.bekleyenler()).toHaveLength(1);
    const g = o.gonderim.liste().find((x) => x.tur === 'gunluk_soru')!;
    expect(g.durum).toBe('gonderiliyor');
    expect(g.govde).toMatchObject({ tur: 'gunluk_soru', gun: bugun(), dogru: 9, yanlis: 1 });
    o.cevrimici.deger = true;
    expect(await benimBugunum(o)).toHaveLength(once);
    const s = await o.kuyruk.bosalt();
    expect(s.bekleyen).toBe(0);
    const sonra = await benimBugunum(o);
    expect(sonra).toHaveLength(once + 1);
    expect(o.gonderim.al(g.id)?.durum).toBe('gonderildi');
    // Ayni istek_id ile tekrar (zayif baglantida yanit kaybolmus): yeni kayit acilmaz.
    const k = sonra.find((x) => x.dogru === 9 && x.yanlis === 1)!;
    const tekrar = await o.adaptorler.gunlukSoru.kayitOlustur({
      gun: bugun(),
      bransKodu: 'matematik',
      konuId: 'konu-m-uslu',
      zorluk: 'orta',
      dogru: 9,
      yanlis: 1,
      bos: 0,
      dosyaIdleri: [],
      istekId: g.istekId,
    });
    expect(tekrar.yeni).toBe(false);
    expect(tekrar.kayit.id).toBe(k.id);
    expect(await benimBugunum(o)).toHaveLength(once + 1);
  });

  it('fotografli kayit: yukleme hattindan gecer, dosya kimligi kayda baglanir', async () => {
    const o = await ogrenciOrtami();
    await o.gonderim.baslat({
      tur: 'gunluk_soru',
      baslik: 'Üslü Sayılar',
      govde: {
        tur: 'gunluk_soru',
        gun: bugun(),
        bransKodu: 'matematik',
        konuId: 'konu-m-uslu',
        zorluk: 'zor',
        dogru: 3,
        yanlis: 6,
        bos: 1,
        fotograflar: ['f0'],
      },
      dosyalar: {
        f0: { tur: 'gunluk_soru_fotografi', mimeTipi: 'image/jpeg', yerelUri: 'file:///f0.jpg' },
      },
    });
    for (let i = 0; i < 20 && o.gonderim.liste().some((g) => g.durum !== 'gonderildi'); i += 1) {
      await bekle(30);
      await o.kuyruk.bosalt();
    }
    expect(o.gonderim.liste().at(-1)?.durum).toBe('gonderildi');
    const k = (await benimBugunum(o)).find((x) => x.zorluk === 'zor' && x.dogru === 3);
    expect(k?.dosyalar).toHaveLength(1);
  });

  it('kalici hata (gecersiz gun): gonderim hataya duser, kullanici yeniden dener ya da vazgecer', async () => {
    const o = await ogrenciOrtami();
    await o.gonderim.baslat({
      tur: 'gunluk_soru',
      baslik: 'Üslü Sayılar',
      govde: {
        tur: 'gunluk_soru',
        gun: tarihEkle(bugun(), -10),
        bransKodu: 'matematik',
        konuId: 'konu-m-uslu',
        zorluk: 'kolay',
        dogru: 1,
        yanlis: 0,
        bos: 0,
        fotograflar: [],
      },
      dosyalar: {},
    });
    await bekle(60);
    const g = o.gonderim.liste().find((x) => x.tur === 'gunluk_soru')!;
    expect(g.durum).toBe('hata');
    expect(g.hataKodu).toBe('gun_gecersiz');
    const r = await ac(o, <OgrenciBugun />);
    expect(var_(r, 'gunluk-gonderim-hata')).toBe(true);
    expect(metinler(r)).toContain('Gönderilemedi');
    await dokun(r, 'Vazgeç');
    expect(o.gonderim.liste().filter((x) => x.tur === 'gunluk_soru')).toHaveLength(0);
  });
});

describe('Kayitlarim: ayni gun duzelt / sil', () => {
  it('yalniz bugunku kayitta Duzelt ve Sil; silme onayli ve kaydi kaldirir', async () => {
    const o = await ogrenciOrtami();
    const kayitlar = await benimBugunum(o);
    const bugunku = kayitlar[0]!;
    const r = await ac(o, <GunlukKayitlarim />);
    expect(var_(r, `gunluk-duzelt-${bugunku.id}`)).toBe(true);
    // Dunku kayitlarda duzenleme dugmesi yok.
    const dunku = (await o.adaptorler.gunlukSoru.kayitlarim({ gun: tarihEkle(bugun(), -1) }))
      .kayitlar[0]!;
    expect(dunku.duzenlenebilir).toBe(false);
    expect(var_(r, `gunluk-duzelt-${dunku.id}`)).toBe(false);
    await testIDDokun(r, `gunluk-sil-${bugunku.id}`);
    expect(metinler(r)).toContain('Bu kayıt silinsin mi?');
    await testIDDokun(r, `gunluk-sil-evet-${bugunku.id}`);
    await bekle(60);
    expect((await benimBugunum(o)).some((k) => k.id === bugunku.id)).toBe(false);
  });

  it('eski kaydi duzeltme/silme 409 kayit_duzenlenemez', async () => {
    const o = await ogrenciOrtami();
    const dunku = (await o.adaptorler.gunlukSoru.kayitlarim({ gun: tarihEkle(bugun(), -1) }))
      .kayitlar[0]!;
    await expect(o.adaptorler.gunlukSoru.kayitDuzelt(dunku.id, { dogru: 1 })).rejects.toMatchObject(
      { kod: 'cakisma', ayrinti: 'kayit_duzenlenemez' },
    );
    await expect(o.adaptorler.gunlukSoru.kayitSil(dunku.id)).rejects.toMatchObject({
      ayrinti: 'kayit_duzenlenemez',
    });
  });

  it('duzeltme formu mevcut degerleri yukler ve kaydi gunceller', async () => {
    const o = await ogrenciOrtami();
    const bugunku = (await benimBugunum(o))[0]!;
    const r = await ac(o, <GunlukSoruFormu duzelt={bugunku.id} />);
    expect(var_(r, 'gunluk-duzeltme-bilgisi')).toBe(true);
    await yaz(r, 'Doğru sayısı', '19');
    await testIDDokun(r, 'gunluk-kaydet');
    await bekle(60);
    const yeni = (await benimBugunum(o)).find((k) => k.id === bugunku.id)!;
    expect(yeni.dogru).toBe(19);
    expect(yeni.surum).toBe(bugunku.surum + 1);
  });

  it('plan gorevine bagli kayit gorevin gerceklesenini artirir, silince geri alir', async () => {
    const o = await ogrenciOrtami();
    const gorevler = (await o.adaptorler.ogrenme.planim(bugun())).gorevler.filter(
      (g) => g.gun === bugun() && g.hedefTuru === 'soru',
    );
    const gorev = gorevler[0]!;
    const onceki = gorev.gerceklesen ?? 0;
    const { kayit } = await o.adaptorler.gunlukSoru.kayitOlustur({
      gun: bugun(),
      bransKodu: gorev.bransKodu,
      konuId: gorev.konuId ?? 'konu-m-uslu',
      zorluk: 'orta',
      dogru: 5,
      yanlis: 3,
      bos: 0,
      planGorevId: gorev.id,
      dosyaIdleri: [],
      istekId: 'istek-plan-1',
    });
    const sonra = (await o.adaptorler.ogrenme.planim(bugun())).gorevler.find(
      (g) => g.id === gorev.id,
    );
    expect(sonra?.gerceklesen).toBe(onceki + 8);
    await o.adaptorler.gunlukSoru.kayitSil(kayit.id);
    const silindi = (await o.adaptorler.ogrenme.planim(bugun())).gorevler.find(
      (g) => g.id === gorev.id,
    );
    expect(silindi?.gerceklesen ?? 0).toBe(onceki);
  });
});

describe('Konu analizi', () => {
  it('ogretmen: konu x zorluk hucreleri (renk + sayi + metin), bant, oneri ve birebir ders isareti', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <KonuAnaliziEkrani ogrenciId="ogr-elif" ogrenciAd="Elif Kaya" />);
    const m = metinler(r);
    expect(m).toContain('Elif Kaya: konu analizi');
    // Uslu sayilar: kolay %90, orta %60, zor %25 -> orta seviyede zorlaniyor.
    expect(var_(r, 'konu-satiri-konu-m-uslu')).toBe(true);
    expect(m).toContain('%90');
    expect(m).toContain('%60');
    expect(m).toContain('%25');
    expect(m).toContain('Orta seviyede zorlanıyor');
    expect(m).toContain('Veri az'); // Kareköklü sayilar yalniz 8 soru
    // Hucre etiketleri renk disinda sayi ve durum metni de tasir (erisilebilirlik).
    const hucre = bul(r, 'hucre-konu-m-uslu-orta');
    expect(hucre.props.accessibilityLabel).toContain('Orta: %60 · 20 soru');
    // Oneriler: gorev oner + birebir ders.
    expect(var_(r, 'oneri-gorev-konu-m-uslu')).toBe(true);
    expect(m).toContain('Üslü Sayılar: orta seviyeden 20 soruluk görev öner');
    expect(var_(r, 'oneri-birebir-konu-m-denklem')).toBe(true);
    expect(m).toContain('birebir ders gerekebilir');
    // Haftalik ozet.
    expect(var_(r, 'haftalik-ozet')).toBe(true);
    expect(m).toContain('En zayıf konular');
  });

  it('ders ve tarih araligi degisince analiz yeniden hesaplanir', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <KonuAnaliziEkrani ogrenciId="ogr-elif" ogrenciAd="Elif Kaya" />);
    await testIDDokun(r, 'analiz-ders-fen_bilimleri');
    expect(var_(r, 'konu-satiri-konu-f-yayilma')).toBe(true);
    expect(var_(r, 'konu-satiri-konu-m-uslu')).toBe(false);
    await testIDDokun(r, 'analiz-ders-matematik');
    // 7 gunde ilk bant verisinin eski (9-12 gun once) kayitlari gorunmez.
    await testIDDokun(r, 'analiz-donem-7');
    expect(var_(r, 'hucre-konu-m-uslu-kolay')).toBe(true);
    expect(bul(r, 'hucre-konu-m-uslu-kolay').props.accessibilityLabel).toContain('Kayıt yok');
  });

  it('hucre ayrintisi: kayitlar ve fotograflar', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <KonuAnaliziEkrani ogrenciId="ogr-elif" ogrenciAd="Elif Kaya" />);
    await testIDDokun(r, 'hucre-konu-m-uslu-zor');
    expect(var_(r, 'hucre-ayrintisi')).toBe(true);
    expect(metinler(r)).toContain('Üslü Sayılar, Zor seviye');
    expect(metinler(r)).toContain('3 doğru, 6 yanlış, 1 boş (10 soru)');
    const fotolar = r.root.findAll(
      (n) => n.props.accessibilityLabel === '1. fotoğraf' && typeof n.type !== 'string',
    );
    expect(fotolar.length).toBeGreaterThan(0);
    await testIDDokun(r, 'ayrinti-kapat');
    expect(var_(r, 'hucre-ayrintisi')).toBe(false);
  });

  it('"Gorev ver" onayli: onaylamadan hicbir sey gitmez; onaylayinca ogrencinin gorevlerinde gorunur', async () => {
    const o = await ogretmenOrtami();
    const ogrenci = 'uyelik-ogrenci-a';
    const r = await ac(o, <KonuAnaliziEkrani ogrenciId={ogrenci} ogrenciAd="Deniz Yılmaz" />);
    await testIDDokun(r, 'analiz-ders-matematik');
    // Deniz: Denklemler zor bantta zayif; kolay/orta/zor yeterli veri yok -> dogrudan hucreden gorev ver.
    await testIDDokun(r, 'hucre-konu-m-denklem-zor');
    await testIDDokun(r, 'ayrinti-gorev-ver');
    expect(var_(r, 'gorev-paneli')).toBe(true);
    expect(metinler(r)).toContain('yarına haftalık plan görevi');
    const yarin = tarihEkle(bugun(), 1);
    const onceki = (await o.adaptorler.ogrenme.ogrenciPlani(ogrenci, bugun())).gorevler.length;
    // Vazgecince plan degismez.
    await testIDDokun(r, 'gorev-vazgec');
    expect(var_(r, 'gorev-paneli')).toBe(false);
    expect((await o.adaptorler.ogrenme.ogrenciPlani(ogrenci, bugun())).gorevler).toHaveLength(
      onceki,
    );
    await testIDDokun(r, 'ayrinti-gorev-ver');
    await yaz(r, 'Soru sayısı', '25');
    expect(metinler(r)).toContain('Denklemler, zor seviyeden 25 soru');
    await testIDDokun(r, 'gorev-onayla');
    await bekle(60);
    expect(var_(r, 'gorev-sonuc')).toBe(true);
    expect(metinler(r)).toContain('Görev verildi');
    // Ogrenci kendi gorevlerinde gorur.
    await o.giris(...OGRENCI);
    const gorevler = (await o.adaptorler.ogrenme.gorevlerim(yarin)).gorevler;
    expect(gorevler.some((g) => g.hedefMiktar === 25 && g.baslik?.includes('Denklemler'))).toBe(
      true,
    );
  });

  it('ogrenci: kendi analizi ONERI, haftalik ozet ve gorev ver icermez', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <KonuAnaliziEkrani />);
    const m = metinler(r);
    expect(m).toContain('Konu analizim');
    expect(var_(r, 'konu-listesi')).toBe(true);
    expect(var_(r, 'oneriler')).toBe(false);
    expect(var_(r, 'oneri-yok')).toBe(false);
    expect(var_(r, 'haftalik-ozet')).toBe(false);
    expect(m).not.toContain('Öneriler');
    expect(m).not.toContain('Görev ver');
    expect(m).not.toContain('birebir ders');
    // Adaptor yaniti da oneri alanini tasimaz.
    const a = await o.adaptorler.gunlukSoru.analiz({ bransKodu: 'matematik', donem: '30' });
    expect('oneriler' in a).toBe(false);
  });

  it('ogrenci ogrenci analizini ya da baska ogrencinin analizini goremez', async () => {
    const o = await ogrenciOrtami();
    await expect(
      o.adaptorler.gunlukSoru.analiz({ bransKodu: 'matematik', donem: '30' }, 'ogr-elif'),
    ).rejects.toMatchObject({ kod: 'izin_yok' });
  });

  it('ogrenci kartinda Konu analizi ve kaynak kitap girisi (personel)', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <OgrenciKartiEkrani ogrenciId="ogr-elif" ad="Elif Kaya" />);
    await testIDDokun(r, 'konu-analizi-ac');
    expect(mockYonlendirici.push).toHaveBeenCalledWith({
      pathname: '/konu-analizi',
      params: { ogrenciId: 'ogr-elif', ad: 'Elif Kaya' },
    });
  });
});

describe('Kaynak kitaplar', () => {
  it('ogrenci kendi ilerlemesini gorur (cozulen test / toplam test)', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <KaynakKitaplarEkrani />);
    expect(metinler(r)).toContain('Esen Soru Bankası');
    expect(bul(r, 'kitap-ilerleme-kitap-esen').props.children).toBe('1 / 4 test çözüldü');
  });

  it('ogretmen secili ogrencinin ilerlemesini gorur; testler acilir', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <KaynakKitaplarEkrani ogrenciId="ogr-elif" ad="Elif Kaya" />);
    expect(metinler(r)).toContain('Elif Kaya: kaynak kitaplar');
    expect(bul(r, 'kitap-ilerleme-kitap-esen').props.children).toBe('1 / 4 test çözüldü');
    await dokun(r, 'Esen Soru Bankası, Esen Yayınları, Matematik, 1 / 4 test çözüldü');
    expect(var_(r, 'testler-kitap-esen')).toBe(true);
    expect(metinler(r)).toContain('Test 1: Üslü sayılar');
  });
});

describe('Bugun', () => {
  it('ogrenci Bugun: "Soru cozdum" girisi, bugunun ozeti ve kayitlarim/analizim baglantilari', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OgrenciBugun />);
    expect(var_(r, 'gunluk-bugun')).toBe(true);
    expect(metinler(r)).toContain('Bugün 30 soru çözdün');
    await testIDDokun(r, 'bugun-soru-cozdum');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/gunluk-soru-yeni');
    await testIDDokun(r, 'bugun-konu-analizim');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/konu-analizi');
  });
});
