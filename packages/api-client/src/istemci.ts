import createClient, { type Client, type Middleware } from 'openapi-fetch';

import { istekBasliklari } from './basliklar.js';
import type { paths as ApiPaths } from './generated/api.js';
import type { paths as BildirimPaths } from './generated/bildirim.js';
import type { paths as MedyaPaths } from './generated/medya.js';
import type { paths as MotivasyonPaths } from './generated/motivasyon.js';

export type { ApiPaths, BildirimPaths, MedyaPaths, MotivasyonPaths };

export type ServisAdi = 'api' | 'motivasyon' | 'bildirim' | 'medya';

export const servisAdlari: readonly ServisAdi[] = ['api', 'motivasyon', 'bildirim', 'medya'];

/** Servis basina taban adres. Kullanilmayacak servisler verilmeyebilir. */
export type ServisAdresleri = Partial<Record<ServisAdi, string>> & { api: string };

export interface IstemciSecenekleri {
  adresler: ServisAdresleri;
  /** Her istekte cagrilir; bellekteki erisim belirtecini dondurur. Bos ise `Authorization` eklenmez. */
  tokenAl?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Test icin fetch degistirme. */
  fetch?: typeof globalThis.fetch;
  /** Her istege kimlik uretmek icin (varsayilan: rastgele UUID). */
  istekIdUret?: () => string;
}

export interface ServisIstemcileri {
  api: Client<ApiPaths>;
  motivasyon: Client<MotivasyonPaths>;
  bildirim: Client<BildirimPaths>;
  medya: Client<MedyaPaths>;
}

/** Bearer belirteci ve izleme basliklarini ekleyen ara katman. */
export function kimlikAraKatmani(
  options: Pick<IstemciSecenekleri, 'tokenAl' | 'istekIdUret'>,
): Middleware {
  return {
    async onRequest({ request }) {
      const token = await options.tokenAl?.();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      if (!request.headers.has('X-Istek-Id')) {
        const basliklar = istekBasliklari(options.istekIdUret?.());
        for (const [ad, deger] of Object.entries(basliklar)) request.headers.set(ad, deger);
      }
      return request;
    },
  };
}

function tek<P extends object>(
  adres: string | undefined,
  servis: ServisAdi,
  options: IstemciSecenekleri,
): Client<P> {
  // Adresi olmayan servis cagrilirsa acik bir hata verilsin diye gecersiz bir taban kullanilir.
  const client = createClient<P>({
    baseUrl: adres ?? `http://${servis}.adres-tanimsiz.invalid`,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  client.use(kimlikAraKatmani(options));
  return client;
}

/** Dort servis icin tipli istemci uretir; her biri kendi taban adresine ve ayni kimlik ara katmanina sahiptir. */
export function createServisIstemcileri(options: IstemciSecenekleri): ServisIstemcileri {
  const { adresler } = options;
  return {
    api: tek<ApiPaths>(adresler.api, 'api', options),
    motivasyon: tek<MotivasyonPaths>(adresler.motivasyon, 'motivasyon', options),
    bildirim: tek<BildirimPaths>(adresler.bildirim, 'bildirim', options),
    medya: tek<MedyaPaths>(adresler.medya, 'medya', options),
  };
}
