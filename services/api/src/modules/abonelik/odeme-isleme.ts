import { abonelikOdemeIslendiV1, type Periyot } from '@kopru/contracts';
import { metrikler, publishInTx, type Database, type Tx } from '@kopru/service-kit';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import {
  abonelikler,
  abonelikOdemeleri,
  abonelikOlaylari,
  faturalar,
  kurumFaturaBilgileri,
  kurumlar,
  odemeOturumlari,
  planlar,
} from '../../db/schema.js';
import {
  OLAY_MAKS_DENEME,
  olayHatasiYaz,
  olayOku,
  bekleyenOlayKimlikleri,
} from '../../sistem/abonelik-odeme-sistem.js';
import { abonelikSistemIslemi } from '../../sistem/abonelik-sistem.js';
import { planBul, type PlanSatiri } from './abonelik-deposu.js';
import { kdvAyir, kdvEkle } from './kdv.js';
import type { OdemeGunlugu, OdemeKanallari } from './odeme-kanallari.js';
import { ETKIN_DURUMLAR, OUTBOX_TABLOSU, kilitAl } from './ortak.js';
import { webhookJsondanOku, type AyristirilmisWebhook, type OdemeKaynagi } from './saglayici.js';
import {
  abonelikDegistiYaz,
  aboneligiAktiflestir,
  fiyatSec,
  kurumDurumunuEsitle,
  satiriPlanlaGetir,
  type OlayBaglami,
} from './yazma.js';

/**
 * Saglayici bildirimlerinin (iyzico, RevenueCat, sahte) abonelige uygulanmasi. Kurallar:
 *  - Tek yazma yolu: olay satiri `for update skip locked` ile kilitlenir; kurum basina advisory kilit ile seri.
 *  - Idempotent: odeme `UNIQUE (kaynak, dis_islem_id, durum)`, fatura `UNIQUE (odeme_id, tur)`; tekrar olay etkisiz.
 *  - Sirasiz olay: abonelik `donem_bitis_at`i olayin donem bitisinden ileriyse (ya da esitse) durum degistirilmez;
 *    odeme yine tarihce olarak yazilir. Basarisizlikta yalniz kesin eski olay (`<`) yoksayilir.
 *  - Cift kanal: baska kanalda etkin ucretli abonelik varken gelen odeme abonelik acmaz/degistirmez; olay
 *    `yoksayildi` (`hata='cift_kanal'`) olur, alarm logu + denetim kaydi yazilir (iade gerekebilir).
 */

const ABONELIK_AKTORU = { tur: 'sistem', id: 'abonelik-odeme' } as const;
/** Cift kanal sayilan (ucretli) durumlar: `deneme` ucretsizdir, ucretliye gecis cift sayilmaz. */
const UCRETLI_ETKIN = ['aktif', 'odeme_bekliyor', 'ek_sure'];

type AbonelikSatiri = typeof abonelikler.$inferSelect;
type OlaySatiri = typeof abonelikOlaylari.$inferSelect;
type OturumSatiri = typeof odemeOturumlari.$inferSelect;
type OdemeSatiri = typeof abonelikOdemeleri.$inferSelect;

export type OlayIslemSonucu = 'islendi' | 'yoksayildi' | 'hata' | 'atlandi';

interface UygulamaSonucu {
  durum: 'islendi' | 'yoksayildi' | 'atlandi';
  neden?: string;
  kurumId?: string;
  abonelikId?: string;
  cift?: boolean;
}

interface Baglam {
  kanallar: OdemeKanallari;
  log: OdemeGunlugu;
  olay: OlaySatiri;
  olayBaglami: OlayBaglami;
}

/** Cozulemeyen referans gibi gecici durumlar: olay `hata` olur, geri cekilmeyle yeniden denenir. */
class GeciciHata extends Error {}

const odemeKaynagi = (k: string): OdemeKaynagi => k as OdemeKaynagi;

async function planKodunaGore(tx: Tx, kaynak: OdemeKaynagi, kod: string | null | undefined) {
  if (!kod) return null;
  // Google `urun:temel_plan` bicimi tasiyabilir; once tam, sonra on ek.
  const adaylar = [kod, ...(kod.includes(':') ? [kod.split(':')[0] ?? kod] : [])];
  const anahtar = kaynak === 'google' ? 'google' : 'apple';
  for (const aday of adaylar) {
    const [p] = await tx
      .select()
      .from(planlar)
      .where(
        and(eq(planlar.aktif, true), sql`${planlar.magaza_urun_kodlari} ->> ${anahtar} = ${aday}`),
      )
      .orderBy(desc(planlar.surum))
      .limit(1);
    if (p) return p;
  }
  return null;
}

async function planCoz(
  tx: Tx,
  a: AyristirilmisWebhook,
  kaynak: OdemeKaynagi,
  oturum: OturumSatiri | null,
  ref: AbonelikSatiri | null,
): Promise<PlanSatiri> {
  if (a.planKodu) {
    const p = await planBul(tx, a.planKodu);
    if (p) return p;
  }
  if (oturum) {
    const [p] = await tx.select().from(planlar).where(eq(planlar.id, oturum.plan_id));
    if (p) return p;
  }
  if (a.magazaUrunKodu) {
    const p = await planKodunaGore(tx, kaynak, a.magazaUrunKodu);
    if (!p) throw new GeciciHata(`mağaza ürünü plana eşlenmedi: ${a.magazaUrunKodu}`);
    return p;
  }
  if (ref) {
    const [p] = await tx.select().from(planlar).where(eq(planlar.id, ref.plan_id));
    if (p) return p;
  }
  throw new GeciciHata('plan çözülemedi');
}

async function odemeIslendiYaz(tx: Tx, odeme: OdemeSatiri, baglam: OlayBaglami): Promise<void> {
  await publishInTx(
    tx,
    abonelikOdemeIslendiV1.create({
      kurumId: odeme.kurum_id,
      actor: baglam.actor,
      correlationId: baglam.correlationId,
      data: {
        odeme_id: odeme.id,
        abonelik_id: odeme.abonelik_id,
        durum: odeme.durum as 'basarili',
        tutar_kurus: odeme.tutar_kurus,
        donem_bitis_at: odeme.donem_bitis_at.toISOString(),
        hata_kodu: odeme.hata_kodu,
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
}

interface OdemeYazGirdisi {
  kurumId: string;
  abonelikId: string;
  kaynak: OdemeKaynagi;
  disIslemId: string;
  olayId: string;
  durum: 'basarili' | 'basarisiz' | 'iade';
  tutarKurus: number;
  kdvKurus: number;
  donemBaslangicAt: Date;
  donemBitisAt: Date;
  hataKodu?: string | undefined;
  tersCevrilenId?: string | undefined;
}

/** Odeme satirini ekler; ayni (kaynak, islem, durum) zaten varsa `null` (tekrar). */
async function odemeYaz(
  tx: Tx,
  g: OdemeYazGirdisi,
  baglam: OlayBaglami,
): Promise<OdemeSatiri | null> {
  const [satir] = await tx
    .insert(abonelikOdemeleri)
    .values({
      id: uuidv7(),
      kurum_id: g.kurumId,
      abonelik_id: g.abonelikId,
      kaynak: g.kaynak,
      dis_islem_id: g.disIslemId,
      olay_id: g.olayId,
      durum: g.durum,
      tutar_kurus: g.tutarKurus,
      kdv_kurus: g.kdvKurus,
      donem_baslangic_at: g.donemBaslangicAt,
      donem_bitis_at: g.donemBitisAt,
      odeme_at: sql`now()`,
      hata_kodu: g.hataKodu ?? null,
      ters_cevrilen_id: g.tersCevrilenId ?? null,
    })
    .onConflictDoNothing({
      target: [abonelikOdemeleri.kaynak, abonelikOdemeleri.dis_islem_id, abonelikOdemeleri.durum],
    })
    .returning();
  if (satir) await odemeIslendiYaz(tx, satir, baglam);
  return satir ?? null;
}

/** Basarili iyzico odemesi icin fatura (`bekliyor`): alici bilgisi o anin kopyasi, tutar KDV'ye bolunmus. */
async function faturaOlustur(
  tx: Tx,
  odeme: OdemeSatiri,
  plan: PlanSatiri,
  log: OdemeGunlugu,
): Promise<void> {
  const [alici] = await tx
    .select()
    .from(kurumFaturaBilgileri)
    .where(eq(kurumFaturaBilgileri.kurum_id, odeme.kurum_id));
  if (!alici) {
    metrikler.abonelikAlarm('fatura_bilgisi_yok');
    log.error(
      { kurumId: odeme.kurum_id, odemeId: odeme.id },
      'abonelik_fatura_bilgisi_yok_alarm: ödeme alındı ama fatura bilgisi yok; fatura kesilemedi',
    );
    return;
  }
  const bolum = kdvAyir(odeme.tutar_kurus, plan.kdv_orani);
  await tx
    .insert(faturalar)
    .values({
      id: uuidv7(),
      kurum_id: odeme.kurum_id,
      odeme_id: odeme.id,
      tur: 'e_arsiv',
      durum: 'bekliyor',
      alici_unvan: alici.unvan,
      alici_vergi_no: alici.vergi_no,
      alici_adres: alici.adres,
      matrah_kurus: bolum.matrahKurus,
      kdv_kurus: bolum.kdvKurus,
      toplam_kurus: bolum.toplamKurus,
      kdv_orani: plan.kdv_orani,
    })
    .onConflictDoNothing({ target: [faturalar.odeme_id, faturalar.tur] });
}

async function iadeFaturasiOlustur(
  tx: Tx,
  orijinal: OdemeSatiri,
  iade: OdemeSatiri,
): Promise<void> {
  const [asil] = await tx
    .select()
    .from(faturalar)
    .where(and(eq(faturalar.odeme_id, orijinal.id), eq(faturalar.tur, 'e_arsiv')));
  if (!asil) return; // magaza odemesi ya da faturasi hic olusmamis odeme: iade faturasi yok
  const bolum = kdvAyir(iade.tutar_kurus, asil.kdv_orani);
  await tx
    .insert(faturalar)
    .values({
      id: uuidv7(),
      kurum_id: iade.kurum_id,
      odeme_id: iade.id,
      tur: 'iade',
      durum: 'bekliyor',
      alici_unvan: asil.alici_unvan,
      alici_vergi_no: asil.alici_vergi_no,
      alici_adres: asil.alici_adres,
      matrah_kurus: bolum.matrahKurus,
      kdv_kurus: bolum.kdvKurus,
      toplam_kurus: bolum.toplamKurus,
      kdv_orani: asil.kdv_orani,
    })
    .onConflictDoNothing({ target: [faturalar.odeme_id, faturalar.tur] });
}

async function durumYaz(
  tx: Tx,
  abonelikId: string,
  degisiklik: Partial<typeof abonelikler.$inferInsert>,
  baglam: OlayBaglami,
): Promise<void> {
  await tx.update(abonelikler).set(degisiklik).where(eq(abonelikler.id, abonelikId));
  await abonelikDegistiYaz(tx, await satiriPlanlaGetir(tx, abonelikId), baglam);
}

async function odemeUygula(
  tx: Tx,
  c: Baglam,
  kurumId: string,
  kaynak: OdemeKaynagi,
  a: AyristirilmisWebhook,
  oturum: OturumSatiri | null,
  etkin: AbonelikSatiri | null,
  refDis: AbonelikSatiri | null,
): Promise<UygulamaSonucu> {
  const odeme = a.odeme;
  if (!odeme) return { durum: 'yoksayildi', neden: 'odeme_yok', kurumId };
  const disIslemId = a.disIslemId ?? `olay:${c.olay.id}`;
  const sonuc = (s: Omit<UygulamaSonucu, 'kurumId'>): UygulamaSonucu => ({ ...s, kurumId });

  if (odeme.durum === 'iade') {
    const hedefIslem = odeme.iadeEdilenIslemId ?? disIslemId;
    const [orijinal] = await tx
      .select()
      .from(abonelikOdemeleri)
      .where(
        and(
          eq(abonelikOdemeleri.kurum_id, kurumId),
          eq(abonelikOdemeleri.kaynak, kaynak),
          eq(abonelikOdemeleri.dis_islem_id, hedefIslem),
          eq(abonelikOdemeleri.durum, 'basarili'),
        ),
      );
    if (!orijinal) throw new GeciciHata(`iade edilen ödeme bulunamadı: ${hedefIslem}`);
    const tutar =
      odeme.tutarBelirsiz || odeme.tutarKurus <= 0
        ? orijinal.tutar_kurus
        : Math.min(odeme.tutarKurus, orijinal.tutar_kurus);
    const [asilAbonelik] = await tx
      .select({ plan: planlar })
      .from(abonelikler)
      .innerJoin(planlar, eq(planlar.id, abonelikler.plan_id))
      .where(eq(abonelikler.id, orijinal.abonelik_id));
    const kdvOrani = asilAbonelik?.plan.kdv_orani ?? 20;
    const iade = await odemeYaz(
      tx,
      {
        kurumId,
        abonelikId: orijinal.abonelik_id,
        kaynak,
        disIslemId: a.disIslemId ?? orijinal.dis_islem_id,
        olayId: c.olay.id,
        durum: 'iade',
        tutarKurus: tutar,
        kdvKurus: kdvAyir(tutar, kdvOrani).kdvKurus,
        donemBaslangicAt: orijinal.donem_baslangic_at,
        donemBitisAt: orijinal.donem_bitis_at,
        tersCevrilenId: orijinal.id,
      },
      c.olayBaglami,
    );
    if (!iade)
      return sonuc({ durum: 'islendi', neden: 'iade_tekrar', abonelikId: orijinal.abonelik_id });
    if (kaynak === 'iyzico') await iadeFaturasiOlustur(tx, orijinal, iade);
    // Tam iade: iade edilen odeme guncel donemi karsiliyorsa erisim hemen biter (kurum `askida`).
    const [hedef] = await tx
      .select()
      .from(abonelikler)
      .where(eq(abonelikler.id, orijinal.abonelik_id))
      .for('update');
    if (
      hedef &&
      tutar >= orijinal.tutar_kurus &&
      (ETKIN_DURUMLAR as readonly string[]).includes(hedef.durum) &&
      hedef.donem_bitis_at.getTime() === orijinal.donem_bitis_at.getTime()
    ) {
      await durumYaz(tx, hedef.id, { durum: 'sona_erdi', otomatik_yenileme: false }, c.olayBaglami);
      await kurumDurumunuEsitle(tx, kurumId, 'askida', c.olayBaglami);
    }
    return sonuc({ durum: 'islendi', abonelikId: orijinal.abonelik_id });
  }

  const ayniKaynakEtkin = etkin?.kaynak === kaynak ? etkin : null;
  const ref = ayniKaynakEtkin ?? (refDis?.kaynak === kaynak ? refDis : null);
  const plan = await planCoz(tx, a, kaynak, oturum, ref ?? etkin);
  const periyot: Periyot =
    a.periyot ??
    (oturum?.periyot as Periyot | undefined) ??
    (ref?.periyot as Periyot | undefined) ??
    'aylik';
  const tutar = odeme.tutarBelirsiz
    ? kdvEkle(fiyatSec(plan, periyot), plan.kdv_orani).toplamKurus
    : odeme.tutarKurus;
  const kdv = kdvAyir(tutar, plan.kdv_orani).kdvKurus;

  if (odeme.durum === 'basarisiz') {
    if (!ref) {
      // Ilk odeme basarisiz: abonelik yok, odeme satiri baglanacak abonelik de yok.
      if (oturum)
        await tx
          .update(odemeOturumlari)
          .set({ durum: 'basarisiz' })
          .where(eq(odemeOturumlari.id, oturum.id));
      return sonuc({ durum: 'islendi', neden: 'ilk_odeme_basarisiz' });
    }
    const [basarili] = await tx
      .select({ id: abonelikOdemeleri.id })
      .from(abonelikOdemeleri)
      .where(
        and(
          eq(abonelikOdemeleri.kaynak, kaynak),
          eq(abonelikOdemeleri.dis_islem_id, disIslemId),
          eq(abonelikOdemeleri.durum, 'basarili'),
        ),
      );
    if (basarili)
      return sonuc({ durum: 'islendi', neden: 'basarili_odeme_var', abonelikId: ref.id });
    await odemeYaz(
      tx,
      {
        kurumId,
        abonelikId: ref.id,
        kaynak,
        disIslemId,
        olayId: c.olay.id,
        durum: 'basarisiz',
        tutarKurus: tutar,
        kdvKurus: kdv,
        donemBaslangicAt: odeme.donemBaslangicAt,
        donemBitisAt: odeme.donemBitisAt,
        hataKodu: odeme.hataKodu ?? 'odeme_basarisiz',
      },
      c.olayBaglami,
    );
    // Eski (kesin gecmis donem) basarisizlik durumu degistirmez; guncel donemin basarisizligi `odeme_bekliyor` yapar.
    if (
      ayniKaynakEtkin?.durum === 'aktif' &&
      odeme.donemBitisAt.getTime() >= ayniKaynakEtkin.donem_bitis_at.getTime()
    ) {
      await durumYaz(tx, ayniKaynakEtkin.id, { durum: 'odeme_bekliyor' }, c.olayBaglami);
    }
    return sonuc({ durum: 'islendi', abonelikId: ref.id });
  }

  // --- basarili ---------------------------------------------------------------------------
  const baskaKanal =
    etkin !== null && etkin.kaynak !== kaynak && UCRETLI_ETKIN.includes(etkin.durum);
  const ayniKanalIkinci =
    kaynak === 'iyzico' &&
    etkin?.kaynak === 'iyzico' &&
    etkin.durum === 'aktif' &&
    etkin.dis_abonelik_id !== null &&
    a.disAbonelikId !== null &&
    etkin.dis_abonelik_id !== a.disAbonelikId;
  if (baskaKanal || ayniKanalIkinci) {
    return sonuc({ durum: 'yoksayildi', neden: 'cift_kanal', cift: true });
  }
  const eski = ref !== null && ref.donem_bitis_at.getTime() >= odeme.donemBitisAt.getTime();
  let abonelikId: string;
  if (eski) {
    abonelikId = ref.id;
  } else {
    const satir = await aboneligiAktiflestir(tx, {
      kurumId,
      planKodu: plan.kod,
      kaynak,
      periyot,
      donemBaslangicAt: odeme.donemBaslangicAt,
      donemBitisAt: odeme.donemBitisAt,
      otomatikYenileme: true,
      disAbonelikId: a.disAbonelikId,
      disMusteriId: a.disMusteriId ?? null,
      ...(a.ucretsizDeneme ? { fiyatKurus: 0 } : {}),
      ...c.olayBaglami,
    });
    abonelikId = satir.abonelik.id;
  }
  if (oturum) {
    await tx
      .update(odemeOturumlari)
      .set({ durum: 'tamamlandi', dis_abonelik_id: a.disAbonelikId })
      .where(eq(odemeOturumlari.id, oturum.id));
  }
  if (!a.ucretsizDeneme) {
    const yazilan = await odemeYaz(
      tx,
      {
        kurumId,
        abonelikId,
        kaynak,
        disIslemId,
        olayId: c.olay.id,
        durum: 'basarili',
        tutarKurus: tutar,
        kdvKurus: kdv,
        donemBaslangicAt: odeme.donemBaslangicAt,
        donemBitisAt: odeme.donemBitisAt,
      },
      c.olayBaglami,
    );
    // Magaza odemelerine fatura kesilmez (magaza kendi faturasini/makbuzunu duzenler).
    if (yazilan && kaynak === 'iyzico' && tutar > 0) await faturaOlustur(tx, yazilan, plan, c.log);
  }
  return sonuc({ durum: 'islendi', ...(eski ? { neden: 'eski_olay_tarihce' } : {}), abonelikId });
}

async function uygula(tx: Tx, c: Baglam, a: AyristirilmisWebhook): Promise<UygulamaSonucu> {
  const { olay } = c;
  const kaynak = odemeKaynagi(olay.kaynak);
  // Satir bu islemde kilitlenir; baska is ayni olayi isliyor ya da bitirdiyse atlanir.
  const [kilitli] = await tx
    .select({ durum: abonelikOlaylari.durum })
    .from(abonelikOlaylari)
    .where(eq(abonelikOlaylari.id, olay.id))
    .for('update', { skipLocked: true });
  if (!kilitli || (kilitli.durum !== 'alindi' && kilitli.durum !== 'hata')) {
    return { durum: 'atlandi' };
  }
  if (a.islem === 'yoksay') return { durum: 'yoksayildi', neden: 'islem_yok' };
  if (a.sandbox && !c.kanallar.sandboxKabul) return { durum: 'yoksayildi', neden: 'sandbox' };

  // --- Kurum cozumu ---
  let oturum: OturumSatiri | null = null;
  if (a.oturumToken) {
    [oturum = null] = await tx
      .select()
      .from(odemeOturumlari)
      .where(
        and(eq(odemeOturumlari.kaynak, 'iyzico'), eq(odemeOturumlari.dis_islem_id, a.oturumToken)),
      );
  }
  let refDis: AbonelikSatiri | null = null;
  if (a.disAbonelikId) {
    [refDis = null] = await tx
      .select()
      .from(abonelikler)
      .where(and(eq(abonelikler.kaynak, kaynak), eq(abonelikler.dis_abonelik_id, a.disAbonelikId)));
  }
  const kurumAdayi = a.kurumId ?? oturum?.kurum_id ?? refDis?.kurum_id ?? null;
  if (!kurumAdayi) {
    if (kaynak === 'iyzico') throw new GeciciHata('kurum çözülemedi (oturum/abonelik henüz yok)');
    return { durum: 'yoksayildi', neden: 'kurum_bulunamadi' };
  }
  const [kurum] = await tx
    .select({ id: kurumlar.id })
    .from(kurumlar)
    .where(eq(kurumlar.id, kurumAdayi));
  if (!kurum) return { durum: 'yoksayildi', neden: 'kurum_bulunamadi' };
  const kurumId = kurum.id;
  await kilitAl(tx, `abonelik:${kurumId}`);
  const [etkin = null] = await tx
    .select()
    .from(abonelikler)
    .where(and(eq(abonelikler.kurum_id, kurumId), inArray(abonelikler.durum, [...ETKIN_DURUMLAR])))
    .for('update');
  const ayniKaynak = etkin?.kaynak === kaynak ? etkin : null;
  const sonuc = (s: Omit<UygulamaSonucu, 'kurumId'>): UygulamaSonucu => ({
    ...s,
    kurumId,
    ...((s.abonelikId ?? ayniKaynak?.id) ? { abonelikId: s.abonelikId ?? ayniKaynak?.id } : {}),
  });
  const eskiOlay = (): boolean =>
    ayniKaynak !== null &&
    a.donemBitisAt !== undefined &&
    a.donemBitisAt.getTime() < ayniKaynak.donem_bitis_at.getTime();

  switch (a.islem) {
    case 'odeme':
      return odemeUygula(tx, c, kurumId, kaynak, a, oturum, etkin, refDis);
    case 'iptal':
      if (!ayniKaynak || eskiOlay()) return sonuc({ durum: 'islendi', neden: 'etkisiz' });
      if (ayniKaynak.iptal_istendi_at === null) {
        await durumYaz(
          tx,
          ayniKaynak.id,
          { otomatik_yenileme: false, iptal_istendi_at: new Date() },
          c.olayBaglami,
        );
      }
      return sonuc({ durum: 'islendi' });
    case 'iptal_geri_alindi':
      if (ayniKaynak?.iptal_istendi_at && !eskiOlay()) {
        await durumYaz(
          tx,
          ayniKaynak.id,
          { otomatik_yenileme: true, iptal_istendi_at: null },
          c.olayBaglami,
        );
      }
      return sonuc({ durum: 'islendi' });
    case 'sona_erdi': {
      if (!ayniKaynak || eskiOlay()) return sonuc({ durum: 'islendi', neden: 'etkisiz' });
      const yeni = ayniKaynak.iptal_istendi_at === null ? 'sona_erdi' : 'iptal';
      await durumYaz(tx, ayniKaynak.id, { durum: yeni, otomatik_yenileme: false }, c.olayBaglami);
      if (yeni === 'sona_erdi') await kurumDurumunuEsitle(tx, kurumId, 'askida', c.olayBaglami);
      return sonuc({ durum: 'islendi' });
    }
    case 'plan_degisti': {
      if (!ayniKaynak || eskiOlay()) return sonuc({ durum: 'islendi', neden: 'etkisiz' });
      const yeniPlan = await planKodunaGore(tx, kaynak, a.yeniMagazaUrunKodu);
      if (!yeniPlan)
        throw new GeciciHata(`mağaza ürünü plana eşlenmedi: ${a.yeniMagazaUrunKodu ?? ''}`);
      const ayni = yeniPlan.id === ayniKaynak.plan_id;
      await tx
        .update(abonelikler)
        .set({
          bekleyen_plan_id: ayni ? null : yeniPlan.id,
          bekleyen_periyot: ayni ? null : (a.periyot ?? ayniKaynak.periyot),
        })
        .where(eq(abonelikler.id, ayniKaynak.id));
      return sonuc({ durum: 'islendi' });
    }
    default:
      return { durum: 'yoksayildi', neden: 'islem_yok' };
  }
}

/**
 * Tek olayi isler (idempotent; ikinci cagri `atlandi`). Ayristirma (agdan veri gerekebilir) islem disinda,
 * uygulama tek veritabani islemindedir. Gecici hata (`GeciciHata`, ag, eksik referans) olayi `hata` yapar;
 * `bekleyenleriIsle` geri cekilmeyle yeniden dener, `OLAY_MAKS_DENEME` sonrasi alarm loglanir.
 */
export async function olayiIsle(
  db: Database,
  kanallar: OdemeKanallari,
  olayId: string,
  log: OdemeGunlugu,
): Promise<OlayIslemSonucu> {
  const olay = await olayOku(db, olayId);
  if (!olay?.imza_dogrulandi) return 'atlandi';
  if (olay.durum !== 'alindi' && olay.durum !== 'hata') return 'atlandi';
  if (olay.deneme_sayisi >= OLAY_MAKS_DENEME) return 'atlandi';
  const hataYaz = async (err: unknown): Promise<'hata'> => {
    const mesaj = err instanceof Error ? err.message : String(err);
    const deneme = await olayHatasiYaz(db, olay.id, mesaj);
    const nesne = { olayId: olay.id, kaynak: olay.kaynak, tur: olay.tur, deneme, hata: mesaj };
    if (deneme >= OLAY_MAKS_DENEME) {
      metrikler.abonelikAlarm('olay_isleme');
      log.error(nesne, 'abonelik_olay_isleme_alarm: deneme sınırı aşıldı, elle müdahale gerekli');
    } else {
      log.warn(nesne, 'abonelik_olay_isleme_hatasi: yeniden denenecek');
    }
    return 'hata';
  };
  const saglayici = kanallar.saglayici(odemeKaynagi(olay.kaynak));
  if (!saglayici) return hataYaz(new Error('kanal kapalı'));
  let ayri: AyristirilmisWebhook;
  try {
    ayri =
      olay.tur === 'donus'
        ? webhookJsondanOku(olay.ham_govde)
        : await saglayici.webhookAyristir(olay.ham_govde);
  } catch (err) {
    return hataYaz(err);
  }
  const olayBaglami: OlayBaglami = { actor: ABONELIK_AKTORU, correlationId: uuidv7() };
  try {
    const sonuc = await abonelikSistemIslemi(
      db,
      {
        eylem: 'sistem.abonelik_odeme_isle',
        neden: `Ödeme sağlayıcısı bildirimi işleniyor (${olay.kaynak}: ${olay.tur})`,
        ayrinti: { olay_id: olay.id, kaynak: olay.kaynak, tur: olay.tur },
      },
      async (tx) => {
        const s = await uygula(tx, { kanallar, log, olay, olayBaglami }, ayri);
        if (s.durum === 'atlandi') return s;
        await tx
          .update(abonelikOlaylari)
          .set({
            durum: s.durum,
            kurum_id: s.kurumId ?? null,
            abonelik_id: s.abonelikId ?? null,
            hata: s.neden ?? null,
            islendi_at: sql`now()`,
          })
          .where(eq(abonelikOlaylari.id, olay.id));
        return s;
      },
    );
    if (sonuc.cift && sonuc.kurumId) {
      metrikler.abonelikAlarm('cift_kanal');
      log.error(
        {
          olayId: olay.id,
          kaynak: olay.kaynak,
          kurumId: sonuc.kurumId,
          disIslemId: ayri.disIslemId,
        },
        'abonelik_cift_kanal_alarm: başka kanalda etkin ücretli abonelik varken ödeme alındı; abonelik açılmadı, iade gerekebilir',
      );
      await abonelikSistemIslemi(
        db,
        {
          eylem: 'sistem.abonelik_cift_kanal',
          neden: 'Başka kanalda etkin ücretli abonelik varken ödeme alındı; iade gerekebilir',
          kurumId: sonuc.kurumId,
          ayrinti: {
            olay_id: olay.id,
            kaynak: olay.kaynak,
            tur: olay.tur,
            dis_islem_id: ayri.disIslemId,
          },
        },
        () => Promise.resolve(),
      );
    }
    return sonuc.durum;
  } catch (err) {
    return hataYaz(err);
  }
}

/** Bekleyen (yeni ve geri cekilmesi gecmis hatali) olaylari sirayla isler; islenen sayisini dondurur. */
export async function bekleyenOlaylariIsle(
  db: Database,
  kanallar: OdemeKanallari,
  log: OdemeGunlugu,
  simdi: Date = new Date(),
  limit = 20,
): Promise<number> {
  let islenen = 0;
  for (const id of await bekleyenOlayKimlikleri(db, simdi, limit)) {
    const s = await olayiIsle(db, kanallar, id, log);
    if (s !== 'atlandi') islenen += 1;
  }
  return islenen;
}
