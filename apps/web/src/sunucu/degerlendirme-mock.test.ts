import {
  DegerlendirmeHatirlatmaSema,
  DegerlendirmeListeYanitiSema,
  DegerlendirmeSema,
  KaynakOnerisiListeYanitiSema,
  KaynakOnerisiSema,
  KoclukYanitiSema,
  OgrenciDegerlendirmeListeYanitiSema,
} from '@kopru/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { degerlendirmeMock, degerlendirmeMockSifirla } from './degerlendirme-mock';
import {
  gunlukSoruMock,
  gunlukSoruMockSifirla,
  koclukBasladiMi,
  koclukKitaplari,
} from './gunluk-soru-mock';
import { gunlukSoruKoprusu, ogrenmeMockSifirla } from './ogrenme-mock';
import type { MockYanit } from './vekil';

/** Roller kurumdan gelir: ege ogretmen (Burcu Tekin), mavi yonetici, atlas ogrenci (Cağlar Yildiz). */
const OGRETMEN = 'kurum-ege';
const YONETICI = 'kurum-mavi';
const OGRENCI = 'kurum-atlas';

const cagir = (
  kurum: string,
  yontem: string,
  yol: string,
  sorgu: Record<string, string> = {},
  govde?: unknown,
): MockYanit => {
  const y = degerlendirmeMock({
    yontem,
    yol: `kurumlar/${kurum}/${yol}`,
    sorgu: new URLSearchParams(sorgu),
    govde,
    basliklar: {},
    kaynak: 'http://localhost',
  });
  if (!y) throw new Error(`mock yanit vermedi: ${yontem} ${yol}`);
  return y;
};
const govde = (y: MockYanit) => y.govde as Record<string, unknown>;
const hataKodu = (y: MockYanit) => (govde(y).error as { code: string }).code;
const bugun = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

beforeEach(() => {
  degerlendirmeMockSifirla();
  gunlukSoruMockSifirla();
  ogrenmeMockSifirla();
});

const caglar = (kurum: string) => gunlukSoruKoprusu(kurum).benId;

describe('kocluk gorunumu', () => {
  it('sozlesmeye uyar; tohum iki ogretmenin degerlendirmesini ve uc oneriyi icerir', () => {
    const y = cagir(OGRETMEN, 'GET', `ogrenciler/${caglar(OGRETMEN)}/kocluk`);
    expect(y.durum).toBe(200);
    const k = KoclukYanitiSema.parse(y.govde);
    expect(k.degerlendirmeler.degerlendirmeler).toHaveLength(4);
    const yazarlar = new Set(k.degerlendirmeler.degerlendirmeler.map((d) => d.yazar_ad));
    expect(yazarlar.size).toBe(2);
    // Biri ogrenciye gorunur, digerleri gizli.
    expect(k.degerlendirmeler.degerlendirmeler.filter((d) => d.ogrenci_gorur)).toHaveLength(1);
    // "benim" yalniz kurumun ogretmeninin yazdiklari.
    expect(k.degerlendirmeler.degerlendirmeler.filter((d) => d.benim)).toHaveLength(2);
    expect(k.olcek_ortalamalari.haftalar).toHaveLength(4);
    expect(k.olcek_ortalamalari.toplam.sayi).toBe(4);
    expect(k.oneriler.map((o) => o.basladi).sort()).toEqual([false, null, true]);
    expect(k.konu_analizi.bransler.length).toBeGreaterThan(0);
  });

  it('ogrenci kocluk gorunumunu goremez (403); kapsam disi ogrenci 404', () => {
    expect(cagir(OGRENCI, 'GET', `ogrenciler/${caglar(OGRENCI)}/kocluk`).durum).toBe(403);
    expect(cagir(OGRETMEN, 'GET', 'ogrenciler/yok/kocluk').durum).toBe(404);
  });

  it('sayfalama: ilk sayfa limit kadar, devami liste ucundan gelir', () => {
    const id = caglar(OGRETMEN);
    const yol = `ogrenciler/${id}/degerlendirmeler`;
    const ilk = cagir(OGRETMEN, 'GET', `ogrenciler/${id}/kocluk`, { limit: '2' });
    const ilkSayfa = KoclukYanitiSema.parse(ilk.govde).degerlendirmeler;
    expect(ilkSayfa.degerlendirmeler).toHaveLength(2);
    expect(ilkSayfa.sonraki_imlec).not.toBeNull();
    const devam = DegerlendirmeListeYanitiSema.parse(
      cagir(OGRETMEN, 'GET', yol, { limit: '2', imlec: ilkSayfa.sonraki_imlec ?? '' }).govde,
    );
    expect(devam.degerlendirmeler).toHaveLength(2);
    expect(devam.sonraki_imlec).toBeNull();
    const kimlikler = new Set(
      [...ilkSayfa.degerlendirmeler, ...devam.degerlendirmeler].map((d) => d.id),
    );
    expect(kimlikler.size).toBe(4);
  });
});

describe('degerlendirme yazma', () => {
  it('yazar, ogrenci gorunurlugu varsayilan kapali; ogrenci yalniz gorunur olani gorur', () => {
    const id = caglar(OGRETMEN);
    const yol = `ogrenciler/${id}/degerlendirmeler`;
    const y = cagir(
      OGRETMEN,
      'POST',
      yol,
      {},
      {
        donem_baslangic: bugun(),
        calisma_duzeni: 5,
        yorum: 'Yeni gizli yorum',
      },
    );
    expect(y.durum).toBe(201);
    const d = DegerlendirmeSema.parse(y.govde);
    expect(d.ogrenci_gorur).toBe(false);
    expect(d.benim).toBe(true);
    expect(d.duzenlenebilir).toBe(true);
    expect(d.donem_bitis).toBe(d.donem_baslangic);

    // Ogrenci tarafi (atlas kurumu): tohumdaki tek gorunur kayit; yeni yorum yok.
    const ogr = OgrenciDegerlendirmeListeYanitiSema.parse(
      cagir(OGRENCI, 'GET', 'degerlendirmelerim').govde,
    );
    expect(ogr.degerlendirmeler).toHaveLength(1);
    expect(JSON.stringify(ogr)).not.toContain('ogrenci_gorur');
    expect(JSON.stringify(ogr)).not.toContain('yazar_id');
    expect(JSON.stringify(ogr)).not.toContain('gizli');
  });

  it('dogrulama: bos, gelecek gun, 31 gunu asan donem, olcek disi puan', () => {
    const yol = `ogrenciler/${caglar(OGRETMEN)}/degerlendirmeler`;
    const yaz = (g: Record<string, unknown>) => cagir(OGRETMEN, 'POST', yol, {}, g);
    expect(yaz({ donem_baslangic: bugun() }).durum).toBe(400);
    const yarin = new Date(Date.now() + 27 * 3_600_000).toISOString().slice(0, 10);
    expect(hataKodu(yaz({ donem_baslangic: yarin, yorum: 'x' }))).toBe('donem_gecersiz');
    expect(
      hataKodu(yaz({ donem_baslangic: '2026-01-01', donem_bitis: '2026-03-01', yorum: 'x' })),
    ).toBe('donem_gecersiz');
    expect(yaz({ donem_baslangic: bugun(), calisma_duzeni: 6 }).durum).toBe(400);
  });

  it('duzenleme: yazar 7 gun icinde; baskasi 403; sure dolunca 409; surum cakismasi 409', () => {
    const id = caglar(OGRETMEN);
    const liste = DegerlendirmeListeYanitiSema.parse(
      cagir(OGRETMEN, 'GET', `ogrenciler/${id}/degerlendirmeler`).govde,
    ).degerlendirmeler;
    const benim = liste.find((d) => d.benim && d.duzenlenebilir);
    const baskasi = liste.find((d) => !d.benim);
    const eski = liste.find((d) => d.benim && !d.duzenlenebilir);
    expect(benim && baskasi && eski).toBeTruthy();
    const yama = (d: { id: string }, g: Record<string, unknown>) =>
      cagir(OGRETMEN, 'PATCH', `degerlendirmeler/${d.id}`, {}, g);
    const guncel = yama(benim as { id: string }, { yorum: 'Düzeltildi', ogrenci_gorur: true });
    expect(guncel.durum).toBe(200);
    expect(DegerlendirmeSema.parse(guncel.govde).surum).toBe(2);
    expect(yama(baskasi as { id: string }, { yorum: 'x' }).durum).toBe(403);
    expect(hataKodu(yama(eski as { id: string }, { yorum: 'x' }))).toBe(
      'degerlendirme_duzenlenemez',
    );
    expect(hataKodu(yama(benim as { id: string }, { yorum: 'y', surum: 1 }))).toBe(
      'surum_cakismasi',
    );
  });

  it('geri cekme: yazar ya da yonetici; ogrenci gormez, kocluktan kalkar; tekrar 200', () => {
    const id = caglar(OGRETMEN);
    const liste = DegerlendirmeListeYanitiSema.parse(
      cagir(OGRETMEN, 'GET', `ogrenciler/${id}/degerlendirmeler`).govde,
    ).degerlendirmeler;
    const baskasi = liste.find((d) => !d.benim);
    const gorunur = liste.find((d) => d.ogrenci_gorur);
    expect(baskasi && gorunur).toBeTruthy();
    // Ogretmen baska ogretmenin kaydini geri cekemez.
    expect(cagir(OGRETMEN, 'POST', `degerlendirmeler/${baskasi?.id}/geri-cek`).durum).toBe(403);
    // Yazar (gorunur kayit Burcu'nun) geri ceker; tekrar cagri idempotent.
    expect(cagir(OGRETMEN, 'POST', `degerlendirmeler/${gorunur?.id}/geri-cek`).durum).toBe(200);
    expect(cagir(OGRETMEN, 'POST', `degerlendirmeler/${gorunur?.id}/geri-cek`).durum).toBe(200);
    const k = KoclukYanitiSema.parse(cagir(OGRETMEN, 'GET', `ogrenciler/${id}/kocluk`).govde);
    expect(k.degerlendirmeler.degerlendirmeler).toHaveLength(3);
    // Yonetici baska ogretmenin kaydini geri cekebilir.
    const yid = caglar(YONETICI);
    const ylistesi = DegerlendirmeListeYanitiSema.parse(
      cagir(YONETICI, 'GET', `ogrenciler/${yid}/degerlendirmeler`).govde,
    ).degerlendirmeler;
    expect(cagir(YONETICI, 'POST', `degerlendirmeler/${ylistesi[0]?.id}/geri-cek`).durum).toBe(200);
  });

  it('ogrenci yazma uclarini kullanamaz', () => {
    const id = caglar(OGRENCI);
    expect(
      cagir(
        OGRENCI,
        'POST',
        `ogrenciler/${id}/degerlendirmeler`,
        {},
        {
          donem_baslangic: bugun(),
          yorum: 'x',
        },
      ).durum,
    ).toBe(403);
    expect(cagir(OGRENCI, 'GET', 'degerlendirme-hatirlatma').durum).toBe(403);
  });
});

describe('kaynak onerisi', () => {
  it('kitap, test, link ve serbest onerilir; kapsam: ogrenci kendi onerilerini gorur', () => {
    const id = caglar(OGRETMEN);
    const yol = `ogrenciler/${id}/kaynak-onerileri`;
    const kitaplar = gunlukSoruKoprusu(OGRETMEN);
    expect(kitaplar).toBeTruthy();
    const mevcut = KoclukYanitiSema.parse(cagir(OGRETMEN, 'GET', `ogrenciler/${id}/kocluk`).govde);
    const kitapId = mevcut.oneriler.find((o) => o.tur === 'kaynak_kitap')?.kaynak_kitap_id;
    expect(kitapId).toBeTruthy();

    const link = cagir(
      OGRETMEN,
      'POST',
      yol,
      {},
      {
        tur: 'link',
        baglanti_url: 'https://ornek.com/x',
        baslik: 'Video',
      },
    );
    expect(link.durum).toBe(201);
    expect(KaynakOnerisiSema.parse(link.govde).basladi).toBeNull();
    expect(
      cagir(
        OGRETMEN,
        'POST',
        yol,
        {},
        { tur: 'link', baglanti_url: 'javascript:alert(1)', baslik: 'x' },
      ).durum,
    ).toBe(400);
    expect(
      cagir(OGRETMEN, 'POST', yol, {}, { tur: 'kaynak_kitap', kaynak_kitap_id: 'yok' }).durum,
    ).toBe(422);
    const kitap = cagir(
      OGRETMEN,
      'POST',
      yol,
      {},
      { tur: 'kaynak_kitap', kaynak_kitap_id: kitapId },
    );
    expect(kitap.durum).toBe(201);
    const liste = KaynakOnerisiListeYanitiSema.parse(cagir(OGRETMEN, 'GET', yol).govde);
    expect(liste.oneriler.length).toBe(5);

    const benim = KaynakOnerisiListeYanitiSema.parse(
      cagir(OGRENCI, 'GET', 'kaynak-onerilerim').govde,
    );
    expect(benim.oneriler).toHaveLength(3);
  });

  it('geri cekme: oneren ya da yonetici; ogrencinin listesinden kalkar', () => {
    const id = caglar(OGRETMEN);
    const liste = KaynakOnerisiListeYanitiSema.parse(
      cagir(OGRETMEN, 'GET', `ogrenciler/${id}/kaynak-onerileri`).govde,
    ).oneriler;
    const baskasininki = liste.find((o) => !o.benim);
    const kendi = liste.find((o) => o.benim);
    expect(cagir(OGRETMEN, 'POST', `kaynak-onerileri/${baskasininki?.id}/geri-cek`).durum).toBe(
      403,
    );
    expect(cagir(OGRETMEN, 'POST', `kaynak-onerileri/${kendi?.id}/geri-cek`).durum).toBe(200);
    expect(
      KaynakOnerisiListeYanitiSema.parse(
        cagir(OGRETMEN, 'GET', `ogrenciler/${id}/kaynak-onerileri`).govde,
      ).oneriler,
    ).toHaveLength(2);
  });
});

describe('hatirlatma', () => {
  it('bu hafta kendi degerlendirmesi olmayan ogrenciler; yazinca listeden duser', () => {
    const ilk = DegerlendirmeHatirlatmaSema.parse(
      cagir(OGRETMEN, 'GET', 'degerlendirme-hatirlatma').govde,
    );
    expect(ilk.ogrenci_sayisi).toBe(10);
    // Cağlar'in bu haftaki degerlendirmesi var; digerleri bekliyor.
    expect(ilk.eksik_sayisi).toBe(9);
    expect(ilk.ogrenciler.some((o) => o.ogrenci_id === caglar(OGRETMEN))).toBe(false);
    const hedef = ilk.ogrenciler[0]?.ogrenci_id ?? '';
    cagir(
      OGRETMEN,
      'POST',
      `ogrenciler/${hedef}/degerlendirmeler`,
      {},
      {
        donem_baslangic: bugun(),
        yorum: 'Merhaba',
      },
    );
    const son = DegerlendirmeHatirlatmaSema.parse(
      cagir(OGRETMEN, 'GET', 'degerlendirme-hatirlatma').govde,
    );
    expect(son.eksik_sayisi).toBe(8);
  });
});

describe('basladi durumu', () => {
  it('oneriden sonra o kitabin testiyle kayit girilince basladi olur; once girilen sayilmaz', () => {
    const ben = caglar(OGRENCI);
    const kitap = koclukKitaplari(OGRENCI).find((k) => k.ad === 'Seçme Matematik Fasikülleri');
    expect(kitap).toBeTruthy();
    const konu = gunlukSoruKoprusu(OGRENCI).konular.find((k) => k.brans_kodu === 'matematik');
    const gecmis = new Date(Date.now() - 3_600_000).toISOString();
    const gelecek = new Date(Date.now() + 3_600_000).toISOString();
    const olc = { kitapId: kitap?.id ?? '', sonra: gecmis };
    expect(koclukBasladiMi(OGRENCI, ben, olc).basladi).toBe(false);
    const yanit = gunlukSoruMock({
      yontem: 'POST',
      yol: `kurumlar/${OGRENCI}/gunluk-soru/kayitlar`,
      sorgu: new URLSearchParams(),
      govde: {
        brans_kodu: 'matematik',
        konu_id: konu?.id,
        zorluk: 'orta',
        kaynak_test_id: kitap?.testler[0]?.id,
        dogru: 5,
        yanlis: 3,
        bos: 2,
        istek_id: crypto.randomUUID(),
      },
      basliklar: {},
      kaynak: 'http://localhost',
    });
    expect(yanit?.durum).toBe(201);
    const sonuc = koclukBasladiMi(OGRENCI, ben, olc);
    expect(sonuc).toMatchObject({ basladi: true, kayit_sayisi: 1 });
    expect(koclukBasladiMi(OGRENCI, ben, { ...olc, sonra: gelecek }).basladi).toBe(false);
    // Baska kitabin testi bu oneriyi baslatmaz.
    const baska = koclukKitaplari(OGRENCI).find((k) => k.id !== kitap?.id);
    expect(
      koclukBasladiMi(OGRENCI, ben, { kitapId: baska?.id ?? '', sonra: gecmis }).kayit_sayisi,
    ).toBe(0);
  });
});
