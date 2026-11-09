import {
  GorevGirdiSema,
  GorevGuncelleGirdiSema,
  HaftaSorguSema,
  KopyalaGirdiSema,
  PlanDetaySema,
  PlanGorevSema,
  PlanNotGirdiSema,
  PlanOlusturGirdiSema,
  PlanOzetSema,
  TopluPlanGirdiSema,
  TopluPlanYanitSema,
  errorCodes,
  planHataKodlari,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import { gruplar, haftalikPlanlar, planGorevleri } from '../../db/schema.js';
import {
  grupEtkinOgrencileri,
  grupKapsami,
  modulAcikMi,
  requirePermission,
} from '../hesap/index.js';
import {
  bransGecerliOlmali,
  durumHesapla,
  gorevBul,
  gorevOlayiYaz,
  gorevYaniti,
  gorevleriEkle,
  gorevleriListele,
  haftaYazilabilirOlmali,
  kendiSablonu,
  kiraci,
  kurumParam,
  ogrenciBul,
  ogrenciParam,
  olayBaglami,
  ogrenciPlaniBul,
  ozetHesapla,
  planBul,
  planDenetimiYaz,
  planDetayi,
  planModuluAcikOlmali,
  planParam,
  planiAcYadaGetir,
  sablondanGorevler,
  surumUyumluOlmali,
  yazilacakPlanBul,
  yetkiAl,
  type PlanSatiri,
} from './plan-deposu.js';
import { gunFarki, haftaBaslangici, pazartesiMi, planBugunu, tarihEkle } from './plan-zaman.js';

const gorevParam = kurumParam.extend({ id: z.uuid() });

const haftaPazartesiOlmali = (hafta: string): void => {
  if (!pazartesiMi(hafta)) {
    throw new AppError(
      422,
      planHataKodlari.haftaPazartesiDegil,
      'Hafta başlangıcı Pazartesi olmalı.',
    );
  }
};

const gunHaftaIcinde = (hafta: string, gun: string): void => {
  const fark = gunFarki(hafta, gun);
  if (fark < 0 || fark > 6) {
    throw new AppError(
      422,
      planHataKodlari.gunHaftaDisinda,
      'Görevin günü planın haftası içinde olmalı.',
    );
  }
};

/** Ogretmen/yonetici plan, gorev, kopyalama, toplu plan ve ozet uclari. */
export const planYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const oku = { preHandler: requirePermission('plan.oku', { scope: 'grup' }) };
  const yaz = { preHandler: requirePermission('plan.gorev.yaz', { scope: 'grup' }) };
  const okuKendi = { preHandler: requirePermission('plan.oku', { scope: 'kendi' }) };

  // --- Plan ---------------------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/plan',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin haftalik plani (ogretmen: taslak dahil). `hafta` haftanin herhangi bir gunu olabilir (verilmezse bu hafta, Europe/Istanbul). Plan yoksa `plan: null` ve bos gorev listesiyle bos iskelet doner. Kapsam disi ogrenci 404.',
        params: ogrenciParam,
        querystring: HaftaSorguSema,
        response: { 200: PlanDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const hafta = haftaBaslangici(request.query.hafta ?? planBugunu());
      return withTenant(db, kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, request.params.ogrenci_id, false);
        const [plan] = await tx
          .select()
          .from(haftalikPlanlar)
          .where(
            and(
              eq(haftalikPlanlar.kurum_id, y.kurumId),
              eq(haftalikPlanlar.ogrenci_id, request.params.ogrenci_id),
              eq(haftalikPlanlar.hafta_baslangic, hafta),
            ),
          );
        const gorevler = plan ? await gorevleriListele(tx, plan.id) : [];
        return planDetayi(request.params.ogrenci_id, hafta, plan ?? null, gorevler);
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/planlar',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrenci ve hafta icin bos plan (taslak) olustur. Hafta Pazartesi olmali (422); ayni hafta plani varsa 409 `plan_zaten_var`; kilitli hafta 409 `plan_kilitli`.',
        params: kurumParam,
        body: PlanOlusturGirdiSema,
        response: { 201: PlanDetaySema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      haftaPazartesiOlmali(g.hafta_baslangic);
      haftaYazilabilirOlmali(g.hafta_baslangic);
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, g.ogrenci_id);
        await planModuluAcikOlmali(tx, y, g.ogrenci_id);
        const { plan, yeni } = await planiAcYadaGetir(tx, y, g.ogrenci_id, g.hafta_baslangic, {
          durum: 'taslak',
          not: g.not ?? null,
        });
        if (!yeni) {
          throw new AppError(409, planHataKodlari.planZatenVar, 'Bu hafta için plan zaten var.', {
            plan_id: plan.id,
          });
        }
        await planDenetimiYaz(tx, y, request.ip, 'plan.olustur', 'haftalik_plan', plan.id, null, {
          ogrenci_id: plan.ogrenci_id,
          hafta_baslangic: plan.hafta_baslangic,
        });
        return planDetayi(plan.ogrenci_id, plan.hafta_baslangic, plan, []);
      });
      return reply.status(201).send(sonuc);
    },
  );

  app.get(
    '/kurumlar/:kurum_id/planlar/:id',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary: 'Plan ve gorevleri (kapsam disi 404).',
        params: planParam,
        response: { 200: PlanDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const plan = await planBul(tx, y, request.params.id);
        return planDetayi(
          plan.ogrenci_id,
          plan.hafta_baslangic,
          plan,
          await gorevleriListele(tx, plan.id),
        );
      });
    },
  );

  app.put(
    '/kurumlar/:kurum_id/planlar/:id/not',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogretmen notu (plan basina tek not; `null` notu siler). Yayindaki planda da yazilir. Iyimser kilit: `surum`.',
        params: planParam,
        body: PlanNotGirdiSema,
        response: { 200: PlanDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      return withTenant(db, kiraci(y), async (tx) => {
        const p = await yazilacakPlanBul(tx, y, request.params.id);
        surumUyumluOlmali(p.surum, g.surum);
        const [yeni] = await tx
          .update(haftalikPlanlar)
          .set({ not: g.not })
          .where(eq(haftalikPlanlar.id, p.id))
          .returning();
        if (!yeni) throw new Error('not yazılamadı');
        await planDenetimiYaz(tx, y, request.ip, 'plan.not', 'haftalik_plan', p.id, null, {
          not_var: g.not !== null,
        });
        return planDetayi(
          yeni.ogrenci_id,
          yeni.hafta_baslangic,
          yeni,
          await gorevleriListele(tx, yeni.id),
        );
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/planlar/:id/yayinla',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Taslagi yayinla (ogrenci artik gorur). Yayindaki planda tekrar cagri etkisizdir (200).',
        params: planParam,
        response: { 200: PlanDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const p = await yazilacakPlanBul(tx, y, request.params.id);
        let guncel: PlanSatiri = p;
        if (p.durum !== 'yayinda') {
          const [yeni] = await tx
            .update(haftalikPlanlar)
            .set({ durum: 'yayinda', yayin_at: new Date() })
            .where(eq(haftalikPlanlar.id, p.id))
            .returning();
          if (!yeni) throw new Error('plan yayınlanamadı');
          guncel = yeni;
          await planDenetimiYaz(tx, y, request.ip, 'plan.yayinla', 'haftalik_plan', p.id, null, {
            durum: 'yayinda',
          });
        }
        return planDetayi(
          guncel.ogrenci_id,
          guncel.hafta_baslangic,
          guncel,
          await gorevleriListele(tx, guncel.id),
        );
      });
    },
  );

  // --- Gorev --------------------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/planlar/:id/gorevler',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Plana gorev ekle (ders, konu, hedef soru sayisi ya da dakika). `gun` planin haftasi icinde olmali (422). Hedefi yalniz ogretmen/yonetim yazar; ogrenci gorev ekleyemez (403).',
        params: planParam,
        body: GorevGirdiSema,
        response: { 201: PlanGorevSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        const p = await yazilacakPlanBul(tx, y, request.params.id);
        gunHaftaIcinde(p.hafta_baslangic, g.gun);
        await bransGecerliOlmali(tx, g.brans_kodu);
        const [eklenen] = await gorevleriEkle(tx, y, [p], [g]);
        if (!eklenen) throw new Error('görev eklenemedi');
        await planDenetimiYaz(
          tx,
          y,
          request.ip,
          'plan.gorev_ekle',
          'plan_gorevi',
          eklenen.id,
          null,
          {
            plan_id: p.id,
            gun: eklenen.gun,
            brans_kodu: eklenen.brans_kodu,
            hedef_turu: eklenen.hedef_turu,
            hedef_miktar: eklenen.hedef_miktar,
          },
        );
        return gorevYaniti(eklenen);
      });
      return reply.status(201).send(sonuc);
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/gorevler/:id',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Gorevin hedef alanlarini duzenle (gun, ders, konu, baslik, hedef, sira). Gerceklesen miktar bu uctan yazilmaz. Hedef degisince gerceklesen girilmisse durum yeniden hesaplanir. Devredilmis gorev 409. Iyimser kilit: `surum`.',
        params: gorevParam,
        body: GorevGuncelleGirdiSema,
        response: { 200: PlanGorevSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const { gorev } = await gorevBul(tx, y, request.params.id, true);
        await planModuluAcikOlmali(tx, y, gorev.ogrenci_id);
        haftaYazilabilirOlmali(gorev.hafta_baslangic);
        if (gorev.durum === 'devredildi') {
          throw new AppError(
            409,
            planHataKodlari.gorevDevredilmis,
            'Devredilmiş görev düzenlenemez.',
          );
        }
        surumUyumluOlmali(gorev.surum, g.surum);
        if (g.gun !== undefined) gunHaftaIcinde(gorev.hafta_baslangic, g.gun);
        if (g.brans_kodu !== undefined) await bransGecerliOlmali(tx, g.brans_kodu);
        const hedefMiktar = g.hedef_miktar ?? gorev.hedef_miktar;
        const hesapliDurum =
          gorev.gerceklesen_miktar !== null && gorev.durum !== 'bekliyor'
            ? durumHesapla(hedefMiktar, gorev.gerceklesen_miktar)
            : gorev.durum;
        const [yeni] = await tx
          .update(planGorevleri)
          .set({
            gun: g.gun ?? gorev.gun,
            brans_kodu: g.brans_kodu ?? gorev.brans_kodu,
            konu_id: g.konu_id === undefined ? gorev.konu_id : g.konu_id,
            baslik: g.baslik === undefined ? gorev.baslik : g.baslik,
            hedef_turu: g.hedef_turu ?? gorev.hedef_turu,
            hedef_miktar: hedefMiktar,
            sira: g.sira ?? gorev.sira,
            durum: hesapliDurum,
            tamamlandi_at: hesapliDurum === 'tamam' ? (gorev.tamamlandi_at ?? new Date()) : null,
          })
          .where(eq(planGorevleri.id, gorev.id))
          .returning();
        if (!yeni) throw new Error('görev güncellenemedi');
        await gorevOlayiYaz(tx, baglam, gorev, yeni);
        await planDenetimiYaz(
          tx,
          y,
          request.ip,
          'plan.gorev_guncelle',
          'plan_gorevi',
          gorev.id,
          null,
          {
            alanlar: Object.keys(g).filter((k) => k !== 'surum'),
            durum: yeni.durum,
          },
        );
        return gorevYaniti(yeni);
      });
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/gorevler/:id',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Gorevi sil. Yalniz yayin oncesi (taslak plan) ya da gerceklesen girilmemisse; baska gune devredilmis gorev de silinemez (409 `gorev_silinemez`).',
        params: gorevParam,
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      await withTenant(db, kiraci(y), async (tx) => {
        const { gorev, plan } = await gorevBul(tx, y, request.params.id, true);
        await planModuluAcikOlmali(tx, y, gorev.ogrenci_id);
        haftaYazilabilirOlmali(gorev.hafta_baslangic);
        const [devir] = await tx
          .select({ id: planGorevleri.id })
          .from(planGorevleri)
          .where(eq(planGorevleri.devreden_gorev_id, gorev.id))
          .limit(1);
        if (devir || (plan.durum === 'yayinda' && gorev.gerceklesen_miktar !== null)) {
          throw new AppError(
            409,
            planHataKodlari.gorevSilinemez,
            'Gerçekleşen girilmiş ya da devredilmiş görev silinemez.',
          );
        }
        await tx.delete(planGorevleri).where(eq(planGorevleri.id, gorev.id));
        await planDenetimiYaz(tx, y, request.ip, 'plan.gorev_sil', 'plan_gorevi', gorev.id, null, {
          plan_id: plan.id,
          plan_durumu: plan.durum,
        });
      });
      return reply.status(204).send(null);
    },
  );

  // --- Kopyala ve toplu ---------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/planlar/:id/kopyala',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Haftayi cogalt (gecen haftayi bu haftaya): gorevler hedef haftaya ayni gun siralarinda kopyalanir; gerceklesen ve durum sifirlanir, devredilmis gorevler kopyalanmaz, hedef plan taslaktir. Hedef haftada gorevli plan varsa 409 `plan_dolu`.',
        params: planParam,
        body: KopyalaGirdiSema,
        response: { 201: PlanDetaySema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        const kaynak = await planBul(tx, y, request.params.id);
        const hedefHafta = g.hedef_hafta_baslangic ?? tarihEkle(kaynak.hafta_baslangic, 7);
        haftaPazartesiOlmali(hedefHafta);
        if (hedefHafta === kaynak.hafta_baslangic) {
          throw new AppError(
            422,
            errorCodes.validation,
            'Hedef hafta kaynak haftadan farklı olmalı.',
          );
        }
        haftaYazilabilirOlmali(hedefHafta);
        await ogrenciBul(tx, y, kaynak.ogrenci_id);
        await planModuluAcikOlmali(tx, y, kaynak.ogrenci_id);
        const { plan: hedef } = await planiAcYadaGetir(tx, y, kaynak.ogrenci_id, hedefHafta, {
          durum: 'taslak',
        });
        if ((await gorevleriListele(tx, hedef.id)).length > 0) {
          throw new AppError(409, planHataKodlari.planDolu, 'Hedef haftanın planında görev var.', {
            plan_id: hedef.id,
          });
        }
        const fark = gunFarki(kaynak.hafta_baslangic, hedefHafta);
        const kopyalanacak = (await gorevleriListele(tx, kaynak.id)).filter(
          (k) => k.durum !== 'devredildi',
        );
        const eklenen = await gorevleriEkle(
          tx,
          y,
          [hedef],
          kopyalanacak.map((k) => ({
            gun: tarihEkle(k.gun, fark),
            brans_kodu: k.brans_kodu,
            konu_id: k.konu_id ?? undefined,
            baslik: k.baslik ?? undefined,
            hedef_turu: k.hedef_turu as 'soru' | 'dakika',
            hedef_miktar: k.hedef_miktar,
            sira: k.sira,
          })),
        );
        await planDenetimiYaz(tx, y, request.ip, 'plan.kopyala', 'haftalik_plan', hedef.id, null, {
          kaynak_plan_id: kaynak.id,
          gorev_sayisi: eklenen.length,
        });
        return planDetayi(
          hedef.ogrenci_id,
          hedef.hafta_baslangic,
          hedef,
          await gorevleriListele(tx, hedef.id),
        );
      });
      return reply.status(201).send(sonuc);
    },
  );

  app.post(
    '/kurumlar/:kurum_id/planlar/toplu',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Gruba toplu plan: grubun etkin ogrencilerinden o haftada plani olmayanlara ayni gorevlerle (`sablon_id` ya da `gorevler`) plan acilir. Idempotent: plani olan ogrenci degistirilmez (`zaten_var`), tekrar cagri yeni plan ya da gorev uretmez. `yayinla` true ise planlar yayinda acilir.',
        params: kurumParam,
        body: TopluPlanGirdiSema,
        response: { 200: TopluPlanYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      haftaPazartesiOlmali(g.hafta_baslangic);
      haftaYazilabilirOlmali(g.hafta_baslangic);
      return withTenant(db, kiraci(y), async (tx) => {
        const [grup] = await tx
          .select({ id: gruplar.id, durum: gruplar.durum })
          .from(gruplar)
          .where(
            and(eq(gruplar.id, g.grup_id), eq(gruplar.kurum_id, y.kurumId), grupKapsami(tx, y)),
          );
        if (!grup) throw new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
        if (grup.durum !== 'aktif') {
          throw new AppError(422, errorCodes.validation, 'Arşivlenmiş gruba plan verilemez.');
        }
        if (!(await modulAcikMi(tx, y.kurumId, 'haftalik_plan', { grupId: grup.id }))) {
          throw new AppError(403, errorCodes.modulKapali, 'Haftalık plan bu grupta kapalı.');
        }
        const girdiler = g.sablon_id
          ? sablondanGorevler(g.hafta_baslangic, (await kendiSablonu(tx, y, g.sablon_id)).gorevler)
          : sablondanGorevler(g.hafta_baslangic, g.gorevler ?? []);
        for (const kod of new Set(girdiler.map((x) => x.brans_kodu))) {
          await bransGecerliOlmali(tx, kod);
        }
        const ogrenciler = await grupEtkinOgrencileri(tx, grup.id);
        const olusan = new Map<string, PlanSatiri>();
        const parca = 200;
        for (let i = 0; i < ogrenciler.length; i += parca) {
          const eklenen = await tx
            .insert(haftalikPlanlar)
            .values(
              ogrenciler.slice(i, i + parca).map((ogrenciId) => ({
                id: uuidv7(),
                kurum_id: y.kurumId,
                created_by: y.kullaniciId,
                ogrenci_id: ogrenciId,
                hafta_baslangic: g.hafta_baslangic,
                hazirlayan_id: y.uyelikId,
                durum: g.yayinla ? 'yayinda' : 'taslak',
                yayin_at: g.yayinla ? new Date() : null,
              })),
            )
            .onConflictDoNothing({
              target: [
                haftalikPlanlar.kurum_id,
                haftalikPlanlar.ogrenci_id,
                haftalikPlanlar.hafta_baslangic,
              ],
            })
            .returning();
          for (const p of eklenen) olusan.set(p.ogrenci_id, p);
        }
        await gorevleriEkle(tx, y, [...olusan.values()], girdiler);
        const mevcutlar =
          olusan.size < ogrenciler.length
            ? await tx
                .select({ id: haftalikPlanlar.id, ogrenci_id: haftalikPlanlar.ogrenci_id })
                .from(haftalikPlanlar)
                .where(
                  and(
                    eq(haftalikPlanlar.kurum_id, y.kurumId),
                    eq(haftalikPlanlar.hafta_baslangic, g.hafta_baslangic),
                    inArray(haftalikPlanlar.ogrenci_id, ogrenciler),
                  ),
                )
            : [];
        const mevcutId = new Map(mevcutlar.map((m) => [m.ogrenci_id, m.id]));
        await planDenetimiYaz(tx, y, request.ip, 'plan.toplu', 'grup', grup.id, null, {
          hafta_baslangic: g.hafta_baslangic,
          olusturulan: olusan.size,
          atlanan: ogrenciler.length - olusan.size,
          gorev_sayisi: girdiler.length,
          yayinla: g.yayinla,
        });
        return {
          grup_id: grup.id,
          hafta_baslangic: g.hafta_baslangic,
          olusturulan: olusan.size,
          atlanan: ogrenciler.length - olusan.size,
          planlar: ogrenciler.flatMap((ogrenciId) => {
            const yeni = olusan.get(ogrenciId);
            const planId = yeni?.id ?? mevcutId.get(ogrenciId);
            return planId
              ? [
                  {
                    ogrenci_id: ogrenciId,
                    plan_id: planId,
                    sonuc: yeni ? ('olusturuldu' as const) : ('zaten_var' as const),
                  },
                ]
              : [];
          }),
        };
      });
    },
  );

  // --- Ozet (ogretmen kapsami ya da ogrencinin kendi yayindaki plani) -----------------------

  app.get(
    '/kurumlar/:kurum_id/planlar/:id/ozet',
    {
      ...okuKendi,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Haftalik ozet: ders (brans) bazinda planlanan ve gerceklesen; soru ve dakika ayri toplanir. Devredilen gorevde planlanan yalniz yapilan kisimdir. Ogrenci yalniz kendi yayindaki planini gorur.',
        params: planParam,
        response: { 200: PlanOzetSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const plan =
          y.rol === 'ogrenci'
            ? await ogrenciPlaniBul(tx, y, request.params.id)
            : await planBul(tx, y, request.params.id);
        return ozetHesapla(plan, await gorevleriListele(tx, plan.id));
      });
    },
  );

  return Promise.resolve();
};
