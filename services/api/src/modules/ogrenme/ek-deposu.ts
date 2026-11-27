import {
  EK_EN_FAZLA_DOSYA,
  ortakDosyaBirakildiV1,
  soruHataKodlari,
  type EkListesi,
  type MedyaBagliTur,
} from '@kopru/contracts';
import { AppError, publishInTx, type Tx } from '@kopru/service-kit';
import { asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { uuidv7 } from 'uuidv7';

import { medyaDosyaKopyalari, odevEkleri, planEkleri } from '../../db/schema.js';
import type { YetkiBaglami } from '../hesap/index.js';
import { OUTBOX_TABLOSU, type OdevOlayBaglami } from './odev-deposu.js';
import { baglandiOlayiYaz, dosyalariDogrula, okumaAdresleriAl } from './soru-medya.js';

/**
 * Odev ve haftalik plan ek dosyalari. Dosya baytlari `medya` servisindedir; burada yalniz medya dosya
 * kimligi tutulur (ek kimligi = `ortak.medya_dosya_kopyalari.id`). Bir dosya tek kayda baglanir; baglama ve
 * birakma `ortak.dosya.baglandi.v1` / `ortak.dosya.birakildi.v1` ile ayni islemde outbox'a yazilir. Medya DB'sine
 * dokunulmaz; okuma adresi medya ic ucundan (servis JWT'si) alinir.
 */

interface EkKaynagi {
  /** Medya dosya turu ve baglanti turu (ikisi ayni adi tasir: `odev_eki`, `plan_eki`). */
  tur: 'odev_eki' | 'plan_eki';
  mevcut(tx: Tx, ustId: string): Promise<{ medya_dosya_id: string; sira: number }[]>;
  /** Dosyalardan herhangi biri baska bir kayda bagliysa o dosyalarin kimlikleri. */
  baglilar(tx: Tx, idler: readonly string[]): Promise<string[]>;
  yaz(tx: Tx, y: YetkiBaglami, ustId: string, idler: readonly string[]): Promise<void>;
}

export const ODEV_EK_KAYNAGI: EkKaynagi = {
  tur: 'odev_eki',
  mevcut: (tx, ustId) =>
    tx
      .select({ medya_dosya_id: odevEkleri.medya_dosya_id, sira: odevEkleri.sira })
      .from(odevEkleri)
      .where(eq(odevEkleri.odev_id, ustId))
      .orderBy(asc(odevEkleri.sira)),
  baglilar: async (tx, idler) =>
    (
      await tx
        .select({ id: odevEkleri.medya_dosya_id })
        .from(odevEkleri)
        .where(inArray(odevEkleri.medya_dosya_id, [...idler]))
    ).map((r) => r.id),
  async yaz(tx, y, ustId, idler) {
    await tx.delete(odevEkleri).where(eq(odevEkleri.odev_id, ustId));
    for (const [sira, id] of idler.entries()) {
      await tx.insert(odevEkleri).values({
        id: uuidv7(),
        kurum_id: y.kurumId,
        created_by: y.kullaniciId,
        odev_id: ustId,
        medya_dosya_id: id,
        sira,
      });
    }
  },
};

export const PLAN_EK_KAYNAGI: EkKaynagi = {
  tur: 'plan_eki',
  mevcut: (tx, ustId) =>
    tx
      .select({ medya_dosya_id: planEkleri.medya_dosya_id, sira: planEkleri.sira })
      .from(planEkleri)
      .where(eq(planEkleri.plan_id, ustId))
      .orderBy(asc(planEkleri.sira)),
  baglilar: async (tx, idler) =>
    (
      await tx
        .select({ id: planEkleri.medya_dosya_id })
        .from(planEkleri)
        .where(inArray(planEkleri.medya_dosya_id, [...idler]))
    ).map((r) => r.id),
  async yaz(tx, y, ustId, idler) {
    await tx.delete(planEkleri).where(eq(planEkleri.plan_id, ustId));
    for (const [sira, id] of idler.entries()) {
      await tx.insert(planEkleri).values({
        id: uuidv7(),
        kurum_id: y.kurumId,
        created_by: y.kullaniciId,
        plan_id: ustId,
        medya_dosya_id: id,
        sira,
      });
    }
  },
};

/**
 * Ek kumesini `istenen` listeye (sirasiyla) esitler: yeni dosyalar dogrulanir (ayni kurum, sahibi cagiran,
 * dogru tur, hazir, baska kayda bagli degil) ve baglanir; listeden cikanlar birakilir (`hemen_sil`). Cagiran
 * ust kaydi (odev/plan) once kilitleyip yetkiyi denetlemis olmalidir. Degisen dosya sayisini dondurur.
 */
export async function ekleriEsitle(
  tx: Tx,
  y: YetkiBaglami,
  baglam: OdevOlayBaglami,
  kaynak: EkKaynagi,
  ustId: string,
  istenen: readonly string[],
): Promise<{ eklenen: number; cikarilan: number }> {
  if (istenen.length > EK_EN_FAZLA_DOSYA) {
    throw new AppError(
      422,
      soruHataKodlari.dosyaGecersiz,
      `En fazla ${String(EK_EN_FAZLA_DOSYA)} ek eklenebilir.`,
    );
  }
  if (new Set(istenen).size !== istenen.length) {
    throw new AppError(422, soruHataKodlari.dosyaGecersiz, 'Aynı dosya birden çok kez verilemez.');
  }
  const mevcut = await kaynak.mevcut(tx, ustId);
  const mevcutKume = new Set(mevcut.map((m) => m.medya_dosya_id));
  const yeniler = istenen.filter((id) => !mevcutKume.has(id));
  const birakilacak = mevcut.filter((m) => !istenen.includes(m.medya_dosya_id));

  if (yeniler.length > 0) {
    await dosyalariDogrula(
      tx,
      y,
      yeniler.map((id) => ({ id, tur: kaynak.tur })),
    );
    if ((await kaynak.baglilar(tx, yeniler)).length > 0) {
      throw new AppError(409, soruHataKodlari.dosyaZatenBagli, 'Dosya zaten bir kayda bağlı.');
    }
  }
  const sirayiDegisti = mevcut.map((m) => m.medya_dosya_id).join() !== istenen.join();
  if (yeniler.length === 0 && birakilacak.length === 0 && !sirayiDegisti) {
    return { eklenen: 0, cikarilan: 0 };
  }
  // Kume degisimi: satirlar silinip istenen sirayla yeniden yazilir (unique `ust, sira` cakismaz).
  await kaynak.yaz(tx, y, ustId, istenen);
  const bagliTur: MedyaBagliTur = kaynak.tur;
  for (const id of yeniler) await baglandiOlayiYaz(tx, baglam, id, bagliTur, ustId);
  for (const b of birakilacak) {
    await publishInTx(
      tx,
      ortakDosyaBirakildiV1.create({
        ...baglam,
        data: {
          dosya_id: b.medya_dosya_id,
          bagli_tur: bagliTur,
          bagli_id: ustId,
          hemen_sil: true,
        },
      }),
      { table: OUTBOX_TABLOSU },
    );
  }
  return { eklenen: yeniler.length, cikarilan: birakilacak.length };
}

/** Ek satirlari (sirali) ve yerel medya kopyasindaki mime/boyut; adresler henuz yok. */
export async function ekSatirlari(tx: Tx, kaynak: EkKaynagi, ustId: string) {
  const mevcut = await kaynak.mevcut(tx, ustId);
  if (mevcut.length === 0) return [];
  const kopyalar = await tx
    .select({
      id: medyaDosyaKopyalari.id,
      mime_tipi: medyaDosyaKopyalari.mime_tipi,
      boyut_bayt: medyaDosyaKopyalari.boyut_bayt,
      durum: medyaDosyaKopyalari.durum,
    })
    .from(medyaDosyaKopyalari)
    .where(
      inArray(
        medyaDosyaKopyalari.id,
        mevcut.map((m) => m.medya_dosya_id),
      ),
    );
  const harita = new Map(kopyalar.map((k) => [k.id, k]));
  return mevcut.flatMap((m) => {
    const k = harita.get(m.medya_dosya_id);
    // Medya kopyasi yoksa (olay henuz gelmedi) ya da dosya silindiyse ek gosterilmez.
    if (!k || k.durum !== 'hazir') return [];
    return [
      {
        medya_dosya_id: m.medya_dosya_id,
        sira: m.sira,
        mime_tipi: k.mime_tipi,
        boyut_bayt: k.boyut_bayt,
      },
    ];
  });
}

/** Ek listesi yaniti: satirlara medya ic ucundan alinan kisa omurlu okuma adreslerini ekler. */
export async function ekListesiYaniti(
  app: FastifyInstance,
  kurumId: string,
  satirlar: Awaited<ReturnType<typeof ekSatirlari>>,
): Promise<EkListesi> {
  if (satirlar.length === 0) return { ekler: [], adresler_alinamadi: false };
  const { adresler, alinamadi } = await okumaAdresleriAl(
    app,
    kurumId,
    satirlar.map((s) => s.medya_dosya_id),
  );
  return {
    ekler: satirlar.map((s) => ({ ...s, adres: adresler.get(s.medya_dosya_id) ?? null })),
    adresler_alinamadi: alinamadi,
  };
}
