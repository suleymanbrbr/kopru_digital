import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ogrenmeMock } from './ogrenme-mock';
import { ogrenmeVekili, ogrenmeYoluIzinliMi } from './ogrenme-vekil';
import { xlsxOku, xlsxYaz } from './xlsx-mini';

const K = 'kurum-ege';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('ogrenme izinli yollar', () => {
  it('mufredat, odev, plan ve deneme uclarini gecirir', () => {
    const uclar = [
      ['kataloglar'],
      ['konular'],
      ['konular', 'x', 'arsivle'],
      ['mufredat-atamalari'],
      ['odevler'],
      ['odevler', 'o', 'atama-esitle'],
      ['odevler', 'o', 'ozet'],
      ['odevlerim'],
      ['ogrenci-odevleri', 'r', 'teslim'],
      ['odev-sablonlari', 's'],
      ['planlar', 'toplu'],
      ['planlar', 'p', 'kopyala'],
      ['plan-sablonlari', 's', 'uygula'],
      ['planim'],
      ['gorevlerim'],
      ['gorevler', 'g', 'gerceklesen'],
      ['ogrenciler', 'o', 'plan'],
      ['ogrenciler', 'o', 'deneme-gelisim'],
      ['denemeler'],
      ['denemeler', 'toplu'],
      ['denemeler', 'sablon.xlsx'],
      ['denemeler', 'excel'],
      ['denemeler', 'd', 'onay'],
      ['denemelerim'],
      ['deneme-kurallari'],
      ['deneme-ayarlari'],
      ['gruplar', 'g', 'deneme-ozet'],
    ];
    for (const son of uclar) {
      expect(ogrenmeYoluIzinliMi(['kurumlar', K, ...son]), son.join('/')).toBe(true);
    }
  });

  it('izinsiz yollari ve yol gezmeyi reddeder', () => {
    for (const parcalar of [
      [],
      ['kurumlar', K],
      ['kurumlar', K, 'denetim'],
      ['kurumlar', K, 'ogrenciler', 'o', 'finans'],
      ['kurumlar', K, 'denemeler', '..', 'x'],
      ['kurumlar', K, 'denemeler', 'sablon.xlsx.exe.js'],
      ['admin'],
    ]) {
      expect(ogrenmeYoluIzinliMi(parcalar), parcalar.join('/')).toBe(false);
    }
  });
});

describe('ogrenme vekili', () => {
  const istek = (yol: string, ek: ConstructorParameters<typeof NextRequest>[1] = {}) =>
    new NextRequest(`http://localhost/api/ogrenme/${yol}`, {
      headers: { authorization: 'Bearer tok', host: 'localhost' },
      ...ek,
    });

  it('yetkisiz istegi 401, izinsiz yolu 404 ile reddeder', async () => {
    const yetkisiz = await ogrenmeVekili(new NextRequest('http://localhost/x', { method: 'GET' }), [
      'kurumlar',
      K,
      'odevler',
    ]);
    expect(yetkisiz.status).toBe(401);
    const yok = await ogrenmeVekili(istek('x'), ['kurumlar', K, 'baska']);
    expect(yok.status).toBe(404);
  });

  it('.xlsx yuklemeyi ikili govde ve ilk content-type ile api ye iletir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '0');
    const tur = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const bayt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80]);
    await ogrenmeVekili(
      istek('x', {
        method: 'POST',
        headers: { authorization: 'Bearer tok', 'content-type': tur, host: 'localhost' },
        body: bayt,
      }),
      ['kurumlar', K, 'denemeler', 'excel'],
    );
    const [adres, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: Uint8Array },
    ];
    expect(adres).toContain(`/v1/ogrenme/kurumlar/${K}/denemeler/excel`);
    expect(init.headers['content-type']).toBe(tur);
    expect(init.headers.authorization).toBe('Bearer tok');
    expect([...new Uint8Array(init.body)]).toEqual([...bayt]);
  });

  it('JSON govdeyi application/json ile iletir; xlsx indirmesini content-disposition ile geri verir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0x50, 0x4b]), {
          status: 200,
          headers: {
            'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'content-disposition': 'attachment; filename="sablon.xlsx"',
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '0');
    await ogrenmeVekili(
      istek('x', {
        method: 'POST',
        headers: {
          authorization: 'Bearer tok',
          'content-type': 'application/json',
          host: 'localhost',
        },
        body: '{"a":1}',
      }),
      ['kurumlar', K, 'odevler'],
    );
    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');

    const indirme = await ogrenmeVekili(istek('x'), ['kurumlar', K, 'denemeler', 'sablon.xlsx']);
    expect(indirme.headers.get('content-type')).toContain('spreadsheetml');
    expect(indirme.headers.get('content-disposition')).toContain('sablon.xlsx');
    expect([...new Uint8Array(await indirme.arrayBuffer())]).toEqual([0x50, 0x4b]);
  });
});

describe('ogrenme mock', () => {
  const mock = (yontem: string, yol: string, ek: Record<string, unknown> = {}) =>
    ogrenmeMock({
      yontem,
      yol: `kurumlar/${K}/${yol}`,
      sorgu: new URLSearchParams((ek.sorgu as string | undefined) ?? ''),
      govde: ek.govde,
      basliklar: {},
      ...(ek.ikili ? { ikili: ek.ikili as Uint8Array } : {}),
    });

  it('Excel sablonu PK ile baslar ve yazilan xlsx geri okunur', () => {
    const yanit = mock('GET', 'denemeler/sablon.xlsx', { sorgu: 'kural=tyt' });
    expect(yanit.ikili).toBeDefined();
    const bayt = yanit.ikili?.bayt ?? new Uint8Array();
    expect(String.fromCharCode(bayt[0] ?? 0, bayt[1] ?? 0)).toBe('PK');
    const satirlar = xlsxOku(bayt);
    expect(satirlar?.[0]).toContain('turkce_dogru');
    expect(
      xlsxOku(
        xlsxYaz([
          ['a', 1],
          ['b', null, 'c & d'],
        ]),
      ),
    ).toEqual([
      ['a', 1],
      ['b', null, 'c & d'],
    ]);
    expect(xlsxOku(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('Excel yukleme: puansiz satir atlanir, hatali satir tum yuklemeyi reddeder', () => {
    const sablon =
      xlsxOku(
        mock('GET', 'denemeler/sablon.xlsx', { sorgu: 'kural=tyt' }).ikili?.bayt ??
          new Uint8Array(),
      ) ?? [];
    const baslik = sablon[0] ?? [];
    const dogruSutun = baslik.indexOf('turkce_dogru');
    const sorgu = 'kural=tyt&ad=Mock+Excel&sinav_tarihi=2026-11-01';
    // Hicbir puan girilmemis: hepsi atlanir.
    const bos = mock('POST', 'denemeler/excel', { sorgu, ikili: xlsxYaz(sablon) });
    expect(bos.durum).toBe(201);
    expect((bos.govde as { olusturulan_sayisi: number }).olusturulan_sayisi).toBe(0);
    // Bir satirda 41 dogru (40 soruluk bolum): satir hatasi.
    const hatali = sablon.map((s, i) =>
      i === 1 ? baslik.map((_, c) => (c === dogruSutun ? 41 : (s[c] ?? null))) : s,
    );
    const yanit = mock('POST', 'denemeler/excel', { sorgu, ikili: xlsxYaz(hatali) });
    expect(yanit.durum).toBe(422);
    const hatalar = (yanit.govde as { error: { details: { hatalar: { satir: number }[] } } }).error
      .details.hatalar;
    expect(hatalar[0]?.satir).toBe(2);
    // Gecersiz dosya.
    expect(mock('POST', 'denemeler/excel', { sorgu, ikili: new Uint8Array([1, 2, 3]) }).durum).toBe(
      422,
    );
  });
});
