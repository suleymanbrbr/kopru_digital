/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any --
   sahte openapi-fetch istemcisi tip dogrulugu gerektirmez */
import { apiHatasiOlustur } from './gercek';
import { abonelikAdaptoru } from './gercekAbonelik';
import { ApiHata } from './tipler';

const hataGovdesi = (code: string, details?: unknown) => ({
  error: { code, message: 'm', ...(details !== undefined ? { details } : {}) },
});

describe('apiHatasiOlustur: abonelik ve askı hata kodları', () => {
  it('402 plan_limiti -> plan_limiti, detay korunur', () => {
    const detay = { limit: 'max_ogrenci', mevcut: 15, ust_sinir: 15 };
    const e = apiHatasiOlustur(402, hataGovdesi('plan_limiti', detay));
    expect(e.kod).toBe('plan_limiti');
    expect(e.durum).toBe(402);
    expect(e.ayrinti).toBe('plan_limiti');
    expect(e.detay).toEqual(detay);
  });

  it('402 abonelik_gerekli -> abonelik_gerekli', () => {
    expect(apiHatasiOlustur(402, hataGovdesi('abonelik_gerekli')).kod).toBe('abonelik_gerekli');
  });

  it('403 kurum_askida -> kurum_askida (izin_yok degil)', () => {
    expect(apiHatasiOlustur(403, hataGovdesi('kurum_askida')).kod).toBe('kurum_askida');
    expect(apiHatasiOlustur(403, hataGovdesi('izin_yok')).kod).toBe('izin_yok');
  });

  it('409 abonelik_baska_kanalda -> abonelik_baska_kanalda; diger 409 cakisma', () => {
    expect(apiHatasiOlustur(409, hataGovdesi('abonelik_baska_kanalda')).kod).toBe(
      'abonelik_baska_kanalda',
    );
    expect(apiHatasiOlustur(409, hataGovdesi('kapasite_dolu')).kod).toBe('cakisma');
  });
});

const planYaniti = {
  ad: 'Başlangıç',
  aylik_fiyat_kurus: 29900,
  id: 'p1',
  kdv_orani: 20,
  kod: 'baslangic',
  kurum_turu: 'bireysel',
  limitler: {
    max_ogrenci: 15,
    max_ogretmen: -1,
    max_sube: 1,
    medya_kota_bayt: 1,
    sms_aylik: 0,
    soru_aylik_ogrenci: -1,
  },
  moduller: [],
  surum: 1,
  yillik_fiyat_kurus: 299000,
};

function adaptor(yanit: (yol: string) => unknown) {
  const cagrilar: { yol: string; params: unknown }[] = [];
  const istemci: any = {
    GET: (yol: string, secenek?: { params?: unknown }) => {
      cagrilar.push({ yol, params: secenek?.params });
      return Promise.resolve({ data: yanit(yol), response: { status: 200 } });
    },
  };
  const a = abonelikAdaptoru({
    yetkili: istemci,
    ham: istemci,
    etkinKurum: () => 'kurum-1',
    veriAl: (s) => {
      if (s.data === undefined) throw new ApiHata('sunucu');
      return s.data;
    },
  });
  return { a, cagrilar };
}

describe('gercek abonelik adaptoru', () => {
  it('ozet: kurum yoluyla istenir, limitler -1 -> sinirsiz (null)', async () => {
    const { a, cagrilar } = adaptor(() => ({
      abonelik: {
        durum: 'deneme',
        kaynak: 'deneme',
        plan: planYaniti,
        periyot: 'aylik',
        deneme_bitis_at: '2026-12-01T00:00:00Z',
        ek_sure_bitis_at: null,
        donem_bitis_at: '2026-12-01T00:00:00Z',
        iptal_istendi_at: null,
        otomatik_yenileme: true,
      },
      kullanim: { ogrenci: { mevcut: 3, ust_sinir: 15 }, ogretmen: { mevcut: 1, ust_sinir: null } },
      limitler: planYaniti.limitler,
      ucretsiz: false,
      yazma_kilitli: false,
    }));
    const o = await a.ozet();
    expect(cagrilar[0]?.yol).toBe('/v1/abonelik/kurumlar/{kurum_id}/abonelik');
    expect(cagrilar[0]?.params).toEqual({ path: { kurum_id: 'kurum-1' } });
    expect(o.abonelik?.plan).toMatchObject({ kod: 'baslangic', maxOgrenci: 15, maxOgretmen: null });
    expect(o.abonelik?.denemeBitis).toBe('2026-12-01T00:00:00Z');
    expect(o.kullanim.ogrenci).toEqual({ mevcut: 3, ustSinir: 15 });
    expect(o.yazmaKilitli).toBe(false);
  });

  it('ozet: etkin abonelik yoksa (ucretsiz katman) abonelik null', async () => {
    const { a } = adaptor(() => ({
      abonelik: null,
      kullanim: { ogrenci: { mevcut: 1, ust_sinir: 5 }, ogretmen: { mevcut: 1, ust_sinir: 1 } },
      limitler: planYaniti.limitler,
      ucretsiz: true,
      yazma_kilitli: true,
    }));
    const o = await a.ozet();
    expect(o.abonelik).toBeNull();
    expect(o.ucretsiz).toBe(true);
    expect(o.yazmaKilitli).toBe(true);
  });

  it('planlar ve kimliksiz platform mesaji', async () => {
    const { a, cagrilar } = adaptor((yol) =>
      yol === '/v1/platform-mesaji'
        ? { mesaj: { id: 'm1', baslik: 'Bakım', metin: 'Gece', onem: 'uyari' } }
        : { planlar: [planYaniti] },
    );
    expect((await a.planlar())[0]).toMatchObject({ kod: 'baslangic', aylikFiyatKurus: 29900 });
    expect(await a.platformMesaji()).toEqual({
      id: 'm1',
      baslik: 'Bakım',
      metin: 'Gece',
      onem: 'uyari',
    });
    expect(cagrilar.at(-1)?.params).toBeUndefined();
  });

  it('platform mesaji yoksa null', async () => {
    const { a } = adaptor(() => ({ mesaj: null }));
    expect(await a.platformMesaji()).toBeNull();
  });
});
