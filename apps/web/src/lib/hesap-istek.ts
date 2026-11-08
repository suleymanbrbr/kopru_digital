import type { z } from 'zod';

import { bffIstek, UygulamaHatasi } from '@/lib/api';
import { belirteciYenile, erisimBelirteciAl } from '@/oturum/saglayici';

/**
 * Kiraci ve hesap uc noktalarina BFF (`/api/hesap/*`) uzerinden istek. Bellekteki kisa omurlu
 * erisim belirteci Bearer olarak gider; 401 gelirse belirtec bir kez yenilenip istek tekrarlanir.
 * Yenileme/oturum belirteci tarayici JS'ine hic verilmez (httpOnly cerez).
 */
export async function hesapIstek<S extends z.ZodType>(
  yol: string,
  secenekler: { yontem?: string; govde?: unknown; sema?: S } = {},
): Promise<S extends z.ZodType ? z.output<S> : undefined> {
  const yap = () =>
    bffIstek(`/api/hesap/${yol}`, {
      ...secenekler,
      // Govdesiz yazma isteklerinde bos nesne gonderilir (api bos JSON govdeyi reddeder).
      ...(secenekler.govde === undefined && secenekler.yontem && secenekler.yontem !== 'DELETE'
        ? { govde: {} }
        : {}),
      belirtec: erisimBelirteciAl(),
    });
  try {
    return await yap();
  } catch (hata) {
    if (hata instanceof UygulamaHatasi && hata.durum === 401 && (await belirteciYenile())) {
      return await yap();
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
