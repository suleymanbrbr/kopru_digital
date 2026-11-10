import type { Konu, PlanGorevi } from '@kopru/contracts';
import { describe, expect, it } from 'vitest';

import {
  bosHucre,
  hucreHareketi,
  satirDolu,
  satirHatalari,
  satirNeti,
  tabloGonderimi,
  type TabloSatiri,
} from './deneme-tablo';
import { agaciDuzlestir, agaciSuz, konuAgaci, konuYolu, trNormalle } from './konu';
import { bolumDogrula, bosHesapla, netHesapla, netMetni } from './net';
import { odevFormunuDogrula, teslimDogrula, gecikmisMi } from './odev';
import {
  devirHedefi,
  gorevFormunuDogrula,
  gunlereBol,
  haftaKilitliMi,
  haftaninGunleri,
  ilerlemeEtiketi,
} from './plan';
import { ogrenmeYetkileri } from './rol';

describe('net onizleme', () => {
  it('LGS: 20 dogru 3 yanlis 19.00, 1 yanlis 19.67', () => {
    expect(netHesapla(20, 3, 0.3333)).toBe(19);
    expect(netHesapla(20, 1, 0.3333)).toBe(19.67);
  });
  it('TYT: 40 dogru 4 yanlis 39.00', () => {
    expect(netHesapla(40, 4, 0.25)).toBe(39);
  });
  it('kayan nokta hatasi yok ve 2 ondalik', () => {
    expect(netHesapla(10, 3, 0.25)).toBe(9.25);
    expect(netHesapla(7, 7, 0.3333)).toBe(4.67);
    expect(netHesapla(0, 5, 0.25)).toBe(-1.25);
    expect(netMetni(19.67)).toBe('19,67');
    expect(netMetni(39)).toBe('39,00');
  });
  it('bolum dogrulama: dogru + yanlis + bos = soru sayisi', () => {
    expect(bolumDogrula(20, '15', '3', '')).toBeNull();
    expect(bolumDogrula(20, '15', '3', '2')).toBeNull();
    expect(bolumDogrula(20, '15', '3', '1')).toBe('bosToplam');
    expect(bolumDogrula(20, '18', '3', '')).toBe('asiyor');
    expect(bolumDogrula(20, '-1', '', '')).toBe('sayi');
    expect(bolumDogrula(20, '1.5', '', '')).toBe('sayi');
    expect(bolumDogrula(20, 'a', '', '')).toBe('sayi');
    expect(bosHesapla(20, '15', '3')).toBe(2);
    expect(bosHesapla(20, '21', '0')).toBeNull();
  });
});

const konu = (ad: string, ek: Partial<Konu> = {}): Konu => ({
  id: ad,
  kurum_id: null,
  katalog_kodu: 'lgs',
  brans_kodu: 'matematik',
  ust_id: null,
  seviye: 'unite',
  ad,
  kazanim_kodu: null,
  sira: 0,
  sinif_seviyesi: null,
  gecerli_surum_baslangic: 1,
  gecerli_surum_bitis: null,
  yerine_gecen_id: null,
  arsivlendi_at: null,
  kullanimdan_kalkti: false,
  surum: 1,
  ...ek,
});

describe('konu agaci ve arama', () => {
  const liste = [
    konu('Üslü İfadeler', { sira: 1 }),
    konu('Bilimsel gösterim', { ust_id: 'Üslü İfadeler', seviye: 'konu', sira: 2 }),
    konu('Çok büyük sayılar', { ust_id: 'Bilimsel gösterim', seviye: 'alt_konu', sira: 3 }),
    konu('Eski konu', {
      ust_id: 'Üslü İfadeler',
      seviye: 'konu',
      sira: 4,
      kullanimdan_kalkti: true,
    }),
    konu('Işık', { brans_kodu: 'fizik', katalog_kodu: 'tyt', sira: 5 }),
  ];
  const agac = konuAgaci(liste);

  it('unite > konu > alt konu agaci kurar', () => {
    expect(agac.map((d) => d.konu.ad)).toEqual(['Üslü İfadeler', 'Işık']);
    expect(agac[0]?.cocuklar[0]?.cocuklar[0]?.konu.ad).toBe('Çok büyük sayılar');
  });

  it('Turkce harf duyarsiz arama: i/ı/İ/I ve ç ğ ö ş ü', () => {
    expect(trNormalle('IŞIK')).toBe('isik');
    expect(trNormalle('Işık')).toBe('isik');
    expect(trNormalle('İĞNE')).toBe('igne');
    const bul = (q: string) => agaciDuzlestir(agaciSuz(agac, { arama: q })).map((s) => s.konu.ad);
    expect(bul('isik')).toEqual(['Işık']);
    expect(bul('USLU')).toContain('Üslü İfadeler');
    expect(bul('cok buyuk')).toEqual(['Üslü İfadeler', 'Bilimsel gösterim', 'Çok büyük sayılar']);
  });

  it('kullanimdan kalkan konu secicide sunulmaz, yonetimde rozetli gelir', () => {
    const secici = agaciDuzlestir(agaciSuz(agac, {})).map((s) => s.konu.ad);
    expect(secici).not.toContain('Eski konu');
    const yonetim = agaciDuzlestir(agaciSuz(agac, { kalkanlariGoster: true })).map(
      (s) => s.konu.ad,
    );
    expect(yonetim).toContain('Eski konu');
  });

  it('katalog ve brans suzgeci', () => {
    expect(agaciDuzlestir(agaciSuz(agac, { brans: 'fizik' })).map((s) => s.konu.ad)).toEqual([
      'Işık',
    ]);
    expect(agaciDuzlestir(agaciSuz(agac, { katalog: 'lgs' })).map((s) => s.konu.ad)).not.toContain(
      'Işık',
    );
  });

  it('konu yolu ust zincirini gosterir', () => {
    const harita = new Map(liste.map((k) => [k.id, k]));
    expect(konuYolu(liste[2] as Konu, harita)).toBe(
      'Üslü İfadeler › Bilimsel gösterim › Çok büyük sayılar',
    );
  });
});

const kural = {
  yanlis_katsayisi: 0.25,
  bolumler: [
    { bolum_kodu: 'turkce', brans_kodu: 'turkce', ad: 'Türkçe', soru_sayisi: 40 },
    { bolum_kodu: 'matematik', brans_kodu: 'matematik', ad: 'Matematik', soru_sayisi: 40 },
  ],
};

describe('tablo girisi', () => {
  const dolu: TabloSatiri = {
    turkce: { dogru: '35', yanlis: '4' },
    matematik: { dogru: '30', yanlis: '8' },
  };
  it('bos satir atlanir, dolu satir net verir', () => {
    expect(satirDolu({})).toBe(false);
    expect(satirDolu({ turkce: bosHucre })).toBe(false);
    expect(satirDolu(dolu)).toBe(true);
    expect(satirNeti(kural, dolu)).toBe(34 + 28);
    expect(satirNeti(kural, {})).toBeNull();
  });
  it('bolum asimi hata verir ve net gostermez', () => {
    const kotu: TabloSatiri = { turkce: { dogru: '38', yanlis: '5' } };
    expect(satirHatalari(kural, kotu)).toEqual({ turkce: 'asiyor' });
    expect(satirNeti(kural, kotu)).toBeNull();
  });
  it('gonderim yalniz dolu ve gecerli satirlari alir', () => {
    const sonuc = tabloGonderimi(kural, {
      a: dolu,
      b: {},
      c: { turkce: { dogru: '99', yanlis: '' } },
      d: { matematik: { dogru: '10', yanlis: '' } },
    });
    expect(sonuc.hatali).toEqual(['c']);
    expect(sonuc.satirlar.map((s) => s.ogrenci_id)).toEqual(['a', 'd']);
    expect(sonuc.satirlar[1]?.bolumler).toEqual([
      { bolum_kodu: 'turkce', dogru: 0, yanlis: 0 },
      { bolum_kodu: 'matematik', dogru: 10, yanlis: 0 },
    ]);
  });
  it('klavye ile hucre gezinme sinirlarda kalir', () => {
    const k = { satir: 0, sutun: 0 };
    expect(hucreHareketi(k, 'ArrowDown', 3, 4)).toEqual({ satir: 1, sutun: 0 });
    expect(hucreHareketi(k, 'ArrowUp', 3, 4)).toEqual(k);
    expect(hucreHareketi(k, 'ArrowLeft', 3, 4)).toEqual(k);
    expect(hucreHareketi({ satir: 2, sutun: 3 }, 'ArrowRight', 3, 4)).toEqual({
      satir: 2,
      sutun: 3,
    });
    expect(hucreHareketi({ satir: 2, sutun: 1 }, 'Enter', 3, 4)).toEqual({ satir: 2, sutun: 1 });
    expect(hucreHareketi({ satir: 1, sutun: 1 }, 'Enter', 3, 4, true)).toEqual({
      satir: 0,
      sutun: 1,
    });
    expect(hucreHareketi(k, 'a', 3, 4)).toEqual(k);
  });
});

const gorev = (ek: Partial<PlanGorevi> = {}): PlanGorevi => ({
  id: 'g1',
  plan_id: 'p',
  ogrenci_id: 'o',
  hafta_baslangic: '2026-11-09',
  gun: '2026-11-09',
  brans_kodu: 'matematik',
  konu_id: null,
  baslik: null,
  hedef_turu: 'soru',
  hedef_miktar: 30,
  gerceklesen_miktar: null,
  durum: 'bekliyor',
  tamamlandi_at: null,
  devreden_gorev_id: null,
  sira: 0,
  surum: 1,
  ...ek,
});

describe('plan hafta ve gun yardimcilari', () => {
  it('hafta Pazartesi-Pazar 7 gundur', () => {
    const g = haftaninGunleri('2026-11-09');
    expect(g).toHaveLength(7);
    expect(g[0]).toBe('2026-11-09');
    expect(g[6]).toBe('2026-11-15');
  });
  it('gorevler gune bolunur, bos gunler de anahtardir; sira korunur', () => {
    const harita = gunlereBol(
      [
        gorev({ id: 'a', sira: 2 }),
        gorev({ id: 'b', sira: 1 }),
        gorev({ id: 'c', gun: '2026-11-11' }),
      ],
      '2026-11-09',
    );
    expect([...harita.keys()]).toHaveLength(7);
    expect(harita.get('2026-11-09')?.map((x) => x.id)).toEqual(['b', 'a']);
    expect(harita.get('2026-11-10')).toEqual([]);
    expect(harita.get('2026-11-11')).toHaveLength(1);
  });
  it('yarina tasi: Pazar gunu hedef yok, ay sonunu asar', () => {
    expect(devirHedefi(gorev())).toBe('2026-11-10');
    expect(devirHedefi(gorev({ gun: '2026-11-15' }))).toBeNull();
    expect(devirHedefi(gorev({ hafta_baslangic: '2026-11-30', gun: '2026-11-30' }))).toBe(
      '2026-12-01',
    );
  });
  it('kilit: hafta sonundan 14 gun sonra', () => {
    expect(haftaKilitliMi('2026-11-09', '2026-11-29')).toBe(false);
    expect(haftaKilitliMi('2026-11-09', '2026-11-30')).toBe(true);
  });
  it('gorev formu dogrulamasi', () => {
    const iyi = { gun: '2026-11-10', brans: 'matematik', hedefTuru: 'soru' as const, miktar: '30' };
    expect(gorevFormunuDogrula(iyi, '2026-11-09')).toEqual({});
    expect(Object.keys(gorevFormunuDogrula({ ...iyi, gun: '2026-11-16' }, '2026-11-09'))).toEqual([
      'gun',
    ]);
    expect(Object.keys(gorevFormunuDogrula({ ...iyi, miktar: '0' }, '2026-11-09'))).toEqual([
      'miktar',
    ]);
    expect(Object.keys(gorevFormunuDogrula({ ...iyi, brans: '' }, '2026-11-09'))).toEqual([
      'brans',
    ]);
  });
  it('ilerleme etiketi', () => {
    expect(ilerlemeEtiketi(gorev())).toBe('30 soru');
    expect(ilerlemeEtiketi(gorev({ gerceklesen_miktar: 12 }))).toBe('12 / 30 soru');
    expect(
      ilerlemeEtiketi(gorev({ hedef_turu: 'dakika', hedef_miktar: 45, gerceklesen_miktar: 45 })),
    ).toBe('45 / 45 dk');
  });
});

describe('odev yardimcilari', () => {
  const f = {
    hedefTuru: 'grup' as const,
    hedefId: 'g',
    brans: 'matematik',
    konuId: null,
    baslik: 'Test',
    baslikElle: false,
    tur: 'soru' as const,
    kaynak: '',
    sonTeslim: '2026-11-20',
    hedefSayi: '20',
  };
  it('form dogrulama', () => {
    expect(odevFormunuDogrula(f, '2026-11-10')).toEqual({});
    expect(Object.keys(odevFormunuDogrula({ ...f, hedefId: '' }, '2026-11-10'))).toEqual(['hedef']);
    expect(odevFormunuDogrula({ ...f, hedefTuru: 'kurum', hedefId: '' }, '2026-11-10')).toEqual({});
    expect(
      Object.keys(odevFormunuDogrula({ ...f, sonTeslim: '2026-11-01' }, '2026-11-10')),
    ).toEqual(['sonTeslim']);
    expect(Object.keys(odevFormunuDogrula({ ...f, hedefSayi: 'x' }, '2026-11-10'))).toEqual([
      'hedefSayi',
    ]);
  });
  it('teslim dogrulama ve gecikme', () => {
    expect(teslimDogrula('20', '15', '3', '2')).toBeNull();
    expect(teslimDogrula('20', '', '', '')).toBeNull();
    expect(teslimDogrula('20', '15', '4', '2')).toBe('asiyor');
    expect(teslimDogrula('', '', '', '')).toBe('sayi');
    expect(teslimDogrula('20', '-1', '', '')).toBe('sayi');
    const simdi = new Date('2026-11-10T12:00:00Z');
    expect(gecikmisMi('atandi', '2026-11-09T20:59:00Z', simdi)).toBe(true);
    expect(gecikmisMi('atandi', '2026-11-12T20:59:00Z', simdi)).toBe(false);
    expect(gecikmisMi('incelendi', '2026-11-09T20:59:00Z', simdi)).toBe(false);
    expect(gecikmisMi('atandi', null, simdi)).toBe(false);
  });
});

describe('rol gorunurlugu', () => {
  it('ogrenci hedefi degistiremez, sinif ortalamasi ve onay kuyrugu gormez; yalniz gerceklesen yazar', () => {
    const o = ogrenmeYetkileri('ogrenci');
    expect(o.hedefDegistirebilir).toBe(false);
    expect(o.sinifOrtalamasiGorur).toBe(false);
    expect(o.denemeOnaylayabilir).toBe(false);
    expect(o.odevIncelebilir).toBe(false);
    expect(o.gerceklesenYazabilir).toBe(true);
    expect(o.teslimEdebilir).toBe(true);
    expect(o.kendiDenemesiniGirebilir).toBe(true);
    expect(o.yazabilir).toBe(false);
  });
  it('ogretmen gerceklesen miktari degistiremez ama plan kurar ve onaylar', () => {
    const o = ogrenmeYetkileri('ogretmen');
    expect(o.gerceklesenYazabilir).toBe(false);
    expect(o.hedefDegistirebilir).toBe(true);
    expect(o.sinifOrtalamasiGorur).toBe(true);
    expect(o.denemeOnaylayabilir).toBe(true);
    expect(o.genisHedef).toBe(false);
    expect(o.konuYonetebilir).toBe(false);
  });
  it('sahip ve yonetici kurum konusu, genis hedef ve ayar yonetir', () => {
    for (const rol of ['sahip', 'yonetici'] as const) {
      const o = ogrenmeYetkileri(rol);
      expect(o.konuYonetebilir).toBe(true);
      expect(o.genisHedef).toBe(true);
      expect(o.denemeAyariYazabilir).toBe(true);
      expect(o.gerceklesenYazabilir).toBe(false);
    }
  });
});
