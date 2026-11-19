import {
  abonelikAbonelikDegistiV1,
  abonelikHataKodlari,
  errorCodes,
  hesapKurumDegistiV1,
  type AbonelikKaynak,
  type Actor,
  type Periyot,
} from '@kopru/contracts';
import { AppError, publishInTx, type Tx } from '@kopru/service-kit';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { abonelikler, kurumlar, planlar } from '../../db/schema.js';
import {
  planBul,
  planLimitleri,
  type AbonelikSatiri,
  type AbonelikVePlan,
  type PlanSatiri,
} from './abonelik-deposu.js';
import { gecisZinciri } from './durum-makinesi.js';
import {
  ASKIDAN_SONA_ERME_GUN,
  DENEME_GUN,
  DENEME_PLAN_KODU,
  ETKIN_DURUMLAR,
  KILIT_DURUMLARI,
  OUTBOX_TABLOSU,
  gunEkle,
  kilitAl,
} from './ortak.js';

export interface OlayBaglami {
  actor: Actor;
  correlationId: string;
}

export const ZAMANLAYICI_AKTORU: Actor = { tur: 'sistem', id: 'abonelik-zamanlayici' };

export const fiyatSec = (plan: PlanSatiri, periyot: Periyot): number =>
  periyot === 'yillik'
    ? (plan.yillik_fiyat_kurus ?? plan.aylik_fiyat_kurus * 12)
    : plan.aylik_fiyat_kurus;

/** `abonelik.abonelik.degisti.v1`: kaydin tam guncel durumu, ayni islemde outbox'a. Kisisel veri yok. */
export async function abonelikDegistiYaz(
  tx: Tx,
  satir: AbonelikVePlan,
  baglam: OlayBaglami,
): Promise<void> {
  const { abonelik: a, plan } = satir;
  const olay = abonelikAbonelikDegistiV1.create({
    kurumId: a.kurum_id,
    actor: baglam.actor,
    correlationId: baglam.correlationId,
    data: {
      abonelik_id: a.id,
      kaynak: a.kaynak as AbonelikKaynak,
      durum: a.durum as 'deneme',
      periyot: a.periyot as Periyot,
      plan_kodu: plan.kod,
      plan_surumu: plan.surum,
      donem_bitis_at: a.donem_bitis_at.toISOString(),
      ek_sure_bitis_at: a.ek_sure_bitis_at?.toISOString() ?? null,
      iptal_istendi_at: a.iptal_istendi_at?.toISOString() ?? null,
      limitler: planLimitleri(plan),
      moduller: plan.moduller,
    },
  });
  await publishInTx(tx, olay, { table: OUTBOX_TABLOSU });
}

/**
 * `hesap.kurumlar.durum` aboneligi yansitir: `askida`/`sona_erdi` -> `askida`, odeme gelince `aktif`.
 * Yalniz beklenen onceki durumdan gecer (`kapali` kuruma dokunmaz). Platform elle askiya almissa
 * (`platform_askida_at` dolu) `aktif` yapmaz: abonelik isi platform askisini kaldiramaz. `hesap.kurum.degisti` olayi yayimlanir.
 */
export async function kurumDurumunuEsitle(
  tx: Tx,
  kurumId: string,
  hedef: 'aktif' | 'askida',
  baglam: OlayBaglami,
): Promise<boolean> {
  const [k] = await tx
    .update(kurumlar)
    .set({ durum: hedef })
    .where(
      and(
        eq(kurumlar.id, kurumId),
        eq(kurumlar.durum, hedef === 'askida' ? 'aktif' : 'askida'),
        // Platform askisi (0018): odeme/aktivasyon bu kurumu yeniden acamaz; yalniz platform acar.
        ...(hedef === 'aktif' ? [isNull(kurumlar.platform_askida_at)] : []),
      ),
    )
    .returning();
  if (!k) return false;
  await publishInTx(
    tx,
    hesapKurumDegistiV1.create({
      kurumId,
      actor: baglam.actor,
      correlationId: baglam.correlationId,
      data: {
        kurum_id: k.id,
        ad: k.ad,
        tur: k.tur as 'bireysel',
        saat_dilimi: k.saat_dilimi,
        durum: hedef,
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
  return true;
}

export async function satiriPlanlaGetir(tx: Tx, abonelikId: string): Promise<AbonelikVePlan> {
  const [satir] = await tx
    .select({ abonelik: abonelikler, plan: planlar })
    .from(abonelikler)
    .innerJoin(planlar, eq(planlar.id, abonelikler.plan_id))
    .where(eq(abonelikler.id, abonelikId));
  if (!satir) throw new Error('abonelik okunamadı');
  return satir;
}

export interface DenemeBaslatGirdisi extends OlayBaglami {
  kurumId: string;
  kurumTuru: 'bireysel' | 'ekip' | 'kurum';
  kullaniciId?: string | null;
  simdi?: Date;
}

/**
 * Yeni kurum icin 14 gunluk deneme (kart istemeden). Kurum olusturma islemi (`api_sistem`) icinde cagrilir;
 * plan kurum turune gore varsayilandir. Ucretsizdir, otomatik yenilenmez.
 */
export async function denemeBaslat(tx: Tx, girdi: DenemeBaslatGirdisi): Promise<AbonelikVePlan> {
  const plan = await planBul(tx, DENEME_PLAN_KODU[girdi.kurumTuru]);
  if (!plan) throw new Error(`deneme planı bulunamadı: ${DENEME_PLAN_KODU[girdi.kurumTuru]}`);
  const simdi = girdi.simdi ?? new Date();
  const bitis = gunEkle(simdi, DENEME_GUN);
  const id = uuidv7();
  await tx.insert(abonelikler).values({
    id,
    kurum_id: girdi.kurumId,
    created_by: girdi.kullaniciId ?? null,
    plan_id: plan.id,
    kaynak: 'deneme',
    durum: 'deneme',
    periyot: 'aylik',
    donem_baslangic_at: simdi,
    donem_bitis_at: bitis,
    deneme_bitis_at: bitis,
    otomatik_yenileme: false,
    fiyat_kurus: 0,
  });
  const satir = await satiriPlanlaGetir(tx, id);
  await abonelikDegistiYaz(tx, satir, girdi);
  return satir;
}

export interface AktiflestirGirdisi extends OlayBaglami {
  kurumId: string;
  planKodu: string;
  kaynak: Exclude<AbonelikKaynak, 'deneme'>;
  periyot: Periyot;
  donemBaslangicAt: Date;
  donemBitisAt: Date;
  /** Anlasilan fiyat (kuruş); verilmezse plan fiyati. */
  fiyatKurus?: number;
  otomatikYenileme?: boolean;
  disAbonelikId?: string | null;
  disMusteriId?: string | null;
  /** `kaynak='kurumsal'` icin zorunlu. */
  kurumsalSozlesmeNo?: string | null;
  kullaniciId?: string | null;
}

/**
 * Aboneligi `aktif` yapar (odeme alindi ya da kurumsal elle aktivasyon). Kurum basina tek etkin abonelik:
 *  - ayni kaynakta etkin abonelik varsa guncellenir (plan degisimi dahil);
 *  - farkli kaynakta ya da deneme ise eskisi `sona_erdi` olur ve yenisi ayni islemde eklenir;
 *  - `askida` kayitlar `sona_erdi` yapilir; kurum `aktif`e doner.
 * Odeme sagliyicisi webhook'lari (sonraki paket) ve platform paneli bunu kullanir; `api_sistem` islemi icinde.
 */
export async function aboneligiAktiflestir(
  tx: Tx,
  girdi: AktiflestirGirdisi,
): Promise<AbonelikVePlan> {
  if (girdi.kaynak === 'kurumsal' && !girdi.kurumsalSozlesmeNo) {
    throw new AppError(
      422,
      errorCodes.validation,
      'Kurumsal abonelik için sözleşme numarası gerekli.',
    );
  }
  if (girdi.donemBitisAt.getTime() <= girdi.donemBaslangicAt.getTime()) {
    throw new AppError(422, errorCodes.validation, 'Dönem bitişi başlangıçtan sonra olmalı.');
  }
  await kilitAl(tx, `abonelik:${girdi.kurumId}`);
  const plan = await planBul(tx, girdi.planKodu);
  if (!plan) throw new AppError(404, errorCodes.notFound, 'Plan bulunamadı.');
  const fiyat = girdi.fiyatKurus ?? fiyatSec(plan, girdi.periyot);

  const [etkin] = await tx
    .select()
    .from(abonelikler)
    .where(
      and(eq(abonelikler.kurum_id, girdi.kurumId), inArray(abonelikler.durum, [...ETKIN_DURUMLAR])),
    )
    .for('update');

  let hedefId: string;
  if (etkin?.kaynak === girdi.kaynak) {
    hedefId = etkin.id;
    await tx
      .update(abonelikler)
      .set({
        plan_id: plan.id,
        durum: 'aktif',
        periyot: girdi.periyot,
        donem_baslangic_at: girdi.donemBaslangicAt,
        donem_bitis_at: girdi.donemBitisAt,
        ek_sure_bitis_at: null,
        otomatik_yenileme: girdi.otomatikYenileme ?? true,
        iptal_istendi_at: null,
        fiyat_kurus: fiyat,
        bekleyen_plan_id: null,
        bekleyen_periyot: null,
        dis_abonelik_id: girdi.disAbonelikId ?? etkin.dis_abonelik_id,
        dis_musteri_id: girdi.disMusteriId ?? etkin.dis_musteri_id,
        kurumsal_sozlesme_no: girdi.kurumsalSozlesmeNo ?? etkin.kurumsal_sozlesme_no,
      })
      .where(eq(abonelikler.id, etkin.id));
  } else {
    if (etkin) await donemiKapat(tx, etkin, girdi);
    // Askida/iptal kalintilari: yeni abonelik baslarken eski kayit sona erer.
    const askidakiler = await tx
      .update(abonelikler)
      .set({ durum: 'sona_erdi' })
      .where(and(eq(abonelikler.kurum_id, girdi.kurumId), eq(abonelikler.durum, 'askida')))
      .returning({ id: abonelikler.id });
    for (const s of askidakiler) {
      await abonelikDegistiYaz(tx, await satiriPlanlaGetir(tx, s.id), girdi);
    }
    hedefId = uuidv7();
    await tx.insert(abonelikler).values({
      id: hedefId,
      kurum_id: girdi.kurumId,
      created_by: girdi.kullaniciId ?? null,
      plan_id: plan.id,
      kaynak: girdi.kaynak,
      durum: 'aktif',
      periyot: girdi.periyot,
      donem_baslangic_at: girdi.donemBaslangicAt,
      donem_bitis_at: girdi.donemBitisAt,
      otomatik_yenileme: girdi.otomatikYenileme ?? true,
      fiyat_kurus: fiyat,
      dis_abonelik_id: girdi.disAbonelikId ?? null,
      dis_musteri_id: girdi.disMusteriId ?? null,
      kurumsal_sozlesme_no: girdi.kurumsalSozlesmeNo ?? null,
    });
  }
  const satir = await satiriPlanlaGetir(tx, hedefId);
  await abonelikDegistiYaz(tx, satir, girdi);
  await kurumDurumunuEsitle(tx, girdi.kurumId, 'aktif', girdi);
  return satir;
}

/** Kaynak degisiminde eski etkin kaydi bitirir (`sona_erdi`) ve olayini yazar. */
async function donemiKapat(tx: Tx, eski: AbonelikSatiri, baglam: OlayBaglami): Promise<void> {
  await tx.update(abonelikler).set({ durum: 'sona_erdi' }).where(eq(abonelikler.id, eski.id));
  await abonelikDegistiYaz(tx, await satiriPlanlaGetir(tx, eski.id), baglam);
}

export interface GecisOzeti {
  /** Durumu degisen abonelik sayisi. */
  gecis: number;
  /** Kurumu `askida` yapilan sayisi. */
  askiyaAlinan: number;
  /** Bu cagrida islenen aday sayisi (sayfa dolduysa tekrar cagrilmalidir). */
  taranan: number;
}

/** Bir calismada islenen en fazla abonelik (kalan sonraki calismaya). */
export const GECIS_SAYFA = 500;

/**
 * Saatlik zamanlayici govdesi: vadesi gelen abonelikleri `gecisZinciri` ile ilerletir; `askida`/`sona_erdi`
 * olan kurumu `askida` yapar. Idempotent: ayni durumda ikinci calisma bir sey yazmaz; coklu worker
 * guvenlidir (`for update skip locked`). `api_sistem` islemi icinde cagrilir (tum kiracilar).
 */
export async function gecisleriUygula(tx: Tx, simdi: Date = new Date()): Promise<GecisOzeti> {
  const an = sql`${simdi.toISOString()}::timestamptz`;
  const adaylar = await tx
    .select()
    .from(abonelikler)
    .where(
      or(
        and(
          inArray(abonelikler.durum, ['deneme', 'aktif', 'odeme_bekliyor']),
          sql`coalesce(${abonelikler.deneme_bitis_at}, ${abonelikler.donem_bitis_at}) <= ${an}`,
        ),
        and(eq(abonelikler.durum, 'ek_sure'), sql`${abonelikler.ek_sure_bitis_at} <= ${an}`),
        and(
          eq(abonelikler.durum, 'askida'),
          sql`coalesce(${abonelikler.ek_sure_bitis_at}, ${abonelikler.donem_bitis_at}) + make_interval(days => ${ASKIDAN_SONA_ERME_GUN}) <= ${an}`,
        ),
      ),
    )
    .orderBy(abonelikler.id)
    .limit(GECIS_SAYFA)
    .for('update', { skipLocked: true });

  const ozet: GecisOzeti = { gecis: 0, askiyaAlinan: 0, taranan: adaylar.length };
  for (const a of adaylar) {
    const zincir = gecisZinciri(
      {
        durum: a.durum as 'deneme',
        donem_bitis_at: a.donem_bitis_at,
        deneme_bitis_at: a.deneme_bitis_at,
        ek_sure_bitis_at: a.ek_sure_bitis_at,
        iptal_istendi_at: a.iptal_istendi_at,
      },
      simdi,
    );
    const son = zincir.at(-1);
    if (!son) continue;
    const ekSure = [...zincir].reverse().find((g) => g.ekSureBitisAt)?.ekSureBitisAt;
    await tx
      .update(abonelikler)
      .set({
        durum: son.yeniDurum,
        ...(ekSure ? { ek_sure_bitis_at: ekSure } : {}),
        ...(son.yeniDurum === 'iptal' || son.yeniDurum === 'sona_erdi'
          ? { otomatik_yenileme: false }
          : {}),
      })
      .where(eq(abonelikler.id, a.id));
    const baglam: OlayBaglami = { actor: ZAMANLAYICI_AKTORU, correlationId: uuidv7() };
    await abonelikDegistiYaz(tx, await satiriPlanlaGetir(tx, a.id), baglam);
    ozet.gecis += 1;
    if ((KILIT_DURUMLARI as readonly string[]).includes(son.yeniDurum)) {
      if (await kurumDurumunuEsitle(tx, a.kurum_id, 'askida', baglam)) ozet.askiyaAlinan += 1;
    }
  }
  return ozet;
}

/**
 * Otomatik yenilemeyi iptal eder: abonelik donem sonunda sona erer (`aktif` -> `iptal`); o zamana kadar
 * tam erisim surer. Tekrar cagri etkisizdir (ilk `iptal_istendi_at` korunur).
 */
export async function yenilemeyiIptalEt(
  tx: Tx,
  kurumId: string,
  baglam: OlayBaglami,
): Promise<AbonelikVePlan> {
  await kilitAl(tx, `abonelik:${kurumId}`);
  const [etkin] = await tx
    .select()
    .from(abonelikler)
    .where(and(eq(abonelikler.kurum_id, kurumId), inArray(abonelikler.durum, [...ETKIN_DURUMLAR])))
    .for('update');
  if (!etkin) {
    throw new AppError(409, abonelikHataKodlari.etkinAboneligiYok, 'Etkin bir abonelik yok.');
  }
  if (etkin.kaynak === 'apple' || etkin.kaynak === 'google') {
    throw new AppError(
      409,
      abonelikHataKodlari.magazaUzerindenYonetilir,
      'Mağaza aboneliği App Store veya Google Play üzerinden iptal edilir.',
    );
  }
  if (etkin.iptal_istendi_at === null) {
    await tx
      .update(abonelikler)
      .set({ otomatik_yenileme: false, iptal_istendi_at: sql`now()` })
      .where(eq(abonelikler.id, etkin.id));
    await abonelikDegistiYaz(tx, await satiriPlanlaGetir(tx, etkin.id), baglam);
  }
  return satiriPlanlaGetir(tx, etkin.id);
}

export interface PlanDegistirSonucu {
  satir: AbonelikVePlan;
  uygulama: 'hemen' | 'donem_sonu';
  plan: PlanSatiri;
}

/**
 * Plan degistirme istegi. Deneme sirasinda plan hemen degisir (odeme yok). Ucretli abonelikte hedef plan
 * `bekleyen_plan_id` olarak kaydedilir ve odeme/yenileme (sonraki paket) ile donem sonunda uygulanir; mevcut
 * donem ve limitler o ana kadar degismez. Kurum turune uymayan plan `404 plan_bulunamadi`.
 */
export async function planDegistirIstegi(
  tx: Tx,
  kurumId: string,
  girdi: { planKodu: string; periyot?: Periyot | undefined },
  baglam: OlayBaglami,
): Promise<PlanDegistirSonucu> {
  await kilitAl(tx, `abonelik:${kurumId}`);
  const [etkin] = await tx
    .select()
    .from(abonelikler)
    .where(and(eq(abonelikler.kurum_id, kurumId), inArray(abonelikler.durum, [...ETKIN_DURUMLAR])))
    .for('update');
  if (!etkin)
    throw new AppError(409, abonelikHataKodlari.etkinAboneligiYok, 'Etkin bir abonelik yok.');
  const [kurum] = await tx
    .select({ tur: kurumlar.tur })
    .from(kurumlar)
    .where(eq(kurumlar.id, kurumId));
  const plan = await planBul(tx, girdi.planKodu);
  if (!plan || plan.kurum_turu !== kurum?.tur) {
    throw new AppError(404, abonelikHataKodlari.planBulunamadi, 'Plan bulunamadı.');
  }
  const periyot = girdi.periyot ?? (etkin.periyot as Periyot);
  if (etkin.durum === 'deneme') {
    await tx
      .update(abonelikler)
      .set({ plan_id: plan.id, periyot, bekleyen_plan_id: null, bekleyen_periyot: null })
      .where(eq(abonelikler.id, etkin.id));
    const satir = await satiriPlanlaGetir(tx, etkin.id);
    await abonelikDegistiYaz(tx, satir, baglam);
    return { satir, uygulama: 'hemen', plan };
  }
  const ayniPlan = plan.id === etkin.plan_id && periyot === etkin.periyot;
  await tx
    .update(abonelikler)
    .set({
      bekleyen_plan_id: ayniPlan ? null : plan.id,
      bekleyen_periyot: ayniPlan ? null : periyot,
    })
    .where(eq(abonelikler.id, etkin.id));
  return { satir: await satiriPlanlaGetir(tx, etkin.id), uygulama: 'donem_sonu', plan };
}
