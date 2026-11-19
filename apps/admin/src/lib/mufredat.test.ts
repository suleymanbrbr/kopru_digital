import { describe, expect, it } from 'vitest';

import { agacKur, altlari, bransGrupla, duzles, uygunHedefler, uygunUstler } from './mufredat';
import type { Konu } from './tipler';

function konu(
  id: string,
  ad: string,
  seviye: Konu['seviye'],
  ust: string | null,
  brans = 'mat',
  sira = 0,
): Konu {
  return {
    id,
    ad,
    seviye,
    ust_id: ust,
    brans_kodu: brans,
    sira,
    yeni: false,
    gecerli_surum_baslangic: 1,
    gecerli_surum_bitis: null,
    kazanim_kodu: null,
    sinif_seviyesi: null,
    yerine_gecen_id: null,
  };
}

function bul(id: string): Konu {
  const k = KONULAR.find((x) => x.id === id);
  if (!k) throw new Error(`konu yok: ${id}`);
  return k;
}

const KONULAR = [
  konu('u1', 'Sayılar', 'unite', null, 'mat', 1),
  konu('k1', 'Katlar', 'konu', 'u1', 'mat', 2),
  konu('k2', 'Üsler', 'konu', 'u1', 'mat', 1),
  konu('a1', 'Asal', 'alt_konu', 'k1', 'mat', 1),
  konu('u2', 'Cebir', 'unite', null, 'mat', 2),
  konu('f1', 'Hücre', 'unite', null, 'fen', 1),
];

describe('agacKur', () => {
  it('kardeşleri sıraya göre dizer ve derinliği hesaplar', () => {
    const agac = agacKur(KONULAR);
    expect(agac.map((d) => d.konu.id)).toEqual(['f1', 'u1', 'u2']);
    const sayilar = agac.find((d) => d.konu.id === 'u1');
    expect(sayilar?.cocuklar.map((d) => d.konu.id)).toEqual(['k2', 'k1']);
    expect(sayilar?.cocuklar[1]?.cocuklar[0]?.derinlik).toBe(2);
  });

  it('üstü listede olmayan konuyu kök sayar', () => {
    const agac = agacKur([konu('x', 'Yetim', 'konu', 'yok')]);
    expect(agac).toHaveLength(1);
    expect(agac[0]?.derinlik).toBe(0);
  });

  it('döngüsel ata zincirinde sonsuz döngüye girmez', () => {
    const agac = agacKur([konu('a', 'A', 'konu', 'b'), konu('b', 'B', 'konu', 'a')]);
    expect(duzles(agac)).toHaveLength(0);
  });
});

describe('seçim yardımcıları', () => {
  it('altlari: tüm alt konuları verir, kendisini değil', () => {
    expect([...altlari(KONULAR, 'u1')].sort()).toEqual(['a1', 'k1', 'k2']);
  });

  it('uygunUstler: aynı branşta, daha üst seviyede, kendi altı değil', () => {
    const katlar = bul('k1');
    expect(uygunUstler(KONULAR, katlar).map((k) => k.id)).toEqual(['u1', 'u2']);
    const asal = bul('a1');
    // Alt konu bir konunun ya da ünitenin altına alınabilir (şu anki üstü de listelenir).
    expect(uygunUstler(KONULAR, asal).map((k) => k.id)).toEqual(['u1', 'k2', 'u2', 'k1']);
    const sayilar = bul('u1');
    expect(uygunUstler(KONULAR, sayilar)).toEqual([]);
  });

  it('uygunHedefler: aynı branş ve seviye, kendisi hariç', () => {
    const sayilar = bul('u1');
    expect(uygunHedefler(KONULAR, sayilar).map((k) => k.id)).toEqual(['u2']);
  });

  it('bransGrupla: branşa göre gruplar', () => {
    const gruplar = bransGrupla(agacKur(KONULAR));
    expect(gruplar.map(([b]) => b)).toEqual(['fen', 'mat']);
  });
});
