import {
  BildirimAyarlariSema,
  BildirimKutuIslemYanitiSema,
  BildirimKutuListesiSema,
  BildirimOkunmamisSayisiSema,
  BildirimTercihListesiSema,
  BildirimTumunuOkuYanitiSema,
} from '@kopru/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { bildirimMock, bildirimMockSifirla } from './bildirim-mock';

const K = 'kurum-atlas';
const cagir = (yontem: string, yol: string, govde?: unknown, sorgu: Record<string, string> = {}) =>
  bildirimMock({ yontem, yol, sorgu: new URLSearchParams(sorgu), govde, basliklar: {} });

beforeEach(() => {
  bildirimMockSifirla();
});

describe('bildirim mock', () => {
  it('kutu: imleçli sayfalama sozlesmeye uygun ve eksiksiz doner', () => {
    const ilk = BildirimKutuListesiSema.parse(
      cagir('GET', `kurumlar/${K}/kutu`, undefined, { limit: '10' }).govde,
    );
    expect(ilk.ogeler).toHaveLength(10);
    expect(ilk.sonraki_imlec).not.toBeNull();
    const toplanan = [...ilk.ogeler];
    let imlec = ilk.sonraki_imlec;
    while (imlec) {
      const s = BildirimKutuListesiSema.parse(
        cagir('GET', `kurumlar/${K}/kutu`, undefined, { limit: '10', imlec }).govde,
      );
      toplanan.push(...s.ogeler);
      imlec = s.sonraki_imlec;
    }
    expect(new Set(toplanan.map((o) => o.id)).size).toBe(toplanan.length);
    expect(toplanan.length).toBeGreaterThan(20);
    // Yeniden eskiye
    const zamanlar = toplanan.map((o) => o.created_at);
    expect([...zamanlar].sort().reverse()).toEqual(zamanlar);
  });

  it('okundu, arsivle, tumunu oku okunmamis sayisini tutarli gunceller', () => {
    const sayi = () =>
      BildirimOkunmamisSayisiSema.parse(cagir('GET', `kurumlar/${K}/kutu/okunmamis-sayisi`).govde)
        .okunmamis;
    expect(sayi()).toBe(3);
    const liste = BildirimKutuListesiSema.parse(
      cagir('GET', `kurumlar/${K}/kutu`, undefined, { okunmamis: 'true' }).govde,
    );
    expect(liste.ogeler).toHaveLength(3);
    const [a, b] = liste.ogeler;
    if (!a || !b) throw new Error('oge yok');
    const okundu = BildirimKutuIslemYanitiSema.parse(
      cagir('POST', `kurumlar/${K}/kutu/${a.id}/okundu`, {}).govde,
    );
    expect(okundu.okundu_at).not.toBeNull();
    expect(sayi()).toBe(2);
    cagir('POST', `kurumlar/${K}/kutu/${b.id}/arsivle`, {});
    expect(sayi()).toBe(1);
    const tumu = BildirimKutuListesiSema.parse(
      cagir('GET', `kurumlar/${K}/kutu`, undefined, { limit: '50' }).govde,
    );
    expect(tumu.ogeler.some((o) => o.id === b.id)).toBe(false);
    expect(
      BildirimTumunuOkuYanitiSema.parse(cagir('POST', `kurumlar/${K}/kutu/tumunu-oku`, {}).govde)
        .guncellenen,
    ).toBe(1);
    expect(sayi()).toBe(0);
    expect(cagir('POST', `kurumlar/${K}/kutu/yok/okundu`, {}).durum).toBe(404);
  });

  it('tercihler: kilitli hucre 400, normal hucre guncellenir', () => {
    const kilitli = cagir('PUT', `kurumlar/${K}/tercihler`, {
      tercihler: [{ kategori: 'sistem', kanal: 'push', acik: false }],
    });
    expect(kilitli.durum).toBe(400);
    expect(JSON.stringify(kilitli.govde)).toContain('tercih_kilitli');
    expect(
      cagir('PUT', `kurumlar/${K}/tercihler`, {
        tercihler: [{ kategori: 'odev', kanal: 'kutu', acik: false }],
      }).durum,
    ).toBe(400);
    const y = BildirimTercihListesiSema.parse(
      cagir('PUT', `kurumlar/${K}/tercihler`, {
        tercihler: [{ kategori: 'soru', kanal: 'push', acik: false }],
      }).govde,
    );
    expect(y.tercihler).toHaveLength(40);
    expect(y.tercihler.find((t) => t.kategori === 'soru' && t.kanal === 'push')?.acik).toBe(false);
    expect(y.tercihler.find((t) => t.kategori === 'odev' && t.kanal === 'push')?.acik).toBe(true);
  });

  it('ayarlar: kismi guncelleme, esit saat ve gecersiz hatirlatma 400', () => {
    const y = BildirimAyarlariSema.parse(
      cagir('PUT', `kurumlar/${K}/ayarlar`, {
        sessiz_baslangic: '23:00',
        sessiz_bitis: '07:00',
        ders_hatirlatma_dk: 30,
      }).govde,
    );
    expect(y).toMatchObject({ sessiz_baslangic: '23:00', ders_hatirlatma_dk: 30 });
    expect(
      BildirimAyarlariSema.parse(cagir('PUT', `kurumlar/${K}/ayarlar`, { sessiz_gunler: [] }).govde)
        .sessiz_gunler,
    ).toEqual([]);
    expect(
      cagir('PUT', `kurumlar/${K}/ayarlar`, { sessiz_baslangic: '10:00', sessiz_bitis: '10:00' })
        .durum,
    ).toBe(400);
    expect(cagir('PUT', `kurumlar/${K}/ayarlar`, { ders_hatirlatma_dk: 45 }).durum).toBe(400);
    expect(cagir('PUT', `kurumlar/${K}/ayarlar`, { sessiz_baslangic: '10:00' }).durum).toBe(400);
  });
});
