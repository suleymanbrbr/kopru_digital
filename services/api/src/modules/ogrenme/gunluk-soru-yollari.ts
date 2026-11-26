import {
  GUNLUK_SORU_EN_FAZLA_TOPLAM,
  GunlukSoruGuncelleGirdiSema,
  GunlukSoruKaydiSema,
  GunlukSoruListeSorguSema,
  GunlukSoruListeYanitiSema,
  GunlukSoruOlusturGirdiSema,
  SON_KULLANILAN_EN_FAZLA,
  SonKullanilanlarSema,
  errorCodes,
  gunlukSoruHataKodlari,
  type SonKullanilanlar,
  type Zorluk,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  gunlukSoruDosyalari,
  gunlukSoruKayitlari,
  kaynakKitaplar,
  kaynakKitapTestleri,
  konular,
} from '../../db/schema.js';
import { requirePermission } from '../hesap/index.js';
import {
  baglanacakGorevBul,
  bransVeKonuDogrula,
  duzenlenebilirOlmali,
  fotograflariEsitle,
  gorevGerceklesenDegistir,
  gunuDogrula,
  kayitOlayiYaz,
  kayitYanitlari,
  kaynakTestiDogrula,
  kendiKaydiBul,
} from './gunluk-soru-deposu.js';
import { imlecCoz, imlecYaz, kiraci, kurumParam, olayBaglami, yetkiAl } from './odev-deposu.js';
import { ogrenciOlmali, surumUyumluOlmali } from './plan-deposu.js';
import { planBugunu, tarihEkle } from './plan-zaman.js';

const kayitParam = kurumParam.extend({ id: z.uuid() });

/** `son-kullanilanlar` icin taranan gecmis (gun) ve satir ust siniri. */
const SON_KULLANILAN_GUN = 60;
const SON_KULLANILAN_TARAMA = 300;

/** Ogrencinin gunluk soru kaydi uclari: olustur (idempotent), duzelt, sil, listele, son kullanilanlar. */
export const gunlukSoruYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const yaz = { preHandler: requirePermission('gunluk_soru.yaz', { scope: 'kendi' }) };
  const okuKendi = { preHandler: requirePermission('gunluk_soru.oku', { scope: 'kendi' }) };

  app.post(
    '/kurumlar/:kurum_id/gunluk-soru/kayitlar',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Gunluk soru kaydi olustur (ogrenci). `istek_id` ayni ogrenci icin tekrar gelirse yeni kayit acilmaz, mevcut kayit 200 ile doner (cevrimdisi tekrar guvenli). `gun` verilmezse bugun (Europe/Istanbul); en cok 6 gun geriye, gelecek 422 `gun_gecersiz`. Konu dersin konusu olmali (422 `konu_gecersiz`); kaynak testi ya da serbest metin (ikisi birden olmaz); `plan_gorev_id` verilirse gorevin gerceklesen miktari kaydin toplami kadar artar. Fotograflar `gunluk_soru_fotografi` turunde, hazir ve ogrencinin kendi dosyalaridir (409 `dosya_hazir_degil`, `dosya_zaten_bagli`). Ayni islemde `ogrenme.gunluk_soru.kaydedildi.v1` (XP).',
        params: kurumParam,
        body: GunlukSoruOlusturGirdiSema,
        response: { 200: GunlukSoruKaydiSema, 201: GunlukSoruKaydiSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        if (g.istek_id) {
          const [mevcut] = await tx
            .select()
            .from(gunlukSoruKayitlari)
            .where(
              and(
                eq(gunlukSoruKayitlari.kurum_id, y.kurumId),
                eq(gunlukSoruKayitlari.ogrenci_id, y.uyelikId),
                eq(gunlukSoruKayitlari.istek_id, g.istek_id),
              ),
            );
          if (mevcut) return { yeni: false, kayit: (await kayitYanitlari(tx, [mevcut]))[0] };
        }
        const gun = gunuDogrula(g.gun);
        await bransVeKonuDogrula(tx, g.brans_kodu, g.konu_id);
        if (g.kaynak_test_id) await kaynakTestiDogrula(tx, y, g.kaynak_test_id, g.brans_kodu);
        const gorev = g.plan_gorev_id ? await baglanacakGorevBul(tx, y, g.plan_gorev_id) : null;
        const [kayit] = await tx
          .insert(gunlukSoruKayitlari)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            ogrenci_id: y.uyelikId,
            gun,
            brans_kodu: g.brans_kodu,
            konu_id: g.konu_id,
            zorluk: g.zorluk,
            kaynak_test_id: g.kaynak_test_id ?? null,
            kaynak_metin: g.kaynak_metin ?? null,
            dogru: g.dogru,
            yanlis: g.yanlis,
            bos: g.bos,
            plan_gorev_id: gorev?.id ?? null,
            istek_id: g.istek_id ?? null,
          })
          .onConflictDoNothing()
          .returning();
        if (!kayit) {
          // Es zamanli ayni `istek_id`: kazanan satiri doner.
          const [kazanan] = await tx
            .select()
            .from(gunlukSoruKayitlari)
            .where(
              and(
                eq(gunlukSoruKayitlari.kurum_id, y.kurumId),
                eq(gunlukSoruKayitlari.ogrenci_id, y.uyelikId),
                eq(gunlukSoruKayitlari.istek_id, g.istek_id ?? ''),
              ),
            );
          if (!kazanan) throw new Error('günlük soru kaydı yazılamadı');
          return { yeni: false, kayit: (await kayitYanitlari(tx, [kazanan]))[0] };
        }
        await fotograflariEsitle(tx, y, baglam, kayit.id, [], g.dosya_idleri);
        if (gorev) await gorevGerceklesenDegistir(tx, y, baglam, gorev.id, kayit.toplam);
        await kayitOlayiYaz(tx, baglam, kayit, kayit.surum, 0, false);
        return { yeni: true, kayit: (await kayitYanitlari(tx, [kayit]))[0] };
      });
      if (!sonuc.kayit) throw new Error('kayıt yanıtı oluşturulamadı');
      return reply.status(sonuc.yeni ? 201 : 200).send(sonuc.kayit);
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/gunluk-soru/kayitlar/:id',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kaydi duzelt (yalniz ogrencinin kendi kaydi ve yalniz girildigi gun icinde; sonra 409 `kayit_duzenlenemez`). Verilen alanlar degisir; `dosya_idleri` verilirse fotograf kumesi o liste olur. Iyimser kilit: `surum`. XP olayi ayni islemde yayimlanir (eski XP ters cevrilir, yeni deger yeniden hesaplanir).',
        params: kayitParam,
        body: GunlukSoruGuncelleGirdiSema,
        response: { 200: GunlukSoruKaydiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const eski = await kendiKaydiBul(tx, y, request.params.id, true);
        duzenlenebilirOlmali(eski);
        surumUyumluOlmali(eski.surum, g.surum);
        const brans = g.brans_kodu ?? eski.brans_kodu;
        const konuId = g.konu_id ?? eski.konu_id;
        if (g.brans_kodu !== undefined || g.konu_id !== undefined) {
          await bransVeKonuDogrula(tx, brans, konuId);
        }
        const testId = g.kaynak_test_id === undefined ? eski.kaynak_test_id : g.kaynak_test_id;
        const metin = g.kaynak_metin === undefined ? eski.kaynak_metin : g.kaynak_metin;
        // Testi ya da metni degistiren istek digerini temizler; ikisi birden verilirse 422.
        let yeniTest = testId;
        let yeniMetin = metin;
        if (g.kaynak_test_id && g.kaynak_metin === undefined) yeniMetin = null;
        if (g.kaynak_metin && g.kaynak_test_id === undefined) yeniTest = null;
        if (yeniTest && yeniMetin) {
          throw new AppError(
            422,
            errorCodes.validation,
            'Kaynak testi ve serbest kaynak metni birlikte verilemez.',
          );
        }
        if (yeniTest && (g.kaynak_test_id !== undefined || g.brans_kodu !== undefined)) {
          await kaynakTestiDogrula(tx, y, yeniTest, brans);
        }
        const dogru = g.dogru ?? eski.dogru;
        const yanlis = g.yanlis ?? eski.yanlis;
        const bosSayi = g.bos ?? eski.bos;
        const toplam = dogru + yanlis + bosSayi;
        if (toplam < 1 || toplam > GUNLUK_SORU_EN_FAZLA_TOPLAM) {
          throw new AppError(
            422,
            gunlukSoruHataKodlari.toplamGecersiz,
            `Toplam soru 1 ile ${String(GUNLUK_SORU_EN_FAZLA_TOPLAM)} arasında olmalı.`,
          );
        }
        const yeniGorevId = g.plan_gorev_id === undefined ? eski.plan_gorev_id : g.plan_gorev_id;
        if (yeniGorevId && yeniGorevId !== eski.plan_gorev_id) {
          await baglanacakGorevBul(tx, y, yeniGorevId);
        }
        const [yeni] = await tx
          .update(gunlukSoruKayitlari)
          .set({
            brans_kodu: brans,
            konu_id: konuId,
            zorluk: g.zorluk ?? eski.zorluk,
            kaynak_test_id: yeniTest,
            kaynak_metin: yeniMetin,
            dogru,
            yanlis,
            bos: bosSayi,
            plan_gorev_id: yeniGorevId,
          })
          .where(eq(gunlukSoruKayitlari.id, eski.id))
          .returning();
        if (!yeni) throw new Error('günlük soru kaydı güncellenemedi');
        if (g.dosya_idleri !== undefined) {
          const mevcut = await tx
            .select()
            .from(gunlukSoruDosyalari)
            .where(eq(gunlukSoruDosyalari.kayit_id, eski.id))
            .orderBy(gunlukSoruDosyalari.sira);
          await fotograflariEsitle(tx, y, baglam, eski.id, mevcut, g.dosya_idleri);
        }
        // Plan gorevi: eski baglantidan eski toplam dusulur, yeniye yeni toplam eklenir.
        if (eski.plan_gorev_id === yeniGorevId) {
          if (yeniGorevId) {
            await gorevGerceklesenDegistir(tx, y, baglam, yeniGorevId, toplam - eski.toplam);
          }
        } else {
          if (eski.plan_gorev_id) {
            await gorevGerceklesenDegistir(tx, y, baglam, eski.plan_gorev_id, -eski.toplam);
          }
          if (yeniGorevId) await gorevGerceklesenDegistir(tx, y, baglam, yeniGorevId, toplam);
        }
        await kayitOlayiYaz(tx, baglam, yeni, yeni.surum, eski.toplam, false);
        return (await kayitYanitlari(tx, [yeni]))[0];
      });
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/gunluk-soru/kayitlar/:id',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kaydi sil (yalniz ogrencinin kendi kaydi ve yalniz girildigi gun icinde; sonra 409 `kayit_duzenlenemez`). Fotograflar birakilir (medyada silinir), bagli plan gorevinin gerceklesen miktari azalir, XP ters kayit olarak geri alinir (`silindi=true` olayi).',
        params: kayitParam,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const baglam = olayBaglami(y, request.correlationId);
      await withTenant(db, kiraci(y), async (tx) => {
        const k = await kendiKaydiBul(tx, y, request.params.id, true);
        duzenlenebilirOlmali(k);
        const mevcut = await tx
          .select()
          .from(gunlukSoruDosyalari)
          .where(eq(gunlukSoruDosyalari.kayit_id, k.id));
        await fotograflariEsitle(tx, y, baglam, k.id, mevcut, []);
        await tx.delete(gunlukSoruKayitlari).where(eq(gunlukSoruKayitlari.id, k.id));
        if (k.plan_gorev_id) {
          await gorevGerceklesenDegistir(tx, y, baglam, k.plan_gorev_id, -k.toplam);
        }
        await kayitOlayiYaz(tx, baglam, k, k.surum + 1, k.toplam, true);
      });
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/kurumlar/:kurum_id/gunluk-soru/kayitlar',
    {
      ...okuKendi,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin kendi kayitlari, en yeni once. `gun` (tek gun) ya da `bas`/`bit` (varsayilan son 30 gun), `brans_kodu`; imlec sayfalama (`sonraki_imlec`).',
        params: kurumParam,
        querystring: GunlukSoruListeSorguSema,
        response: { 200: GunlukSoruListeYanitiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const q = request.query;
      const bit = q.gun ?? q.bit ?? planBugunu();
      const bas = q.gun ?? q.bas ?? tarihEkle(bit, -29);
      const imlec = imlecCoz(q.imlec);
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select()
          .from(gunlukSoruKayitlari)
          .where(
            and(
              eq(gunlukSoruKayitlari.kurum_id, y.kurumId),
              eq(gunlukSoruKayitlari.ogrenci_id, y.uyelikId),
              gte(gunlukSoruKayitlari.gun, bas),
              lt(gunlukSoruKayitlari.gun, tarihEkle(bit, 1)),
              q.brans_kodu ? eq(gunlukSoruKayitlari.brans_kodu, q.brans_kodu) : undefined,
              imlec ? lt(gunlukSoruKayitlari.id, imlec) : undefined,
            ),
          )
          // UUIDv7 zaman sirali: `id` azalan = olusturma sirasi azalan.
          .orderBy(desc(gunlukSoruKayitlari.id))
          .limit(q.limit + 1);
        const sayfa = satirlar.slice(0, q.limit);
        const son = sayfa[sayfa.length - 1];
        return {
          kayitlar: await kayitYanitlari(tx, sayfa),
          sonraki_imlec: satirlar.length > q.limit && son ? imlecYaz(son.id) : null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/gunluk-soru/son-kullanilanlar',
    {
      ...okuKendi,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin son kullandigi ders, konu ve kaynaklar (15 sn kalite citasi: kayit formu once bunlari sunar). Son 60 gun; en yeni kullanilan ders once; her ders icin en cok 5 konu ve 5 kaynak.',
        params: kurumParam,
        response: { 200: SonKullanilanlarSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select()
          .from(gunlukSoruKayitlari)
          .where(
            and(
              eq(gunlukSoruKayitlari.kurum_id, y.kurumId),
              eq(gunlukSoruKayitlari.ogrenci_id, y.uyelikId),
              gte(gunlukSoruKayitlari.gun, tarihEkle(planBugunu(), -SON_KULLANILAN_GUN)),
            ),
          )
          .orderBy(desc(gunlukSoruKayitlari.id))
          .limit(SON_KULLANILAN_TARAMA);
        if (satirlar.length === 0) return { dersler: [] };
        const konuAd = new Map(
          (
            await tx
              .select({ id: konular.id, ad: konular.ad })
              .from(konular)
              .where(inArray(konular.id, [...new Set(satirlar.map((s) => s.konu_id))]))
          ).map((k) => [k.id, k.ad]),
        );
        const testIdleri = [
          ...new Set(satirlar.map((s) => s.kaynak_test_id).filter((x): x is string => x !== null)),
        ];
        const testler = new Map(
          testIdleri.length === 0
            ? []
            : (
                await tx
                  .select({
                    id: kaynakKitapTestleri.id,
                    test_ad: kaynakKitapTestleri.ad,
                    kitap_id: kaynakKitaplar.id,
                    kitap_ad: kaynakKitaplar.ad,
                  })
                  .from(kaynakKitapTestleri)
                  .innerJoin(kaynakKitaplar, eq(kaynakKitaplar.id, kaynakKitapTestleri.kitap_id))
                  .where(inArray(kaynakKitapTestleri.id, testIdleri))
              ).map((t) => [t.id, t]),
        );
        const dersler = new Map<string, SonKullanilanlar['dersler'][number]>();
        const gorulenKonu = new Set<string>();
        const gorulenKaynak = new Set<string>();
        for (const s of satirlar) {
          let d = dersler.get(s.brans_kodu);
          if (!d) {
            d = {
              brans_kodu: s.brans_kodu,
              son_kullanildi_at: s.created_at.toISOString(),
              konular: [],
              kaynaklar: [],
            };
            dersler.set(s.brans_kodu, d);
          }
          const konuAnahtar = `${s.brans_kodu}:${s.konu_id}`;
          if (!gorulenKonu.has(konuAnahtar) && d.konular.length < SON_KULLANILAN_EN_FAZLA) {
            gorulenKonu.add(konuAnahtar);
            d.konular.push({
              konu_id: s.konu_id,
              konu_ad: konuAd.get(s.konu_id) ?? null,
              son_zorluk: s.zorluk as Zorluk,
            });
          }
          const kaynakAnahtar = `${s.brans_kodu}:${s.kaynak_test_id ?? ''}:${s.kaynak_metin ?? ''}`;
          const kaynakVar = s.kaynak_test_id !== null || s.kaynak_metin !== null;
          if (
            kaynakVar &&
            !gorulenKaynak.has(kaynakAnahtar) &&
            d.kaynaklar.length < SON_KULLANILAN_EN_FAZLA
          ) {
            gorulenKaynak.add(kaynakAnahtar);
            const t = s.kaynak_test_id ? testler.get(s.kaynak_test_id) : undefined;
            d.kaynaklar.push({
              kaynak_test_id: s.kaynak_test_id,
              kaynak_kitap_id: t?.kitap_id ?? null,
              kitap_ad: t?.kitap_ad ?? null,
              test_ad: t?.test_ad ?? null,
              kaynak_metin: s.kaynak_metin,
            });
          }
        }
        return { dersler: [...dersler.values()] };
      });
    },
  );

  return Promise.resolve();
};
