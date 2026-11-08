import {
  KendiKatilimIstekListeYanitSema,
  KendiKatilimIstekSorguSema,
  KendiKatilimIstegiSema,
  SinifKoduKatilGirdiSema,
  errorCodes,
  hesapHataKodlari,
} from '@kopru/contracts';
import { AppError, withTenant, withUser, type ServicePlugin } from '@kopru/service-kit';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  grupUyeleri,
  gruplar,
  kurumlar,
  sinifKatilimIstekleri,
  uyelikler,
} from '../../db/schema.js';
import { BasarisizDenemeSiniri, katilimKoduNormallestir } from './sinif-kodu.js';

type IstekSatiri = typeof sinifKatilimIstekleri.$inferSelect;
type KendiIstek = z.infer<typeof KendiKatilimIstegiSema>;

const kodGecersiz = () =>
  new AppError(410, hesapHataKodlari.kodGecersiz, 'Kod geçersiz, kapalı ya da süresi dolmuş.');

/**
 * Ogrenci tarafi (giris + KVKK; kurum secimi yok): `/v1/hesap/sinif-kodu/...`.
 * Kod cozme giris oncesi akistir (ADR 0003 madde 6): `hesap.katilim_kodu_coz` SECURITY DEFINER
 * yalniz `kurum_id, grup_id, kod_id` doner; istek bu kurumun kiraci baglaminda yazilir.
 */
export const sinifKatilimKullaniciYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const sinir = new BasarisizDenemeSiniri();

  function girisli(request: FastifyRequest): string {
    const auth = request.auth;
    if (!auth) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
    return auth.kullaniciId;
  }
  function yazabilir(request: FastifyRequest) {
    if (request.auth?.claims.imp !== undefined) {
      throw new AppError(
        403,
        errorCodes.taklitSaltOkunur,
        'Taklit oturumunda değişiklik yapılamaz.',
      );
    }
  }

  /** Kurum ve grup adlarini kurum baglaminda okur (kullanici henuz uye olmayabilir). */
  async function zenginlestir(kullaniciId: string, satirlar: IstekSatiri[]): Promise<KendiIstek[]> {
    const kurumlariyla = new Map<string, IstekSatiri[]>();
    for (const s of satirlar)
      kurumlariyla.set(s.kurum_id, [...(kurumlariyla.get(s.kurum_id) ?? []), s]);
    const adlar = new Map<string, { kurum: string | null; grup: string | null }>();
    for (const [kurumId, liste] of kurumlariyla) {
      await withTenant(db, { kurumId, kullaniciId, roller: [] }, async (tx) => {
        const [k] = await tx
          .select({ ad: kurumlar.ad })
          .from(kurumlar)
          .where(eq(kurumlar.id, kurumId));
        const gs = await tx
          .select({ id: gruplar.id, ad: gruplar.ad })
          .from(gruplar)
          .where(
            and(
              eq(gruplar.kurum_id, kurumId),
              inArray(
                gruplar.id,
                liste.map((i) => i.grup_id),
              ),
            ),
          );
        for (const i of liste) {
          adlar.set(i.id, {
            kurum: k?.ad ?? null,
            grup: gs.find((g) => g.id === i.grup_id)?.ad ?? null,
          });
        }
      });
    }
    return satirlar.map((i) => ({
      id: i.id,
      kurum_id: i.kurum_id,
      kurum_ad: adlar.get(i.id)?.kurum ?? null,
      grup_id: i.grup_id,
      grup_ad: adlar.get(i.id)?.grup ?? null,
      durum: i.durum as KendiIstek['durum'],
      karar_at: i.karar_at?.toISOString() ?? null,
      created_at: i.created_at.toISOString(),
    }));
  }

  app.post(
    '/sinif-kodu/katil',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['hesap'],
        summary:
          'Sinif koduyla katilim istegi gonder (ogretmen onayi gerekir). Gecersiz/kapali/suresi dolmus/kullanimi dolu/bulunamayan kod ayni 410 kod_gecersiz. IP basina dakikada 10 istek; 5 basarisiz denemede 15 dk bekleme (429). Zaten uyeyse 409 zaten_uye; bekleyen istek varsa ayni istek doner.',
        body: SinifKoduKatilGirdiSema,
        response: { 200: KendiKatilimIstegiSema, 201: KendiKatilimIstegiSema },
      },
    },
    async (request, reply) => {
      const kullaniciId = girisli(request);
      yazabilir(request);
      const anahtarlar = [`ip:${request.ip}`, `kullanici:${kullaniciId}`];
      sinir.denetle(...anahtarlar);

      const kod = katilimKoduNormallestir(request.body.kod);
      const cozum = kod
        ? await db.orm.execute<{ kurum_id: string; grup_id: string; kod_id: string }>(
            sql`select * from hesap.katilim_kodu_coz(${kod})`,
          )
        : [];
      const c = cozum[0];
      if (!c) {
        sinir.basarisiz(...anahtarlar);
        throw kodGecersiz();
      }

      const sonuc = await withTenant(
        db,
        { kurumId: c.kurum_id, kullaniciId, roller: [] },
        async (tx) => {
          const [g] = await tx
            .select()
            .from(gruplar)
            .where(and(eq(gruplar.id, c.grup_id), eq(gruplar.kurum_id, c.kurum_id)));
          // Arsivlenmis / sinif olmayan grup: kod fiilen gecersizdir.
          if (g?.tur !== 'sinif' || g.durum !== 'aktif') return null;

          const [uye] = await tx
            .select({ id: uyelikler.id, durum: uyelikler.durum })
            .from(uyelikler)
            .where(
              and(
                eq(uyelikler.kurum_id, c.kurum_id),
                eq(uyelikler.kullanici_id, kullaniciId),
                eq(uyelikler.rol, 'ogrenci'),
              ),
            );
          if (uye?.durum === 'askida') {
            throw new AppError(
              409,
              hesapHataKodlari.uyelikAskida,
              'Üyeliğiniz askıda; kurumla iletişime geçin.',
            );
          }
          if (uye?.durum === 'aktif') {
            const [gu] = await tx
              .select({ id: grupUyeleri.id })
              .from(grupUyeleri)
              .where(
                and(
                  eq(grupUyeleri.grup_id, g.id),
                  eq(grupUyeleri.ogrenci_id, uye.id),
                  isNull(grupUyeleri.bitis_tarihi),
                ),
              );
            if (gu) {
              throw new AppError(409, hesapHataKodlari.zatenUye, 'Bu sınıfın zaten üyesisiniz.');
            }
          }

          // Grup basina tek bekleyen istek: cakisma varsa mevcut istek (idempotent).
          const [yeni] = await tx
            .insert(sinifKatilimIstekleri)
            .values({
              id: uuidv7(),
              kurum_id: c.kurum_id,
              grup_id: g.id,
              kod_id: c.kod_id,
              kullanici_id: kullaniciId,
              created_by: kullaniciId,
            })
            .onConflictDoNothing()
            .returning();
          if (yeni) return { istek: yeni, yeniMi: true };
          const [var_] = await tx
            .select()
            .from(sinifKatilimIstekleri)
            .where(
              and(
                eq(sinifKatilimIstekleri.grup_id, g.id),
                eq(sinifKatilimIstekleri.kullanici_id, kullaniciId),
                eq(sinifKatilimIstekleri.durum, 'bekliyor'),
              ),
            );
          return var_ ? { istek: var_, yeniMi: false } : null;
        },
      );
      if (!sonuc) {
        sinir.basarisiz(...anahtarlar);
        throw kodGecersiz();
      }
      const [yanit] = await zenginlestir(kullaniciId, [sonuc.istek]);
      if (!yanit) throw new Error('istek yanıtı üretilemedi');
      return reply.status(sonuc.yeniMi ? 201 : 200).send(yanit);
    },
  );

  app.get(
    '/sinif-kodu/istekler',
    {
      schema: {
        tags: ['hesap'],
        summary: 'Kendi katilim isteklerim (varsayilan: bekleyenler), tum kurumlar.',
        querystring: KendiKatilimIstekSorguSema,
        response: { 200: KendiKatilimIstekListeYanitSema },
      },
    },
    async (request) => {
      const kullaniciId = girisli(request);
      const satirlar = await withUser(db, { kullaniciId }, (tx) =>
        tx
          .select()
          .from(sinifKatilimIstekleri)
          .where(
            and(
              eq(sinifKatilimIstekleri.kullanici_id, kullaniciId),
              eq(sinifKatilimIstekleri.durum, request.query.durum),
            ),
          )
          .orderBy(desc(sinifKatilimIstekleri.id))
          .limit(100),
      );
      return { istekler: await zenginlestir(kullaniciId, satirlar) };
    },
  );

  app.post(
    '/sinif-kodu/istekler/:istek_id/iptal',
    {
      schema: {
        tags: ['hesap'],
        summary:
          'Bekleyen katilim istegimi iptal et. Tekrar iptal etkisizdir; karara baglanmis istek iptal edilemez (409). Baskasinin istegi 404.',
        params: z.object({ istek_id: z.uuid() }),
        response: { 200: KendiKatilimIstegiSema },
      },
    },
    async (request) => {
      const kullaniciId = girisli(request);
      yazabilir(request);
      const { istek_id: istekId } = request.params;
      const satir = await withUser(db, { kullaniciId }, async (tx) => {
        const [guncel] = await tx
          .update(sinifKatilimIstekleri)
          .set({ durum: 'iptal' })
          .where(
            and(
              eq(sinifKatilimIstekleri.id, istekId),
              eq(sinifKatilimIstekleri.kullanici_id, kullaniciId),
              eq(sinifKatilimIstekleri.durum, 'bekliyor'),
            ),
          )
          .returning();
        if (guncel) return guncel;
        const [mevcut] = await tx
          .select()
          .from(sinifKatilimIstekleri)
          .where(
            and(
              eq(sinifKatilimIstekleri.id, istekId),
              eq(sinifKatilimIstekleri.kullanici_id, kullaniciId),
            ),
          );
        if (!mevcut) throw new AppError(404, errorCodes.notFound, 'Katılım isteği bulunamadı.');
        if (mevcut.durum !== 'iptal') {
          throw new AppError(
            409,
            hesapHataKodlari.istekBeklemiyor,
            'Katılım isteği artık beklemiyor.',
          );
        }
        return mevcut;
      });
      const [yanit] = await zenginlestir(kullaniciId, [satir]);
      if (!yanit) throw new Error('istek yanıtı üretilemedi');
      return yanit;
    },
  );

  return Promise.resolve();
};
