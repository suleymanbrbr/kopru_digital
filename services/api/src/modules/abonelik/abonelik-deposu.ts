import {
  AbonelikDurumSema,
  AbonelikKaynakSema,
  errorCodes,
  PeriyotSema,
  PlanLimitleriSema,
  type AboneligiTipi,
  type PlanLimitiDetay,
  type PlanLimitleri,
  type AbonelikPlanTipi,
  type SayimLimiti,
} from '@kopru/contracts';
import { AppError, type Tx } from '@kopru/service-kit';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { abonelikler, planlar, uyelikler } from '../../db/schema.js';
import {
  ETKIN_DURUMLAR,
  KILIT_DURUMLARI,
  LIMIT_ROLLERI,
  UCRETSIZ_KATMAN,
  kilitAl,
  sinirOlarak,
} from './ortak.js';

export type PlanSatiri = typeof planlar.$inferSelect;
export type AbonelikSatiri = typeof abonelikler.$inferSelect;

export interface AbonelikVePlan {
  abonelik: AbonelikSatiri;
  plan: PlanSatiri;
}

const etkinMi = (durum: string): boolean => (ETKIN_DURUMLAR as readonly string[]).includes(durum);

/** Plan satirindaki `limitler` jsonb'si; eksik/bozuk anahtar ucretsiz katman degerine duser. */
export function planLimitleri(plan: Pick<PlanSatiri, 'limitler'>): PlanLimitleri {
  const ham = typeof plan.limitler === 'object' && plan.limitler !== null ? plan.limitler : {};
  const sonuc = PlanLimitleriSema.safeParse({ ...UCRETSIZ_KATMAN, ...ham });
  return sonuc.success ? sonuc.data : UCRETSIZ_KATMAN;
}

export function planYaniti(plan: PlanSatiri): AbonelikPlanTipi {
  return {
    id: plan.id,
    kod: plan.kod,
    surum: plan.surum,
    ad: plan.ad,
    kurum_turu: plan.kurum_turu as AbonelikPlanTipi['kurum_turu'],
    aylik_fiyat_kurus: plan.aylik_fiyat_kurus,
    yillik_fiyat_kurus: plan.yillik_fiyat_kurus,
    kdv_orani: plan.kdv_orani,
    limitler: planLimitleri(plan),
    moduller: plan.moduller,
  };
}

/** Kurumun etkin aboneligi; yoksa en son abonelik (askida/iptal/sona_erdi gosterimi icin). */
export async function guncelAbonelik(tx: Tx, kurumId: string): Promise<AbonelikVePlan | null> {
  const [satir] = await tx
    .select({ abonelik: abonelikler, plan: planlar })
    .from(abonelikler)
    .innerJoin(planlar, eq(planlar.id, abonelikler.plan_id))
    .where(eq(abonelikler.kurum_id, kurumId))
    .orderBy(
      desc(sql`(${abonelikler.durum} in ('deneme', 'aktif', 'odeme_bekliyor', 'ek_sure'))`),
      desc(abonelikler.created_at),
      desc(abonelikler.id),
    )
    .limit(1);
  return satir ?? null;
}

/** Yazma kilitli mi (`askida` / `sona_erdi`)? Etkin abonelik yoksa ve en son abonelik kilitli durumdaysa. */
export async function yazmaKilitliMi(tx: Tx, kurumId: string): Promise<boolean> {
  const guncel = await guncelAbonelik(tx, kurumId);
  return guncel !== null && (KILIT_DURUMLARI as readonly string[]).includes(guncel.abonelik.durum);
}

/** Etkin abonelik varsa plani, yoksa ucretsiz katman (docs/schema/api.md: "etkin abonelik yoksa limitler ucretsiz"). */
export async function gecerliLimitler(tx: Tx, kurumId: string): Promise<PlanLimitleri> {
  const guncel = await guncelAbonelik(tx, kurumId);
  return guncel && etkinMi(guncel.abonelik.durum) ? planLimitleri(guncel.plan) : UCRETSIZ_KATMAN;
}

/**
 * Soru kotasi kancasi (`ogrenme/soru-ortak.ts`): planin ogrenci basina aylik soru ust siniri.
 * `null` = sinirsiz. Kiraci baglami (RLS) icindeki islemde cagrilir.
 */
export async function planAylikUstSiniri(tx: Tx, kurumId: string): Promise<number | null> {
  return sinirOlarak((await gecerliLimitler(tx, kurumId)).soru_aylik_ogrenci);
}

/** Etkin ogrenci / ogretmen sayisi (ayni kullanici ayni rolde bir kez sayilir). */
export async function kullanimSayilari(
  tx: Tx,
  kurumId: string,
): Promise<{ ogrenci: number; ogretmen: number }> {
  const [satir] = await tx
    .select({
      ogrenci: sql<string>`count(distinct ${uyelikler.kullanici_id}) filter (where ${uyelikler.rol} = 'ogrenci')`,
      ogretmen: sql<string>`count(distinct ${uyelikler.kullanici_id}) filter (where ${uyelikler.rol} = 'ogretmen')`,
    })
    .from(uyelikler)
    .where(and(eq(uyelikler.kurum_id, kurumId), eq(uyelikler.durum, 'aktif')));
  return { ogrenci: Number(satir?.ogrenci ?? 0), ogretmen: Number(satir?.ogretmen ?? 0) };
}

export const abonelikGerekli = () =>
  new AppError(
    402,
    errorCodes.abonelikGerekli,
    'Aboneliğiniz askıda; devam etmek için aboneliği yenileyin.',
  );

/** Kontrol sirasi adim 4: kilitli kurumda yazma `402 abonelik_gerekli`. */
export async function yazmaKapisi(tx: Tx, kurumId: string): Promise<void> {
  if (await yazmaKilitliMi(tx, kurumId)) throw abonelikGerekli();
}

export const planLimitiHatasi = (detay: PlanLimitiDetay) =>
  new AppError(
    402,
    errorCodes.planLimiti,
    detay.limit === 'max_ogrenci'
      ? `Planınızın öğrenci sınırına (${String(detay.ust_sinir)}) ulaştınız. Yeni öğrenci eklemek için planınızı yükseltin.`
      : `Planınızın öğretmen sınırına (${String(detay.ust_sinir)}) ulaştınız. Yeni öğretmen eklemek için planınızı yükseltin.`,
    detay,
  );

/**
 * Yeni etkin uye eklemeden once cagrilir (davet kabul, sinif kodu onayi, yeniden etkinlestirme). Kurum basina
 * advisory kilitle es zamanli eklemelerde limit asilmaz. `ek` kadar yeni uye eklenecekse `mevcut + ek` ust
 * siniri asmamalidir. Mevcut veri asla silinmez: asim durumunda yalniz yeni ekleme reddedilir.
 */
export async function planLimitiniDenetle(
  tx: Tx,
  kurumId: string,
  limit: SayimLimiti,
  ek = 1,
): Promise<void> {
  await kilitAl(tx, `abonelik:limit:${kurumId}`);
  const sinir = sinirOlarak((await gecerliLimitler(tx, kurumId))[limit]);
  if (sinir === null) return;
  const sayilar = await kullanimSayilari(tx, kurumId);
  const mevcut = sayilar[LIMIT_ROLLERI[limit]];
  if (mevcut + ek > sinir) {
    throw planLimitiHatasi({ limit, mevcut, ust_sinir: sinir });
  }
}

/** Plan degisikliginde yeni planin limiti mevcut kullanimin altinda mi? (bilgi amacli; veri silinmez) */
export async function limitAsimlari(
  tx: Tx,
  kurumId: string,
  limitler: PlanLimitleri,
): Promise<PlanLimitiDetay[]> {
  const sayilar = await kullanimSayilari(tx, kurumId);
  const asimlar: PlanLimitiDetay[] = [];
  for (const limit of ['max_ogrenci', 'max_ogretmen'] as const) {
    const sinir = sinirOlarak(limitler[limit]);
    const mevcut = sayilar[LIMIT_ROLLERI[limit]];
    if (sinir !== null && mevcut > sinir) asimlar.push({ limit, mevcut, ust_sinir: sinir });
  }
  return asimlar;
}

/** Kurum turune uygun, aktif planlar (kod basina en yuksek surum). */
export async function aktifPlanlar(tx: Tx, kurumTuru: string): Promise<PlanSatiri[]> {
  const satirlar = await tx
    .select()
    .from(planlar)
    .where(and(eq(planlar.kurum_turu, kurumTuru), eq(planlar.aktif, true)))
    .orderBy(asc(planlar.aylik_fiyat_kurus), asc(planlar.kod), desc(planlar.surum));
  const goruldu = new Set<string>();
  return satirlar.filter((p) => !goruldu.has(p.kod) && goruldu.add(p.kod));
}

/** Koda gore aktif plan (en yuksek surum). */
export async function planBul(tx: Tx, kod: string): Promise<PlanSatiri | null> {
  const [plan] = await tx
    .select()
    .from(planlar)
    .where(and(eq(planlar.kod, kod), eq(planlar.aktif, true)))
    .orderBy(desc(planlar.surum))
    .limit(1);
  return plan ?? null;
}

export function abonelikYaniti(
  satir: AbonelikVePlan,
  bekleyenPlanKodu: string | null,
): AboneligiTipi {
  const { abonelik: a, plan } = satir;
  return {
    id: a.id,
    plan: planYaniti(plan),
    kaynak: AbonelikKaynakSema.parse(a.kaynak),
    durum: AbonelikDurumSema.parse(a.durum),
    periyot: PeriyotSema.parse(a.periyot),
    donem_baslangic_at: a.donem_baslangic_at.toISOString(),
    donem_bitis_at: a.donem_bitis_at.toISOString(),
    deneme_bitis_at: a.deneme_bitis_at?.toISOString() ?? null,
    ek_sure_bitis_at: a.ek_sure_bitis_at?.toISOString() ?? null,
    otomatik_yenileme: a.otomatik_yenileme,
    iptal_istendi_at: a.iptal_istendi_at?.toISOString() ?? null,
    fiyat_kurus: a.fiyat_kurus,
    bekleyen_plan_kodu: bekleyenPlanKodu,
    bekleyen_periyot: a.bekleyen_periyot === null ? null : PeriyotSema.parse(a.bekleyen_periyot),
  };
}

/** Bekleyen plan kodunu cozerek abonelik yanitini uretir. */
export async function abonelikYanitiUret(tx: Tx, satir: AbonelikVePlan): Promise<AboneligiTipi> {
  let bekleyen: string | null = null;
  if (satir.abonelik.bekleyen_plan_id) {
    const [p] = await tx
      .select({ kod: planlar.kod })
      .from(planlar)
      .where(eq(planlar.id, satir.abonelik.bekleyen_plan_id));
    bekleyen = p?.kod ?? null;
  }
  return abonelikYaniti(satir, bekleyen);
}
