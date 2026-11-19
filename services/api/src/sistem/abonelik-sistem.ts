import type { Database, Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { withSistem, type SistemBaglami } from './with-sistem.js';

/**
 * Abonelik yazmalari `api_sistem` (BYPASSRLS) ile yapilir: `abonelik.abonelikler` tablosuna uygulama rolu
 * yalnizca okur (docs/schema/api.md). Eylem adlari sabittir ve nedenle birlikte `hesap.denetim_kayitlari`na
 * yazilir (ADR 0003). `withSistem` yalnizca bu klasorden cagrilir.
 */

export type AbonelikSistemEylemi =
  | 'sistem.abonelik_iptal_istegi'
  | 'sistem.abonelik_plan_degistir'
  | 'sistem.abonelik_kurumsal_aktivasyon'
  | 'sistem.abonelik_odeme_isle'
  | 'sistem.abonelik_gecisleri';

export interface AbonelikSistemBaglami {
  eylem: AbonelikSistemEylemi;
  neden: string;
  kurumId?: string;
  aktorKullaniciId?: string;
  hedefId?: string;
  istekId?: string | undefined;
  ayrinti?: Record<string, unknown>;
}

export function abonelikSistemIslemi<T>(
  db: Database | null,
  baglam: AbonelikSistemBaglami,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withSistem(
    db,
    {
      eylem: baglam.eylem,
      neden: baglam.neden,
      ...(baglam.kurumId
        ? { kurumId: baglam.kurumId, hedefTuru: 'kurum', hedefId: baglam.kurumId }
        : {}),
      ...(baglam.aktorKullaniciId ? { aktorKullaniciId: baglam.aktorKullaniciId } : {}),
      ...(baglam.istekId ? { istekId: baglam.istekId } : {}),
      ...(baglam.ayrinti ? { ayrinti: baglam.ayrinti } : {}),
    },
    fn,
  );
}

/**
 * Zamanlayici on suzgeci: vadesi gelen abonelik var mi? Yoksa denetim satiri yazilmaz (saatlik is bos
 * calismalarla denetim kaydini sismirmez). Yalniz sayim; `abonelik.abonelikler` satirlarini okur.
 */
export async function abonelikGecisAdayiVarMi(
  db: Pick<Database, 'orm'>,
  simdi: Date = new Date(),
): Promise<boolean> {
  const an = sql`${simdi.toISOString()}::timestamptz`;
  const rows = await db.orm.execute<{ var: boolean }>(sql`
    select exists (
      select 1 from abonelik.abonelikler
      where (durum in ('deneme', 'aktif', 'odeme_bekliyor') and coalesce(deneme_bitis_at, donem_bitis_at) <= ${an})
         or (durum = 'ek_sure' and ek_sure_bitis_at <= ${an})
         or (durum = 'askida' and coalesce(ek_sure_bitis_at, donem_bitis_at) + interval '90 days' <= ${an})
    ) as var`);
  return rows[0]?.var === true;
}

/**
 * Platform paneli (`/platform/kurumlar/:id/abonelik`): denetim baglami (eylem `platform.abonelik_*`, aktor,
 * IP, neden) P1 denetim yardimcisindan (`platformBaglami`) gelir; `abonelik.*` yazmalari ayni islemde yapilir.
 */
/** `withSistem` baglami (aktor, IP, istek kimligi, denetim eylemi/nedeni); P1 `platformBaglami` uretir. */
export type PlatformAbonelikBaglami = SistemBaglami;

export function platformAbonelikIslemi<T>(
  db: Database | null,
  baglam: PlatformAbonelikBaglami,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withSistem(db, baglam, fn);
}
