import {
  BildirimAyarlariSema,
  BildirimKutuListesiSema,
  BildirimOkunmamisSayisiSema,
  BildirimTercihListesiSema,
} from '@kopru/contracts';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bildirimVekili, bildirimYoluIzinliMi } from './bildirim-vekil';

const K = 'kurum-atlas';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('bildirim izinli yollar', () => {
  it('cihaz, gelen kutusu, tercih ve ayar uclarini gecirir', () => {
    const uclar: [string[], string][] = [
      [['cihazlar'], 'PUT'],
      [['cihazlar', 'c1'], 'DELETE'],
      [['kurumlar', K, 'kutu'], 'GET'],
      [['kurumlar', K, 'kutu', 'okunmamis-sayisi'], 'GET'],
      [['kurumlar', K, 'kutu', 'tumunu-oku'], 'POST'],
      [['kurumlar', K, 'kutu', 'b1', 'okundu'], 'POST'],
      [['kurumlar', K, 'kutu', 'b1', 'arsivle'], 'POST'],
      [['kurumlar', K, 'tercihler'], 'PUT'],
      [['kurumlar', K, 'ayarlar'], 'GET'],
      [['kurumlar', K, 'duyurular'], 'GET'],
      [['kurumlar', K, 'duyurular'], 'POST'],
      [['kurumlar', K, 'duyurular', 'yonetim'], 'GET'],
      [['kurumlar', K, 'duyurular', 'd1'], 'GET'],
      [['kurumlar', K, 'duyurular', 'd1'], 'PATCH'],
      [['kurumlar', K, 'duyurular', 'd1'], 'DELETE'],
      [['kurumlar', K, 'duyurular', 'd1', 'yayinla'], 'POST'],
      [['kurumlar', K, 'duyurular', 'd1', 'arsivle'], 'POST'],
      [['kurumlar', K, 'duyurular', 'd1', 'okundu'], 'POST'],
      [['kurumlar', K, 'duyurular', 'd1', 'okuyanlar'], 'GET'],
    ];
    for (const [parcalar, yontem] of uclar) {
      expect(bildirimYoluIzinliMi(parcalar, yontem), parcalar.join('/')).toBe(true);
    }
  });

  it('izinsiz yollari, yol gezmeyi ve fazladan parcalari reddeder', () => {
    for (const parcalar of [
      [],
      ['kurumlar', K],
      ['kurumlar', K, 'kutu', 'b1'],
      ['kurumlar', K, 'kutu', 'b1', 'sil'],
      ['kurumlar', K, 'kutu', 'b1', 'okundu', 'x'],
      ['cihazlar', 'c1', 'x'],
      ['kurumlar', K, 'duyurular', 'd1', 'sil'],
      ['kurumlar', K, 'duyurular', 'd1', 'okundu', 'x'],
      ['kurumlar', K, 'duyurular', 'yonetim', 'x'],
      ['kurumlar', K, 'duyurular', '..'],
      ['kurumlar', K, 'tercihler', 'x'],
      ['kurumlar', K, '..', 'ayarlar'],
      ['ic', 'sms'],
    ]) {
      expect(bildirimYoluIzinliMi(parcalar), parcalar.join('/')).toBe(false);
    }
  });
});

describe('bildirim vekili', () => {
  const istek = (yol: string, ek: ConstructorParameters<typeof NextRequest>[1] = {}) =>
    new NextRequest(`http://localhost/api/bildirim/${yol}`, {
      headers: { authorization: 'Bearer tok', host: 'localhost' },
      ...ek,
    });

  it('yetkisiz istegi 401, izinsiz yolu 404 ile reddeder', async () => {
    const yetkisiz = await bildirimVekili(
      new NextRequest('http://localhost/x', { method: 'GET' }),
      ['kurumlar', K, 'kutu'],
    );
    expect(yetkisiz.status).toBe(401);
    expect((await bildirimVekili(istek('x'), ['kurumlar', K, 'baska'])).status).toBe(404);
  });

  it('gercek modda BILDIRIM_URL ye /v1/bildirim/<yol> olarak iletir (sorgu ve Bearer korunur)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '0');
    vi.stubEnv('BILDIRIM_URL', 'http://bildirim.test:4002');
    await bildirimVekili(istek('x?okunmamis=true&limit=5'), ['kurumlar', K, 'kutu']);
    const [adres, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(adres).toBe(
      `http://bildirim.test:4002/v1/bildirim/kurumlar/${K}/kutu?okunmamis=true&limit=5`,
    );
    expect(init.headers.authorization).toBe('Bearer tok');
  });

  it('govdesiz POST icin {} gonderir; DELETE govdesiz iletilir; servis yoksa 502', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '0');
    await bildirimVekili(istek('x', { method: 'POST' }), ['kurumlar', K, 'kutu', 'tumunu-oku']);
    expect((fetchMock.mock.calls[0] as [string, { body: string }])[1].body).toBe('{}');
    await bildirimVekili(istek('x', { method: 'DELETE' }), ['cihazlar', 'c1']);
    expect(
      (fetchMock.mock.calls[1] as [string, { headers: Record<string, string> }])[1].headers[
        'content-type'
      ],
    ).toBeUndefined();
    fetchMock.mockRejectedValue(new Error('ag'));
    expect((await bildirimVekili(istek('x'), ['kurumlar', K, 'kutu'])).status).toBe(502);
  });

  it('PATCH govdesiyle, DELETE govdesiz; govdesiz duyuru POST (yayinla) {} ile iletilir', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '0');
    await bildirimVekili(
      istek('x', {
        method: 'PATCH',
        body: JSON.stringify({ sabit: true }),
        headers: {
          authorization: 'Bearer tok',
          host: 'localhost',
          'content-type': 'application/json',
        },
      }),
      ['kurumlar', K, 'duyurular', 'd1'],
    );
    const [adres, patch] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(adres).toBe(`http://localhost:4002/v1/bildirim/kurumlar/${K}/duyurular/d1`);
    expect(patch).toMatchObject({ method: 'PATCH', body: '{"sabit":true}' });
    await bildirimVekili(istek('x', { method: 'DELETE' }), ['kurumlar', K, 'duyurular', 'd1']);
    const silme = fetchMock.mock.calls[1] as [string, { method: string; body?: string }];
    expect(silme[1].method).toBe('DELETE');
    expect(silme[1].body).toBeUndefined();
    await bildirimVekili(istek('x', { method: 'POST' }), [
      'kurumlar',
      K,
      'duyurular',
      'd1',
      'yayinla',
    ]);
    expect((fetchMock.mock.calls[2] as [string, { body: string }])[1].body).toBe('{}');
  });

  it('mock modunda sozlesme semalarina uygun yanitlar doner', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '1');
    const al = async (parcalar: string[]) =>
      (await bildirimVekili(istek('x'), parcalar)).json() as Promise<unknown>;
    BildirimKutuListesiSema.parse(await al(['kurumlar', K, 'kutu']));
    BildirimTercihListesiSema.parse(await al(['kurumlar', K, 'tercihler']));
    BildirimAyarlariSema.parse(await al(['kurumlar', K, 'ayarlar']));
    BildirimOkunmamisSayisiSema.parse(await al(['kurumlar', K, 'kutu', 'okunmamis-sayisi']));
  });
});
