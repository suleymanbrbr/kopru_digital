import {
  SoruAyarlariGuncelleGirdiSema,
  SoruAyarlariSema,
  SoruBildirimKapatGirdiSema,
  SoruBildirimListeSorguSema,
  SoruBildirimListeYanitSema,
  SoruBildirimSema,
  SoruListeYanitSema,
  SoruMasasiGuncelleGirdiSema,
  SoruMasasiListeYanitSema,
  SoruMasasiOlusturGirdiSema,
  SoruMasasiSema,
  SoruMasasiUyeGirdiSema,
  SoruOlcumSema,
  SoruOlcumSorguSema,
  SoruYonetimSorguSema,
  errorCodes,
  soruHataKodlari,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  bransler,
  soruAyarlari,
  soruBildirimleri,
  soruMasalari,
  soruMasasiUyeleri,
  sorular,
  uyelikler,
} from '../../db/schema.js';
import { gorunenAdlar } from '../hesap/index.js';
import { soruAramaKosulu, soruListele } from './soru-liste.js';
import {
  ayarOku,
  benzersizlikIhlali,
  imlecCoz,
  imlecYaz,
  kiraci,
  kurumParam,
  soruDenetimiYaz,
  yerelZaman,
  yetkiAl,
  yonetimKapisi,
} from './soru-ortak.js';

const masaParam = kurumParam.extend({ id: z.uuid() });
type MasaSatiri = typeof soruMasalari.$inferSelect;

async function masaYaniti(tx: Tx, masalar: readonly MasaSatiri[]) {
  if (masalar.length === 0) return [];
  const uyeler = await tx
    .select()
    .from(soruMasasiUyeleri)
    .where(
      inArray(
        soruMasasiUyeleri.masa_id,
        masalar.map((m) => m.id),
      ),
    );
  const adlar = await gorunenAdlar(
    tx,
    uyeler.map((u) => u.ogretmen_id),
  );
  return masalar.map((m) => ({
    id: m.id,
    brans_kodu: m.brans_kodu,
    ad: m.ad,
    aktif: m.aktif,
    arsivlendi_at: m.arsivlendi_at?.toISOString() ?? null,
    uyeler: uyeler
      .filter((u) => u.masa_id === m.id)
      .map((u) => ({ ogretmen_id: u.ogretmen_id, gorunen_ad: adlar.get(u.ogretmen_id) ?? null })),
    surum: m.surum,
    created_at: m.created_at.toISOString(),
  }));
}

const masaBulunamadi = () => new AppError(404, errorCodes.notFound, 'Soru masası bulunamadı.');

/** Masa uyesi yalniz kurumun etkin personeli (ogretmen, yonetici, sahip) olabilir. */
async function ogretmenleriDogrula(tx: Tx, kurumId: string, idler: readonly string[]) {
  if (idler.length === 0) return;
  const satirlar = await tx
    .select({ id: uyelikler.id })
    .from(uyelikler)
    .where(
      and(
        eq(uyelikler.kurum_id, kurumId),
        eq(uyelikler.durum, 'aktif'),
        inArray(uyelikler.rol, ['ogretmen', 'yonetici', 'sahip']),
        inArray(uyelikler.id, [...idler]),
      ),
    );
  if (satirlar.length !== new Set(idler).size) {
    throw new AppError(
      422,
      soruHataKodlari.ogretmenGecersiz,
      'Öğretmen bulunamadı ya da etkin değil.',
    );
  }
}

const ayarYaniti = (a: Awaited<ReturnType<typeof ayarOku>>) => ({
  gunluk_soru_limiti: a.gunluk,
  aylik_soru_limiti: a.aylik,
  soru_basina_takip_limiti: a.takip,
  ses_azami_sn: a.sesAzami,
  foto_saklama_gun: a.saklamaGun,
  varsayilan: a.varsayilan,
  surum: a.surum,
});

/** `soru.yonet` (sahip/yonetici) uclari: masalar, ayarlar, tum yazismalar, bildirimler, olcum. */
export const soruYonetimYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;

  app.get(
    '/kurumlar/:kurum_id/soru-masalari',
    {
      preHandler: yonetimKapisi(),
      schema: {
        tags: ['ogrenme'],
        summary: 'Soru masalari ve uyeleri (arsivlenmemis).',
        params: kurumParam,
        response: { 200: SoruMasasiListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const masalar = await tx
          .select()
          .from(soruMasalari)
          .where(and(eq(soruMasalari.kurum_id, y.kurumId), isNull(soruMasalari.arsivlendi_at)))
          .orderBy(soruMasalari.brans_kodu);
        return { masalar: await masaYaniti(tx, masalar) };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/soru-masalari',
    {
      preHandler: yonetimKapisi(),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Soru masasi olustur (brans basina tek arsivlenmemis masa; varsa 409 `masa_var`). Uyeler etkin personel olmali.',
        params: kurumParam,
        body: SoruMasasiOlusturGirdiSema,
        response: { 201: SoruMasasiSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        const [b] = await tx
          .select({ kod: bransler.kod })
          .from(bransler)
          .where(and(eq(bransler.kod, g.brans_kodu), eq(bransler.aktif, true)));
        if (!b) throw new AppError(422, soruHataKodlari.bransGecersiz, 'Branş kodu geçersiz.');
        const uyeIdleri = [...new Set(g.ogretmen_idleri ?? [])];
        await ogretmenleriDogrula(tx, y.kurumId, uyeIdleri);
        const [m] = await tx
          .insert(soruMasalari)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            brans_kodu: g.brans_kodu,
            ad: g.ad,
            aktif: g.aktif,
          })
          .returning();
        if (!m) throw new Error('masa yazılamadı');
        for (const o of uyeIdleri) {
          await tx.insert(soruMasasiUyeleri).values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            masa_id: m.id,
            ogretmen_id: o,
          });
        }
        await soruDenetimiYaz(tx, y, request.ip, 'soru_masasi.olustur', 'soru_masasi', m.id, null, {
          brans_kodu: m.brans_kodu,
          uye_sayisi: uyeIdleri.length,
        });
        const [yanit] = await masaYaniti(tx, [m]);
        return yanit;
      }).catch((err: unknown) => {
        if (benzersizlikIhlali(err)) {
          throw new AppError(409, soruHataKodlari.masaVar, 'Bu branşta zaten bir soru masası var.');
        }
        throw err;
      });
      void reply.status(201);
      return sonuc;
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/soru-masalari/:id',
    {
      preHandler: yonetimKapisi(),
      schema: {
        tags: ['ogrenme'],
        summary: 'Masa adi/aktiflik guncelle (`surum` zorunlu; eskiyse 409 `surum_cakismasi`).',
        params: masaParam,
        body: SoruMasasiGuncelleGirdiSema,
        response: { 200: SoruMasasiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      return withTenant(db, kiraci(y), async (tx) => {
        const [m] = await tx
          .update(soruMasalari)
          .set({
            ...(g.ad === undefined ? {} : { ad: g.ad }),
            ...(g.aktif === undefined ? {} : { aktif: g.aktif }),
          })
          .where(
            and(
              eq(soruMasalari.id, request.params.id),
              eq(soruMasalari.kurum_id, y.kurumId),
              isNull(soruMasalari.arsivlendi_at),
              eq(soruMasalari.surum, g.surum),
            ),
          )
          .returning();
        if (!m) {
          const [var_] = await tx
            .select({ id: soruMasalari.id })
            .from(soruMasalari)
            .where(and(eq(soruMasalari.id, request.params.id), isNull(soruMasalari.arsivlendi_at)));
          if (!var_) throw masaBulunamadi();
          throw new AppError(
            409,
            soruHataKodlari.surumCakismasi,
            'Masa başka biri tarafından değiştirildi.',
          );
        }
        await soruDenetimiYaz(
          tx,
          y,
          request.ip,
          'soru_masasi.guncelle',
          'soru_masasi',
          m.id,
          null,
          {
            aktif: m.aktif,
          },
        );
        const [yanit] = await masaYaniti(tx, [m]);
        return yanit as z.infer<typeof SoruMasasiSema>;
      });
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/soru-masalari/:id',
    {
      preHandler: yonetimKapisi(),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Masayi arsivle (acik sorular masayla kalir; yeni soru artik bu masaya yonlenmez).',
        params: masaParam,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      await withTenant(db, kiraci(y), async (tx) => {
        const [m] = await tx
          .update(soruMasalari)
          .set({ arsivlendi_at: new Date(), aktif: false })
          .where(
            and(
              eq(soruMasalari.id, request.params.id),
              eq(soruMasalari.kurum_id, y.kurumId),
              isNull(soruMasalari.arsivlendi_at),
            ),
          )
          .returning();
        if (!m) throw masaBulunamadi();
        await soruDenetimiYaz(
          tx,
          y,
          request.ip,
          'soru_masasi.arsivle',
          'soru_masasi',
          m.id,
          null,
          {},
        );
      });
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/kurumlar/:kurum_id/soru-masalari/:id/uyeler',
    {
      preHandler: yonetimKapisi(),
      schema: {
        tags: ['ogrenme'],
        summary: 'Masaya ogretmen ekle (zaten uyeyse etkisiz).',
        params: masaParam,
        body: SoruMasasiUyeGirdiSema,
        response: { 200: SoruMasasiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const [m] = await tx
          .select()
          .from(soruMasalari)
          .where(
            and(
              eq(soruMasalari.id, request.params.id),
              eq(soruMasalari.kurum_id, y.kurumId),
              isNull(soruMasalari.arsivlendi_at),
            ),
          );
        if (!m) throw masaBulunamadi();
        await ogretmenleriDogrula(tx, y.kurumId, [request.body.ogretmen_id]);
        await tx
          .insert(soruMasasiUyeleri)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            masa_id: m.id,
            ogretmen_id: request.body.ogretmen_id,
          })
          .onConflictDoNothing();
        await soruDenetimiYaz(
          tx,
          y,
          request.ip,
          'soru_masasi.uye_ekle',
          'soru_masasi',
          m.id,
          null,
          {
            ogretmen_id: request.body.ogretmen_id,
          },
        );
        const [yanit] = await masaYaniti(tx, [m]);
        return yanit as z.infer<typeof SoruMasasiSema>;
      });
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/soru-masalari/:id/uyeler/:ogretmen_id',
    {
      preHandler: yonetimKapisi(),
      schema: {
        tags: ['ogrenme'],
        summary: 'Masadan ogretmen cikar.',
        params: masaParam.extend({ ogretmen_id: z.uuid() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      await withTenant(db, kiraci(y), async (tx) => {
        const silinen = await tx
          .delete(soruMasasiUyeleri)
          .where(
            and(
              eq(soruMasasiUyeleri.kurum_id, y.kurumId),
              eq(soruMasasiUyeleri.masa_id, request.params.id),
              eq(soruMasasiUyeleri.ogretmen_id, request.params.ogretmen_id),
            ),
          )
          .returning({ id: soruMasasiUyeleri.id });
        if (silinen.length === 0) throw masaBulunamadi();
        await soruDenetimiYaz(
          tx,
          y,
          request.ip,
          'soru_masasi.uye_cikar',
          'soru_masasi',
          request.params.id,
          null,
          {
            ogretmen_id: request.params.ogretmen_id,
          },
        );
      });
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/kurumlar/:kurum_id/soru-ayarlari',
    {
      preHandler: yonetimKapisi(),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kurum soru ayarlari (kayit yoksa varsayilanlar: gunde 3 soru, aylik sinirsiz, 3 takip, ses 180 sn, fotograf 30 gun).',
        params: kurumParam,
        response: { 200: SoruAyarlariSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => ayarYaniti(await ayarOku(tx, y.kurumId)));
    },
  );

  app.put(
    '/kurumlar/:kurum_id/soru-ayarlari',
    {
      preHandler: yonetimKapisi(),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kurum soru ayarlarini guncelle (gonderilen alanlar degisir; limit `null` = sinirsiz). Plan ust siniri abonelik blogu gelince `LEAST` ile uygulanir.',
        params: kurumParam,
        body: SoruAyarlariGuncelleGirdiSema,
        response: { 200: SoruAyarlariSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      return withTenant(db, kiraci(y), async (tx) => {
        const once = await ayarOku(tx, y.kurumId);
        const degerler = {
          gunluk_soru_limiti:
            g.gunluk_soru_limiti === undefined ? once.gunluk : g.gunluk_soru_limiti,
          aylik_soru_limiti: g.aylik_soru_limiti === undefined ? once.aylik : g.aylik_soru_limiti,
          soru_basina_takip_limiti: g.soru_basina_takip_limiti ?? once.takip,
          ses_azami_sn: g.ses_azami_sn ?? once.sesAzami,
          foto_saklama_gun: g.foto_saklama_gun ?? once.saklamaGun,
        };
        await tx
          .insert(soruAyarlari)
          .values({ id: uuidv7(), kurum_id: y.kurumId, created_by: y.kullaniciId, ...degerler })
          .onConflictDoUpdate({ target: soruAyarlari.kurum_id, set: degerler });
        await soruDenetimiYaz(
          tx,
          y,
          request.ip,
          'soru_ayari.guncelle',
          'kurum',
          y.kurumId,
          ayarYaniti(once),
          degerler,
        );
        return ayarYaniti(await ayarOku(tx, y.kurumId));
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/yonetim/sorular',
    {
      preHandler: yonetimKapisi(),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kurumdaki tum soru yazismalari (en yeni hareket once): brans, durum, ogrenci, ogretmen suzgeci ve Turkce harf duyarsiz arama. Detay `GET /sorular/:id`.',
        params: kurumParam,
        querystring: SoruYonetimSorguSema,
        response: { 200: SoruListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const s = request.query;
      return withTenant(db, kiraci(y), (tx) =>
        soruListele(
          tx,
          [
            eq(sorular.kurum_id, y.kurumId),
            s.brans_kodu ? eq(sorular.brans_kodu, s.brans_kodu) : undefined,
            s.durum ? eq(sorular.durum, s.durum) : undefined,
            s.ogrenci_id ? eq(sorular.ogrenci_id, s.ogrenci_id) : undefined,
            s.ogretmen_id
              ? or(
                  eq(sorular.atanan_ogretmen_id, s.ogretmen_id),
                  eq(sorular.ustlenen_id, s.ogretmen_id),
                  eq(sorular.ilk_cevaplayan_id, s.ogretmen_id),
                )
              : undefined,
            s.q ? soruAramaKosulu(s.q) : undefined,
          ],
          { artan: false, limit: s.limit, imlec: s.imlec },
        ),
      );
    },
  );

  const bildirimYaniti = async (
    tx: Tx,
    satirlar: readonly {
      b: typeof soruBildirimleri.$inferSelect;
      brans: string;
    }[],
  ) => {
    const adlar = await gorunenAdlar(
      tx,
      satirlar.map((r) => r.b.bildiren_id),
    );
    return satirlar.map(({ b, brans }) => ({
      id: b.id,
      soru_id: b.soru_id,
      mesaj_id: b.mesaj_id,
      brans_kodu: brans,
      bildiren_id: b.bildiren_id,
      bildiren_adi: adlar.get(b.bildiren_id) ?? null,
      neden: b.neden as 'uygunsuz',
      aciklama: b.aciklama,
      durum: b.durum as 'acik',
      created_at: b.created_at.toISOString(),
      kapandi_at: b.kapandi_at?.toISOString() ?? null,
      kapatma_notu: b.kapatma_notu,
    }));
  };

  app.get(
    '/kurumlar/:kurum_id/soru-bildirimleri',
    {
      preHandler: yonetimKapisi(),
      schema: {
        tags: ['ogrenme'],
        summary: 'Uygunsuz icerik bildirimleri (varsayilan acik olanlar), en yeni once, imleçli.',
        params: kurumParam,
        querystring: SoruBildirimListeSorguSema,
        response: { 200: SoruBildirimListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { durum, limit, imlec } = request.query;
      const son = imlecCoz(imlec);
      return withTenant(db, kiraci(y), async (tx) => {
        const ts = sql<string>`${soruBildirimleri.created_at}::text`;
        const satirlar = await tx
          .select({ b: soruBildirimleri, brans: sorular.brans_kodu, ts })
          .from(soruBildirimleri)
          .innerJoin(sorular, eq(sorular.id, soruBildirimleri.soru_id))
          .where(
            and(
              eq(soruBildirimleri.kurum_id, y.kurumId),
              eq(soruBildirimleri.durum, durum),
              son
                ? sql`(${soruBildirimleri.created_at}, ${soruBildirimleri.id}) < (${son.ts}::timestamptz, ${son.id}::uuid)`
                : undefined,
            ),
          )
          .orderBy(desc(soruBildirimleri.created_at), desc(soruBildirimleri.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        const sonSatir = sayfa.at(-1);
        return {
          bildirimler: await bildirimYaniti(tx, sayfa),
          sonraki_imlec:
            satirlar.length > limit && sonSatir ? imlecYaz(sonSatir.ts, sonSatir.b.id) : null,
        };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/soru-bildirimleri/:id/kapat',
    {
      preHandler: yonetimKapisi(),
      schema: {
        tags: ['ogrenme'],
        summary: 'Bildirimi kapat (not isteğe bagli). Zaten kapaliysa etkisiz.',
        params: masaParam,
        body: SoruBildirimKapatGirdiSema,
        response: { 200: SoruBildirimSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        await tx
          .update(soruBildirimleri)
          .set({
            durum: 'kapandi',
            kapatan_id: y.uyelikId,
            kapandi_at: new Date(),
            kapatma_notu: request.body.not ?? null,
          })
          .where(
            and(
              eq(soruBildirimleri.id, request.params.id),
              eq(soruBildirimleri.kurum_id, y.kurumId),
              eq(soruBildirimleri.durum, 'acik'),
            ),
          );
        const [r] = await tx
          .select({ b: soruBildirimleri, brans: sorular.brans_kodu })
          .from(soruBildirimleri)
          .innerJoin(sorular, eq(sorular.id, soruBildirimleri.soru_id))
          .where(
            and(
              eq(soruBildirimleri.id, request.params.id),
              eq(soruBildirimleri.kurum_id, y.kurumId),
            ),
          );
        if (!r) throw new AppError(404, errorCodes.notFound, 'Bildirim bulunamadı.');
        await soruDenetimiYaz(
          tx,
          y,
          request.ip,
          'soru_bildirimi.kapat',
          'soru_bildirimi',
          r.b.id,
          null,
          {
            not_var: request.body.not !== undefined,
          },
        );
        const [yanit] = await bildirimYaniti(tx, [r]);
        return yanit as z.infer<typeof SoruBildirimSema>;
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/soru-olcum',
    {
      preHandler: yonetimKapisi(),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Olcum ozeti (kurum yerel gunu, tarih araligi; varsayilan son 30 gun): soru sayisi, cevaplanan, ortalama ilk cevap suresi, "anladim" orani (anladim / cevaplanan); ogretmen (ilk cevaplayan) ve brans kirilimi.',
        params: kurumParam,
        querystring: SoruOlcumSorguSema,
        response: { 200: SoruOlcumSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const z = await yerelZaman(tx, y.kurumId);
        const [v] = await tx.execute<{ bas: string }>(
          sql`select (${z.gun}::date - 30)::text as bas`,
        );
        const bas = request.query.baslangic ?? v?.bas ?? z.gun;
        const bit = request.query.bitis ?? z.gun;
        const kosul = sql`kurum_id = ${y.kurumId}::uuid
          and (created_at at time zone ${z.tz})::date between ${bas}::date and ${bit}::date`;
        const alanlar = sql`count(*)::int as soru_sayisi,
          (count(*) filter (where ilk_cevap_at is not null))::int as cevaplanan,
          (count(*) filter (where durum = 'cozuldu' and cozuldu_kaynagi = 'ogrenci'))::int as anladim,
          round(avg(extract(epoch from (ilk_cevap_at - created_at))) filter (where ilk_cevap_at is not null))::int as ort`;
        interface Ham extends Record<string, unknown> {
          soru_sayisi: number;
          cevaplanan: number;
          anladim: number;
          ort: number | null;
        }
        const donustur = (r: Ham) => ({
          soru_sayisi: r.soru_sayisi,
          cevaplanan: r.cevaplanan,
          anladim: r.anladim,
          anladim_orani:
            r.cevaplanan === 0 ? null : Math.round((r.anladim / r.cevaplanan) * 10_000) / 10_000,
          ortalama_ilk_cevap_sn: r.ort,
        });
        const [toplam] = await tx.execute<Ham>(
          sql`select ${alanlar} from ogrenme.sorular where ${kosul}`,
        );
        const ogretmenler = await tx.execute<Ham & { ogretmen_id: string }>(sql`
          select ilk_cevaplayan_id as ogretmen_id, ${alanlar} from ogrenme.sorular
          where ${kosul} and ilk_cevaplayan_id is not null group by ilk_cevaplayan_id
          order by cevaplanan desc, ilk_cevaplayan_id`);
        const branslar = await tx.execute<Ham & { brans_kodu: string }>(sql`
          select brans_kodu, ${alanlar} from ogrenme.sorular where ${kosul}
          group by brans_kodu order by soru_sayisi desc, brans_kodu`);
        const adlar = await gorunenAdlar(
          tx,
          ogretmenler.map((o) => o.ogretmen_id),
        );
        return {
          baslangic: bas,
          bitis: bit,
          ...donustur(toplam ?? { soru_sayisi: 0, cevaplanan: 0, anladim: 0, ort: null }),
          ogretmenler: ogretmenler.map((o) => ({
            ogretmen_id: o.ogretmen_id,
            gorunen_ad: adlar.get(o.ogretmen_id) ?? null,
            ...donustur(o),
          })),
          branslar: branslar.map((b) => ({ brans_kodu: b.brans_kodu, ...donustur(b) })),
        };
      });
    },
  );

  return Promise.resolve();
};
