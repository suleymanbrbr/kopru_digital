import { abonelikFaturaKesildiV1 } from '@kopru/contracts';
import { publishInTx, type Database } from '@kopru/service-kit';
import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { abonelikOlaylari, faturalar } from '../db/schema.js';

/**
 * Odeme webhook'lari ve e-Arsiv isinin veritabani adimlari (`api_sistem`). Webhook alimi ve zamanlayici
 * calismalari her istekte denetim satiri yazmaz (ham olay kaydi zaten kalicidir); is verisini degistiren
 * kisim (`modules/abonelik/odeme-isleme.ts`) `abonelikSistemIslemi` ile nedenli denetim yazar.
 */

export type OlayKaynagi = 'iyzico' | 'apple' | 'google';

/** Olay islenemezse en cok bu kadar denenir; sonra `hata` kalir (alarm logu) ve elle mudahale gerekir. */
export const OLAY_MAKS_DENEME = 8;
/** e-Arsiv fatura en cok bu kadar denenir; sonra `durum='hata'` + alarm. */
export const FATURA_MAKS_DENEME = 6;

export interface OlayGirdisi {
  kaynak: OlayKaynagi;
  disOlayId: string;
  tur: string;
  hamGovde: string;
  basliklar: Record<string, string>;
  imzaDogrulandi: boolean;
  /** Imzasiz/yoksayilan olay `yoksayildi` olarak yazilir. */
  durum?: 'alindi' | 'yoksayildi';
  hata?: string;
}

/** Ham olayi yazar (`ON CONFLICT DO NOTHING`); yeni satirin kimligi, tekrar ise `null`. */
export async function olayAl(db: Database, g: OlayGirdisi): Promise<string | null> {
  const [satir] = await db.orm
    .insert(abonelikOlaylari)
    .values({
      id: uuidv7(),
      kaynak: g.kaynak,
      dis_olay_id: g.disOlayId,
      tur: g.tur,
      ham_govde: g.hamGovde,
      basliklar: g.basliklar,
      imza_dogrulandi: g.imzaDogrulandi,
      durum: g.durum ?? 'alindi',
      hata: g.hata ?? null,
    })
    .onConflictDoNothing({ target: [abonelikOlaylari.kaynak, abonelikOlaylari.dis_olay_id] })
    .returning({ id: abonelikOlaylari.id });
  return satir?.id ?? null;
}

export async function olayOku(db: Database, id: string) {
  const [satir] = await db.orm.select().from(abonelikOlaylari).where(eq(abonelikOlaylari.id, id));
  return satir ?? null;
}

/** Islenmeyi bekleyen olaylar: `alindi` ve geri cekilme suresi gecmis `hata` (10 sn * 3^(n-1), en cok 1 saat). */
export async function bekleyenOlayKimlikleri(
  db: Database,
  simdi: Date,
  limit = 20,
): Promise<string[]> {
  const an = sql`${simdi.toISOString()}::timestamptz`;
  const satirlar = await db.orm
    .select({ id: abonelikOlaylari.id })
    .from(abonelikOlaylari)
    .where(
      and(
        eq(abonelikOlaylari.imza_dogrulandi, true),
        or(
          eq(abonelikOlaylari.durum, 'alindi'),
          and(
            eq(abonelikOlaylari.durum, 'hata'),
            lt(abonelikOlaylari.deneme_sayisi, OLAY_MAKS_DENEME),
            sql`${abonelikOlaylari.updated_at} <= ${an} - least(interval '10 seconds' * power(3, greatest(${abonelikOlaylari.deneme_sayisi} - 1, 0)), interval '1 hour')`,
          ),
        ),
      ),
    )
    .orderBy(asc(abonelikOlaylari.alindi_at))
    .limit(limit);
  return satirlar.map((s) => s.id);
}

/** Isleme basarisiz: `hata`, deneme sayaci +1; yeni sayaci dondurur. */
export async function olayHatasiYaz(db: Database, id: string, mesaj: string): Promise<number> {
  const [satir] = await db.orm
    .update(abonelikOlaylari)
    .set({
      durum: 'hata',
      hata: mesaj.slice(0, 1000),
      deneme_sayisi: sql`${abonelikOlaylari.deneme_sayisi} + 1`,
    })
    .where(eq(abonelikOlaylari.id, id))
    .returning({ deneme: abonelikOlaylari.deneme_sayisi });
  return satir?.deneme ?? 0;
}

export type FaturaAdayi = typeof faturalar.$inferSelect;

/**
 * Kesilecek faturalari ayirir: `bekliyor`, deneme hakki kalan ve geri cekilme suresi gecmis olanlar
 * (1 dk, 5 dk, 15 dk, 1 sa, 6 sa). Secilen satirin deneme sayaci ayni islemde artar (cokcu worker guvenli:
 * `for update skip locked`); sinirda takili kalan satirlar `hata` olur.
 */
export async function faturaAdaylariniAl(
  db: Database,
  simdi: Date,
  limit = 10,
  /** Yalniz bu kurumun faturalari (test/operasyon); verilmezse hepsi. */
  kurumId?: string,
): Promise<{ adaylar: FaturaAdayi[]; takilan: FaturaAdayi[] }> {
  const an = sql`${simdi.toISOString()}::timestamptz`;
  return db.orm.transaction(async (tx) => {
    // Son denemede cokmus (sayac sinirda, sonuc yazilmamis) satirlar: bir saat sonra `hata`.
    const takilan = await tx
      .update(faturalar)
      .set({ durum: 'hata', hata: 'deneme_siniri_asildi' })
      .where(
        and(
          kurumId ? eq(faturalar.kurum_id, kurumId) : undefined,
          eq(faturalar.durum, 'bekliyor'),
          sql`${faturalar.deneme_sayisi} >= ${FATURA_MAKS_DENEME}`,
          sql`${faturalar.updated_at} <= ${an} - interval '1 hour'`,
        ),
      )
      .returning();
    const secilen = await tx
      .select({ id: faturalar.id })
      .from(faturalar)
      .where(
        and(
          kurumId ? eq(faturalar.kurum_id, kurumId) : undefined,
          eq(faturalar.durum, 'bekliyor'),
          lt(faturalar.deneme_sayisi, FATURA_MAKS_DENEME),
          or(
            eq(faturalar.deneme_sayisi, 0),
            sql`${faturalar.updated_at} <= ${an} - (case ${faturalar.deneme_sayisi} when 1 then interval '1 minute' when 2 then interval '5 minutes' when 3 then interval '15 minutes' when 4 then interval '1 hour' else interval '6 hours' end)`,
          ),
        ),
      )
      .orderBy(asc(faturalar.created_at))
      .limit(limit)
      .for('update', { skipLocked: true });
    if (secilen.length === 0) return { adaylar: [], takilan };
    const adaylar = await tx
      .update(faturalar)
      .set({ deneme_sayisi: sql`${faturalar.deneme_sayisi} + 1` })
      .where(
        inArray(
          faturalar.id,
          secilen.map((s) => s.id),
        ),
      )
      .returning();
    return { adaylar, takilan };
  });
}

export interface FaturaSonucu {
  faturaNo: string;
  ettn: string;
  entegrator: string;
  entegratorRef: string | null;
  pdfDosyaId: string | null;
}

/** Fatura kesildi: satir guncellenir ve `abonelik.fatura.kesildi.v1` ayni islemde outbox'a yazilir. */
export async function faturaKesildiYaz(
  db: Database,
  fatura: FaturaAdayi,
  s: FaturaSonucu,
): Promise<boolean> {
  return db.orm.transaction(async (tx) => {
    const [guncel] = await tx
      .update(faturalar)
      .set({
        durum: 'kesildi',
        fatura_no: s.faturaNo,
        ettn: s.ettn,
        entegrator: s.entegrator,
        entegrator_ref: s.entegratorRef,
        pdf_dosya_id: s.pdfDosyaId,
        kesim_at: sql`now()`,
        hata: null,
      })
      .where(and(eq(faturalar.id, fatura.id), eq(faturalar.durum, 'bekliyor')))
      .returning({ id: faturalar.id });
    if (!guncel) return false;
    await publishInTx(
      tx,
      abonelikFaturaKesildiV1.create({
        kurumId: fatura.kurum_id,
        actor: { tur: 'sistem', id: 'abonelik-fatura' },
        correlationId: uuidv7(),
        data: {
          fatura_id: fatura.id,
          odeme_id: fatura.odeme_id,
          tur: fatura.tur as 'e_arsiv',
          fatura_no: s.faturaNo,
          toplam_kurus: fatura.toplam_kurus,
          pdf_dosya_id: s.pdfDosyaId,
        },
      }),
      { table: 'ortak.outbox' },
    );
    return true;
  });
}

/** Deneme basarisiz: hata metni yazilir; deneme hakki bittiyse `durum='hata'` (alarm cagiranin isi). */
export async function faturaHatasiYaz(
  db: Database,
  fatura: FaturaAdayi,
  mesaj: string,
): Promise<'yeniden_denenecek' | 'hata'> {
  const son = fatura.deneme_sayisi >= FATURA_MAKS_DENEME;
  await db.orm
    .update(faturalar)
    .set({ hata: mesaj.slice(0, 1000), ...(son ? { durum: 'hata' } : {}) })
    .where(and(eq(faturalar.id, fatura.id), eq(faturalar.durum, 'bekliyor')));
  return son ? 'hata' : 'yeniden_denenecek';
}
