import { gecDakikaGecerliMi, yoklamaSatirlariKur } from './yoklamaSatirlari';

const AN = new Date('2026-11-09T09:15:30.000Z');

describe('yoklamaSatirlariKur', () => {
  it('tum satirlar ayni dokunma anini tasir; not bossa gonderilmez', () => {
    const s = yoklamaSatirlariKur(
      { a: { durum: 'geldi' }, b: { durum: 'gelmedi' } },
      { not: '  ', gorunurluk: 'ogretmene_ozel', an: AN },
    );
    expect(s).toEqual({
      ok: true,
      satirlar: [
        { ogrenciId: 'a', durum: 'geldi', isaretlenmeAt: AN.toISOString() },
        { ogrenciId: 'b', durum: 'gelmedi', isaretlenmeAt: AN.toISOString() },
      ],
    });
  });

  it('not ve gorunurluk birlikte yazilir; gec icin dakika sayiya cevrilir', () => {
    const s = yoklamaSatirlariKur(
      { a: { durum: 'gec', gecDakika: '10' } },
      { not: ' Ödev eksik ', gorunurluk: 'ogrenciye', an: AN },
    );
    expect(s).toEqual({
      ok: true,
      satirlar: [
        {
          ogrenciId: 'a',
          durum: 'gec',
          gecDakika: 10,
          not: 'Ödev eksik',
          notGorunurluk: 'ogrenciye',
          isaretlenmeAt: AN.toISOString(),
        },
      ],
    });
  });

  it('gec icin dakika yoksa ya da aralik disiysa hatali ogrenci doner', () => {
    expect(
      yoklamaSatirlariKur(
        { a: { durum: 'gec' }, b: { durum: 'gec', gecDakika: '999' }, c: { durum: 'geldi' } },
        { not: '', gorunurluk: 'ogretmene_ozel', an: AN },
      ),
    ).toEqual({ ok: false, hataliOgrenciIdleri: ['a', 'b'] });
    expect(gecDakikaGecerliMi('240')).toBe(true);
    expect(gecDakikaGecerliMi('0')).toBe(false);
    expect(gecDakikaGecerliMi('1.5')).toBe(false);
  });
});
