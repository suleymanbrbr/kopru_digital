import {
  DevretGirdiSema,
  DevretYanitSema,
  GerceklesenGirdiSema,
  GorevlerimSorguSema,
  GorevlerimYanitSema,
  HaftaSorguSema,
  PlanDetaySema,
  PlanGorevSema,
  errorCodes,
  planHataKodlari,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, asc, eq, max, ne } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import { haftalikPlanlar, planGorevleri } from '../../db/schema.js';
import { requirePermission } from '../hesap/index.js';
import {
  durumHesapla,
  gorevBul,
  gorevOlayiYaz,
  gorevYaniti,
  gorevleriListele,
  haftaYazilabilirOlmali,
  kiraci,
  kurumParam,
  ogrenciOlmali,
  olayBaglami,
  planDenetimiYaz,
  planDetayi,
  planModuluAcikOlmali,
  planiAcYadaGetir,
  surumUyumluOlmali,
  yetkiAl,
} from './plan-deposu.js';
import { haftaBaslangici, haftaKilitliMi, planBugunu, tarihEkle } from './plan-zaman.js';

const gorevParam = kurumParam.extend({ id: z.uuid() });

const PG_TEKIL_IHLAL = '23505';
const tekilIhlaliMi = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === PG_TEKIL_IHLAL || e?.cause?.code === PG_TEKIL_IHLAL;
};

const devredilmis = () =>
  new AppError(409, planHataKodlari.gorevDevredilmis, 'Bu görev zaten devredilmiş.');

/** Ogrenci plan uclari: `planim`, `gorevlerim` (Bugun ekrani), gerceklesen girisi ve devretme. */
export const planOgrenciYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const oku = { preHandler: requirePermission('plan.oku', { scope: 'kendi' }) };
  const yaz = { preHandler: requirePermission('plan.gerceklesen.yaz', { scope: 'kendi' }) };

  app.get(
    '/kurumlar/:kurum_id/planim',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin kendi haftalik plani: yalniz yayindaki plan gorunur (taslak ya da plan yoksa `plan: null` bos iskelet). `hafta` haftanin herhangi bir gunu olabilir (verilmezse bu hafta, Europe/Istanbul).',
        params: kurumParam,
        querystring: HaftaSorguSema,
        response: { 200: PlanDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const hafta = haftaBaslangici(request.query.hafta ?? planBugunu());
      return withTenant(db, kiraci(y), async (tx) => {
        const [plan] = await tx
          .select()
          .from(haftalikPlanlar)
          .where(
            and(
              eq(haftalikPlanlar.kurum_id, y.kurumId),
              eq(haftalikPlanlar.ogrenci_id, y.uyelikId),
              eq(haftalikPlanlar.hafta_baslangic, hafta),
              eq(haftalikPlanlar.durum, 'yayinda'),
            ),
          );
        const gorevler = plan ? await gorevleriListele(tx, plan.id) : [];
        return planDetayi(y.uyelikId, hafta, plan ?? null, gorevler);
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/gorevlerim',
    {
      ...oku,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Bugun ekrani: ogrencinin o gunku gorevleri (yalniz yayindaki planlar; devredilenler haric). `gun` verilmezse bugun (Europe/Istanbul, sunucu saati).',
        params: kurumParam,
        querystring: GorevlerimSorguSema,
        response: { 200: GorevlerimYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const gun = request.query.gun ?? planBugunu();
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select({ gorev: planGorevleri })
          .from(planGorevleri)
          .innerJoin(haftalikPlanlar, eq(haftalikPlanlar.id, planGorevleri.plan_id))
          .where(
            and(
              eq(planGorevleri.kurum_id, y.kurumId),
              eq(planGorevleri.ogrenci_id, y.uyelikId),
              eq(planGorevleri.gun, gun),
              eq(haftalikPlanlar.durum, 'yayinda'),
              ne(planGorevleri.durum, 'devredildi'),
            ),
          )
          .orderBy(asc(planGorevleri.sira), asc(planGorevleri.id));
        return { gun, gorevler: satirlar.map((s) => gorevYaniti(s.gorev)) };
      });
    },
  );

  app.put(
    '/kurumlar/:kurum_id/gorevler/:id/gerceklesen',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrenci gerceklesen miktari girer (hedefi degistiremez). Durum sunucuda hesaplanir: >= hedef `tamam`, 0 < x < hedef `kismen`, 0 `yapilmadi`. Ayni deger tekrar yazilirsa hicbir sey degismez (surum artmaz, olay yok; cevrimdisi tekrar guvenli). Yalniz yayindaki kendi plani; kilitli hafta 409 `plan_kilitli`; devredilmis gorev 409. Iyimser kilit: `surum` (ayni deger tekrarinda aranmaz).',
        params: gorevParam,
        body: GerceklesenGirdiSema,
        response: { 200: PlanGorevSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const { gorev, plan } = await gorevBul(tx, y, request.params.id, true);
        if (plan.durum !== 'yayinda')
          throw new AppError(404, errorCodes.notFound, 'Görev bulunamadı.');
        await planModuluAcikOlmali(tx, y, y.uyelikId);
        // Ayni deger: cevrimdisi tekrar. Sonuc zaten uygulanmistir; kilit/surum bakilmaz.
        if (gorev.gerceklesen_miktar === g.gerceklesen_miktar) return gorevYaniti(gorev);
        haftaYazilabilirOlmali(gorev.hafta_baslangic);
        if (gorev.durum === 'devredildi') throw devredilmis();
        surumUyumluOlmali(gorev.surum, g.surum);
        const durum = durumHesapla(gorev.hedef_miktar, g.gerceklesen_miktar);
        const [yeni] = await tx
          .update(planGorevleri)
          .set({
            gerceklesen_miktar: g.gerceklesen_miktar,
            durum,
            tamamlandi_at: durum === 'tamam' ? (gorev.tamamlandi_at ?? new Date()) : null,
          })
          .where(eq(planGorevleri.id, gorev.id))
          .returning();
        if (!yeni) throw new Error('gerçekleşen yazılamadı');
        await gorevOlayiYaz(tx, baglam, gorev, yeni);
        await planDenetimiYaz(
          tx,
          y,
          request.ip,
          'plan.gerceklesen',
          'plan_gorevi',
          gorev.id,
          { gerceklesen_miktar: gorev.gerceklesen_miktar, durum: gorev.durum },
          { gerceklesen_miktar: yeni.gerceklesen_miktar, durum: yeni.durum },
        );
        return gorevYaniti(yeni);
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/gorevler/:id/devret',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Tamamlanmayan gorevi sonraki gune tasi (ogrenci onerir, ogretmen plandan gorur). `hedef_gun` verilmezse gorevin gunuden bir sonraki gun; Pazar ise sonraki haftanin plani (yoksa yayinda acilir). Yeni gorev: hedef = kalan (en az 1), `devreden_gorev_id` dolu; eski gorev `devredildi`. Ayni gorev tekrar devredilemez (409 `gorev_zaten_devredildi`).',
        params: gorevParam,
        body: DevretGirdiSema,
        response: { 201: DevretYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      try {
        const sonuc = await withTenant(db, kiraci(y), async (tx) => {
          const { gorev, plan } = await gorevBul(tx, y, request.params.id, true);
          if (plan.durum !== 'yayinda') {
            throw new AppError(404, errorCodes.notFound, 'Görev bulunamadı.');
          }
          await planModuluAcikOlmali(tx, y, y.uyelikId);
          if (gorev.durum === 'devredildi') throw devredilmis();
          if (gorev.durum === 'tamam') {
            throw new AppError(
              409,
              planHataKodlari.devretmeDurumuGecersiz,
              'Tamamlanan görev devredilemez.',
            );
          }
          haftaYazilabilirOlmali(gorev.hafta_baslangic);
          surumUyumluOlmali(gorev.surum, g.surum);
          const hedefGun = g.hedef_gun ?? tarihEkle(gorev.gun, 1);
          if (hedefGun <= gorev.gun) {
            throw new AppError(
              422,
              planHataKodlari.hedefGunGecersiz,
              'Hedef gün görevin gününden sonra olmalı.',
            );
          }
          const hedefHafta = haftaBaslangici(hedefGun);
          if (haftaKilitliMi(hedefHafta)) {
            throw new AppError(409, planHataKodlari.planKilitli, 'Hedef haftanın planı kilitli.');
          }
          // Ayni hafta: kendi plani; sonraki hafta: varsa o plan, yoksa yayinda acilir.
          const hedefPlan =
            hedefHafta === plan.hafta_baslangic
              ? plan
              : (await planiAcYadaGetir(tx, y, y.uyelikId, hedefHafta, { durum: 'yayinda' })).plan;
          const [son] = await tx
            .select({ en: max(planGorevleri.sira) })
            .from(planGorevleri)
            .where(and(eq(planGorevleri.plan_id, hedefPlan.id), eq(planGorevleri.gun, hedefGun)));
          const kalan = Math.max(gorev.hedef_miktar - (gorev.gerceklesen_miktar ?? 0), 1);
          const [yeni] = await tx
            .insert(planGorevleri)
            .values({
              id: uuidv7(),
              kurum_id: y.kurumId,
              created_by: y.kullaniciId,
              plan_id: hedefPlan.id,
              ogrenci_id: y.uyelikId,
              hafta_baslangic: hedefPlan.hafta_baslangic,
              gun: hedefGun,
              brans_kodu: gorev.brans_kodu,
              konu_id: gorev.konu_id,
              baslik: gorev.baslik,
              hedef_turu: gorev.hedef_turu,
              hedef_miktar: kalan,
              devreden_gorev_id: gorev.id,
              sira: (son?.en ?? -1) + 1,
              ekleyen_id: y.uyelikId,
            })
            .returning();
          if (!yeni) throw new Error('devir görevi yazılamadı');
          const [eski] = await tx
            .update(planGorevleri)
            .set({ durum: 'devredildi', tamamlandi_at: null })
            .where(eq(planGorevleri.id, gorev.id))
            .returning();
          if (!eski) throw new Error('görev devredilemedi');
          await gorevOlayiYaz(tx, baglam, gorev, eski);
          await planDenetimiYaz(
            tx,
            y,
            request.ip,
            'plan.devret',
            'plan_gorevi',
            gorev.id,
            { durum: gorev.durum },
            { durum: 'devredildi', yeni_gorev_id: yeni.id, hedef_gun: hedefGun, kalan },
          );
          return { eski: gorevYaniti(eski), yeni: gorevYaniti(yeni) };
        });
        return await reply.status(201).send(sonuc);
      } catch (hata) {
        // Es zamanli iki devir: ikincisi `devreden_gorev_id` tekil indeksine takilir.
        if (tekilIhlaliMi(hata)) throw devredilmis();
        throw hata;
      }
    },
  );

  return Promise.resolve();
};
