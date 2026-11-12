import type { Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

export const OUTBOX_TABLOSU = 'ortak.outbox';
export const SISTEM_AKTORU = { tur: 'sistem', id: 'motivasyon' } as const;
export const VARSAYILAN_SAAT_DILIMI = 'Europe/Istanbul';
export const OYUNLASTIRMA_MODULU = 'oyunlastirma';

/** `timestamptz` -> ISO 8601 (UTC, ms). */
export const iso = (kolon: string) =>
  sql.raw(`to_char(${kolon} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

export type Islem = Pick<Tx, 'execute'>;

/** Olay isleme baglami: tek ogrenci icin, gun ve hafta kurum saat diliminde hesaplanmis. */
export interface IsBaglami {
  kurumId: string;
  ogrenciId: string;
  /** Tetikleyen olay kimligi (`xp_hareketleri.kaynak_olay_id`). */
  olayId: string;
  /** Olayin olusma zamani (ISO). */
  olusmaAt: string;
  saatDilimi: string;
  /** Oyunlastirma gunu (kurum saat diliminde 04:00 kurali), `YYYY-MM-DD`. */
  gun: string;
  /** Gunun ait oldugu haftanin Pazartesi'si. */
  hafta: string;
}

export const yeniId = () => uuidv7();

/** Ogrenci basina islem kilidi: ayni ogrencinin olaylari sirayla islenir (tavan ve sayac dogrulugu). */
export async function ogrenciKilitle(tx: Islem, ogrenciId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(727003, hashtext(${ogrenciId}))`);
}

/** Ogrenci durum satirini (yoksa) acar. */
export async function durumuGarantile(
  tx: Islem,
  kurumId: string,
  ogrenciId: string,
): Promise<void> {
  await tx.execute(sql`
    insert into motivasyon.ogrenci_durumlari (id, kurum_id, ogrenci_id)
    values (${yeniId()}, ${kurumId}, ${ogrenciId})
    on conflict (kurum_id, ogrenci_id) do nothing`);
}

/** Olay zamanindan kurum saat diliminde oyunlastirma gunu ve haftasi (gun 04:00'te doner). */
export async function gunHesapla(
  tx: Islem,
  saatDilimi: string,
  an: string,
): Promise<{ gun: string; hafta: string }> {
  const [s] = await tx.execute<{ gun: string; hafta: string }>(sql`
    select (((${an}::timestamptz at time zone ${saatDilimi}) - interval '4 hours')::date)::text as gun,
           (date_trunc('week', ((${an}::timestamptz at time zone ${saatDilimi}) - interval '4 hours'))::date)::text as hafta`);
  if (!s) throw new Error('gun hesaplanamadi');
  return s;
}

export async function kurumBilgisi(
  tx: Islem,
  kurumId: string,
): Promise<{ saatDilimi: string; durum: string }> {
  const [k] = await tx.execute<{ saat_dilimi: string; durum: string }>(sql`
    select saat_dilimi, durum from motivasyon.kurum_kopyalari where kurum_id = ${kurumId}`);
  return { saatDilimi: k?.saat_dilimi ?? VARSAYILAN_SAAT_DILIMI, durum: k?.durum ?? 'aktif' };
}

interface AyarSatiri extends Record<string, unknown> {
  kapsam: string;
  kapsam_id: string;
  acik: boolean;
}

/**
 * `oyunlastirma` modulu acik mi? Kurum > kademe > grup (ADR 0004): her duzey izin veriyorsa acik.
 * Kayit yoksa varsayilan acik. `grupId` verilirse (yoklama) yalniz o grup; verilmezse ogrencinin o gunku
 * etkin gruplari: en az bir grup, kurum/kademe kapali degilse ve TUM etkin gruplar kapali degilse kapali
 * sayilir (grubu olmayan ogrenci yalniz kurum ve kademe duzeyine bakar).
 */
export async function modulAcikMi(
  tx: Islem,
  b: { kurumId: string; ogrenciId: string; gun: string; grupId?: string | null },
): Promise<boolean> {
  const ayarlar = await tx.execute<AyarSatiri>(sql`
    select kapsam, kapsam_id, acik from motivasyon.modul_ayari_kopyalari
     where kurum_id = ${b.kurumId} and modul_kodu = ${OYUNLASTIRMA_MODULU}`);
  if (ayarlar.length === 0) return true;
  const kapali = (kapsam: string, id: string | null | undefined) =>
    id != null && ayarlar.some((a) => a.kapsam === kapsam && a.kapsam_id === id && !a.acik);
  if (kapali('kurum', b.kurumId)) return false;
  const [u] = await tx.execute<{ kademe_id: string | null }>(sql`
    select kademe_id from motivasyon.uyelik_kopyalari where uyelik_id = ${b.ogrenciId}`);
  if (kapali('kademe', u?.kademe_id)) return false;

  interface GrupSatiri extends Record<string, unknown> {
    grup_id: string;
    kademe_id: string | null;
  }
  const bagliGrup = b.grupId
    ? await tx.execute<GrupSatiri>(sql`
        select grup_id, kademe_id from motivasyon.grup_kopyalari where grup_id = ${b.grupId}`)
    : [];
  const gruplar: GrupSatiri[] = b.grupId
    ? bagliGrup.length > 0
      ? [...bagliGrup]
      : [{ grup_id: b.grupId, kademe_id: null }] // grup kopyasi yoksa yalniz grup ayari aranir
    : await tx.execute<GrupSatiri>(sql`
        select g.grup_id, g.kademe_id
          from motivasyon.grup_uyesi_kopyalari m
          join motivasyon.grup_kopyalari g on g.grup_id = m.grup_id and g.durum = 'aktif'
         where m.ogrenci_id = ${b.ogrenciId} and m.baslangic_tarihi <= ${b.gun}::date
           and (m.bitis_tarihi is null or m.bitis_tarihi >= ${b.gun}::date)`);
  const grupKapali = (g: GrupSatiri) => kapali('grup', g.grup_id) || kapali('kademe', g.kademe_id);
  if (b.grupId) return !gruplar.some(grupKapali);
  return !(gruplar.length > 0 && gruplar.every(grupKapali));
}
