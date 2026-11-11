import {
  KaynakIzledimYanitSema,
  KaynakListeSorguSema,
  KaynakSorunGirdiSema,
  KaynakSorunYanitSema,
  KayitlarimDetaySema,
  KayitlarimYanitSema,
  errorCodes,
  kaynakHataKodlari,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import {
  dersKaynagiIzlemeleri,
  dersKaynagiSorunlari,
  dersKaynaklari,
  dersler,
} from '../../db/schema.js';
import { requirePermission } from '../hesap/index.js';
import { dersParam, kiraci, kurumParam, olayBaglami, yetkiAl } from './ders-ortak.js';
import { imlecCoz, imlecYaz } from './imlec.js';
import {
  kaynakIzlendiOlayiYaz,
  kaynakSorunOlayiYaz,
  kaynakTemeli,
  ogrenciGorunurKosul,
  ogrenciKaynagiBul,
  ogrenciOlmali,
  parolaOku,
  sorunYaniti,
  type KaynakDers,
  type KaynakSatiri,
} from './kaynak-deposu.js';
import { olusturmaImleci, suzgecKosullari } from './kaynak-liste.js';

const kaynakParam = kurumParam.extend({ id: dersParam.shape.id });

const ogrenciSatiri = (k: KaynakSatiri, d: KaynakDers, izlediAt: Date | null) => ({
  ...kaynakTemeli(k, d),
  izlendi: izlediAt !== null,
  izledi_at: izlediAt?.toISOString() ?? null,
  bozuk: k.durum === 'bozuk',
});

/** Ogrenci uc noktalari: "Kayitlarim" listesi, tekil okuma, izledim ve "acilmiyor" bildirimi. */
export const kayitlarimYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const oku = { preHandler: requirePermission('kayit.oku') };

  app.get(
    '/kurumlar/:kurum_id/kayitlarim',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          '"Kayitlarim" (ogrenci): gorunurluk kurallarina uyan kayit ve materyaller. Izlenmemisler once, sonra yeni->eski; imlecli sayfalama. Suzgecler: tur, grup, brans, ders, konu, tarih araligi (ders tarihi; materyalde eklenme tarihi). Parola listede donmez (tekil okumada doner).',
        params: kurumParam,
        querystring: KaynakListeSorguSema,
        response: { 200: KayitlarimYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const { limit, imlec, ...suzgec } = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        const gorunur = await ogrenciGorunurKosul(tx, y);
        const kosullar = [
          eq(dersKaynaklari.kurum_id, y.kurumId),
          gorunur,
          ...(await suzgecKosullari(tx, y.kurumId, suzgec)),
        ];
        // Izlendi bayragi: izlenmemis (0) once. Imlec (izlendi, olusturma, id) uclusudur.
        const izlendi = sql<number>`(${dersKaynagiIzlemeleri.id} is not null)::int`;
        if (imlec) {
          const [i, at, id] = imlecCoz(imlec, 3) as [string, string, string];
          const bayrak = Number(i);
          if (bayrak !== 0 && bayrak !== 1) {
            throw new AppError(400, errorCodes.validation, 'İmleç geçersiz.');
          }
          kosullar.push(
            sql`(${izlendi} > ${bayrak} or (${izlendi} = ${bayrak}
              and (${dersKaynaklari.created_at}, ${dersKaynaklari.id}) < (${at}::timestamptz, ${id}::uuid)))`,
          );
        }
        const satirlar = await tx
          .select({
            k: dersKaynaklari,
            izlendi,
            imlec_at: olusturmaImleci,
            izledi_at: dersKaynagiIzlemeleri.izledi_at,
            ders_baslangic_at: dersler.baslangic_at,
            brans_kodu: dersler.brans_kodu,
            ders_ogretmen_id: dersler.ogretmen_id,
          })
          .from(dersKaynaklari)
          .leftJoin(dersler, eq(dersler.id, dersKaynaklari.ders_id))
          .leftJoin(
            dersKaynagiIzlemeleri,
            and(
              eq(dersKaynagiIzlemeleri.kaynak_id, dersKaynaklari.id),
              eq(dersKaynagiIzlemeleri.ogrenci_id, y.uyelikId),
            ),
          )
          .where(and(...kosullar))
          .orderBy(izlendi, desc(dersKaynaklari.created_at), desc(dersKaynaklari.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        const son = sayfa.at(-1);
        return {
          kayitlar: sayfa.map((s) => ogrenciSatiri(s.k, s, s.izledi_at)),
          sonraki_imlec:
            satirlar.length > limit && son ? imlecYaz(son.izlendi, son.imlec_at, son.k.id) : null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/kayitlarim/:id',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          'Tekil kayit (ogrenci). Parola yalniz gorunurluk kurallarini saglayan ogrenciye duz metin doner; gorunmeyen kaynak 404 (varligi ifsa edilmez).',
        params: kaynakParam,
        response: { 200: KayitlarimDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      return withTenant(db, kiraci(y), async (tx) => {
        const { k, d, izledi_at } = await ogrenciKaynagiBul(tx, y, request.params.id);
        const [acik] = await tx
          .select({ id: dersKaynagiSorunlari.id })
          .from(dersKaynagiSorunlari)
          .where(
            and(
              eq(dersKaynagiSorunlari.kaynak_id, k.id),
              eq(dersKaynagiSorunlari.bildiren_id, y.uyelikId),
              eq(dersKaynagiSorunlari.durum, 'acik'),
            ),
          );
        return {
          ...ogrenciSatiri(k, d, izledi_at),
          parola: parolaOku(k),
          acik_sorun_var: acik !== undefined,
        };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/kayitlarim/:id/izledim',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          '"Izledim" isareti (idempotent): ikinci cagri ayni `izledi_at` ile `ilk: false` doner. `ders.kaynak.izlendi.v1` yalniz ilk eklemede yayimlanir. Geri alinmaz.',
        params: kaynakParam,
        response: { 200: KaynakIzledimYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const { k, d } = await ogrenciKaynagiBul(tx, y, request.params.id);
        const [eklenen] = await tx
          .insert(dersKaynagiIzlemeleri)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            kaynak_id: k.id,
            ogrenci_id: y.uyelikId,
          })
          .onConflictDoNothing({
            target: [dersKaynagiIzlemeleri.kaynak_id, dersKaynagiIzlemeleri.ogrenci_id],
          })
          .returning();
        if (eklenen) {
          await kaynakIzlendiOlayiYaz(tx, baglam, k, d.brans_kodu, y.uyelikId, eklenen.izledi_at);
          return { kaynak_id: k.id, izledi_at: eklenen.izledi_at.toISOString(), ilk: true };
        }
        const [mevcut] = await tx
          .select({ izledi_at: dersKaynagiIzlemeleri.izledi_at })
          .from(dersKaynagiIzlemeleri)
          .where(
            and(
              eq(dersKaynagiIzlemeleri.kaynak_id, k.id),
              eq(dersKaynagiIzlemeleri.ogrenci_id, y.uyelikId),
            ),
          );
        if (!mevcut) throw new Error('izleme kaydı okunamadı');
        return { kaynak_id: k.id, izledi_at: mevcut.izledi_at.toISOString(), ilk: false };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/kayitlarim/:id/sorunlar',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          '"Acilmiyor" bildirimi (neden + aciklama). Ayni ogrencinin ayni kaynak icin tek acik bildirimi olur (ikincisi 409 `kaynak_sorun_zaten_acik`). Ilk acik bildirim kaynagi `bozuk` yapar; `ders.kaynak.sorun_bildirildi.v1` yayimlanir.',
        params: kaynakParam,
        body: KaynakSorunGirdiSema,
        response: { 201: KaynakSorunYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        const { k } = await ogrenciKaynagiBul(tx, y, request.params.id);
        const [sorun] = await tx
          .insert(dersKaynagiSorunlari)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            kaynak_id: k.id,
            bildiren_id: y.uyelikId,
            neden: g.neden,
            aciklama: g.aciklama ?? null,
          })
          .onConflictDoNothing({
            target: [dersKaynagiSorunlari.kaynak_id, dersKaynagiSorunlari.bildiren_id],
            where: sql`${dersKaynagiSorunlari.durum} = 'acik'`,
          })
          .returning();
        if (!sorun) {
          throw new AppError(
            409,
            kaynakHataKodlari.sorunZatenAcik,
            'Bu kayıt için zaten açık bir bildiriminiz var.',
          );
        }
        // Ilk acik bildirim kaynagi `bozuk` yapar (`aktif` ise; baskasi durumu zaten belirlemis olabilir).
        const [guncel] = await tx
          .update(dersKaynaklari)
          .set({ durum: 'bozuk' })
          .where(and(eq(dersKaynaklari.id, k.id), eq(dersKaynaklari.durum, 'aktif')))
          .returning({ durum: dersKaynaklari.durum });
        await kaynakSorunOlayiYaz(tx, baglam, k, sorun);
        return {
          sorun: sorunYaniti(sorun),
          kaynak_durumu: (guncel?.durum ?? k.durum) as 'aktif' | 'suresi_doldu' | 'bozuk' | 'gizli',
        };
      });
      return reply.code(201).send(sonuc);
    },
  );

  return Promise.resolve();
};
