import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { MEDYA_OKUMA_SCOPE, medyaOkumaAdresleriIstegiSema } from '@kopru/contracts';
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';

export interface SahteMedyaIstegi {
  kurum_id: string;
  dosya_idleri: string[];
  scope: string;
  sub: string;
}

export type SahteMedyaModu = 'tamam' | 'hata' | 'baglanti_kes' | 'yavas';

/**
 * `medya` servisinin `POST /ic/okuma-adresleri` ucunu taklit eder: servis JWT'sini api JWKS'iyle dogrular
 * (aud=medya, scope=medya.okuma) ve her istenen dosya icin adres doner. Yalniz testler icindir.
 */
export async function sahteMedya(
  jwks: () => Promise<JSONWebKeySet>,
  issuer: () => string,
  port = 0,
) {
  const istekler: SahteMedyaIstegi[] = [];
  const durum = { mod: 'tamam' as SahteMedyaModu };
  const sunucu: Server = createServer((req, res) => {
    const parcalar: Buffer[] = [];
    req.on('data', (p: Buffer) => parcalar.push(p));
    req.on('end', () => {
      void (async () => {
        if (durum.mod === 'baglanti_kes') {
          req.socket.destroy();
          return;
        }
        if (durum.mod === 'yavas') await new Promise((r) => setTimeout(r, 4000));
        if (durum.mod === 'hata') {
          res.statusCode = 500;
          res.end('{}');
          return;
        }
        try {
          const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
          const { payload } = await jwtVerify(token, createLocalJWKSet(await jwks()), {
            algorithms: ['EdDSA'],
            audience: 'medya',
            issuer: issuer(),
          });
          const scope = typeof payload.scope === 'string' ? payload.scope : '';
          if (!scope.split(' ').includes(MEDYA_OKUMA_SCOPE) || req.url !== '/ic/okuma-adresleri') {
            res.statusCode = 403;
            res.end('{}');
            return;
          }
          const g = medyaOkumaAdresleriIstegiSema.parse(
            JSON.parse(Buffer.concat(parcalar).toString()),
          );
          istekler.push({
            kurum_id: g.kurum_id,
            dosya_idleri: g.dosya_idleri,
            scope,
            sub: String(payload.sub),
          });
          const bitis = new Date(Date.now() + 600_000).toISOString();
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              adresler: g.dosya_idleri.map((id) => ({
                dosya_id: id,
                mime_tipi: 'image/jpeg',
                asil_url: `https://depo.test/${id}`,
                kucuk_url: `https://depo.test/${id}?k`,
                orta_url: null,
                genislik: 100,
                yukseklik: 100,
                sure_sn: null,
                gecerlilik_bitis_at: bitis,
              })),
            }),
          );
        } catch {
          res.statusCode = 401;
          res.end('{}');
        }
      })();
    });
  });
  await new Promise<void>((coz) => sunucu.listen(port, '127.0.0.1', coz));
  const adres = sunucu.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(adres.port)}`,
    istekler,
    durum,
    kapat: () =>
      new Promise<void>((coz) => {
        sunucu.closeAllConnections();
        sunucu.close(() => {
          coz();
        });
      }),
  };
}
