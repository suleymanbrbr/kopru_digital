import {
  DenemeGelisimSema,
  DenemeGelisimSorguSema,
  DenemeGrupOzetSema,
  DenemeGrupOzetSorguSema,
  errorCodes,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { gruplar } from '../../db/schema.js';
import {
  gorunenAdlar,
  grupEtkinOgrencileri,
  grupKapsami,
  requirePermission,
} from '../hesap/index.js';
import {
  denemeModuluAcikOlmali,
  kapsamdakiOgrenciler,
  ogrenciBulunamadi,
} from './deneme-deposu.js';
import { kiraci, kurumParam, yetkiAl } from './odev-deposu.js';

const ogrenciParam = kurumParam.extend({ id: z.uuid() });

/** Rastgele deger yok: yalniz onayli sonuclar. Siralama ve ortalamalar SQL'dedir. */
const ONAYLI = sql`d.onay_durumu = 'onaylandi'`;

/** Deneme analizi: ogrenci gelisimi ve grup ozeti (`/v1/ogrenme/kurumlar/:kurum_id/...`). */
export const denemeAnalizYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:id/deneme-gelisim',
    {
      preHandler: requirePermission('deneme.oku'),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin deneme gelisimi (yalniz ONAYLI sonuclar): toplam ve bolum bazinda trend (eskiden yeniye, son `limit`), son 5 ortalamasi, onceki 5 ile degisim. Ogretmen yalniz atandigi grubun ogrencisini, ogrenci yalniz kendini gorur; kapsam disi 404.',
        params: ogrenciParam,
        querystring: DenemeGelisimSorguSema,
        response: { 200: DenemeGelisimSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const ogrenciId = request.params.id;
      const { kural, limit } = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        const ogrenci = (await kapsamdakiOgrenciler(tx, y, [ogrenciId], false)).get(ogrenciId);
        if (!ogrenci) throw ogrenciBulunamadi();
        await denemeModuluAcikOlmali(tx, y.kurumId, ogrenci);
        const kosul = sql`d.kurum_id = ${y.kurumId}::uuid and d.ogrenci_id = ${ogrenciId}::uuid and d.kural_kodu = ${kural} and ${ONAYLI}`;

        const noktalar = await tx.execute<{
          id: string;
          ad: string;
          sinav_tarihi: string;
          toplam_net: number;
        }>(sql`
          select id, ad, sinav_tarihi, toplam_net from (
            select d.id, d.ad, d.sinav_tarihi::text as sinav_tarihi, d.toplam_net::float8 as toplam_net, d.sinav_tarihi as t
            from ogrenme.denemeler d where ${kosul}
            order by d.sinav_tarihi desc, d.id desc limit ${limit}
          ) son order by t asc, id asc`);
        const bolumler =
          noktalar.length === 0
            ? []
            : await tx.execute<{
                deneme_id: string;
                bolum_kodu: string;
                brans_kodu: string;
                net: number;
              }>(sql`
                select b.deneme_id, b.bolum_kodu, b.brans_kodu, b.net::float8 as net
                from ogrenme.deneme_bolumleri b
                where b.kurum_id = ${y.kurumId}::uuid
                  and b.deneme_id in (${sql.join(
                    noktalar.map((n) => sql`${n.id}::uuid`),
                    sql`, `,
                  )})
                order by b.id`);

        const [toplam] = await tx.execute<{
          deneme_sayisi: number;
          son5_sayisi: number;
          son5_ortalama: number | null;
          onceki5_sayisi: number;
          onceki5_ortalama: number | null;
          degisim: number | null;
        }>(sql`
          with s as (
            select d.toplam_net, row_number() over (order by d.sinav_tarihi desc, d.id desc) as rn
            from ogrenme.denemeler d where ${kosul}
          )
          select count(*)::int as deneme_sayisi,
                 (count(*) filter (where rn <= 5))::int as son5_sayisi,
                 round(avg(toplam_net) filter (where rn <= 5), 2)::float8 as son5_ortalama,
                 (count(*) filter (where rn between 6 and 10))::int as onceki5_sayisi,
                 round(avg(toplam_net) filter (where rn between 6 and 10), 2)::float8 as onceki5_ortalama,
                 round(avg(toplam_net) filter (where rn <= 5) - avg(toplam_net) filter (where rn between 6 and 10), 2)::float8 as degisim
          from s`);

        const bolumGelisimi = await tx.execute<{
          bolum_kodu: string;
          brans_kodu: string;
          son5_ortalama: number | null;
          onceki5_ortalama: number | null;
          degisim: number | null;
        }>(sql`
          with s as (
            select d.id, row_number() over (order by d.sinav_tarihi desc, d.id desc) as rn
            from ogrenme.denemeler d where ${kosul}
          )
          select b.bolum_kodu, min(b.brans_kodu) as brans_kodu,
                 round(avg(b.net) filter (where s.rn <= 5), 2)::float8 as son5_ortalama,
                 round(avg(b.net) filter (where s.rn between 6 and 10), 2)::float8 as onceki5_ortalama,
                 round(avg(b.net) filter (where s.rn <= 5) - avg(b.net) filter (where s.rn between 6 and 10), 2)::float8 as degisim
          from s join ogrenme.deneme_bolumleri b on b.deneme_id = s.id
          where b.kurum_id = ${y.kurumId}::uuid
          group by b.bolum_kodu order by b.bolum_kodu`);

        return {
          ogrenci_id: ogrenciId,
          kural_kodu: kural,
          deneme_sayisi: toplam?.deneme_sayisi ?? 0,
          noktalar: noktalar.map((n) => ({
            deneme_id: n.id,
            ad: n.ad,
            sinav_tarihi: n.sinav_tarihi,
            toplam_net: n.toplam_net,
            bolumler: bolumler
              .filter((b) => b.deneme_id === n.id)
              .map((b) => ({ bolum_kodu: b.bolum_kodu, brans_kodu: b.brans_kodu, net: b.net })),
          })),
          son5_sayisi: toplam?.son5_sayisi ?? 0,
          son5_ortalama: toplam?.son5_ortalama ?? null,
          onceki5_sayisi: toplam?.onceki5_sayisi ?? 0,
          onceki5_ortalama: toplam?.onceki5_ortalama ?? null,
          degisim: toplam?.degisim ?? null,
          bolum_gelisimi: [...bolumGelisimi],
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/gruplar/:id/deneme-ozet',
    {
      preHandler: requirePermission('deneme.oku', {
        scope: 'grup',
        modulBaglami: (request) => ({ grupId: (request.params as { id?: string }).id ?? null }),
      }),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Grup deneme ozeti (yalniz ogretmen/yonetici; ogrenciye kapali 403): ogrenci basina deneme sayisi, son net ve son 5 ortalamasi; sinif ortalamasi (ogrencilerin son 5 ortalamalarinin ortalamasi) ve bolum ortalamalari. Yalniz onayli sonuclar; hesaplama SQL de.',
        params: ogrenciParam,
        querystring: DenemeGrupOzetSorguSema,
        response: { 200: DenemeGrupOzetSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const grupId = request.params.id;
      const { kural } = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        const [g] = await tx
          .select({ id: gruplar.id })
          .from(gruplar)
          .where(and(eq(gruplar.id, grupId), eq(gruplar.kurum_id, y.kurumId), grupKapsami(tx, y)));
        if (!g) throw new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
        const uyeler = await grupEtkinOgrencileri(tx, grupId);
        const adlar = await gorunenAdlar(tx, uyeler);
        const idListesi =
          uyeler.length === 0
            ? sql`(select null::uuid where false)`
            : sql`(${sql.join(
                uyeler.map((u) => sql`${u}::uuid`),
                sql`, `,
              )})`;
        const kosul = sql`d.kurum_id = ${y.kurumId}::uuid and d.kural_kodu = ${kural} and ${ONAYLI} and d.ogrenci_id in ${idListesi}`;
        const ogrenciSatirlari =
          uyeler.length === 0
            ? []
            : await tx.execute<{
                ogrenci_id: string;
                deneme_sayisi: number;
                son_net: number | null;
                son5_ortalama: number | null;
                sinif_ortalamasi: number | null;
              }>(sql`
              with s as (
                select d.ogrenci_id, d.toplam_net,
                       row_number() over (partition by d.ogrenci_id order by d.sinav_tarihi desc, d.id desc) as rn
                from ogrenme.denemeler d where ${kosul}
              )
              select ogrenci_id,
                     count(*)::int as deneme_sayisi,
                     ((array_agg(toplam_net order by rn))[1])::float8 as son_net,
                     round(avg(toplam_net) filter (where rn <= 5), 2)::float8 as son5_ortalama,
                     round(avg(avg(toplam_net) filter (where rn <= 5)) over (), 2)::float8 as sinif_ortalamasi
              from s group by ogrenci_id`);
        const bolumOrtalamalari =
          uyeler.length === 0
            ? []
            : await tx.execute<{ bolum_kodu: string; brans_kodu: string; ortalama: number }>(sql`
              with s as (
                select d.id, d.ogrenci_id,
                       row_number() over (partition by d.ogrenci_id order by d.sinav_tarihi desc, d.id desc) as rn
                from ogrenme.denemeler d where ${kosul}
              )
              select bolum_kodu, brans_kodu, round(avg(ort), 2)::float8 as ortalama from (
                select s.ogrenci_id, b.bolum_kodu, min(b.brans_kodu) as brans_kodu, avg(b.net) as ort
                from s join ogrenme.deneme_bolumleri b on b.deneme_id = s.id
                where s.rn <= 5 and b.kurum_id = ${y.kurumId}::uuid
                group by s.ogrenci_id, b.bolum_kodu
              ) t group by bolum_kodu, brans_kodu order by bolum_kodu`);
        const harita = new Map(ogrenciSatirlari.map((r) => [r.ogrenci_id, r]));
        const ogrenciler = uyeler
          .map((id) => {
            const r = harita.get(id);
            return {
              ogrenci_id: id,
              gorunen_ad: adlar.get(id) ?? null,
              deneme_sayisi: r?.deneme_sayisi ?? 0,
              son_net: r?.son_net ?? null,
              son5_ortalama: r?.son5_ortalama ?? null,
            };
          })
          .sort(
            (a, b) =>
              (a.gorunen_ad ?? '￿').localeCompare(b.gorunen_ad ?? '￿', 'tr') ||
              a.ogrenci_id.localeCompare(b.ogrenci_id),
          );
        return {
          grup_id: grupId,
          kural_kodu: kural,
          ogrenci_sayisi: uyeler.length,
          denemesi_olan_sayisi: ogrenciSatirlari.length,
          sinif_ortalamasi: ogrenciSatirlari[0]?.sinif_ortalamasi ?? null,
          bolum_ortalamalari: [...bolumOrtalamalari],
          ogrenciler,
        };
      });
    },
  );

  return Promise.resolve();
};
