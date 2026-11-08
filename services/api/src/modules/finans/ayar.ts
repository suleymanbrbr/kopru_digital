import {
  errorCodes,
  FinansAyarSema,
  finansHataKodlari,
  KrediPolitikasiSema,
  KrediPolitikasiYazGirdiSema,
  KurumParamSema,
  UcretTarifesiGirdiSema,
  UcretTarifesiGuncelleGirdiSema,
  UcretTarifesiListeYanitSema,
  UcretTarifesiSema,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  bransler,
  gruplar,
  krediPolitikalari,
  kurumlar,
  ucretTarifeleri,
  uyelikler,
} from '../../db/schema.js';
import { requirePermission } from '../hesap/index.js';
import { kurumPolitikasiGetir } from './kredi-uygula.js';
import {
  denetimYaz,
  kalanDersGorunsunMu,
  kilitAl,
  kiraci,
  tanimli,
  tekSatir,
  veritabani,
  yetkiAl,
} from './ortak.js';

type TarifeSatiri = typeof ucretTarifeleri.$inferSelect;

const tarifeYaniti = (t: TarifeSatiri): z.infer<typeof UcretTarifesiSema> => ({
  id: t.id,
  ogrenci_id: t.ogrenci_id,
  grup_id: t.grup_id,
  brans_kodu: t.brans_kodu,
  ucret_kurus: t.ucret_kurus,
  gecerlilik_baslangic: t.gecerlilik_baslangic,
  gecerlilik_bitis: t.gecerlilik_bitis,
  surum: t.surum,
});

const tarifeParam = KurumParamSema.extend({ tarife_id: z.uuid() });

interface TarifeAlanlari {
  ogrenci_id: string | null;
  grup_id: string | null;
  brans_kodu: string | null;
  gecerlilik_baslangic: string;
  gecerlilik_bitis: string | null;
}

/** Tarife basvurularini dogrular (ogrenci, grup, brans kurumda olmali). */
async function basvurulariDogrula(tx: Tx, kurumId: string, t: TarifeAlanlari) {
  if (t.ogrenci_id) {
    const [o] = await tx
      .select({ id: uyelikler.id })
      .from(uyelikler)
      .where(
        and(
          eq(uyelikler.id, t.ogrenci_id),
          eq(uyelikler.kurum_id, kurumId),
          eq(uyelikler.rol, 'ogrenci'),
        ),
      );
    if (!o) throw new AppError(404, errorCodes.notFound, 'Öğrenci bulunamadı.');
  }
  if (t.grup_id) {
    const [g] = await tx
      .select({ id: gruplar.id })
      .from(gruplar)
      .where(and(eq(gruplar.id, t.grup_id), eq(gruplar.kurum_id, kurumId)));
    if (!g) throw new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
  }
  if (t.brans_kodu) {
    const [b] = await tx
      .select({ kod: bransler.kod })
      .from(bransler)
      .where(eq(bransler.kod, t.brans_kodu));
    if (!b) throw new AppError(422, errorCodes.validation, 'Geçersiz branş kodu.');
  }
  if (t.gecerlilik_bitis && t.gecerlilik_bitis < t.gecerlilik_baslangic) {
    throw new AppError(422, errorCodes.validation, 'Bitiş tarihi başlangıçtan önce olamaz.');
  }
}

/** Ayni kapsamda (ogrenci, grup, brans uclusu) gecerlilik araligi cakisan baska tarife var mi? */
async function cakismaDenetle(tx: Tx, kurumId: string, t: TarifeAlanlari, haricId: string | null) {
  await kilitAl(tx, `finans:tarife:${kurumId}`);
  const [c] = await tx
    .select({ id: ucretTarifeleri.id })
    .from(ucretTarifeleri)
    .where(
      and(
        eq(ucretTarifeleri.kurum_id, kurumId),
        haricId ? ne(ucretTarifeleri.id, haricId) : undefined,
        sql`${ucretTarifeleri.ogrenci_id} is not distinct from ${t.ogrenci_id}`,
        sql`${ucretTarifeleri.grup_id} is not distinct from ${t.grup_id}`,
        sql`${ucretTarifeleri.brans_kodu} is not distinct from ${t.brans_kodu}`,
        sql`${ucretTarifeleri.gecerlilik_baslangic} <= coalesce(${t.gecerlilik_bitis}::date, 'infinity'::date)`,
        sql`coalesce(${ucretTarifeleri.gecerlilik_bitis}, 'infinity'::date) >= ${t.gecerlilik_baslangic}::date`,
      ),
    )
    .limit(1);
  if (c) {
    throw new AppError(
      409,
      finansHataKodlari.tarifeCakisiyor,
      'Aynı kapsamda tarih aralığı çakışan bir ücret tarifesi var.',
    );
  }
}

/** Tarifeler, kredi politikasi ve kurum finans ayari: `/v1/finans/kurumlar/:kurum_id/...`. */
export const ayarYollari: ServicePlugin = (app) => {
  const db = () => veritabani(app);
  const oku = { preHandler: requirePermission('finans.oku', { scope: 'grup' }) };
  const yaz = { preHandler: requirePermission('finans.paket.yaz', { scope: 'kurum' }) };

  // --- Ucret tarifeleri ----------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/ucret-tarifeleri',
    {
      ...oku,
      schema: {
        tags: ['finans'],
        summary: 'Ucret tarifelerini listele (ders basi modeli).',
        params: KurumParamSema,
        response: { 200: UcretTarifesiListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db(), kiraci(y), async (tx) => {
        const satirlar = await tx
          .select()
          .from(ucretTarifeleri)
          .where(eq(ucretTarifeleri.kurum_id, y.kurumId))
          .orderBy(asc(ucretTarifeleri.gecerlilik_baslangic), asc(ucretTarifeleri.id));
        return { tarifeler: satirlar.map(tarifeYaniti) };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/ucret-tarifeleri',
    {
      ...yaz,
      schema: {
        tags: ['finans'],
        summary:
          'Ucret tarifesi ekle. Secim onceligi: ogrenci > grup > yalniz brans > kurum varsayilani. Ayni kapsamda cakisan aralik 409.',
        params: KurumParamSema,
        body: UcretTarifesiGirdiSema,
        response: { 201: UcretTarifesiSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const b = request.body;
      const t: TarifeAlanlari = {
        ogrenci_id: b.ogrenci_id ?? null,
        grup_id: b.grup_id ?? null,
        brans_kodu: b.brans_kodu ?? null,
        gecerlilik_baslangic: b.gecerlilik_baslangic,
        gecerlilik_bitis: b.gecerlilik_bitis ?? null,
      };
      const satir = await withTenant(db(), kiraci(y), async (tx) => {
        await basvurulariDogrula(tx, y.kurumId, t);
        await cakismaDenetle(tx, y.kurumId, t, null);
        const s = tekSatir(
          await tx
            .insert(ucretTarifeleri)
            .values({
              id: uuidv7(),
              kurum_id: y.kurumId,
              created_by: y.kullaniciId,
              ...t,
              ucret_kurus: b.ucret_kurus,
            })
            .returning(),
        );
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.tarife.olusturuldu',
          hedefTuru: 'ucret_tarifesi',
          hedefId: s.id,
          sonra: { ucret_kurus: s.ucret_kurus },
        });
        return s;
      });
      return reply.status(201).send(tarifeYaniti(satir));
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/ucret-tarifeleri/:tarife_id',
    {
      ...yaz,
      schema: {
        tags: ['finans'],
        summary: 'Ucret tarifesini guncelle (gecmis derslere kopyalanmis tutarlar degismez).',
        params: tarifeParam,
        body: UcretTarifesiGuncelleGirdiSema,
        response: { 200: UcretTarifesiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const b = request.body;
      const satir = await withTenant(db(), kiraci(y), async (tx) => {
        const [onceki] = await tx
          .select()
          .from(ucretTarifeleri)
          .where(
            and(
              eq(ucretTarifeleri.id, request.params.tarife_id),
              eq(ucretTarifeleri.kurum_id, y.kurumId),
            ),
          )
          .for('update');
        if (!onceki) throw new AppError(404, errorCodes.notFound, 'Tarife bulunamadı.');
        const t = {
          ogrenci_id: onceki.ogrenci_id,
          grup_id: onceki.grup_id,
          brans_kodu: onceki.brans_kodu,
          gecerlilik_baslangic: onceki.gecerlilik_baslangic,
          gecerlilik_bitis: onceki.gecerlilik_bitis,
          ucret_kurus: onceki.ucret_kurus,
          ...tanimli(b),
        };
        await basvurulariDogrula(tx, y.kurumId, t);
        await cakismaDenetle(tx, y.kurumId, t, onceki.id);
        const s = tekSatir(
          await tx
            .update(ucretTarifeleri)
            .set(t)
            .where(eq(ucretTarifeleri.id, onceki.id))
            .returning(),
        );
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.tarife.guncellendi',
          hedefTuru: 'ucret_tarifesi',
          hedefId: s.id,
          once: { ucret_kurus: onceki.ucret_kurus },
          sonra: { ucret_kurus: s.ucret_kurus },
        });
        return s;
      });
      return tarifeYaniti(satir);
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/ucret-tarifeleri/:tarife_id',
    {
      ...yaz,
      schema: {
        tags: ['finans'],
        summary: 'Ucret tarifesini sil (defter satirlari tutari kopya sakladigi icin etkilenmez).',
        params: tarifeParam,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      await withTenant(db(), kiraci(y), async (tx) => {
        const [s] = await tx
          .delete(ucretTarifeleri)
          .where(
            and(
              eq(ucretTarifeleri.id, request.params.tarife_id),
              eq(ucretTarifeleri.kurum_id, y.kurumId),
            ),
          )
          .returning();
        if (!s) throw new AppError(404, errorCodes.notFound, 'Tarife bulunamadı.');
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.tarife.silindi',
          hedefTuru: 'ucret_tarifesi',
          hedefId: s.id,
          once: { ucret_kurus: s.ucret_kurus },
        });
      });
      return reply.status(204).send(null);
    },
  );

  // --- Kredi politikasi ----------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/kredi-politikasi',
    {
      ...oku,
      schema: {
        tags: ['finans'],
        summary: 'Kurum kredi dusum politikasi (satir yoksa varsayilanlar, `varsayilan: true`).',
        params: KurumParamSema,
        response: { 200: KrediPolitikasiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db(), kiraci(y), (tx) => kurumPolitikasiGetir(tx, y.kurumId));
    },
  );

  app.put(
    '/kurumlar/:kurum_id/kredi-politikasi',
    {
      ...yaz,
      schema: {
        tags: ['finans'],
        summary:
          'Kurum kredi dusum politikasini yaz (verilmeyen alanlar mevcut degeri korur). Paket bazli gecersiz kilma paket sablonundadir.',
        params: KurumParamSema,
        body: KrediPolitikasiYazGirdiSema,
        response: { 200: KrediPolitikasiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db(), kiraci(y), async (tx) => {
        const onceki = await kurumPolitikasiGetir(tx, y.kurumId);
        const { varsayilan: _v, ...mevcut } = onceki;
        const yeni = { ...mevcut, ...request.body };
        await tx
          .insert(krediPolitikalari)
          .values({ id: uuidv7(), kurum_id: y.kurumId, created_by: y.kullaniciId, ...yeni })
          .onConflictDoUpdate({ target: krediPolitikalari.kurum_id, set: yeni });
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.kredi_politikasi.guncellendi',
          hedefTuru: 'kredi_politikasi',
          hedefId: y.kurumId,
          once: mevcut,
          sonra: yeni,
        });
        return { ...yeni, varsayilan: false };
      });
    },
  );

  // --- Kurum finans ayari --------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/ayarlar',
    {
      ...oku,
      schema: {
        tags: ['finans'],
        summary: 'Kurum finans ayari: ogrenci kalan ders sayisini gorur mu (varsayilan evet).',
        params: KurumParamSema,
        response: { 200: FinansAyarSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db(), kiraci(y), async (tx) => {
        const [k] = await tx
          .select({ ayarlar: kurumlar.ayarlar })
          .from(kurumlar)
          .where(eq(kurumlar.id, y.kurumId));
        return { ogrenci_kalan_ders_gorur: kalanDersGorunsunMu(k?.ayarlar) };
      });
    },
  );

  app.put(
    '/kurumlar/:kurum_id/ayarlar',
    {
      ...yaz,
      schema: {
        tags: ['finans'],
        summary:
          'Kurum finans ayarini yaz. `ogrenci_kalan_ders_gorur=false` ise ogrenci kalan ders sayisini gormez (`kalan_kredi: null`).',
        params: KurumParamSema,
        body: FinansAyarSema,
        response: { 200: FinansAyarSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { ogrenci_kalan_ders_gorur } = request.body;
      return withTenant(db(), kiraci(y), async (tx) => {
        await tx
          .update(kurumlar)
          .set({
            ayarlar: sql`${kurumlar.ayarlar} || jsonb_build_object('ogrenci_kalan_ders_gorur', ${ogrenci_kalan_ders_gorur}::boolean)`,
          })
          .where(eq(kurumlar.id, y.kurumId));
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.ayar.guncellendi',
          hedefTuru: 'kurum',
          hedefId: y.kurumId,
          sonra: { ogrenci_kalan_ders_gorur },
        });
        return { ogrenci_kalan_ders_gorur };
      });
    },
  );
  return Promise.resolve();
};
