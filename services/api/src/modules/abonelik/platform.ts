import {
  abonelikHataKodlari,
  errorCodes,
  type AboneligiTipi,
  type PlatformAbonelikOzeti,
  type PlatformAbonelikYanit,
  type Periyot,
} from '@kopru/contracts';
import { AppError, type Database, type Tx } from '@kopru/service-kit';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { abonelikler, abonelikOdemeleri, kurumlar, planlar } from '../../db/schema.js';
import {
  platformAbonelikIslemi,
  type PlatformAbonelikBaglami,
} from '../../sistem/abonelik-sistem.js';
import {
  abonelikYanitiUret,
  guncelAbonelik,
  planBul,
  yazmaKilitliMi,
  type AbonelikVePlan,
} from './abonelik-deposu.js';
import { kurumsalAktivasyonIslemi, type KurumsalAktivasyonGirdisi } from './kurumsal.js';
import { ETKIN_DURUMLAR, gunEkle, kilitAl, sistemVeritabani } from './ortak.js';
import {
  abonelikDegistiYaz,
  kurumDurumunuEsitle,
  planDegistirIstegi,
  yenilemeyiIptalEt,
  type OlayBaglami,
} from './yazma.js';

/**
 * Platform paneli icin abonelik okuma ve duzeltme islemleri (ADR 0004; yalniz platform `yonetici`, zorunlu
 * neden, denetimli). Tablolara yalniz bu modul dokunur; platform uclari (`hesap/platform`) bu dosyadaki
 * fonksiyonlari `abonelik/index.ts` uzerinden cagirir. Her islem `api_sistem` isleminde, kurum basina
 * advisory kilitle ve `abonelik.abonelik.degisti.v1` olayiyla yapilir.
 */

type KurumDurumu = 'aktif' | 'askida' | 'kapali';

const GECMIS_LIMITI = 50;

const celiski = (mesaj: string) => new AppError(409, errorCodes.conflict, mesaj);

/** Kurum detayi icin kisa ozet (ayni islemde okunur). */
export async function platformAbonelikOzeti(
  tx: Tx,
  kurumId: string,
): Promise<PlatformAbonelikOzeti> {
  const guncel = await guncelAbonelik(tx, kurumId);
  return {
    abonelik: guncel ? await abonelikYanitiUret(tx, guncel) : null,
    yazma_kilitli: await yazmaKilitliMi(tx, kurumId),
  };
}

/** Abonelik gecmisi ve odemeler (`GET /platform/kurumlar/:id/abonelik`). */
export async function platformAbonelikDetayi(
  tx: Tx,
  kurumId: string,
): Promise<PlatformAbonelikYanit> {
  const ozet = await platformAbonelikOzeti(tx, kurumId);
  const satirlar = await tx
    .select({ abonelik: abonelikler, plan: planlar })
    .from(abonelikler)
    .innerJoin(planlar, eq(planlar.id, abonelikler.plan_id))
    .where(eq(abonelikler.kurum_id, kurumId))
    .orderBy(desc(abonelikler.created_at), desc(abonelikler.id))
    .limit(GECMIS_LIMITI);
  const gecmis: AboneligiTipi[] = [];
  for (const s of satirlar) gecmis.push(await abonelikYanitiUret(tx, s));
  const odemeler = await tx
    .select()
    .from(abonelikOdemeleri)
    .where(eq(abonelikOdemeleri.kurum_id, kurumId))
    .orderBy(desc(abonelikOdemeleri.odeme_at), desc(abonelikOdemeleri.id))
    .limit(GECMIS_LIMITI);
  return {
    ...ozet,
    gecmis,
    odemeler: odemeler.map((o) => ({
      id: o.id,
      abonelik_id: o.abonelik_id,
      kaynak: o.kaynak as 'iyzico',
      durum: o.durum as 'basarili',
      tutar_kurus: o.tutar_kurus,
      kdv_kurus: o.kdv_kurus,
      donem_baslangic_at: o.donem_baslangic_at.toISOString(),
      donem_bitis_at: o.donem_bitis_at.toISOString(),
      odeme_at: o.odeme_at.toISOString(),
      hata_kodu: o.hata_kodu,
    })),
  };
}

async function etkinKilitle(tx: Tx, kurumId: string) {
  await kilitAl(tx, `abonelik:${kurumId}`);
  const [etkin] = await tx
    .select()
    .from(abonelikler)
    .where(and(eq(abonelikler.kurum_id, kurumId), inArray(abonelikler.durum, [...ETKIN_DURUMLAR])))
    .for('update');
  return etkin;
}

async function satir(tx: Tx, abonelikId: string): Promise<AbonelikVePlan> {
  const [s] = await tx
    .select({ abonelik: abonelikler, plan: planlar })
    .from(abonelikler)
    .innerJoin(planlar, eq(planlar.id, abonelikler.plan_id))
    .where(eq(abonelikler.id, abonelikId));
  if (!s) throw new Error('abonelik okunamadı');
  return s;
}

const etkinYok = () =>
  new AppError(409, abonelikHataKodlari.etkinAboneligiYok, 'Etkin bir abonelik yok.');

/** Deneme uzatma: etkin deneme `gun` kadar uzar; bitmis (`sona_erdi`) deneme yeniden acilir. */
export async function platformDenemeyiUzat(
  tx: Tx,
  kurumId: string,
  gun: number,
  baglam: OlayBaglami,
  simdi: Date = new Date(),
): Promise<AbonelikVePlan> {
  const etkin = await etkinKilitle(tx, kurumId);
  let hedefId: string;
  if (etkin) {
    if (etkin.durum !== 'deneme')
      throw celiski('Yalnızca deneme sürümündeki abonelik uzatılabilir.');
    const baz = new Date(
      Math.max((etkin.deneme_bitis_at ?? etkin.donem_bitis_at).getTime(), simdi.getTime()),
    );
    const bitis = gunEkle(baz, gun);
    await tx
      .update(abonelikler)
      .set({ deneme_bitis_at: bitis, donem_bitis_at: bitis })
      .where(eq(abonelikler.id, etkin.id));
    hedefId = etkin.id;
  } else {
    const son = await guncelAbonelik(tx, kurumId);
    if (son?.abonelik.kaynak !== 'deneme' || son.abonelik.durum !== 'sona_erdi') {
      throw celiski('Uzatılabilecek bir deneme yok.');
    }
    const bitis = gunEkle(simdi, gun);
    await tx
      .update(abonelikler)
      .set({ durum: 'deneme', deneme_bitis_at: bitis, donem_bitis_at: bitis })
      .where(eq(abonelikler.id, son.abonelik.id));
    hedefId = son.abonelik.id;
  }
  const sonuc = await satir(tx, hedefId);
  await abonelikDegistiYaz(tx, sonuc, baglam);
  await kurumDurumunuEsitle(tx, kurumId, 'aktif', baglam);
  return sonuc;
}

/**
 * Ek sure verme: `odeme_bekliyor`/`ek_sure` aboneligin tam erisimi `gun` kadar uzar; `askida` abonelik
 * (ucretli) `ek_sure`ye alinir ve kurum acilir. Donemi suren `aktif` ve `deneme` icin anlamsizdir (409).
 */
export async function platformEkSureVer(
  tx: Tx,
  kurumId: string,
  gun: number,
  baglam: OlayBaglami,
  simdi: Date = new Date(),
): Promise<AbonelikVePlan> {
  const etkin = await etkinKilitle(tx, kurumId);
  let hedefId: string;
  if (etkin) {
    if (etkin.durum !== 'odeme_bekliyor' && etkin.durum !== 'ek_sure') {
      throw celiski(
        'Ek süre yalnızca ödemesi bekleyen, ek süredeki veya askıdaki abonelik için verilir.',
      );
    }
    const baz = new Date(
      Math.max((etkin.ek_sure_bitis_at ?? etkin.donem_bitis_at).getTime(), simdi.getTime()),
    );
    await tx
      .update(abonelikler)
      .set({ durum: 'ek_sure', ek_sure_bitis_at: gunEkle(baz, gun) })
      .where(eq(abonelikler.id, etkin.id));
    hedefId = etkin.id;
  } else {
    const son = await guncelAbonelik(tx, kurumId);
    if (son?.abonelik.durum !== 'askida' || son.abonelik.kaynak === 'deneme') {
      throw celiski(
        'Ek süre yalnızca ödemesi bekleyen, ek süredeki veya askıdaki abonelik için verilir.',
      );
    }
    await tx
      .update(abonelikler)
      .set({ durum: 'ek_sure', ek_sure_bitis_at: gunEkle(simdi, gun) })
      .where(eq(abonelikler.id, son.abonelik.id));
    hedefId = son.abonelik.id;
  }
  const sonuc = await satir(tx, hedefId);
  await abonelikDegistiYaz(tx, sonuc, baglam);
  await kurumDurumunuEsitle(tx, kurumId, 'aktif', baglam);
  return sonuc;
}

/**
 * Plan degistirme. `hemen=true`: etkin abonelikte plan/periyot aninda degisir (fiyat ve donem korunur,
 * bekleyen istek temizlenir). `hemen=false`: sahip akisiyla ayni (`planDegistirIstegi`).
 */
export async function platformPlanDegistir(
  tx: Tx,
  kurumId: string,
  girdi: { planKodu: string; periyot?: Periyot | undefined; hemen: boolean },
  baglam: OlayBaglami,
): Promise<AbonelikVePlan> {
  if (!girdi.hemen) {
    return (await planDegistirIstegi(tx, kurumId, girdi, baglam)).satir;
  }
  const etkin = await etkinKilitle(tx, kurumId);
  if (!etkin) throw etkinYok();
  const [kurum] = await tx
    .select({ tur: kurumlar.tur })
    .from(kurumlar)
    .where(eq(kurumlar.id, kurumId));
  const plan = await planBul(tx, girdi.planKodu);
  if (!plan || plan.kurum_turu !== kurum?.tur) {
    throw new AppError(404, abonelikHataKodlari.planBulunamadi, 'Plan bulunamadı.');
  }
  await tx
    .update(abonelikler)
    .set({
      plan_id: plan.id,
      periyot: girdi.periyot ?? etkin.periyot,
      bekleyen_plan_id: null,
      bekleyen_periyot: null,
    })
    .where(eq(abonelikler.id, etkin.id));
  const sonuc = await satir(tx, etkin.id);
  await abonelikDegistiYaz(tx, sonuc, baglam);
  return sonuc;
}

/** Iptal: `hemen=false` yenilemeyi iptal eder (donem sonunda biter); `true` aboneligi simdi `iptal` yapar. */
export async function platformAboneligiIptalEt(
  tx: Tx,
  kurumId: string,
  hemen: boolean,
  baglam: OlayBaglami,
): Promise<AbonelikVePlan> {
  if (!hemen) return yenilemeyiIptalEt(tx, kurumId, baglam);
  const etkin = await etkinKilitle(tx, kurumId);
  if (!etkin) throw etkinYok();
  await tx
    .update(abonelikler)
    .set({
      durum: 'iptal',
      otomatik_yenileme: false,
      iptal_istendi_at: etkin.iptal_istendi_at ?? new Date(),
    })
    .where(eq(abonelikler.id, etkin.id));
  const sonuc = await satir(tx, etkin.id);
  await abonelikDegistiYaz(tx, sonuc, baglam);
  return sonuc;
}

/**
 * ABONELIK askisi (platform kurum askisindan ayri): etkin abonelik `askida` olur (yazma kilitlenir, kurum
 * `askida` gorunur); sonradan ek sure ya da kurumsal aktivasyonla acilir. Zaten askidaysa degisiklik yok.
 */
export async function platformAboneligiAskiyaAl(
  tx: Tx,
  kurumId: string,
  baglam: OlayBaglami,
  simdi: Date = new Date(),
): Promise<AbonelikVePlan> {
  const etkin = await etkinKilitle(tx, kurumId);
  if (!etkin) {
    const son = await guncelAbonelik(tx, kurumId);
    if (son?.abonelik.durum === 'askida') return son;
    throw etkinYok();
  }
  await tx
    .update(abonelikler)
    .set({ durum: 'askida', ek_sure_bitis_at: simdi, otomatik_yenileme: false })
    .where(eq(abonelikler.id, etkin.id));
  const sonuc = await satir(tx, etkin.id);
  await abonelikDegistiYaz(tx, sonuc, baglam);
  await kurumDurumunuEsitle(tx, kurumId, 'askida', baglam);
  return sonuc;
}

export interface PlatformAbonelikEylemSonucu {
  abonelik: AboneligiTipi;
  kurumDurumu: KurumDurumu;
  platformAskida: boolean;
}

/**
 * Bir duzeltme eylemini `api_sistem` isleminde (denetim baglami `baglam`'dan) calistirir; kurum yoksa 404.
 * Yanit icin kurum durumu ve platform askisi ayni islemde okunur.
 */
export async function platformAbonelikEylemi(
  sistemDb: Database | null,
  baglam: PlatformAbonelikBaglami,
  kurumId: string,
  eylem: (tx: Tx) => Promise<AbonelikVePlan>,
): Promise<PlatformAbonelikEylemSonucu> {
  return platformAbonelikIslemi(sistemVeritabani(sistemDb), baglam, async (tx) => {
    const [kurum] = await tx
      .select({ id: kurumlar.id })
      .from(kurumlar)
      .where(eq(kurumlar.id, kurumId));
    if (!kurum) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
    const sonuc = await eylem(tx);
    const [guncel] = await tx
      .select({ durum: kurumlar.durum, platformAskidaAt: kurumlar.platform_askida_at })
      .from(kurumlar)
      .where(eq(kurumlar.id, kurumId));
    return {
      abonelik: await abonelikYanitiUret(tx, sonuc),
      kurumDurumu: (guncel?.durum ?? 'aktif') as KurumDurumu,
      platformAskida: guncel?.platformAskidaAt != null,
    };
  });
}

/** Okuma (`GET`): denetim baglamiyla `api_sistem` isleminde. */
export function platformAbonelikOku(
  sistemDb: Database | null,
  baglam: PlatformAbonelikBaglami,
  kurumId: string,
): Promise<PlatformAbonelikYanit | null> {
  return platformAbonelikIslemi(sistemVeritabani(sistemDb), baglam, async (tx) => {
    const [kurum] = await tx
      .select({ id: kurumlar.id })
      .from(kurumlar)
      .where(eq(kurumlar.id, kurumId));
    return kurum ? platformAbonelikDetayi(tx, kurumId) : null;
  });
}

export type { KurumsalAktivasyonGirdisi };
export { kurumsalAktivasyonIslemi };
