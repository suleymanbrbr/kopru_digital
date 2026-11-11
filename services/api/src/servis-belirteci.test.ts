import {
  createJwtVerifier,
  createServisJwtVerifier,
  SERVIS_BELIRTECI_OMRU_SN,
} from '@kopru/service-kit';
import { createLocalJWKSet, decodeJwt, type JSONWebKeySet } from 'jose';
import { afterAll, describe, expect, it } from 'vitest';

import { servisBelirteciUret } from './modules/hesap/index.js';
import { dbYok, testServisi } from './test/yardimcilar.js';

describe.skipIf(dbYok())("servis JWT'si (api -> diger servis)", () => {
  const t = testServisi();
  afterAll(() => t.service.stop());

  async function hazirla() {
    await t.service.app.ready();
    const res = await t.service.app.inject({ url: '/.well-known/jwks.json' });
    expect(res.statusCode).toBe(200);
    const keySet = createLocalJWKSet(res.json<JSONWebKeySet>());
    return { kimlik: t.service.app.kimlik, keySet };
  }

  it("5 dakikalik, servis:api sub'li token imzalar; JWKS'ten hedef servis dogrular", async () => {
    const { kimlik, keySet } = await hazirla();
    const token = await servisBelirteciUret(kimlik, {
      hedef: 'bildirim',
      scope: ['iletisim.oku', 'sms.gonder'],
    });
    const claims = decodeJwt(token);
    expect(claims.sub).toBe('servis:api');
    expect(claims.aud).toBe('bildirim');
    expect(claims.scope).toBe('iletisim.oku sms.gonder');
    expect(claims.iss).toBe(kimlik.issuer);
    expect(claims.sid).toBeUndefined();
    expect(claims.kurum_id).toBeUndefined();
    expect(SERVIS_BELIRTECI_OMRU_SN).toBe(300);
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(300);

    const sonuc = await createServisJwtVerifier({
      keySet,
      issuer: kimlik.issuer,
      audience: 'bildirim',
    })(token);
    expect(sonuc.servis).toBe('api');
    expect(sonuc.scope).toEqual(['iletisim.oku', 'sms.gonder']);
  });

  it('baska servis ya da kullanici dogrulayicisi tarafindan kabul edilmez', async () => {
    const { kimlik, keySet } = await hazirla();
    const token = await servisBelirteciUret(kimlik, { hedef: 'medya', scope: ['x.oku'] });
    await expect(
      createServisJwtVerifier({ keySet, issuer: kimlik.issuer, audience: 'bildirim' })(token),
    ).rejects.toMatchObject({ statusCode: 401 });
    // Kullanici JWT'si dogrulayicisi (aud=kopru) servis belirtecini reddeder.
    await expect(
      createJwtVerifier({ keySet, issuer: kimlik.issuer, audience: kimlik.audience })(token),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('gecersiz hedef ve scope reddedilir', async () => {
    const { kimlik } = await hazirla();
    await expect(servisBelirteciUret(kimlik, { hedef: 'api', scope: ['x.oku'] })).rejects.toThrow();
    await expect(servisBelirteciUret(kimlik, { hedef: 'medya', scope: [] })).rejects.toThrow();
    await expect(servisBelirteciUret(kimlik, { hedef: 'medya', scope: ['a b'] })).rejects.toThrow();
  });
});
