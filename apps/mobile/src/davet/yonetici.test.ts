import type { Adaptorler } from '../api/adaptorler';
import { mockAdaptorler } from '../api/mock';
import { ApiHata } from '../api/tipler';
import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { bellekDavetDeposu, type DavetDeposu } from '../depo/davetDeposu';
import { oturumYoneticisiOlustur } from '../oturum/yonetici';
import { davetYoneticisiOlustur, type DavetDurumu } from './yonetici';

const BELIRTEC = 'dAvEtBeLiRtEcI_0123456789-abcdef';

function kur(opts: { davetDepo?: DavetDeposu; adaptorler?: Adaptorler } = {}) {
  const belirtecDepo = bellekBelirtecDeposu();
  const adaptorler = opts.adaptorler ?? mockAdaptorler(belirtecDepo, 0);
  const oturum = oturumYoneticisiOlustur({ adaptorler });
  const davetDepo = opts.davetDepo ?? bellekDavetDeposu();
  const davet = davetYoneticisiOlustur({ depo: davetDepo, hesap: adaptorler.hesap, oturum });
  return { adaptorler, oturum, davetDepo, davet, belirtecDepo };
}

/** Durum istenen asamaya gelene kadar bekler (arka plan kabulu icin). */
async function bekle(davet: ReturnType<typeof kur>['davet'], asama: DavetDurumu['asama']) {
  for (let i = 0; i < 200; i++) {
    if (davet.durum.al().asama === asama) return;
    await new Promise((r) => setTimeout(r, 1));
  }
  throw new Error(`durum ${asama} olmadi: ${davet.durum.al().asama}`);
}

async function girisYap(k: ReturnType<typeof kur>, telefon = '+905551110006') {
  await k.adaptorler.auth.otpDogrula(telefon, '123456');
  await k.oturum.girisTamamlandi();
}

describe('davet derin baglantisi', () => {
  it('oturum yokken saklanir; giris + KVKK sonrasi kaybolmadan kabul edilir ve kuruma gecilir', async () => {
    const k = kur();
    const kapat = k.davet.baglan();
    await k.davet.kaydet(BELIRTEC);
    expect(k.davet.durum.al().asama).toBe('bekliyor');
    expect((await k.davetDepo.oku())?.belirtec).toBe(BELIRTEC);

    // Giris yapildi ama KVKK onaylanmadi: henuz kabul edilmez.
    await girisYap(k);
    await new Promise((r) => setTimeout(r, 5));
    expect(k.davet.durum.al().asama).toBe('bekliyor');
    expect((await k.davetDepo.oku())?.belirtec).toBe(BELIRTEC);

    // KVKK onayi -> kabul, uyelik yenilenir, ilgili kuruma gecilir.
    await k.oturum.kvkkKabulEt();
    await bekle(k.davet, 'basarili');
    const o = k.oturum.depo.al();
    if (o.asama !== 'giris') throw new Error('giris bekleniyordu');
    expect(o.uyelikler.map((u) => u.kurumAd)).toContain('Davet Edilen Kurum');
    expect(o.aktif?.uyelik.kurumAd).toBe('Davet Edilen Kurum');
    expect(await k.davetDepo.oku()).toBeNull();
    kapat();
  });

  it('uygulama yeniden baslasa da belirtec kalir (yeni yonetici ayni depodan yukler)', async () => {
    const davetDepo = bellekDavetDeposu();
    const ilk = kur({ davetDepo });
    await ilk.davet.kaydet(BELIRTEC);

    const ikinci = kur({ davetDepo });
    expect(ikinci.davet.durum.al().asama).toBe('yok');
    await ikinci.davet.yukle();
    expect(ikinci.davet.durum.al().asama).toBe('bekliyor');
    const kapat = ikinci.davet.baglan();
    await girisYap(ikinci);
    await ikinci.oturum.kvkkKabulEt();
    await bekle(ikinci.davet, 'basarili');
    expect(await davetDepo.oku()).toBeNull();
    kapat();
  });

  it('kabul yalnizca bir kez yapilir (oturum durumu cok kez degisse de)', async () => {
    const k = kur();
    const kabul = jest.spyOn(k.adaptorler.hesap, 'davetKabul');
    const kapat = k.davet.baglan();
    await k.davet.kaydet(BELIRTEC);
    await girisYap(k);
    await k.oturum.kvkkKabulEt();
    await bekle(k.davet, 'basarili');
    k.oturum.kurumDegistir();
    await new Promise((r) => setTimeout(r, 5));
    expect(kabul).toHaveBeenCalledTimes(1);
    kapat();
  });

  it('yetkili oturum varken gelen davet hemen kabul edilir ve kurum degisir', async () => {
    const k = kur();
    await girisYap(k, '+905551110001');
    await k.oturum.kvkkKabulEt();
    await k.oturum.uyelikSec('uyelik-ogretmen-a');
    const kapat = k.davet.baglan();
    await k.davet.kaydet(BELIRTEC);
    await bekle(k.davet, 'basarili');
    const o = k.oturum.depo.al();
    if (o.asama !== 'giris') throw new Error();
    expect(o.aktif?.uyelik.kurumAd).toBe('Davet Edilen Kurum');
    kapat();
  });

  it('410 davet_gecersiz: belirtec silinir, aciklayici hata durumu', async () => {
    const k = kur();
    const kapat = k.davet.baglan();
    await k.davet.kaydet(`gecersiz${BELIRTEC}`);
    await girisYap(k);
    await k.oturum.kvkkKabulEt();
    await bekle(k.davet, 'hata');
    expect(k.davet.durum.al()).toEqual({ asama: 'hata', neden: 'gecersiz' });
    expect(await k.davetDepo.oku()).toBeNull();
    kapat();
  });

  it('409 zaten_uye: belirtec silinir, "zaten uye" durumu', async () => {
    const k = kur();
    const kapat = k.davet.baglan();
    await k.davet.kaydet(`zatenuye${BELIRTEC}`);
    await girisYap(k);
    await k.oturum.kvkkKabulEt();
    await bekle(k.davet, 'hata');
    expect(k.davet.durum.al()).toEqual({ asama: 'hata', neden: 'zaten_uye' });
    expect(await k.davetDepo.oku()).toBeNull();
    kapat();
  });

  it('baglanti hatasinda belirtec saklanir ve tekrar denenebilir', async () => {
    const k = kur();
    const kapat = k.davet.baglan();
    await k.davet.kaydet(`agsorunu${BELIRTEC}`);
    await girisYap(k);
    await k.oturum.kvkkKabulEt();
    await bekle(k.davet, 'hata');
    expect(k.davet.durum.al()).toEqual({ asama: 'hata', neden: 'ag' });
    expect((await k.davetDepo.oku())?.belirtec).toBe(`agsorunu${BELIRTEC}`);

    // Baglanti duzeldi (belirtec farkli oneki yok): ayni depodaki belirtec yeniden denenir.
    jest.spyOn(k.adaptorler.hesap, 'davetKabul').mockResolvedValueOnce({
      kurumId: 'kurum-davet',
      uyelikId: 'uyelik-ogrenci-kurum-davet',
      rol: 'ogrenci',
    });
    await k.davet.tekrarDene();
    await bekle(k.davet, 'basarili');
    expect(await k.davetDepo.oku()).toBeNull();
    kapat();
  });

  it('gecici 401: belirtec korunur, oturum akisi devralir, yeniden giriste kabul edilir', async () => {
    const k = kur();
    const kapat = k.davet.baglan();
    await girisYap(k);
    await k.oturum.kvkkKabulEt();
    jest
      .spyOn(k.adaptorler.hesap, 'davetKabul')
      .mockRejectedValueOnce(new ApiHata('yetkisiz', undefined, { durum: 401 }));
    await k.davet.kaydet(BELIRTEC);
    await new Promise((r) => setTimeout(r, 10));
    expect(k.oturum.depo.al().asama).toBe('cikis');
    expect(k.davet.durum.al().asama).toBe('bekliyor');
    expect((await k.davetDepo.oku())?.belirtec).toBe(BELIRTEC);

    await girisYap(k);
    await k.oturum.kvkkKabulEt();
    await bekle(k.davet, 'basarili');
    kapat();
  });

  it('gecersiz bicimli belirtec depoya yazilmaz', async () => {
    const k = kur();
    await k.davet.kaydet('kisa');
    expect(k.davet.durum.al()).toEqual({ asama: 'hata', neden: 'gecersiz' });
    expect(await k.davetDepo.oku()).toBeNull();
    await k.davet.kaydet(undefined);
    expect(await k.davetDepo.oku()).toBeNull();
  });

  it('14 gunden eski saklanmis davet atilir', async () => {
    const davetDepo = bellekDavetDeposu();
    await davetDepo.yaz({ belirtec: BELIRTEC, kayit: 0 });
    const k = kur({ davetDepo });
    await k.davet.yukle();
    expect(k.davet.durum.al().asama).toBe('yok');
    expect(await davetDepo.oku()).toBeNull();
  });

  it('kullanici bilerek cikis yapinca bekleyen davet unutulur', async () => {
    const k = kur();
    await k.davet.kaydet(BELIRTEC);
    await k.davet.unut();
    expect(await k.davetDepo.oku()).toBeNull();
    expect(k.davet.durum.al().asama).toBe('yok');
  });

  it('belirtec hicbir log cagrisina yazilmaz', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    const k = kur();
    const kapat = k.davet.baglan();
    await k.davet.kaydet(`gecersiz${BELIRTEC}`);
    await girisYap(k);
    await k.oturum.kvkkKabulEt();
    await bekle(k.davet, 'hata');
    for (const s of spies) {
      expect(JSON.stringify(s.mock.calls)).not.toContain(BELIRTEC);
      s.mockRestore();
    }
    kapat();
  });
});
