import {
  companionEtiketi,
  evrimGerekli,
  riveGirdileri,
  RIVE,
  ruhHaliTetikleri,
  statikAnahtarlar,
} from './girdiler';
import { KARAKTER_GORSELLERI } from './gorseller.generated';
import { ASAMALAR, TURLER } from './tipler';

describe('Companion -> Rive girdileri', () => {
  it('props sozlesmedeki girdi adlarina eslenir', () => {
    const g = riveGirdileri(
      {
        tur: 'sedir',
        asama: 3,
        seviye: 12,
        varyant: 1,
        ruhHali: 'odak',
        beceriler: { sayisal: 7, fen: 10 },
        kozmetik: { sapka: 2 },
      },
      false,
    );
    expect(g.sayilar).toMatchObject({
      stage: 3,
      level: 12,
      variant: 1,
      skill_sayisal: 7,
      skill_sozel: 0,
      skill_fen: 10,
      cos_hat: 2,
      cos_accessory: 0,
    });
    expect(g.mantiksal).toEqual({ focus: true, sleepy: false, reduce_motion: false });
  });

  it('degerler sozlesme araliklarina sikistirilir', () => {
    const g = riveGirdileri(
      { tur: 'dinamo', asama: 9, seviye: 500, beceriler: { sayisal: -3, sozel: 99.6, dil: NaN } },
      true,
    );
    expect(g.sayilar.stage).toBe(5);
    expect(g.sayilar.level).toBe(99);
    expect(g.sayilar.skill_sayisal).toBe(0);
    expect(g.sayilar.skill_sozel).toBe(10);
    expect(g.sayilar.skill_dil).toBe(0);
    expect(g.sayilar.variant).toBe(0);
    expect(g.mantiksal.reduce_motion).toBe(true);
  });

  it('uykulu ruh hali sleepy girdisini acar', () => {
    expect(
      riveGirdileri({ tur: 'kivilcim', asama: 1, seviye: 1, ruhHali: 'uykulu' }, false).mantiksal
        .sleepy,
    ).toBe(true);
  });

  it('uretilen girdi adlari sozlesme listesindedir', () => {
    const g = riveGirdileri({ tur: 'kivilcim', asama: 1, seviye: 1 }, false);
    expect(Object.keys(g.sayilar).sort()).toEqual([...RIVE.sayilar].sort());
    expect(Object.keys(g.mantiksal).sort()).toEqual([...RIVE.mantiksal].sort());
  });

  it('gecici ruh halleri tetikleyici uretir, tekrar ve diger gecisler uretmez', () => {
    expect(ruhHaliTetikleri('normal', 'mutlu')).toEqual(['happy']);
    expect(ruhHaliTetikleri('odak', 'kutlama')).toEqual(['celebrate']);
    expect(ruhHaliTetikleri('mutlu', 'mutlu')).toEqual([]);
    expect(ruhHaliTetikleri('mutlu', 'normal')).toEqual([]);
    expect(ruhHaliTetikleri(undefined, 'uykulu')).toEqual([]);
  });

  it('evrim yalnizca asama artinca (ilk cizim haric)', () => {
    expect(evrimGerekli(undefined, 3)).toBe(false);
    expect(evrimGerekli(2, 3)).toBe(true);
    expect(evrimGerekli(3, 3)).toBe(false);
    expect(evrimGerekli(4, 3)).toBe(false);
  });
});

describe('statik yer tutucular', () => {
  it('3 tur x 5 evre = 15 gorselin hepsi uretilmis haritada var', () => {
    for (const tur of TURLER) {
      for (const a of ASAMALAR) {
        expect(statikAnahtarlar(tur, a, 0).some((k) => k in KARAKTER_GORSELLERI)).toBe(true);
      }
    }
    expect(Object.keys(KARAKTER_GORSELLERI)).toHaveLength(15);
  });

  it('once varyantli, sonra varyantsiz anahtar denenir', () => {
    expect(statikAnahtarlar('sedir', 3, 1)).toEqual(['sedir-3-v1', 'sedir-3']);
  });

  it('erisilebilirlik etiketi tur, evre ve ruh halini soyler', () => {
    expect(companionEtiketi({ tur: 'kivilcim', asama: 3, ruhHali: 'uykulu' })).toBe(
      'Yol arkadaşın Kıvılcım, 3. evre, uykuda',
    );
    expect(companionEtiketi({ tur: 'dinamo', asama: 2, ad: 'Çıtır' })).toBe(
      'Yol arkadaşın Çıtır, 2. evre, keyifli',
    );
  });
});
