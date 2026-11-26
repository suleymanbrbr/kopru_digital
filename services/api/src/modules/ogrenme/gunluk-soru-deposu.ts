import {
  GUNLUK_SORU_EN_FAZLA_FOTOGRAF,
  GUNLUK_SORU_GERI_GUN,
  errorCodes,
  gunlukSoruHataKodlari,
  ogrenmeGunlukSoruKaydedildiV1,
  ortakDosyaBirakildiV1,
  soruHataKodlari,
  type GunlukSoruKaydi,
  type Zorluk,
} from '@kopru/contracts';
import { AppError, publishInTx, type Tx } from '@kopru/service-kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import {
  gunlukSoruDosyalari,
  gunlukSoruKayitlari,
  haftalikPlanlar,
  kaynakKitaplar,
  kaynakKitapTestleri,
  konular,
  planGorevleri,
} from '../../db/schema.js';
import type { YetkiBaglami } from '../hesap/index.js';
import { OUTBOX_TABLOSU, bransGecerliOlmali, type OdevOlayBaglami } from './odev-deposu.js';
import {
  durumHesapla,
  gorevOlayiYaz,
  haftaYazilabilirOlmali,
  planModuluAcikOlmali,
} from './plan-deposu.js';
import { gunFarki, planBugunu } from './plan-zaman.js';
import { baglandiOlayiYaz, dosyalariDogrula } from './soru-medya.js';
import type { SoruOlayBaglami } from './soru-ortak.js';

export type KayitSatiri = typeof gunlukSoruKayitlari.$inferSelect;

export const GUNLUK_SORU_FOTOGRAF_TURU = 'gunluk_soru_fotografi';

export const kayitBulunamadi = () => new AppError(404, errorCodes.notFound, 'Kayıt bulunamadı.');

// --- Gun ve duzenleme penceresi --------------------------------------------------------------

/** Gun: varsayilan bugun; gelecek ve `GUNLUK_SORU_GERI_GUN` gunden eski gun 422 `gun_gecersiz`. */
export function gunuDogrula(gun: string | undefined, bugun: string = planBugunu()): string {
  if (gun === undefined) return bugun;
  const fark = gunFarki(gun, bugun);
  if (fark < 0 || fark > GUNLUK_SORU_GERI_GUN) {
    throw new AppError(
      422,
      gunlukSoruHataKodlari.gunGecersiz,
      `Gün bugünden en çok ${String(GUNLUK_SORU_GERI_GUN)} gün öncesine kadar olabilir, gelecek olamaz.`,
    );
  }
  return gun;
}

/** Duzeltme/silme: kaydin olusturuldugu takvim gunu (Europe/Istanbul) icinde. */
export const duzenlenebilirMi = (k: Pick<KayitSatiri, 'created_at'>, bugun = planBugunu()) =>
  planBugunu(k.created_at) === bugun;

export function duzenlenebilirOlmali(k: Pick<KayitSatiri, 'created_at'>): void {
  if (!duzenlenebilirMi(k)) {
    throw new AppError(
      409,
      gunlukSoruHataKodlari.kayitDuzenlenemez,
      'Kayıt yalnızca girildiği gün içinde düzeltilebilir ya da silinebilir.',
    );
  }
}

// --- Dogrulamalar ----------------------------------------------------------------------------

/** Brans aktif ve konu bu bransin (global ya da kendi kurumun) konusu olmali. */
export async function bransVeKonuDogrula(
  tx: Tx,
  bransKodu: string,
  konuId: string,
): Promise<{ ad: string }> {
  try {
    await bransGecerliOlmali(tx, bransKodu);
  } catch {
    throw new AppError(422, gunlukSoruHataKodlari.bransGecersiz, 'Branş kodu geçersiz.');
  }
  // RLS: `konular_oku` yalniz global ve kendi kurumun satirlarini gosterir.
  const [k] = await tx
    .select({ ad: konular.ad, brans_kodu: konular.brans_kodu })
    .from(konular)
    .where(eq(konular.id, konuId));
  if (k?.brans_kodu !== bransKodu) {
    throw new AppError(422, gunlukSoruHataKodlari.konuGecersiz, 'Konu bu dersin konusu değil.');
  }
  return { ad: k.ad };
}

/** Kaynak testi var, kitabi aktif ve kitabin bransi kayit bransi ile ayni olmali. */
export async function kaynakTestiDogrula(
  tx: Tx,
  y: YetkiBaglami,
  testId: string,
  bransKodu: string,
): Promise<void> {
  const [t] = await tx
    .select({ brans: kaynakKitaplar.brans_kodu, aktif: kaynakKitaplar.aktif })
    .from(kaynakKitapTestleri)
    .innerJoin(kaynakKitaplar, eq(kaynakKitaplar.id, kaynakKitapTestleri.kitap_id))
    .where(and(eq(kaynakKitapTestleri.id, testId), eq(kaynakKitapTestleri.kurum_id, y.kurumId)));
  if (!t || !t.aktif || t.brans !== bransKodu) {
    throw new AppError(
      422,
      gunlukSoruHataKodlari.kaynakTestiGecersiz,
      'Kaynak testi bulunamadı ya da bu dersin kitabı değil.',
    );
  }
}

const gorevGecersiz = () =>
  new AppError(
    422,
    gunlukSoruHataKodlari.planGoreviGecersiz,
    'Plan görevi bulunamadı, soru görevi değil ya da size ait değil.',
  );

/** Baglanacak gorev: ogrencinin yayindaki planinda, `soru` turunde, devredilmemis. Satiri kilitler. */
export async function baglanacakGorevBul(tx: Tx, y: YetkiBaglami, gorevId: string) {
  const [gorev] = await tx
    .select()
    .from(planGorevleri)
    .where(
      and(
        eq(planGorevleri.id, gorevId),
        eq(planGorevleri.kurum_id, y.kurumId),
        eq(planGorevleri.ogrenci_id, y.uyelikId),
      ),
    )
    .for('update');
  if (!gorev) throw gorevGecersiz();
  const [plan] = await tx
    .select({ durum: haftalikPlanlar.durum })
    .from(haftalikPlanlar)
    .where(eq(haftalikPlanlar.id, gorev.plan_id));
  if (plan?.durum !== 'yayinda' || gorev.hedef_turu !== 'soru' || gorev.durum === 'devredildi') {
    throw gorevGecersiz();
  }
  return gorev;
}

/**
 * Baglanan gorevin gerceklesen miktarini `delta` kadar degistirir (ogrencinin elle girdigi deger korunur:
 * toplama eklenir/cikarilir; en az 0), durumu hesaplar ve mevcut `plan_gorevi.guncellendi` olayini yayimlar.
 */
export async function gorevGerceklesenDegistir(
  tx: Tx,
  y: YetkiBaglami,
  baglam: OdevOlayBaglami,
  gorevId: string,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  const [g] = await tx
    .select()
    .from(planGorevleri)
    .where(and(eq(planGorevleri.id, gorevId), eq(planGorevleri.kurum_id, y.kurumId)))
    .for('update');
  if (!g) return;
  await planModuluAcikOlmali(tx, y, y.uyelikId);
  if (delta > 0) haftaYazilabilirOlmali(g.hafta_baslangic);
  const yeniMiktar = Math.max(0, (g.gerceklesen_miktar ?? 0) + delta);
  const durum = g.durum === 'devredildi' ? g.durum : durumHesapla(g.hedef_miktar, yeniMiktar);
  const [yeni] = await tx
    .update(planGorevleri)
    .set({
      gerceklesen_miktar: yeniMiktar,
      durum,
      tamamlandi_at: durum === 'tamam' ? (g.tamamlandi_at ?? new Date()) : null,
    })
    .where(eq(planGorevleri.id, g.id))
    .returning();
  if (!yeni) throw new Error('gerçekleşen yazılamadı');
  await gorevOlayiYaz(tx, baglam, g, yeni);
}

// --- Fotograf --------------------------------------------------------------------------------

/**
 * Fotograf kumesini `istenen` listeye esitler: yeni dosyalar dogrulanir ve baglanir
 * (`ortak.dosya.baglandi.v1`), eksikler birakilir (`ortak.dosya.birakildi.v1`, `hemen_sil`).
 * `mevcut` kayitta suan bagli olan dosya kimlikleridir (sira ile).
 */
export async function fotograflariEsitle(
  tx: Tx,
  y: YetkiBaglami,
  baglam: SoruOlayBaglami,
  kayitId: string,
  mevcut: readonly { medya_dosya_id: string; sira: number }[],
  istenen: readonly string[],
): Promise<void> {
  if (istenen.length > GUNLUK_SORU_EN_FAZLA_FOTOGRAF) {
    throw new AppError(422, soruHataKodlari.dosyaGecersiz, 'En fazla 5 fotoğraf eklenebilir.');
  }
  const mevcutKume = new Set(mevcut.map((m) => m.medya_dosya_id));
  const yeniler = istenen.filter((id) => !mevcutKume.has(id));
  const birakilacak = mevcut.filter((m) => !istenen.includes(m.medya_dosya_id));

  if (yeniler.length > 0) {
    await dosyalariDogrula(
      tx,
      y,
      yeniler.map((id) => ({ id, tur: GUNLUK_SORU_FOTOGRAF_TURU })),
    );
    const bagli = await tx
      .select({ id: gunlukSoruDosyalari.medya_dosya_id })
      .from(gunlukSoruDosyalari)
      .where(inArray(gunlukSoruDosyalari.medya_dosya_id, yeniler));
    if (bagli.length > 0) {
      throw new AppError(409, soruHataKodlari.dosyaZatenBagli, 'Dosya zaten bir kayda bağlı.');
    }
  }
  // Kume degisimi: satirlar silinip istenen sirayla yeniden yazilir (unique `kayit_id, sira` cakismaz).
  await tx.delete(gunlukSoruDosyalari).where(eq(gunlukSoruDosyalari.kayit_id, kayitId));
  for (const [i, id] of istenen.entries()) {
    await tx.insert(gunlukSoruDosyalari).values({
      id: uuidv7(),
      kurum_id: y.kurumId,
      created_by: y.kullaniciId,
      kayit_id: kayitId,
      medya_dosya_id: id,
      sira: i,
    });
  }
  for (const id of yeniler) await baglandiOlayiYaz(tx, baglam, id, 'gunluk_soru_kaydi', kayitId);
  for (const b of birakilacak) {
    await publishInTx(
      tx,
      ortakDosyaBirakildiV1.create({
        ...baglam,
        data: {
          dosya_id: b.medya_dosya_id,
          bagli_tur: 'gunluk_soru_kaydi',
          bagli_id: kayitId,
          hemen_sil: true,
        },
      }),
      { table: OUTBOX_TABLOSU },
    );
  }
}

// --- Olay ------------------------------------------------------------------------------------

/** `ogrenme.gunluk_soru.kaydedildi.v1`: olusturma, duzeltme, silme (ayni islemde outbox). */
export async function kayitOlayiYaz(
  tx: Tx,
  baglam: OdevOlayBaglami,
  kayit: Pick<
    KayitSatiri,
    'id' | 'ogrenci_id' | 'brans_kodu' | 'konu_id' | 'zorluk' | 'dogru' | 'yanlis' | 'bos' | 'gun'
  >,
  surum: number,
  oncekiToplam: number,
  silindi: boolean,
): Promise<void> {
  const sifir = silindi;
  const dogru = sifir ? 0 : kayit.dogru;
  const yanlis = sifir ? 0 : kayit.yanlis;
  const bos = sifir ? 0 : kayit.bos;
  await publishInTx(
    tx,
    ogrenmeGunlukSoruKaydedildiV1.create({
      ...baglam,
      data: {
        kayit_id: kayit.id,
        ogrenci_id: kayit.ogrenci_id,
        brans_kodu: kayit.brans_kodu,
        konu_id: kayit.konu_id,
        zorluk: kayit.zorluk as Zorluk,
        dogru,
        yanlis,
        bos,
        toplam: dogru + yanlis + bos,
        onceki_toplam: oncekiToplam,
        kayit_surumu: surum,
        silindi,
        gun: kayit.gun,
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
}

// --- Yanit -----------------------------------------------------------------------------------

/** Kayit satirlarini ad/kitap/foto bilgisiyle `GunlukSoruKaydi` yanitina cevirir (toplu sorgu). */
export async function kayitYanitlari(
  tx: Tx,
  satirlar: readonly KayitSatiri[],
): Promise<GunlukSoruKaydi[]> {
  if (satirlar.length === 0) return [];
  const konuIdleri = [...new Set(satirlar.map((s) => s.konu_id))];
  const testIdleri = [
    ...new Set(satirlar.map((s) => s.kaynak_test_id).filter((x): x is string => x !== null)),
  ];
  const kayitIdleri = satirlar.map((s) => s.id);
  const konuAd = new Map(
    (
      await tx
        .select({ id: konular.id, ad: konular.ad })
        .from(konular)
        .where(inArray(konular.id, konuIdleri))
    ).map((k) => [k.id, k.ad]),
  );
  const testKitap = new Map(
    testIdleri.length === 0
      ? []
      : (
          await tx
            .select({ id: kaynakKitapTestleri.id, kitap_id: kaynakKitapTestleri.kitap_id })
            .from(kaynakKitapTestleri)
            .where(inArray(kaynakKitapTestleri.id, testIdleri))
        ).map((t) => [t.id, t.kitap_id]),
  );
  const dosyalar = await tx
    .select()
    .from(gunlukSoruDosyalari)
    .where(inArray(gunlukSoruDosyalari.kayit_id, kayitIdleri))
    .orderBy(asc(gunlukSoruDosyalari.sira));
  const bugun = planBugunu();
  return satirlar.map((s) => ({
    id: s.id,
    ogrenci_id: s.ogrenci_id,
    gun: s.gun,
    brans_kodu: s.brans_kodu,
    konu_id: s.konu_id,
    konu_ad: konuAd.get(s.konu_id) ?? null,
    zorluk: s.zorluk as Zorluk,
    kaynak_test_id: s.kaynak_test_id,
    kaynak_kitap_id: s.kaynak_test_id ? (testKitap.get(s.kaynak_test_id) ?? null) : null,
    kaynak_metin: s.kaynak_metin,
    dogru: s.dogru,
    yanlis: s.yanlis,
    bos: s.bos,
    toplam: s.toplam,
    plan_gorev_id: s.plan_gorev_id,
    dosyalar: dosyalar
      .filter((d) => d.kayit_id === s.id)
      .map((d) => ({ medya_dosya_id: d.medya_dosya_id, sira: d.sira })),
    duzenlenebilir: duzenlenebilirMi(s, bugun),
    surum: s.surum,
    created_at: s.created_at.toISOString(),
  }));
}

/** Kapsamdaki ogrencinin kaydi (baskasinin ya da yoksa 404); `kilit`: `FOR UPDATE`. */
export async function kendiKaydiBul(tx: Tx, y: YetkiBaglami, id: string, kilit = false) {
  const sorgu = tx
    .select()
    .from(gunlukSoruKayitlari)
    .where(
      and(
        eq(gunlukSoruKayitlari.id, id),
        eq(gunlukSoruKayitlari.kurum_id, y.kurumId),
        eq(gunlukSoruKayitlari.ogrenci_id, y.uyelikId),
      ),
    );
  const [k] = await (kilit ? sorgu.for('update') : sorgu);
  if (!k) throw kayitBulunamadi();
  return k;
}
