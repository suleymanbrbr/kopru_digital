import { mockAdaptorler } from '../api/mock';
import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { bellekKv } from '../depo/kv';
import { oturumYoneticisiOlustur, type OturumYoneticisi } from '../oturum/yonetici';
import type { BildirimYuku } from './baglanti';
import { sahtePlatform, type SahtePlatform } from './sahtePlatform';
import {
  ERTELEME_MS,
  bildirimYoneticisiOlustur,
  izinKartiGorunurMu,
  sahteBelirtecUret,
  type BildirimDurumu,
} from './yonetici';

const ID = '0190f3a0-0000-7000-8000-0000000000a1';
const BILDIRIM_ID = '0190f3a0-0000-7000-8000-0000000000b1';
const CIHAZ_ID = '0190f3a0-0000-7000-8000-00000000c1d1';

const yuk = (ek: Partial<BildirimYuku> = {}): BildirimYuku => ({
  derinBaglanti: `kopru://soru/${ID}`,
  bildirimId: BILDIRIM_ID,
  kurumId: null,
  baslik: 'Sorun cevaplandı',
  govde: 'Sorduğun soruya cevap geldi.',
  ...ek,
});

const bekle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

interface Kurulum {
  oturum: OturumYoneticisi;
  adaptorler: ReturnType<typeof mockAdaptorler>;
  platform: SahtePlatform;
  kaydet: jest.SpyInstance;
  sil: jest.SpyInstance;
  okundu: jest.SpyInstance;
  yonlendir: jest.Mock;
  yonetici: ReturnType<typeof bildirimYoneticisiOlustur>;
  zaman: { ms: number };
}

function kur(
  platformEk: Partial<SahtePlatform> = {},
  secenek: { sahteBelirtec?: boolean } = {},
): Kurulum {
  const adaptorler = mockAdaptorler(bellekBelirtecDeposu(), 0);
  const kaydet = jest.spyOn(adaptorler.bildirim, 'cihazKaydet');
  const sil = jest.spyOn(adaptorler.bildirim, 'cihazSil');
  const okundu = jest.spyOn(adaptorler.bildirim, 'okundu');
  const platform = sahtePlatform(platformEk);
  const zaman = { ms: 1_000_000 };
  const ref: { y: ReturnType<typeof bildirimYoneticisiOlustur> | null } = { y: null };
  const oturum = oturumYoneticisiOlustur({
    adaptorler,
    cikisOncesi: () => ref.y?.cikis() ?? Promise.resolve(),
  });
  const yonetici = bildirimYoneticisiOlustur({
    platform,
    bildirim: () => adaptorler.bildirim,
    oturum,
    depo: bellekKv(),
    yeniId: () => CIHAZ_ID,
    uygulamaSurumu: '0.1.0',
    simdi: () => zaman.ms,
    ...secenek,
  });
  ref.y = yonetici;
  return {
    oturum,
    adaptorler,
    platform,
    kaydet,
    sil,
    okundu,
    yonlendir: jest.fn(),
    yonetici,
    zaman,
  };
}

async function girisYap(k: Kurulum, telefon = '+905551110002', uyelikId = 'uyelik-ogrenci-a') {
  await k.adaptorler.auth.otpDogrula(telefon, '123456');
  await k.oturum.girisTamamlandi();
  await k.oturum.kvkkKabulEt();
  await k.oturum.uyelikSec(uyelikId);
  await bekle(30);
}

describe('izin ve cihaz kaydi', () => {
  it('izin verilmeden kayit yapilmaz ve acilista izin istenmez', async () => {
    const k = kur();
    const kapat = k.yonetici.baslat();
    await girisYap(k);
    expect(k.kaydet).not.toHaveBeenCalled();
    expect(k.platform.izinIstekSayisi).toBe(0);
    expect(k.yonetici.durum.al().izin).toBe('verilmedi');
    kapat();
  });

  it('izinIste verilirse cihazi kaydeder (PUT cihazlar govdesi)', async () => {
    const k = kur();
    const kapat = k.yonetici.baslat();
    await girisYap(k);
    await expect(k.yonetici.izinIste()).resolves.toBe('verildi');
    expect(k.kaydet).toHaveBeenCalledTimes(1);
    expect(k.kaydet).toHaveBeenCalledWith({
      platform: 'ios',
      push_belirteci: 'ExponentPushToken[test-belirteci]',
      cihaz_kimligi: CIHAZ_ID,
      uygulama_surumu: '0.1.0',
      dil: 'tr',
    });
    expect(k.yonetici.durum.al().kayit).toBe('kayitli');
    kapat();
  });

  it('izin zaten verilmisse giriste kendiliginden kaydeder; ayni kullanici icin tekrar etmez', async () => {
    const k = kur({ izin: 'verildi' });
    const kapat = k.yonetici.baslat();
    await girisYap(k);
    expect(k.kaydet).toHaveBeenCalledTimes(1);
    await k.yonetici.onePlana();
    expect(k.kaydet).toHaveBeenCalledTimes(1);
    // 6 saatten sonra one gelince tazelenir (son_gorulme).
    k.zaman.ms += 7 * 60 * 60 * 1000;
    await k.yonetici.onePlana();
    expect(k.kaydet).toHaveBeenCalledTimes(2);
    kapat();
  });

  it('belirtec alinamazsa (simulator) kayit atlanir, hata yok', async () => {
    const k = kur({ izin: 'verildi', belirtec: null });
    const kapat = k.yonetici.baslat();
    await girisYap(k);
    expect(k.kaydet).not.toHaveBeenCalled();
    expect(k.yonetici.durum.al().kayit).toBe('belirtecYok');
    kapat();
  });

  it('sahte belirtec bayragi gelistirmede sahte belirtecle kaydeder', async () => {
    const k = kur({ izin: 'verildi', belirtec: null }, { sahteBelirtec: true });
    const kapat = k.yonetici.baslat();
    await girisYap(k);
    expect(k.kaydet).toHaveBeenCalledWith(
      expect.objectContaining({ push_belirteci: sahteBelirtecUret(CIHAZ_ID) }),
    );
    kapat();
  });

  it('kayit hatasi yutulur; sonraki one gelmede yeniden denenir', async () => {
    const k = kur({ izin: 'verildi' });
    k.kaydet.mockRejectedValueOnce(new Error('ag'));
    const kapat = k.yonetici.baslat();
    await girisYap(k);
    expect(k.yonetici.durum.al().kayit).toBe('basarisiz');
    await k.yonetici.onePlana();
    expect(k.kaydet).toHaveBeenCalledTimes(2);
    expect(k.yonetici.durum.al().kayit).toBe('kayitli');
    kapat();
  });

  it('belirtec degisince yeniden kaydeder', async () => {
    const k = kur({ izin: 'verildi' });
    const kapat = k.yonetici.baslat();
    await girisYap(k);
    k.platform.belirtec = 'ExponentPushToken[yeni]';
    k.platform.belirtecDegisti();
    await bekle();
    expect(k.kaydet).toHaveBeenLastCalledWith(
      expect.objectContaining({ push_belirteci: 'ExponentPushToken[yeni]' }),
    );
    kapat();
  });

  it('reddedilmis izinde sistem penceresi yerine ayarlar acilir', async () => {
    const k = kur({ izin: 'reddedildi' });
    const kapat = k.yonetici.baslat();
    await girisYap(k);
    await expect(k.yonetici.izinIste()).resolves.toBe('reddedildi');
    expect(k.platform.ayarlarAcildi).toBe(1);
    expect(k.platform.izinIstekSayisi).toBe(0);
    kapat();
  });

  it('cikista cihaz kaydi silinir (oturum belirteci hala gecerliyken) ve rozet sifirlanir', async () => {
    const k = kur({ izin: 'verildi' });
    const kapat = k.yonetici.baslat();
    await girisYap(k);
    await k.platform.rozetAyarla(4);
    await k.oturum.cikis();
    expect(k.sil).toHaveBeenCalledWith(CIHAZ_ID);
    expect(k.platform.rozet).toBe(0);
    expect(k.oturum.depo.al().asama).toBe('cikis');
    kapat();
  });

  it('silme hatasi cikisi engellemez', async () => {
    const k = kur({ izin: 'verildi' });
    k.sil.mockRejectedValueOnce(new Error('ag'));
    const kapat = k.yonetici.baslat();
    await girisYap(k);
    await k.oturum.cikis();
    expect(k.oturum.depo.al().asama).toBe('cikis');
    kapat();
  });
});

describe('izin karti', () => {
  const d = (ek: Partial<BildirimDurumu>): BildirimDurumu => ({
    izin: 'verilmedi',
    ertelendi: null,
    kayit: 'yok',
    afis: null,
    ...ek,
  });
  it('sorulmadiysa ve reddedildiyse gorunur; verildiyse ya da bilinmiyorsa gizli', () => {
    expect(izinKartiGorunurMu(d({}), 5)).toBe(true);
    expect(izinKartiGorunurMu(d({ izin: 'reddedildi' }), 5)).toBe(true);
    expect(izinKartiGorunurMu(d({ izin: 'verildi' }), 5)).toBe(false);
    expect(izinKartiGorunurMu(d({ izin: 'bilinmiyor' }), 5)).toBe(false);
  });

  it('ertelenince sure dolana kadar gizlenir', () => {
    expect(izinKartiGorunurMu(d({ ertelendi: 1000 }), 1000 + ERTELEME_MS.verilmedi - 1)).toBe(
      false,
    );
    expect(izinKartiGorunurMu(d({ ertelendi: 1000 }), 1000 + ERTELEME_MS.verilmedi)).toBe(true);
    expect(
      izinKartiGorunurMu(d({ izin: 'reddedildi', ertelendi: 1000 }), 1000 + ERTELEME_MS.verilmedi),
    ).toBe(false);
  });

  it('kartiErtele kalici yazar', () => {
    const k = kur();
    k.yonetici.kartiErtele();
    expect(k.yonetici.durum.al().ertelendi).toBe(k.zaman.ms);
  });
});

describe('bildirime dokunma', () => {
  it('oturum hazirken hedefe yonlendirir ve bildirimi okundu yapar', async () => {
    const k = kur({ izin: 'verildi' });
    const kapat = k.yonetici.baslat();
    k.yonetici.yonlendirmeBagla(k.yonlendir);
    await girisYap(k);
    k.platform.dokunmaGonder(yuk());
    await bekle();
    expect(k.yonlendir).toHaveBeenCalledWith({
      pathname: '/(uygulama)/soru/[id]',
      params: { id: ID },
    });
    expect(k.okundu).toHaveBeenCalledWith(BILDIRIM_ID);
    kapat();
  });

  it('uygulama kapaliyken dokunma: oturum hazir olana kadar bekler, sonra yonlendirir', async () => {
    const k = kur({ izin: 'verildi' });
    const kapat = k.yonetici.baslat();
    k.yonetici.yonlendirmeBagla(k.yonlendir);
    // Soguk acilis: dokunma oturum geri yuklenmeden gelir.
    k.platform.dokunmaGonder(yuk({ derinBaglanti: `kopru://odev/${ID}` }));
    await bekle();
    expect(k.yonlendir).not.toHaveBeenCalled();
    await girisYap(k);
    await bekle();
    expect(k.yonlendir).toHaveBeenCalledTimes(1);
    expect(k.yonlendir).toHaveBeenCalledWith({
      pathname: '/odev-teslim/[id]',
      params: { id: ID },
    });
    kapat();
  });

  it('yonlendirici sonradan baglanirsa bekleyen hedef verilir', async () => {
    const k = kur();
    const kapat = k.yonetici.baslat();
    await girisYap(k);
    k.platform.dokunmaGonder(yuk());
    await bekle();
    expect(k.yonlendir).not.toHaveBeenCalled();
    k.yonetici.yonlendirmeBagla(k.yonlendir);
    await bekle();
    expect(k.yonlendir).toHaveBeenCalledTimes(1);
    kapat();
  });

  it('ayni bildirimi iki kez islemez (soguk acilista cift olay)', async () => {
    const k = kur();
    const kapat = k.yonetici.baslat();
    k.yonetici.yonlendirmeBagla(k.yonlendir);
    await girisYap(k);
    k.platform.dokunmaGonder(yuk(), 'ayni');
    k.platform.dokunmaGonder(yuk(), 'ayni');
    await bekle();
    expect(k.yonlendir).toHaveBeenCalledTimes(1);
    kapat();
  });

  it('suresi dolmus bekleyen hedef atilir', async () => {
    const k = kur();
    const kapat = k.yonetici.baslat();
    k.yonetici.yonlendirmeBagla(k.yonlendir);
    k.platform.dokunmaGonder(yuk());
    k.zaman.ms += 6 * 60 * 1000;
    await girisYap(k);
    await bekle();
    expect(k.yonlendir).not.toHaveBeenCalled();
    kapat();
  });

  it('bilinmeyen hedef gelen kutusuna gider', async () => {
    const k = kur();
    const kapat = k.yonetici.baslat();
    k.yonetici.yonlendirmeBagla(k.yonlendir);
    await girisYap(k);
    k.platform.dokunmaGonder(yuk({ derinBaglanti: 'kopru://yepyeni/x', bildirimId: null }));
    await bekle();
    expect(k.yonlendir).toHaveBeenCalledWith({ pathname: '/bildirimler', navigate: true });
    expect(k.okundu).not.toHaveBeenCalled();
    kapat();
  });

  it('okundu isaretleme hatasi gezinmeyi bozmaz', async () => {
    const k = kur();
    k.okundu.mockRejectedValueOnce(new Error('ag'));
    const kapat = k.yonetici.baslat();
    k.yonetici.yonlendirmeBagla(k.yonlendir);
    await girisYap(k);
    k.platform.dokunmaGonder(yuk());
    await bekle();
    expect(k.yonlendir).toHaveBeenCalledTimes(1);
    kapat();
  });

  it('veri baska kurumu gosteriyorsa o kuruma gecilir', async () => {
    const k = kur();
    const kapat = k.yonetici.baslat();
    k.yonetici.yonlendirmeBagla(k.yonlendir);
    // ...5: ogretmen (kurum a), ogrenci (kurum b).
    await girisYap(k, '+905551110005', 'uyelik-ogretmen-a');
    const o = k.oturum.depo.al();
    if (o.asama !== 'giris') throw new Error('giris bekleniyordu');
    const ogrenciB = o.uyelikler.find((u) => u.uyelikId === 'uyelik-ogrenci-b');
    if (!ogrenciB) throw new Error('uyelik bulunamadi');
    k.platform.dokunmaGonder(
      yuk({ derinBaglanti: `kopru://odev/${ID}`, kurumId: ogrenciB.kurumId }),
    );
    await bekle();
    const sonra = k.oturum.depo.al();
    expect(sonra.asama === 'giris' && sonra.aktif?.uyelik.uyelikId).toBe('uyelik-ogrenci-b');
    // Hedef yeni kurumdaki rolle (ogrenci) cozulur.
    expect(k.yonlendir).toHaveBeenCalledWith({
      pathname: '/odev-teslim/[id]',
      params: { id: ID },
    });
    kapat();
  });

  it('kurum verisi yoksa mevcut kurumda kalir', async () => {
    const k = kur();
    const kapat = k.yonetici.baslat();
    k.yonetici.yonlendirmeBagla(k.yonlendir);
    await girisYap(k, '+905551110005', 'uyelik-ogretmen-a');
    k.platform.dokunmaGonder(yuk({ derinBaglanti: `kopru://odev/${ID}` }));
    await bekle();
    const sonra = k.oturum.depo.al();
    expect(sonra.asama === 'giris' && sonra.aktif?.uyelik.uyelikId).toBe('uyelik-ogretmen-a');
    expect(k.yonlendir).toHaveBeenCalledWith({ pathname: '/odev/[id]', params: { id: ID } });
    kapat();
  });
});

describe('uygulama ici afis', () => {
  it('onde gelen bildirim afis olur ve kapatilabilir', () => {
    const degisti = jest.fn();
    const k = kur();
    const y = bildirimYoneticisiOlustur({
      platform: k.platform,
      bildirim: () => k.adaptorler.bildirim,
      oturum: k.oturum,
      depo: bellekKv(),
      yeniId: () => CIHAZ_ID,
      degisti,
    });
    const kapat = y.baslat();
    k.platform.gelenGonder(yuk());
    const afis = y.durum.al().afis;
    expect(afis?.yuk.baslik).toBe('Sorun cevaplandı');
    expect(degisti).toHaveBeenCalled();
    y.afisKapat((afis?.anahtar ?? 0) + 1);
    expect(y.durum.al().afis).not.toBeNull();
    y.afisKapat(afis?.anahtar);
    expect(y.durum.al().afis).toBeNull();
    kapat();
  });
});
