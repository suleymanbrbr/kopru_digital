import { withUser, type Database } from '@kopru/service-kit';
import { and, desc, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { rizaMetinleri, rizalar } from '../../db/schema.js';

/** Onaylanmadan hicbir (muaf olmayan) uc nokta acilmayan metin turleri. */
export const ZORUNLU_RIZA_TURLERI = ['kvkk_aydinlatma', 'kullanim_kosullari'] as const;

export interface RizaDurumu {
  id: string;
  tur: 'kvkk_aydinlatma' | 'acik_riza' | 'kullanim_kosullari' | 'veli_onayi';
  surum: string;
  dil: string;
  baslik: string;
  govde_markdown: string;
  govde_sha256: string;
  kabul_edildi: boolean;
}

/**
 * Kullanicinin zorunlu metinler icin guncel durumunu verir. Guncel metin: turu basina
 * yayinlanmis ve gecerli olan en yuksek surum. `roller` doluysa yalnizca o rolleri kapsayan metinler sayilir.
 */
export async function rizaDurumu(
  db: Pick<Database, 'orm'>,
  kullaniciId: string,
  roller: readonly string[],
): Promise<RizaDurumu[]> {
  return withUser(db, { kullaniciId }, async (tx) => {
    const simdi = new Date();
    const metinler = await tx
      .select()
      .from(rizaMetinleri)
      .where(
        and(
          inArray(rizaMetinleri.tur, [...ZORUNLU_RIZA_TURLERI]),
          isNotNull(rizaMetinleri.yayinlandi_at),
          lte(rizaMetinleri.yayinlandi_at, simdi),
          lte(rizaMetinleri.gecerli_baslangic_at, simdi),
          eq(rizaMetinleri.dil, 'tr'),
        ),
      )
      .orderBy(desc(rizaMetinleri.surum));
    const guncel = new Map<string, (typeof metinler)[number]>();
    for (const metin of metinler) {
      const kapsamda = roller.length === 0 || metin.rol_kapsami.some((r) => roller.includes(r));
      if (kapsamda && !guncel.has(metin.tur)) guncel.set(metin.tur, metin);
    }
    if (guncel.size === 0) return [];
    const kararlar = await tx
      .select({
        riza_metni_id: rizalar.riza_metni_id,
        karar: rizalar.karar,
      })
      .from(rizalar)
      .where(
        and(
          eq(rizalar.kullanici_id, kullaniciId),
          inArray(
            rizalar.riza_metni_id,
            [...guncel.values()].map((m) => m.id),
          ),
        ),
      )
      .orderBy(desc(rizalar.created_at), desc(rizalar.id));
    const sonKarar = new Map<string, string>();
    for (const k of kararlar)
      if (!sonKarar.has(k.riza_metni_id)) sonKarar.set(k.riza_metni_id, k.karar);
    return [...guncel.values()].map((m) => ({
      id: m.id,
      tur: m.tur as RizaDurumu['tur'],
      surum: m.surum,
      dil: m.dil,
      baslik: m.baslik,
      govde_markdown: m.govde_markdown,
      govde_sha256: m.govde_sha256.toString('hex'),
      kabul_edildi: sonKarar.get(m.id) === 'kabul',
    }));
  });
}

export const onayGerekliMi = (durum: readonly RizaDurumu[]) => durum.some((m) => !m.kabul_edildi);

/** Rıza kararını yalnızca-ekleme defterine yazar (kullanici kendi baglaminda). */
export async function rizaKaydet(
  db: Pick<Database, 'orm'>,
  girdi: {
    kullaniciId: string;
    rizaMetniId: string;
    karar: 'kabul' | 'ret' | 'geri_cekildi';
    kaynak: 'web' | 'ios' | 'android';
    ip: string | null;
    userAgent: string | null;
  },
): Promise<string | null> {
  return withUser(db, { kullaniciId: girdi.kullaniciId }, async (tx) => {
    const [metin] = await tx
      .select({ sha: rizaMetinleri.govde_sha256, yayin: rizaMetinleri.yayinlandi_at })
      .from(rizaMetinleri)
      .where(eq(rizaMetinleri.id, girdi.rizaMetniId));
    if (!metin?.yayin) return null;
    const id = uuidv7();
    await tx.insert(rizalar).values({
      id,
      kurum_id: null,
      created_by: girdi.kullaniciId,
      kullanici_id: girdi.kullaniciId,
      riza_metni_id: girdi.rizaMetniId,
      karar: girdi.karar,
      kaynak: girdi.kaynak,
      ip: girdi.ip,
      user_agent: girdi.userAgent,
      govde_sha256: metin.sha,
    });
    return id;
  });
}
