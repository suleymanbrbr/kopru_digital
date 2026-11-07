import { z } from 'zod';

import { KimlikHatasi, type KimlikAdaptoru } from './arayuz';

import { kurumBaglamiSema, rizaMetniSema, rolSema } from '@/oturum/tipler';

/**
 * `api` servisindeki Better Auth'a baglanan gercek adaptor (ADR 0004).
 *
 * NOT: `hesap` modulunun rotalari henuz yok; uc nokta yollari ve yanit sekilleri ADR 0004 ve
 * Better Auth varsayilanlarindan turetilmistir. Rotalar yayinlaninca yalnizca bu dosya
 * (ve `@kopru/api-client` tipleri) guncellenir; geri kalan uygulama `KimlikAdaptoru` arayuzunu kullanir.
 */

const apiAdresi = () => process.env.API_URL ?? 'http://localhost:4000';

const hataGovdeSema = z.object({
  error: z.object({ code: z.string(), message: z.string() }).optional(),
  code: z.string().optional(),
  message: z.string().optional(),
});

async function cagir(
  yol: string,
  secenekler: { yontem?: string; govde?: unknown; belirtec?: string } = {},
): Promise<Response> {
  let yanit: Response;
  try {
    yanit = await fetch(`${apiAdresi()}${yol}`, {
      method: secenekler.yontem ?? (secenekler.govde === undefined ? 'GET' : 'POST'),
      headers: {
        'content-type': 'application/json',
        ...(secenekler.belirtec ? { authorization: `Bearer ${secenekler.belirtec}` } : {}),
      },
      ...(secenekler.govde === undefined ? {} : { body: JSON.stringify(secenekler.govde) }),
      cache: 'no-store',
    });
  } catch {
    throw new KimlikHatasi(502, 'hizmet_kullanilamiyor', 'Sunucuya ulaşılamadı.');
  }
  if (yanit.ok) return yanit;

  const ham: unknown = await yanit.json().catch(() => null);
  const govde = hataGovdeSema.safeParse(ham);
  const kod = govde.success ? (govde.data.error?.code ?? govde.data.code) : undefined;
  const mesaj = govde.success ? (govde.data.error?.message ?? govde.data.message) : undefined;
  throw new KimlikHatasi(yanit.status, kod ?? 'sunucu_hatasi', mesaj ?? 'İstek başarısız.');
}

const erisimYanitSema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  kullanici: z.object({ id: z.string(), ad: z.string(), telefon: z.string() }),
  uyelikler: z.array(
    z.object({
      id: z.string(),
      kurum_id: z.string(),
      kurum_ad: z.string(),
      rol: rolSema,
      vurgu_rengi: z.string().nullable().default(null),
    }),
  ),
  aktif_uyelik_id: z.string().nullable().default(null),
  riza_gerekli: z.boolean().default(false),
});

export function apiKimlik(): KimlikAdaptoru {
  return {
    async kodIste(telefon) {
      await cagir('/api/auth/phone-number/send-otp', { govde: { phoneNumber: telefon } });
      return { yenidenSn: 60 };
    },

    async kodDogrula(telefon, kod) {
      const yanit = await cagir('/api/auth/phone-number/verify', {
        govde: { phoneNumber: telefon, code: kod },
      });
      // bearer eklentisi oturum belirtecini `set-auth-token` basligiyla verir.
      const belirtec = yanit.headers.get('set-auth-token');
      if (!belirtec) throw new KimlikHatasi(502, 'sunucu_hatasi', 'Oturum belirteci alınamadı.');
      return { oturumBelirteci: belirtec };
    },

    async oturumAl(oturumBelirteci, secim) {
      const yanit = await cagir('/auth/token', {
        belirtec: oturumBelirteci,
        govde: { kurum_id: secim?.kurumId, uyelik_id: secim?.uyelikId },
      });
      const veri = erisimYanitSema.parse(await yanit.json());
      return {
        oturum: {
          erisimBelirteci: veri.access_token,
          bitisAt: new Date(Date.now() + veri.expires_in * 1000).toISOString(),
          kullanici: veri.kullanici,
          uyelikler: veri.uyelikler.map((u) => ({
            id: u.id,
            kurumId: u.kurum_id,
            kurumAd: u.kurum_ad,
            rol: u.rol,
            vurguRengi: u.vurgu_rengi,
          })),
          aktifUyelikId: veri.aktif_uyelik_id,
          rizaGerekli: veri.riza_gerekli,
        },
      };
    },

    async kurumBaglami(_oturum, erisimBelirteci, kurumId) {
      const yanit = await cagir('/v1/hesap/moduller', { belirtec: erisimBelirteci });
      const { moduller } = z.object({ moduller: z.array(z.string()) }).parse(await yanit.json());
      return kurumBaglamiSema.parse({ kurumId, moduller });
    },

    async rizaMetni(oturumBelirteci) {
      const yanit = await cagir('/v1/hesap/riza/guncel', { belirtec: oturumBelirteci });
      return rizaMetniSema.parse(await yanit.json());
    },

    async rizaKabul(oturumBelirteci, surum) {
      await cagir('/v1/hesap/riza', { belirtec: oturumBelirteci, govde: { surum } });
      return { oturumBelirteci };
    },

    async cikis(oturumBelirteci) {
      await cagir('/api/auth/sign-out', { belirtec: oturumBelirteci, govde: {} }).catch(
        () => undefined,
      );
    },
  };
}
