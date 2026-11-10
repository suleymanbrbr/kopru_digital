import { TeslimListeSorguSema, TeslimListeYanitSema, errorCodes } from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, eq, sql } from 'drizzle-orm';

import { odevler, ogrenciOdevleri } from '../../db/schema.js';
import { gorunenAdlar, modulAcikMi, requirePermission } from '../hesap/index.js';
import { dogruOrani, kiraci, kurumParam, odevKapsami, yetkiAl } from './odev-deposu.js';

/** Imlec: `<teslim_at (PostgreSQL metni, mikrosaniye korunur)>|<satir kimligi>`, base64url. */
function imlecCoz(imlec: string | undefined): { ts: string; id: string } | undefined {
  if (imlec === undefined) return undefined;
  const [ts, id] = Buffer.from(imlec, 'base64url').toString('utf8').split('|');
  if (!ts || !id || Number.isNaN(Date.parse(ts)) || !/^[0-9a-f-]{36}$/.test(id)) {
    throw new AppError(400, errorCodes.validation, 'İmleç geçersiz.');
  }
  return { ts, id };
}
const imlecYaz = (ts: string, id: string) =>
  Buffer.from(`${ts}|${id}`, 'utf8').toString('base64url');

/** Ogretmen/yonetici "inceleme bekleyenler" ucu (`/v1/ogrenme/kurumlar/:kurum_id/teslimler`). */
export const odevTeslimYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;

  app.get(
    '/kurumlar/:kurum_id/teslimler',
    {
      preHandler: requirePermission('odev.oku', { scope: 'grup' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Teslim satirlari (varsayilan `teslim_edildi`: inceleme bekleyenler), teslim zamanina gore eskiden yeniye, anahtar tabanli sayfali. Ogretmen yalniz kendi verdigi odevlerin satirlarini, sahip/yonetici kapsamindakileri gorur. Ogrenci 403; `odev` modulu kapaliysa 403.',
        params: kurumParam,
        querystring: TeslimListeSorguSema,
        response: { 200: TeslimListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      if (y.rol === 'ogrenci' || y.rol === 'veli') {
        throw new AppError(403, errorCodes.izinYok, 'Bu listeyi görme yetkiniz yok.');
      }
      const { durum, limit, imlec } = request.query;
      const son = imlecCoz(imlec);
      return withTenant(db, kiraci(y), async (tx) => {
        if (!(await modulAcikMi(tx, y.kurumId, 'odev'))) {
          throw new AppError(403, errorCodes.modulKapali, 'Ödev özelliği kapalı.');
        }
        const ts = sql<string>`${ogrenciOdevleri.teslim_at}::text`;
        const satirlar = await tx
          .select({ s: ogrenciOdevleri, o: odevler, ts })
          .from(ogrenciOdevleri)
          .innerJoin(odevler, eq(odevler.id, ogrenciOdevleri.odev_id))
          .where(
            and(
              eq(ogrenciOdevleri.kurum_id, y.kurumId),
              eq(ogrenciOdevleri.durum, durum),
              odevKapsami(tx, y),
              y.rol === 'ogretmen' ? eq(odevler.veren_id, y.uyelikId) : undefined,
              son
                ? sql`(${ogrenciOdevleri.teslim_at}, ${ogrenciOdevleri.id}) > (${son.ts}::timestamptz, ${son.id}::uuid)`
                : undefined,
            ),
          )
          .orderBy(sql`${ogrenciOdevleri.teslim_at} asc nulls last`, ogrenciOdevleri.id)
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        const adlar = await gorunenAdlar(
          tx,
          sayfa.map((r) => r.s.ogrenci_id),
        );
        const sonSatir = sayfa.at(-1);
        return {
          teslimler: sayfa.map(({ s, o }) => ({
            ogrenci_odev_id: s.id,
            odev_id: o.id,
            odev_baslik: o.baslik,
            brans_kodu: o.brans_kodu,
            ogrenci_id: s.ogrenci_id,
            gorunen_ad: adlar.get(s.ogrenci_id) ?? null,
            durum: s.durum as 'teslim_edildi',
            teslim_at: s.teslim_at?.toISOString() ?? null,
            son_teslim_at: s.son_teslim_at?.toISOString() ?? null,
            gec_teslim: s.gec_teslim,
            yapilan_soru_sayisi: s.yapilan_soru_sayisi,
            dogru_sayisi: s.dogru_sayisi,
            yanlis_sayisi: s.yanlis_sayisi,
            bos_sayisi: s.bos_sayisi,
            dogru_orani: dogruOrani(s.dogru_sayisi, s.yapilan_soru_sayisi),
          })),
          sonraki_imlec:
            satirlar.length > limit && sonSatir ? imlecYaz(sonSatir.ts, sonSatir.s.id) : null,
        };
      });
    },
  );

  return Promise.resolve();
};
