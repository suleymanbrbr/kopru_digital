/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion --
   react-test-renderer React 19'da kullanimdan kaldirildi ama React Native icin ek bagimlilik
   gerektirmeyen tek renderer; `props` tipsizdir (any). */
/**
 * Mock modda ogrenme ekranlarinin (konu secici, ogrenci Gorevler, odev teslim, deneme, ogretmen
 * Bugun kartlari, odev ver/ozet, ogrenci karti Plan/Denemeler) render edildigini ve temel akislarin
 * calistigini gosterir. Mock tohumlari simdiki zamana bagli oldugundan tarihler `bugunTarihi` ile
 * hesaplanir; sabit tarih beklenmez.
 */
import { act } from 'react';
import type { ReactElement } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

import { MOCK_SAAT_DILIMI } from '../api/mockOperasyon';
import type { PlanGorevi } from '../api/ogrenmeTipleri';
import { ApiHata } from '../api/tipler';
import { bugunTarihi } from '../lib/saat';
import { haftaKaydir } from '../ogrenme/hafta';
import { BasarisizIsler } from './BasarisizIsler';
import { DenemeGirisFormu } from './DenemeGirisFormu';
import { DenemeOnayKuyrugu } from './DenemeOnayKuyrugu';
import { KonuSecici, KONU_SECIMI_BOS, type KonuSecimi } from './KonuSecici';
import { OdevOzetEkrani } from './OdevOzetEkrani';
import { OdevTeslimEkrani } from './OdevTeslimEkrani';
import { OdevVerEkrani } from './OdevVerEkrani';
import { OgrenciDenemeler } from './OgrenciDenemeler';
import { OgrenciGorevler } from './OgrenciGorevler';
import { OgrenciKartiEkrani } from './OgrenciKartiEkrani';
import { OgretmenBugun } from './OgretmenBugun';
import {
  OGRENCI,
  OGRETMEN,
  ac,
  bekle,
  bul,
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

const mockYonlendirici = { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
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

/** Bugunun (ogrenci) plan gorevleri. */
async function bugunGorevleri(o: Ortam): Promise<PlanGorevi[]> {
  const p = await o.adaptorler.ogrenme.planim(bugun());
  return p.gorevler.filter((g) => g.gun === bugun());
}

describe('KonuSecici', () => {
  function Sarmal({ onDegis }: { onDegis: (v: KonuSecimi) => void }) {
    return <KonuSecici deger={KONU_SECIMI_BOS} onDegis={onDegis} />;
  }

  it('Turkce duyarsiz arama, kalkan konu sunulmaz, 2 dokunusta secim, son kullanilanlar ustte', async () => {
    const o = await ogretmenOrtami();
    const sec = jest.fn();
    const r = await ac(o, <Sarmal onDegis={sec} />);
    await testIDDokun(r, 'konu-alani'); // 1. dokunus
    expect(var_(r, 'konu-paneli')).toBe(true);
    expect(var_(r, 'konu-konu-m-kume')).toBe(false); // "Eski Kümeler" kullanimdan kalkti
    await yaz(r, 'Konu ara', 'isik');
    expect(var_(r, 'konu-konu-f-yayilma')).toBe(true); // "Işığın Yayılması"
    expect(var_(r, 'konu-konu-m-uslu')).toBe(false);
    await testIDDokun(r, 'konu-konu-f-yayilma'); // 2. dokunus
    expect(sec).toHaveBeenCalledWith({ bransKodu: 'fen_bilimleri', konuId: 'konu-f-yayilma' });
    expect(var_(r, 'konu-paneli')).toBe(false);

    // Yeniden acinca son kullanilan en ustte "Son kullanilanlar" altinda.
    await testIDDokun(r, 'konu-alani');
    expect(var_(r, 'son-konular')).toBe(true);
    expect(metinler(r)).toContain('Son kullanılanlar');
  });

  it('brans suzgeci ve "yalniz ders" secimi', async () => {
    const o = await ogretmenOrtami();
    const sec = jest.fn();
    const r = await ac(o, <Sarmal onDegis={sec} />);
    await testIDDokun(r, 'konu-alani');
    await dokun(r, 'Matematik');
    expect(var_(r, 'konu-konu-m-uslu')).toBe(true);
    expect(var_(r, 'konu-konu-f-isik')).toBe(false);
    await dokun(r, 'Yalnız Matematik dersi (konu seçmeden)');
    expect(sec).toHaveBeenCalledWith({ bransKodu: 'matematik', konuId: null });
  });
});

describe('ogrenci Gorevler sekmesi', () => {
  it('bugunun plan gorevleri, gun seridi, yaklasan ve geciken odevler', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OgrenciGorevler />);
    const m = metinler(r);
    expect(m).toContain('Haftalık plan');
    expect(m).toContain('Fen bilimleri'); // bugunku 30 dk gorev
    expect(m).toContain('Üslü Sayılar'); // bugunku 20 soru gorevi (konu adi)
    expect(var_(r, `gun-${bugun()}`)).toBe(true);
    expect(var_(r, 'geciken-odevler')).toBe(true);
    expect(metinler(r)).toContain('Denklemler: 15 soru');
    expect(var_(r, 'yaklasan-odevler')).toBe(true);
    // incelenen odevin notu
    expect(m).toContain('Aferin, böyle devam.');
  });

  it('gerceklesen girisi 2 dokunus: karta dokun + Kaydet; kuyruk iyimser, aynı deger', async () => {
    const o = await ogrenciOrtami();
    const gorev = (await bugunGorevleri(o)).find((g) => g.hedefTuru === 'soru')!;
    const yaz_ = jest.spyOn(o.adaptorler.ogrenme, 'gorevGerceklesen');
    const r = await ac(o, <OgrenciGorevler />);
    await dokun(r, 'Üslü Sayılar, 20 soru, 0 / 20 soru, Bekliyor');
    await yaz(r, 'Çözdüğün soru sayısı', '15');
    await dokun(r, 'Kaydet');
    await bekle(60);
    // `surum` yollanmaz: yalniz (gorevId, miktar)
    expect(yaz_).toHaveBeenCalledTimes(1);
    expect(yaz_.mock.calls[0]).toEqual([gorev.id, 15]);
    expect(metinler(r)).toContain('15 / 20 soru');
    expect(o.kuyruk.bekleyenler()).toHaveLength(0);
  });

  it('cevrimdisiyken gerceklesen kuyruga alinir, iyimser gorunur ve baglanti gelince gonderilir', async () => {
    const o = await ogrenciOrtami();
    const gorev = (await bugunGorevleri(o)).find((g) => g.hedefTuru === 'dakika')!;
    const r = await ac(o, <OgrenciGorevler />);
    o.cevrimici.deger = false;
    await dokun(r, 'Fen bilimleri, 30 dk, 0 / 30 dk, Bekliyor');
    await dokun(r, 'Kaydet'); // hedef (30) onceden dolu
    expect(o.kuyruk.bekleyenler()).toHaveLength(1);
    expect(o.kuyruk.bekleyenler()[0]?.tur).toBe('plan.gerceklesen');
    expect(metinler(r)).toContain('30 / 30 dk');
    expect(var_(r, `gorev-bekliyor-${gorev.id}`)).toBe(true);
    o.cevrimici.deger = true;
    await act(async () => {
      await o.kuyruk.bosalt();
    });
    expect(o.kuyruk.bekleyenler()).toHaveLength(0);
    expect((await bugunGorevleri(o)).find((g) => g.id === gorev.id)?.durum).toBe('tamam');
  });

  it('Yarina tasi: gorev devredilir; cevrimdisiyken acik mesaj verir', async () => {
    const o = await ogrenciOrtami();
    const devret = jest.spyOn(o.adaptorler.ogrenme, 'gorevDevret');
    const r = await ac(o, <OgrenciGorevler />);
    o.cevrimici.deger = false;
    await dokun(r, 'Fen bilimleri, 30 dk, 0 / 30 dk, Bekliyor');
    await dokun(r, 'Yarına taşı');
    expect(metinler(r)).toContain('Çevrimdışısın');
    o.cevrimici.deger = true;
    await dokun(r, 'Yarına taşı');
    expect(devret).toHaveBeenCalled();
    expect(metinler(r)).toContain('Görev yarına taşındı.');
  });

  it('kalici hata (plan_kilitli) senkron ekraninda Turkce nedenle gorunur', async () => {
    const o = await ogrenciOrtami();
    const gorev = (await bugunGorevleri(o))[0]!;
    jest
      .spyOn(o.adaptorler.ogrenme, 'gorevGerceklesen')
      .mockRejectedValue(new ApiHata('cakisma', 'x', { durum: 409, ayrinti: 'plan_kilitli' }));
    o.kuyruk.ekle('plan.gerceklesen', {
      gorevId: gorev.id,
      gorevBaslik: 'Üslü Sayılar',
      gun: gorev.gun,
      miktar: 12,
    });
    await act(async () => {
      await o.kuyruk.bosalt();
    });
    expect(o.kuyruk.basarisizlar()).toHaveLength(1);
    const r = await ac(o, <BasarisizIsler />);
    expect(metinler(r)).toContain('Bu haftanın planı kilitlendi');
    expect(metinler(r)).toContain('Üslü Sayılar');
  });

  it('moduller kapaliysa bolumler gorunmez', async () => {
    const o = await ogrenciOrtami();
    modulAyarla(o, { haftalik_plan: false, odev: false, deneme: false });
    const r = await ac(o, <OgrenciGorevler />);
    const m = metinler(r);
    expect(m).not.toContain('Haftalık plan');
    expect(m).not.toContain('Ödevler');
    expect(m).not.toContain('Denemelerim');
  });

  it('plan yoksa (yayinlanmamis hafta) acik bos durum gosterilir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OgrenciGorevler />);
    for (let i = 0; i < 3; i++) await dokun(r, 'Sonraki hafta');
    expect(metinler(r)).toContain('plan henüz yayınlanmadı');
    expect(var_(r, `gun-${haftaKaydir(bugun(), 3)}`)).toBe(true);
    // Kilitli (eski) hafta: hafta sonu + 14 gunden eski plan salt okunur
    for (let i = 0; i < 6; i++) await dokun(r, 'Önceki hafta');
    expect(metinler(r)).toContain('Bu haftanın planı kilitlendi');
  });
});

describe('odev teslim (ogrenci)', () => {
  const ODEV_1 = 'oo-odev-1-uyelik-ogrenci-a';

  it('yapilan hedefle dolu: kart + "Teslim et"; teslim sonrasi onay', async () => {
    const o = await ogrenciOrtami();
    const teslim = jest.spyOn(o.adaptorler.ogrenme, 'odevTeslim');
    const r = await ac(o, <OdevTeslimEkrani ogrenciOdevId={ODEV_1} />);
    await dokun(r, 'Teslim et');
    expect(teslim).toHaveBeenCalledWith(ODEV_1, { yapilanSoru: 20 });
    expect(var_(r, 'teslim-tamam')).toBe(true);
  });

  it('dogru/yanlis/bos ve not; bos hesaplanir; toplam asimi reddedilir', async () => {
    const o = await ogrenciOrtami();
    const teslim = jest.spyOn(o.adaptorler.ogrenme, 'odevTeslim');
    const r = await ac(o, <OdevTeslimEkrani ogrenciOdevId={ODEV_1} />);
    await yaz(r, 'Doğru', '25');
    await dokun(r, 'Teslim et');
    expect(teslim).not.toHaveBeenCalled();
    expect(metinler(r)).toContain('toplamı yaptığın soru sayısını aşıyor');
    await yaz(r, 'Doğru', '15');
    await yaz(r, 'Yanlış', '3');
    await yaz(r, 'Notun (isteğe bağlı)', 'Zordu');
    await dokun(r, 'Teslim et');
    expect(teslim).toHaveBeenCalledWith(ODEV_1, {
      yapilanSoru: 20,
      dogru: 15,
      yanlis: 3,
      bos: 2,
      not: 'Zordu',
    });
  });

  it('cevrimdisiyken acik Turkce mesaj verir, sessizce kaybolmaz', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OdevTeslimEkrani ogrenciOdevId={ODEV_1} />);
    o.cevrimici.deger = false;
    await dokun(r, 'Teslim et');
    expect(metinler(r)).toContain('Çevrimdışısın');
    expect(var_(r, 'teslim-tamam')).toBe(false);
    // form dolu kalir; baglanti gelince tekrar denenir
    o.cevrimici.deger = true;
    await dokun(r, 'Teslim et');
    expect(var_(r, 'teslim-tamam')).toBe(true);
  });

  it('teslim durumu gecersizse (zaten teslim) anlasilir mesaj verir', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OdevTeslimEkrani ogrenciOdevId={ODEV_1} />);
    await o.adaptorler.ogrenme.odevTeslim(ODEV_1, { yapilanSoru: 20 }); // baska yerden teslim edildi
    await dokun(r, 'Teslim et');
    expect(metinler(r)).toContain('şu an teslim edilemez');
  });

  it('incelenen odevde sonuc ve ogretmen notu gorunur', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OdevTeslimEkrani ogrenciOdevId="oo-odev-3-uyelik-ogrenci-a" />);
    expect(var_(r, 'teslim-ozeti')).toBe(true);
    expect(metinler(r)).toContain('Tamam');
    expect(metinler(r)).toContain('Aferin, böyle devam.');
  });
});

describe('ogrenci deneme', () => {
  it('denemelerim: onay bekliyor / reddedildi + neden; baskasinin sonucu ve sinif ortalamasi yok', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OgrenciDenemeler />);
    const m = metinler(r);
    expect(m).toContain('Onay bekliyor');
    expect(m).toContain('Reddedildi');
    expect(m).toContain('Doğru sayıları cevap anahtarıyla tutmuyor.');
    expect(m).toContain('Deneme 3');
    expect(m).not.toContain('Elif');
    expect(m.toLowerCase()).not.toContain('sınıf ortalaması');
    expect(var_(r, 'deneme-grafigi')).toBe(true);
    expect(metinler(r)).toContain('Son 5 deneme ortalaması');
  });

  it('kendi sonucunu gir butonu yalniz kurum ayari aciksa gorunur', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <OgrenciDenemeler />);
    expect(etiketVarMi(r, 'Sonuç gir')).toBe(true);
    await dokun(r, 'Sonuç gir');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/deneme-gir');

    const o2 = await ogrenciOrtami();
    jest.spyOn(o2.adaptorler.ogrenme, 'ogrenciDenemeGirisi').mockResolvedValue(false);
    const r2 = await ac(o2, <OgrenciDenemeler />);
    expect(etiketVarMi(r2, 'Sonuç gir')).toBe(false);
  });

  it('giris formu: net onizlemesi, toplam dogrulamasi, onaya gonderme', async () => {
    const o = await ogrenciOrtami();
    const olustur = jest.spyOn(o.adaptorler.ogrenme, 'denemeOlustur');
    const r = await ac(o, <DenemeGirisFormu />);
    await dokun(r, 'TYT');
    await yaz(r, 'Temel matematik: Doğru', '36');
    await yaz(r, 'Temel matematik: Yanlış', '4');
    expect(metinler(r)).toContain('Net: 35,00'); // 36 - 4 * 0,25
    // toplam = soru sayisi dogrulamasi (bos elle yazilirsa)
    await yaz(r, 'Temel matematik: Boş', '5');
    expect(metinler(r)).toContain('toplamı soru sayısına eşit olmalı');
    await yaz(r, 'Temel matematik: Boş', '');
    await yaz(r, 'Deneme adı', 'Evde deneme');
    await dokun(r, 'Kaydet');
    expect(olustur).toHaveBeenCalledTimes(1);
    const g = olustur.mock.calls[0]![0];
    expect(g).toMatchObject({ kuralKodu: 'tyt', ad: 'Evde deneme', sinavTarihi: bugun() });
    expect(g.ogrenciId).toBeUndefined();
    expect(g.bolumler.find((b) => b.bolumKodu === 'matematik')).toMatchObject({
      dogru: 36,
      yanlis: 4,
      bos: 0,
    });
    expect(metinler(r)).toContain('Onaya gönderildi');
  });

  it('ayni deneme tekrar girilirse deneme_zaten_var mesaji', async () => {
    const o = await ogrenciOrtami();
    const r = await ac(o, <DenemeGirisFormu />);
    await yaz(r, 'Deneme adı', 'Aynı');
    await dokun(r, 'Kaydet');
    expect(metinler(r)).toContain('Onaya gönderildi');
    const r2 = await ac(o, <DenemeGirisFormu />);
    await yaz(r2, 'Deneme adı', 'Aynı');
    await dokun(r2, 'Kaydet');
    expect(metinler(r2)).toContain('zaten kayıtlı');
  });

  it('kurum ayari kapaliysa giris formu acilmaz', async () => {
    const o = await ogrenciOrtami();
    jest.spyOn(o.adaptorler.ogrenme, 'ogrenciDenemeGirisi').mockResolvedValue(false);
    const r = await ac(o, <DenemeGirisFormu />);
    expect(metinler(r)).toContain('öğretmenin giriyor');
    expect(etiketVarMi(r, 'Kaydet')).toBe(false);
  });
});

describe('ogretmen: Bugun kartlari, odev ver/ozet, ogrenci karti', () => {
  it('Bugun: inceleme bekleyen teslimler ve onay bekleyen denemeler kartlari', async () => {
    const o = await ogretmenOrtami();
    const r = await ac(o, <OgretmenBugun />);
    const m = metinler(r);
    expect(m).toContain('İnceleme bekleyen teslimler (2)');
    expect(m).toContain('Onay bekleyen denemeler (2)');
    expect(etiketVarMi(r, 'Ödev ver')).toBe(true);
    await dokun(r, 'Ödev ver');
    expect(mockYonlendirici.push).toHaveBeenCalledWith('/odev-ver');
  });

  it('Bugun: tek dokunusla onay (iyimser) ve moduller kapaliysa kartlar yok', async () => {
    const o = await ogretmenOrtami();
    const onayla = jest.spyOn(o.adaptorler.ogrenme, 'denemeOnayla');
    const r = await ac(o, <OgretmenBugun />);
    await dokun(r, 'Onayla: Deniz Yılmaz');
    expect(onayla).toHaveBeenCalledTimes(1);
    expect(metinler(r)).toContain('Onay bekleyen denemeler (1)');

    const o2 = await ogretmenOrtami();
    modulAyarla(o2, { odev: false, deneme: false });
    const r2 = await ac(o2, <OgretmenBugun />);
    expect(metinler(r2)).not.toContain('İnceleme bekleyen');
    expect(metinler(r2)).not.toContain('Onay bekleyen');
    expect(etiketVarMi(r2, 'Ödev ver')).toBe(false);
  });

  it('Odev ver: konu secici ile 3 dokunusta (alan, konu, ver); varsayilanlar dolu', async () => {
    const o = await ogretmenOrtami();
    const ver = jest.spyOn(o.adaptorler.ogrenme, 'odevVer');
    const r = await ac(o, <OdevVerEkrani />);
    await testIDDokun(r, 'konu-alani');
    await testIDDokun(r, 'konu-konu-m-uslu');
    await dokun(r, 'Ödevi ver');
    expect(ver).toHaveBeenCalledTimes(1);
    expect(ver.mock.calls[0]![0]).toMatchObject({
      baslik: 'Üslü Sayılar: 20 soru',
      bransKodu: 'matematik',
      konuId: 'konu-m-uslu',
      tur: 'soru',
      hedefTuru: 'grup',
      hedefId: 'g-8a',
      hedefSoruSayisi: 20,
    });
    // kurum saat diliminde 3 gun sonra 23:59 (UTC 20:59)
    expect(ver.mock.calls[0]![0].sonTeslim).toMatch(/T20:59:00\.000Z$/);
    expect(var_(r, 'odev-verildi')).toBe(true);
    expect(metinler(r)).toContain('4 öğrenciye atandı');
  });

  it('Odev ver: ders secilmediyse hata, sablondan baslama konuyu doldurur', async () => {
    const o = await ogretmenOrtami();
    const ver = jest.spyOn(o.adaptorler.ogrenme, 'odevVer');
    const r = await ac(o, <OdevVerEkrani />);
    await dokun(r, 'Ödevi ver');
    expect(ver).not.toHaveBeenCalled();
    expect(metinler(r)).toContain('Ders seç.');
    await dokun(r, 'Haftalık problem seti');
    await dokun(r, 'Ödevi ver');
    expect(ver).toHaveBeenCalledTimes(1);
    expect(ver.mock.calls[0]![0]).toMatchObject({ konuId: 'konu-m-uslu', hedefSoruSayisi: 20 });
  });

  it('Odev ozeti: tek ekranda tum ogrenciler, satirdan inceleme', async () => {
    const o = await ogretmenOrtami();
    const incele = jest.spyOn(o.adaptorler.ogrenme, 'odevIncele');
    const r = await ac(o, <OdevOzetEkrani odevId="odev-1" />);
    const m = metinler(r);
    expect(m).toContain('Üslü Sayılar: 20 soru');
    for (const ad of ['Elif Kaya', 'Zeynep Demir', 'Can Özkan', 'Deniz Yılmaz']) {
      expect(m).toContain(ad);
    }
    // incelenecek (teslim edilen) satirlar en uste
    expect(m.indexOf('Elif Kaya')).toBeLessThan(m.indexOf('Deniz Yılmaz'));
    await testIDDokun(r, 'satir-oo-odev-1-ogr-elif');
    await dokun(r, 'Eksik');
    await dokun(r, 'İncelemeyi kaydet');
    expect(incele).toHaveBeenCalledWith('oo-odev-1-ogr-elif', 'eksik', undefined);
    expect(metinler(r)).toContain('İnceleme bekleyen | 1');
  });

  it('ogrenci karti Plan: taslak yayinlanir, gorev eklenir, plani olmayan haftada plan olusturulur', async () => {
    const o = await ogretmenOrtami();
    const yayinla = jest.spyOn(o.adaptorler.ogrenme, 'planYayinla');
    const ekle = jest.spyOn(o.adaptorler.ogrenme, 'gorevEkle');
    const olustur = jest.spyOn(o.adaptorler.ogrenme, 'planOlustur');
    const r = await ac(o, <OgrenciKartiEkrani ogrenciId="ogr-elif" ad="Elif Kaya" />);
    expect(metinler(r)).toContain('Taslak');
    await dokun(r, 'Planı yayınla');
    expect(yayinla).toHaveBeenCalledTimes(1);
    expect(metinler(r)).toContain('Yayında');

    await dokun(r, 'Görev ekle');
    await testIDDokun(r, 'konu-alani');
    await testIDDokun(r, 'konu-konu-m-denklem');
    await dokun(r, 'Kaydet');
    expect(ekle).toHaveBeenCalledTimes(1);
    expect(ekle.mock.calls[0]![1]).toMatchObject({
      bransKodu: 'matematik',
      konuId: 'konu-m-denklem',
      hedefTuru: 'soru',
      hedefMiktar: 20,
    });
    expect(metinler(r)).toContain('Denklemler');

    await dokun(r, 'Sonraki hafta');
    expect(metinler(r)).toContain('Bu hafta için plan yok.');
    await dokun(r, 'Plan oluştur');
    expect(olustur).toHaveBeenCalledWith('ogr-elif', haftaKaydir(bugun(), 1));
  });

  it('ogrenci karti Denemeler: gelisim grafigi, onay ve sonuc girisi', async () => {
    const o = await ogretmenOrtami();
    const onayla = jest.spyOn(o.adaptorler.ogrenme, 'denemeOnayla');
    const r = await ac(o, <OgrenciKartiEkrani ogrenciId="ogr-elif" ad="Elif Kaya" />);
    expect(var_(r, 'ogrenci-deneme-bolumu')).toBe(true);
    expect(var_(r, 'deneme-grafigi')).toBe(true);
    expect(metinler(r)).toContain('Elif evde');
    await dokun(r, 'Sonuç gir');
    expect(mockYonlendirici.push).toHaveBeenCalledWith({
      pathname: '/deneme-gir',
      params: { ogrenciId: 'ogr-elif', ad: 'Elif Kaya' },
    });
    await dokun(r, 'Onayla');
    expect(onayla).toHaveBeenCalledTimes(1);
    expect(metinler(r)).not.toContain('Onay bekliyor');
  });

  it('ogretmen tek ogrenci icin sonuc girer: ogrenci kimligi gider, dogrudan onayli', async () => {
    const o = await ogretmenOrtami();
    const olustur = jest.spyOn(o.adaptorler.ogrenme, 'denemeOlustur');
    const r = await ac(o, <DenemeGirisFormu ogrenciId="ogr-mert" ogrenciAd="Mert Aydın" />);
    await yaz(r, 'Deneme adı', 'Okul denemesi');
    await dokun(r, 'Kaydet');
    expect(olustur.mock.calls[0]![0]).toMatchObject({ ogrenciId: 'ogr-mert' });
    expect(metinler(r)).toContain('Deneme kaydedildi');
  });

  it('onay kuyrugu: onayla ve nedenle reddet', async () => {
    const o = await ogretmenOrtami();
    const onayla = jest.spyOn(o.adaptorler.ogrenme, 'denemeOnayla');
    const reddet = jest.spyOn(o.adaptorler.ogrenme, 'denemeReddet');
    const r = await ac(o, <DenemeOnayKuyrugu />);
    expect(metinler(r)).toContain('Elif evde');
    expect(metinler(r)).toContain('Evde çözdüm');
    await dokun(r, 'Reddet');
    await yaz(r, 'Red nedeni', 'Fotoğraf okunmuyor');
    await dokun(r, 'Reddi gönder');
    expect(reddet).toHaveBeenCalledTimes(1);
    expect(reddet.mock.calls[0]![1]).toBe('Fotoğraf okunmuyor');
    await dokun(r, 'Onayla');
    expect(onayla).toHaveBeenCalledTimes(1);
    expect(metinler(r)).toContain('Onay bekleyen deneme yok.');
  });
});

describe('modul kapaliysa ogretmen karti gorunmez (deneme/haftalik_plan)', () => {
  it('ogrenci kartinda plan ve deneme bolumleri gizlenir', async () => {
    const o = await ogretmenOrtami();
    modulAyarla(o, { haftalik_plan: false, deneme: false });
    const r: ReactTestRenderer = await ac(
      o,
      <OgrenciKartiEkrani ogrenciId="ogr-elif" ad="Elif Kaya" /> as ReactElement,
    );
    expect(var_(r, 'ogrenci-plan-bolumu')).toBe(false);
    expect(var_(r, 'ogrenci-deneme-bolumu')).toBe(false);
  });
});
