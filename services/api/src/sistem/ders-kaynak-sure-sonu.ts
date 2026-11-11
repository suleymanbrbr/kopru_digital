import type { Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { withSistem } from './with-sistem.js';

export interface KaynakSureSonuOzeti {
  kurum: number;
  kaynak: number;
  hata: number;
}

export interface KaynakSureSonuSecenegi {
  /** Testler icin; varsayilan: simdi. */
  simdi?: Date;
  log?: { error(nesne: unknown, mesaj: string): void };
}

/**
 * Saatlik is: `aktif` ve `gecerlilik_bitis_at <= simdi` kaynaklari `suresi_doldu` yapar. Okuma zaten sureyi
 * suzdugu icin is gecikse bile ogrenci gormez; is durumu ve personel listesini dogru tutar.
 *
 * Once kurumlari yalniz OKUYAN bir sorguyla bulur (is yoksa hicbir islem/denetim satiri yazilmaz); her
 * kurum kendi isleminde `api_sistem` ile calisir (ADR 0003, nedeni denetime yazilir). Satirlar
 * `FOR UPDATE SKIP LOCKED` ile secildigi icin ayni anda calisan iki worker ayni satiri iki kez islemez;
 * `durum = 'aktif'` kosulu isi idempotent yapar.
 */
export async function kaynakSuresiniDoldur(
  db: Database | null,
  secenek: KaynakSureSonuSecenegi = {},
): Promise<KaynakSureSonuOzeti> {
  if (!db) throw new Error('DATABASE_SISTEM_URL tanımlı değil: kaynak süreleri işlenemez.');
  const simdi = (secenek.simdi ?? new Date()).toISOString();
  const ozet: KaynakSureSonuOzeti = { kurum: 0, kaynak: 0, hata: 0 };

  const kurumlar = await db.orm.execute<{ kurum_id: string }>(sql`
    select distinct kurum_id from ders.ders_kaynaklari
    where durum = 'aktif' and silindi_at is null
      and gecerlilik_bitis_at is not null and gecerlilik_bitis_at <= ${simdi}::timestamptz`);

  for (const { kurum_id: kurumId } of kurumlar) {
    try {
      await withSistem(
        db,
        {
          eylem: 'sistem.kaynak_sure_sonu',
          neden: 'Saatlik iş: son erişim tarihi geçen ders kaynaklarını süresi_doldu yap',
          kurumId,
          hedefTuru: 'kurum',
          hedefId: kurumId,
        },
        async (tx) => {
          const guncellenen = await tx.execute<{ id: string }>(sql`
            update ders.ders_kaynaklari set durum = 'suresi_doldu'
            where id in (
              select id from ders.ders_kaynaklari
              where kurum_id = ${kurumId}::uuid and durum = 'aktif' and silindi_at is null
                and gecerlilik_bitis_at is not null and gecerlilik_bitis_at <= ${simdi}::timestamptz
              for update skip locked)
            returning id`);
          ozet.kurum++;
          ozet.kaynak += guncellenen.length;
        },
      );
    } catch (err) {
      ozet.hata++;
      secenek.log?.error({ err, kurum_id: kurumId }, 'kaynak süreleri işlenemedi');
    }
  }
  return ozet;
}
