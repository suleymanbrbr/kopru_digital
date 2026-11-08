import {
  DersGuncelleGirdiSema,
  DersIptalGirdiSema,
  DersIslemYanitSema,
  DersKatilimciEkleGirdiSema,
  DersTasiGirdiSema,
  dersHataKodlari,
  errorCodes,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import { dersKatilimcilari, dersSerileri, dersler, gruplar, uyelikler } from '../../db/schema.js';
import { requirePermission } from '../hesap/index.js';
import {
  dersDenetimiYaz,
  dersDetayi,
  dersOlayiYaz,
  katilimciHaritasi,
  katilimciIdleri,
  ogrenciUyarilari,
  ogretmenCakismalari,
  type DersSatiri,
} from './ders-deposu.js';
import {
  cakismaHatasi,
  cakismaKorumali,
  dersParam,
  etkilenenDersler,
  kiraci,
  kurumSaatDilimi,
  olayBaglami,
  planliOlmali,
  seriBul,
  surumKontrol,
  yazilacakDersBul,
  yetkiAl,
  type CakismaNiyeti,
} from './ders-ortak.js';
import { gecIptalMi } from './kurallar.js';
import { tarihEkle, utcdenYerel, yerelDenUtc } from './zaman.js';

const katilimciParam = dersParam.extend({ ogrenci_id: z.uuid() });

/** Ders degistiren uc noktalar: bilgi guncelleme, erteleme, iptal, katilimci ekleme/cikarma. */
export const dersDegisiklikYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const yaz = { preHandler: requirePermission('takvim.yaz', { scope: 'grup' }) };

  // --- Bilgi guncelleme -------------------------------------------------------------------

  app.patch(
    '/kurumlar/:kurum_id/dersler/:id',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary:
          'Ders bilgisi guncelle (baslik, konu, online baglanti, yer). `surum` zorunlu (eskiyse 409). `yalniz_bu` seri dersini seriden ayirir (seri_istisna); `bu_ve_sonrakiler` yalniz seri_istisna=false gelecek dersleri ve seri kuralini gunceller.',
        params: dersParam,
        body: DersGuncelleGirdiSema,
        response: { 200: DersIslemYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const hedef = await yazilacakDersBul(tx, y, request.params.id);
        planliOlmali(hedef);
        surumKontrol(hedef, g.surum);
        const kume = await etkilenenDersler(tx, hedef, g.kapsam);
        const alanlar = {
          baslik: g.baslik,
          konu_id: g.konu_id,
          online_baglanti: g.online_baglanti,
          yer: g.yer,
        };
        const seridenAyir = g.kapsam === 'yalniz_bu' && hedef.seri_id !== null;
        const guncel = await tx
          .update(dersler)
          .set({ ...alanlar, ...(seridenAyir ? { seri_istisna: true } : {}) })
          .where(
            inArray(
              dersler.id,
              kume.map((d) => d.id),
            ),
          )
          .returning();
        // Seri kurali da guncellenir: sonradan uretilecek dersler yeni bilgiyle olusur. `konu_id` seride
        // yoktur; yalniz konu degistiyse seriye yazilacak alan kalmaz.
        const seriAlanlari = {
          baslik: g.baslik,
          online_baglanti: g.online_baglanti,
          yer: g.yer,
        };
        if (
          g.kapsam === 'bu_ve_sonrakiler' &&
          hedef.seri_id !== null &&
          Object.values(seriAlanlari).some((v) => v !== undefined)
        ) {
          await tx.update(dersSerileri).set(seriAlanlari).where(eq(dersSerileri.id, hedef.seri_id));
        }
        const katilimcilar = await katilimciHaritasi(
          tx,
          guncel.map((d) => d.id),
        );
        for (const d of guncel) {
          await dersOlayiYaz(tx, baglam, 'guncellendi', d, katilimcilar.get(d.id) ?? []);
        }
        await dersDenetimiYaz(
          tx,
          y,
          request.ip,
          'ders.guncelle',
          'ders',
          hedef.id,
          { surum: hedef.surum },
          {
            kapsam: g.kapsam,
            etkilenen_sayisi: guncel.length,
            alanlar: Object.entries(alanlar)
              .filter(([, v]) => v !== undefined)
              .map(([k]) => k),
          },
        );
        const sonHedef = guncel.find((d) => d.id === hedef.id) ?? hedef;
        return {
          ders: await dersDetayi(tx, y, sonHedef),
          etkilenen_ders_idleri: guncel.map((d) => d.id),
          uyari: [],
        };
      });
    },
  );

  // --- Erteleme (tasima) ------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/dersler/:id/tasi',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary:
          'Dersi yeni gun/saate tasi (erteleme). `yalniz_bu` dersi seriden ayirir; `bu_ve_sonrakiler` yalniz saati degistirir (gun degisikligi 422), seri kurali da guncellenir ve istisna dersler korunur.',
        params: dersParam,
        body: DersTasiGirdiSema,
        response: { 200: DersIslemYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      const niyet: { current: CakismaNiyeti | null } = { current: null };
      return cakismaKorumali(db, y, niyet, () =>
        withTenant(db, kiraci(y), async (tx) => {
          const hedef = await yazilacakDersBul(tx, y, request.params.id);
          planliOlmali(hedef);
          surumKontrol(hedef, g.surum);
          const seri = await seriBul(tx, hedef.seri_id, true);
          const saatDilimi = seri?.saat_dilimi ?? (await kurumSaatDilimi(tx, y.kurumId));
          const mevcut = utcdenYerel(hedef.baslangic_at, saatDilimi);
          if (
            g.kapsam === 'bu_ve_sonrakiler' &&
            g.yeni_tarih !== undefined &&
            g.yeni_tarih !== mevcut.tarih
          ) {
            throw new AppError(
              422,
              dersHataKodlari.tarihDegisikligiYalnizBu,
              'Bu ve sonraki derslerde yalnızca saat değiştirilebilir. Günü değiştirmek için yalnızca bu dersi taşıyın.',
            );
          }
          const kume = await etkilenenDersler(tx, hedef, g.kapsam);
          const yeniSaat = g.yeni_saat ?? mevcut.saat;
          const planlar = kume
            .map((d) => {
              const yerel = utcdenYerel(d.baslangic_at, saatDilimi);
              const tarih = d.id === hedef.id ? (g.yeni_tarih ?? yerel.tarih) : yerel.tarih;
              const baslangic = yerelDenUtc(tarih, yeniSaat, saatDilimi);
              const sure = d.bitis_at.getTime() - d.baslangic_at.getTime();
              return { d, baslangic, bitis: new Date(baslangic.getTime() + sure) };
            })
            .filter((p) => p.baslangic.getTime() !== p.d.baslangic_at.getTime());
          if (planlar.length === 0) {
            throw new AppError(422, dersHataKodlari.degisiklikYok, 'Ders zaten bu zamanda.');
          }

          const haric = planlar.map((p) => p.d.id);
          niyet.current = { ogretmenId: hedef.ogretmen_id, araliklar: planlar, haric };
          const { cakismalar, hepsi } = await ogretmenCakismalari(
            tx,
            y.kurumId,
            hedef.ogretmen_id,
            planlar,
            haric,
          );
          if (hepsi.length > 0 && !g.cakisma_onayli) throw cakismaHatasi(hepsi);

          const seridenAyir = g.kapsam === 'yalniz_bu' && hedef.seri_id !== null;
          const guncel: DersSatiri[] = [];
          for (const [i, p] of planlar.entries()) {
            const [satir] = await tx
              .update(dersler)
              .set({
                baslangic_at: p.baslangic,
                bitis_at: p.bitis,
                ertelendi_sayisi: sql`${dersler.ertelendi_sayisi} + 1`,
                cakisma_onayli: (cakismalar[i]?.length ?? 0) > 0,
                ...(seridenAyir ? { seri_istisna: true } : {}),
              })
              .where(eq(dersler.id, p.d.id))
              .returning();
            if (!satir) throw new Error('ders taşınamadı');
            guncel.push(satir);
          }
          if (g.kapsam === 'bu_ve_sonrakiler' && seri) {
            await tx
              .update(dersSerileri)
              .set({ baslangic_saati: yeniSaat })
              .where(eq(dersSerileri.id, seri.id));
          }
          const katilimcilar = await katilimciHaritasi(tx, haric);
          const hepsiOgrenci = new Set<string>();
          for (const [i, d] of guncel.entries()) {
            const idler = katilimcilar.get(d.id) ?? [];
            idler.forEach((id) => hepsiOgrenci.add(id));
            await dersOlayiYaz(
              tx,
              baglam,
              'ertelendi',
              d,
              idler,
              planlar[i]?.d.baslangic_at ?? null,
            );
          }
          await dersDenetimiYaz(
            tx,
            y,
            request.ip,
            'ders.tasi',
            'ders',
            hedef.id,
            { surum: hedef.surum, baslangic_at: hedef.baslangic_at.toISOString() },
            {
              kapsam: g.kapsam,
              etkilenen_sayisi: guncel.length,
              cakisma_onayli: g.cakisma_onayli && hepsi.length > 0,
            },
          );
          const uyari = await ogrenciUyarilari(
            tx,
            y.kurumId,
            [...hepsiOgrenci],
            guncel.map((d) => ({ id: d.id, baslangic: d.baslangic_at, bitis: d.bitis_at })),
          );
          const sonHedef = guncel.find((d) => d.id === hedef.id) ?? hedef;
          return {
            ders: await dersDetayi(tx, y, sonHedef),
            etkilenen_ders_idleri: guncel.map((d) => d.id),
            uyari,
          };
        }),
      );
    },
  );

  // --- Iptal ------------------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/dersler/:id/iptal',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary:
          'Dersi iptal et. `iptal_kaynagi=ogrenci` yalniz birebir grupta (degilse 422); `gec_iptal` sunucuda hesaplanir. `bu_ve_sonrakiler` seriyi bu dersten itibaren sonlandirir.',
        params: dersParam,
        body: DersIptalGirdiSema,
        response: { 200: DersIslemYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const hedef = await yazilacakDersBul(tx, y, request.params.id);
        planliOlmali(hedef);
        surumKontrol(hedef, g.surum);
        if (g.iptal_kaynagi === 'ogrenci') {
          const [grup] = await tx
            .select({ tur: gruplar.tur })
            .from(gruplar)
            .where(and(eq(gruplar.id, hedef.grup_id), eq(gruplar.kurum_id, y.kurumId)));
          if (grup?.tur !== 'birebir') {
            throw new AppError(
              422,
              dersHataKodlari.iptalKaynagiGecersiz,
              'Öğrenci kaynaklı iptal yalnızca birebir derslerde kaydedilebilir.',
            );
          }
        }
        const seri = await seriBul(tx, hedef.seri_id, true);
        const kume = await etkilenenDersler(tx, hedef, g.kapsam);
        const simdi = new Date();
        const seridenAyir = g.kapsam === 'yalniz_bu' && hedef.seri_id !== null;
        const guncel: DersSatiri[] = [];
        for (const d of kume) {
          const [satir] = await tx
            .update(dersler)
            .set({
              durum: 'iptal',
              iptal_nedeni: g.iptal_nedeni ?? null,
              iptal_eden_id: y.uyelikId,
              iptal_at: simdi,
              iptal_kaynagi: g.iptal_kaynagi,
              gec_iptal: g.iptal_kaynagi === 'ogrenci' && gecIptalMi(d.baslangic_at, simdi),
              ...(seridenAyir ? { seri_istisna: true } : {}),
            })
            .where(eq(dersler.id, d.id))
            .returning();
          if (!satir) throw new Error('ders iptal edilemedi');
          guncel.push(satir);
        }
        if (g.kapsam === 'bu_ve_sonrakiler' && seri) {
          // Seri bu dersten itibaren biter: yeni ders uretilmez. Hic ders kalmazsa seri iptal olur.
          const bitis = tarihEkle(utcdenYerel(hedef.baslangic_at, seri.saat_dilimi).tarih, -1);
          await tx
            .update(dersSerileri)
            .set(
              bitis < seri.baslangic_tarihi
                ? { durum: 'iptal' }
                : { bitis_tarihi: bitis, adet: null },
            )
            .where(eq(dersSerileri.id, seri.id));
        }
        const katilimcilar = await katilimciHaritasi(
          tx,
          guncel.map((d) => d.id),
        );
        for (const d of guncel) {
          await dersOlayiYaz(tx, baglam, 'iptal_edildi', d, katilimcilar.get(d.id) ?? []);
        }
        await dersDenetimiYaz(
          tx,
          y,
          request.ip,
          'ders.iptal',
          'ders',
          hedef.id,
          { surum: hedef.surum },
          {
            kapsam: g.kapsam,
            iptal_kaynagi: g.iptal_kaynagi,
            etkilenen_sayisi: guncel.length,
            gec_iptal: guncel.filter((d) => d.gec_iptal).length,
          },
        );
        const sonHedef = guncel.find((d) => d.id === hedef.id) ?? hedef;
        return {
          ders: await dersDetayi(tx, y, sonHedef),
          etkilenen_ders_idleri: guncel.map((d) => d.id),
          uyari: [],
        };
      });
    },
  );

  // --- Katilimcilar -----------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/dersler/:id/katilimcilar',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary: 'Derse misafir veya telafi ogrencisi ekle',
        params: dersParam,
        body: DersKatilimciEkleGirdiSema,
        response: { 201: DersIslemYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        const ders = await yazilacakDersBul(tx, y, request.params.id);
        planliOlmali(ders);
        const [ogrenci] = await tx
          .select({ id: uyelikler.id })
          .from(uyelikler)
          .where(
            and(
              eq(uyelikler.id, g.ogrenci_id),
              eq(uyelikler.kurum_id, y.kurumId),
              eq(uyelikler.rol, 'ogrenci'),
              eq(uyelikler.durum, 'aktif'),
            ),
          );
        if (!ogrenci) throw new AppError(404, errorCodes.notFound, 'Öğrenci bulunamadı.');
        const eklenen = await tx
          .insert(dersKatilimcilari)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            ders_id: ders.id,
            ogrenci_id: ogrenci.id,
            tur: g.tur,
          })
          .onConflictDoNothing()
          .returning({ id: dersKatilimcilari.id });
        if (eklenen.length === 0) {
          throw new AppError(
            409,
            dersHataKodlari.zatenKatilimci,
            'Öğrenci bu derse zaten katılımcı.',
          );
        }
        await dersOlayiYaz(tx, baglam, 'guncellendi', ders, await katilimciIdleri(tx, ders.id));
        await dersDenetimiYaz(tx, y, request.ip, 'ders.katilimci_ekle', 'ders', ders.id, null, {
          ogrenci_id: ogrenci.id,
          tur: g.tur,
        });
        const uyari = await ogrenciUyarilari(
          tx,
          y.kurumId,
          [ogrenci.id],
          [{ id: ders.id, baslangic: ders.baslangic_at, bitis: ders.bitis_at }],
        );
        return {
          ders: await dersDetayi(tx, y, ders),
          etkilenen_ders_idleri: [ders.id],
          uyari,
        };
      });
      return reply.status(201).send(sonuc);
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/dersler/:id/katilimcilar/:ogrenci_id',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary: 'Ogrenciyi dersin katilimcilarindan cikar (planli ders)',
        params: katilimciParam,
        response: { 200: DersIslemYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const ders = await yazilacakDersBul(tx, y, request.params.id);
        planliOlmali(ders);
        const silinen = await tx
          .delete(dersKatilimcilari)
          .where(
            and(
              eq(dersKatilimcilari.ders_id, ders.id),
              eq(dersKatilimcilari.ogrenci_id, request.params.ogrenci_id),
            ),
          )
          .returning({ tur: dersKatilimcilari.tur });
        if (silinen.length === 0) {
          throw new AppError(404, errorCodes.notFound, 'Katılımcı bulunamadı.');
        }
        await dersOlayiYaz(tx, baglam, 'guncellendi', ders, await katilimciIdleri(tx, ders.id));
        await dersDenetimiYaz(tx, y, request.ip, 'ders.katilimci_cikar', 'ders', ders.id, null, {
          ogrenci_id: request.params.ogrenci_id,
          tur: silinen[0]?.tur ?? null,
        });
        return { ders: await dersDetayi(tx, y, ders), etkilenen_ders_idleri: [ders.id], uyari: [] };
      });
    },
  );

  return Promise.resolve();
};
