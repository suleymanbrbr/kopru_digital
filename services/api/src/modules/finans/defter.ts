import type { Tx } from '@kopru/service-kit';
import { and, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import {
  bakiyeHareketleri,
  krediBakiyeleri,
  krediHareketleri,
  ogrenciBakiyeleri,
  paketSatislari,
} from '../../db/schema.js';

/**
 * Defter ilkelleri (ADR 0007). Satir eklenir, hicbir zaman degistirilmez; ozet tablolari ayni
 * islemde `bakiye = bakiye + delta` ile (atomik) artirilir. Tekillik indeksleri cakistiginda
 * `ON CONFLICT DO NOTHING` ile ikinci satir olusmaz ve istisna firlamaz (`eklendi: false`).
 */

export type KrediHareketSatiri = typeof krediHareketleri.$inferSelect;
export type BakiyeHareketSatiri = typeof bakiyeHareketleri.$inferSelect;

/** Ters cevrilmemis (etkin) satir: kendisine isaret eden bir ters kayit yok. */
export const krediTersiYok = sql`not exists (
  select 1 from finans.kredi_hareketleri t where t.kurum_id = ${krediHareketleri.kurum_id} and t.ters_cevrilen_id = ${krediHareketleri.id})`;
export const bakiyeTersiYok = sql`not exists (
  select 1 from finans.bakiye_hareketleri t where t.kurum_id = ${bakiyeHareketleri.kurum_id} and t.ters_cevrilen_id = ${bakiyeHareketleri.id})`;

export async function krediBakiyeArtir(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
  delta: number,
): Promise<{ onceki: number; yeni: number }> {
  const [satir] = await tx
    .insert(krediBakiyeleri)
    .values({ id: uuidv7(), kurum_id: kurumId, ogrenci_id: ogrenciId, bakiye: delta })
    .onConflictDoUpdate({
      target: [krediBakiyeleri.kurum_id, krediBakiyeleri.ogrenci_id],
      set: { bakiye: sql`${krediBakiyeleri.bakiye} + excluded.bakiye` },
    })
    .returning({ bakiye: krediBakiyeleri.bakiye });
  const yeni = satir?.bakiye ?? delta;
  return { onceki: yeni - delta, yeni };
}

export async function ogrenciBakiyeArtir(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
  deltaKurus: number,
): Promise<number> {
  const [satir] = await tx
    .insert(ogrenciBakiyeleri)
    .values({ id: uuidv7(), kurum_id: kurumId, ogrenci_id: ogrenciId, bakiye_kurus: deltaKurus })
    .onConflictDoUpdate({
      target: [ogrenciBakiyeleri.kurum_id, ogrenciBakiyeleri.ogrenci_id],
      set: { bakiye_kurus: sql`${ogrenciBakiyeleri.bakiye_kurus} + excluded.bakiye_kurus` },
    })
    .returning({ bakiye_kurus: ogrenciBakiyeleri.bakiye_kurus });
  return satir?.bakiye_kurus ?? deltaKurus;
}

export interface KrediSatiriGirdi {
  kurumId: string;
  ogrenciId: string;
  paketSatisiId: string | null;
  tur: 'satin_alma' | 'dusum' | 'iptal_dusum' | 'iade' | 'duzeltme' | 'son_kullanma' | 'ters_kayit';
  miktar: number;
  dersId?: string | null;
  yoklamaId?: string | null;
  yoklamaSurumu?: number | null;
  tersCevrilenId?: string | null;
  neden?: string | null;
  aktorKullaniciId: string | null;
}

export interface KrediSatiriSonucu {
  id: string;
  onceki: number;
  yeni: number;
}

/**
 * Kredi defterine satir ekler ve ozeti ayni islemde artirir. Tekillik indeksi cakisirsa `null`
 * doner (satir eklenmez, ozet degismez).
 */
export async function krediSatiriYaz(
  tx: Tx,
  g: KrediSatiriGirdi,
): Promise<KrediSatiriSonucu | null> {
  const id = uuidv7();
  const eklenen = await tx
    .insert(krediHareketleri)
    .values({
      id,
      kurum_id: g.kurumId,
      created_by: g.aktorKullaniciId,
      ogrenci_id: g.ogrenciId,
      paket_satisi_id: g.paketSatisiId,
      tur: g.tur,
      miktar: g.miktar,
      ders_id: g.dersId ?? null,
      yoklama_id: g.yoklamaId ?? null,
      yoklama_surumu: g.yoklamaSurumu ?? null,
      ters_cevrilen_id: g.tersCevrilenId ?? null,
      neden: g.neden ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: krediHareketleri.id });
  if (eklenen.length === 0) return null;
  const { onceki, yeni } = await krediBakiyeArtir(tx, g.kurumId, g.ogrenciId, g.miktar);
  if (g.paketSatisiId) await havuzDurumunuEsitle(tx, g.kurumId, g.paketSatisiId);
  return { id, onceki, yeni };
}

export interface BakiyeSatiriGirdi {
  kurumId: string;
  ogrenciId: string;
  tur: 'ders_ucreti' | 'paket_satisi' | 'tahsilat' | 'duzeltme' | 'ters_kayit';
  tutarKurus: number;
  kaynakTuru: 'yoklama' | 'paket_satisi' | 'tahsilat' | 'elle' | 'ders_iptal';
  kaynakId?: string | null;
  dersId?: string | null;
  yoklamaId?: string | null;
  yoklamaSurumu?: number | null;
  tersCevrilenId?: string | null;
  neden?: string | null;
  aktorKullaniciId: string | null;
}

/** Bakiye defterine satir ekler ve ozeti ayni islemde artirir; tekillik cakismasinda `null`. */
export async function bakiyeSatiriYaz(
  tx: Tx,
  g: BakiyeSatiriGirdi,
): Promise<{ id: string; yeniBakiye: number } | null> {
  const id = uuidv7();
  const eklenen = await tx
    .insert(bakiyeHareketleri)
    .values({
      id,
      kurum_id: g.kurumId,
      created_by: g.aktorKullaniciId,
      ogrenci_id: g.ogrenciId,
      tur: g.tur,
      tutar_kurus: g.tutarKurus,
      kaynak_turu: g.kaynakTuru,
      kaynak_id: g.kaynakId ?? null,
      ders_id: g.dersId ?? null,
      yoklama_id: g.yoklamaId ?? null,
      yoklama_surumu: g.yoklamaSurumu ?? null,
      ters_cevrilen_id: g.tersCevrilenId ?? null,
      neden: g.neden ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: bakiyeHareketleri.id });
  if (eklenen.length === 0) return null;
  const yeniBakiye = await ogrenciBakiyeArtir(tx, g.kurumId, g.ogrenciId, g.tutarKurus);
  return { id, yeniBakiye };
}

/** Bir havuzun (paket satisi) kalan kredisi: defter toplami. */
export async function havuzKalan(tx: Tx, kurumId: string, paketSatisiId: string): Promise<number> {
  const [satir] = await tx
    .select({ toplam: sql<number>`coalesce(sum(${krediHareketleri.miktar}), 0)`.mapWith(Number) })
    .from(krediHareketleri)
    .where(
      and(
        eq(krediHareketleri.kurum_id, kurumId),
        eq(krediHareketleri.paket_satisi_id, paketSatisiId),
      ),
    );
  return satir?.toplam ?? 0;
}

/** Havuz tukendiyse `tukendi`, tekrar kredi dondugunde `aktif` (suresi dolmus/iptal olanlara dokunmaz). */
export async function havuzDurumunuEsitle(
  tx: Tx,
  kurumId: string,
  paketSatisiId: string,
): Promise<void> {
  const kalan = await havuzKalan(tx, kurumId, paketSatisiId);
  const kosul = and(eq(paketSatislari.kurum_id, kurumId), eq(paketSatislari.id, paketSatisiId));
  if (kalan <= 0) {
    await tx
      .update(paketSatislari)
      .set({ durum: 'tukendi' })
      .where(and(kosul, eq(paketSatislari.durum, 'aktif')));
  } else {
    await tx
      .update(paketSatislari)
      .set({ durum: 'aktif' })
      .where(and(kosul, eq(paketSatislari.durum, 'tukendi')));
  }
}
