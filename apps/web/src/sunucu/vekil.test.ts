import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { dersYoluIzinliMi } from './ders-vekil';
import { finansVekili, finansYoluIzinliMi } from './finans-vekil';
import { yolIzinliMi as hesapYolIzinliMi } from './hesap-vekil';
import { yanitiIlet } from './vekil';

const K = '0190a1b2-0000-7000-8000-000000000001';

describe('izinli yollar', () => {
  it('ders: takvim, seri ve yoklama yollarini gecirir, digerlerini degil', () => {
    expect(dersYoluIzinliMi(['kurumlar', K, 'dersler'])).toBe(true);
    expect(dersYoluIzinliMi(['kurumlar', K, 'dersler', 'x', 'yoklamalar'])).toBe(true);
    expect(dersYoluIzinliMi(['kurumlar', K, 'seriler'])).toBe(true);
    expect(dersYoluIzinliMi(['kurumlar', K, 'yoklama-bekleyen'])).toBe(true);
    expect(dersYoluIzinliMi(['kurumlar', K, 'denetim'])).toBe(false);
    expect(dersYoluIzinliMi(['kurumlar', K, 'dersler', '..', 'x'])).toBe(false);
    expect(dersYoluIzinliMi([])).toBe(false);
  });

  it('finans: kullanima acik uclar', () => {
    for (const son of [
      ['paketler'],
      ['paket-satislari', 'a', 'iptal'],
      ['tahsilatlar'],
      ['ogrenciler', 'o', 'finans'],
      ['ucret-tarifeleri'],
      ['kredi-politikasi'],
      ['ayarlar'],
      ['disa-aktar'],
      ['ozet', 'aylik'],
    ]) {
      expect(finansYoluIzinliMi(['kurumlar', K, ...son])).toBe(true);
    }
    expect(finansYoluIzinliMi(['kurumlar', K, 'ozet'])).toBe(false);
    expect(finansYoluIzinliMi(['kurumlar', K, 'disa-aktar', 'x'])).toBe(false);
    expect(finansYoluIzinliMi(['admin'])).toBe(false);
  });

  it('hesap: kurum bilgisi yalniz GET ile okunur', () => {
    expect(hesapYolIzinliMi(['kurumlar', K], 'GET')).toBe(true);
    expect(hesapYolIzinliMi(['kurumlar', K], 'PATCH')).toBe(false);
    expect(hesapYolIzinliMi(['kurumlar', K, 'gruplar'], 'POST')).toBe(true);
  });
});

describe('ikili iletim', () => {
  it('xlsx govdesini bozmadan content-type ve content-disposition ile iletir', async () => {
    const bayt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80]);
    const yanit = await yanitiIlet(
      new Response(bayt, {
        status: 200,
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': 'attachment; filename="finans-2026-11.xlsx"',
        },
      }),
    );
    expect(yanit.headers.get('content-type')).toContain('spreadsheetml');
    expect(yanit.headers.get('content-disposition')).toContain('finans-2026-11.xlsx');
    expect([...new Uint8Array(await yanit.arrayBuffer())]).toEqual([...bayt]);
  });

  it('JSON ve bos govdeyi metin olarak iletir', async () => {
    const j = await yanitiIlet(
      new Response('{"a":1}', { status: 201, headers: { 'content-type': 'application/json' } }),
    );
    expect(j.status).toBe(201);
    expect(await j.json()).toEqual({ a: 1 });
    expect((await yanitiIlet(new Response(null, { status: 204 }))).status).toBe(204);
  });
});

describe('finans vekili', () => {
  it('Idempotency-Key ve istemci IP basligini api ye iletir; gecersiz anahtari dusurur', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '0');
    const anahtar = '0190a1b2-1111-4222-8333-444455556666';
    const istek = (key: string) =>
      new NextRequest('http://localhost/api/finans/kurumlar/k/tahsilatlar', {
        method: 'POST',
        headers: { authorization: 'Bearer tok', 'idempotency-key': key, host: 'localhost' },
        body: '{"a":1}',
      });
    await finansVekili(istek(anahtar), ['kurumlar', K, 'tahsilatlar']);
    const [adres, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(adres).toContain(`/v1/finans/kurumlar/${K}/tahsilatlar`);
    expect(init.headers['idempotency-key']).toBe(anahtar);
    expect(init.headers.authorization).toBe('Bearer tok');

    await finansVekili(istek('gecersiz'), ['kurumlar', K, 'tahsilatlar']);
    const [, init2] = fetchMock.mock.calls[1] as [string, { headers: Record<string, string> }];
    expect(init2.headers['idempotency-key']).toBeUndefined();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('yetkisiz ve izinsiz yolu reddeder', async () => {
    const yetkisiz = await finansVekili(new NextRequest('http://localhost/x', { method: 'GET' }), [
      'kurumlar',
      K,
      'paketler',
    ]);
    expect(yetkisiz.status).toBe(401);
    const yok = await finansVekili(
      new NextRequest('http://localhost/x', {
        method: 'GET',
        headers: { authorization: 'Bearer t' },
      }),
      ['kurumlar', K, 'baska'],
    );
    expect(yok.status).toBe(404);
  });
});
