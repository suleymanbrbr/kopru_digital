import { islenmisOlaylariTemizle, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

/**
 * Zamanlanmis isler (worker, `motivasyon_sistem` baglantisi: BYPASSRLS). Hepsi idempotenttir ve coklu
 * worker guvenlidir.
 */
export interface IsBagimliliklari {
  db: Pick<Database, 'orm'>;
}

/**
 * Haftalik `bu_hafta_xp` sifirlama: her kurumun saat diliminde (04:00 kurali) icinde bulunulan hafta
 * (Pazartesi) `hafta_baslangic`tan ilerideyse `bu_hafta_xp = 0` yapilir. Hafta degistikten sonra herhangi
 * bir zamanda calistirilabilir; ikinci calistirma bir sey yapmaz. Etkilenen satir sayisini doner.
 */
export async function haftalikSifirla(d: IsBagimliliklari): Promise<number> {
  const satirlar = await d.db.orm.execute(sql`
    with kurumlar as (
      select distinct o.kurum_id,
             coalesce(k.saat_dilimi, 'Europe/Istanbul') as saat_dilimi
        from motivasyon.ogrenci_durumlari o
        left join motivasyon.kurum_kopyalari k on k.kurum_id = o.kurum_id
    ), haftalar as (
      select kurum_id,
             date_trunc('week', ((now() at time zone saat_dilimi) - interval '4 hours'))::date as hafta
        from kurumlar
    )
    update motivasyon.ogrenci_durumlari d
       set bu_hafta_xp = 0, hafta_baslangic = h.hafta
      from haftalar h
     where d.kurum_id = h.kurum_id and (d.hafta_baslangic is null or d.hafta_baslangic < h.hafta)
    returning d.id`);
  return satirlar.length;
}

export async function gunlukTemizlik(d: IsBagimliliklari): Promise<number> {
  return islenmisOlaylariTemizle(d.db);
}
