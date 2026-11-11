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
    /** `api` hata govdesindeki `details` (ornegin `ders_cakismasi` icin `cakisanlar`). */
    public readonly detaylar?: unknown,
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

const operasyonKodlari = new Set([
  'ders_cakismasi',
  'surum_cakismasi',
  'ogretmen_gerekli',
  'ogretmen_gecersiz',
  'brans_gerekli',
  'iptal_kaynagi_gecersiz',
  'ders_planli_degil',
  'ders_seride_degil',
  'tarih_degisikligi_yalniz_bu',
  'ders_henuz_baslamadi',
  'ders_iptal_edildi',
  'yoklama_kilitli',
  'ogrenci_katilimci_degil',
  'idempotency_anahtar_cakismasi',
  'tamamlanmis_ders_yalniz_bu',
  'paket_kullanilmis',
  'paket_iptal_edilmis',
  'tahsilat_iptal_edilmis',
  'istek_cakismasi',
  'makbuz_no_kullanimda',
  'tarife_cakisiyor',
  'odeme_gecersiz',
  'ogrenci_degil',
  'paket_arsivde',
  'ogrenci_modeli_paket_degil',
]);

const ogrenmeKodlari = new Set([
  'global_konu_yazilamaz',
  'konu_ust_gecersiz',
  'brans_gecersiz',
  'surum_bulunamadi',
  'surum_yayinlanmamis',
  'kapsam_gecersiz',
  'odev_taslak_degil',
  'odev_yayinda_degil',
  'odev_kapali',
  'teslim_durumu_gecersiz',
  'inceleme_durumu_gecersiz',
  'hedef_gecersiz',
  'plan_kilitli',
  'plan_zaten_var',
  'plan_dolu',
  'hafta_pazartesi_degil',
  'gun_hafta_disinda',
  'gorev_silinemez',
  'gorev_zaten_devredildi',
  'devretme_durumu_gecersiz',
  'hedef_gun_gecersiz',
  'global_kural_yazilamaz',
  'kural_kullanimda',
  'kural_kodu_var',
  'deneme_bolum_gecersiz',
  'ogrenci_deneme_girisi_kapali',
  'deneme_onay_durumu_gecersiz',
  'deneme_zaten_var',
  'toplu_giris_hatali',
  'excel_gecersiz',
  'deneme_kurali_gerekli',
]);

/** Hata kodunu Turkce, eyleme yonelik metne cevirir; bilinmeyen kodda genel mesaj. */
export function hataMesaji(hata: unknown): string {
  if (hata instanceof UygulamaHatasi && hata.kod === 'hizmet_kullanilamiyor') return t('hata.ag');
  if (hata instanceof UygulamaHatasi && operasyonKodlari.has(hata.kod)) {
    return t(`operasyon.hata.${hata.kod}` as MessageKey);
  }
  if (hata instanceof UygulamaHatasi && ogrenmeKodlari.has(hata.kod)) {
    return t(`ogrenme.hata.${hata.kod}` as MessageKey);
  }
  if (hata instanceof UygulamaHatasi && bilinenKodlar.has(hata.kod)) {
    return t(`hata.${hata.kod}` as MessageKey);
  }
  return t('ortak.hataGenel');
}

/** Same-origin BFF istegi. Hata govdesini `UygulamaHatasi`na cevirir. */
export async function bffIstek<S extends z.ZodType>(
  yol: string,
  secenekler: {
    yontem?: string;
    govde?: unknown;
    belirtec?: string | null;
    sema?: S;
    basliklar?: Record<string, string>;
  } = {},
): Promise<S extends z.ZodType ? z.output<S> : undefined> {
  let yanit: Response;
  try {
    yanit = await fetch(yol, {
      method: secenekler.yontem ?? (secenekler.govde === undefined ? 'GET' : 'POST'),
      headers: {
        ...(secenekler.basliklar ?? {}),
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
      const { code, message, requestId, details } = govde.data.error;
      throw new UygulamaHatasi(yanit.status, code, message, requestId, details);
    }
    throw new UygulamaHatasi(yanit.status, 'sunucu_hatasi', t('ortak.hataGenel'));
  }

  if (!secenekler.sema) return undefined as never;
  return secenekler.sema.parse(await yanit.json()) as never;
}
