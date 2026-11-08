import { createHash } from 'node:crypto';

import {
  dersYoklamaKaydedildiV1,
  yoklamaHataKodlari,
  type YoklamaDurumTipi,
  type YoklamaSatiriTipi,
} from '@kopru/contracts';
import { AppError, publishInTx, type Tx } from '@kopru/service-kit';
import { eq } from 'drizzle-orm';

import { kurumlar, type yoklamalar } from '../../db/schema.js';
import type { YetkiBaglami } from '../hesap/index.js';
import { OUTBOX_TABLOSU, type DersOlayBaglami, type DersSatiri } from './ders-deposu.js';

export type YoklamaSatiri = typeof yoklamalar.$inferSelect;

/** Kurum ayarlarindaki varsayilan: yoklama, dersin bitisinden bu kadar gun sonra kilitlenir. */
export const VARSAYILAN_YOKLAMA_KILIT_GUN = 14;

export interface YoklamaGirdisi {
  ogrenci_id: string;
  durum: YoklamaDurumTipi;
  gec_dakika: number | null;
  not: string | null;
  not_gorunurluk: 'ogretmene_ozel' | 'ogrenciye';
  isaretlenme_at: Date;
}

/** Istemciden gelen satiri normallestirir: eksik alanlar `null`/varsayilan. */
export function yoklamaGirdisiniNormallestir(g: {
  ogrenci_id: string;
  durum: YoklamaDurumTipi;
  gec_dakika?: number | undefined;
  not?: string | null | undefined;
  not_gorunurluk?: 'ogretmene_ozel' | 'ogrenciye' | undefined;
  isaretlenme_at: string;
}): YoklamaGirdisi {
  const not = g.not ?? null;
  return {
    ogrenci_id: g.ogrenci_id,
    durum: g.durum,
    gec_dakika: g.durum === 'gec' ? (g.gec_dakika ?? null) : null,
    not,
    // Not yoksa gorunurluk anlamsizdir; karsilastirma ve saklama tek degere iner.
    not_gorunurluk: not === null ? 'ogretmene_ozel' : (g.not_gorunurluk ?? 'ogretmene_ozel'),
    isaretlenme_at: new Date(g.isaretlenme_at),
  };
}

/** Gövde özeti: ders + çağıran + ogrenci sirasindan bagimsiz normallestirilmis satirlar. */
export function govdeOzeti(
  dersId: string,
  kullaniciId: string,
  satirlar: YoklamaGirdisi[],
): Buffer {
  const sirali = [...satirlar]
    .sort((a, b) => a.ogrenci_id.localeCompare(b.ogrenci_id))
    .map((s) => [
      s.ogrenci_id,
      s.durum,
      s.gec_dakika,
      s.not,
      s.not_gorunurluk,
      s.isaretlenme_at.getTime(),
    ]);
  return createHash('sha256')
    .update(JSON.stringify({ d: dersId, k: kullaniciId, s: sirali }))
    .digest();
}

/** Mevcut satirla icerik (zaman damgasi disinda) birebir ayni mi? */
export function ayniIcerik(mevcut: YoklamaSatiri, g: YoklamaGirdisi): boolean {
  return (
    mevcut.durum === g.durum &&
    mevcut.gec_dakika === g.gec_dakika &&
    mevcut.not === g.not &&
    mevcut.not_gorunurluk === g.not_gorunurluk
  );
}

/**
 * Yoklama satiri yaniti. `ogrenciGorunumu`: ogretmene ozel not ASLA donmez (`not: null`).
 */
export function yoklamaYaniti(s: YoklamaSatiri, ogrenciGorunumu: boolean): YoklamaSatiriTipi {
  const gizli = ogrenciGorunumu && s.not_gorunurluk !== 'ogrenciye';
  return {
    id: s.id,
    ders_id: s.ders_id,
    ogrenci_id: s.ogrenci_id,
    durum: s.durum as YoklamaDurumTipi,
    gec_dakika: s.gec_dakika,
    not: gizli ? null : s.not,
    not_gorunurluk: gizli ? 'ogretmene_ozel' : (s.not_gorunurluk as 'ogretmene_ozel' | 'ogrenciye'),
    isaretleyen_id: s.isaretleyen_id,
    isaretlenme_at: s.isaretlenme_at.toISOString(),
    sunucu_at: s.sunucu_at.toISOString(),
    surum: s.surum,
  };
}

/** Kurumun yoklama kilit suresi (gun). */
export async function yoklamaKilitGunu(tx: Tx, kurumId: string): Promise<number> {
  const [k] = await tx
    .select({ ayarlar: kurumlar.ayarlar })
    .from(kurumlar)
    .where(eq(kurumlar.id, kurumId));
  const gun = (k?.ayarlar as { yoklama_kilit_gun?: unknown } | null | undefined)?.yoklama_kilit_gun;
  return typeof gun === 'number' && Number.isInteger(gun) && gun >= 0
    ? gun
    : VARSAYILAN_YOKLAMA_KILIT_GUN;
}

/**
 * Yoklama kilidi: dersin bitisinden `yoklama_kilit_gun` gun sonra ogretmen duzenleyemez; sahip ve
 * yonetici duzeltir.
 */
export async function yoklamaKilidiniKontrolEt(
  tx: Tx,
  y: YetkiBaglami,
  d: Pick<DersSatiri, 'bitis_at'>,
  simdi: Date,
): Promise<void> {
  if (y.rol !== 'ogretmen') return;
  const gun = await yoklamaKilitGunu(tx, y.kurumId);
  if (simdi.getTime() > d.bitis_at.getTime() + gun * 86_400_000) {
    throw new AppError(
      403,
      yoklamaHataKodlari.yoklamaKilitli,
      'Bu dersin yoklaması kilitlendi. Düzeltmek için kurum sahibi veya yöneticiyle görüşün.',
    );
  }
}

/** `ders.yoklama.kaydedildi.v1`: yalniz kimlik ve durum; not/ad/telefon/e-posta yok. */
export async function yoklamaOlayiYaz(
  tx: Tx,
  baglam: DersOlayBaglami,
  ders: Pick<DersSatiri, 'id' | 'grup_id' | 'brans_kodu'>,
  satir: YoklamaSatiri,
  oncekiDurum: YoklamaDurumTipi | null,
): Promise<void> {
  const olay = dersYoklamaKaydedildiV1.create({
    ...baglam,
    data: {
      yoklama_id: satir.id,
      ders_id: ders.id,
      grup_id: ders.grup_id,
      ogrenci_id: satir.ogrenci_id,
      brans_kodu: ders.brans_kodu,
      durum: satir.durum as YoklamaDurumTipi,
      onceki_durum: oncekiDurum,
      gec_dakika: satir.gec_dakika,
      isaretlenme_at: satir.isaretlenme_at.toISOString(),
      yoklama_surumu: satir.surum,
    },
  });
  await publishInTx(tx, olay, { table: OUTBOX_TABLOSU });
}
