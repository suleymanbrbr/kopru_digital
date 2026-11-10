import {
  DenemeGuncelleGirdiSema,
  DenemeListeSorguSema,
  DenemeListeYanitSema,
  DenemeOlusturGirdiSema,
  DenemeRedGirdiSema,
  DenemeSema,
  DenemeTopluGirdiSema,
  DenemeTopluYanitSema,
  DenemelerimSorguSema,
  denemeHataKodlari,
  errorCodes,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';

import { denemeBolumleri, denemeKurallari, denemeler } from '../../db/schema.js';
import { requirePermission, type YetkiBaglami } from '../hesap/index.js';
import {
  benzersizlikIhlaliMi,
  bolumSatirlariniYaz,
  bolumleriHazirla,
  denemeBul,
  denemeDenetimiYaz,
  denemeModuluAcikOlmali,
  denemeYanitlari,
  denemeleriYaz,
  girildiOlayiYaz,
  kapsamdakiOgrenciler,
  kuralCoz,
  kuralReferansi,
  ogrenciBulunamadi,
  ogrenciGirisiAcikOlmali,
  ogrenciKosulu,
  sayi,
  toplamNetSql,
  topluYaz,
  type DenemeSatiri,
} from './deneme-deposu.js';
import { imlecCoz, imlecYaz, kiraci, kurumParam, olayBaglami, yetkiAl } from './odev-deposu.js';

const denemeParam = kurumParam.extend({ id: z.uuid() });
const SilSorguSema = z.object({ surum: z.coerce.number().int().min(1).optional() });

const zatenVar = () =>
  new AppError(
    409,
    denemeHataKodlari.denemeZatenVar,
    'Bu öğrenci için aynı kural, tarih ve adla bir deneme zaten girilmiş.',
  );

const onayDurumuHatasi = (mesaj: string) =>
  new AppError(409, denemeHataKodlari.onayDurumuGecersiz, mesaj);

/** Cakisma (benzersizlik) hatasini 409'a cevirerek calistirir. */
async function cakismayiCevir<T>(is: () => Promise<T>): Promise<T> {
  try {
    return await is();
  } catch (err) {
    if (benzersizlikIhlaliMi(err)) throw zatenVar();
    throw err;
  }
}

const sonucOzeti = (d: DenemeSatiri) => ({
  kural_kodu: d.kural_kodu,
  sinav_tarihi: d.sinav_tarihi,
  toplam_net: sayi(d.toplam_net),
  onay_durumu: d.onay_durumu,
  kaynak: d.kaynak,
});

/** Ogrenci rolu yalniz kendi onaylanmamis (bekliyor/reddedildi) sonucunu degistirir; kurum ayari acik olmali. */
async function ogrenciDegisikligiDenetle(tx: Tx, y: YetkiBaglami, d: DenemeSatiri) {
  if (d.kaynak !== 'ogrenci' || d.ogrenci_id !== y.uyelikId) throw ogrenciBulunamadi();
  await ogrenciGirisiAcikOlmali(tx, y.kurumId);
  if (d.onay_durumu === 'onaylandi') {
    throw onayDurumuHatasi('Onaylanmış deneme değiştirilemez; öğretmeninizden isteyin.');
  }
}

/** Ogretmen/yonetici ve ogrenci deneme uclari (`/v1/ogrenme/kurumlar/:kurum_id/denemeler...`). */
export const denemeYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const kendiOku = { preHandler: requirePermission('deneme.oku') };
  const grupOku = { preHandler: requirePermission('deneme.oku', { scope: 'grup' }) };
  const kendiYaz = { preHandler: requirePermission('deneme.yaz') };
  const grupYaz = { preHandler: requirePermission('deneme.yaz', { scope: 'grup' }) };

  app.post(
    '/kurumlar/:kurum_id/denemeler',
    {
      ...kendiYaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Deneme sonucu ekle. Ogretmen/yonetici: `ogrenci_id` zorunlu, kapsamdaki ogrenciye, dogrudan `onaylandi` (olay uretir). Ogrenci: yalniz kendi sonucu, `bekliyor` (ogretmen onayi gerekir, olay uretmez); kurum ayari `ogrenci_deneme_girisi` kapaliysa 403. Net veritabanince hesaplanir: yanit `net` sayisi (2 ondalik). Ayni ogrenci/kural/tarih/ad 409.',
        params: kurumParam,
        body: DenemeOlusturGirdiSema,
        response: { 201: DenemeSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const ogrenciMi = y.rol === 'ogrenci';
      const baglam = olayBaglami(y, request.correlationId);
      const sonuc = await cakismayiCevir(() =>
        withTenant(db, kiraci(y), async (tx) => {
          if (ogrenciMi) {
            if (g.ogrenci_id !== undefined && g.ogrenci_id !== y.uyelikId) {
              throw ogrenciBulunamadi();
            }
            await ogrenciGirisiAcikOlmali(tx, y.kurumId);
          } else if (g.ogrenci_id === undefined) {
            throw new AppError(422, errorCodes.validation, 'ogrenci_id gerekli.');
          }
          const ogrenciId = ogrenciMi ? y.uyelikId : (g.ogrenci_id ?? '');
          const ogrenci = (await kapsamdakiOgrenciler(tx, y, [ogrenciId])).get(ogrenciId);
          if (!ogrenci) throw ogrenciBulunamadi();
          await denemeModuluAcikOlmali(tx, y.kurumId, ogrenci);
          const kural = await kuralCoz(tx, g);
          const h = bolumleriHazirla(kuralReferansi(kural), g.bolumler);
          if (h.hata) throw new AppError(422, h.hata.kod, h.hata.mesaj);
          const [d] = await denemeleriYaz(
            tx,
            y,
            { kural, kaynak: ogrenciMi ? 'ogrenci' : 'ogretmen' },
            [
              {
                ogrenci_id: ogrenciId,
                ad: g.ad,
                yayinevi: g.yayinevi ?? null,
                sinav_tarihi: g.sinav_tarihi,
                sure_dk: g.sure_dk ?? null,
                not_metni: g.not ?? null,
                bolumler: h.bolumler,
              },
            ],
          );
          if (!d) throw new Error('deneme yazılamadı');
          if (d.onay_durumu === 'onaylandi') await girildiOlayiYaz(tx, baglam, d);
          await denemeDenetimiYaz(tx, y, request.ip, 'deneme.olustur', 'deneme', d.id, null, {
            ogrenci_id: d.ogrenci_id,
            ...sonucOzeti(d),
          });
          const [yanit] = await denemeYanitlari(tx, [d], !ogrenciMi);
          if (!yanit) throw new Error('deneme yanıtı oluşturulamadı');
          return yanit;
        }),
      );
      return reply.status(201).send(sonuc);
    },
  );

  app.post(
    '/kurumlar/:kurum_id/denemeler/toplu',
    {
      ...grupYaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Tablo gorunumunden toplu giris: bir deneme + N ogrenci (en fazla 500), HEPSI YA DA HIC. Hata varsa 422 `toplu_giris_hatali` ve `details.hatalar` (satir bazli: satir, ogrenci_id, kod, mesaj). Basarida her ogrenci icin onayli deneme ve olay.',
        params: kurumParam,
        body: DenemeTopluGirdiSema,
        response: { 201: DenemeTopluYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      const sonuc = await cakismayiCevir(() =>
        withTenant(db, kiraci(y), async (tx) => {
          const kural = await kuralCoz(tx, g);
          const yazilan = await topluYaz(
            tx,
            y,
            baglam,
            kural,
            {
              ad: g.ad,
              yayinevi: g.yayinevi ?? null,
              sinav_tarihi: g.sinav_tarihi,
              sure_dk: g.sure_dk ?? null,
            },
            g.satirlar.map((s, i) => ({
              satir: i,
              ogrenci_id: s.ogrenci_id,
              bolumler: s.bolumler,
              not_metni: s.not ?? null,
            })),
          );
          await denemeDenetimiYaz(
            tx,
            y,
            request.ip,
            'deneme.toplu_olustur',
            'deneme_kurali',
            kural.id,
            null,
            {
              kural_kodu: kural.kod,
              sinav_tarihi: g.sinav_tarihi,
              olusturulan_sayisi: yazilan.length,
              kaynak: 'tablo',
            },
          );
          return {
            olusturulan_sayisi: yazilan.length,
            atlanan_satir_sayisi: 0,
            denemeler: yazilan.map((d) => ({
              deneme_id: d.id,
              ogrenci_id: d.ogrenci_id,
              toplam_net: sayi(d.toplam_net),
            })),
          };
        }),
      );
      return reply.status(201).send(sonuc);
    },
  );

  app.get(
    '/kurumlar/:kurum_id/denemeler',
    {
      ...grupOku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Deneme listesi (kapsamdaki ogrenciler, yeniden eskiye, sayfali). `onay=bekliyor` ogretmenin onay kuyrugudur.',
        params: kurumParam,
        querystring: DenemeListeSorguSema,
        response: { 200: DenemeListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { onay, ogrenci_id, kural, limit, imlec } = request.query;
      const sonImlec = imlecCoz(imlec);
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select()
          .from(denemeler)
          .where(
            and(
              eq(denemeler.kurum_id, y.kurumId),
              ogrenciKosulu(tx, y, denemeler.ogrenci_id),
              onay ? eq(denemeler.onay_durumu, onay) : undefined,
              ogrenci_id ? eq(denemeler.ogrenci_id, ogrenci_id) : undefined,
              kural ? eq(denemeler.kural_kodu, kural) : undefined,
              sonImlec ? lt(denemeler.id, sonImlec) : undefined,
            ),
          )
          .orderBy(desc(denemeler.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        const son = sayfa.at(-1);
        return {
          denemeler: await denemeYanitlari(tx, sayfa, true),
          sonraki_imlec: satirlar.length > limit && son ? imlecYaz(son.id) : null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/denemelerim',
    {
      ...kendiOku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin kendi denemeleri (onay durumu ve red nedeniyle, tum durumlar). Yalniz ogrenci rolu; baskasinin sonucu donmez.',
        params: kurumParam,
        querystring: DenemelerimSorguSema,
        response: { 200: DenemeListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      if (y.rol !== 'ogrenci') {
        throw new AppError(403, errorCodes.izinYok, 'Bu uç yalnızca öğrenciler içindir.');
      }
      const { kural, limit, imlec } = request.query;
      const sonImlec = imlecCoz(imlec);
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select()
          .from(denemeler)
          .where(
            and(
              eq(denemeler.kurum_id, y.kurumId),
              eq(denemeler.ogrenci_id, y.uyelikId),
              kural ? eq(denemeler.kural_kodu, kural) : undefined,
              sonImlec ? lt(denemeler.id, sonImlec) : undefined,
            ),
          )
          .orderBy(desc(denemeler.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        const son = sayfa.at(-1);
        return {
          denemeler: await denemeYanitlari(tx, sayfa, false),
          sonraki_imlec: satirlar.length > limit && son ? imlecYaz(son.id) : null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/denemeler/:id',
    {
      ...kendiOku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Deneme detayi (bolumleriyle). Kapsam disi 404; ogrenci yalniz kendi sonucunu gorur.',
        params: denemeParam,
        response: { 200: DenemeSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const d = await denemeBul(tx, y, request.params.id);
        const [yanit] = await denemeYanitlari(tx, [d], y.rol !== 'ogrenci');
        if (!yanit) throw new Error('deneme yanıtı oluşturulamadı');
        return yanit;
      });
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/denemeler/:id',
    {
      ...kendiYaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Deneme duzelt (iyimser kilit: `surum` zorunlu; uyusmazlik 409). `bolumler` verilirse tum bolumler tek islemde degisir ve `toplam_net` SUM(net) ile yenilenir. Ogrenci yalniz kendi onaylanmamis sonucunu duzeltir (red edilmis olan yeniden `bekliyor` olur). Duzeltme olay uretmez.',
        params: denemeParam,
        body: DenemeGuncelleGirdiSema,
        response: { 200: DenemeSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      const ogrenciMi = y.rol === 'ogrenci';
      return cakismayiCevir(() =>
        withTenant(db, kiraci(y), async (tx) => {
          const d = await denemeBul(tx, y, request.params.id, true);
          if (ogrenciMi) await ogrenciDegisikligiDenetle(tx, y, d);
          const ogrenci = (await kapsamdakiOgrenciler(tx, y, [d.ogrenci_id], false)).get(
            d.ogrenci_id,
          );
          if (!ogrenci) throw ogrenciBulunamadi();
          await denemeModuluAcikOlmali(tx, y.kurumId, ogrenci);
          if (g.surum !== d.surum) {
            throw new AppError(
              409,
              denemeHataKodlari.surumCakismasi,
              'Deneme bu arada değişti. Güncel hâlini alıp tekrar deneyin.',
              { guncel_surum: d.surum },
            );
          }
          if (g.bolumler) {
            const [kural] = await tx
              .select()
              .from(denemeKurallari)
              .where(eq(denemeKurallari.id, d.kural_id));
            const mevcut = await tx
              .select()
              .from(denemeBolumleri)
              .where(eq(denemeBolumleri.deneme_id, d.id));
            // Kural sonradan degismis olabilir: girilmis bolumlerin soru sayisi/brans'i korunur.
            const referans = new Map<string, { brans_kodu: string; soru_sayisi: number }>(
              kural ? kuralReferansi(kural) : [],
            );
            for (const b of mevcut) {
              referans.set(b.bolum_kodu, { brans_kodu: b.brans_kodu, soru_sayisi: b.soru_sayisi });
            }
            const h = bolumleriHazirla(referans, g.bolumler);
            if (h.hata) throw new AppError(422, h.hata.kod, h.hata.mesaj);
            await tx.delete(denemeBolumleri).where(eq(denemeBolumleri.deneme_id, d.id));
            await bolumSatirlariniYaz(tx, y, d.yanlis_katsayisi, [
              { denemeId: d.id, bolumler: h.bolumler },
            ]);
          }
          const [yeni] = await tx
            .update(denemeler)
            .set({
              ad: g.ad ?? d.ad,
              yayinevi: g.yayinevi === undefined ? d.yayinevi : g.yayinevi,
              sinav_tarihi: g.sinav_tarihi ?? d.sinav_tarihi,
              sure_dk: g.sure_dk === undefined ? d.sure_dk : g.sure_dk,
              not_metni: g.not === undefined ? d.not_metni : g.not,
              toplam_net: toplamNetSql,
              ...(ogrenciMi
                ? { onay_durumu: 'bekliyor', onaylayan_id: null, onay_at: null, red_nedeni: null }
                : {}),
            })
            .where(eq(denemeler.id, d.id))
            .returning();
          if (!yeni) throw new Error('deneme güncellenemedi');
          await denemeDenetimiYaz(
            tx,
            y,
            request.ip,
            'deneme.guncelle',
            'deneme',
            d.id,
            sonucOzeti(d),
            { ...sonucOzeti(yeni), bolumler_degisti: g.bolumler !== undefined },
          );
          const [yanit] = await denemeYanitlari(tx, [yeni], !ogrenciMi);
          if (!yanit) throw new Error('deneme yanıtı oluşturulamadı');
          return yanit;
        }),
      );
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/denemeler/:id',
    {
      ...kendiYaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Deneme sil (bolumleri ile). `surum` verilirse uyusmazlik 409. Ogrenci yalniz kendi onaylanmamis sonucunu siler. Gelisim ve ortalamalar bu sonucu icermez.',
        params: denemeParam,
        querystring: SilSorguSema,
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const ogrenciMi = y.rol === 'ogrenci';
      await withTenant(db, kiraci(y), async (tx) => {
        const d = await denemeBul(tx, y, request.params.id, true);
        if (ogrenciMi) await ogrenciDegisikligiDenetle(tx, y, d);
        const ogrenci = (await kapsamdakiOgrenciler(tx, y, [d.ogrenci_id], false)).get(
          d.ogrenci_id,
        );
        if (!ogrenci) throw ogrenciBulunamadi();
        await denemeModuluAcikOlmali(tx, y.kurumId, ogrenci);
        const { surum } = request.query;
        if (surum !== undefined && surum !== d.surum) {
          throw new AppError(
            409,
            denemeHataKodlari.surumCakismasi,
            'Deneme bu arada değişti. Güncel hâlini alıp tekrar deneyin.',
            { guncel_surum: d.surum },
          );
        }
        await tx.delete(denemeler).where(eq(denemeler.id, d.id));
        await denemeDenetimiYaz(tx, y, request.ip, 'deneme.sil', 'deneme', d.id, sonucOzeti(d), {
          ogrenci_id: d.ogrenci_id,
        });
      });
      return reply.status(204).send(null);
    },
  );

  // --- Onay --------------------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/denemeler/:id/onay',
    {
      ...grupYaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin girdigi sonucu onayla: bu anda `ogrenme.deneme.girildi.v1` ayni islemde outbox a yazilir. Zaten onayliysa etkisiz (200, olay yok); reddedilmisse 409.',
        params: denemeParam,
        response: { 200: DenemeSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const d = await denemeBul(tx, y, request.params.id, true);
        const ogrenci = (await kapsamdakiOgrenciler(tx, y, [d.ogrenci_id], false)).get(
          d.ogrenci_id,
        );
        if (!ogrenci) throw ogrenciBulunamadi();
        await denemeModuluAcikOlmali(tx, y.kurumId, ogrenci);
        let sonuc = d;
        if (d.onay_durumu === 'reddedildi') {
          throw onayDurumuHatasi(
            'Reddedilmiş deneme onaylanamaz; öğrencinin düzeltmesini bekleyin.',
          );
        }
        if (d.onay_durumu === 'bekliyor') {
          const [yeni] = await tx
            .update(denemeler)
            .set({ onay_durumu: 'onaylandi', onaylayan_id: y.uyelikId, onay_at: new Date() })
            .where(eq(denemeler.id, d.id))
            .returning();
          if (!yeni) throw new Error('deneme onaylanamadı');
          sonuc = yeni;
          await girildiOlayiYaz(tx, baglam, yeni);
          await denemeDenetimiYaz(
            tx,
            y,
            request.ip,
            'deneme.onayla',
            'deneme',
            d.id,
            null,
            sonucOzeti(yeni),
          );
        }
        const [yanit] = await denemeYanitlari(tx, [sonuc], true);
        if (!yanit) throw new Error('deneme yanıtı oluşturulamadı');
        return yanit;
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/denemeler/:id/red',
    {
      ...grupYaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin girdigi sonucu reddet (`red_nedeni` zorunlu). Olay uretilmez; sonuc gelisim ve ortalamalara girmez. Ogrenci duzeltince yeniden `bekliyor` olur. Zaten reddedilmisse etkisiz; onayliysa 409.',
        params: denemeParam,
        body: DenemeRedGirdiSema,
        response: { 200: DenemeSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { red_nedeni } = request.body;
      return withTenant(db, kiraci(y), async (tx) => {
        const d = await denemeBul(tx, y, request.params.id, true);
        const ogrenci = (await kapsamdakiOgrenciler(tx, y, [d.ogrenci_id], false)).get(
          d.ogrenci_id,
        );
        if (!ogrenci) throw ogrenciBulunamadi();
        await denemeModuluAcikOlmali(tx, y.kurumId, ogrenci);
        let sonuc = d;
        if (d.onay_durumu === 'onaylandi') {
          throw onayDurumuHatasi('Onaylanmış deneme reddedilemez.');
        }
        if (d.onay_durumu === 'bekliyor') {
          const [yeni] = await tx
            .update(denemeler)
            .set({
              onay_durumu: 'reddedildi',
              onaylayan_id: y.uyelikId,
              onay_at: new Date(),
              red_nedeni,
            })
            .where(eq(denemeler.id, d.id))
            .returning();
          if (!yeni) throw new Error('deneme reddedilemedi');
          sonuc = yeni;
          await denemeDenetimiYaz(
            tx,
            y,
            request.ip,
            'deneme.reddet',
            'deneme',
            d.id,
            null,
            sonucOzeti(yeni),
          );
        }
        const [yanit] = await denemeYanitlari(tx, [sonuc], true);
        if (!yanit) throw new Error('deneme yanıtı oluşturulamadı');
        return yanit;
      });
    },
  );

  return Promise.resolve();
};
