import {
  KAYNAK_KITAP_EN_FAZLA_TEST,
  KaynakKitapDetaySema,
  KaynakKitapGuncelleGirdiSema,
  KaynakKitapListeSorguSema,
  KaynakKitapListeYanitiSema,
  KaynakKitapOlusturGirdiSema,
  KaynakKitapSema,
  KaynakTestEkleGirdiSema,
  KaynakTestGuncelleGirdiSema,
  KaynakTestSema,
  errorCodes,
  gunlukSoruHataKodlari,
  izinKapsami,
  type KaynakKitap,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  gunlukSoruKayitlari,
  kademeler,
  kaynakKitaplar,
  kaynakKitapTestleri,
} from '../../db/schema.js';
import { requirePermission, type YetkiBaglami } from '../hesap/index.js';
import { bransVeKonuDogrula } from './gunluk-soru-deposu.js';
import { kiraci, kurumParam, yetkiAl } from './odev-deposu.js';
import { ogrenciBul, surumUyumluOlmali } from './plan-deposu.js';

type KitapSatiri = typeof kaynakKitaplar.$inferSelect;
type TestSatiri = typeof kaynakKitapTestleri.$inferSelect;
type TestYaniti = z.infer<typeof KaynakTestSema>;

const kitapParam = kurumParam.extend({ id: z.uuid() });
const testParam = kitapParam.extend({ test_id: z.uuid() });

const kitapBulunamadi = () => new AppError(404, errorCodes.notFound, 'Kaynak kitap bulunamadı.');
const testBulunamadi = () => new AppError(404, errorCodes.notFound, 'Kaynak testi bulunamadı.');

const testYaniti = (t: TestSatiri, cozulduGun?: string | null): TestYaniti => ({
  id: t.id,
  kitap_id: t.kitap_id,
  sira: t.sira,
  ad: t.ad,
  soru_sayisi: t.soru_sayisi,
  konu_id: t.konu_id,
  ...(cozulduGun === undefined ? {} : { cozuldu_gun: cozulduGun }),
});

/** Ogretmen yalniz kendi tanimladigi kitabi degistirir; sahip/yonetici hepsini. */
function yazmaYetkisi(y: YetkiBaglami, k: KitapSatiri): void {
  if (y.rol === 'ogretmen' && k.sahip_uyelik_id !== y.uyelikId) {
    throw new AppError(
      403,
      errorCodes.izinYok,
      'Yalnızca kendi tanımladığınız kitabı değiştirebilirsiniz.',
    );
  }
}

/** Ogrencinin kullandigi testlerin ilk cozum gunu (kitap ilerlemesi). */
async function cozumGunleri(
  tx: Tx,
  y: YetkiBaglami,
  ogrenciId: string,
): Promise<Map<string, string>> {
  const satirlar = await tx
    .select({
      test_id: gunlukSoruKayitlari.kaynak_test_id,
      gun: sql<string>`min(${gunlukSoruKayitlari.gun})::text`,
    })
    .from(gunlukSoruKayitlari)
    .where(
      and(
        eq(gunlukSoruKayitlari.kurum_id, y.kurumId),
        eq(gunlukSoruKayitlari.ogrenci_id, ogrenciId),
        sql`${gunlukSoruKayitlari.kaynak_test_id} is not null`,
      ),
    )
    .groupBy(gunlukSoruKayitlari.kaynak_test_id);
  return new Map(satirlar.flatMap((s) => (s.test_id ? [[s.test_id, s.gun] as const] : [])));
}

/** Ilerleme icin hedef ogrenci: ogrenci rolu kendisi; personel `ogrenci_id` verirse (kapsam denetimli). */
async function ilerlemeOgrencisi(
  tx: Tx,
  y: YetkiBaglami,
  ogrenciId: string | undefined,
): Promise<string | null> {
  if (y.rol === 'ogrenci') return y.uyelikId;
  if (!ogrenciId) return null;
  // `kaynak_kitap.oku` kurum kapsamlidir; ogrenci kapsami `gunluk_soru.oku` kapsamina gore daraltilir.
  const kapsam = y.kapsam === 'sube' ? 'sube' : (izinKapsami(y.rol, 'gunluk_soru.oku') ?? 'kendi');
  await ogrenciBul(tx, { ...y, kapsam }, ogrenciId, false);
  return ogrenciId;
}

async function kitapYanitlari(
  tx: Tx,
  kitaplar: readonly KitapSatiri[],
  gunler: Map<string, string> | null,
): Promise<KaynakKitap[]> {
  if (kitaplar.length === 0) return [];
  const testler = await tx
    .select({
      id: kaynakKitapTestleri.id,
      kitap_id: kaynakKitapTestleri.kitap_id,
      soru_sayisi: kaynakKitapTestleri.soru_sayisi,
    })
    .from(kaynakKitapTestleri)
    .where(
      inArray(
        kaynakKitapTestleri.kitap_id,
        kitaplar.map((k) => k.id),
      ),
    );
  return kitaplar.map((k) => {
    const t = testler.filter((x) => x.kitap_id === k.id);
    return {
      id: k.id,
      ad: k.ad,
      yayinevi: k.yayinevi,
      brans_kodu: k.brans_kodu,
      kademe_id: k.kademe_id,
      sahip_uyelik_id: k.sahip_uyelik_id,
      aktif: k.aktif,
      test_sayisi: t.length,
      toplam_soru: t.reduce((a, x) => a + x.soru_sayisi, 0),
      ilerleme: gunler
        ? { cozulen_test: t.filter((x) => gunler.has(x.id)).length, toplam_test: t.length }
        : null,
      surum: k.surum,
      created_at: k.created_at.toISOString(),
    };
  });
}

async function testKonusuDogrula(tx: Tx, bransKodu: string, konuId: string | null | undefined) {
  if (konuId) await bransVeKonuDogrula(tx, bransKodu, konuId);
}

/** Kurum ya da ogretmen tanimi kaynak kitap ve test listesi uclari. */
export const kaynakKitapYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const oku = { preHandler: requirePermission('kaynak_kitap.oku', { scope: 'kendi' }) };
  const yaz = { preHandler: requirePermission('kaynak_kitap.yaz', { scope: 'grup' }) };

  app.post(
    '/kurumlar/:kurum_id/kaynak-kitaplar',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kaynak kitap tanimla (ad, yayinevi, ders, test/bolum listesi ve soru sayilari). Ogretmen kendi adina (`sahip_uyelik_id`), sahip/yonetici kurum tanimi olarak (`null`) ekler. Kitabin icerigi/PDF yuklenmez (telif).',
        params: kurumParam,
        body: KaynakKitapOlusturGirdiSema,
        response: { 201: KaynakKitapDetaySema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        if (g.kademe_id) {
          const [kd] = await tx
            .select({ id: kademeler.id })
            .from(kademeler)
            .where(and(eq(kademeler.id, g.kademe_id), eq(kademeler.kurum_id, y.kurumId)));
          if (!kd) throw new AppError(404, errorCodes.notFound, 'Kademe bulunamadı.');
        }
        const [brans] = await tx.execute<{ kod: string }>(
          sql`select kod from ortak.bransler where kod = ${g.brans_kodu} and aktif`,
        );
        if (!brans) {
          throw new AppError(422, gunlukSoruHataKodlari.bransGecersiz, 'Branş kodu geçersiz.');
        }
        for (const t of g.testler) await testKonusuDogrula(tx, g.brans_kodu, t.konu_id);
        const [k] = await tx
          .insert(kaynakKitaplar)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            ad: g.ad,
            yayinevi: g.yayinevi ?? null,
            brans_kodu: g.brans_kodu,
            kademe_id: g.kademe_id ?? null,
            sahip_uyelik_id: y.rol === 'ogretmen' ? y.uyelikId : null,
          })
          .returning();
        if (!k) throw new Error('kaynak kitap yazılamadı');
        const testler =
          g.testler.length === 0
            ? []
            : await tx
                .insert(kaynakKitapTestleri)
                .values(
                  g.testler.map((t, i) => ({
                    id: uuidv7(),
                    kurum_id: y.kurumId,
                    created_by: y.kullaniciId,
                    kitap_id: k.id,
                    sira: i + 1,
                    ad: t.ad,
                    soru_sayisi: t.soru_sayisi,
                    konu_id: t.konu_id ?? null,
                  })),
                )
                .returning();
        const [yanit] = await kitapYanitlari(tx, [k], null);
        if (!yanit) throw new Error('kitap yanıtı oluşturulamadı');
        return { ...yanit, testler: testler.map((t) => testYaniti(t)) };
      });
      return reply.status(201).send(sonuc);
    },
  );

  app.get(
    '/kurumlar/:kurum_id/kaynak-kitaplar',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kaynak kitap listesi (ders adina gore). Ogrenci yalniz aktifleri gorur ve `ilerleme` (cozulen test / toplam test) kendi kayitlarindan hesaplanir; personel `pasifler=true` ile pasifleri de gorur, `ogrenci_id` (kapsamdaki ogrenci) verirse ilerleme o ogrenci icindir.',
        params: kurumParam,
        querystring: KaynakKitapListeSorguSema,
        response: { 200: KaynakKitapListeYanitiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const q = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        const personel = y.rol !== 'ogrenci';
        const kitaplar = await tx
          .select()
          .from(kaynakKitaplar)
          .where(
            and(
              eq(kaynakKitaplar.kurum_id, y.kurumId),
              q.brans_kodu ? eq(kaynakKitaplar.brans_kodu, q.brans_kodu) : undefined,
              personel && q.pasifler ? undefined : eq(kaynakKitaplar.aktif, true),
            ),
          )
          .orderBy(asc(kaynakKitaplar.brans_kodu), asc(kaynakKitaplar.ad), asc(kaynakKitaplar.id));
        const hedef = await ilerlemeOgrencisi(tx, y, q.ogrenci_id);
        const gunler = hedef ? await cozumGunleri(tx, y, hedef) : null;
        return { kitaplar: await kitapYanitlari(tx, kitaplar, gunler) };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/kaynak-kitaplar/:id',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kitap ve testleri. Ogrenci rolunde (ya da personelde `ogrenci_id` ile) her testin `cozuldu_gun` (ilk cozum gunu) ve kitap `ilerleme`si dolar.',
        params: kitapParam,
        querystring: z.object({ ogrenci_id: z.uuid().optional() }),
        response: { 200: KaynakKitapDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const [k] = await tx
          .select()
          .from(kaynakKitaplar)
          .where(
            and(eq(kaynakKitaplar.id, request.params.id), eq(kaynakKitaplar.kurum_id, y.kurumId)),
          );
        if (!k || (y.rol === 'ogrenci' && !k.aktif)) throw kitapBulunamadi();
        const testler = await tx
          .select()
          .from(kaynakKitapTestleri)
          .where(eq(kaynakKitapTestleri.kitap_id, k.id))
          .orderBy(asc(kaynakKitapTestleri.sira));
        const hedef = await ilerlemeOgrencisi(tx, y, request.query.ogrenci_id);
        const gunler = hedef ? await cozumGunleri(tx, y, hedef) : null;
        const [yanit] = await kitapYanitlari(tx, [k], gunler);
        if (!yanit) throw kitapBulunamadi();
        return {
          ...yanit,
          testler: testler.map((t) =>
            testYaniti(t, gunler ? (gunler.get(t.id) ?? null) : undefined),
          ),
        };
      });
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/kaynak-kitaplar/:id',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kitap adi, yayinevi, kademe ya da aktiflik (silme yerine `aktif=false`; eski kayitlar baglı kalir). Ogretmen yalniz kendi kitabini (baskasininki 403). Iyimser kilit: `surum`.',
        params: kitapParam,
        body: KaynakKitapGuncelleGirdiSema,
        response: { 200: KaynakKitapSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      return withTenant(db, kiraci(y), async (tx) => {
        const [k] = await tx
          .select()
          .from(kaynakKitaplar)
          .where(
            and(eq(kaynakKitaplar.id, request.params.id), eq(kaynakKitaplar.kurum_id, y.kurumId)),
          )
          .for('update');
        if (!k) throw kitapBulunamadi();
        yazmaYetkisi(y, k);
        surumUyumluOlmali(k.surum, g.surum);
        if (g.kademe_id) {
          const [kd] = await tx
            .select({ id: kademeler.id })
            .from(kademeler)
            .where(and(eq(kademeler.id, g.kademe_id), eq(kademeler.kurum_id, y.kurumId)));
          if (!kd) throw new AppError(404, errorCodes.notFound, 'Kademe bulunamadı.');
        }
        const [yeni] = await tx
          .update(kaynakKitaplar)
          .set({
            ...(g.ad === undefined ? {} : { ad: g.ad }),
            ...(g.yayinevi === undefined ? {} : { yayinevi: g.yayinevi }),
            ...(g.kademe_id === undefined ? {} : { kademe_id: g.kademe_id }),
            ...(g.aktif === undefined ? {} : { aktif: g.aktif }),
          })
          .where(eq(kaynakKitaplar.id, k.id))
          .returning();
        if (!yeni) throw new Error('kaynak kitap güncellenemedi');
        const [yanit] = await kitapYanitlari(tx, [yeni], null);
        if (!yanit) throw new Error('kitap yanıtı oluşturulamadı');
        return yanit;
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/kaynak-kitaplar/:id/testler',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary: `Kitaba test/bolum ekle (toplu). Sira son siradan devam eder; kitap basina en cok ${String(KAYNAK_KITAP_EN_FAZLA_TEST)} test.`,
        params: kitapParam,
        body: KaynakTestEkleGirdiSema,
        response: { 201: KaynakKitapDetaySema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        const [k] = await tx
          .select()
          .from(kaynakKitaplar)
          .where(
            and(eq(kaynakKitaplar.id, request.params.id), eq(kaynakKitaplar.kurum_id, y.kurumId)),
          )
          .for('update');
        if (!k) throw kitapBulunamadi();
        yazmaYetkisi(y, k);
        for (const t of g.testler) await testKonusuDogrula(tx, k.brans_kodu, t.konu_id);
        const [son] = await tx
          .select({ sira: max(kaynakKitapTestleri.sira), adet: sql<number>`count(*)::int` })
          .from(kaynakKitapTestleri)
          .where(eq(kaynakKitapTestleri.kitap_id, k.id));
        if ((son?.adet ?? 0) + g.testler.length > KAYNAK_KITAP_EN_FAZLA_TEST) {
          throw new AppError(
            422,
            errorCodes.validation,
            `Bir kitapta en çok ${String(KAYNAK_KITAP_EN_FAZLA_TEST)} test olabilir.`,
          );
        }
        const baslangic = (son?.sira ?? 0) + 1;
        await tx.insert(kaynakKitapTestleri).values(
          g.testler.map((t, i) => ({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            kitap_id: k.id,
            sira: baslangic + i,
            ad: t.ad,
            soru_sayisi: t.soru_sayisi,
            konu_id: t.konu_id ?? null,
          })),
        );
        const testler = await tx
          .select()
          .from(kaynakKitapTestleri)
          .where(eq(kaynakKitapTestleri.kitap_id, k.id))
          .orderBy(asc(kaynakKitapTestleri.sira));
        const [yanit] = await kitapYanitlari(tx, [k], null);
        if (!yanit) throw new Error('kitap yanıtı oluşturulamadı');
        return { ...yanit, testler: testler.map((t) => testYaniti(t)) };
      });
      return reply.status(201).send(sonuc);
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/kaynak-kitaplar/:id/testler/:test_id',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary: 'Test adini, soru sayisini ya da konusunu guncelle.',
        params: testParam,
        body: KaynakTestGuncelleGirdiSema,
        response: { 200: KaynakTestSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      return withTenant(db, kiraci(y), async (tx) => {
        const [k] = await tx
          .select()
          .from(kaynakKitaplar)
          .where(
            and(eq(kaynakKitaplar.id, request.params.id), eq(kaynakKitaplar.kurum_id, y.kurumId)),
          );
        if (!k) throw kitapBulunamadi();
        yazmaYetkisi(y, k);
        await testKonusuDogrula(tx, k.brans_kodu, g.konu_id);
        const [t] = await tx
          .update(kaynakKitapTestleri)
          .set({
            ...(g.ad === undefined ? {} : { ad: g.ad }),
            ...(g.soru_sayisi === undefined ? {} : { soru_sayisi: g.soru_sayisi }),
            ...(g.konu_id === undefined ? {} : { konu_id: g.konu_id }),
          })
          .where(
            and(
              eq(kaynakKitapTestleri.id, request.params.test_id),
              eq(kaynakKitapTestleri.kitap_id, k.id),
            ),
          )
          .returning();
        if (!t) throw testBulunamadi();
        return testYaniti(t);
      });
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/kaynak-kitaplar/:id/testler/:test_id',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Testi sil. Bir gunluk kayitta kullanilmissa 409 `kaynak_testi_kullanimda` (kitabi pasiflestirin).',
        params: testParam,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      await withTenant(db, kiraci(y), async (tx) => {
        const [k] = await tx
          .select()
          .from(kaynakKitaplar)
          .where(
            and(eq(kaynakKitaplar.id, request.params.id), eq(kaynakKitaplar.kurum_id, y.kurumId)),
          );
        if (!k) throw kitapBulunamadi();
        yazmaYetkisi(y, k);
        const [kullanim] = await tx
          .select({ id: gunlukSoruKayitlari.id })
          .from(gunlukSoruKayitlari)
          .where(eq(gunlukSoruKayitlari.kaynak_test_id, request.params.test_id))
          .limit(1);
        if (kullanim) {
          throw new AppError(
            409,
            gunlukSoruHataKodlari.kaynakTestiKullanimda,
            'Bu test günlük kayıtlarda kullanıldığı için silinemez.',
          );
        }
        const silinen = await tx
          .delete(kaynakKitapTestleri)
          .where(
            and(
              eq(kaynakKitapTestleri.id, request.params.test_id),
              eq(kaynakKitapTestleri.kitap_id, k.id),
            ),
          )
          .returning({ id: kaynakKitapTestleri.id });
        if (silinen.length === 0) throw testBulunamadi();
      });
      return reply.status(204).send(null);
    },
  );

  return Promise.resolve();
};
