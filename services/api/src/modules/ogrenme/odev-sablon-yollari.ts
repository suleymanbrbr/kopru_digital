import {
  OdevSablonuSema,
  SablonGuncelleGirdiSema,
  SablonListeYanitSema,
  SablonOlusturGirdiSema,
  errorCodes,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, desc, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import { odevSablonlari } from '../../db/schema.js';
import { requirePermission } from '../hesap/index.js';
import { bransGecerliOlmali, kiraci, kurumParam, odevDenetimiYaz, yetkiAl } from './odev-deposu.js';

type SablonSatiri = typeof odevSablonlari.$inferSelect;

const sablonParam = kurumParam.extend({ id: z.uuid() });

const sablonYaniti = (s: SablonSatiri) => ({
  id: s.id,
  ogretmen_id: s.ogretmen_id,
  baslik: s.baslik,
  aciklama: s.aciklama,
  brans_kodu: s.brans_kodu,
  konu_id: s.konu_id,
  tur: s.tur as 'soru' | 'sayfa' | 'serbest',
  kaynak: s.kaynak,
  hedef_soru_sayisi: s.hedef_soru_sayisi,
  created_at: s.created_at.toISOString(),
});

/** Odev sablonlari: her kullanici yalniz kendi sablonlarini gorur ve degistirir (baskasininki 404). */
export const odevSablonYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const yetki = { preHandler: requirePermission('odev.ver', { scope: 'grup' }) };

  app.post(
    '/kurumlar/:kurum_id/odev-sablonlari',
    {
      ...yetki,
      schema: {
        tags: ['ogrenme'],
        summary: 'Odev sablonu olustur (hedef ve tarih icermez).',
        params: kurumParam,
        body: SablonOlusturGirdiSema,
        response: { 201: OdevSablonuSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        await bransGecerliOlmali(tx, g.brans_kodu);
        const [s] = await tx
          .insert(odevSablonlari)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            ogretmen_id: y.uyelikId,
            baslik: g.baslik,
            aciklama: g.aciklama ?? null,
            brans_kodu: g.brans_kodu,
            konu_id: g.konu_id ?? null,
            tur: g.tur,
            kaynak: g.kaynak ?? null,
            hedef_soru_sayisi: g.hedef_soru_sayisi ?? null,
          })
          .returning();
        if (!s) throw new Error('şablon oluşturulamadı');
        await odevDenetimiYaz(
          tx,
          y,
          request.ip,
          'odev.sablon_olustur',
          'odev_sablonu',
          s.id,
          null,
          {
            brans_kodu: s.brans_kodu,
            tur: s.tur,
          },
        );
        return sablonYaniti(s);
      });
      return reply.status(201).send(sonuc);
    },
  );

  app.get(
    '/kurumlar/:kurum_id/odev-sablonlari',
    {
      ...yetki,
      schema: {
        tags: ['ogrenme'],
        summary: 'Kendi odev sablonlarim (yeniden eskiye).',
        params: kurumParam,
        response: { 200: SablonListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select()
          .from(odevSablonlari)
          .where(
            and(eq(odevSablonlari.kurum_id, y.kurumId), eq(odevSablonlari.ogretmen_id, y.uyelikId)),
          )
          .orderBy(desc(odevSablonlari.id))
          .limit(500);
        return { sablonlar: satirlar.map(sablonYaniti) };
      });
    },
  );

  const kendiSablonu = async (
    tx: Parameters<Parameters<typeof withTenant>[2]>[0],
    kurumId: string,
    uyelikId: string,
    id: string,
  ) => {
    const [s] = await tx
      .select()
      .from(odevSablonlari)
      .where(
        and(
          eq(odevSablonlari.id, id),
          eq(odevSablonlari.kurum_id, kurumId),
          eq(odevSablonlari.ogretmen_id, uyelikId),
        ),
      );
    if (!s) throw new AppError(404, errorCodes.notFound, 'Şablon bulunamadı.');
    return s;
  };

  app.get(
    '/kurumlar/:kurum_id/odev-sablonlari/:id',
    {
      ...yetki,
      schema: {
        tags: ['ogrenme'],
        summary: 'Tek sablon (baskasinin sablonu 404).',
        params: sablonParam,
        response: { 200: OdevSablonuSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) =>
        sablonYaniti(await kendiSablonu(tx, y.kurumId, y.uyelikId, request.params.id)),
      );
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/odev-sablonlari/:id',
    {
      ...yetki,
      schema: {
        tags: ['ogrenme'],
        summary: 'Sablonu guncelle.',
        params: sablonParam,
        body: SablonGuncelleGirdiSema,
        response: { 200: OdevSablonuSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      return withTenant(db, kiraci(y), async (tx) => {
        const s = await kendiSablonu(tx, y.kurumId, y.uyelikId, request.params.id);
        if (g.brans_kodu !== undefined) await bransGecerliOlmali(tx, g.brans_kodu);
        const [yeni] = await tx
          .update(odevSablonlari)
          .set({
            baslik: g.baslik ?? s.baslik,
            aciklama: g.aciklama === undefined ? s.aciklama : g.aciklama,
            brans_kodu: g.brans_kodu ?? s.brans_kodu,
            konu_id: g.konu_id === undefined ? s.konu_id : g.konu_id,
            tur: g.tur ?? s.tur,
            kaynak: g.kaynak === undefined ? s.kaynak : g.kaynak,
            hedef_soru_sayisi:
              g.hedef_soru_sayisi === undefined ? s.hedef_soru_sayisi : g.hedef_soru_sayisi,
          })
          .where(eq(odevSablonlari.id, s.id))
          .returning();
        if (!yeni) throw new Error('şablon güncellenemedi');
        await odevDenetimiYaz(
          tx,
          y,
          request.ip,
          'odev.sablon_guncelle',
          'odev_sablonu',
          s.id,
          null,
          {
            alanlar: Object.keys(g),
          },
        );
        return sablonYaniti(yeni);
      });
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/odev-sablonlari/:id',
    {
      ...yetki,
      schema: {
        tags: ['ogrenme'],
        summary: 'Sablonu sil (olusturulmus odevler etkilenmez).',
        params: sablonParam,
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      await withTenant(db, kiraci(y), async (tx) => {
        const s = await kendiSablonu(tx, y.kurumId, y.uyelikId, request.params.id);
        await tx.delete(odevSablonlari).where(eq(odevSablonlari.id, s.id));
        await odevDenetimiYaz(tx, y, request.ip, 'odev.sablon_sil', 'odev_sablonu', s.id, null, {
          brans_kodu: s.brans_kodu,
        });
      });
      return reply.status(204).send(null);
    },
  );

  return Promise.resolve();
};
