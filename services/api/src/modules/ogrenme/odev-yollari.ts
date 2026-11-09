import {
  AtamaEsitleYanitSema,
  OdevGuncelleGirdiSema,
  OdevListeSorguSema,
  OdevListeYanitSema,
  OdevOlusturGirdiSema,
  OdevOzetSema,
  OdevSema,
  errorCodes,
  odevHataKodlari,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { odevler, ogrenciOdevleri } from '../../db/schema.js';
import { gorunenAdlar, requirePermission } from '../hesap/index.js';
import {
  atananSayisi,
  bransGecerliOlmali,
  dogruOrani,
  hedefOgrencileri,
  hedefiDogrula,
  imlecCoz,
  imlecYaz,
  kiraci,
  kurumParam,
  odevBul,
  odevDenetimiYaz,
  odevKapsami,
  odevParam,
  odevYaniti,
  ogrenciSatirlariniAc,
  olayBaglami,
  yayinlandiOlayiYaz,
  yazilacakOdevBul,
  yetkiAl,
} from './odev-deposu.js';

/** Ogretmen/yonetici odev uclari (`/v1/ogrenme/kurumlar/:kurum_id/odevler...`). */
export const odevYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const oku = { preHandler: requirePermission('odev.oku', { scope: 'grup' }) };
  const ver = { preHandler: requirePermission('odev.ver', { scope: 'grup' }) };

  app.post(
    '/kurumlar/:kurum_id/odevler',
    {
      ...ver,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Odev olustur (taslak). Ogretmen yalniz atandigi grup/ogrenciye verir; kademe ve kurum hedefi sahip/yonetici.',
        params: kurumParam,
        body: OdevOlusturGirdiSema,
        response: { 201: OdevSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        const hedefId = await hedefiDogrula(tx, y, g.hedef_turu, g.hedef_id);
        await bransGecerliOlmali(tx, g.brans_kodu);
        const [o] = await tx
          .insert(odevler)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            baslik: g.baslik,
            aciklama: g.aciklama ?? null,
            brans_kodu: g.brans_kodu,
            konu_id: g.konu_id ?? null,
            tur: g.tur,
            kaynak: g.kaynak ?? null,
            hedef_turu: g.hedef_turu,
            hedef_id: hedefId,
            veren_id: y.uyelikId,
            son_teslim_at: g.son_teslim_at ? new Date(g.son_teslim_at) : null,
            hedef_soru_sayisi: g.hedef_soru_sayisi ?? null,
            fotograf_gerekli: g.fotograf_gerekli,
          })
          .returning();
        if (!o) throw new Error('ödev oluşturulamadı');
        await odevDenetimiYaz(tx, y, request.ip, 'odev.olustur', 'odev', o.id, null, {
          hedef_turu: o.hedef_turu,
          hedef_id: o.hedef_id,
          brans_kodu: o.brans_kodu,
          tur: o.tur,
        });
        return odevYaniti(o);
      });
      return reply.status(201).send(sonuc);
    },
  );

  app.get(
    '/kurumlar/:kurum_id/odevler',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Odev listesi (sayfali, yeniden eskiye). Ogretmen yalniz kendi odevlerini, yonetici kapsamindaki hepsini gorur.',
        params: kurumParam,
        querystring: OdevListeSorguSema,
        response: { 200: OdevListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { durum, brans_kodu, limit, imlec } = request.query;
      const sonImlec = imlecCoz(imlec);
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select()
          .from(odevler)
          .where(
            and(
              eq(odevler.kurum_id, y.kurumId),
              odevKapsami(tx, y),
              y.rol === 'ogretmen' ? eq(odevler.veren_id, y.uyelikId) : undefined,
              durum ? eq(odevler.durum, durum) : undefined,
              brans_kodu ? eq(odevler.brans_kodu, brans_kodu) : undefined,
              sonImlec ? lt(odevler.id, sonImlec) : undefined,
            ),
          )
          .orderBy(desc(odevler.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        const son = sayfa.at(-1);
        return {
          odevler: sayfa.map(odevYaniti),
          sonraki_imlec: satirlar.length > limit && son ? imlecYaz(son.id) : null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/odevler/:id',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary: 'Odev detayi (kapsam disi 404).',
        params: odevParam,
        response: { 200: OdevSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) =>
        odevYaniti(await odevBul(tx, y, request.params.id)),
      );
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/odevler/:id',
    {
      ...ver,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Taslak odevi guncelle (yayindaki odev degistirilemez: 409). Iyimser kilit: `surum`.',
        params: odevParam,
        body: OdevGuncelleGirdiSema,
        response: { 200: OdevSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      return withTenant(db, kiraci(y), async (tx) => {
        const o = await yazilacakOdevBul(tx, y, request.params.id);
        if (o.durum !== 'taslak') {
          throw new AppError(
            409,
            odevHataKodlari.odevTaslakDegil,
            'Yalnızca taslak ödev güncellenir.',
          );
        }
        if (g.surum !== undefined && g.surum !== o.surum) {
          throw new AppError(
            409,
            odevHataKodlari.surumCakismasi,
            'Ödev bu arada değişti. Güncel hâlini alıp tekrar deneyin.',
            { guncel_surum: o.surum },
          );
        }
        const hedefTuru = g.hedef_turu ?? o.hedef_turu;
        const hedefDegisti = g.hedef_turu !== undefined || g.hedef_id !== undefined;
        const hedefId = hedefDegisti
          ? await hedefiDogrula(
              tx,
              y,
              hedefTuru,
              g.hedef_id ?? (g.hedef_turu === undefined ? o.hedef_id : undefined),
            )
          : o.hedef_id;
        if (g.brans_kodu !== undefined) await bransGecerliOlmali(tx, g.brans_kodu);
        const [yeni] = await tx
          .update(odevler)
          .set({
            baslik: g.baslik ?? o.baslik,
            aciklama: g.aciklama === undefined ? o.aciklama : g.aciklama,
            brans_kodu: g.brans_kodu ?? o.brans_kodu,
            konu_id: g.konu_id === undefined ? o.konu_id : g.konu_id,
            tur: g.tur ?? o.tur,
            kaynak: g.kaynak === undefined ? o.kaynak : g.kaynak,
            hedef_turu: hedefTuru,
            hedef_id: hedefId,
            son_teslim_at:
              g.son_teslim_at === undefined
                ? o.son_teslim_at
                : g.son_teslim_at === null
                  ? null
                  : new Date(g.son_teslim_at),
            hedef_soru_sayisi:
              g.hedef_soru_sayisi === undefined ? o.hedef_soru_sayisi : g.hedef_soru_sayisi,
            fotograf_gerekli: g.fotograf_gerekli ?? o.fotograf_gerekli,
          })
          .where(eq(odevler.id, o.id))
          .returning();
        if (!yeni) throw new Error('ödev güncellenemedi');
        await odevDenetimiYaz(tx, y, request.ip, 'odev.guncelle', 'odev', o.id, null, {
          alanlar: Object.keys(g).filter((k) => k !== 'surum'),
        });
        return odevYaniti(yeni);
      });
    },
  );

  // --- Yayin / kapatma --------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/odevler/:id/yayinla',
    {
      ...ver,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Taslagi yayinla: hedefteki etkin ogrencilere ayni islemde 500 luk parcalarla satir acilir, `ogrenme.odev.yayinlandi.v1` 200 luk parcalarla yayimlanir. Yayindaki odevde tekrar cagri etkisizdir (200); kapali odevde 409.',
        params: odevParam,
        response: { 200: OdevSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const o = await yazilacakOdevBul(tx, y, request.params.id);
        if (o.durum === 'yayinda') return odevYaniti(o);
        if (o.durum === 'kapali') {
          throw new AppError(409, odevHataKodlari.odevKapali, 'Ödev kapatılmış.');
        }
        if (o.son_teslim_at !== null && o.son_teslim_at.getTime() <= Date.now()) {
          throw new AppError(422, errorCodes.validation, 'Son teslim tarihi geçmişte olamaz.');
        }
        // Hedef yayin aninda yeniden dogrulanir (grup arsivlenmis, ogretmen atamasi bitmis olabilir).
        await hedefiDogrula(tx, y, o.hedef_turu, o.hedef_id);
        const ogrenciler = await hedefOgrencileri(tx, y.kurumId, o.hedef_turu, o.hedef_id);
        const yayinAt = new Date();
        const [yayinda] = await tx
          .update(odevler)
          .set({ durum: 'yayinda', yayin_at: yayinAt, fan_out_durum: 'calisiyor' })
          .where(eq(odevler.id, o.id))
          .returning();
        if (!yayinda) throw new Error('ödev yayınlanamadı');
        const eklenen = await ogrenciSatirlariniAc(tx, y, yayinda, ogrenciler);
        const sayi = await atananSayisi(tx, o.id);
        const [son] = await tx
          .update(odevler)
          .set({ fan_out_durum: 'tamamlandi', atanan_sayisi: sayi })
          .where(eq(odevler.id, o.id))
          .returning();
        if (!son) throw new Error('ödev yayınlanamadı');
        const parcaSayisi = await yayinlandiOlayiYaz(tx, baglam, son, eklenen);
        await odevDenetimiYaz(tx, y, request.ip, 'odev.yayinla', 'odev', o.id, null, {
          hedef_turu: o.hedef_turu,
          hedef_id: o.hedef_id,
          atanan_sayisi: sayi,
          olay_parca_sayisi: parcaSayisi,
        });
        return odevYaniti(son);
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/odevler/:id/kapat',
    {
      ...ver,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Yayindaki odevi kapat (yeni teslim alinmaz; mevcut teslim/inceleme korunur). Kapali odevde tekrar cagri etkisizdir; taslakta 409.',
        params: odevParam,
        response: { 200: OdevSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const o = await yazilacakOdevBul(tx, y, request.params.id);
        if (o.durum === 'kapali') return odevYaniti(o);
        if (o.durum !== 'yayinda') {
          throw new AppError(
            409,
            odevHataKodlari.odevYayindaDegil,
            'Yalnızca yayındaki ödev kapatılır.',
          );
        }
        const [k] = await tx
          .update(odevler)
          .set({ durum: 'kapali' })
          .where(eq(odevler.id, o.id))
          .returning();
        if (!k) throw new Error('ödev kapatılamadı');
        await odevDenetimiYaz(tx, y, request.ip, 'odev.kapat', 'odev', o.id, null, {
          durum: 'kapali',
        });
        return odevYaniti(k);
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/odevler/:id/atama-esitle',
    {
      ...ver,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Yayindaki odevin hedefini yeniden cozer: sonradan katilan ogrenciye satir acar, ayrilip donen ogrencinin iptal satirini yeniden acar. Idempotent: ikinci cagri yeni satir yaratmaz.',
        params: odevParam,
        response: { 200: AtamaEsitleYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const o = await yazilacakOdevBul(tx, y, request.params.id);
        if (o.durum !== 'yayinda') {
          throw new AppError(
            409,
            odevHataKodlari.odevYayindaDegil,
            'Yalnızca yayındaki ödev eşitlenir.',
          );
        }
        const ogrenciler = await hedefOgrencileri(tx, y.kurumId, o.hedef_turu, o.hedef_id);
        const eklenen = await ogrenciSatirlariniAc(tx, y, o, ogrenciler);
        const acilan =
          ogrenciler.length === 0
            ? []
            : await tx
                .update(ogrenciOdevleri)
                .set({ durum: 'atandi' })
                .where(
                  and(
                    eq(ogrenciOdevleri.odev_id, o.id),
                    eq(ogrenciOdevleri.durum, 'iptal'),
                    sql`${ogrenciOdevleri.teslim_at} is null`,
                    inArray(ogrenciOdevleri.ogrenci_id, ogrenciler),
                  ),
                )
                .returning({ ogrenci_id: ogrenciOdevleri.ogrenci_id });
        const sayi = await atananSayisi(tx, o.id);
        const yeniOgrenciler = [...eklenen, ...acilan.map((a) => a.ogrenci_id)];
        if (sayi !== o.atanan_sayisi) {
          await tx.update(odevler).set({ atanan_sayisi: sayi }).where(eq(odevler.id, o.id));
        }
        await yayinlandiOlayiYaz(tx, baglam, o, yeniOgrenciler);
        await odevDenetimiYaz(tx, y, request.ip, 'odev.atama_esitle', 'odev', o.id, null, {
          eklenen: eklenen.length,
          yeniden_acilan: acilan.length,
          atanan_sayisi: sayi,
        });
        return { eklenen: eklenen.length, yeniden_acilan: acilan.length, atanan_sayisi: sayi };
      });
    },
  );

  // --- Ozet --------------------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/odevler/:id/ozet',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Odev ozeti: tek sorguyla butun ogrenci satirlari (ad, durum, dogru orani, gec teslim) ve sayilar. 30 kisilik sinif tek ekran.',
        params: odevParam,
        response: { 200: OdevOzetSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const o = await odevBul(tx, y, request.params.id);
        const satirlar = await tx
          .select()
          .from(ogrenciOdevleri)
          .where(and(eq(ogrenciOdevleri.odev_id, o.id), eq(ogrenciOdevleri.kurum_id, y.kurumId)));
        const adlar = await gorunenAdlar(
          tx,
          satirlar.map((s) => s.ogrenci_id),
        );
        const ogrenciler = satirlar
          .map((s) => ({
            ogrenci_odev_id: s.id,
            ogrenci_id: s.ogrenci_id,
            gorunen_ad: adlar.get(s.ogrenci_id) ?? null,
            durum: s.durum as 'atandi',
            teslim_edildi: s.teslim_at !== null,
            gec_teslim: s.gec_teslim,
            son_teslim_at: s.son_teslim_at?.toISOString() ?? null,
            teslim_at: s.teslim_at?.toISOString() ?? null,
            yapilan_soru_sayisi: s.yapilan_soru_sayisi,
            dogru_sayisi: s.dogru_sayisi,
            yanlis_sayisi: s.yanlis_sayisi,
            bos_sayisi: s.bos_sayisi,
            dogru_orani: dogruOrani(s.dogru_sayisi, s.yapilan_soru_sayisi),
            ogrenci_notu: s.ogrenci_notu,
            inceleme_sonucu: s.inceleme_sonucu as 'tamam' | null,
            inceleme_notu: s.inceleme_notu,
          }))
          .sort(
            (a, b) =>
              (a.gorunen_ad ?? '￿').localeCompare(b.gorunen_ad ?? '￿', 'tr') ||
              a.ogrenci_id.localeCompare(b.ogrenci_id),
          );
        const sayi = (d: string) => satirlar.filter((s) => s.durum === d).length;
        const oranlar = ogrenciler.flatMap((r) => (r.dogru_orani === null ? [] : [r.dogru_orani]));
        return {
          odev: odevYaniti(o),
          sayilar: {
            atanan: satirlar.filter((s) => s.durum !== 'iptal').length,
            atandi: sayi('atandi'),
            teslim_edildi: sayi('teslim_edildi'),
            incelendi: sayi('incelendi'),
            tekrar_istendi: sayi('tekrar_istendi'),
            iptal: sayi('iptal'),
            gec_teslim: satirlar.filter((s) => s.gec_teslim && s.durum !== 'iptal').length,
            ortalama_dogru_orani:
              oranlar.length === 0
                ? null
                : Math.round((oranlar.reduce((t, r) => t + r, 0) / oranlar.length) * 1000) / 1000,
          },
          ogrenciler,
        };
      });
    },
  );

  return Promise.resolve();
};
