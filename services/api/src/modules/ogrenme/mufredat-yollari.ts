import {
  KatalogListeYanitSema,
  KonuDetaySema,
  KonuGuncelleGirdiSema,
  KonuListeSorguSema,
  KonuListeYanitSema,
  KonuOlusturGirdiSema,
  KonuParamSema,
  KonuSema,
  MufredatAtamaGirdiSema,
  MufredatAtamaListeYanitSema,
  KATALOG_KODLARI,
  errorCodes,
  mufredatHataKodlari,
  type KatalogKodu,
  type KonuSeviye,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, asc, eq, gt, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  kademeler,
  konular,
  gruplar,
  mufredatAtamalari,
  mufredatSurumleri,
} from '../../db/schema.js';
import { requirePermission, type YetkiBaglami } from '../hesap/index.js';
import {
  adKatlanmis,
  aramaKatla,
  bransVarMi,
  konuBul,
  konuDenetimiYaz,
  konuYaniti,
  surumCoz,
  ustDogrula,
  yayinliKataloglar,
  yazilabilirKonuBul,
} from './mufredat-deposu.js';

const kurumParam = z.object({ kurum_id: z.uuid() });

function yetkiAl(request: { yetki: YetkiBaglami | null }): YetkiBaglami {
  if (!request.yetki) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
  return request.yetki;
}

const kiraci = (y: YetkiBaglami) => ({
  kurumId: y.kurumId,
  kullaniciId: y.kullaniciId,
  roller: [y.rol],
});

function imlecCoz(imlec: string): { sira: number; id: string } {
  try {
    const [sira, id] = Buffer.from(imlec, 'base64url').toString('utf8').split('|');
    const n = Number(sira);
    if (!id || !Number.isInteger(n)) throw new Error('imlec');
    return { sira: n, id };
  } catch {
    throw new AppError(400, errorCodes.validation, 'İmleç geçersiz.');
  }
}
const imlecYaz = (k: { sira: number; id: string }) =>
  Buffer.from(`${String(k.sira)}|${k.id}`, 'utf8').toString('base64url');

/** Mufredat kutuphanesi uc noktalari (`/v1/ogrenme/kurumlar/:kurum_id/...`). */
export const mufredatYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const oku = { preHandler: requirePermission('mufredat.oku') };
  const yaz = { preHandler: requirePermission('mufredat.konu.yaz', { scope: 'grup' }) };
  const atamaYaz = { preHandler: requirePermission('mufredat.konu.yaz', { scope: 'kurum' }) };

  app.get(
    '/kurumlar/:kurum_id/kataloglar',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Katalog ve sürüm listesi (yalnız yayınlanmış sürümler) ile kurumun atanmış sürümü.',
        params: kurumParam,
        response: { 200: KatalogListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const surumler = await tx
          .select()
          .from(mufredatSurumleri)
          .where(isNotNull(mufredatSurumleri.yayinlandi_at))
          .orderBy(asc(mufredatSurumleri.katalog_kodu), asc(mufredatSurumleri.surum_no));
        const atamalar = await tx
          .select()
          .from(mufredatAtamalari)
          .where(
            and(eq(mufredatAtamalari.kurum_id, y.kurumId), eq(mufredatAtamalari.kapsam, 'kurum')),
          );
        const kataloglar = KATALOG_KODLARI.flatMap((kod) => {
          const liste = surumler.filter((s) => s.katalog_kodu === kod);
          if (liste.length === 0) return [];
          return [
            {
              katalog_kodu: kod,
              surumler: liste.map((s) => ({
                surum_no: s.surum_no,
                ad: s.ad,
                aciklama: s.aciklama,
                yayinlandi_at: s.yayinlandi_at?.toISOString() ?? null,
              })),
              en_yuksek_yayinlanmis: Math.max(...liste.map((s) => s.surum_no)),
              kurum_surumu: atamalar.find((a) => a.katalog_kodu === kod)?.surum_no ?? null,
            },
          ];
        });
        return { kataloglar };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/konular',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Konu listesi: global katalog (çözülen sürüme göre) ve kurum konuları. Kullanımdan kalkanlar varsayılan gizli, tumu=1 ile rozetli. Anahtar tabanlı sayfalama.',
        params: kurumParam,
        querystring: KonuListeSorguSema,
        response: { 200: KonuListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const s = request.query;
      const kapsam =
        s.kapsam && s.kapsam_id ? { kapsam: s.kapsam, kapsam_id: s.kapsam_id } : undefined;
      return withTenant(db, kiraci(y), async (tx) => {
        const katalogler: KatalogKodu[] = s.katalog_kodu
          ? [s.katalog_kodu]
          : await yayinliKataloglar(tx);
        const surumler: { katalog_kodu: KatalogKodu; surum_no: number }[] = [];
        for (const kod of katalogler) {
          const no =
            s.katalog_kodu && s.surum_no !== undefined
              ? s.surum_no
              : await surumCoz(tx, y.kurumId, kod, kapsam);
          if (no !== null) surumler.push({ katalog_kodu: kod, surum_no: no });
        }

        const tumu = s.tumu === true;
        const globalKosul: SQL =
          or(
            ...surumler.map((v) =>
              and(
                eq(konular.katalog_kodu, v.katalog_kodu),
                sql`${konular.gecerli_surum_baslangic} <= ${v.surum_no}`,
                tumu
                  ? undefined
                  : or(
                      isNull(konular.gecerli_surum_bitis),
                      sql`${konular.gecerli_surum_bitis} > ${v.surum_no}`,
                    ),
              ),
            ),
          ) ?? sql`false`;
        const kurumKosul = and(
          eq(konular.kurum_id, y.kurumId),
          tumu ? undefined : isNull(konular.arsivlendi_at),
        );
        const kaynakKosul =
          s.kaynak === 'global'
            ? and(isNull(konular.kurum_id), globalKosul)
            : s.kaynak === 'kurum'
              ? kurumKosul
              : or(and(isNull(konular.kurum_id), globalKosul), kurumKosul);

        const kosullar: (SQL | undefined)[] = [
          kaynakKosul,
          s.brans_kodu ? eq(konular.brans_kodu, s.brans_kodu) : undefined,
          s.ust_id ? eq(konular.ust_id, s.ust_id) : undefined,
          s.seviye ? eq(konular.seviye, s.seviye) : undefined,
          s.sinif_seviyesi !== undefined ? eq(konular.sinif_seviyesi, s.sinif_seviyesi) : undefined,
          s.q ? sql`${adKatlanmis} ilike ${`%${aramaKatla(s.q)}%`}` : undefined,
        ];
        if (s.imlec) {
          const c = imlecCoz(s.imlec);
          kosullar.push(
            or(gt(konular.sira, c.sira), and(eq(konular.sira, c.sira), gt(konular.id, c.id))),
          );
        }
        const satirlar = await tx
          .select()
          .from(konular)
          .where(and(...kosullar))
          .orderBy(asc(konular.sira), asc(konular.id))
          .limit(s.limit + 1);
        const sayfa = satirlar.slice(0, s.limit);
        const son = sayfa[sayfa.length - 1];
        const surumHaritasi = new Map(surumler.map((v) => [v.katalog_kodu, v.surum_no]));
        return {
          konular: sayfa.map((k) =>
            konuYaniti(
              k,
              k.katalog_kodu ? (surumHaritasi.get(k.katalog_kodu as KatalogKodu) ?? null) : null,
            ),
          ),
          surumler,
          sonraki_imlec: satirlar.length > s.limit && son ? imlecYaz(son) : null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/konular/:id',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Tekil konu ve üst zinciri. Kullanımdan kalkma, kurumun çözülmüş sürümüne göre işaretlenir.',
        params: KonuParamSema,
        response: { 200: KonuDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const k = await konuBul(tx, request.params.id);
        const surumNo = k.katalog_kodu
          ? await surumCoz(tx, y.kurumId, k.katalog_kodu as KatalogKodu)
          : null;
        const zincir: { id: string; ad: string; seviye: KonuSeviye }[] = [];
        let ustId = k.ust_id;
        while (ustId && zincir.length < 3) {
          const ust = await konuBul(tx, ustId);
          zincir.unshift({ id: ust.id, ad: ust.ad, seviye: ust.seviye as KonuSeviye });
          ustId = ust.ust_id;
        }
        return { ...konuYaniti(k, surumNo), ust_zinciri: zincir };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/konular',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary: 'Kuruma özel konu ekle (ünite > konu > alt konu).',
        params: kurumParam,
        body: KonuOlusturGirdiSema,
        response: { 201: KonuSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        await bransVarMi(tx, g.brans_kodu);
        await ustDogrula(tx, y, g.seviye, g.brans_kodu, g.ust_id);
        const id = uuidv7();
        const [k] = await tx
          .insert(konular)
          .values({
            id,
            kurum_id: y.kurumId,
            brans_kodu: g.brans_kodu,
            ust_id: g.ust_id ?? null,
            seviye: g.seviye,
            ad: g.ad,
            kazanim_kodu: g.kazanim_kodu ?? null,
            sira: g.sira,
            sinif_seviyesi: g.sinif_seviyesi ?? null,
          })
          .returning();
        if (!k) throw new AppError(500, errorCodes.internal, 'Konu eklenemedi.');
        await konuDenetimiYaz(tx, y, request.ip, 'konu.olustur', id, null, {
          ad: k.ad,
          seviye: k.seviye,
          brans_kodu: k.brans_kodu,
          ust_id: k.ust_id,
        });
        return konuYaniti(k, null);
      });
      return reply.code(201).send(sonuc);
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/konular/:id',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary: 'Kurum konusunu güncelle. Global katalog konusu için 403 global_konu_yazilamaz.',
        params: KonuParamSema,
        body: KonuGuncelleGirdiSema,
        response: { 200: KonuSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      return withTenant(db, kiraci(y), async (tx) => {
        const k = await yazilabilirKonuBul(tx, y, request.params.id);
        const seviye = (g.seviye ?? k.seviye) as KonuSeviye;
        const ust = g.ust_id === undefined ? k.ust_id : g.ust_id;
        await ustDogrula(tx, y, seviye, k.brans_kodu, ust, k.id);
        const degisen = {
          ...(g.ad !== undefined ? { ad: g.ad } : {}),
          ...(g.kazanim_kodu !== undefined ? { kazanim_kodu: g.kazanim_kodu } : {}),
          ...(g.sira !== undefined ? { sira: g.sira } : {}),
          ...(g.sinif_seviyesi !== undefined ? { sinif_seviyesi: g.sinif_seviyesi } : {}),
          ...(g.ust_id !== undefined ? { ust_id: g.ust_id } : {}),
          ...(g.seviye !== undefined ? { seviye: g.seviye } : {}),
        };
        const [yeni] = await tx
          .update(konular)
          .set(degisen)
          .where(and(eq(konular.id, k.id), eq(konular.kurum_id, y.kurumId)))
          .returning();
        if (!yeni) throw new AppError(404, errorCodes.notFound, 'Konu bulunamadı.');
        const once = Object.fromEntries(
          Object.keys(degisen).map((a) => [a, k[a as keyof typeof k]]),
        );
        await konuDenetimiYaz(tx, y, request.ip, 'konu.guncelle', k.id, once, degisen);
        return konuYaniti(yeni, null);
      });
    },
  );

  for (const [yol, arsivle] of [
    ['arsivle', true],
    ['arsivden-cikar', false],
  ] as const) {
    app.post(
      `/kurumlar/:kurum_id/konular/:id/${yol}`,
      {
        ...yaz,
        schema: {
          tags: ['ogrenme'],
          summary: arsivle
            ? 'Kurum konusunu arşivle (silinmez; idempotent).'
            : 'Arşivlenmiş kurum konusunu geri getir (idempotent).',
          params: KonuParamSema,
          response: { 200: KonuSema },
        },
      },
      async (request) => {
        const y = yetkiAl(request);
        return withTenant(db, kiraci(y), async (tx) => {
          const k = await yazilabilirKonuBul(tx, y, request.params.id);
          if ((k.arsivlendi_at !== null) === arsivle) return konuYaniti(k, null);
          const [yeni] = await tx
            .update(konular)
            .set({ arsivlendi_at: arsivle ? new Date() : null })
            .where(and(eq(konular.id, k.id), eq(konular.kurum_id, y.kurumId)))
            .returning();
          if (!yeni) throw new AppError(404, errorCodes.notFound, 'Konu bulunamadı.');
          await konuDenetimiYaz(
            tx,
            y,
            request.ip,
            arsivle ? 'konu.arsivle' : 'konu.arsivden_cikar',
            k.id,
            { arsivlendi_at: k.arsivlendi_at?.toISOString() ?? null },
            { arsivlendi_at: yeni.arsivlendi_at?.toISOString() ?? null },
          );
          return konuYaniti(yeni, null);
        });
      },
    );
  }

  const atamaYaniti = (a: typeof mufredatAtamalari.$inferSelect) => ({
    id: a.id,
    kapsam: a.kapsam as 'kurum' | 'kademe' | 'grup',
    kapsam_id: a.kapsam_id,
    katalog_kodu: a.katalog_kodu as KatalogKodu,
    surum_no: a.surum_no,
    surum: a.surum,
    updated_at: a.updated_at.toISOString(),
  });

  app.get(
    '/kurumlar/:kurum_id/mufredat-atamalari',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary: 'Kurum, kademe ve grup için atanmış katalog sürümleri.',
        params: kurumParam,
        response: { 200: MufredatAtamaListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select()
          .from(mufredatAtamalari)
          .where(eq(mufredatAtamalari.kurum_id, y.kurumId))
          .orderBy(
            asc(mufredatAtamalari.kapsam),
            asc(mufredatAtamalari.katalog_kodu),
            asc(mufredatAtamalari.id),
          );
        return { atamalar: satirlar.map(atamaYaniti) };
      });
    },
  );

  app.put(
    '/kurumlar/:kurum_id/mufredat-atamalari',
    {
      ...atamaYaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kapsam (kurum/kademe/grup) ve katalog için sürüm ata (upsert). Yalnız yayınlanmış sürüm atanır.',
        params: kurumParam,
        body: MufredatAtamaGirdiSema,
        response: { 200: MufredatAtamaListeYanitSema.shape.atamalar.element },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      return withTenant(db, kiraci(y), async (tx) => {
        const kapsamGecersiz = () =>
          new AppError(400, mufredatHataKodlari.kapsamGecersiz, 'Kapsam kimliği geçersiz.');
        if (g.kapsam === 'kurum') {
          if (g.kapsam_id !== y.kurumId) throw kapsamGecersiz();
        } else {
          const tablo = g.kapsam === 'kademe' ? kademeler : gruplar;
          const [var1] = await tx
            .select({ id: tablo.id })
            .from(tablo)
            .where(and(eq(tablo.id, g.kapsam_id), eq(tablo.kurum_id, y.kurumId)));
          if (!var1) throw kapsamGecersiz();
        }
        const [surum] = await tx
          .select()
          .from(mufredatSurumleri)
          .where(
            and(
              eq(mufredatSurumleri.katalog_kodu, g.katalog_kodu),
              eq(mufredatSurumleri.surum_no, g.surum_no),
            ),
          );
        if (!surum)
          throw new AppError(
            404,
            mufredatHataKodlari.surumBulunamadi,
            'Katalog sürümü bulunamadı.',
          );
        if (!surum.yayinlandi_at)
          throw new AppError(
            409,
            mufredatHataKodlari.surumYayinlanmamis,
            'Yayınlanmamış sürüm atanamaz.',
          );
        const [once] = await tx
          .select()
          .from(mufredatAtamalari)
          .where(
            and(
              eq(mufredatAtamalari.kurum_id, y.kurumId),
              eq(mufredatAtamalari.kapsam, g.kapsam),
              eq(mufredatAtamalari.kapsam_id, g.kapsam_id),
              eq(mufredatAtamalari.katalog_kodu, g.katalog_kodu),
            ),
          );
        const [a] = await tx
          .insert(mufredatAtamalari)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            kapsam: g.kapsam,
            kapsam_id: g.kapsam_id,
            katalog_kodu: g.katalog_kodu,
            surum_no: g.surum_no,
          })
          .onConflictDoUpdate({
            target: [
              mufredatAtamalari.kurum_id,
              mufredatAtamalari.kapsam,
              mufredatAtamalari.kapsam_id,
              mufredatAtamalari.katalog_kodu,
            ],
            set: { surum_no: g.surum_no },
          })
          .returning();
        if (!a) throw new AppError(500, errorCodes.internal, 'Atama yazılamadı.');
        await konuDenetimiYaz(
          tx,
          y,
          request.ip,
          'mufredat.ata',
          a.id,
          once ? { surum_no: once.surum_no } : null,
          {
            kapsam: a.kapsam,
            kapsam_id: a.kapsam_id,
            katalog_kodu: a.katalog_kodu,
            surum_no: a.surum_no,
          },
          'mufredat_atamasi',
        );
        return atamaYaniti(a);
      });
    },
  );

  return Promise.resolve();
};
