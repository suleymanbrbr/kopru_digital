import type { KayitAdapter } from '../api/kayitTipleri';
import { ApiHata } from '../api/tipler';
import { bellekKv } from '../depo/kv';
import {
  GERI_BILDIRIM_TURU,
  GeriBildirimDeposu,
  geriBildirimIsleyicisiKaydet,
  geriBildirimKuyrugaAl,
  type GeriBildirimYuku,
} from './geriBildirim';
import { OfflineKuyruk } from './kuyruk';

const yuk = (deger: GeriBildirimYuku['deger'] = 'anladim', dersId = 'd1'): GeriBildirimYuku => ({
  dersId,
  dersBaslik: 'Denklemler',
  dersBaslangic: '2026-11-10T15:00:00.000Z',
  sonVerme: '2026-11-11T16:00:00.000Z',
  deger,
  konuId: null,
  not: null,
});

function kur(ver: jest.Mock) {
  const cevrimici = { deger: true };
  const kuyruk = new OfflineKuyruk({
    depo: bellekKv(),
    yeniId: (() => {
      let n = 0;
      return () => `istek-${String(++n)}`;
    })(),
    kapsam: () => 'uyelik-1',
    cevrimiciMi: () => cevrimici.deger,
    gecikme: () => 0,
    enFazlaDeneme: 3,
  });
  const basarili = jest.fn();
  const reddedildi = jest.fn();
  geriBildirimIsleyicisiKaydet(
    kuyruk,
    () => ({ geriBildirimVer: ver }) as unknown as KayitAdapter,
    {
      basarili,
      reddedildi,
    },
  );
  return { kuyruk, cevrimici, basarili, reddedildi };
}

describe('geri_bildirim.ver kuyrugu', () => {
  it('cevrimdisiyken bekler, baglanti gelince (dersId, girdi) gonderilir', async () => {
    const ver = jest.fn().mockResolvedValue({});
    const { kuyruk, cevrimici, basarili } = kur(ver);
    cevrimici.deger = false;
    geriBildirimKuyrugaAl(kuyruk, { ...yuk('kismen'), not: 'Üslü sayılar' });
    await kuyruk.bosalt();
    expect(kuyruk.bekleyenler()).toHaveLength(1);
    expect(kuyruk.bekleyenler()[0]?.tur).toBe(GERI_BILDIRIM_TURU);
    expect(ver).not.toHaveBeenCalled();
    cevrimici.deger = true;
    await kuyruk.bosalt();
    expect(ver).toHaveBeenCalledTimes(1);
    expect(ver).toHaveBeenCalledWith('d1', { deger: 'kismen', konuId: null, not: 'Üslü sayılar' });
    expect(kuyruk.bekleyenler()).toHaveLength(0);
    expect(basarili).toHaveBeenCalled();
  });

  it('ag hatasinda is kalir ve tekrar denenir (PUT idempotent)', async () => {
    const ver = jest.fn().mockRejectedValueOnce(new ApiHata('ag')).mockResolvedValue({});
    const { kuyruk, reddedildi } = kur(ver);
    geriBildirimKuyrugaAl(kuyruk, yuk());
    await kuyruk.bosalt();
    expect(kuyruk.bekleyenler()).toHaveLength(1);
    await kuyruk.bosalt();
    expect(ver).toHaveBeenCalledTimes(2);
    expect(kuyruk.bekleyenler()).toHaveLength(0);
    expect(reddedildi).not.toHaveBeenCalled();
  });

  it('429 gecici sayilir', async () => {
    const ver = jest
      .fn()
      .mockRejectedValueOnce(new ApiHata('cok_istek', undefined, { durum: 429 }))
      .mockResolvedValue({});
    const { kuyruk, reddedildi } = kur(ver);
    geriBildirimKuyrugaAl(kuyruk, yuk());
    await kuyruk.bosalt();
    expect(kuyruk.bekleyenler()).toHaveLength(1);
    expect(kuyruk.basarisizlar()).toHaveLength(0);
    await kuyruk.bosalt();
    expect(kuyruk.bekleyenler()).toHaveLength(0);
    expect(reddedildi).not.toHaveBeenCalled();
  });

  it('kalici hata (modul_kapali / yoklama uygun degil) basarisiz listesine duser ve karti kaldirir', async () => {
    const ver = jest.fn().mockRejectedValue(
      new ApiHata('dogrulama', undefined, {
        durum: 422,
        ayrinti: 'geri_bildirim_yoklama_uygun_degil',
      }),
    );
    const { kuyruk, reddedildi } = kur(ver);
    geriBildirimKuyrugaAl(kuyruk, yuk());
    await kuyruk.bosalt();
    expect(kuyruk.bekleyenler()).toHaveLength(0);
    expect(kuyruk.basarisizlar()).toHaveLength(1);
    expect(kuyruk.basarisizlar()[0]?.sonHataKodu).toBe('geri_bildirim_yoklama_uygun_degil');
    expect(reddedildi).toHaveBeenCalledWith(expect.objectContaining({ dersId: 'd1' }));
  });

  it('ayni ders icin ardisik degisiklikler sirayla gider (son deger kazanir)', async () => {
    const ver = jest.fn().mockResolvedValue({});
    const { kuyruk, cevrimici } = kur(ver);
    cevrimici.deger = false;
    geriBildirimKuyrugaAl(kuyruk, yuk('anlamadim'));
    geriBildirimKuyrugaAl(kuyruk, yuk('anladim'));
    cevrimici.deger = true;
    await kuyruk.bosalt();
    expect((ver.mock.calls as [string, { deger: string }][]).map((c) => c[1].deger)).toEqual([
      'anlamadim',
      'anladim',
    ]);
  });
});

describe('GeriBildirimDeposu', () => {
  const kayit = (dersId: string, deger: GeriBildirimYuku['deger'] = 'anladim') => ({
    ...yuk(deger, dersId),
    konuId: null,
    not: null,
  });
  const simdi = Date.parse('2026-11-10T20:00:00Z');

  it('uyelik kapsamlidir ve ayni ders icin onceki kaydi degistirir', () => {
    const d = new GeriBildirimDeposu(bellekKv());
    d.ekle('u1', kayit('d1', 'anlamadim'), simdi);
    d.ekle('u1', kayit('d1', 'kismen'), simdi);
    d.ekle('u2', kayit('d1'), simdi);
    expect(d.al('u1')).toHaveLength(1);
    expect(d.al('u1')[0]?.deger).toBe('kismen');
    expect(d.al('u2')).toHaveLength(1);
    expect(d.al(null)).toHaveLength(0);
  });

  it('kararli referans: degisim yokken ayni dizi doner (useSyncExternalStore icin)', () => {
    const d = new GeriBildirimDeposu(bellekKv());
    d.ekle('u1', kayit('d1'), simdi);
    expect(d.al('u1')).toBe(d.al('u1'));
    expect(d.al('yok')).toBe(d.al('baska'));
  });

  it('kalici: yeni nesne ayni kv ile kaydi okur; kaldir ve temizle abonelere haber verir', () => {
    const kv = bellekKv();
    const d = new GeriBildirimDeposu(kv);
    const abone = jest.fn();
    d.abone(abone);
    d.ekle('u1', kayit('d1'), simdi);
    expect(new GeriBildirimDeposu(kv).al('u1')).toHaveLength(1);
    d.kaldir('u1', 'd1');
    expect(d.al('u1')).toHaveLength(0);
    d.ekle('u1', kayit('d2'), simdi);
    d.temizle();
    expect(d.al('u1')).toHaveLength(0);
    expect(abone).toHaveBeenCalledTimes(4);
  });

  it('suresi gecmis kayitlar yeni eklemede atilir; bozuk kv bos sayilir', () => {
    const d = new GeriBildirimDeposu(bellekKv());
    d.ekle('u1', { ...kayit('eski'), sonVerme: '2026-11-10T19:00:00Z' }, simdi);
    d.ekle('u1', kayit('yeni'), simdi);
    expect(d.al('u1').map((x) => x.dersId)).toEqual(['yeni']);
    const kv = bellekKv();
    kv.set('kopru.geri-bildirim.v1', '{bozuk');
    expect(new GeriBildirimDeposu(kv).al('u1')).toHaveLength(0);
  });
});
