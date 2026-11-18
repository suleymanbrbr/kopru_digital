import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { expoSaglayici } from './expo.js';
import { logSaglayici } from './log.js';
import { belirtecMaskele, type PushMesaji } from './saglayici.js';

const mesaj = (i: number, ek: Partial<PushMesaji> = {}): PushMesaji => ({
  gonderimId: `g${String(i)}`,
  belirtec: `ExponentPushToken[tok${String(i)}]`,
  platform: 'android',
  title: 'Başlık',
  body: 'Gövde',
  data: { derin_baglanti: 'kopru://soru/1', bildirim_id: 'b1', kurum_id: 'k1' },
  ...ek,
});

interface Istek {
  yontem: string;
  url: string;
  basliklar: IncomingMessage['headers'];
  govde: unknown;
}

describe("expo saglayicisi (sahte HTTP sunucusu; gercek Expo'ya istek atilmaz)", () => {
  let sunucu: Server;
  let url = '';
  let istekler: Istek[] = [];
  let yanit: (istek: Istek, res: ServerResponse) => void | Promise<void>;
  const tamam = (res: ServerResponse, govde: unknown, durum = 200) => {
    res.writeHead(durum, { 'content-type': 'application/json' });
    res.end(JSON.stringify(govde));
  };

  beforeAll(async () => {
    sunucu = createServer((req, res) => {
      const parcalar: Buffer[] = [];
      req.on('data', (p: Buffer) => parcalar.push(p));
      req.on('end', () => {
        const ham = Buffer.concat(parcalar).toString('utf8');
        const istek: Istek = {
          yontem: req.method ?? '',
          url: req.url ?? '',
          basliklar: req.headers,
          govde: ham ? (JSON.parse(ham) as unknown) : undefined,
        };
        istekler.push(istek);
        void yanit(istek, res);
      });
    });
    await new Promise<void>((r) => sunucu.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${String((sunucu.address() as AddressInfo).port)}/--/api/v2/push/send`;
  });
  afterAll(async () => {
    sunucu.closeAllConnections();
    await new Promise<void>((r) =>
      sunucu.close(() => {
        r();
      }),
    );
  });
  beforeEach(() => {
    istekler = [];
    yanit = (istek, res) => {
      const liste = istek.govde as unknown[];
      tamam(res, { data: liste.map((_, i) => ({ status: 'ok', id: `bilet-${String(i)}` })) });
    };
  });

  it('istek bicimi: POST, JSON dizi, title/body/data/sound, iOS icin badge; erisim belirteci yoksa Authorization yok', async () => {
    const s = expoSaglayici({ url });
    const sonuc = await s.gonder([mesaj(1), mesaj(2, { platform: 'ios', badge: 3 })]);
    expect(sonuc).toEqual([
      { tur: 'gonderildi', mesajId: 'bilet-0' },
      { tur: 'gonderildi', mesajId: 'bilet-1' },
    ]);
    expect(istekler).toHaveLength(1);
    const [i] = istekler;
    expect(i?.yontem).toBe('POST');
    expect(i?.url).toBe('/--/api/v2/push/send');
    expect(i?.basliklar['content-type']).toBe('application/json');
    expect(i?.basliklar.authorization).toBeUndefined();
    expect(i?.govde).toEqual([
      {
        to: 'ExponentPushToken[tok1]',
        title: 'Başlık',
        body: 'Gövde',
        data: { derin_baglanti: 'kopru://soru/1', bildirim_id: 'b1', kurum_id: 'k1' },
        sound: 'default',
        priority: 'high',
      },
      {
        to: 'ExponentPushToken[tok2]',
        title: 'Başlık',
        body: 'Gövde',
        data: { derin_baglanti: 'kopru://soru/1', bildirim_id: 'b1', kurum_id: 'k1' },
        sound: 'default',
        priority: 'high',
        badge: 3,
      },
    ]);
    expect(s.ad).toBe('expo');
  });

  it('erisim belirteci verilirse Bearer olarak gonderilir', async () => {
    await expoSaglayici({ url, erisimBelirteci: 'gizli' }).gonder([mesaj(1)]);
    expect(istekler[0]?.basliklar.authorization).toBe('Bearer gizli');
  });

  it("100'luk paketler: 250 mesaj -> 3 istek, sonuclar sirayla eslenir", async () => {
    const mesajlar = Array.from({ length: 250 }, (_, i) => mesaj(i));
    const sonuc = await expoSaglayici({ url }).gonder(mesajlar);
    expect(istekler.map((i) => (i.govde as unknown[]).length)).toEqual([100, 100, 50]);
    expect(sonuc).toHaveLength(250);
    expect(sonuc.every((s) => s.tur === 'gonderildi')).toBe(true);
  });

  it('bilet hatalari: DeviceNotRegistered kalici+cihaz gecersiz, hiz siniri gecici, digerleri kalici', async () => {
    yanit = (_i, res) => {
      tamam(res, {
        data: [
          { status: 'ok', id: 'a' },
          { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } },
          { status: 'error', message: 'x', details: { error: 'MessageRateExceeded' } },
          { status: 'error', message: 'x', details: { error: 'MessageTooBig' } },
          { status: 'error', message: 'detay yok' },
        ],
      });
    };
    const sonuc = await expoSaglayici({ url }).gonder([1, 2, 3, 4, 5].map((i) => mesaj(i)));
    expect(sonuc).toEqual([
      { tur: 'gonderildi', mesajId: 'a' },
      { tur: 'kalici', kod: 'DeviceNotRegistered', cihazGecersiz: true },
      { tur: 'gecici', kod: 'MessageRateExceeded' },
      { tur: 'kalici', kod: 'MessageTooBig', cihazGecersiz: false },
      { tur: 'kalici', kod: 'expo_hata', cihazGecersiz: false },
    ]);
  });

  it('HTTP 5xx / 429 tum paket icin gecici hata', async () => {
    yanit = (_i, res) => {
      tamam(res, { errors: [] }, 503);
    };
    expect(await expoSaglayici({ url }).gonder([mesaj(1), mesaj(2)])).toEqual([
      { tur: 'gecici', kod: 'http_503' },
      { tur: 'gecici', kod: 'http_503' },
    ]);
    yanit = (_i, res) => {
      tamam(res, {}, 429);
    };
    expect(await expoSaglayici({ url }).gonder([mesaj(1)])).toEqual([
      { tur: 'gecici', kod: 'http_429' },
    ]);
  });

  it('gecersiz govde ya da eksik bilet sayisi gecici hata', async () => {
    yanit = (_i, res) => {
      res.writeHead(200);
      res.end('json degil');
    };
    expect(await expoSaglayici({ url }).gonder([mesaj(1)])).toEqual([
      { tur: 'gecici', kod: 'yanit_gecersiz' },
    ]);
    yanit = (_i, res) => {
      tamam(res, { data: [] });
    };
    expect(await expoSaglayici({ url }).gonder([mesaj(1)])).toEqual([
      { tur: 'gecici', kod: 'yanit_uyumsuz' },
    ]);
  });

  it('zaman asimi ve baglanti hatasi gecici hata; firlatmaz', async () => {
    yanit = () => undefined; // hic yanit vermez
    expect(await expoSaglayici({ url, zamanAsimiMs: 100 }).gonder([mesaj(1)])).toEqual([
      { tur: 'gecici', kod: 'zaman_asimi' },
    ]);
    expect(
      await expoSaglayici({ url: 'http://127.0.0.1:1/x', zamanAsimiMs: 500 }).gonder([mesaj(1)]),
    ).toEqual([{ tur: 'gecici', kod: 'ag_hatasi' }]);
  });
});

describe('log saglayicisi', () => {
  it('gonderimi yapilandirilmis loga yazar (belirtec maskeli) ve basarili sayar', async () => {
    const info = vi.fn();
    const s = logSaglayici({ info });
    const sonuc = await s.gonder([mesaj(1, { platform: 'ios', badge: 2 })]);
    expect(sonuc).toEqual([{ tur: 'gonderildi', mesajId: 'log-g1' }]);
    expect(info).toHaveBeenCalledTimes(1);
    const [nesne, metin] = info.mock.calls[0] as [Record<string, unknown>, string];
    expect(metin).toBe('push gönderimi (log sağlayıcı)');
    expect(nesne).toMatchObject({
      title: 'Başlık',
      body: 'Gövde',
      badge: 2,
      data: { derin_baglanti: 'kopru://soru/1', bildirim_id: 'b1', kurum_id: 'k1' },
    });
    expect(JSON.stringify(nesne)).not.toContain('tok1]');
    expect(belirtecMaskele('ExponentPushToken[abcdef]')).toBe('Exponent***ef]');
    expect(s.ad).toBe('log');
  });
});
