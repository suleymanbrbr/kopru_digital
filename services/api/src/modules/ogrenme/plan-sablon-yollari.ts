import {
  PlanDetaySema,
  PlanSablonListeYanitSema,
  PlanSablonuSema,
  PlanSablonGuncelleGirdiSema,
  PlanSablonOlusturGirdiSema,
  PlanSablondanKurGirdiSema,
  planHataKodlari,
  type PlanSablonu,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { desc, eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import { planSablonGorevleri, planSablonlari } from '../../db/schema.js';
import { requirePermission } from '../hesap/index.js';
import {
  bransGecerliOlmali,
  gorevleriEkle,
  gorevleriListele,
  haftaYazilabilirOlmali,
  kendiSablonu,
  kiraci,
  kurumParam,
  ogrenciBul,
  planDenetimiYaz,
  planDetayi,
  planModuluAcikOlmali,
  planiAcYadaGetir,
  sablonYaniti,
  sablondanGorevler,
  yetkiAl,
} from './plan-deposu.js';
import { pazartesiMi } from './plan-zaman.js';

const sablonParam = kurumParam.extend({ id: z.uuid() });

type SablonGorevGirdisi = z.infer<typeof PlanSablonOlusturGirdiSema>['gorevler'][number];

async function sablonGorevleriniYaz(
  tx: Tx,
  kurumId: string,
  kullaniciId: string,
  sablonId: string,
  gorevler: readonly SablonGorevGirdisi[],
) {
  for (const kod of new Set(gorevler.map((g) => g.brans_kodu))) await bransGecerliOlmali(tx, kod);
  if (gorevler.length === 0) return;
  await tx.insert(planSablonGorevleri).values(
    gorevler.map((g) => ({
      id: uuidv7(),
      kurum_id: kurumId,
      created_by: kullaniciId,
      sablon_id: sablonId,
      gun_sirasi: g.gun_sirasi,
      brans_kodu: g.brans_kodu,
      konu_id: g.konu_id ?? null,
      baslik: g.baslik ?? null,
      hedef_turu: g.hedef_turu,
      hedef_miktar: g.hedef_miktar,
      sira: g.sira,
    })),
  );
}

/**
 * Plan sablonlari: her kullanici yalniz kendi sablonlarini gorur ve degistirir (baskasininki 404).
 * Sablon ogrenci, hafta ve gerceklesen icermez; "sablondan kur" ogrenci ve haftaya oturtur.
 */
export const planSablonYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const yetki = { preHandler: requirePermission('plan.gorev.yaz', { scope: 'grup' }) };

  app.post(
    '/kurumlar/:kurum_id/plan-sablonlari',
    {
      ...yetki,
      schema: {
        tags: ['ogrenme'],
        summary: 'Plan sablonu olustur (haftanin gun sirasina [0 = Pazartesi] gore gorevlerle).',
        params: kurumParam,
        body: PlanSablonOlusturGirdiSema,
        response: { 201: PlanSablonuSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        const [s] = await tx
          .insert(planSablonlari)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            ogretmen_id: y.uyelikId,
            ad: g.ad,
            aciklama: g.aciklama ?? null,
          })
          .returning();
        if (!s) throw new Error('şablon oluşturulamadı');
        await sablonGorevleriniYaz(tx, y.kurumId, y.kullaniciId, s.id, g.gorevler);
        await planDenetimiYaz(
          tx,
          y,
          request.ip,
          'plan.sablon_olustur',
          'plan_sablonu',
          s.id,
          null,
          {
            gorev_sayisi: g.gorevler.length,
          },
        );
        return sablonYaniti(s, (await kendiSablonu(tx, y, s.id)).gorevler);
      });
      return reply.status(201).send(sonuc);
    },
  );

  app.get(
    '/kurumlar/:kurum_id/plan-sablonlari',
    {
      ...yetki,
      schema: {
        tags: ['ogrenme'],
        summary: 'Kendi plan sablonlarim (yeniden eskiye).',
        params: kurumParam,
        response: { 200: PlanSablonListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const sablonlar = await tx
          .select()
          .from(planSablonlari)
          .where(eq(planSablonlari.ogretmen_id, y.uyelikId))
          .orderBy(desc(planSablonlari.id));
        const gorevler =
          sablonlar.length === 0
            ? []
            : await tx
                .select()
                .from(planSablonGorevleri)
                .where(
                  inArray(
                    planSablonGorevleri.sablon_id,
                    sablonlar.map((s) => s.id),
                  ),
                );
        return { sablonlar: sablonlar.map((s): PlanSablonu => sablonYaniti(s, gorevler)) };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/plan-sablonlari/:id',
    {
      ...yetki,
      schema: {
        tags: ['ogrenme'],
        summary: 'Plan sablonu (baskasinin sablonu 404).',
        params: sablonParam,
        response: { 200: PlanSablonuSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const { sablon, gorevler } = await kendiSablonu(tx, y, request.params.id);
        return sablonYaniti(sablon, gorevler);
      });
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/plan-sablonlari/:id',
    {
      ...yetki,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Sablonu guncelle. `gorevler` verilirse gorev listesinin tamami bununla degistirilir.',
        params: sablonParam,
        body: PlanSablonGuncelleGirdiSema,
        response: { 200: PlanSablonuSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      return withTenant(db, kiraci(y), async (tx) => {
        const { sablon } = await kendiSablonu(tx, y, request.params.id);
        const [yeni] = await tx
          .update(planSablonlari)
          .set({
            ad: g.ad ?? sablon.ad,
            aciklama: g.aciklama === undefined ? sablon.aciklama : g.aciklama,
          })
          .where(eq(planSablonlari.id, sablon.id))
          .returning();
        if (!yeni) throw new Error('şablon güncellenemedi');
        if (g.gorevler !== undefined) {
          await tx.delete(planSablonGorevleri).where(eq(planSablonGorevleri.sablon_id, sablon.id));
          await sablonGorevleriniYaz(tx, y.kurumId, y.kullaniciId, sablon.id, g.gorevler);
        }
        await planDenetimiYaz(
          tx,
          y,
          request.ip,
          'plan.sablon_guncelle',
          'plan_sablonu',
          sablon.id,
          null,
          {
            alanlar: Object.keys(g),
          },
        );
        return sablonYaniti(yeni, (await kendiSablonu(tx, y, sablon.id)).gorevler);
      });
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/plan-sablonlari/:id',
    {
      ...yetki,
      schema: {
        tags: ['ogrenme'],
        summary: 'Sablonu sil (kurulmus planlar etkilenmez).',
        params: sablonParam,
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      await withTenant(db, kiraci(y), async (tx) => {
        const { sablon, gorevler } = await kendiSablonu(tx, y, request.params.id);
        await tx.delete(planSablonlari).where(eq(planSablonlari.id, sablon.id));
        await planDenetimiYaz(
          tx,
          y,
          request.ip,
          'plan.sablon_sil',
          'plan_sablonu',
          sablon.id,
          null,
          {
            gorev_sayisi: gorevler.length,
          },
        );
      });
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/kurumlar/:kurum_id/plan-sablonlari/:id/uygula',
    {
      ...yetki,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Sablondan kur: ogrenci ve haftaya taslak plan acar (varsa bos plani kullanir) ve sablon gorevlerini gun sirasina gore haftaya oturtur. Hedef haftada gorevli plan varsa 409 `plan_dolu`.',
        params: sablonParam,
        body: PlanSablondanKurGirdiSema,
        response: { 201: PlanDetaySema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      if (!pazartesiMi(g.hafta_baslangic)) {
        throw new AppError(
          422,
          planHataKodlari.haftaPazartesiDegil,
          'Hafta başlangıcı Pazartesi olmalı.',
        );
      }
      haftaYazilabilirOlmali(g.hafta_baslangic);
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        const { sablon, gorevler } = await kendiSablonu(tx, y, request.params.id);
        await ogrenciBul(tx, y, g.ogrenci_id);
        await planModuluAcikOlmali(tx, y, g.ogrenci_id);
        const { plan } = await planiAcYadaGetir(tx, y, g.ogrenci_id, g.hafta_baslangic, {
          durum: 'taslak',
        });
        if ((await gorevleriListele(tx, plan.id)).length > 0) {
          throw new AppError(409, planHataKodlari.planDolu, 'Hedef haftanın planında görev var.', {
            plan_id: plan.id,
          });
        }
        await gorevleriEkle(tx, y, [plan], sablondanGorevler(g.hafta_baslangic, gorevler));
        await planDenetimiYaz(
          tx,
          y,
          request.ip,
          'plan.sablondan_kur',
          'haftalik_plan',
          plan.id,
          null,
          {
            sablon_id: sablon.id,
            gorev_sayisi: gorevler.length,
          },
        );
        return planDetayi(
          plan.ogrenci_id,
          plan.hafta_baslangic,
          plan,
          await gorevleriListele(tx, plan.id),
        );
      });
      return reply.status(201).send(sonuc);
    },
  );

  return Promise.resolve();
};
