import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  dbYok,
  rastgeleTelefon,
  testDb,
  testServisi,
  type TestServisi,
} from './test/yardimcilar.js';

/** ADR 0009: OTP IP sayaci ve oturum IP'si, istemcinin yazdigi X-Forwarded-For'a degil guvenilen IP'ye dayanir. */
async function otpDogrula(t: TestServisi, remoteAddress: string, xff: string) {
  const telefon = rastgeleTelefon();
  const baslik = { 'x-forwarded-for': xff };
  const gonder = await t.service.app.inject({
    method: 'POST',
    url: '/auth/otp/gonder',
    remoteAddress,
    headers: baslik,
    payload: { telefon },
  });
  expect(gonder.statusCode).toBe(200);
  const dogrula = await t.service.app.inject({
    method: 'POST',
    url: '/auth/otp/dogrula',
    remoteAddress,
    headers: baslik,
    payload: { telefon, kod: t.sms.sonKod(telefon) ?? '' },
  });
  expect(dogrula.statusCode).toBe(200);
  return {
    telefon,
    kullaniciId: dogrula.json<{ kullanici: { id: string } }>().kullanici.id,
  };
}

describe.skipIf(dbYok())('hesap: guvenilir istemci IP si (TRUST_PROXY)', () => {
  const urls = testDb();
  const guvenen = testServisi({ TRUST_PROXY: '127.0.0.1/32' });
  const guvenmeyen = testServisi();
  let sistem: postgres.Sql;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
  });
  afterAll(async () => {
    await guvenen.service.stop();
    await guvenmeyen.service.stop();
    await sistem.end();
  });

  const otpIp = async (telefon: string) =>
    (
      await sistem<{ ip: string }[]>`
      select host(ip) as ip from hesap.otp_istekleri where tanimlayici = ${telefon}`
    )[0]?.ip;
  const oturumIp = async (kullaniciId: string) =>
    (
      await sistem<{ ip: string }[]>`
      select host(ip) as ip from hesap.oturumlar where kullanici_id = ${kullaniciId}`
    )[0]?.ip;

  it('guvenilen proxy: OTP sayaci ve oturum IP si gercek istemci adresidir (sahte sol deger yok sayilir)', async () => {
    const gercek = '203.0.113.' + String(10 + Math.floor(Math.random() * 200));
    const s = await otpDogrula(guvenen, '127.0.0.1', `1.2.3.4, ${gercek}`);
    expect(await otpIp(s.telefon)).toBe(gercek);
    expect(await oturumIp(s.kullaniciId)).toBe(gercek);
  });

  it('guvenilmeyen kaynak: sahte X-Forwarded-For ne OTP sayacina ne oturuma gecer', async () => {
    const s = await otpDogrula(guvenmeyen, '10.9.8.7', '203.0.113.99');
    expect(await otpIp(s.telefon)).toBe('10.9.8.7');
    expect(await oturumIp(s.kullaniciId)).toBe('10.9.8.7');
  });

  it('TRUST_PROXY varken bile guvenilmeyen kaynagin sahte basligi yok sayilir', async () => {
    const s = await otpDogrula(guvenen, '10.9.8.8', '203.0.113.98');
    expect(await otpIp(s.telefon)).toBe('10.9.8.8');
    expect(await oturumIp(s.kullaniciId)).toBe('10.9.8.8');
  });
});
