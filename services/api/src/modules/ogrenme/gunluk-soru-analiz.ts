import {
  GUNLUK_SORU_DONEM_GUN,
  errorCodes,
  type AnalizDonemiSema,
  type AnalizZorlugu,
  type BantTespiti,
  type Hucre,
  type KonuAnaliziSema,
  type Oneri,
  type Zorluk,
} from '@kopru/contracts';
import { AppError, type Tx } from '@kopru/service-kit';
import { sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';

import {
  BIREBIR_PENCERE_GUN,
  SINIF_EN_COK_ZORLANILAN,
  SINIF_KONU_EN_AZ_SORU,
  SINIF_ZORLANAN_BASARI_ESIGI,
  SINIF_ZORLANAN_EN_AZ_SORU,
  SINIF_ZORLANILAN_KONU_BASARI_ESIGI,
  bantTespit,
  basariOrani,
  birebirDersGerekli,
  gorevOner,
  type BantHaritasi,
} from './gunluk-soru-bant.js';
import { PLAN_SAAT_DILIMI, gunFarki, planBugunu, tarihEkle } from './plan-zaman.js';

/**
 * Konu analizi sorgulari ve birlestirme. Kaynaklar (docs/schema/api.md): gunluk kayitlar (zorluk bilgili) ve
 * teslim edilmis odevler (`dogru_sayisi` girilmis, konusu olan; zorluk "belirtilmemis"). Plan gorevi
 * gerceklesenleri ayri satir degildir: plana bagli gunluk kayit zaten gunluk kaynaktadir (cifte sayim olmaz).
 */

export const MAKSIMUM_ARALIK_GUN = 366;
const ZORLUK_ANAHTARLARI = ['kolay', 'orta', 'zor', 'belirtilmemis'] as const;
const ODEV_TESLIM_DURUMLARI = sql`('teslim_edildi', 'incelendi', 'tekrar_istendi')`;

export interface AnalizSatiri {
  ogrenci_id: string;
  brans_kodu: string;
  konu_id: string;
  zorluk: AnalizZorlugu;
  cozulen: number;
  dogru: number;
  yanlis: number;
  bos: number;
}

export interface Aralik {
  bas: string;
  bit: string;
}

type Donem = z.infer<typeof AnalizDonemiSema>;

/** `bas`/`bit` verilmisse onceliklidir; yoksa `donem` (7/30/donem) bitis gunu bugunden geriye. */
export function aralikCoz(
  s: { donem: Donem; bas?: string | undefined; bit?: string | undefined },
  bugun: string = planBugunu(),
): Aralik {
  const bit = s.bit ?? bugun;
  const gun = s.donem === 'donem' ? GUNLUK_SORU_DONEM_GUN : Number(s.donem);
  const bas = s.bas ?? tarihEkle(bit, -(gun - 1));
  if (bas > bit) {
    throw new AppError(422, errorCodes.validation, 'Başlangıç tarihi bitişten sonra olamaz.');
  }
  if (gunFarki(bas, bit) + 1 > MAKSIMUM_ARALIK_GUN) {
    throw new AppError(
      422,
      errorCodes.validation,
      `Tarih aralığı en çok ${String(MAKSIMUM_ARALIK_GUN)} gün olabilir.`,
    );
  }
  return { bas, bit };
}

const idListesi = (idler: readonly string[]): SQL =>
  sql.join(
    idler.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

/**
 * (ogrenci, brans, konu, zorluk) bazinda toplamlar; tek SQL (UNION ALL). Odev teslimi: `dogru_sayisi`
 * girilmis ve konusu olan teslimler; yanlis girilmemisse `yapilan - dogru - bos`.
 */
export async function analizSatirlari(
  tx: Tx,
  kurumId: string,
  ogrenciIdleri: readonly string[],
  f: { bransKodu?: string | undefined; konuId?: string | undefined } & Aralik,
): Promise<AnalizSatiri[]> {
  if (ogrenciIdleri.length === 0) return [];
  const ids = idListesi(ogrenciIdleri);
  const gBrans = f.bransKodu ? sql`and k.brans_kodu = ${f.bransKodu}` : sql``;
  const oBrans = f.bransKodu ? sql`and o.brans_kodu = ${f.bransKodu}` : sql``;
  const gKonu = f.konuId ? sql`and k.konu_id = ${f.konuId}::uuid` : sql``;
  const oKonu = f.konuId ? sql`and o.konu_id = ${f.konuId}::uuid` : sql``;
  const satirlar = await tx.execute<
    {
      ogrenci_id: string;
      brans_kodu: string;
      konu_id: string;
      zorluk: AnalizZorlugu;
      cozulen: number;
      dogru: number;
      yanlis: number;
      bos: number;
    } & Record<string, unknown>
  >(sql`
    select k.ogrenci_id, k.brans_kodu, k.konu_id, k.zorluk,
           sum(k.toplam)::int as cozulen, sum(k.dogru)::int as dogru,
           sum(k.yanlis)::int as yanlis, sum(k.bos)::int as bos
      from ogrenme.gunluk_soru_kayitlari k
     where k.kurum_id = ${kurumId}::uuid and k.ogrenci_id in (${ids})
       and k.gun >= ${f.bas}::date and k.gun <= ${f.bit}::date ${gBrans} ${gKonu}
     group by k.ogrenci_id, k.brans_kodu, k.konu_id, k.zorluk
    union all
    select t.ogrenci_id, t.brans_kodu, t.konu_id, 'belirtilmemis' as zorluk,
           sum(t.dogru + t.yanlis + t.bos)::int, sum(t.dogru)::int, sum(t.yanlis)::int, sum(t.bos)::int
      from (
        select s.ogrenci_id, o.brans_kodu, o.konu_id,
               s.dogru_sayisi as dogru,
               coalesce(s.yanlis_sayisi, greatest(0, s.yapilan_soru_sayisi - s.dogru_sayisi - coalesce(s.bos_sayisi, 0))) as yanlis,
               coalesce(s.bos_sayisi, 0) as bos
          from ogrenme.ogrenci_odevleri s
          join ogrenme.odevler o on o.id = s.odev_id
         where s.kurum_id = ${kurumId}::uuid and s.ogrenci_id in (${ids})
           and s.durum in ${ODEV_TESLIM_DURUMLARI}
           and s.dogru_sayisi is not null and s.yapilan_soru_sayisi > 0 and o.konu_id is not null
           and (s.teslim_at at time zone ${PLAN_SAAT_DILIMI})::date >= ${f.bas}::date
           and (s.teslim_at at time zone ${PLAN_SAAT_DILIMI})::date <= ${f.bit}::date ${oBrans} ${oKonu}
      ) t
     group by t.ogrenci_id, t.brans_kodu, t.konu_id`);
  return satirlar.map((s) => ({
    ogrenci_id: s.ogrenci_id,
    brans_kodu: s.brans_kodu,
    konu_id: s.konu_id,
    zorluk: s.zorluk,
    cozulen: s.cozulen,
    dogru: s.dogru,
    yanlis: s.yanlis,
    bos: s.bos,
  }));
}

// --- Birlestirme -----------------------------------------------------------------------------

export const bosHucre = (): Hucre => ({ cozulen: 0, dogru: 0, yanlis: 0, bos: 0, basari: null });

export function hucreEkle(h: Hucre, s: Pick<AnalizSatiri, 'cozulen' | 'dogru' | 'yanlis' | 'bos'>) {
  h.cozulen += s.cozulen;
  h.dogru += s.dogru;
  h.yanlis += s.yanlis;
  h.bos += s.bos;
  h.basari = basariOrani(h.dogru, h.cozulen);
}

export type HucreHaritasi = Record<AnalizZorlugu, Hucre>;
export const bosHucreler = (): HucreHaritasi => ({
  kolay: bosHucre(),
  orta: bosHucre(),
  zor: bosHucre(),
  belirtilmemis: bosHucre(),
});

/** `bantTespit` girdisi: yalniz zorluk bilgili bantlar (belirtilmemis hariç). */
export const bantGirdisi = (h: HucreHaritasi): BantHaritasi => ({
  kolay: { cozulen: h.kolay.cozulen, dogru: h.kolay.dogru },
  orta: { cozulen: h.orta.cozulen, dogru: h.orta.dogru },
  zor: { cozulen: h.zor.cozulen, dogru: h.zor.dogru },
});

export interface KonuAdi {
  ad: string;
  ust_ad: string | null;
}

/** Konu adlari (ve ust konu adi); RLS global ve kendi kurum konularini gosterir. */
export async function konuAdlari(tx: Tx, idler: readonly string[]): Promise<Map<string, KonuAdi>> {
  if (idler.length === 0) return new Map();
  const satirlar = await tx.execute<
    { id: string; ad: string; ust_ad: string | null } & Record<string, unknown>
  >(sql`
    select k.id, k.ad, u.ad as ust_ad
      from ogrenme.konular k left join ogrenme.konular u on u.id = k.ust_id
     where k.id in (${idListesi([...new Set(idler)])})`);
  return new Map(satirlar.map((s) => [s.id, { ad: s.ad, ust_ad: s.ust_ad }]));
}

export type KonuAnalizi = z.infer<typeof KonuAnaliziSema>;

/** Tek ogrencinin satirlarindan konu x zorluk tablosu (cozulene gore azalan) ve genel toplam. */
export function konuTablosu(
  satirlar: readonly AnalizSatiri[],
  adlar: Map<string, KonuAdi>,
): { konular: KonuAnalizi[]; toplam: Hucre } {
  const konular = new Map<string, HucreHaritasi>();
  const toplam = bosHucre();
  for (const s of satirlar) {
    const h = konular.get(s.konu_id) ?? bosHucreler();
    konular.set(s.konu_id, h);
    hucreEkle(h[s.zorluk], s);
    hucreEkle(toplam, s);
  }
  const liste = [...konular.entries()].map(([konuId, hucreler]): KonuAnalizi => {
    const t = bosHucre();
    for (const z of ZORLUK_ANAHTARLARI) hucreEkle(t, hucreler[z]);
    return {
      konu_id: konuId,
      konu_ad: adlar.get(konuId)?.ad ?? null,
      ust_konu_ad: adlar.get(konuId)?.ust_ad ?? null,
      hucreler,
      toplam: t,
      bant: bantTespit(bantGirdisi(hucreler)),
    };
  });
  liste.sort(
    (a, b) =>
      b.toplam.cozulen - a.toplam.cozulen || (a.konu_ad ?? '').localeCompare(b.konu_ad ?? '', 'tr'),
  );
  return { konular: liste, toplam };
}

/**
 * Ogretmen/yonetici onerileri: zorlanilan bant icin "gorev oner" ve son 14 gunde zor bantta "birebir ders
 * gerekebilir". Birebir icin ayri 14 gunluk pencere sorgulanir (secilen aralikla ilgisiz). Sira: birebir
 * once, sonra basarisi dusukten yuksege "gorev oner".
 */
export async function onerileriUret(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
  bransKodu: string,
  konular: readonly KonuAnalizi[],
  bugun: string = planBugunu(),
): Promise<Oneri[]> {
  const bilgi = (k: KonuAnalizi) => ({
    brans_kodu: bransKodu,
    konu_id: k.konu_id,
    konu_ad: k.konu_ad,
  });
  const gorevler = konular.flatMap((k) => {
    const o = gorevOner(bilgi(k), k.bant);
    return o ? [o] : [];
  });
  gorevler.sort((a, b) =>
    a.tur === 'gorev_oner' && b.tur === 'gorev_oner' ? (a.basari ?? 1) - (b.basari ?? 1) : 0,
  );

  const sonHaftaBas = tarihEkle(bugun, -6);
  const pencereBas = tarihEkle(bugun, -(BIREBIR_PENCERE_GUN - 1));
  const zor = await tx.execute<
    { konu_id: string; son: boolean; cozulen: number; dogru: number } & Record<string, unknown>
  >(sql`
    select t.konu_id, t.son, sum(t.toplam)::int as cozulen, sum(t.dogru)::int as dogru
      from (
        select k.konu_id, (k.gun >= ${sonHaftaBas}::date) as son, k.toplam, k.dogru
          from ogrenme.gunluk_soru_kayitlari k
         where k.kurum_id = ${kurumId}::uuid and k.ogrenci_id = ${ogrenciId}::uuid
           and k.brans_kodu = ${bransKodu} and k.zorluk = 'zor'
           and k.gun >= ${pencereBas}::date and k.gun <= ${bugun}::date
      ) t
     group by t.konu_id, t.son`);
  const adlar = await konuAdlari(
    tx,
    zor.map((z) => z.konu_id),
  );
  const haftalar = new Map<string, { onceki: Hucre; son: Hucre }>();
  for (const z of zor) {
    const h = haftalar.get(z.konu_id) ?? { onceki: bosHucre(), son: bosHucre() };
    haftalar.set(z.konu_id, h);
    hucreEkle(z.son ? h.son : h.onceki, { cozulen: z.cozulen, dogru: z.dogru, yanlis: 0, bos: 0 });
  }
  const birebir: Oneri[] = [];
  for (const [konuId, h] of haftalar) {
    const o = birebirDersGerekli(
      { brans_kodu: bransKodu, konu_id: konuId, konu_ad: adlar.get(konuId)?.ad ?? null },
      {
        onceki: { cozulen: h.onceki.cozulen, dogru: h.onceki.dogru },
        son: { cozulen: h.son.cozulen, dogru: h.son.dogru },
      },
    );
    if (o) birebir.push(o);
  }
  birebir.sort((a, b) =>
    a.tur === 'birebir_ders' && b.tur === 'birebir_ders' ? a.zor_basari - b.zor_basari : 0,
  );
  return [...birebir, ...gorevler];
}

// --- Sinif -----------------------------------------------------------------------------------

export interface SinifKonuSatiri {
  konu_id: string;
  konu_ad: string | null;
  ogrenci_sayisi: number;
  zorlanan_ogrenci_sayisi: number;
  hucreler: HucreHaritasi;
  toplam: Hucre;
}

/** Grup satirlarindan konu bazinda toplam, kayit giren ogrenci ve zorlanan ogrenci sayisi. */
export function sinifTablosu(
  satirlar: readonly AnalizSatiri[],
  adlar: Map<string, KonuAdi>,
): { konular: SinifKonuSatiri[]; enCokZorlanilan: SinifKonuSatiri[]; toplam: Hucre } {
  const konular = new Map<string, { hucreler: HucreHaritasi; ogrenciler: Map<string, Hucre> }>();
  const yeniKonu = (): { hucreler: HucreHaritasi; ogrenciler: Map<string, Hucre> } => ({
    hucreler: bosHucreler(),
    ogrenciler: new Map<string, Hucre>(),
  });
  const toplam = bosHucre();
  for (const s of satirlar) {
    const k = konular.get(s.konu_id) ?? yeniKonu();
    konular.set(s.konu_id, k);
    hucreEkle(k.hucreler[s.zorluk], s);
    const o = k.ogrenciler.get(s.ogrenci_id) ?? bosHucre();
    k.ogrenciler.set(s.ogrenci_id, o);
    hucreEkle(o, s);
    hucreEkle(toplam, s);
  }
  const liste = [...konular.entries()].map(([konuId, k]): SinifKonuSatiri => {
    const t = bosHucre();
    for (const z of ZORLUK_ANAHTARLARI) hucreEkle(t, k.hucreler[z]);
    const zorlanan = [...k.ogrenciler.values()].filter(
      (o) =>
        o.cozulen >= SINIF_ZORLANAN_EN_AZ_SORU && (o.basari ?? 1) < SINIF_ZORLANAN_BASARI_ESIGI,
    ).length;
    return {
      konu_id: konuId,
      konu_ad: adlar.get(konuId)?.ad ?? null,
      ogrenci_sayisi: k.ogrenciler.size,
      zorlanan_ogrenci_sayisi: zorlanan,
      hucreler: k.hucreler,
      toplam: t,
    };
  });
  liste.sort(
    (a, b) =>
      b.toplam.cozulen - a.toplam.cozulen || (a.konu_ad ?? '').localeCompare(b.konu_ad ?? '', 'tr'),
  );
  const enCok = liste
    .filter(
      (k) =>
        k.toplam.cozulen >= SINIF_KONU_EN_AZ_SORU &&
        (k.toplam.basari ?? 1) < SINIF_ZORLANILAN_KONU_BASARI_ESIGI,
    )
    .sort(
      (a, b) =>
        (a.toplam.basari ?? 1) - (b.toplam.basari ?? 1) || b.toplam.cozulen - a.toplam.cozulen,
    )
    .slice(0, SINIF_EN_COK_ZORLANILAN);
  return { konular: liste, enCokZorlanilan: enCok, toplam };
}

export type { BantTespiti, Zorluk };
