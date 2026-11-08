import { BellekIptalDeposu } from '@kopru/service-kit';
import { afterAll, describe, expect, it } from 'vitest';

import { buildService } from './app.js';
import { loadServiceEnv } from './config.js';
import { YakalayanEpostaGonderici, YakalayanSmsGonderici } from './modules/hesap/index.js';
import { bearer, dbYok, otpIleGiris, testDb, tokenAl } from './test/yardimcilar.js';

describe.skipIf(dbYok())('guvenlik: sid iptal listesi ve e-posta dogrulama', () => {
  const urls = testDb();
  if (!urls) throw new Error('testDb yok');
  const sms = new YakalayanSmsGonderici();
  const eposta = new YakalayanEpostaGonderici();
  const service = buildService(
    loadServiceEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: urls.appUrl,
      DATABASE_SISTEM_URL: urls.sistemUrl,
      PUBLIC_URL: 'http://api.test',
    }),
    { sms, eposta },
  );
  const t = { service, sms };
  const { app } = service;
  afterAll(() => service.stop());

  const uyeliklerim = (token: string) =>
    app.inject({ url: '/v1/hesap/ben', headers: bearer(token) });

  it('cikis sonrasi ayni erisim belirteci hemen 401; baska oturumun belirteci etkilenmez', async () => {
    const a = await otpIleGiris(t);
    const b = await otpIleGiris(t);
    const ta = (await tokenAl(t, a.oturum)).accessToken;
    const ta2 = (await tokenAl(t, a.oturum)).accessToken; // ayni oturum, ikinci belirtec
    const tb = (await tokenAl(t, b.oturum)).accessToken;
    expect((await uyeliklerim(ta)).statusCode).toBe(200);

    const cikis = await app.inject({
      method: 'POST',
      url: '/auth/cikis',
      headers: bearer(a.oturum),
    });
    expect(cikis.statusCode).toBe(200);

    expect((await uyeliklerim(ta)).statusCode).toBe(401);
    expect((await uyeliklerim(ta2)).statusCode).toBe(401); // ayni sid'li tum belirtecler
    expect((await uyeliklerim(tb)).statusCode).toBe(200); // baska oturum etkilenmez
  });

  it('iptal listesi bellekte TTL ile temizlenir (sonsuza buyumez)', () => {
    expect(app.iptal).toBeInstanceOf(BellekIptalDeposu);
    // kayit omru ve temizligi service-kit testlerinde (iptal.test.ts) zaman kaydirilarak sinanir
    expect((app.iptal as BellekIptalDeposu).boyut).toBeGreaterThanOrEqual(1);
  });

  it('e-posta kaydi dogrulama e-postasi yollar; baglantidaki belirtec adresi dogrular', async () => {
    const adres = `dogrula${String(Date.now())}@example.com`;
    const kayit = await app.inject({
      method: 'POST',
      url: '/auth/eposta/kayit',
      payload: { eposta: adres, parola: 'cok-gizli-parola' },
    });
    expect(kayit.statusCode).toBe(200);
    const oturum = kayit.json<{ oturum_belirteci: string }>().oturum_belirteci;
    const token = (await tokenAl(t, oturum)).accessToken;

    const once = await app.inject({ url: '/v1/hesap/ben', headers: bearer(token) });
    expect(once.statusCode, once.body).toBe(200);
    expect(
      once.json<{ kullanici: { eposta_dogrulandi: boolean } }>().kullanici.eposta_dogrulandi,
    ).toBe(false);

    const mesaj = eposta.mesajlar.findLast((m) => m.alici === adres);
    expect(mesaj?.konu).toMatch(/doğrulayın/);
    const baglanti = /http:\/\/api\.test\/auth\/eposta\/dogrula\?belirtec=[^\s]+/.exec(
      mesaj?.metin ?? '',
    )?.[0];
    expect(baglanti).toBeDefined();

    const kotu = await app.inject({ url: '/auth/eposta/dogrula?belirtec=gecersiz-belirtec-xyz' });
    expect(kotu.statusCode).toBe(400);

    const dogrula = await app.inject({
      url: new URL(baglanti ?? '').pathname + new URL(baglanti ?? '').search,
    });
    expect(dogrula.statusCode).toBe(200);
    expect(dogrula.json<{ dogrulandi: boolean }>().dogrulandi).toBe(true);

    const sonra = await app.inject({ url: '/v1/hesap/ben', headers: bearer(token) });
    expect(
      sonra.json<{ kullanici: { eposta_dogrulandi: boolean } }>().kullanici.eposta_dogrulandi,
    ).toBe(true);
  });

  it('dogrulama yeniden gonder: kayitsiz adres de 200 doner (ifsa yok), kayitliya yeni e-posta gider', async () => {
    const adres = `yeniden${String(Date.now())}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/auth/eposta/kayit',
      payload: { eposta: adres, parola: 'cok-gizli-parola' },
    });
    const onceki = eposta.mesajlar.filter((m) => m.alici === adres).length;
    const yanit = await app.inject({
      method: 'POST',
      url: '/auth/eposta/dogrulama-gonder',
      payload: { eposta: adres },
    });
    expect(yanit.statusCode).toBe(200);
    expect(eposta.mesajlar.filter((m) => m.alici === adres).length).toBe(onceki + 1);
    const yok = await app.inject({
      method: 'POST',
      url: '/auth/eposta/dogrulama-gonder',
      payload: { eposta: `yok${String(Date.now())}@example.com` },
    });
    expect(yok.statusCode).toBe(200);
  });

  it('telefon kullanicisinda eposta_dogrulandi false', async () => {
    const g = await otpIleGiris(t);
    const token = (await tokenAl(t, g.oturum)).accessToken;
    const ben = await app.inject({ url: '/v1/hesap/ben', headers: bearer(token) });
    expect(
      ben.json<{ kullanici: { eposta_dogrulandi: boolean } }>().kullanici.eposta_dogrulandi,
    ).toBe(false);
  });
});
