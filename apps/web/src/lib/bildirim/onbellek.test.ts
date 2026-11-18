import type { BildirimKutuOgesi } from '@kopru/contracts';
import { describe, expect, it } from 'vitest';

import { ogeleriDegistir, sayiyiDegistir } from './onbellek';

const oge = (id: string, okundu: string | null): BildirimKutuOgesi => ({
  id,
  kategori: 'soru',
  sablon_kodu: 'soru_cevaplandi',
  baslik: id,
  govde: 'g',
  derin_baglanti: null,
  veri: {},
  okundu_at: okundu,
  gecerlilik_bitis_at: null,
  created_at: '2026-11-18T10:00:00.000Z',
});
const Z = '2026-11-18T11:00:00.000Z';
const liste = [oge('a', null), oge('b', '2026-11-18T09:00:00.000Z'), oge('c', null)];

describe('ogeleriDegistir', () => {
  it('okundu: suzgecsiz listede damga, suzgecli listede cikarir; zaten okunanin damgasi korunur', () => {
    const r = ogeleriDegistir(liste, { tur: 'okundu', id: 'a', zaman: Z }, false);
    expect(r.map((o) => o.okundu_at)).toEqual([Z, '2026-11-18T09:00:00.000Z', null]);
    const b = ogeleriDegistir(liste, { tur: 'okundu', id: 'b', zaman: Z }, false);
    expect(b[1]?.okundu_at).toBe('2026-11-18T09:00:00.000Z');
    expect(
      ogeleriDegistir(liste, { tur: 'okundu', id: 'a', zaman: Z }, true).map((o) => o.id),
    ).toEqual(['b', 'c']);
  });

  it('arsivle her listede ogeyi cikarir', () => {
    expect(ogeleriDegistir(liste, { tur: 'arsivle', id: 'c' }, false).map((o) => o.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('tumunu oku: suzgecsizde hepsi okunur, suzgecliyde liste bosalir; girdi degismez', () => {
    const r = ogeleriDegistir(liste, { tur: 'tumunuOku', zaman: Z }, false);
    expect(r.every((o) => o.okundu_at !== null)).toBe(true);
    expect(ogeleriDegistir(liste, { tur: 'tumunuOku', zaman: Z }, true)).toEqual([]);
    expect(liste[0]?.okundu_at).toBeNull();
  });
});

describe('sayiyiDegistir', () => {
  it('okunmamis okununca azalir, 0in altina inmez, tumunu okuyunca 0', () => {
    expect(sayiyiDegistir(3, { tur: 'okundu', id: 'a', zaman: Z }, true)).toBe(2);
    expect(sayiyiDegistir(3, { tur: 'okundu', id: 'b', zaman: Z }, false)).toBe(3);
    expect(sayiyiDegistir(0, { tur: 'arsivle', id: 'a' }, true)).toBe(0);
    expect(sayiyiDegistir(5, { tur: 'tumunuOku', zaman: Z }, false)).toBe(0);
  });
});
