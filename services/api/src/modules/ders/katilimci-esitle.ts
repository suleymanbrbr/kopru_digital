import type { Tx } from '@kopru/service-kit';
import { sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { dersKatilimcilari, dersler } from '../../db/schema.js';
import { katilimciIdleri, dersOlayiYaz, type DersOlayBaglami } from './ders-deposu.js';

/**
 * Katilimci esitleme. Katilimcilar ders olusurken grubun etkin uyelerinden dondurulur; gruba sonradan
 * katilan ogrenci onceden uretilmis derslerde gorunmez, gruptan ayrilan listede kalir. Bu fonksiyon
 * YALNIZ `planli` derslerde listeyi grup uyeligiyle yeniden uyumlu hale getirir:
 *  - Ders yerel gununde etkin uye olup listede olmayan ogrenci `tur='uye'` olarak eklenir
 *    (`grup_uyeleri.baslangic_tarihi` ders gununden sonraysa eklenmez).
 *  - Uyeligi ders gununden once bitmis (ya da uyeligi etkin olmayan), yoklamasi olmayan `tur='uye'`
 *    satiri cikarilir. `misafir` ve `telafi` satirlarina ve yoklamasi olan satirlara dokunulmaz.
 * Idempotenttir: ikinci cagri hicbir sey degistirmez ve olay yazmaz. Degisen her ders icin
 * `ders.ders.degisti.v1` (`guncellendi`) ayni islemde yazilir.
 *
 * Bilinen sinir: planli bir derste gruptaki etkin bir ogrenciyi `DELETE .../katilimcilar/:id` ile elle
 * cikarmak bir sonraki esitlemede geri alinir (ders listesi grup uyeligiyle uyumludur); gelmeyecek
 * ogrenci yoklamada `izinli`/`gelmedi` ile isaretlenir.
 */
export type EsitlemeKapsami =
  { dersId: string } | { grupId: string; baslangictan: Date } | { dersIdleri: readonly string[] };

export interface EsitlemeSonucu {
  eklenen: number;
  cikarilan: number;
  degisenDersler: number;
}

const bos: EsitlemeSonucu = { eklenen: 0, cikarilan: 0, degisenDersler: 0 };

/** Ders yerel gunu (kurumun saat dilimine gore). */
const yerelGun = sql`(d.baslangic_at at time zone k.saat_dilimi)::date`;

const kimlikListesi = (idler: readonly string[]): SQL =>
  sql.join(
    idler.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

/** Eklenecek ogrenciler: ders gununde etkin uye, listede yok. */
const eklenecekler = (kurumId: string, idler: readonly string[]) => sql`
  select d.id as ders_id, gu.ogrenci_id
  from ders.dersler d
  join hesap.kurumlar k on k.id = d.kurum_id
  join hesap.grup_uyeleri gu on gu.kurum_id = d.kurum_id and gu.grup_id = d.grup_id
  join hesap.uyelikler u on u.kurum_id = gu.kurum_id and u.id = gu.ogrenci_id and u.durum = 'aktif'
  where d.kurum_id = ${kurumId} and d.id in (${kimlikListesi(idler)}) and d.durum = 'planli'
    and gu.baslangic_tarihi <= ${yerelGun}
    and (gu.bitis_tarihi is null or gu.bitis_tarihi >= ${yerelGun})
    and not exists (
      select 1 from ders.ders_katilimcilari dk
      where dk.ders_id = d.id and dk.ogrenci_id = gu.ogrenci_id)
  group by d.id, gu.ogrenci_id`;

/** Cikarilacaklar: `uye` satiri, yoklamasi yok, ders gununde (ya da sonrasinda) etkin uyeligi yok. */
const cikarilacaklar = (kurumId: string, idler: readonly string[]) => sql`
  select dk.id, dk.ders_id, dk.ogrenci_id
  from ders.ders_katilimcilari dk
  join ders.dersler d on d.id = dk.ders_id
  join hesap.kurumlar k on k.id = d.kurum_id
  where d.kurum_id = ${kurumId} and d.id in (${kimlikListesi(idler)}) and d.durum = 'planli'
    and dk.tur = 'uye'
    and not exists (
      select 1 from ders.yoklamalar y
      where y.ders_id = dk.ders_id and y.ogrenci_id = dk.ogrenci_id)
    and not exists (
      select 1 from hesap.grup_uyeleri gu
      join hesap.uyelikler u on u.kurum_id = gu.kurum_id and u.id = gu.ogrenci_id and u.durum = 'aktif'
      where gu.kurum_id = d.kurum_id and gu.grup_id = d.grup_id and gu.ogrenci_id = dk.ogrenci_id
        and (gu.bitis_tarihi is null or gu.bitis_tarihi >= ${yerelGun}))`;

/**
 * Esitleme gerektiren planli dersler (yalniz okur). Saatlik is kurum bazli calismadan once hangi
 * kurumlarda is oldugunu bulmak icin `kurumId = null` ile cagirir (`api_sistem`, RLS'siz).
 */
export async function esitlenecekDersler(
  tx: Pick<Tx, 'execute'>,
  kurumId: string | null,
  baslangictan: Date,
): Promise<{ kurum_id: string; ders_id: string }[]> {
  const kurumKosulu = kurumId === null ? sql`true` : sql`d.kurum_id = ${kurumId}`;
  const penceresi = sql`d.durum = 'planli' and d.baslangic_at >= ${baslangictan.toISOString()}::timestamptz and ${kurumKosulu}`;
  return tx.execute<{ kurum_id: string; ders_id: string }>(sql`
    select d.kurum_id, d.id as ders_id
    from ders.dersler d
    join hesap.kurumlar k on k.id = d.kurum_id
    where ${penceresi} and (
      exists (
        select 1
        from hesap.grup_uyeleri gu
        join hesap.uyelikler u on u.kurum_id = gu.kurum_id and u.id = gu.ogrenci_id and u.durum = 'aktif'
        where gu.kurum_id = d.kurum_id and gu.grup_id = d.grup_id
          and gu.baslangic_tarihi <= ${yerelGun}
          and (gu.bitis_tarihi is null or gu.bitis_tarihi >= ${yerelGun})
          and not exists (
            select 1 from ders.ders_katilimcilari dk
            where dk.ders_id = d.id and dk.ogrenci_id = gu.ogrenci_id))
      or exists (
        select 1 from ders.ders_katilimcilari dk
        where dk.ders_id = d.id and dk.tur = 'uye'
          and not exists (
            select 1 from ders.yoklamalar y
            where y.ders_id = dk.ders_id and y.ogrenci_id = dk.ogrenci_id)
          and not exists (
            select 1 from hesap.grup_uyeleri gu
            join hesap.uyelikler u on u.kurum_id = gu.kurum_id and u.id = gu.ogrenci_id and u.durum = 'aktif'
            where gu.kurum_id = d.kurum_id and gu.grup_id = d.grup_id and gu.ogrenci_id = dk.ogrenci_id
              and (gu.bitis_tarihi is null or gu.bitis_tarihi >= ${yerelGun}))))`);
}

/** Kapsamdaki planli ders kimlikleri. Ders satirlari kilitlenir (yoklama yazimiyla yarismasin). */
async function kapsamiCoz(tx: Tx, kurumId: string, kapsam: EsitlemeKapsami): Promise<string[]> {
  let adaylar: string[];
  if ('dersId' in kapsam) {
    adaylar = [kapsam.dersId];
  } else if ('dersIdleri' in kapsam) {
    adaylar = [...kapsam.dersIdleri];
  } else {
    const grupDersleri = await tx.execute<{ id: string }>(sql`
      select id from ders.dersler
      where kurum_id = ${kurumId} and grup_id = ${kapsam.grupId} and durum = 'planli'
        and baslangic_at >= ${kapsam.baslangictan.toISOString()}::timestamptz`);
    adaylar = grupDersleri.map((g) => g.id);
  }
  if (adaylar.length === 0) return [];
  // Kilit sirasi sabit (id): iki esitleme ayni anda calisirsa kilitlenme olmaz.
  const kilitli = await tx.execute<{ id: string }>(sql`
    select id from ders.dersler
    where kurum_id = ${kurumId} and id in (${kimlikListesi(adaylar)}) and durum = 'planli'
    order by id
    for update`);
  return kilitli.map((k) => k.id);
}

export async function dersKatilimcilariniEsitle(
  tx: Tx,
  kurumId: string,
  kapsam: EsitlemeKapsami,
  baglam: DersOlayBaglami,
  olusturanKullaniciId: string | null = null,
): Promise<EsitlemeSonucu> {
  const idler = await kapsamiCoz(tx, kurumId, kapsam);
  if (idler.length === 0) return bos;

  const eklenecek = await tx.execute<{ ders_id: string; ogrenci_id: string }>(
    eklenecekler(kurumId, idler),
  );
  const cikarilacak = await tx.execute<{ id: string; ders_id: string; ogrenci_id: string }>(
    cikarilacaklar(kurumId, idler),
  );
  if (eklenecek.length === 0 && cikarilacak.length === 0) return bos;

  let eklenen = 0;
  if (eklenecek.length > 0) {
    const yazilan = await tx
      .insert(dersKatilimcilari)
      .values(
        eklenecek.map((e) => ({
          id: uuidv7(),
          kurum_id: kurumId,
          created_by: olusturanKullaniciId,
          ders_id: e.ders_id,
          ogrenci_id: e.ogrenci_id,
          tur: 'uye',
        })),
      )
      .onConflictDoNothing()
      .returning({ id: dersKatilimcilari.id });
    eklenen = yazilan.length;
  }
  let cikarilan = 0;
  if (cikarilacak.length > 0) {
    const silinen = await tx.execute<{ id: string }>(sql`
      delete from ders.ders_katilimcilari
      where kurum_id = ${kurumId} and id in (${kimlikListesi(cikarilacak.map((c) => c.id))})
      returning id`);
    cikarilan = silinen.length;
  }

  const degisenIdler = [...new Set([...eklenecek, ...cikarilacak].map((s) => s.ders_id))];
  const degisenDersler = await tx
    .select()
    .from(dersler)
    .where(sql`${dersler.id} in (${kimlikListesi(degisenIdler)})`);
  for (const d of degisenDersler) {
    await dersOlayiYaz(tx, baglam, 'guncellendi', d, await katilimciIdleri(tx, d.id));
  }
  return { eklenen, cikarilan, degisenDersler: degisenDersler.length };
}
