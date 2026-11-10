import {
  PLAN_TOPLU_PARCA_BOYUTU,
  errorCodes,
  ogrenmePlanGoreviGuncellendiV1,
  planHataKodlari,
  type HaftalikPlan,
  type PlanDetayi,
  type PlanGorevDurumu,
  type PlanGorevi,
  type PlanOzeti,
  type PlanSablonu,
} from '@kopru/contracts';
import { AppError, publishInTx, type Tx } from '@kopru/service-kit';
import { and, asc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  denetimKayitlari,
  grupUyeleri,
  haftalikPlanlar,
  planGorevleri,
  planSablonGorevleri,
  planSablonlari,
  uyelikler,
} from '../../db/schema.js';
import { kapsamdakiGruplar, modulAcikMi, type YetkiBaglami } from '../hesap/index.js';
import { OUTBOX_TABLOSU, kurumParam, type OdevOlayBaglami } from './odev-deposu.js';
import { haftaKilitliMi, tarihEkle } from './plan-zaman.js';

export { bransGecerliOlmali, kiraci, kurumParam, olayBaglami, yetkiAl } from './odev-deposu.js';

export type PlanSatiri = typeof haftalikPlanlar.$inferSelect;
export type GorevSatiri = typeof planGorevleri.$inferSelect;

export const planParam = kurumParam.extend({ id: z.uuid() });
export const ogrenciParam = kurumParam.extend({ ogrenci_id: z.uuid() });

const SIFIR_UUID = '00000000-0000-0000-0000-000000000000';

export const planBulunamadi = () => new AppError(404, errorCodes.notFound, 'Plan bulunamadı.');
export const gorevBulunamadi = () => new AppError(404, errorCodes.notFound, 'Görev bulunamadı.');
export const ogrenciBulunamadi = () =>
  new AppError(404, errorCodes.notFound, 'Öğrenci bulunamadı.');

export const planKilitli = () =>
  new AppError(
    409,
    planHataKodlari.planKilitli,
    'Bu haftanın planı kilitlendi: hafta sonundan 14 gün geçti.',
  );

/** Haftanin kilidi: kilitliyse 409 `plan_kilitli`. `bugun` yalniz testler icin verilir. */
export function haftaYazilabilirOlmali(haftaBaslangic: string, bugun?: string): void {
  if (haftaKilitliMi(haftaBaslangic, bugun)) throw planKilitli();
}

export function surumUyumluOlmali(guncel: number, beklenen: number | undefined): void {
  if (beklenen !== undefined && beklenen !== guncel) {
    throw new AppError(
      409,
      planHataKodlari.surumCakismasi,
      'Kayıt bu arada değişti. Güncel hâlini alıp tekrar deneyin.',
      { guncel_surum: guncel },
    );
  }
}

// --- Yanit donusumleri -----------------------------------------------------------------------

export const planYaniti = (p: PlanSatiri): HaftalikPlan => ({
  id: p.id,
  ogrenci_id: p.ogrenci_id,
  hafta_baslangic: p.hafta_baslangic,
  hazirlayan_id: p.hazirlayan_id,
  durum: p.durum as HaftalikPlan['durum'],
  yayin_at: p.yayin_at?.toISOString() ?? null,
  not: p.not,
  surum: p.surum,
  created_at: p.created_at.toISOString(),
});

export const gorevYaniti = (g: GorevSatiri): PlanGorevi => ({
  id: g.id,
  plan_id: g.plan_id,
  ogrenci_id: g.ogrenci_id,
  hafta_baslangic: g.hafta_baslangic,
  gun: g.gun,
  brans_kodu: g.brans_kodu,
  konu_id: g.konu_id,
  baslik: g.baslik,
  hedef_turu: g.hedef_turu as PlanGorevi['hedef_turu'],
  hedef_miktar: g.hedef_miktar,
  gerceklesen_miktar: g.gerceklesen_miktar,
  durum: g.durum as PlanGorevDurumu,
  tamamlandi_at: g.tamamlandi_at?.toISOString() ?? null,
  devreden_gorev_id: g.devreden_gorev_id,
  sira: g.sira,
  surum: g.surum,
});

export function planDetayi(
  ogrenciId: string,
  hafta: string,
  plan: PlanSatiri | null,
  gorevler: readonly GorevSatiri[],
): PlanDetayi {
  return {
    ogrenci_id: ogrenciId,
    hafta_baslangic: hafta,
    kilitli: haftaKilitliMi(hafta),
    plan: plan ? planYaniti(plan) : null,
    gorevler: gorevler.map(gorevYaniti),
  };
}

export const gorevleriListele = (tx: Tx, planId: string) =>
  tx
    .select()
    .from(planGorevleri)
    .where(eq(planGorevleri.plan_id, planId))
    .orderBy(asc(planGorevleri.gun), asc(planGorevleri.sira), asc(planGorevleri.id));

/** Gerceklesen miktara gore durum: `>=hedef` tamam, `0<x<hedef` kismen, `0` yapilmadi. */
export function durumHesapla(hedef: number, gerceklesen: number | null): PlanGorevDurumu {
  if (gerceklesen === null) return 'bekliyor';
  if (gerceklesen >= hedef) return 'tamam';
  return gerceklesen > 0 ? 'kismen' : 'yapilmadi';
}

// --- Kapsam ----------------------------------------------------------------------------------

/**
 * Ogrenci kimligi sutunu icin okuma/yazma kapsami (ADR 0004). Kapsam disi kayit 404.
 * - `kurum`: tumu; `sube`: subedeki ogrenciler ya da subedeki gruplarin uyeleri
 * - `grup` (ogretmen): atandigi gruplardaki etkin uyeler; `kendi`: yalniz kendisi
 */
export function ogrenciKosulu(tx: Tx, y: YetkiBaglami, kolon: AnyPgColumn): SQL | undefined {
  const grupUyeleriSorgusu = () =>
    tx
      .select({ id: grupUyeleri.ogrenci_id })
      .from(grupUyeleri)
      .where(
        and(
          isNull(grupUyeleri.bitis_tarihi),
          inArray(grupUyeleri.grup_id, kapsamdakiGruplar(tx, y)),
        ),
      );
  switch (y.kapsam) {
    case 'kurum':
      return undefined;
    case 'kendi':
      return eq(kolon, y.uyelikId);
    case 'sube':
      return or(
        inArray(
          kolon,
          tx
            .select({ id: uyelikler.id })
            .from(uyelikler)
            .where(eq(uyelikler.sube_id, y.subeId ?? SIFIR_UUID)),
        ),
        inArray(kolon, grupUyeleriSorgusu()),
      );
    case 'grup':
      return inArray(kolon, grupUyeleriSorgusu());
  }
}

/** Kapsamdaki etkin ogrenci (kapsam disi ya da ogrenci degil = 404). */
export async function ogrenciBul(tx: Tx, y: YetkiBaglami, ogrenciId: string, aktifOlmali = true) {
  const [u] = await tx
    .select({ id: uyelikler.id, kademe_id: uyelikler.kademe_id })
    .from(uyelikler)
    .where(
      and(
        eq(uyelikler.id, ogrenciId),
        eq(uyelikler.kurum_id, y.kurumId),
        eq(uyelikler.rol, 'ogrenci'),
        aktifOlmali ? eq(uyelikler.durum, 'aktif') : undefined,
        ogrenciKosulu(tx, y, uyelikler.id),
      ),
    );
  if (!u) throw ogrenciBulunamadi();
  return u;
}

/**
 * `haftalik_plan` modulu ogrencinin kademesinde ya da (yazma yapanin kapsamindaki) gruplarinin
 * hepsinde kapaliysa 403 `modul_kapali`. Birden cok grup varsa en az biri aciksa yazilabilir.
 */
export async function planModuluAcikOlmali(
  tx: Tx,
  y: YetkiBaglami,
  ogrenciId: string,
): Promise<void> {
  const [u] = await tx
    .select({ kademe_id: uyelikler.kademe_id })
    .from(uyelikler)
    .where(eq(uyelikler.id, ogrenciId));
  const kademeId = u?.kademe_id ?? null;
  const kapali = () =>
    new AppError(403, errorCodes.modulKapali, 'Haftalık plan bu öğrencide kapalı.');
  if (!(await modulAcikMi(tx, y.kurumId, 'haftalik_plan', { kademeId }))) throw kapali();
  const gruplar = await tx
    .select({ id: grupUyeleri.grup_id })
    .from(grupUyeleri)
    .where(
      and(
        eq(grupUyeleri.ogrenci_id, ogrenciId),
        isNull(grupUyeleri.bitis_tarihi),
        y.kapsam === 'kurum' || y.kapsam === 'kendi'
          ? undefined
          : inArray(grupUyeleri.grup_id, kapsamdakiGruplar(tx, y)),
      ),
    );
  if (gruplar.length === 0) return;
  for (const g of gruplar) {
    if (await modulAcikMi(tx, y.kurumId, 'haftalik_plan', { kademeId, grupId: g.id })) return;
  }
  throw kapali();
}

// --- Bulma -----------------------------------------------------------------------------------

/** Kapsamdaki plan (kapsam disi = 404). `kilit`: satiri `FOR UPDATE` ile kilitler. */
export async function planBul(tx: Tx, y: YetkiBaglami, planId: string, kilit = false) {
  const sorgu = tx
    .select()
    .from(haftalikPlanlar)
    .where(
      and(
        eq(haftalikPlanlar.id, planId),
        eq(haftalikPlanlar.kurum_id, y.kurumId),
        ogrenciKosulu(tx, y, haftalikPlanlar.ogrenci_id),
      ),
    );
  const [p] = await (kilit ? sorgu.for('update') : sorgu);
  if (!p) throw planBulunamadi();
  return p;
}

/** Ogrencinin kendi plani: yalniz `yayinda` olan gorunur (taslak = 404). */
export async function ogrenciPlaniBul(tx: Tx, y: YetkiBaglami, planId: string) {
  const [p] = await tx
    .select()
    .from(haftalikPlanlar)
    .where(
      and(
        eq(haftalikPlanlar.id, planId),
        eq(haftalikPlanlar.kurum_id, y.kurumId),
        eq(haftalikPlanlar.ogrenci_id, y.uyelikId),
        eq(haftalikPlanlar.durum, 'yayinda'),
      ),
    );
  if (!p) throw planBulunamadi();
  return p;
}

/** Yazilacak plan: kapsam, modul ve hafta kilidi birlikte denetlenir. */
export async function yazilacakPlanBul(tx: Tx, y: YetkiBaglami, planId: string) {
  const p = await planBul(tx, y, planId, true);
  await planModuluAcikOlmali(tx, y, p.ogrenci_id);
  haftaYazilabilirOlmali(p.hafta_baslangic);
  return p;
}

/** Kapsamdaki gorev ve plani (kapsam disi = 404). */
export async function gorevBul(tx: Tx, y: YetkiBaglami, gorevId: string, kilit = false) {
  const sorgu = tx
    .select()
    .from(planGorevleri)
    .where(
      and(
        eq(planGorevleri.id, gorevId),
        eq(planGorevleri.kurum_id, y.kurumId),
        ogrenciKosulu(tx, y, planGorevleri.ogrenci_id),
      ),
    );
  const [g] = await (kilit ? sorgu.for('update') : sorgu);
  if (!g) throw gorevBulunamadi();
  const [plan] = await tx.select().from(haftalikPlanlar).where(eq(haftalikPlanlar.id, g.plan_id));
  if (!plan) throw gorevBulunamadi();
  return { gorev: g, plan };
}

/**
 * Ogrencinin haftadaki plani yoksa acar (`ON CONFLICT DO NOTHING`; es zamanli cagrilarda tek plan).
 * `yeni`: bu cagrida olustu mu.
 */
export async function planiAcYadaGetir(
  tx: Tx,
  y: YetkiBaglami,
  ogrenciId: string,
  hafta: string,
  secenek: { durum: 'taslak' | 'yayinda'; not?: string | null },
): Promise<{ plan: PlanSatiri; yeni: boolean }> {
  const [eklenen] = await tx
    .insert(haftalikPlanlar)
    .values({
      id: uuidv7(),
      kurum_id: y.kurumId,
      created_by: y.kullaniciId,
      ogrenci_id: ogrenciId,
      hafta_baslangic: hafta,
      hazirlayan_id: y.uyelikId,
      durum: secenek.durum,
      yayin_at: secenek.durum === 'yayinda' ? new Date() : null,
      not: secenek.not ?? null,
    })
    .onConflictDoNothing({
      target: [
        haftalikPlanlar.kurum_id,
        haftalikPlanlar.ogrenci_id,
        haftalikPlanlar.hafta_baslangic,
      ],
    })
    .returning();
  if (eklenen) return { plan: eklenen, yeni: true };
  const [mevcut] = await tx
    .select()
    .from(haftalikPlanlar)
    .where(
      and(
        eq(haftalikPlanlar.kurum_id, y.kurumId),
        eq(haftalikPlanlar.ogrenci_id, ogrenciId),
        eq(haftalikPlanlar.hafta_baslangic, hafta),
      ),
    );
  if (!mevcut) throw new Error('plan açılamadı');
  return { plan: mevcut, yeni: false };
}

export interface GorevGirdisi {
  gun: string;
  brans_kodu: string;
  konu_id?: string | undefined;
  baslik?: string | undefined;
  hedef_turu: 'soru' | 'dakika';
  hedef_miktar: number;
  sira: number;
}

/** Planlara ayni gorev listesini toplu ekler (500 luk parcalarla). Plan basina `girdiler` kopyalanir. */
export async function gorevleriEkle(
  tx: Tx,
  y: YetkiBaglami,
  planlar: readonly PlanSatiri[],
  girdiler: readonly GorevGirdisi[],
): Promise<GorevSatiri[]> {
  const satirlar = planlar.flatMap((plan) =>
    girdiler.map((g) => ({
      id: uuidv7(),
      kurum_id: y.kurumId,
      created_by: y.kullaniciId,
      plan_id: plan.id,
      ogrenci_id: plan.ogrenci_id,
      hafta_baslangic: plan.hafta_baslangic,
      gun: g.gun,
      brans_kodu: g.brans_kodu,
      konu_id: g.konu_id ?? null,
      baslik: g.baslik ?? null,
      hedef_turu: g.hedef_turu,
      hedef_miktar: g.hedef_miktar,
      sira: g.sira,
      ekleyen_id: y.uyelikId,
    })),
  );
  const eklenen: GorevSatiri[] = [];
  for (let i = 0; i < satirlar.length; i += PLAN_TOPLU_PARCA_BOYUTU) {
    eklenen.push(
      ...(await tx
        .insert(planGorevleri)
        .values(satirlar.slice(i, i + PLAN_TOPLU_PARCA_BOYUTU))
        .returning()),
    );
  }
  return eklenen;
}

export async function gorevSayisi(tx: Tx, planId: string): Promise<number> {
  const satirlar = await tx
    .select({ id: planGorevleri.id })
    .from(planGorevleri)
    .where(eq(planGorevleri.plan_id, planId))
    .limit(1);
  return satirlar.length;
}

// --- Olay ------------------------------------------------------------------------------------

/**
 * `ogrenme.plan_gorevi.guncellendi.v1`: yalniz `gerceklesen_miktar` ya da `durum` degistiyse, ayni
 * islemde outbox. Olayda ad, telefon, e-posta, baslik ve not yoktur.
 */
export async function gorevOlayiYaz(
  tx: Tx,
  baglam: OdevOlayBaglami,
  once: GorevSatiri,
  sonra: GorevSatiri,
): Promise<boolean> {
  if (once.gerceklesen_miktar === sonra.gerceklesen_miktar && once.durum === sonra.durum) {
    return false;
  }
  await publishInTx(
    tx,
    ogrenmePlanGoreviGuncellendiV1.create({
      ...baglam,
      data: {
        gorev_id: sonra.id,
        plan_id: sonra.plan_id,
        ogrenci_id: sonra.ogrenci_id,
        hafta_baslangic: sonra.hafta_baslangic,
        gun: sonra.gun,
        brans_kodu: sonra.brans_kodu,
        hedef_turu: sonra.hedef_turu as PlanGorevi['hedef_turu'],
        hedef_miktar: sonra.hedef_miktar,
        gerceklesen_miktar: sonra.gerceklesen_miktar,
        onceki_gerceklesen_miktar: once.gerceklesen_miktar,
        durum: sonra.durum as PlanGorevDurumu,
        onceki_durum: once.durum as PlanGorevDurumu,
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
  return true;
}

// --- Denetim ---------------------------------------------------------------------------------

/** Yazma eylemi denetim kaydi (kisisel veri ve serbest metin yok: yalniz kimlik, sayi, durum). */
export async function planDenetimiYaz(
  tx: Tx,
  y: YetkiBaglami,
  ip: string,
  eylem: string,
  hedefTuru: 'haftalik_plan' | 'plan_gorevi' | 'plan_sablonu' | 'grup',
  hedefId: string,
  once: Record<string, unknown> | null,
  sonra: Record<string, unknown>,
): Promise<void> {
  await tx.insert(denetimKayitlari).values({
    id: uuidv7(),
    kurum_id: y.kurumId,
    created_by: y.kullaniciId,
    aktor_kullanici_id: y.kullaniciId,
    aktor_uyelik_id: y.uyelikId,
    eylem,
    hedef_turu: hedefTuru,
    hedef_id: hedefId,
    once,
    sonra,
    ip,
  });
}

/** Ogrenci rolu disindakiler ogrenci uclarini kullanamaz. */
export function ogrenciOlmali(y: YetkiBaglami): void {
  if (y.rol !== 'ogrenci') {
    throw new AppError(403, errorCodes.izinYok, 'Bu uç yalnızca öğrenciler içindir.');
  }
}

// --- Sablon ----------------------------------------------------------------------------------

export type SablonSatiri = typeof planSablonlari.$inferSelect;
export type SablonGorevSatiri = typeof planSablonGorevleri.$inferSelect;

export const sablonBulunamadi = () => new AppError(404, errorCodes.notFound, 'Şablon bulunamadı.');

export function sablonYaniti(s: SablonSatiri, gorevler: readonly SablonGorevSatiri[]): PlanSablonu {
  return {
    id: s.id,
    ogretmen_id: s.ogretmen_id,
    ad: s.ad,
    aciklama: s.aciklama,
    gorevler: gorevler
      .filter((g) => g.sablon_id === s.id)
      .sort((a, b) => a.gun_sirasi - b.gun_sirasi || a.sira - b.sira || a.id.localeCompare(b.id))
      .map((g) => ({
        id: g.id,
        gun_sirasi: g.gun_sirasi,
        brans_kodu: g.brans_kodu,
        konu_id: g.konu_id,
        baslik: g.baslik,
        hedef_turu: g.hedef_turu as PlanGorevi['hedef_turu'],
        hedef_miktar: g.hedef_miktar,
        sira: g.sira,
      })),
    created_at: s.created_at.toISOString(),
  };
}

/** Yalniz kendi sablonu (baskasinin sablonu ya da yoksa 404). */
export async function kendiSablonu(tx: Tx, y: YetkiBaglami, sablonId: string) {
  const [s] = await tx
    .select()
    .from(planSablonlari)
    .where(
      and(
        eq(planSablonlari.id, sablonId),
        eq(planSablonlari.kurum_id, y.kurumId),
        eq(planSablonlari.ogretmen_id, y.uyelikId),
      ),
    );
  if (!s) throw sablonBulunamadi();
  const gorevler = await tx
    .select()
    .from(planSablonGorevleri)
    .where(eq(planSablonGorevleri.sablon_id, s.id));
  return { sablon: s, gorevler };
}

/** Sablon gorevlerini haftaya oturtur (`gun = hafta + gun_sirasi`). */
export const sablondanGorevler = (
  hafta: string,
  gorevler: readonly {
    gun_sirasi: number;
    brans_kodu: string;
    konu_id?: string | null | undefined;
    baslik?: string | null | undefined;
    hedef_turu: string;
    hedef_miktar: number;
    sira: number;
  }[],
): GorevGirdisi[] =>
  gorevler.map((g) => ({
    gun: tarihEkle(hafta, g.gun_sirasi),
    brans_kodu: g.brans_kodu,
    konu_id: g.konu_id ?? undefined,
    baslik: g.baslik ?? undefined,
    hedef_turu: g.hedef_turu as 'soru' | 'dakika',
    hedef_miktar: g.hedef_miktar,
    sira: g.sira,
  }));

// --- Ozet ------------------------------------------------------------------------------------

/**
 * Ders (brans) bazinda planlanan/gerceklesen; soru ve dakika ayri toplanir (birbirine eklenmez).
 * `devredildi` gorev icin planlanan yalniz yapilan kisimdir (kalani sonraki gunun gorevinde sayilir);
 * gorev sayisina `devredildi` girmez.
 */
export function ozetHesapla(plan: PlanSatiri, gorevler: readonly GorevSatiri[]): PlanOzeti {
  const bos = () => ({
    soru: { planlanan: 0, gerceklesen: 0 },
    dakika: { planlanan: 0, gerceklesen: 0 },
    gorev_sayisi: 0,
    tamam_sayisi: 0,
  });
  const dersler = new Map<string, ReturnType<typeof bos>>();
  const toplam = bos();
  for (const g of gorevler) {
    const d = dersler.get(g.brans_kodu) ?? bos();
    dersler.set(g.brans_kodu, d);
    const yapilan = g.gerceklesen_miktar ?? 0;
    const planlanan = g.durum === 'devredildi' ? yapilan : g.hedef_miktar;
    const tur = g.hedef_turu === 'dakika' ? 'dakika' : 'soru';
    for (const hedef of [d, toplam]) {
      hedef[tur].planlanan += planlanan;
      hedef[tur].gerceklesen += yapilan;
      if (g.durum !== 'devredildi') hedef.gorev_sayisi += 1;
      if (g.durum === 'tamam') hedef.tamam_sayisi += 1;
    }
  }
  return {
    plan_id: plan.id,
    ogrenci_id: plan.ogrenci_id,
    hafta_baslangic: plan.hafta_baslangic,
    dersler: [...dersler.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([brans_kodu, d]) => ({ brans_kodu, ...d })),
    toplam,
  };
}
