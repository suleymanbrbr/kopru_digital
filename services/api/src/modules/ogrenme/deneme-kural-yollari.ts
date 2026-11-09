import {
  DenemeAyarlariSema,
  DenemeKuraliGuncelleGirdiSema,
  DenemeKuraliListeSorguSema,
  DenemeKuraliListeYanitSema,
  DenemeKuraliOlusturGirdiSema,
  DenemeKuraliSema,
  denemeHataKodlari,
  errorCodes,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, asc, eq, or, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import { denemeKurallari, kurumlar } from '../../db/schema.js';
import { requirePermission } from '../hesap/index.js';
import {
  benzersizlikIhlaliMi,
  bransKodlariGecerliOlmali,
  denemeDenetimiYaz,
  kuralBulunamadi,
  kuralYaniti,
  ogrenciGirisiAcikMi,
  yabanciAnahtarIhlaliMi,
} from './deneme-deposu.js';
import { kiraci, kurumParam, yetkiAl } from './odev-deposu.js';

const kuralParam = kurumParam.extend({ id: z.uuid() });

/** Deneme kurallari (global okunur, kurum ozel CRUD) ve kurum deneme ayari. */
export const denemeKuralYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const oku = { preHandler: requirePermission('deneme.oku') };
  // Kural yonetimi kurum duzeyidir: ogretmen (kapsam `grup`) kural yazamaz.
  const yaz = { preHandler: requirePermission('deneme.yaz', { scope: 'kurum' }) };

  app.get(
    '/kurumlar/:kurum_id/deneme-kurallari',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Deneme kurallari: global (LGS, TYT, AYT, YDT; `global: true`, yalniz okunur) ve kurumun ozel kurallari. Net kurali katsayi ve bolumlerdir.',
        params: kurumParam,
        querystring: DenemeKuraliListeSorguSema,
        response: { 200: DenemeKuraliListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { aktif } = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select()
          .from(denemeKurallari)
          .where(
            and(
              or(isNull(denemeKurallari.kurum_id), eq(denemeKurallari.kurum_id, y.kurumId)),
              aktif === undefined ? undefined : eq(denemeKurallari.aktif, aktif),
            ),
          )
          .orderBy(asc(denemeKurallari.kod), sql`${denemeKurallari.gecerli_yil} desc nulls last`);
        return { kurallar: satirlar.map(kuralYaniti) };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/deneme-kurallari',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kuruma ozel deneme kurali (`ozel_` oneki zorunlu). Ayni kod ve yil ikinci kez 409; global kuralla cakisma olmaz (onek farkli).',
        params: kurumParam,
        body: DenemeKuraliOlusturGirdiSema,
        response: { 201: DenemeKuraliSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      try {
        const sonuc = await withTenant(db, kiraci(y), async (tx) => {
          await bransKodlariGecerliOlmali(
            tx,
            g.bolumler.map((b) => b.brans_kodu),
          );
          const [k] = await tx
            .insert(denemeKurallari)
            .values({
              id: uuidv7(),
              kurum_id: y.kurumId,
              created_by: y.kullaniciId,
              kod: g.kod,
              ad: g.ad,
              yanlis_katsayisi: g.yanlis_katsayisi.toFixed(4),
              bolumler: g.bolumler,
              toplam_sure_dk: g.toplam_sure_dk ?? null,
              gecerli_yil: g.gecerli_yil ?? null,
              aktif: g.aktif,
            })
            .returning();
          if (!k) throw new Error('kural oluşturulamadı');
          await denemeDenetimiYaz(
            tx,
            y,
            request.ip,
            'deneme_kurali.olustur',
            'deneme_kurali',
            k.id,
            null,
            {
              kod: k.kod,
              yanlis_katsayisi: k.yanlis_katsayisi,
              bolum_sayisi: k.bolumler.length,
            },
          );
          return kuralYaniti(k);
        });
        return await reply.status(201).send(sonuc);
      } catch (err) {
        if (benzersizlikIhlaliMi(err)) {
          throw new AppError(
            409,
            denemeHataKodlari.kuralKoduVar,
            'Bu kod ve yıl için kural zaten var.',
          );
        }
        throw err;
      }
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/deneme-kurallari/:id',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kurum ozel kurali guncelle (iyimser kilit: `surum`; global kural 403). Girilmis denemeler kural anindaki katsayi ve soru sayisini korur: eski net degismez.',
        params: kuralParam,
        body: DenemeKuraliGuncelleGirdiSema,
        response: { 200: DenemeKuraliSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      try {
        return await withTenant(db, kiraci(y), async (tx) => {
          const [k] = await tx
            .select()
            .from(denemeKurallari)
            .where(eq(denemeKurallari.id, request.params.id))
            .for('update');
          if (!k) throw kuralBulunamadi();
          if (k.kurum_id === null) {
            throw new AppError(
              403,
              denemeHataKodlari.globalKuralYazilamaz,
              'Global kural değiştirilemez; kuruma özel kural oluşturun.',
            );
          }
          if (g.surum !== k.surum) {
            throw new AppError(
              409,
              denemeHataKodlari.surumCakismasi,
              'Kural bu arada değişti. Güncel hâlini alıp tekrar deneyin.',
              { guncel_surum: k.surum },
            );
          }
          if (g.bolumler) {
            await bransKodlariGecerliOlmali(
              tx,
              g.bolumler.map((b) => b.brans_kodu),
            );
          }
          const [yeni] = await tx
            .update(denemeKurallari)
            .set({
              ad: g.ad ?? k.ad,
              yanlis_katsayisi:
                g.yanlis_katsayisi === undefined
                  ? k.yanlis_katsayisi
                  : g.yanlis_katsayisi.toFixed(4),
              bolumler: g.bolumler ?? k.bolumler,
              toplam_sure_dk: g.toplam_sure_dk === undefined ? k.toplam_sure_dk : g.toplam_sure_dk,
              gecerli_yil: g.gecerli_yil === undefined ? k.gecerli_yil : g.gecerli_yil,
              aktif: g.aktif ?? k.aktif,
            })
            .where(eq(denemeKurallari.id, k.id))
            .returning();
          if (!yeni) throw new Error('kural güncellenemedi');
          await denemeDenetimiYaz(
            tx,
            y,
            request.ip,
            'deneme_kurali.guncelle',
            'deneme_kurali',
            k.id,
            { yanlis_katsayisi: k.yanlis_katsayisi, aktif: k.aktif },
            { yanlis_katsayisi: yeni.yanlis_katsayisi, aktif: yeni.aktif },
          );
          return kuralYaniti(yeni);
        });
      } catch (err) {
        if (benzersizlikIhlaliMi(err)) {
          throw new AppError(
            409,
            denemeHataKodlari.kuralKoduVar,
            'Bu kod ve yıl için kural zaten var.',
          );
        }
        throw err;
      }
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/deneme-kurallari/:id',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kurum ozel kurali sil. Kuralla girilmis deneme varsa 409 `kural_kullanimda` (kurali `aktif: false` yapin); global kural 403.',
        params: kuralParam,
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      try {
        await withTenant(db, kiraci(y), async (tx) => {
          const [k] = await tx
            .select()
            .from(denemeKurallari)
            .where(eq(denemeKurallari.id, request.params.id))
            .for('update');
          if (!k) throw kuralBulunamadi();
          if (k.kurum_id === null) {
            throw new AppError(
              403,
              denemeHataKodlari.globalKuralYazilamaz,
              'Global kural silinemez.',
            );
          }
          await tx.delete(denemeKurallari).where(eq(denemeKurallari.id, k.id));
          await denemeDenetimiYaz(
            tx,
            y,
            request.ip,
            'deneme_kurali.sil',
            'deneme_kurali',
            k.id,
            null,
            {
              kod: k.kod,
            },
          );
        });
      } catch (err) {
        if (yabanciAnahtarIhlaliMi(err)) {
          throw new AppError(
            409,
            denemeHataKodlari.kuralKullanimda,
            'Bu kuralla girilmiş denemeler var; silmek yerine pasif yapın.',
          );
        }
        throw err;
      }
      return reply.status(204).send(null);
    },
  );

  // --- Kurum ayari -------------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/deneme-ayarlari',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kurumun deneme ayari: `ogrenci_deneme_girisi` (varsayilan true). Istemci, kapaliysa ogrenciye "Deneme ekle" gostermez.',
        params: kurumParam,
        response: { 200: DenemeAyarlariSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => ({
        ogrenci_deneme_girisi: await ogrenciGirisiAcikMi(tx, y.kurumId),
      }));
    },
  );

  app.put(
    '/kurumlar/:kurum_id/deneme-ayarlari',
    {
      preHandler: requirePermission('kurum.ayar.yaz', { scope: 'kurum' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrenci deneme girisini ac/kapat (kurum ayari `ogrenci_deneme_girisi`). Kapaliyken ogrenci girisi, duzeltmesi ve silmesi 403.',
        params: kurumParam,
        body: DenemeAyarlariSema,
        response: { 200: DenemeAyarlariSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { ogrenci_deneme_girisi } = request.body;
      return withTenant(db, kiraci(y), async (tx) => {
        const once = await ogrenciGirisiAcikMi(tx, y.kurumId);
        const [k] = await tx
          .update(kurumlar)
          .set({
            ayarlar: sql`${kurumlar.ayarlar} || jsonb_build_object('ogrenci_deneme_girisi', ${ogrenci_deneme_girisi}::boolean)`,
          })
          .where(eq(kurumlar.id, y.kurumId))
          .returning({ id: kurumlar.id });
        if (!k) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
        await denemeDenetimiYaz(
          tx,
          y,
          request.ip,
          'deneme.ayar_guncelle',
          'kurum',
          y.kurumId,
          { ogrenci_deneme_girisi: once },
          {
            ogrenci_deneme_girisi,
          },
        );
        return { ogrenci_deneme_girisi };
      });
    },
  );

  return Promise.resolve();
};
