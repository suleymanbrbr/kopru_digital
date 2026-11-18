import {
  errorCodes,
  type AbonelikDurumu,
  type PlanLimitleri,
  type SayimLimiti,
} from '@kopru/contracts';
import { AppError, type Database, type Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

/** Abonelik olaylari hesap ile ayni outbox tablosuna, is verisini yazan islemde eklenir. */
export const OUTBOX_TABLOSU = 'ortak.outbox';

/** Kurum basina en cok bir etkin abonelik (`abonelikler_tek_etkin_uniq`); tam erisim bu durumlarda. */
export const ETKIN_DURUMLAR = [
  'deneme',
  'aktif',
  'odeme_bekliyor',
  'ek_sure',
] as const satisfies readonly AbonelikDurumu[];
/** Yazma kilitli durumlar (kontrol sirasi adim 4): yalniz okuma ve abonelik uc noktalari acik. */
export const KILIT_DURUMLARI = ['askida', 'sona_erdi'] as const satisfies readonly AbonelikDurumu[];

export const DENEME_GUN = 14;
/** `odeme_bekliyor` -> `ek_sure`: ek sure (tam erisim) donem bitisinden baslar. */
export const EK_SURE_GUN = 7;
/** `askida` -> `sona_erdi`: askiya gecisten (ek sure bitisinden) sonra. */
export const ASKIDAN_SONA_ERME_GUN = 90;

export const GUN_MS = 24 * 60 * 60 * 1000;
export const gunEkle = (tarih: Date, gun: number): Date => new Date(tarih.getTime() + gun * GUN_MS);

/** Kurum turune gore deneme ve varsayilan plan (kod; en yuksek aktif surum). */
export const DENEME_PLAN_KODU = {
  bireysel: 'baslangic',
  ekip: 'ekip',
  kurum: 'kurum',
} as const;

/**
 * Etkin abonelik yokken gecerli "ucretsiz" katman. YER TUTUCU (proje sahibi onayi bekliyor); plan
 * kataloguyla ayni anahtarlar. Yalniz hic abonelik kaydi olmayan (ornegin eski) ya da `iptal` olmus
 * kurumlar icindir: yeni uye eklenemez, mevcut veri silinmez.
 */
export const UCRETSIZ_KATMAN: PlanLimitleri = {
  max_ogrenci: 5,
  max_ogretmen: 1,
  max_sube: 1,
  medya_kota_bayt: 1_073_741_824,
  sms_aylik: 0,
  soru_aylik_ogrenci: -1,
};

/** `-1` (sinirsiz) -> `null`. */
export const sinirOlarak = (deger: number): number | null => (deger < 0 ? null : deger);

export const LIMIT_ROLLERI: Record<SayimLimiti, 'ogrenci' | 'ogretmen'> = {
  max_ogrenci: 'ogrenci',
  max_ogretmen: 'ogretmen',
};

/** Abonelik yazmalari (zamanlayici, kurumsal aktivasyon, webhook) `api_sistem` ile calisir. */
export function sistemVeritabani(db: Database | null): Database {
  if (!db) {
    throw new AppError(
      503,
      errorCodes.unavailable,
      'Abonelik işlemi için sistem bağlantısı kullanılamıyor.',
    );
  }
  return db;
}

/** Ayni anahtara gore seri hale getiren islem-duzeyi (xact) advisory kilidi. */
export async function kilitAl(tx: Tx, anahtar: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${anahtar}, 0))`);
}
