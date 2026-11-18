import {
  HesapRaporOgrencilerSema,
  HesapRaporOzetSema,
  RAPOR_LISTE_MAKS,
  RaporListeSorguSema,
  RaporSorguSema,
  errorCodes,
  type RaporDonemi,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { kapsamdakiGruplar, kapsamdakiOgrenciler } from './kapsam.js';
import type { YetkiBaglami } from './kimlik.js';
import { requirePermission } from './yetki.js';

/**
 * Yonetici paneli: hesap modulunun gostergesi ve ortak rapor yardimcilari.
 *
 * GOSTERGE TANIMI (docs/schema/api.md "Yonetici paneli ve raporlar" ile ayni):
 *  - aktif ogrenci = kurumda `durum = 'aktif'` ogrenci uyeligi sayisi (rolun kapsaminda). Grup bazinda:
 *    grubun etkin (`bitis_tarihi` bos) aktif ogrenci uyeleri; ogretmen bazinda: etkin atandigi gruplardaki
 *    farkli aktif ogrenciler. Bir ogrenci birden cok grupta ise her grupta sayilir (satir toplami kurum
 *    toplamindan buyuk olabilir).
 *  - "etkin ogrenci" (son 7 gunde yoklama/odev/plan/soru etkinligi) ogrenme modulunun ozetindedir: etkinlik
 *    verisi o modulun tablolarindadir.
 *
 * Donem: son N takvim gunu (bugun dahil), kurum saat dilimiyle; sinirlar UTC `timestamptz` olarak doner.
 */

const kurumParamSema = z.object({ kurum_id: z.uuid() });

export interface RaporDonemBilgisi {
  donemGun: number;
  tz: string;
  /** Kurum yerel gunu `YYYY-MM-DD`, dahil. */
  baslangic: string;
  bitis: string;
  /** UTC ISO: donem [alt, ust) araligi. */
  alt: string;
  ust: string;
  /** Son 7 gunun (bugun dahil) alt siniri; "etkin ogrenci" icin. */
  yediAlt: string;
}

const ISO_UTC = `YYYY-MM-DD"T"HH24:MI:SS.US"Z"`;

/** Kurumun saat dilimine gore donem sinirlari (tek sorgu). */
export async function raporDonemi(
  tx: Tx,
  kurumId: string,
  donem: RaporDonemi,
): Promise<RaporDonemBilgisi> {
  const n = Number(donem);
  const [r] = await tx.execute<{
    tz: string;
    baslangic: string;
    bitis: string;
    alt: string;
    ust: string;
    yedi: string;
  }>(sql`
    with k as (
      select saat_dilimi as tz, (now() at time zone saat_dilimi)::date as bugun
      from hesap.kurumlar where id = ${kurumId}::uuid
    )
    select tz, (bugun - ${n - 1}::int)::text as baslangic, bugun::text as bitis,
      to_char(((bugun - ${n - 1}::int)::timestamp at time zone tz) at time zone 'UTC', ${ISO_UTC}::text) as alt,
      to_char(((bugun + 1)::timestamp at time zone tz) at time zone 'UTC', ${ISO_UTC}::text) as ust,
      to_char(((bugun - 6)::timestamp at time zone tz) at time zone 'UTC', ${ISO_UTC}::text) as yedi
    from k`);
  if (!r) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
  return {
    donemGun: n,
    tz: r.tz,
    baslangic: r.baslangic,
    bitis: r.bitis,
    alt: r.alt,
    ust: r.ust,
    yediAlt: r.yedi,
  };
}

/** Rapor yanitlarinin ortak donem alani. */
export const donemAlani = (d: RaporDonemBilgisi, y: YetkiBaglami) => ({
  donem_gun: d.donemGun,
  baslangic: d.baslangic,
  bitis: d.bitis,
  kapsam: y.kapsam,
});

const kiraci = (y: YetkiBaglami) => ({
  kurumId: y.kurumId,
  kullaniciId: y.kullaniciId,
  roller: [y.rol],
});

/** Hesap ozeti: aktif ogrenci sayisi ile grup ve ogretmen dizini (panelin satir iskeleti). */
export async function hesapRaporOzeti(
  tx: Tx,
  y: YetkiBaglami,
  donem: RaporDonemi,
): Promise<z.infer<typeof HesapRaporOzetSema>> {
  const d = await raporDonemi(tx, y.kurumId, donem);
  const ogrenciler = kapsamdakiOgrenciler(tx, y);
  const gruplar = kapsamdakiGruplar(tx, y);

  const [toplam] = await tx.execute<{ n: number }>(
    sql`select count(*)::int as n from hesap.uyelikler where id in ${ogrenciler}`,
  );
  const grupSatirlari = await tx.execute<{
    grup_id: string;
    ad: string;
    tur: string;
    aktif_ogrenci: number;
  }>(sql`
    select g.id as grup_id, g.ad, g.tur,
      (count(gu.ogrenci_id) filter (where gu.ogrenci_id in ${ogrenciler}))::int as aktif_ogrenci
    from hesap.gruplar g
    left join hesap.grup_uyeleri gu on gu.grup_id = g.id and gu.bitis_tarihi is null
    where g.kurum_id = ${y.kurumId}::uuid and g.durum = 'aktif' and g.arsivlendi_at is null
      and g.id in ${gruplar}
    group by g.id
    order by g.ad collate "tr-TR-x-icu", g.id`);
  const ogretmenSatirlari = await tx.execute<{
    ogretmen_id: string;
    gorunen_ad: string | null;
    grup_sayisi: number;
    aktif_ogrenci: number;
  }>(sql`
    select u.id as ogretmen_id, coalesce(u.gorunen_ad, k.gorunen_ad) as gorunen_ad,
      count(distinct a.grup_id)::int as grup_sayisi,
      (count(distinct gu.ogrenci_id) filter (where gu.ogrenci_id in ${ogrenciler}))::int as aktif_ogrenci
    from hesap.atamalar a
    join hesap.gruplar g on g.id = a.grup_id and g.durum = 'aktif' and g.arsivlendi_at is null
    join hesap.uyelikler u on u.id = a.ogretmen_id and u.durum = 'aktif'
    join hesap.kullanicilar k on k.id = u.kullanici_id
    left join hesap.grup_uyeleri gu on gu.grup_id = a.grup_id and gu.bitis_tarihi is null
    where a.kurum_id = ${y.kurumId}::uuid
      and (a.bitis_tarihi is null or a.bitis_tarihi > current_date)
      and a.grup_id in ${gruplar}
    group by u.id, coalesce(u.gorunen_ad, k.gorunen_ad)
    order by coalesce(u.gorunen_ad, k.gorunen_ad) collate "tr-TR-x-icu", u.id`);

  return {
    ...donemAlani(d, y),
    kurum: {
      aktif_ogrenci: toplam?.n ?? 0,
      grup_sayisi: grupSatirlari.length,
      ogretmen_sayisi: ogretmenSatirlari.length,
    },
    gruplar: grupSatirlari.map((g) => ({ ...g })),
    ogretmenler: ogretmenSatirlari.map((o) => ({ ...o })),
  };
}

/** Ogrenci listesi (aktif ogrenci sayisinin altindaki liste): grup ve/veya ogretmen suzgeci. */
async function ogrenciListesi(
  tx: Tx,
  y: YetkiBaglami,
  suzgec: { grupId?: string | undefined; ogretmenId?: string | undefined },
): Promise<z.infer<typeof HesapRaporOgrencilerSema>> {
  const ogrenciler = kapsamdakiOgrenciler(tx, y);
  const gruplar = kapsamdakiGruplar(tx, y);
  const grupKosulu = suzgec.grupId
    ? sql`and u.id in (select ogrenci_id from hesap.grup_uyeleri
          where grup_id = ${suzgec.grupId}::uuid and bitis_tarihi is null)
        and ${suzgec.grupId}::uuid in ${gruplar}`
    : sql``;
  const ogretmenKosulu = suzgec.ogretmenId
    ? sql`and u.id in (select gu2.ogrenci_id from hesap.grup_uyeleri gu2
          join hesap.atamalar a on a.grup_id = gu2.grup_id
          where gu2.bitis_tarihi is null and a.ogretmen_id = ${suzgec.ogretmenId}::uuid
            and (a.bitis_tarihi is null or a.bitis_tarihi > current_date)
            and gu2.grup_id in ${gruplar})`
    : sql``;
  const satirlar = await tx.execute<{
    ogrenci_id: string;
    gorunen_ad: string | null;
    gruplar: string[];
    toplam: number;
  }>(sql`
    select u.id as ogrenci_id, coalesce(u.gorunen_ad, k.gorunen_ad) as gorunen_ad,
      coalesce(array_agg(g.ad order by g.ad) filter (where g.id is not null), '{}') as gruplar,
      (count(*) over())::int as toplam
    from hesap.uyelikler u
    join hesap.kullanicilar k on k.id = u.kullanici_id
    left join hesap.grup_uyeleri gu on gu.ogrenci_id = u.id and gu.bitis_tarihi is null
    left join hesap.gruplar g on g.id = gu.grup_id and g.durum = 'aktif' and g.arsivlendi_at is null
    where u.id in ${ogrenciler} ${grupKosulu} ${ogretmenKosulu}
    group by u.id, coalesce(u.gorunen_ad, k.gorunen_ad)
    order by coalesce(u.gorunen_ad, k.gorunen_ad) collate "tr-TR-x-icu", u.id
    limit ${RAPOR_LISTE_MAKS}`);
  return {
    toplam_satir: satirlar[0]?.toplam ?? 0,
    satirlar: satirlar.map((s) => ({
      ogrenci_id: s.ogrenci_id,
      gorunen_ad: s.gorunen_ad,
      gruplar: s.gruplar,
    })),
  };
}

/** `/v1/hesap/kurumlar/:kurum_id/rapor/*`. */
export const raporYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const oku = { preHandler: requirePermission('rapor.oku', { scope: 'grup' }) };
  const yetkiAl = (request: { yetki: YetkiBaglami | null }): YetkiBaglami => {
    if (!request.yetki) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
    return request.yetki;
  };
  app.get(
    '/kurumlar/:kurum_id/rapor/ozet',
    {
      ...oku,
      schema: {
        tags: ['hesap'],
        summary:
          'Yonetici paneli: aktif ogrenci sayisi ile grup ve ogretmen dizini. Ogretmen yalniz atandigi gruplari gorur.',
        params: kurumParamSema,
        querystring: RaporSorguSema,
        response: { 200: HesapRaporOzetSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), (tx) => hesapRaporOzeti(tx, y, request.query.donem));
    },
  );

  app.get(
    '/kurumlar/:kurum_id/rapor/ogrenciler',
    {
      ...oku,
      schema: {
        tags: ['hesap'],
        summary:
          'Aktif ogrenci listesi (panelde sayiya tiklaninca): grup ve/veya ogretmen suzgeci; en cok 200 satir, `toplam_satir` gercek sayi.',
        params: kurumParamSema,
        querystring: RaporListeSorguSema,
        response: { 200: HesapRaporOgrencilerSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { grup_id: grupId, ogretmen_id: ogretmenId } = request.query;
      return withTenant(db, kiraci(y), (tx) => ogrenciListesi(tx, y, { grupId, ogretmenId }));
    },
  );

  return Promise.resolve();
};
