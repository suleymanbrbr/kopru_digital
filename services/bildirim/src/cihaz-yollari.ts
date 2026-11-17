import {
  BildirimCihazKayitSema,
  BildirimCihazYanitiSema,
  bildirimCihazYolParamSema,
} from '@kopru/contracts';
import type { ServicePlugin } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { kullaniciKimligi } from './kimlik.js';
import { yeniId } from './ortak.js';

/**
 * Cihaz uclari (kullanici duzeyi; `cihazlar` RLS'i kullanici kollu).
 *
 * - `PUT /v1/bildirim/cihazlar`: kayit/guncelle (her acilista; `son_gorulme_at` tazelenir). Ayni belirtec
 *   baska kullanicinin ETKIN satirindaysa o satir pasiflenir (cihaz el degistirdi). Pasiflestirme yetkisi,
 *   belirteci sunan istegin `app.devir_belirteci` degiskeniyle RLS devir politikasindan gelir.
 * - `DELETE /v1/bildirim/cihazlar/{cihaz_kimligi}`: cikista kaydi siler (idempotent).
 */
export function cihazYollari(secenek: { simdi: () => Date }): ServicePlugin {
  return (app) => {
    const { db } = app;
    if (!db) return Promise.resolve();

    app.put(
      '/v1/bildirim/cihazlar',
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Push cihazini kaydeder ya da gunceller (her uygulama acilisinda). Ayni belirtec baska kullanicidaysa onun kaydi pasiflenir.',
          body: BildirimCihazKayitSema,
          response: { 200: BildirimCihazYanitiSema },
        },
      },
      async (request) => {
        const { kullaniciId } = kullaniciKimligi(request);
        const b = request.body;
        const an = secenek.simdi().toISOString();
        await db.orm.transaction(async (tx) => {
          await tx.execute(sql`
            select set_config('app.kullanici_id', ${kullaniciId}, true),
                   set_config('app.devir_belirteci', ${b.push_belirteci}, true)`);
          await tx.execute(sql`
            update bildirim.cihazlar set aktif = false
             where push_belirteci = ${b.push_belirteci} and aktif
               and not (kullanici_id = ${kullaniciId} and cihaz_kimligi = ${b.cihaz_kimligi})`);
          await tx.execute(sql`
            insert into bildirim.cihazlar
              (id, kullanici_id, platform, push_belirteci, cihaz_kimligi, uygulama_surumu, dil,
               aktif, gecersiz_at, son_gorulme_at)
            values (${yeniId()}, ${kullaniciId}, ${b.platform}, ${b.push_belirteci}, ${b.cihaz_kimligi},
                    ${b.uygulama_surumu ?? null}, ${b.dil ?? 'tr'}, true, null, ${an}::timestamptz)
            on conflict (kullanici_id, cihaz_kimligi) do update
              set platform = excluded.platform, push_belirteci = excluded.push_belirteci,
                  uygulama_surumu = excluded.uygulama_surumu, dil = excluded.dil,
                  aktif = true, gecersiz_at = null, son_gorulme_at = excluded.son_gorulme_at`);
        });
        return { cihaz_kimligi: b.cihaz_kimligi, aktif: true };
      },
    );

    app.delete(
      '/v1/bildirim/cihazlar/:cihaz_kimligi',
      {
        schema: {
          tags: ['bildirim'],
          summary: 'Cikista cihaz kaydini siler (kayit yoksa da basarili).',
          params: bildirimCihazYolParamSema,
          response: { 200: BildirimCihazYanitiSema },
        },
      },
      async (request) => {
        const { kullaniciId } = kullaniciKimligi(request);
        const { cihaz_kimligi: cihazKimligi } = request.params;
        await db.orm.transaction(async (tx) => {
          await tx.execute(sql`select set_config('app.kullanici_id', ${kullaniciId}, true)`);
          await tx.execute(sql`
            delete from bildirim.cihazlar
             where kullanici_id = ${kullaniciId} and cihaz_kimligi = ${cihazKimligi}`);
        });
        return { cihaz_kimligi: cihazKimligi, aktif: false };
      },
    );

    return Promise.resolve();
  };
}
