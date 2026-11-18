import { t } from '@kopru/i18n';
import type { z } from 'zod';

import { bffIstek, UygulamaHatasi } from '@/lib/api';
import { XP_OLAYI, xpOlasiMi } from '@/lib/motivasyon/xp';
import { belirteciYenile, erisimBelirteciAl } from '@/oturum/saglayici';

export type Servis = 'hesap' | 'ders' | 'finans' | 'ogrenme' | 'medya' | 'motivasyon' | 'bildirim';

interface IstekSecenekleri<S> {
  yontem?: string;
  govde?: unknown;
  sema?: S;
  /** Ek istek basliklari (ornegin `Idempotency-Key`). */
  basliklar?: Record<string, string>;
}

/**
 * Kiraci uc noktalarina BFF (`/api/<servis>/*`) uzerinden istek. Bellekteki kisa omurlu erisim
 * belirteci Bearer olarak gider; 401 gelirse belirtec bir kez yenilenip istek tekrarlanir.
 * Yenileme/oturum belirteci tarayici JS'ine hic verilmez (httpOnly cerez).
 */
export async function servisIstek<S extends z.ZodType>(
  servis: Servis,
  yol: string,
  secenekler: IstekSecenekleri<S> = {},
): Promise<S extends z.ZodType ? z.output<S> : undefined> {
  const yap = () =>
    bffIstek(`/api/${servis}/${yol}`, {
      ...secenekler,
      // Govdesiz yazma isteklerinde bos nesne gonderilir (api bos JSON govdeyi reddeder).
      ...(secenekler.govde === undefined && secenekler.yontem && secenekler.yontem !== 'DELETE'
        ? { govde: {} }
        : {}),
      belirtec: erisimBelirteciAl(),
    });
  // XP kazandirmis olabilecek ogrenci eylemlerinden sonra merkezi XP geri bildirimine haber verilir.
  const sonuc = async () => {
    const yanit = await yap();
    if (
      typeof window !== 'undefined' &&
      xpOlasiMi(servis, secenekler.yontem ?? (secenekler.govde === undefined ? 'GET' : 'POST'), yol)
    ) {
      window.dispatchEvent(new CustomEvent(XP_OLAYI));
    }
    return yanit;
  };
  try {
    return await sonuc();
  } catch (hata) {
    if (hata instanceof UygulamaHatasi && hata.durum === 401 && (await belirteciYenile())) {
      return await sonuc();
    }
    throw hata;
  }
}

export function hesapIstek<S extends z.ZodType>(yol: string, secenekler: IstekSecenekleri<S> = {}) {
  return servisIstek('hesap', yol, secenekler);
}
export function dersIstek<S extends z.ZodType>(yol: string, secenekler: IstekSecenekleri<S> = {}) {
  return servisIstek('ders', yol, secenekler);
}
export function finansIstek<S extends z.ZodType>(
  yol: string,
  secenekler: IstekSecenekleri<S> = {},
) {
  return servisIstek('finans', yol, secenekler);
}

export function ogrenmeIstek<S extends z.ZodType>(
  yol: string,
  secenekler: IstekSecenekleri<S> = {},
) {
  return servisIstek('ogrenme', yol, secenekler);
}

/** Medya servisi (`/api/medya/dosyalar/*` -> `MEDYA_URL/v1/dosyalar/*`). */
export function medyaIstek<S extends z.ZodType>(yol: string, secenekler: IstekSecenekleri<S> = {}) {
  return servisIstek('medya', yol, secenekler);
}

/** Bildirim servisi (`/api/bildirim/*` -> `BILDIRIM_URL/v1/bildirim/*`). */
export function bildirimIstek<S extends z.ZodType>(
  yol: string,
  secenekler: IstekSecenekleri<S> = {},
) {
  return servisIstek('bildirim', yol, secenekler);
}

/** Motivasyon servisi (`/api/motivasyon/*` -> `MOTIVASYON_URL/v1/motivasyon/*`). */
export function motivasyonIstek<S extends z.ZodType>(
  yol: string,
  secenekler: IstekSecenekleri<S> = {},
) {
  return servisIstek('motivasyon', yol, secenekler);
}

/** `content-disposition` basligindan dosya adini cikarir. */
export function dosyaAdiCoz(baslik: string | null, yedek: string): string {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(baslik ?? '');
  if (!m?.[1]) return yedek;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Ikili bir yaniti (ornegin Excel) indirir; 401'de bir kez yenileyip tekrarlar. */
export async function servisDosyaAl(
  servis: Servis,
  yol: string,
  yedekAd: string,
): Promise<{ blob: Blob; dosyaAdi: string }> {
  const dene = async () => {
    let yanit: Response;
    try {
      yanit = await fetch(`/api/${servis}/${yol}`, {
        headers: { authorization: `Bearer ${erisimBelirteciAl() ?? ''}` },
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } catch {
      throw new UygulamaHatasi(0, 'ag', t('hata.ag'));
    }
    if (!yanit.ok) {
      const ham = (await yanit.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      throw new UygulamaHatasi(
        yanit.status,
        ham?.error?.code ?? 'sunucu_hatasi',
        ham?.error?.message ?? t('ortak.hataGenel'),
      );
    }
    return {
      blob: await yanit.blob(),
      dosyaAdi: dosyaAdiCoz(yanit.headers.get('content-disposition'), yedekAd),
    };
  };
  try {
    return await dene();
  } catch (hata) {
    if (hata instanceof UygulamaHatasi && hata.durum === 401 && (await belirteciYenile())) {
      return await dene();
    }
    throw hata;
  }
}

export function finansDosyaAl(yol: string, yedekAd: string) {
  return servisDosyaAl('finans', yol, yedekAd);
}

export function ogrenmeDosyaAl(yol: string, yedekAd: string) {
  return servisDosyaAl('ogrenme', yol, yedekAd);
}

/**
 * Ham dosya gonderir (ornegin `.xlsx`); yanit JSON'dur. Hata gövdesi `UygulamaHatasi`na cevrilir ve
 * `detaylar` (satir hatalari) korunur. 401'de bir kez yenileyip tekrarlar.
 */
export async function servisDosyaYukle<S extends z.ZodType>(
  servis: Servis,
  yol: string,
  dosya: Blob,
  sema: S,
): Promise<z.output<S>> {
  const dene = async () => {
    let yanit: Response;
    try {
      yanit = await fetch(`/api/${servis}/${yol}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${erisimBelirteciAl() ?? ''}`,
          'content-type':
            dosya.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: dosya,
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } catch {
      throw new UygulamaHatasi(0, 'ag', t('hata.ag'));
    }
    if (!yanit.ok) {
      const ham = (await yanit.json().catch(() => null)) as {
        error?: { code?: string; message?: string; details?: unknown };
      } | null;
      throw new UygulamaHatasi(
        yanit.status,
        ham?.error?.code ?? 'sunucu_hatasi',
        ham?.error?.message ?? t('ortak.hataGenel'),
        undefined,
        ham?.error?.details,
      );
    }
    return sema.parse(await yanit.json());
  };
  try {
    return await dene();
  } catch (hata) {
    if (hata instanceof UygulamaHatasi && hata.durum === 401 && (await belirteciYenile())) {
      return await dene();
    }
    throw hata;
  }
}

/** Sorgu dizgesi uretir; bos/tanimsiz degerler atlanir. */
export function sorguDizgesi(sorgu: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sorgu)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
