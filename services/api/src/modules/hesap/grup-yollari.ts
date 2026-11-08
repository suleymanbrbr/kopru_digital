import {
  AtamaGrupListeYanitSema,
  AtamaListeSorguSema,
  AtamaListeYanitSema,
  AtamaOlusturGirdiSema,
  AtamaSema,
  GrupGuncelleGirdiSema,
  GrupListeSorguSema,
  GrupListeYanitSema,
  GrupOlusturGirdiSema,
  GrupSema,
  GrupUyeEkleGirdiSema,
  GrupUyeEkleYanitSema,
  GrupUyeListeYanitSema,
  GrupUyesiSema,
  errorCodes,
  hesapAtamaDegistiV1,
  hesapGrupDegistiV1,
  hesapGrupUyesiDegistiV1,
  hesapHataKodlari,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, asc, eq, gt, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  atamalar,
  bransler,
  grupUyeleri,
  gruplar,
  kademeler,
  kullanicilar,
  subeler,
  uyelikler,
} from '../../db/schema.js';
import {
  atamaYaniti,
  benzersizlikIhlaliMi,
  gorunenAdlar,
  grubaOgrenciEkle,
  grupOlayVerisi,
  grupUyesiOlayVerisi,
  grupUyesiYaniti,
  grupYaniti,
  uyeSayisiIfadesi,
} from './grup-deposu.js';
import { grupKapsami, kapsamdakiGruplar } from './kapsam.js';
import type { YetkiBaglami } from './kimlik.js';
import { olayYaz, type OlayBaglami } from './olaylar.js';
import { requirePermission } from './yetki.js';

const kurumParam = z.object({ kurum_id: z.uuid() });
const grupParam = kurumParam.extend({ grup_id: z.uuid() });

function yetkiAl(request: { yetki: YetkiBaglami | null }): YetkiBaglami {
  if (!request.yetki) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
  return request.yetki;
}

const baglamOlustur = (y: YetkiBaglami, correlationId: string): OlayBaglami => ({
  kurumId: y.kurumId,
  actor: { tur: 'kullanici', id: y.kullaniciId },
  correlationId,
});

const kiraci = (y: YetkiBaglami) => ({
  kurumId: y.kurumId,
  kullaniciId: y.kullaniciId,
  roller: [y.rol],
});

const grupBulunamadi = () => new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');

/** Kapsamdaki tek grubu getirir (kapsam disi = yok). `kilit`: satiri `FOR UPDATE` ile kilitler. */
async function grupBul(tx: Tx, y: YetkiBaglami, grupId: string, kilit = false) {
  const sorgu = tx
    .select({ g: gruplar, uye_sayisi: uyeSayisiIfadesi })
    .from(gruplar)
    .where(and(eq(gruplar.id, grupId), eq(gruplar.kurum_id, y.kurumId), grupKapsami(tx, y)));
  const [satir] = kilit ? await sorgu.for('update', { of: gruplar }) : await sorgu;
  if (!satir) throw grupBulunamadi();
  return satir;
}

async function varOlmali(tx: Tx, ne: 'sube' | 'kademe', id: string | null | undefined) {
  if (!id) return;
  const tablo = ne === 'sube' ? subeler : kademeler;
  const [s] = await tx.select({ id: tablo.id }).from(tablo).where(eq(tablo.id, id));
  if (!s) {
    throw new AppError(
      404,
      errorCodes.notFound,
      ne === 'sube' ? 'Şube bulunamadı.' : 'Kademe bulunamadı.',
    );
  }
}

/** Sube bagli yonetici yalniz kendi subesinde grup acabilir/degistirebilir. */
function subeKisitla(
  y: YetkiBaglami,
  istenen: string | null | undefined,
): string | null | undefined {
  if (y.kapsam !== 'sube') return istenen;
  if (istenen && istenen !== y.subeId) {
    throw new AppError(403, errorCodes.izinYok, 'Bu şubede işlem yapma yetkiniz yok.');
  }
  return istenen === null ? undefined : (istenen ?? y.subeId);
}

/** Grup, uye ve atama uc noktalari (`/v1/hesap/kurumlar/:kurum_id/gruplar|atamalar`). */
export const grupYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;

  // --- Gruplar ---------------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/gruplar',
    {
      preHandler: requirePermission('grup.yaz', { scope: 'sube' }),
      schema: {
        tags: ['hesap'],
        summary: 'Grup olustur (birebir, grup, sinif, etut)',
        params: kurumParam,
        body: GrupOlusturGirdiSema,
        response: { 201: GrupSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = baglamOlustur(y, request.correlationId);
      const grup = await withTenant(db, kiraci(y), async (tx) => {
        const subeId = subeKisitla(y, g.sube_id) ?? null;
        await varOlmali(tx, 'sube', subeId);
        await varOlmali(tx, 'kademe', g.kademe_id);
        const [satir] = await tx
          .insert(gruplar)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            tur: g.tur,
            ad: g.ad,
            sube_id: subeId,
            kademe_id: g.kademe_id ?? null,
            kapasite: g.tur === 'birebir' ? 1 : (g.kapasite ?? null),
            renk: g.renk ?? null,
            created_by: y.kullaniciId,
          })
          .returning();
        if (!satir) throw new Error('grup oluşturulamadı');
        await olayYaz(tx, hesapGrupDegistiV1, baglam, grupOlayVerisi(satir));
        return satir;
      });
      return reply.status(201).send(grupYaniti(grup, 0));
    },
  );

  app.get(
    '/kurumlar/:kurum_id/gruplar',
    {
      preHandler: requirePermission('grup.oku'),
      schema: {
        tags: ['hesap'],
        summary:
          'Gruplari listele; kapsam rolun izin kapsamina gore daralir (ogretmen: atandigi gruplar)',
        params: kurumParam,
        querystring: GrupListeSorguSema,
        response: { 200: GrupListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { durum, tur, kademe_id, limit, imlec } = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        const kosullar: (SQL | undefined)[] = [eq(gruplar.kurum_id, y.kurumId), grupKapsami(tx, y)];
        if (durum !== 'hepsi') kosullar.push(eq(gruplar.durum, durum));
        if (tur) kosullar.push(eq(gruplar.tur, tur));
        if (kademe_id) kosullar.push(eq(gruplar.kademe_id, kademe_id));
        if (imlec) kosullar.push(gt(gruplar.id, imlec));
        const satirlar = await tx
          .select({ g: gruplar, uye_sayisi: uyeSayisiIfadesi })
          .from(gruplar)
          .where(and(...kosullar))
          .orderBy(asc(gruplar.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        return {
          kapsam: y.kapsam,
          gruplar: sayfa.map((s) => grupYaniti(s.g, s.uye_sayisi)),
          sonraki_imlec: satirlar.length > limit ? (sayfa.at(-1)?.g.id ?? null) : null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/gruplar/:grup_id',
    {
      preHandler: requirePermission('grup.oku'),
      schema: {
        tags: ['hesap'],
        summary: 'Tekil grup (kapsam disi: 404)',
        params: grupParam,
        response: { 200: GrupSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const s = await withTenant(db, kiraci(y), (tx) => grupBul(tx, y, request.params.grup_id));
      return grupYaniti(s.g, s.uye_sayisi);
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/gruplar/:grup_id',
    {
      preHandler: requirePermission('grup.yaz', { scope: 'sube' }),
      schema: {
        tags: ['hesap'],
        summary: 'Grup bilgilerini guncelle (tur degistirilemez)',
        params: grupParam,
        body: GrupGuncelleGirdiSema,
        response: { 200: GrupSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = baglamOlustur(y, request.correlationId);
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        const mevcut = await grupBul(tx, y, request.params.grup_id, true);
        if (mevcut.g.durum !== 'aktif') {
          throw new AppError(409, hesapHataKodlari.grupArsivde, 'Arşivlenmiş grup değiştirilemez.');
        }
        if (g.sube_id !== undefined) {
          const yeniSube = subeKisitla(y, g.sube_id);
          if (g.sube_id === null && y.kapsam === 'sube') {
            throw new AppError(403, errorCodes.izinYok, 'Şube bağını kaldırma yetkiniz yok.');
          }
          await varOlmali(tx, 'sube', yeniSube);
        }
        await varOlmali(tx, 'kademe', g.kademe_id);
        if (mevcut.g.tur === 'birebir' && g.kapasite !== undefined && g.kapasite !== 1) {
          throw new AppError(422, errorCodes.validation, 'Birebir grubun kapasitesi 1 olmalı.');
        }
        if (g.kapasite !== undefined && g.kapasite !== null && g.kapasite < mevcut.uye_sayisi) {
          throw new AppError(
            409,
            hesapHataKodlari.kapasiteDolu,
            'Kapasite mevcut üye sayısından küçük olamaz.',
            { mevcut: mevcut.uye_sayisi },
          );
        }
        const [guncel] = await tx
          .update(gruplar)
          .set({
            ...(g.ad !== undefined ? { ad: g.ad } : {}),
            ...(g.sube_id !== undefined ? { sube_id: g.sube_id } : {}),
            ...(g.kademe_id !== undefined ? { kademe_id: g.kademe_id } : {}),
            ...(g.kapasite !== undefined ? { kapasite: g.kapasite } : {}),
            ...(g.renk !== undefined ? { renk: g.renk } : {}),
          })
          .where(eq(gruplar.id, mevcut.g.id))
          .returning();
        if (!guncel) throw grupBulunamadi();
        await olayYaz(tx, hesapGrupDegistiV1, baglam, grupOlayVerisi(guncel));
        return { guncel, uye_sayisi: mevcut.uye_sayisi };
      });
      return grupYaniti(sonuc.guncel, sonuc.uye_sayisi);
    },
  );

  app.post(
    '/kurumlar/:kurum_id/gruplar/:grup_id/arsivle',
    {
      preHandler: requirePermission('grup.yaz', { scope: 'sube' }),
      schema: {
        tags: ['hesap'],
        summary: 'Grubu arsivle (uyelik ve atama gecmisi korunur); tekrar cagri etkisizdir',
        params: grupParam,
        response: { 200: GrupSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const baglam = baglamOlustur(y, request.correlationId);
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        const mevcut = await grupBul(tx, y, request.params.grup_id, true);
        if (mevcut.g.durum === 'arsiv') return mevcut;
        const [guncel] = await tx
          .update(gruplar)
          .set({ durum: 'arsiv', arsivlendi_at: sql`now()` })
          .where(eq(gruplar.id, mevcut.g.id))
          .returning();
        if (!guncel) throw grupBulunamadi();
        await olayYaz(tx, hesapGrupDegistiV1, baglam, grupOlayVerisi(guncel));
        return { g: guncel, uye_sayisi: mevcut.uye_sayisi };
      });
      return grupYaniti(sonuc.g, sonuc.uye_sayisi);
    },
  );

  // --- Grup uyeleri ----------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/gruplar/:grup_id/uyeler',
    {
      preHandler: requirePermission('grup.oku'),
      schema: {
        tags: ['hesap'],
        summary: 'Grubun etkin ogrencileri (ogrenci kapsaminda yalniz kendisi gorunur)',
        params: grupParam,
        response: { 200: GrupUyeListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const { g } = await grupBul(tx, y, request.params.grup_id);
        const kosullar: (SQL | undefined)[] = [
          eq(grupUyeleri.grup_id, g.id),
          isNull(grupUyeleri.bitis_tarihi),
        ];
        if (y.kapsam === 'kendi') kosullar.push(eq(grupUyeleri.ogrenci_id, y.uyelikId));
        const satirlar = await tx
          .select()
          .from(grupUyeleri)
          .where(and(...kosullar))
          .orderBy(asc(grupUyeleri.id));
        const adlar = await gorunenAdlar(
          tx,
          satirlar.map((s) => s.ogrenci_id),
        );
        return { uyeler: satirlar.map((s) => grupUyesiYaniti(s, adlar.get(s.ogrenci_id) ?? null)) };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/gruplar/:grup_id/uyeler',
    {
      preHandler: requirePermission('grup.yaz', { scope: 'sube' }),
      schema: {
        tags: ['hesap'],
        summary: 'Gruba ogrenci ekle (coklu); zaten uye olanlar atlanir, kapasite asilirsa 409',
        params: grupParam,
        body: GrupUyeEkleGirdiSema,
        response: { 201: GrupUyeEkleYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const baglam = baglamOlustur(y, request.correlationId);
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        await grupBul(tx, y, request.params.grup_id); // kapsam dogrulamasi
        const r = await grubaOgrenciEkle(tx, {
          kurumId: y.kurumId,
          grupId: request.params.grup_id,
          ogrenciIdleri: request.body.ogrenci_idleri,
          katilimYolu: 'yonetici',
          kullaniciId: y.kullaniciId,
          baglam,
        });
        const adlar = await gorunenAdlar(
          tx,
          r.eklenenler.map((e) => e.ogrenci_id),
        );
        return {
          eklenenler: r.eklenenler.map((e) => grupUyesiYaniti(e, adlar.get(e.ogrenci_id) ?? null)),
          zaten_uye: r.zatenUye,
        };
      });
      return reply.status(201).send(sonuc);
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/gruplar/:grup_id/uyeler/:ogrenci_id',
    {
      preHandler: requirePermission('grup.yaz', { scope: 'sube' }),
      schema: {
        tags: ['hesap'],
        summary: 'Ogrenciyi gruptan cikar (bitis_tarihi dolar, gecmis korunur)',
        params: grupParam.extend({ ogrenci_id: z.uuid() }),
        response: { 200: GrupUyesiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const baglam = baglamOlustur(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        await grupBul(tx, y, request.params.grup_id);
        const [satir] = await tx
          .update(grupUyeleri)
          .set({ bitis_tarihi: sql`current_date` })
          .where(
            and(
              eq(grupUyeleri.grup_id, request.params.grup_id),
              eq(grupUyeleri.ogrenci_id, request.params.ogrenci_id),
              isNull(grupUyeleri.bitis_tarihi),
            ),
          )
          .returning();
        if (!satir)
          throw new AppError(404, errorCodes.notFound, 'Öğrenci bu grubun etkin üyesi değil.');
        await olayYaz(tx, hesapGrupUyesiDegistiV1, baglam, grupUyesiOlayVerisi(satir));
        const adlar = await gorunenAdlar(tx, [satir.ogrenci_id]);
        return grupUyesiYaniti(satir, adlar.get(satir.ogrenci_id) ?? null);
      });
    },
  );

  // --- Atamalar --------------------------------------------------------------------------

  const atamaSecimi = {
    a: atamalar,
    ogretmen_ad: sql<string | null>`coalesce(${uyelikler.gorunen_ad}, ${kullanicilar.gorunen_ad})`,
  };

  app.post(
    '/kurumlar/:kurum_id/gruplar/:grup_id/atamalar',
    {
      preHandler: requirePermission('grup.yaz', { scope: 'sube' }),
      schema: {
        tags: ['hesap'],
        summary: 'Ogretmeni gruba brans ile ata; ana ogretmen (grup x brans) tekildir',
        params: grupParam,
        body: AtamaOlusturGirdiSema,
        response: { 201: AtamaSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = baglamOlustur(y, request.correlationId);
      const cakisma = () =>
        new AppError(
          409,
          hesapHataKodlari.atamaCakisiyor,
          'Bu öğretmen bu grupta bu branşta zaten atanmış ya da branşın ana öğretmeni var.',
        );
      try {
        const sonuc = await withTenant(db, kiraci(y), async (tx) => {
          const { g: grup } = await grupBul(tx, y, request.params.grup_id);
          if (grup.durum !== 'aktif') {
            throw new AppError(
              409,
              hesapHataKodlari.grupArsivde,
              'Arşivlenmiş gruba atama yapılamaz.',
            );
          }
          const [hoca] = await tx
            .select({
              id: uyelikler.id,
              ad: sql<string | null>`coalesce(${uyelikler.gorunen_ad}, ${kullanicilar.gorunen_ad})`,
            })
            .from(uyelikler)
            .innerJoin(kullanicilar, eq(kullanicilar.id, uyelikler.kullanici_id))
            .where(
              and(
                eq(uyelikler.id, g.ogretmen_id),
                eq(uyelikler.kurum_id, y.kurumId),
                eq(uyelikler.rol, 'ogretmen'),
                eq(uyelikler.durum, 'aktif'),
              ),
            );
          if (!hoca) throw new AppError(404, errorCodes.notFound, 'Öğretmen bulunamadı.');
          const [brans] = await tx
            .select({ kod: bransler.kod })
            .from(bransler)
            .where(eq(bransler.kod, g.brans_kodu));
          if (!brans) throw new AppError(422, errorCodes.validation, 'Geçersiz branş kodu.');

          const cakisan = await tx
            .select({ id: atamalar.id })
            .from(atamalar)
            .where(
              and(
                eq(atamalar.grup_id, grup.id),
                eq(atamalar.brans_kodu, g.brans_kodu),
                isNull(atamalar.bitis_tarihi),
                or(
                  eq(atamalar.ogretmen_id, g.ogretmen_id),
                  g.ana_ogretmen ? eq(atamalar.ana_ogretmen, true) : undefined,
                ),
              ),
            )
            .limit(1);
          if (cakisan.length > 0) throw cakisma();

          const [satir] = await tx
            .insert(atamalar)
            .values({
              id: uuidv7(),
              kurum_id: y.kurumId,
              grup_id: grup.id,
              ogretmen_id: g.ogretmen_id,
              brans_kodu: g.brans_kodu,
              ana_ogretmen: g.ana_ogretmen,
              created_by: y.kullaniciId,
            })
            .returning();
          if (!satir) throw new Error('atama yazılamadı');
          await olayYaz(tx, hesapAtamaDegistiV1, baglam, atamaOlayVerisi(satir));
          return atamaYaniti(satir, hoca.ad);
        });
        return await reply.status(201).send(sonuc);
      } catch (err) {
        if (benzersizlikIhlaliMi(err)) throw cakisma();
        throw err;
      }
    },
  );

  app.get(
    '/kurumlar/:kurum_id/gruplar/:grup_id/atamalar',
    {
      preHandler: requirePermission('grup.oku'),
      schema: {
        tags: ['hesap'],
        summary: 'Grubun etkin atamalari (ogretmen x brans)',
        params: grupParam,
        response: { 200: AtamaGrupListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        await grupBul(tx, y, request.params.grup_id);
        const satirlar = await tx
          .select(atamaSecimi)
          .from(atamalar)
          .innerJoin(uyelikler, eq(uyelikler.id, atamalar.ogretmen_id))
          .innerJoin(kullanicilar, eq(kullanicilar.id, uyelikler.kullanici_id))
          .where(and(eq(atamalar.grup_id, request.params.grup_id), isNull(atamalar.bitis_tarihi)))
          .orderBy(asc(atamalar.id));
        return { atamalar: satirlar.map((s) => atamaYaniti(s.a, s.ogretmen_ad)) };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/atamalar',
    {
      preHandler: requirePermission('grup.oku'),
      schema: {
        tags: ['hesap'],
        summary:
          'Atamalari listele (grup ya da ogretmen bazli); yalnizca kapsamdaki gruplarin atamalari gorunur',
        params: kurumParam,
        querystring: AtamaListeSorguSema,
        response: { 200: AtamaListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { grup_id, ogretmen_id, durum, limit, imlec } = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        const kosullar: (SQL | undefined)[] = [
          eq(atamalar.kurum_id, y.kurumId),
          y.kapsam === 'kurum' ? undefined : inArray(atamalar.grup_id, kapsamdakiGruplar(tx, y)),
        ];
        if (grup_id) kosullar.push(eq(atamalar.grup_id, grup_id));
        if (ogretmen_id) kosullar.push(eq(atamalar.ogretmen_id, ogretmen_id));
        if (durum === 'etkin') kosullar.push(isNull(atamalar.bitis_tarihi));
        if (durum === 'bitmis') kosullar.push(sql`${atamalar.bitis_tarihi} is not null`);
        if (imlec) kosullar.push(gt(atamalar.id, imlec));
        const satirlar = await tx
          .select(atamaSecimi)
          .from(atamalar)
          .innerJoin(uyelikler, eq(uyelikler.id, atamalar.ogretmen_id))
          .innerJoin(kullanicilar, eq(kullanicilar.id, uyelikler.kullanici_id))
          .where(and(...kosullar))
          .orderBy(asc(atamalar.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        return {
          kapsam: y.kapsam,
          atamalar: sayfa.map((s) => atamaYaniti(s.a, s.ogretmen_ad)),
          sonraki_imlec: satirlar.length > limit ? (sayfa.at(-1)?.a.id ?? null) : null,
        };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/atamalar/:atama_id/bitir',
    {
      preHandler: requirePermission('grup.yaz', { scope: 'sube' }),
      schema: {
        tags: ['hesap'],
        summary:
          'Atamayi bitir (bitis_tarihi bugun olur, ogretmenin grup kapsami hemen duser); tekrar cagri etkisizdir',
        params: kurumParam.extend({ atama_id: z.uuid() }),
        response: { 200: AtamaSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const baglam = baglamOlustur(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const [mevcut] = await tx
          .select(atamaSecimi)
          .from(atamalar)
          .innerJoin(uyelikler, eq(uyelikler.id, atamalar.ogretmen_id))
          .innerJoin(kullanicilar, eq(kullanicilar.id, uyelikler.kullanici_id))
          .where(
            and(
              eq(atamalar.id, request.params.atama_id),
              eq(atamalar.kurum_id, y.kurumId),
              y.kapsam === 'kurum'
                ? undefined
                : inArray(atamalar.grup_id, kapsamdakiGruplar(tx, y)),
            ),
          )
          .for('update', { of: atamalar });
        if (!mevcut) throw new AppError(404, errorCodes.notFound, 'Atama bulunamadı.');
        if (mevcut.a.bitis_tarihi !== null) return atamaYaniti(mevcut.a, mevcut.ogretmen_ad);
        const [guncel] = await tx
          .update(atamalar)
          .set({ bitis_tarihi: sql`current_date` })
          .where(eq(atamalar.id, mevcut.a.id))
          .returning();
        if (!guncel) throw new AppError(404, errorCodes.notFound, 'Atama bulunamadı.');
        await olayYaz(tx, hesapAtamaDegistiV1, baglam, atamaOlayVerisi(guncel));
        return atamaYaniti(guncel, mevcut.ogretmen_ad);
      });
    },
  );

  return Promise.resolve();
};

function atamaOlayVerisi(a: typeof atamalar.$inferSelect) {
  return {
    atama_id: a.id,
    grup_id: a.grup_id,
    ogretmen_id: a.ogretmen_id,
    brans_kodu: a.brans_kodu,
    baslangic_tarihi: a.baslangic_tarihi,
    bitis_tarihi: a.bitis_tarihi,
    ana_ogretmen: a.ana_ogretmen,
  };
}
