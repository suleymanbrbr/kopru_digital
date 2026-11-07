import { createJwtVerifier } from '@kopru/service-kit';
import { createLocalJWKSet, decodeJwt, type JSONWebKeySet } from 'jose';
import { afterAll, describe, expect, it } from 'vitest';

import {
  bearer,
  dbYok,
  kurumluKullanici,
  otpIleGiris,
  rastgeleTelefon,
  testServisi,
  tokenAl,
  yeniIp,
} from './test/yardimcilar.js';

describe.skipIf(dbYok())('kimlik: OTP, e-posta, JWT/JWKS', () => {
  const t = testServisi();
  afterAll(() => t.service.stop());
  const { app } = t.service;

  it('OTP ile giris: yeni kullanici olusur, ikinci giriste ayni kullanici', async () => {
    const telefon = rastgeleTelefon();
    const ilk = await otpIleGiris(t, telefon);
    const ikinci = await otpIleGiris(t, telefon);
    expect(ikinci.kullaniciId).toBe(ilk.kullaniciId);
    const ben = await app.inject({
      url: '/v1/hesap/ben',
      headers: bearer((await tokenAl(t, ilk.oturum)).accessToken),
    });
    expect(ben.statusCode).toBe(200);
    const govde = ben.json<{
      kullanici: { telefon_e164: string; eposta: string | null };
      onay_gerekli: boolean;
    }>();
    expect(govde.kullanici.telefon_e164).toBe(telefon);
    expect(govde.kullanici.eposta).toBeNull(); // gecici e-posta veritabanina yazilmaz
    expect(govde.onay_gerekli).toBe(true);
  });

  it('telefon bicimleri E.164e normallestirilir; gecersiz telefon 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/gonder',
      remoteAddress: yeniIp(),
      payload: { telefon: '0 (532) 000 11 22' },
    });
    expect(res.statusCode).toBe(200);
    expect(t.sms.sonKod('+905320001122')).toMatch(/^\d{6}$/);
    const kotu = await app.inject({
      method: 'POST',
      url: '/auth/otp/gonder',
      remoteAddress: yeniIp(),
      payload: { telefon: '12345678' },
    });
    expect(kotu.statusCode).toBe(400);
    expect(kotu.json<{ error: { code: string } }>().error.code).toBe('gecersiz_telefon');
  });

  it('yanlis kod reddedilir, 5 hatali denemeden sonra kod gecersizlesir', async () => {
    const telefon = rastgeleTelefon();
    const ip = yeniIp();
    await app.inject({
      method: 'POST',
      url: '/auth/otp/gonder',
      remoteAddress: ip,
      payload: { telefon },
    });
    const dogruKod = t.sms.sonKod(telefon) ?? '';
    const yanlis = dogruKod === '000000' ? '111111' : '000000';
    let son = 0;
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/otp/dogrula',
        remoteAddress: ip,
        payload: { telefon, kod: yanlis },
      });
      son = res.statusCode;
      expect([400, 429]).toContain(res.statusCode);
    }
    expect(son).toBeGreaterThanOrEqual(400);
    const dogru = await app.inject({
      method: 'POST',
      url: '/auth/otp/dogrula',
      remoteAddress: ip,
      payload: { telefon, kod: dogruKod },
    });
    expect(dogru.statusCode).toBeGreaterThanOrEqual(400); // deneme hakki bitti
  });

  it('OTP hiz siniri: ayni telefona saatte 5 istek, 6. istek 429', async () => {
    const telefon = rastgeleTelefon();
    const kodlar: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/otp/gonder',
        remoteAddress: yeniIp(),
        payload: { telefon },
      });
      kodlar.push(res.statusCode);
    }
    expect(kodlar).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it('OTP hiz siniri: ayni IP den saatte 20 istek, 21. istek 429', async () => {
    const ip = yeniIp();
    let reddedilen = 0;
    for (let i = 0; i < 21; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/otp/gonder',
        remoteAddress: ip,
        payload: { telefon: rastgeleTelefon() },
      });
      if (res.statusCode === 429) reddedilen++;
    }
    expect(reddedilen).toBe(1);
  });

  it('JWKS ile dogrulanir: claim seti, 15 dk omur, EdDSA, bozuk token reddedilir', async () => {
    const k = await kurumluKullanici(t, 'bireysel');
    const jwksRes = await app.inject({ url: '/.well-known/jwks.json' });
    expect(jwksRes.statusCode).toBe(200);
    const jwks = jwksRes.json<JSONWebKeySet>();
    expect(jwks.keys.length).toBeGreaterThan(0);
    expect(JSON.stringify(jwks)).not.toMatch(/"d":/); // ozel anahtar sizmaz

    const dogrula = createJwtVerifier({
      keySet: createLocalJWKSet(jwks),
      issuer: 'http://localhost:4000',
      audience: 'kopru',
    });
    const ctx = await dogrula(k.token);
    expect(ctx.kullaniciId).toBe(k.kullaniciId);
    expect(ctx.kurumId).toBe(k.kurumId);
    expect(ctx.uyelikId).toBe(k.uyelikId);
    expect(ctx.roller.sort()).toEqual(['ogretmen', 'sahip']);

    const claims = decodeJwt(k.token);
    expect(Object.keys(claims).sort()).toEqual(
      [
        'aud',
        'exp',
        'iat',
        'iss',
        'jti',
        'kurum_id',
        'pv',
        'rol',
        'roller',
        'sid',
        'sub',
        'uyelik_id',
      ].sort(),
    );
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(900);
    await expect(dogrula(`${k.token.slice(0, -4)}AAAA`)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('kurum degistirme: ayni oturumla farkli kurumlar icin ayri belirtec; yabanci kurum 403', async () => {
    const a = await kurumluKullanici(t, 'kurum', 'A Kurumu');
    const b = await kurumluKullanici(t, 'ekip', 'B Kurumu');
    const bTok = await tokenAl(t, a.oturum, { kurum_id: b.kurumId }).catch((e: unknown) => e);
    expect(String(bTok)).toContain('"code":"yasak"');
    const ikinciKurum = await app.inject({
      method: 'POST',
      url: '/v1/hesap/kurumlar',
      headers: bearer(a.token),
      payload: { ad: 'A nin ikinci kurumu', tur: 'ekip' },
    });
    const ikinciId = ikinciKurum.json<{ kurum: { id: string } }>().kurum.id;
    const gecis = await tokenAl(t, a.oturum, { kurum_id: ikinciId });
    expect(gecis.govde.kurum_id).toBe(ikinciId);
    expect(gecis.govde.uyelikler.map((u) => u.kurum_id).sort()).toEqual(
      [a.kurumId, ikinciId].sort(),
    );
    // eski belirtec hala kendi kurumu icin gecerli
    const eski = await app.inject({
      url: `/v1/hesap/kurumlar/${a.kurumId}`,
      headers: bearer(a.token),
    });
    expect(eski.statusCode).toBe(200);
  });

  it('oturum belirteci olmadan /auth/token 401; erisim belirteci olmadan korumali uc nokta 401', async () => {
    expect((await app.inject({ method: 'POST', url: '/auth/token', payload: {} })).statusCode).toBe(
      401,
    );
    expect((await app.inject({ url: '/v1/hesap/ben' })).statusCode).toBe(401);
  });

  it('e-posta + parola: kayit, giris, yanlis parola 401, ayni e-posta 409', async () => {
    const eposta = `kisi${String(Date.now())}@example.com`;
    const kayit = await app.inject({
      method: 'POST',
      url: '/auth/eposta/kayit',
      payload: { eposta, parola: 'cok-gizli-parola', gorunen_ad: 'Ayşe Yılmaz' },
    });
    expect(kayit.statusCode).toBe(200);
    expect(kayit.json<{ kullanici: { gorunen_ad: string } }>().kullanici.gorunen_ad).toBe(
      'Ayşe Yılmaz',
    );
    const giris = await app.inject({
      method: 'POST',
      url: '/auth/eposta/giris',
      payload: { eposta, parola: 'cok-gizli-parola' },
    });
    expect(giris.statusCode).toBe(200);
    const kotu = await app.inject({
      method: 'POST',
      url: '/auth/eposta/giris',
      payload: { eposta, parola: 'yanlis-parola-1' },
    });
    expect(kotu.statusCode).toBe(401);
    const tekrar = await app.inject({
      method: 'POST',
      url: '/auth/eposta/kayit',
      payload: { eposta, parola: 'cok-gizli-parola' },
    });
    expect(tekrar.statusCode).toBe(409);
  });

  it('cikis sonrasi oturum belirteci ile token alinamaz', async () => {
    const g = await otpIleGiris(t);
    const cikis = await app.inject({
      method: 'POST',
      url: '/auth/cikis',
      headers: bearer(g.oturum),
    });
    expect(cikis.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/token',
          headers: bearer(g.oturum),
          payload: {},
        })
      ).statusCode,
    ).toBe(401);
  });
});
