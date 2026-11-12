import {
  SORU_OLAY_EN_FAZLA_ALICI,
  SORU_TAHMIN_EN_AZ_ORNEK,
  SORU_TAHMIN_PENCERE_GUN,
  soruHataKodlari,
  type SoruYonlendirmeSema,
} from '@kopru/contracts';
import { AppError, type Tx } from '@kopru/service-kit';
import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';

import { soruMasasiUyeleri, sorular } from '../../db/schema.js';
import type { YetkiBaglami } from '../hesap/index.js';
import { yonetimYetkisi, yerelZaman } from './soru-ortak.js';

export type SoruYonlendirme = z.infer<typeof SoruYonlendirmeSema>;

export interface YonlendirmeSonucu {
  yonlendirme: SoruYonlendirme;
  atanan_ogretmen_id: string | null;
  masa_id: string | null;
}

/**
 * Soru yonlendirmesi (docs/schema/api.md "Soru sor"):
 *  1. ogrencinin etkin uyesi oldugu gruplardaki, o branstaki etkin atanmis ogretmen (`ana_ogretmen`
 *     oncelikli, sonra en eski atama),
 *  2. yoksa o bransin aktif ve en az bir etkin uyesi olan soru masasi,
 *  3. o da yoksa yonetici kuyrugu.
 * Brans, ogrencinin gruplarindan birinde atanmis (gecmis atama dahil) ya da masasi olan bir brans olmali;
 * degilse 422 `brans_gecersiz`. Bireysel kurumda (solo hoca) atama akisi henuz yok: her brans kabul edilir ve
 * soru yonetici (sahip) kuyruguna duser.
 */
export async function yonlendirmeBul(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
  bransKodu: string,
): Promise<YonlendirmeSonucu> {
  const [atanan] = await tx.execute<{ ogretmen_id: string }>(sql`
    select a.ogretmen_id
    from hesap.atamalar a
    join hesap.grup_uyeleri gu on gu.grup_id = a.grup_id and gu.ogrenci_id = ${ogrenciId}::uuid
         and gu.bitis_tarihi is null
    join hesap.gruplar g on g.id = a.grup_id and g.durum = 'aktif'
    join hesap.uyelikler u on u.id = a.ogretmen_id and u.durum = 'aktif'
    where a.kurum_id = ${kurumId}::uuid and a.brans_kodu = ${bransKodu}
      and (a.bitis_tarihi is null or a.bitis_tarihi > current_date)
    order by a.ana_ogretmen desc, a.baslangic_tarihi asc, a.created_at asc, a.id asc
    limit 1`);
  if (atanan) {
    return {
      yonlendirme: 'atanan_ogretmen',
      atanan_ogretmen_id: atanan.ogretmen_id,
      masa_id: null,
    };
  }

  const [masa] = await tx.execute<{ id: string }>(sql`
    select m.id from ogrenme.soru_masalari m
    where m.kurum_id = ${kurumId}::uuid and m.brans_kodu = ${bransKodu}
      and m.aktif and m.arsivlendi_at is null
      and exists (select 1 from ogrenme.soru_masasi_uyeleri mu
                  join hesap.uyelikler u on u.id = mu.ogretmen_id and u.durum = 'aktif'
                  where mu.masa_id = m.id)
    limit 1`);
  if (masa) return { yonlendirme: 'masa', atanan_ogretmen_id: null, masa_id: masa.id };

  const [uygun] = await tx.execute<{ uygun: boolean }>(sql`
    select (
      exists (select 1 from hesap.atamalar a
              join hesap.grup_uyeleri gu on gu.grup_id = a.grup_id and gu.ogrenci_id = ${ogrenciId}::uuid
                   and gu.bitis_tarihi is null
              where a.kurum_id = ${kurumId}::uuid and a.brans_kodu = ${bransKodu})
      or exists (select 1 from ogrenme.soru_masalari m
                 where m.kurum_id = ${kurumId}::uuid and m.brans_kodu = ${bransKodu}
                   and m.aktif and m.arsivlendi_at is null)
      or exists (select 1 from hesap.kurumlar k where k.id = ${kurumId}::uuid and k.tur = 'bireysel')
    ) as uygun`);
  if (!uygun?.uygun) {
    throw new AppError(
      422,
      soruHataKodlari.bransGecersiz,
      'Bu branşta size atanmış bir öğretmen ya da soru masası yok.',
    );
  }
  return { yonlendirme: 'yonetici', atanan_ogretmen_id: null, masa_id: null };
}

/** Sorunun hedef ogretmenleri: atanan, masanin etkin uyeleri ya da kurumun etkin sahip/yoneticileri. */
export async function hedefOgretmenIdleri(
  tx: Tx,
  kurumId: string,
  s: { yonlendirme: string; atanan_ogretmen_id: string | null; masa_id: string | null },
): Promise<string[]> {
  if (s.yonlendirme === 'atanan_ogretmen' && s.atanan_ogretmen_id) return [s.atanan_ogretmen_id];
  if (s.yonlendirme === 'masa' && s.masa_id) {
    const satirlar = await tx.execute<{ id: string }>(sql`
      select mu.ogretmen_id as id from ogrenme.soru_masasi_uyeleri mu
      join hesap.uyelikler u on u.id = mu.ogretmen_id and u.durum = 'aktif'
      where mu.masa_id = ${s.masa_id}::uuid order by mu.ogretmen_id limit ${SORU_OLAY_EN_FAZLA_ALICI}`);
    return satirlar.map((r) => r.id);
  }
  const satirlar = await tx.execute<{ id: string }>(sql`
    select id from hesap.uyelikler
    where kurum_id = ${kurumId}::uuid and rol in ('sahip', 'yonetici') and durum = 'aktif'
    order by id limit ${SORU_OLAY_EN_FAZLA_ALICI}`);
  return satirlar.map((r) => r.id);
}

/** Yeni mesajin (takip) alicilari: masada ustlenen varsa yalniz o, yoksa hedef ogretmenler. */
export async function aliciOgretmenIdleri(
  tx: Tx,
  kurumId: string,
  s: {
    yonlendirme: string;
    atanan_ogretmen_id: string | null;
    masa_id: string | null;
    ustlenen_id: string | null;
  },
): Promise<string[]> {
  if (s.ustlenen_id) return [s.ustlenen_id];
  return hedefOgretmenIdleri(tx, kurumId, s);
}

export interface Tahmin {
  sure_sn: number | null;
  ornek_sayisi: number;
  hedef_musait: boolean | null;
}

/**
 * Tahmini cevap suresi: hedefin (atanan ogretmen, masa ya da yonetici kuyrugu) son 30 gundeki ilk cevap
 * surelerinin medyani; en az 3 ornek yoksa `null`. `hedef_musait`: hedef ogretmen(ler) bugun (kurum yerel
 * gunu) "cevap veremiyorum" dediyse `false` (masada hepsi demisse).
 */
export async function tahminiCevap(
  tx: Tx,
  kurumId: string,
  s: { yonlendirme: string; atanan_ogretmen_id: string | null; masa_id: string | null },
): Promise<Tahmin> {
  const hedefKosulu =
    s.yonlendirme === 'atanan_ogretmen' && s.atanan_ogretmen_id
      ? sql`atanan_ogretmen_id = ${s.atanan_ogretmen_id}::uuid`
      : s.yonlendirme === 'masa' && s.masa_id
        ? sql`masa_id = ${s.masa_id}::uuid`
        : sql`yonlendirme = 'yonetici'`;
  const [r] = await tx.execute<{ n: number; medyan: number | null }>(sql`
    select count(*)::int as n,
           round(percentile_cont(0.5) within group (order by extract(epoch from (ilk_cevap_at - created_at))))::int as medyan
    from ogrenme.sorular
    where kurum_id = ${kurumId}::uuid and ilk_cevap_at is not null
      and created_at > now() - make_interval(days => ${SORU_TAHMIN_PENCERE_GUN}::int)
      and ${hedefKosulu}`);
  const n = r?.n ?? 0;
  const sure = n >= SORU_TAHMIN_EN_AZ_ORNEK ? (r?.medyan ?? null) : null;

  let musait: boolean | null = null;
  if (s.yonlendirme !== 'yonetici') {
    const z = await yerelZaman(tx, kurumId);
    const hedefler = await hedefOgretmenIdleri(tx, kurumId, s);
    if (hedefler.length > 0) {
      const [m] = await tx.execute<{ musait_degil: number }>(sql`
        select count(*)::int as musait_degil from ogrenme.soru_ogretmen_durumlari
        where kurum_id = ${kurumId}::uuid and musait_degil_tarihi = ${z.gun}::date
          and ogretmen_id in (${sql.join(
            hedefler.map((h) => sql`${h}::uuid`),
            sql`, `,
          )})`);
      musait = (m?.musait_degil ?? 0) < hedefler.length;
    }
  }
  return { sure_sn: sure, ornek_sayisi: n, hedef_musait: musait };
}

// --- Gorunurluk ve kuyruk kosullari ------------------------------------------------------------

const benimMasalarim = (tx: Tx, y: YetkiBaglami) =>
  tx
    .select({ id: soruMasasiUyeleri.masa_id })
    .from(soruMasasiUyeleri)
    .where(eq(soruMasasiUyeleri.ogretmen_id, y.uyelikId));

/**
 * Soru okuma kapsami: ogrenci yalniz kendi sorusunu; sahip/yonetici (`soru.yonet`) kurumdaki hepsini;
 * ogretmen yalniz kendisine yonlenen, ustlendigi, cevapladigi ya da masasindaki sorulari. Kapsam disi 404.
 */
export function gorunurlukKosulu(tx: Tx, y: YetkiBaglami): SQL | undefined {
  if (y.rol === 'ogrenci') return eq(sorular.ogrenci_id, y.uyelikId);
  if (yonetimYetkisi(y)) return undefined;
  return or(
    eq(sorular.atanan_ogretmen_id, y.uyelikId),
    eq(sorular.ustlenen_id, y.uyelikId),
    eq(sorular.ilk_cevaplayan_id, y.uyelikId),
    inArray(sorular.masa_id, benimMasalarim(tx, y)),
  );
}

/**
 * "Benim cevap kuyrugum": kendisine atanan, uyesi oldugu masada (ustlenen yok ya da kendisi) ve (yonetim
 * yetkisi varsa) yonetici kuyrugundaki sorular.
 */
export function kuyrukKosulu(tx: Tx, y: YetkiBaglami): SQL {
  const kosullar: (SQL | undefined)[] = [
    eq(sorular.atanan_ogretmen_id, y.uyelikId),
    and(
      inArray(sorular.masa_id, benimMasalarim(tx, y)),
      or(isNull(sorular.ustlenen_id), eq(sorular.ustlenen_id, y.uyelikId)),
    ),
    yonetimYetkisi(y) ? eq(sorular.yonlendirme, 'yonetici') : undefined,
  ];
  return or(...kosullar) ?? sql`false`;
}
