import {
  AnalizYanitiSema,
  GorevVerYanitiSema,
  GunlukSoruKaydiSema,
  GunlukSoruListeYanitiSema,
  HaftalikOzetSema,
  HucreDetaySema,
  KaynakKitapDetaySema,
  KaynakKitapListeYanitiSema,
  SinifAnaliziSema,
  SonKullanilanlarSema,
} from '@kopru/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { gunlukSoruMock, gunlukSoruMockSifirla } from './gunluk-soru-mock';
import { ogrenmeMock, ogrenmeMockSifirla, gunlukSoruKoprusu } from './ogrenme-mock';
import type { MockYanit } from './vekil';

/** Roller kurumdan gelir: ege ogretmen, mavi yonetici, atlas ogrenci. */
const OGRENCI = 'kurum-atlas';
const OGRETMEN = 'kurum-ege';

const cagir = (
  kurum: string,
  yontem: string,
  yol: string,
  sorgu: Record<string, string> = {},
  govde?: unknown,
): MockYanit => {
  const istek = {
    yontem,
    yol: `kurumlar/${kurum}/${yol}`,
    sorgu: new URLSearchParams(sorgu),
    govde,
    basliklar: {},
    kaynak: 'http://localhost',
  };
  return gunlukSoruMock(istek) ?? ogrenmeMock(istek);
};
const govde = (y: MockYanit) => y.govde as Record<string, unknown>;
const hataKodu = (y: MockYanit) => (govde(y).error as { code: string }).code;

/** Kurumun "ben" ogrencisi ve negatif kuvvet konusu (bant ornegi tohumda). */
function tohumlar(kurum: string) {
  const k = gunlukSoruKoprusu(kurum);
  const konu = (ad: string) => k.konular.find((x) => x.ad === ad)?.id ?? '';
  return {
    ogrenciId: k.ogrenciler[1]?.id ?? '',
    negatif: konu('Tam sayıların negatif kuvvetleri'),
    bilimsel: konu('Bilimsel gösterim'),
    karekok: konu('Kareköklü ifadelerde işlemler'),
    rasyonel: konu('Rasyonel sayılar'),
  };
}

beforeEach(() => {
  gunlukSoruMockSifirla();
  ogrenmeMockSifirla();
});

describe('gunluk soru mock: analiz ve bant tespiti', () => {
  it('ogrenci kendi analizini alir; yanitta oneri alani yoktur', () => {
    const y = cagir(OGRENCI, 'GET', 'gunluk-soru/analiz', { brans_kodu: 'matematik' });
    expect(y.durum).toBe(200);
    const analiz = AnalizYanitiSema.parse(y.govde);
    expect(analiz.oneriler).toBeUndefined();
    expect('oneriler' in govde(y)).toBe(false);
    expect(analiz.konular.length).toBeGreaterThan(0);
  });

  it('kolay %90 / orta %60 / zor %25 orneginde orta bantta zorlanma tespit edilir', () => {
    const { ogrenciId, negatif } = tohumlar(OGRETMEN);
    const y = cagir(OGRETMEN, 'GET', `ogrenciler/${ogrenciId}/gunluk-soru/analiz`, {
      brans_kodu: 'matematik',
    });
    const analiz = AnalizYanitiSema.parse(y.govde);
    const konu = analiz.konular.find((k) => k.konu_id === negatif);
    expect(konu?.hucreler.kolay.basari).toBeCloseTo(0.9);
    expect(konu?.hucreler.orta.basari).toBeCloseTo(0.6);
    expect(konu?.hucreler.zor.basari).toBeCloseTo(0.25);
    expect(konu?.bant).toMatchObject({ durum: 'zorlaniyor', bant: 'orta' });
  });

  it('personel yaniti oneri tasir: gorev oner (20 soru) ve birebir ders; yetersiz veri sorun degildir', () => {
    const { ogrenciId, negatif, rasyonel, karekok } = tohumlar(OGRETMEN);
    const y = cagir(OGRETMEN, 'GET', `ogrenciler/${ogrenciId}/gunluk-soru/analiz`, {
      brans_kodu: 'matematik',
    });
    const analiz = AnalizYanitiSema.parse(y.govde);
    const oneriler = analiz.oneriler ?? [];
    expect(oneriler).toContainEqual(
      expect.objectContaining({
        tur: 'gorev_oner',
        konu_id: negatif,
        zorluk: 'orta',
        soru_sayisi: 20,
      }),
    );
    expect(oneriler).toContainEqual(
      expect.objectContaining({ tur: 'birebir_ders', konu_id: rasyonel }),
    );
    // 5 sorudan az: bant tespiti "veri az", oneri yok.
    expect(analiz.konular.find((k) => k.konu_id === karekok)?.bant.durum).toBe('veri_az');
    expect(oneriler.some((o) => o.konu_id === karekok)).toBe(false);
  });

  it('ogrenci personel uclarini, personel ogrenci uclarini kullanamaz', () => {
    const { ogrenciId } = tohumlar(OGRENCI);
    expect(
      cagir(OGRENCI, 'GET', `ogrenciler/${ogrenciId}/gunluk-soru/analiz`, {
        brans_kodu: 'matematik',
      }).durum,
    ).toBe(403);
    expect(cagir(OGRENCI, 'GET', 'gunluk-soru/sinif-analizi', { grup_id: 'x' }).durum).toBe(403);
    expect(cagir(OGRETMEN, 'GET', 'gunluk-soru/analiz', { brans_kodu: 'matematik' }).durum).toBe(
      403,
    );
    expect(cagir(OGRETMEN, 'GET', 'gunluk-soru/kayitlar').durum).toBe(403);
    expect(cagir(OGRETMEN, 'POST', 'gunluk-soru/kayitlar', {}, {}).durum).toBe(403);
  });

  it('hucre ayrintisi kayitlari ve fotograf adreslerini verir', () => {
    const { ogrenciId, negatif } = tohumlar(OGRETMEN);
    const y = cagir(OGRETMEN, 'GET', `ogrenciler/${ogrenciId}/gunluk-soru/analiz/hucre`, {
      brans_kodu: 'matematik',
      konu_id: negatif,
      zorluk: 'zor',
    });
    const d = HucreDetaySema.parse(y.govde);
    expect(d.kayitlar).toHaveLength(2);
    const fotolu = d.kayitlar.find((k) => k.dosyalar.length > 0);
    expect(fotolu?.dosyalar[0]?.adres?.asil_url).toContain('/api/medya-mock/');
  });

  it('haftalik ozet ve sinif analizi sozlesmeye uyar; sinifta en cok zorlanilan konu siralanir', () => {
    const { ogrenciId } = tohumlar(OGRETMEN);
    const ozet = cagir(OGRETMEN, 'GET', `ogrenciler/${ogrenciId}/gunluk-soru/haftalik-ozet`);
    expect(HaftalikOzetSema.parse(ozet.govde).hafta_baslangic).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const sinif = gunlukSoruKoprusu(OGRETMEN).gruplar.find((g) => g.tur === 'sinif');
    const y = cagir(OGRETMEN, 'GET', 'gunluk-soru/sinif-analizi', {
      grup_id: sinif?.id ?? '',
      brans_kodu: 'matematik',
    });
    const s = SinifAnaliziSema.parse(y.govde);
    expect(s.konular.length).toBeGreaterThan(0);
    const basarilar = s.en_cok_zorlanilan.map((k) => k.toplam.basari ?? 1);
    expect(basarilar).toEqual([...basarilar].sort((a, b) => a - b));
    expect(
      cagir(OGRETMEN, 'GET', 'gunluk-soru/sinif-analizi', {
        grup_id: 'yok',
        brans_kodu: 'matematik',
      }).durum,
    ).toBe(404);
  });
});

describe('gunluk soru mock: ogrenci kayitlari', () => {
  const yeni = (ek: Record<string, unknown> = {}) => {
    const t = tohumlar(OGRENCI);
    return {
      brans_kodu: 'matematik',
      konu_id: t.bilimsel,
      zorluk: 'orta',
      dogru: 7,
      yanlis: 2,
      bos: 1,
      ...ek,
    };
  };

  it('kayit olusturur, ayni istek_id ile tekrarda ayni kaydi (200) doner', () => {
    const istekId = crypto.randomUUID();
    const ilk = cagir(OGRENCI, 'POST', 'gunluk-soru/kayitlar', {}, yeni({ istek_id: istekId }));
    expect(ilk.durum).toBe(201);
    const kayit = GunlukSoruKaydiSema.parse(ilk.govde);
    expect(kayit.toplam).toBe(10);
    expect(kayit.duzenlenebilir).toBe(true);
    const tekrar = cagir(OGRENCI, 'POST', 'gunluk-soru/kayitlar', {}, yeni({ istek_id: istekId }));
    expect(tekrar.durum).toBe(200);
    expect(GunlukSoruKaydiSema.parse(tekrar.govde).id).toBe(kayit.id);
    const liste = GunlukSoruListeYanitiSema.parse(
      cagir(OGRENCI, 'GET', 'gunluk-soru/kayitlar').govde,
    );
    expect(liste.kayitlar.filter((k) => k.id === kayit.id)).toHaveLength(1);
  });

  it('dogrulama hatalari Turkce kodlarla doner', () => {
    const t = tohumlar(OGRENCI);
    const dene = (ek: Record<string, unknown>) =>
      cagir(OGRENCI, 'POST', 'gunluk-soru/kayitlar', {}, yeni(ek));
    expect(hataKodu(dene({ dogru: 0, yanlis: 0, bos: 0 }))).toBe('soru_toplami_gecersiz');
    expect(hataKodu(dene({ dogru: 400, yanlis: 100, bos: 1 }))).toBe('soru_toplami_gecersiz');
    expect(hataKodu(dene({ konu_id: crypto.randomUUID() }))).toBe('konu_gecersiz');
    expect(hataKodu(dene({ brans_kodu: 'fizik', konu_id: t.negatif }))).toBe('konu_gecersiz');
    expect(hataKodu(dene({ kaynak_test_id: crypto.randomUUID() }))).toBe('kaynak_testi_gecersiz');
    expect(hataKodu(dene({ plan_gorev_id: crypto.randomUUID() }))).toBe('plan_gorevi_gecersiz');
    expect(hataKodu(dene({ gun: '2020-01-01' }))).toBe('gun_gecersiz');
    expect(hataKodu(dene({ dosya_idleri: [crypto.randomUUID()] }))).toBe('dosya_hazir_degil');
    expect(dene({ zorluk: 'imkansiz' }).durum).toBe(400);
  });

  it('ayni gun duzeltilir ve silinir; onceki gunun kaydi kilitlidir', () => {
    const kayit = GunlukSoruKaydiSema.parse(
      cagir(OGRENCI, 'POST', 'gunluk-soru/kayitlar', {}, yeni()).govde,
    );
    const duz = cagir(
      OGRENCI,
      'PATCH',
      `gunluk-soru/kayitlar/${kayit.id}`,
      {},
      {
        dogru: 9,
        yanlis: 1,
        bos: 0,
        zorluk: 'zor',
        surum: kayit.surum,
      },
    );
    expect(duz.durum).toBe(200);
    const guncel = GunlukSoruKaydiSema.parse(duz.govde);
    expect(guncel).toMatchObject({ dogru: 9, yanlis: 1, toplam: 10, zorluk: 'zor', surum: 2 });
    // Eski surumle ikinci duzeltme cakisir.
    expect(
      hataKodu(
        cagir(OGRENCI, 'PATCH', `gunluk-soru/kayitlar/${kayit.id}`, {}, { dogru: 1, surum: 1 }),
      ),
    ).toBe('surum_cakismasi');
    expect(cagir(OGRENCI, 'DELETE', `gunluk-soru/kayitlar/${kayit.id}`).durum).toBe(204);
    expect(cagir(OGRENCI, 'DELETE', `gunluk-soru/kayitlar/${kayit.id}`).durum).toBe(404);

    const liste = GunlukSoruListeYanitiSema.parse(
      cagir(OGRENCI, 'GET', 'gunluk-soru/kayitlar').govde,
    );
    const eski = liste.kayitlar.find((k) => !k.duzenlenebilir);
    expect(eski).toBeDefined();
    expect(
      hataKodu(cagir(OGRENCI, 'PATCH', `gunluk-soru/kayitlar/${eski?.id ?? ''}`, {}, { dogru: 1 })),
    ).toBe('kayit_duzenlenemez');
    expect(hataKodu(cagir(OGRENCI, 'DELETE', `gunluk-soru/kayitlar/${eski?.id ?? ''}`))).toBe(
      'kayit_duzenlenemez',
    );
  });

  it('plan gorevine bagli kayit gorevin gerceklesenini kayit toplamina esitler', () => {
    const plan = govde(cagir(OGRENCI, 'GET', 'planim')) as {
      gorevler: { id: string; hedef_turu: string; gerceklesen_miktar: number | null }[];
    };
    const gorev = plan.gorevler.find((g) => g.hedef_turu === 'soru');
    expect(gorev).toBeDefined();
    const k = cagir(
      OGRENCI,
      'POST',
      'gunluk-soru/kayitlar',
      {},
      yeni({ plan_gorev_id: gorev?.id }),
    );
    expect(k.durum).toBe(201);
    const sonra = govde(cagir(OGRENCI, 'GET', 'planim')) as typeof plan;
    expect(sonra.gorevler.find((g) => g.id === gorev?.id)?.gerceklesen_miktar).toBe(10);
    const kayit = GunlukSoruKaydiSema.parse(k.govde);
    cagir(OGRENCI, 'DELETE', `gunluk-soru/kayitlar/${kayit.id}`);
    const silinmis = govde(cagir(OGRENCI, 'GET', 'planim')) as typeof plan;
    expect(silinmis.gorevler.find((g) => g.id === gorev?.id)?.gerceklesen_miktar).toBe(0);
  });

  it('son kullanilanlar en son dersi, konulari ve kaynaklari verir', () => {
    cagir(
      OGRENCI,
      'POST',
      'gunluk-soru/kayitlar',
      {},
      yeni({ zorluk: 'kolay', kaynak_metin: 'Benim kitabim' }),
    );
    const s = SonKullanilanlarSema.parse(
      cagir(OGRENCI, 'GET', 'gunluk-soru/son-kullanilanlar').govde,
    );
    const ders = s.dersler[0];
    expect(ders?.brans_kodu).toBe('matematik');
    expect(ders?.konular[0]).toMatchObject({
      konu_id: tohumlar(OGRENCI).bilimsel,
      son_zorluk: 'kolay',
    });
    expect(ders?.kaynaklar[0]?.kaynak_metin).toBe('Benim kitabim');
  });
});

describe('gunluk soru mock: gorev ver', () => {
  const t = () => tohumlar(OGRETMEN);
  const yol = () => `ogrenciler/${t().ogrenciId}/gunluk-soru/gorev-ver`;
  const girdi = (ek: Record<string, unknown>) => ({
    brans_kodu: 'matematik',
    konu_id: t().negatif,
    zorluk: 'orta',
    soru_sayisi: 20,
    ...ek,
  });

  it('oneriden haftalik plana gorev ekler; ogrencinin planinda gorunur', () => {
    const y = cagir(OGRETMEN, 'POST', yol(), {}, girdi({ tur: 'plan_gorevi' }));
    expect(y.durum).toBe(201);
    const sonuc = GorevVerYanitiSema.parse(y.govde);
    expect(sonuc.tur).toBe('plan_gorevi');
    if (sonuc.tur !== 'plan_gorevi') return;
    const plan = govde(
      cagir(OGRETMEN, 'GET', `ogrenciler/${t().ogrenciId}/plan`, { hafta: sonuc.hafta_baslangic }),
    ) as { gorevler: { id: string; baslik: string | null; hedef_miktar: number }[] };
    const gorev = plan.gorevler.find((g) => g.id === sonuc.gorev_id);
    expect(gorev?.hedef_miktar).toBe(20);
    expect(gorev?.baslik).toContain('orta seviyeden 20 soru');
  });

  it('odev verir; yanlis hedef ve hatali girdi reddedilir', () => {
    const y = cagir(OGRETMEN, 'POST', yol(), {}, girdi({ tur: 'odev', soru_sayisi: 15 }));
    expect(y.durum).toBe(201);
    expect(GorevVerYanitiSema.parse(y.govde).tur).toBe('odev');
    expect(
      hataKodu(cagir(OGRETMEN, 'POST', yol(), {}, girdi({ tur: 'odev', brans_kodu: 'fizik' }))),
    ).toBe('gorev_hedefi_gecersiz');
    expect(cagir(OGRETMEN, 'POST', yol(), {}, girdi({ tur: 'x' })).durum).toBe(400);
    expect(cagir(OGRETMEN, 'POST', yol(), {}, girdi({ tur: 'odev', soru_sayisi: 0 })).durum).toBe(
      400,
    );
    expect(
      cagir(
        OGRETMEN,
        'POST',
        `ogrenciler/${crypto.randomUUID()}/gunluk-soru/gorev-ver`,
        {},
        girdi({ tur: 'odev' }),
      ).durum,
    ).toBe(404);
  });
});

describe('gunluk soru mock: kaynak kitaplar', () => {
  it('ogretmen kitap tanimlar ve test ekler; ogrenci okur ama yazamaz', () => {
    const y = cagir(
      OGRETMEN,
      'POST',
      'kaynak-kitaplar',
      {},
      {
        ad: 'Yeni Bank',
        yayinevi: 'Y Yayinlari',
        brans_kodu: 'biyoloji',
        testler: [{ ad: 'Test 1', soru_sayisi: 20 }],
      },
    );
    expect(y.durum).toBe(201);
    const kitap = KaynakKitapDetaySema.parse(y.govde);
    expect(kitap).toMatchObject({ test_sayisi: 1, toplam_soru: 20, aktif: true });
    const ek = cagir(
      OGRETMEN,
      'POST',
      `kaynak-kitaplar/${kitap.id}/testler`,
      {},
      {
        testler: [{ ad: 'Test 2', soru_sayisi: 25 }],
      },
    );
    expect(KaynakKitapDetaySema.parse(ek.govde)).toMatchObject({ test_sayisi: 2, toplam_soru: 45 });
    expect(
      cagir(OGRENCI, 'POST', 'kaynak-kitaplar', {}, { ad: 'x', brans_kodu: 'fizik' }).durum,
    ).toBe(403);
    expect(
      cagir(
        OGRETMEN,
        'POST',
        'kaynak-kitaplar',
        {},
        { ad: 'x', brans_kodu: 'fizik', testler: [{ ad: 'T', soru_sayisi: 0 }] },
      ).durum,
    ).toBe(400);
  });

  it('pasif kitap ogrenciye gorunmez; kullanimdaki test silinemez', () => {
    const liste = () =>
      KaynakKitapListeYanitiSema.parse(
        cagir(OGRETMEN, 'GET', 'kaynak-kitaplar', { pasifler: 'true', brans_kodu: 'matematik' })
          .govde,
      ).kitaplar;
    const kitap = liste()[0];
    expect(kitap).toBeDefined();
    const id = kitap?.id ?? '';
    const p = cagir(OGRETMEN, 'PATCH', `kaynak-kitaplar/${id}`, {}, { aktif: false });
    expect(p.durum).toBe(200);
    const ogrKitaplari = KaynakKitapListeYanitiSema.parse(
      cagir(OGRENCI, 'GET', 'kaynak-kitaplar', { brans_kodu: 'matematik' }).govde,
    ).kitaplar;
    // Ogrenci kurumu ayri bir durumdur; kendi kurumundaki aktif kitaplari gorur.
    expect(ogrKitaplari.every((k) => k.aktif)).toBe(true);
    // Tohumda ilk testin kullanildigi kayit vardir (matematik kitabi ilk testi).
    const detay = KaynakKitapDetaySema.parse(cagir(OGRETMEN, 'GET', `kaynak-kitaplar/${id}`).govde);
    const kullanimda = detay.testler[0]?.id ?? '';
    const sil = cagir(OGRETMEN, 'DELETE', `kaynak-kitaplar/${id}/testler/${kullanimda}`);
    expect(hataKodu(sil)).toBe('kaynak_testi_kullanimda');
    const bos = detay.testler[2]?.id ?? '';
    expect(cagir(OGRETMEN, 'DELETE', `kaynak-kitaplar/${id}/testler/${bos}`).durum).toBe(204);
  });

  it('ogrenci kitaplarda ilerlemesini gorur: kullanilan test cozuldu sayilir', () => {
    const kitap = KaynakKitapListeYanitiSema.parse(
      cagir(OGRENCI, 'GET', 'kaynak-kitaplar', { brans_kodu: 'matematik' }).govde,
    ).kitaplar[0];
    expect(kitap?.ilerleme).toEqual({ cozulen_test: 1, toplam_test: 3 });
    const detay = KaynakKitapDetaySema.parse(
      cagir(OGRENCI, 'GET', `kaynak-kitaplar/${kitap?.id ?? ''}`).govde,
    );
    expect(detay.testler.filter((t) => t.cozuldu_gun).length).toBe(1);
  });
});
