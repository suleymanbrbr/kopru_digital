import { describe, expect, it } from 'vitest';

import {
  BANT_EN_AZ_SORU,
  GOREV_ONER_SORU_SAYISI,
  bantDegisimi,
  bantTespit,
  basariOrani,
  birebirDersGerekli,
  gorevBasligi,
  gorevOner,
  type BantHaritasi,
} from './gunluk-soru-bant.js';

const bant = (k: [number, number], o: [number, number], z: [number, number]): BantHaritasi => ({
  kolay: { cozulen: k[0], dogru: k[1] },
  orta: { cozulen: o[0], dogru: o[1] },
  zor: { cozulen: z[0], dogru: z[1] },
});
const konu = {
  brans_kodu: 'biyoloji',
  konu_id: '0190b2f0-7c3a-7a1e-8d5b-3f2a1c9e4b6d',
  konu_ad: 'Genetik',
};

describe('basariOrani', () => {
  it('3 ondalik yuvarlar, sifir cozulende null', () => {
    expect(basariOrani(2, 3)).toBe(0.667);
    expect(basariOrani(0, 0)).toBeNull();
    expect(basariOrani(10, 10)).toBe(1);
  });
});

describe('bantTespit', () => {
  it('sartname ornegi: kolay %90, orta %60, zor %25 -> orta zorlaniyor', () => {
    const t = bantTespit(bant([20, 18], [20, 12], [20, 5]));
    expect(t).toMatchObject({ durum: 'zorlaniyor', bant: 'orta' });
    expect(t.bant_basarilari).toEqual({ kolay: 0.9, orta: 0.6, zor: 0.25 });
  });

  it('hicbir bantta yeterli veri yoksa veri az (9 soru yetmez, 10 yeter)', () => {
    expect(bantTespit(bant([9, 3], [9, 3], [9, 3])).durum).toBe('veri_az');
    expect(bantTespit(bant([0, 0], [0, 0], [0, 0])).durum).toBe('veri_az');
    const t = bantTespit(bant([BANT_EN_AZ_SORU, 9], [9, 1], [0, 0]));
    expect(t.bant_basarilari).toEqual({ kolay: 0.9, orta: null, zor: null });
  });

  it('tek yeterli bant: kolay/orta mutlak dusuk basari zorlanma, yuksekse ve zorda veri az', () => {
    expect(bantTespit(bant([20, 8], [0, 0], [0, 0]))).toMatchObject({
      durum: 'zorlaniyor',
      bant: 'kolay',
    });
    expect(bantTespit(bant([0, 0], [20, 9], [0, 0]))).toMatchObject({
      durum: 'zorlaniyor',
      bant: 'orta',
    });
    expect(bantTespit(bant([20, 15], [0, 0], [0, 0])).durum).toBe('veri_az');
    expect(bantTespit(bant([0, 0], [0, 0], [30, 3])).durum).toBe('veri_az');
  });

  it('kenar: dusus tam esikte (0.9 -> 0.7) belirgin sayilir ama basari 0.7 sinirinin altinda degilse degil', () => {
    // 90 -> 70: dusus 0.2 ama 0.7 < 0.7 degil -> zorlanma yok.
    expect(bantTespit(bant([20, 18], [20, 14], [0, 0])).durum).toBe('tespit_yok');
    // 90 -> 65: dusus 0.25 ve 0.65 < 0.7 -> orta.
    expect(bantTespit(bant([20, 18], [20, 13], [0, 0]))).toMatchObject({ bant: 'orta' });
    // 90 -> 75: dusus 0.15 -> yok.
    expect(bantTespit(bant([20, 18], [20, 15], [0, 0])).durum).toBe('tespit_yok');
  });

  it('orta bant verisiz: dusus bir onceki YETERLI banda gore (kolay -> zor)', () => {
    expect(bantTespit(bant([20, 18], [4, 1], [20, 6]))).toMatchObject({
      durum: 'zorlaniyor',
      bant: 'zor',
    });
  });

  it('dengeli ogrenci: tespit yok', () => {
    expect(bantTespit(bant([20, 18], [20, 17], [20, 16])).durum).toBe('tespit_yok');
  });

  it('kolay bantta cok dusuk, ilk bant kolay olarak isaretlenir', () => {
    expect(bantTespit(bant([20, 6], [20, 5], [20, 3]))).toMatchObject({
      durum: 'zorlaniyor',
      bant: 'kolay',
    });
  });
});

describe('gorevOner', () => {
  it('zorlanilan bantta 20 soruluk gorev onerir', () => {
    const t = bantTespit(bant([20, 18], [20, 12], [20, 5]));
    expect(gorevOner(konu, t)).toEqual({
      tur: 'gorev_oner',
      brans_kodu: 'biyoloji',
      konu_id: konu.konu_id,
      konu_ad: 'Genetik',
      zorluk: 'orta',
      soru_sayisi: GOREV_ONER_SORU_SAYISI,
      basari: 0.6,
    });
  });
  it('veri az ya da tespit yok iken oneri uretmez (yanlis pozitif yok)', () => {
    expect(gorevOner(konu, bantTespit(bant([5, 1], [5, 1], [5, 0])))).toBeNull();
    expect(gorevOner(konu, bantTespit(bant([20, 18], [20, 17], [20, 16])))).toBeNull();
  });
});

describe('birebirDersGerekli', () => {
  it('son 2 haftada zorda %30 altinda ve duzelmiyorsa isaretler', () => {
    const o = birebirDersGerekli(konu, {
      onceki: { cozulen: 10, dogru: 3 },
      son: { cozulen: 10, dogru: 2 },
    });
    expect(o).toMatchObject({
      tur: 'birebir_ders',
      zor_basari: 0.25,
      onceki_hafta_basari: 0.3,
      son_hafta_basari: 0.2,
    });
  });
  it('duzeliyorsa (son hafta onceki haftadan >= 10 puan iyi) isaretlemez', () => {
    expect(
      birebirDersGerekli(konu, {
        onceki: { cozulen: 10, dogru: 1 },
        son: { cozulen: 10, dogru: 3 },
      }),
    ).toBeNull();
  });
  it('%30 ve ustu (tam esik) ya da 10 sorudan az veride isaretlemez', () => {
    expect(
      birebirDersGerekli(konu, {
        onceki: { cozulen: 10, dogru: 3 },
        son: { cozulen: 10, dogru: 3 },
      }),
    ).toBeNull(); // 6/20 = 0.30, esik "altinda" degil
    expect(
      birebirDersGerekli(konu, { onceki: { cozulen: 4, dogru: 0 }, son: { cozulen: 5, dogru: 0 } }),
    ).toBeNull(); // toplam 9
  });
  it('bir hafta verisiz: iyilesme kanitlanamaz, toplam yeterliyse isaretler', () => {
    const o = birebirDersGerekli(konu, {
      onceki: { cozulen: 0, dogru: 0 },
      son: { cozulen: 12, dogru: 2 },
    });
    expect(o).toMatchObject({ onceki_hafta_basari: null, son_hafta_basari: 0.167 });
  });
});

describe('bantDegisimi', () => {
  const orta = bantTespit(bant([20, 18], [20, 12], [20, 5]));
  const iyi = bantTespit(bant([20, 18], [20, 17], [20, 16]));
  const az = bantTespit(bant([1, 1], [0, 0], [0, 0]));
  const kolay = bantTespit(bant([20, 6], [0, 0], [0, 0]));
  it('karsilastirir', () => {
    expect(bantDegisimi(orta, iyi)).toBe('iyilesti');
    expect(bantDegisimi(iyi, orta)).toBe('kotulesti');
    expect(bantDegisimi(orta, orta)).toBe('ayni');
    expect(bantDegisimi(orta, kolay)).toBe('kotulesti');
    expect(bantDegisimi(az, iyi)).toBe('belirsiz');
    expect(bantDegisimi(iyi, az)).toBe('belirsiz');
  });
});

describe('gorevBasligi', () => {
  it('konu adi ve zorlukla baslik', () => {
    expect(gorevBasligi('Genetik', 'orta', 20)).toBe('Genetik: orta seviyeden 20 soru');
    expect(gorevBasligi(null, 'zor', 5)).toBe('Konu: zor seviyeden 5 soru');
  });
});
