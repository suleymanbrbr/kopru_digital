import {
  IncelemeGirdiSema,
  OdevlerimSorguSema,
  OdevlerimYanitSema,
  OgrenciOdeviSema,
  TeslimGirdiSema,
  errorCodes,
  odevHataKodlari,
  ogrenmeOdevIncelendiV1,
  ogrenmeOdevTeslimEdildiV1,
} from '@kopru/contracts';
import { AppError, publishInTx, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, desc, eq, lt, ne } from 'drizzle-orm';
import { z } from 'zod';

import { odevler, ogrenciOdevleri } from '../../db/schema.js';
import { requirePermission } from '../hesap/index.js';
import {
  OUTBOX_TABLOSU,
  imlecCoz,
  imlecYaz,
  kiraci,
  kurumParam,
  odevBulunamadi,
  odevDenetimiYaz,
  odevModuluAcikOlmali,
  ogrenciOdeviYaniti,
  olayBaglami,
  yazilacakOdevBul,
  yetkiAl,
} from './odev-deposu.js';

const satirParam = kurumParam.extend({ id: z.uuid() });

/** Ogrenci odevlerim/teslim ve ogretmen inceleme uclari. */
export const odevOgrenciYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;

  app.get(
    '/kurumlar/:kurum_id/odevlerim',
    {
      preHandler: requirePermission('odev.oku', { scope: 'kendi' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin kendi odevleri (yalniz kendi satirlari; yayindaki/kapali odevler, iptal satirlar haric). Sayfali.',
        params: kurumParam,
        querystring: OdevlerimSorguSema,
        response: { 200: OdevlerimYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      if (y.rol !== 'ogrenci') {
        throw new AppError(403, errorCodes.izinYok, 'Bu uç yalnızca öğrenciler içindir.');
      }
      const { durum, limit, imlec } = request.query;
      const sonImlec = imlecCoz(imlec);
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select({ satir: ogrenciOdevleri, odev: odevler })
          .from(ogrenciOdevleri)
          .innerJoin(odevler, eq(odevler.id, ogrenciOdevleri.odev_id))
          .where(
            and(
              eq(ogrenciOdevleri.kurum_id, y.kurumId),
              eq(ogrenciOdevleri.ogrenci_id, y.uyelikId),
              ne(ogrenciOdevleri.durum, 'iptal'),
              ne(odevler.durum, 'taslak'),
              durum ? eq(ogrenciOdevleri.durum, durum) : undefined,
              sonImlec ? lt(ogrenciOdevleri.id, sonImlec) : undefined,
            ),
          )
          .orderBy(desc(ogrenciOdevleri.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        const son = sayfa.at(-1);
        return {
          odevler: sayfa.map((r) => ogrenciOdeviYaniti(r.satir, r.odev)),
          sonraki_imlec: satirlar.length > limit && son ? imlecYaz(son.satir.id) : null,
        };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/ogrenci-odevleri/:id/teslim',
    {
      preHandler: requirePermission('odev.teslim', { scope: 'kendi' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Odevi teslim et (yalniz `atandi`/`tekrar_istendi`; yeniden teslimde onceki inceleme temizlenir). `gec_teslim` sunucuda hesaplanir. Fotograf baglama medya blogundadir.',
        params: satirParam,
        body: TeslimGirdiSema,
        response: { 200: OgrenciOdeviSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      const toplam = (g.dogru_sayisi ?? 0) + (g.yanlis_sayisi ?? 0) + (g.bos_sayisi ?? 0);
      if (toplam > g.yapilan_soru_sayisi) {
        throw new AppError(
          422,
          errorCodes.validation,
          'Doğru, yanlış ve boş toplamı yapılan sayıyı aşamaz.',
        );
      }
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const [r] = await tx
          .select({ satir: ogrenciOdevleri, odev: odevler })
          .from(ogrenciOdevleri)
          .innerJoin(odevler, eq(odevler.id, ogrenciOdevleri.odev_id))
          .where(
            and(
              eq(ogrenciOdevleri.id, request.params.id),
              eq(ogrenciOdevleri.kurum_id, y.kurumId),
              eq(ogrenciOdevleri.ogrenci_id, y.uyelikId),
            ),
          )
          .for('update', { of: ogrenciOdevleri });
        if (!r) throw odevBulunamadi();
        const { satir, odev } = r;
        await odevModuluAcikOlmali(tx, y.kurumId, odev);
        if (odev.durum !== 'yayinda') {
          throw new AppError(409, odevHataKodlari.odevKapali, 'Ödev teslime kapalı.');
        }
        if (satir.durum !== 'atandi' && satir.durum !== 'tekrar_istendi') {
          throw new AppError(
            409,
            odevHataKodlari.teslimDurumuGecersiz,
            'Bu ödev şu an teslim edilemez.',
          );
        }
        const simdi = new Date();
        const gec = satir.son_teslim_at !== null && simdi > satir.son_teslim_at;
        const yeniden = satir.teslim_at !== null;
        const [yeni] = await tx
          .update(ogrenciOdevleri)
          .set({
            durum: 'teslim_edildi',
            yapilan_soru_sayisi: g.yapilan_soru_sayisi,
            dogru_sayisi: g.dogru_sayisi ?? null,
            yanlis_sayisi: g.yanlis_sayisi ?? null,
            bos_sayisi: g.bos_sayisi ?? null,
            ogrenci_notu: g.ogrenci_notu ?? null,
            teslim_at: simdi,
            gec_teslim: gec,
            inceleme_sonucu: null,
            inceleme_notu: null,
            inceleyen_id: null,
            incelendi_at: null,
          })
          .where(eq(ogrenciOdevleri.id, satir.id))
          .returning();
        if (!yeni) throw new Error('teslim yazılamadı');
        await publishInTx(
          tx,
          ogrenmeOdevTeslimEdildiV1.create({
            ...baglam,
            data: {
              ogrenci_odev_id: satir.id,
              odev_id: odev.id,
              ogrenci_id: y.uyelikId,
              veren_id: odev.veren_id,
              brans_kodu: odev.brans_kodu,
              yapilan_soru_sayisi: g.yapilan_soru_sayisi,
              dosya_sayisi: 0,
              gec_teslim: gec,
              yeniden_teslim: yeniden,
            },
          }),
          { table: OUTBOX_TABLOSU },
        );
        await odevDenetimiYaz(
          tx,
          y,
          request.ip,
          'odev.teslim',
          'ogrenci_odevi',
          satir.id,
          { durum: satir.durum },
          { durum: 'teslim_edildi', gec_teslim: gec, yeniden_teslim: yeniden },
        );
        return ogrenciOdeviYaniti(yeni, odev);
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/ogrenci-odevleri/:id/inceleme',
    {
      preHandler: requirePermission('odev.incele', { scope: 'grup' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Teslimi incele: `tamam`/`eksik` -> `incelendi`, `tekrar` -> `tekrar_istendi`. Yalniz `teslim_edildi` satiri; ogretmen yalniz kendi odevini inceler.',
        params: satirParam,
        body: IncelemeGirdiSema,
        response: { 200: OgrenciOdeviSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const [satir] = await tx
          .select()
          .from(ogrenciOdevleri)
          .where(
            and(eq(ogrenciOdevleri.id, request.params.id), eq(ogrenciOdevleri.kurum_id, y.kurumId)),
          );
        if (!satir) throw odevBulunamadi();
        // Odev kapsamda degilse satir da 404; baska ogretmenin odevi 403.
        const odev = await yazilacakOdevBul(tx, y, satir.odev_id, false);
        const [kilitli] = await tx
          .select()
          .from(ogrenciOdevleri)
          .where(eq(ogrenciOdevleri.id, satir.id))
          .for('update');
        if (kilitli?.durum !== 'teslim_edildi') {
          throw new AppError(
            409,
            odevHataKodlari.incelemeDurumuGecersiz,
            'Yalnızca teslim edilmiş ödev incelenir.',
          );
        }
        const simdi = new Date();
        const tekrar = g.sonuc === 'tekrar';
        const [yeni] = await tx
          .update(ogrenciOdevleri)
          .set({
            durum: tekrar ? 'tekrar_istendi' : 'incelendi',
            inceleme_sonucu: g.sonuc,
            inceleme_notu: g.not ?? null,
            inceleyen_id: y.uyelikId,
            incelendi_at: tekrar ? null : simdi,
          })
          .where(eq(ogrenciOdevleri.id, satir.id))
          .returning();
        if (!yeni) throw new Error('inceleme yazılamadı');
        await publishInTx(
          tx,
          ogrenmeOdevIncelendiV1.create({
            ...baglam,
            data: {
              ogrenci_odev_id: satir.id,
              odev_id: odev.id,
              ogrenci_id: satir.ogrenci_id,
              inceleyen_id: y.uyelikId,
              brans_kodu: odev.brans_kodu,
              inceleme_sonucu: g.sonuc,
            },
          }),
          { table: OUTBOX_TABLOSU },
        );
        await odevDenetimiYaz(
          tx,
          y,
          request.ip,
          'odev.incele',
          'ogrenci_odevi',
          satir.id,
          { durum: 'teslim_edildi' },
          { durum: yeni.durum, inceleme_sonucu: g.sonuc, not_var: g.not !== undefined },
        );
        return ogrenciOdeviYaniti(yeni, odev);
      });
    },
  );

  return Promise.resolve();
};
