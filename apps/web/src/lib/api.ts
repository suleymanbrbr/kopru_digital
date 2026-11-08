import { t, type MessageKey } from '@kopru/i18n';
import type { z } from 'zod';

import { hataSema } from '@/oturum/tipler';

/** BFF'den veya `api`dan donen, kullaniciya gosterilebilir hata. */
export class UygulamaHatasi extends Error {
  constructor(
    public readonly durum: number,
    public readonly kod: string,
    mesaj: string,
    public readonly istekId?: string,
  ) {
    super(mesaj);
    this.name = 'UygulamaHatasi';
  }
}

const bilinenKodlar = new Set([
  'otp_gecersiz',
  'otp_deneme_asildi',
  'telefon_gecersiz',
  'cok_fazla_istek',
  'yetkisiz',
  'riza_gerekli',
  'modul_kapali',
  'izin_yok',
  'abonelik_gerekli',
  'ag',
  'bulunamadi',
  'davet_gecersiz',
  'davet_beklemiyor',
  'yeniden_gonderilemez',
  'gonderim_siniri_asildi',
  'zaten_uye',
  'uyelik_askida',
  'kapasite_dolu',
  'grup_arsivde',
  'atama_cakisiyor',
  'kod_gecersiz',
  'kod_kullanim_doldu',
  'grup_sinif_degil',
  'istek_beklemiyor',
  'gecersiz_telefon',
  'dogrulama_hatasi',
  'taklit_salt_okunur',
  'cakisma',
]);

/** Hata kodunu Turkce, eyleme yonelik metne cevirir; bilinmeyen kodda genel mesaj. */
export function hataMesaji(hata: unknown): string {
  if (hata instanceof UygulamaHatasi && hata.kod === 'hizmet_kullanilamiyor') return t('hata.ag');
  if (hata instanceof UygulamaHatasi && bilinenKodlar.has(hata.kod)) {
    return t(`hata.${hata.kod}` as MessageKey);
  }
  return t('ortak.hataGenel');
}

/** Same-origin BFF istegi. Hata govdesini `UygulamaHatasi`na cevirir. */
export async function bffIstek<S extends z.ZodType>(
  yol: string,
  secenekler: { yontem?: string; govde?: unknown; belirtec?: string | null; sema?: S } = {},
): Promise<S extends z.ZodType ? z.output<S> : undefined> {
  let yanit: Response;
  try {
    yanit = await fetch(yol, {
      method: secenekler.yontem ?? (secenekler.govde === undefined ? 'GET' : 'POST'),
      headers: {
        ...(secenekler.govde === undefined ? {} : { 'content-type': 'application/json' }),
        ...(secenekler.belirtec ? { authorization: `Bearer ${secenekler.belirtec}` } : {}),
      },
      ...(secenekler.govde === undefined ? {} : { body: JSON.stringify(secenekler.govde) }),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new UygulamaHatasi(0, 'ag', t('hata.ag'));
  }

  if (!yanit.ok) {
    const ham: unknown = await yanit.json().catch(() => null);
    const govde = hataSema.safeParse(ham);
    if (govde.success) {
      const { code, message, requestId } = govde.data.error;
      throw new UygulamaHatasi(yanit.status, code, message, requestId);
    }
    throw new UygulamaHatasi(yanit.status, 'sunucu_hatasi', t('ortak.hataGenel'));
  }

  if (!secenekler.sema) return undefined as never;
  return secenekler.sema.parse(await yanit.json()) as never;
}
