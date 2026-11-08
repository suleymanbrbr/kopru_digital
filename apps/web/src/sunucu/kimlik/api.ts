import { ApiHatasi, createServisIstemcileri } from '@kopru/api-client';
import { MODUL_KODLARI } from '@kopru/contracts';

import { KimlikHatasi, type KimlikAdaptoru } from './arayuz';

import type { Oturum, Uyelik } from '@/oturum/tipler';

/**
 * `api` servisine (`hesap` modulu) baglanan gercek adaptor (ADR 0004). Butun cagrilar
 * `@kopru/api-client` (openapi-fetch) uzerinden yapilir; yol ve govde sekilleri
 * `packages/api-client/openapi/api.json` ile tiplenmistir.
 *
 * Tarayicidaki httpOnly cerez `oturum_belirteci`ni (opak, 30 gun) tasir; hesap ve kiraci
 * uc noktalari icin gerektiginde `POST /auth/token` ile 15 dk'lik erisim belirteci alinir.
 */

const apiAdresi = () => process.env.API_URL ?? 'http://localhost:4000';

/** `api` servisinin hata kodlarini web'in bildigi (i18n'li) kodlara cevirir. */
const kodEsleme: Record<string, string> = {
  gecersiz_telefon: 'telefon_gecersiz',
  kod_gecersiz: 'otp_gecersiz',
};

/** Istek basina istemci: belirtec o istege baglanir, yanit onbelleklenmez. */
function istemci(belirtec?: string) {
  return createServisIstemcileri({
    adresler: { api: apiAdresi() },
    tokenAl: () => belirtec,
    fetch: (istek) => fetch(istek, { cache: 'no-store' }),
  }).api;
}

function hataCevir(durum: number, govde: unknown): KimlikHatasi {
  const hata = ApiHatasi.from(durum, govde, 'İstek başarısız.');
  return new KimlikHatasi(hata.durum, kodEsleme[hata.kod] ?? hata.kod, hata.message);
}

/**
 * openapi-fetch cagrisini sarar: ag hatasi -> 502, basarisiz yanit -> `KimlikHatasi`.
 * 401, 403 `riza_gerekli` / `modul_kapali` / `izin_yok` ve 402 `abonelik_gerekli` kodlari oldugu
 * gibi gecer; BFF bunlari standart hata govdesine, arayuz i18n metnine cevirir.
 */
async function cagir<T>(
  is: () => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let sonuc: Awaited<ReturnType<typeof is>>;
  try {
    sonuc = await is();
  } catch {
    throw new KimlikHatasi(502, 'hizmet_kullanilamiyor', 'Sunucuya ulaşılamadı.');
  }
  if (sonuc.data === undefined) throw hataCevir(sonuc.response.status, sonuc.error);
  return sonuc.data;
}

const bearer = (belirtec: string) => ({ Authorization: `Bearer ${belirtec}` });

function uyelikCevir(u: {
  uyelik_id: string;
  kurum_id: string;
  kurum_ad: string | null;
  rol: Uyelik['rol'];
}): Uyelik {
  return {
    id: u.uyelik_id,
    kurumId: u.kurum_id,
    kurumAd: u.kurum_ad ?? '',
    rol: u.rol,
    // Vurgu rengi kurum ayarlarindadir (`GET /v1/hesap/kurumlar/{id}`); secim ekrani icin ek istek atilmaz.
    vurguRengi: null,
  };
}

/** `POST /auth/token`: oturum belirtecini erisim belirtecine cevirir (govde `{}` ya da kurum/uyelik). */
function erisimAl(oturumBelirteci: string, secim?: { uyelikId?: string; kurumId?: string }) {
  return cagir(() =>
    istemci().POST('/auth/token', {
      body: {
        ...(secim?.uyelikId ? { uyelik_id: secim.uyelikId } : {}),
        ...(secim?.kurumId ? { kurum_id: secim.kurumId } : {}),
      },
      headers: bearer(oturumBelirteci),
    }),
  );
}

export function apiKimlik(): KimlikAdaptoru {
  return {
    async kodIste(telefon) {
      await cagir(() => istemci().POST('/auth/otp/gonder', { body: { telefon } }));
      // Sunucu yalnizca kodun gecerlilik suresini verir; yeniden gonderme beklemesi arayuzde sabittir.
      return { yenidenSn: 60 };
    },

    async kodDogrula(telefon, kod) {
      const veri = await cagir(() =>
        istemci().POST('/auth/otp/dogrula', { body: { telefon, kod } }),
      );
      return { oturumBelirteci: veri.oturum_belirteci };
    },

    async oturumAl(oturumBelirteci, secim) {
      const token = await erisimAl(oturumBelirteci, secim);
      // Kullanici ozeti ve riza durumu `ben` ucundan gelir (riza gerekli iken de acik, ADR 0004).
      const ben = await cagir(() =>
        istemci().GET('/v1/hesap/ben', { headers: bearer(token.access_token) }),
      );
      const oturum: Oturum = {
        erisimBelirteci: token.access_token,
        bitisAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        kullanici: {
          id: ben.kullanici.id,
          ad: ben.kullanici.gorunen_ad ?? '',
          telefon: ben.kullanici.telefon_e164 ?? '',
        },
        uyelikler: token.uyelikler.filter((u) => u.durum === 'aktif').map(uyelikCevir),
        aktifUyelikId: token.uyelik_id,
        rizaGerekli: ben.onay_gerekli,
      };
      return { oturum };
    },

    async kurumBaglami(_oturumBelirteci, erisimBelirteci, kurumId) {
      // `etkin-tumu` kurum > kademe > grup onceligini tek sorguda cozer (`hesap.modul_acik_mi`).
      const sonuc = await istemci(erisimBelirteci)
        .GET('/v1/hesap/modul-ayarlari/etkin-tumu', {})
        .catch(() => {
          throw new KimlikHatasi(502, 'hizmet_kullanilamiyor', 'Sunucuya ulaşılamadı.');
        });
      if (sonuc.data === undefined) {
        const hata = hataCevir(sonuc.response.status, sonuc.error);
        // `modul.ayar.oku` izni olmayan rol: moduller bilinmiyor, yalniz cekirdek bolumler gorunur.
        if (hata.durum === 403 && hata.kod === 'izin_yok') return { kurumId, moduller: [] };
        throw hata;
      }
      const moduller = MODUL_KODLARI.filter((kod) => sonuc.data.moduller[kod] === true);
      return { kurumId, moduller };
    },

    async rizaMetni(oturumBelirteci) {
      const { access_token: erisim } = await erisimAl(oturumBelirteci);
      const veri = await cagir(() =>
        istemci().GET('/v1/hesap/rizalar/guncel', { headers: bearer(erisim) }),
      );
      // Her metin ayri onaylanir; arayuz tek onay kutusuyla bekleyenlerin hepsini gosterir.
      const bekleyen = veri.metinler.filter((m) => !m.kabul_edildi);
      const gosterilecek = bekleyen.length > 0 ? bekleyen : veri.metinler;
      return {
        surum: [...new Set(gosterilecek.map((m) => m.surum))].join(', '),
        // Her metnin basligi kendi bolumunde gosterilir; ust baslik yok.
        baslik: '',
        bolumler: gosterilecek.map((m) => ({ baslik: m.baslik, metin: m.govde_markdown })),
        metinIdleri: bekleyen.map((m) => m.id),
      };
    },

    async rizaKabul(oturumBelirteci, kabul) {
      const { access_token: erisim } = await erisimAl(oturumBelirteci);
      for (const rizaMetniId of kabul.metinIdleri) {
        await cagir(() =>
          istemci().POST('/v1/hesap/rizalar', {
            body: { riza_metni_id: rizaMetniId, karar: 'kabul', kaynak: 'web' },
            headers: bearer(erisim),
          }),
        );
      }
      return { oturumBelirteci };
    },

    async cikis(oturumBelirteci) {
      await cagir(() => istemci().POST('/auth/cikis', { headers: bearer(oturumBelirteci) })).catch(
        () => undefined,
      );
    },
  };
}
