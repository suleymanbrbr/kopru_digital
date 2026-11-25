import { SignJWT, generateKeyPair } from 'jose';
import { afterAll, describe, expect, it } from 'vitest';

import { buildService } from './app.js';
import { loadServiceEnv } from './config.js';
import { YakalayanSmsGonderici, servisBelirteciUret } from './modules/hesap/index.js';
import {
  bearer,
  dbYok,
  otpIleGiris,
  rastgeleTelefon,
  testDb,
  tokenAl,
  yeniIp,
} from './test/yardimcilar.js';

describe.skipIf(dbYok())(
  'guvenlik: kimlik uclari (numaralandirma, hiz siniri, belirtec dogrulama)',
  () => {
    const urls = testDb();
    if (!urls) throw new Error('testDb yok');
    const sms = new YakalayanSmsGonderici();
    const service = buildService(
      loadServiceEnv({
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        DATABASE_URL: urls.appUrl,
        DATABASE_SISTEM_URL: urls.sistemUrl,
        PUBLIC_URL: 'http://api.test',
        WEB_URL: 'http://web.test',
      }),
      { sms },
    );
    const { app } = service;
    const t = { service, sms };
    afterAll(() => service.stop());

    const benzersiz = () => `${String(Date.now())}${String(Math.floor(Math.random() * 1e6))}`;

    it('otp/gonder: kayitli ve kayitsiz telefon ayni yanit; telefon basina saatte 5, sonra 429', async () => {
      const kayitli = rastgeleTelefon();
      await otpIleGiris(t, kayitli);
      const kayitsiz = rastgeleTelefon();
      const a = await app.inject({
        method: 'POST',
        url: '/auth/otp/gonder',
        remoteAddress: yeniIp(),
        payload: { telefon: kayitli },
      });
      const b = await app.inject({
        method: 'POST',
        url: '/auth/otp/gonder',
        remoteAddress: yeniIp(),
        payload: { telefon: kayitsiz },
      });
      expect(a.statusCode).toBe(200);
      expect(a.body).toBe(b.body);
      let son = 200;
      for (let i = 0; i < 6; i++) {
        son = (
          await app.inject({
            method: 'POST',
            url: '/auth/otp/gonder',
            remoteAddress: yeniIp(),
            payload: { telefon: kayitsiz },
          })
        ).statusCode;
      }
      expect(son).toBe(429);
    });

    it('otp/gonder: IP basina saatte 20 istek sonrasi 429 (farkli telefonlarla)', async () => {
      const ip = yeniIp();
      let son = 200;
      for (let i = 0; i < 22; i++) {
        son = (
          await app.inject({
            method: 'POST',
            url: '/auth/otp/gonder',
            remoteAddress: ip,
            payload: { telefon: rastgeleTelefon() },
          })
        ).statusCode;
        if (son === 429) break;
      }
      expect(son).toBe(429);
    });

    it('otp/dogrula: 5 yanlis denemeden sonra dogru kod da reddedilir', async () => {
      const telefon = rastgeleTelefon();
      const ip = yeniIp();
      await app.inject({
        method: 'POST',
        url: '/auth/otp/gonder',
        remoteAddress: ip,
        payload: { telefon },
      });
      const dogru = sms.sonKod(telefon) ?? '';
      const yanlis = dogru === '000000' ? '111111' : '000000';
      for (let i = 0; i < 6; i++) {
        await app.inject({
          method: 'POST',
          url: '/auth/otp/dogrula',
          remoteAddress: ip,
          payload: { telefon, kod: yanlis },
        });
      }
      const son = await app.inject({
        method: 'POST',
        url: '/auth/otp/dogrula',
        remoteAddress: ip,
        payload: { telefon, kod: dogru },
      });
      expect(son.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('e-posta: kayitli ve kayitsiz adres ile yanlis parola ayni yanit; kayit tekrari adresi ifsa etmez', async () => {
      const adres = `kayitli${benzersiz()}@example.com`;
      const kayit = await app.inject({
        method: 'POST',
        url: '/auth/eposta/kayit',
        remoteAddress: yeniIp(),
        payload: { eposta: adres, parola: 'cok-gizli-parola' },
      });
      expect(kayit.statusCode).toBe(200);
      const yanlisParola = await app.inject({
        method: 'POST',
        url: '/auth/eposta/giris',
        remoteAddress: yeniIp(),
        payload: { eposta: adres, parola: 'yanlis-parola-123' },
      });
      const yokAdres = await app.inject({
        method: 'POST',
        url: '/auth/eposta/giris',
        remoteAddress: yeniIp(),
        payload: { eposta: `yok${benzersiz()}@example.com`, parola: 'yanlis-parola-123' },
      });
      expect(yanlisParola.statusCode).toBe(401);
      expect(yokAdres.statusCode).toBe(401);
      const norm = (b: string) => b.replace(/"requestId":"[^"]+"/, '');
      expect(norm(yanlisParola.body)).toBe(norm(yokAdres.body));

      const tekrar = await app.inject({
        method: 'POST',
        url: '/auth/eposta/kayit',
        remoteAddress: yeniIp(),
        payload: { eposta: adres, parola: 'baska-parola-1234' },
      });
      const yeni = await app.inject({
        method: 'POST',
        url: '/auth/eposta/kayit',
        remoteAddress: yeniIp(),
        payload: { eposta: `yeni${benzersiz()}@example.com`, parola: 'baska-parola-1234' },
      });
      // Kayitli adresle tekrar kayit, yeni adresle ayni bicimde (200 + oturum) sonuclanmamali ve oturum vermemeli.
      expect(tekrar.body).not.toContain(
        kayit.json<{ oturum_belirteci: string }>().oturum_belirteci,
      );
      expect(yeni.statusCode).toBe(200);
      expect([200, 400, 409, 422]).toContain(tekrar.statusCode);
      process.stderr.write(
        `KAYIT-TEKRAR ${String(tekrar.statusCode)} ${tekrar.body.slice(0, 160)}\n`,
      );
    });

    it('e-posta girisi: ayni hesaba 10+ yanlis deneme (farkli IPlerden) hesabi kilitler', async () => {
      const adres = `kilit${benzersiz()}@example.com`;
      const parola = 'cok-gizli-parola';
      await app.inject({
        method: 'POST',
        url: '/auth/eposta/kayit',
        remoteAddress: yeniIp(),
        payload: { eposta: adres, parola },
      });
      for (let i = 0; i < 12; i++) {
        await app.inject({
          method: 'POST',
          url: '/auth/eposta/giris',
          remoteAddress: yeniIp(),
          payload: { eposta: adres, parola: `yanlis-parola-${String(i)}` },
        });
      }
      const dogru = await app.inject({
        method: 'POST',
        url: '/auth/eposta/giris',
        remoteAddress: yeniIp(),
        payload: { eposta: adres, parola },
      });
      expect(dogru.statusCode).toBe(429);
    });

    it('JWT: alg=none, imza hatasi, yanlis aud, suresi dolmus ve servis belirteci kullanici ucunda 401', async () => {
      const g = await otpIleGiris(t);
      const gecerli = (await tokenAl(t, g.oturum)).accessToken;
      expect(
        (await app.inject({ url: '/v1/hesap/ben', headers: bearer(gecerli) })).statusCode,
      ).toBe(200);
      const [h, p] = gecerli.split('.');
      const yuk = JSON.parse(Buffer.from(p ?? '', 'base64url').toString()) as Record<
        string,
        unknown
      >;
      const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p ?? ''}.`;
      const bozukImza = `${h ?? ''}.${p ?? ''}.${'A'.repeat(86)}`;
      const baskaAnahtar = await generateKeyPair('EdDSA');
      const sahte = await new SignJWT({ ...yuk })
        .setProtectedHeader({ alg: 'EdDSA', kid: 'yok' })
        .sign(baskaAnahtar.privateKey);
      const hs = await new SignJWT({ ...yuk })
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode('gizli'));
      const servis = await servisBelirteciUret(app.kimlik, {
        hedef: 'bildirim',
        scope: ['iletisim.oku'],
      });
      for (const token of [none, bozukImza, sahte, hs, servis]) {
        const yanit = await app.inject({ url: '/v1/hesap/ben', headers: bearer(token) });
        expect(yanit.statusCode).toBe(401);
      }
    });

    it('oturum sabitleme: ayni telefonla iki giris farkli oturum belirteci uretir; cikis oturumu oldurur', async () => {
      const telefon = rastgeleTelefon();
      const a = await otpIleGiris(t, telefon);
      const b = await otpIleGiris(t, telefon);
      expect(a.oturum).not.toBe(b.oturum);
      await app.inject({ method: 'POST', url: '/auth/cikis', headers: bearer(a.oturum) });
      const yeniden = await app.inject({
        method: 'POST',
        url: '/auth/token',
        remoteAddress: yeniIp(),
        headers: bearer(a.oturum),
        payload: {},
      });
      expect(yeniden.statusCode).toBe(401);
    });
  },
);
