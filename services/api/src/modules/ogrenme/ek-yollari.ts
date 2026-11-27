import { EkKumesiGirdiSema, EkListesiSema, errorCodes, odevHataKodlari } from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { odevler, ogrenciOdevleri } from '../../db/schema.js';
import { requirePermission } from '../hesap/index.js';
import {
  ODEV_EK_KAYNAGI,
  PLAN_EK_KAYNAGI,
  ekListesiYaniti,
  ekSatirlari,
  ekleriEsitle,
} from './ek-deposu.js';
import {
  kiraci,
  kurumParam,
  odevBul,
  odevBulunamadi,
  odevDenetimiYaz,
  odevParam,
  olayBaglami,
  yazilacakOdevBul,
  yetkiAl,
} from './odev-deposu.js';
import {
  ogrenciOlmali,
  ogrenciPlaniBul,
  planBul,
  planDenetimiYaz,
  planParam,
  yazilacakPlanBul,
} from './plan-deposu.js';

const satirParam = kurumParam.extend({ id: z.uuid() });

/**
 * Odev ve haftalik plan ek dosyalari (PDF/fotograf). Yukleme `medya` servisinin mevcut akisiyla yapilir
 * (`odev_eki` / `plan_eki` turu, personel); burada hazir dosyalar kayda baglanir ve okuma adresleri verilir.
 */
export const ekYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const odevOku = { preHandler: requirePermission('odev.oku', { scope: 'grup' }) };
  const odevVer = { preHandler: requirePermission('odev.ver', { scope: 'grup' }) };
  const planOku = { preHandler: requirePermission('plan.oku', { scope: 'grup' }) };
  const planYaz = { preHandler: requirePermission('plan.gorev.yaz', { scope: 'grup' }) };

  // --- Odev (ogretmen/yonetici) -----------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/odevler/:id/ekler',
    {
      ...odevOku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Odev ekleri (sirali) ve kisa omurlu okuma adresleri (10 dk). Kapsam disi odev 404. Medya yanit vermezse `adresler_alinamadi`.',
        params: odevParam,
        response: { 200: EkListesiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const satirlar = await withTenant(db, kiraci(y), async (tx) => {
        const o = await odevBul(tx, y, request.params.id);
        return ekSatirlari(tx, ODEV_EK_KAYNAGI, o.id);
      });
      return ekListesiYaniti(app, y.kurumId, satirlar);
    },
  );

  app.put(
    '/kurumlar/:kurum_id/odevler/:id/ekler',
    {
      ...odevVer,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Odev ek kumesini verilen listeye esitler (en cok 10, sirali). Dosyalar hazir `odev_eki`, cagiranin kendi yuklemesi ve baska kayda bagli degildir (409 `dosya_hazir_degil`, `dosya_zaten_bagli`; 422 `dosya_gecersiz`). Cikarilan dosya medyada hemen silinir. Taslak ve yayindaki odevde yazilir; kapali odevde 409. Ogretmen yalniz kendi odevini degistirir (baskasi 403).',
        params: odevParam,
        body: EkKumesiGirdiSema,
        response: { 200: EkListesiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const baglam = olayBaglami(y, request.correlationId);
      const satirlar = await withTenant(db, kiraci(y), async (tx) => {
        const o = await yazilacakOdevBul(tx, y, request.params.id);
        if (o.durum === 'kapali') {
          throw new AppError(409, odevHataKodlari.odevKapali, 'Ödev kapatılmış.');
        }
        const sonuc = await ekleriEsitle(
          tx,
          y,
          baglam,
          ODEV_EK_KAYNAGI,
          o.id,
          request.body.medya_dosya_idleri,
        );
        if (sonuc.eklenen + sonuc.cikarilan > 0) {
          await odevDenetimiYaz(tx, y, request.ip, 'odev.ek_guncelle', 'odev', o.id, null, {
            eklenen: sonuc.eklenen,
            cikarilan: sonuc.cikarilan,
            ek_sayisi: request.body.medya_dosya_idleri.length,
          });
        }
        return ekSatirlari(tx, ODEV_EK_KAYNAGI, o.id);
      });
      return ekListesiYaniti(app, y.kurumId, satirlar);
    },
  );

  // --- Odev (ogrenci) ---------------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/ogrenci-odevleri/:id/ekler',
    {
      preHandler: requirePermission('odev.oku', { scope: 'kendi' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin kendi odev satirinin ekleri ve okuma adresleri (taslak odev ve iptal satir 404; baskasinin satiri 404).',
        params: satirParam,
        response: { 200: EkListesiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      if (y.rol !== 'ogrenci') {
        throw new AppError(403, errorCodes.izinYok, 'Bu uç yalnızca öğrenciler içindir.');
      }
      const satirlar = await withTenant(db, kiraci(y), async (tx) => {
        const [r] = await tx
          .select({ odev_id: odevler.id })
          .from(ogrenciOdevleri)
          .innerJoin(odevler, eq(odevler.id, ogrenciOdevleri.odev_id))
          .where(
            and(
              eq(ogrenciOdevleri.id, request.params.id),
              eq(ogrenciOdevleri.kurum_id, y.kurumId),
              eq(ogrenciOdevleri.ogrenci_id, y.uyelikId),
              ne(ogrenciOdevleri.durum, 'iptal'),
              ne(odevler.durum, 'taslak'),
            ),
          );
        if (!r) throw odevBulunamadi();
        return ekSatirlari(tx, ODEV_EK_KAYNAGI, r.odev_id);
      });
      return ekListesiYaniti(app, y.kurumId, satirlar);
    },
  );

  // --- Haftalik plan (ogretmen/yonetici) --------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/planlar/:id/ekler',
    {
      ...planOku,
      schema: {
        tags: ['ogrenme'],
        summary: 'Plan ekleri (hazir plan PDF/resim) ve okuma adresleri (kapsam disi plan 404).',
        params: planParam,
        response: { 200: EkListesiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const satirlar = await withTenant(db, kiraci(y), async (tx) => {
        const p = await planBul(tx, y, request.params.id);
        return ekSatirlari(tx, PLAN_EK_KAYNAGI, p.id);
      });
      return ekListesiYaniti(app, y.kurumId, satirlar);
    },
  );

  app.put(
    '/kurumlar/:kurum_id/planlar/:id/ekler',
    {
      ...planYaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Plan ek kumesini verilen listeye esitler (en cok 10, sirali): hazir plani PDF/resim olarak yukleme. Dosyalar hazir `plan_eki`, cagiranin kendi yuklemesi ve baska kayda bagli degildir. Yayindaki planda da yazilir; kilitli hafta 409 `plan_kilitli`.',
        params: planParam,
        body: EkKumesiGirdiSema,
        response: { 200: EkListesiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const baglam = olayBaglami(y, request.correlationId);
      const satirlar = await withTenant(db, kiraci(y), async (tx) => {
        const p = await yazilacakPlanBul(tx, y, request.params.id);
        const sonuc = await ekleriEsitle(
          tx,
          y,
          baglam,
          PLAN_EK_KAYNAGI,
          p.id,
          request.body.medya_dosya_idleri,
        );
        if (sonuc.eklenen + sonuc.cikarilan > 0) {
          await planDenetimiYaz(
            tx,
            y,
            request.ip,
            'plan.ek_guncelle',
            'haftalik_plan',
            p.id,
            null,
            {
              eklenen: sonuc.eklenen,
              cikarilan: sonuc.cikarilan,
              ek_sayisi: request.body.medya_dosya_idleri.length,
            },
          );
        }
        return ekSatirlari(tx, PLAN_EK_KAYNAGI, p.id);
      });
      return ekListesiYaniti(app, y.kurumId, satirlar);
    },
  );

  // --- Haftalik plan (ogrenci) ------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/planim/:id/ekler',
    {
      preHandler: requirePermission('plan.oku', { scope: 'kendi' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin kendi (yayindaki) planinin ekleri ve okuma adresleri. Taslak plan ya da baskasinin plani 404.',
        params: planParam,
        response: { 200: EkListesiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const satirlar = await withTenant(db, kiraci(y), async (tx) => {
        const p = await ogrenciPlaniBul(tx, y, request.params.id);
        return ekSatirlari(tx, PLAN_EK_KAYNAGI, p.id);
      });
      return ekListesiYaniti(app, y.kurumId, satirlar);
    },
  );

  return Promise.resolve();
};
