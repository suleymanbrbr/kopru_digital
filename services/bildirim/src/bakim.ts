import { islenmisOlaylariTemizle, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

/**
 * Gece bakim isleri (worker, `bildirim_sistem`: BYPASSRLS). Idempotent ve coklu worker guvenlidir.
 *
 * - 60 gundur gorulmeyen cihaz pasif olur (`aktif = false`; `gecersiz_at` yalniz saglayici reddedince dolar).
 * - `bildirimler` 90 gun, `gonderimler` 180 gun sonra silinir (docs/schema/bildirim.md).
 * - 30 gunden eski `processed_events` satirlari silinir.
 */
export const CIHAZ_PASIF_GUN = 60;
export const BILDIRIM_SAKLAMA_GUN = 90;
export const GONDERIM_SAKLAMA_GUN = 180;

export interface BakimOzeti {
  pasiflenenCihaz: number;
  silinenBildirim: number;
  silinenGonderim: number;
  silinenOlay: number;
}

export async function bakimIsi(d: {
  db: Pick<Database, 'orm'>;
  simdi?: () => Date;
}): Promise<BakimOzeti> {
  const simdi = (d.simdi ?? (() => new Date()))().toISOString();
  const gunOnce = (gun: number) => sql`${simdi}::timestamptz - make_interval(days => ${gun})`;

  const cihaz = await d.db.orm.execute(sql`
    update bildirim.cihazlar set aktif = false
     where aktif and son_gorulme_at < ${gunOnce(CIHAZ_PASIF_GUN)}
    returning 1`);
  const bildirim = await d.db.orm.execute(sql`
    delete from bildirim.bildirimler where created_at < ${gunOnce(BILDIRIM_SAKLAMA_GUN)}
    returning 1`);
  const gonderim = await d.db.orm.execute(sql`
    delete from bildirim.gonderimler where created_at < ${gunOnce(GONDERIM_SAKLAMA_GUN)}
    returning 1`);
  const olay = await islenmisOlaylariTemizle(d.db);
  return {
    pasiflenenCihaz: cihaz.length,
    silinenBildirim: bildirim.length,
    silinenGonderim: gonderim.length,
    silinenOlay: olay,
  };
}
