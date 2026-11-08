import { finansKrediAzaldiV1, type KrediPolitikasiKismi } from '@kopru/contracts';
import type { Tx } from '@kopru/service-kit';
import { and, asc, eq, sql } from 'drizzle-orm';

import {
  bakiyeHareketleri,
  krediHareketleri,
  krediPolitikalari,
  ogrenciFinansProfilleri,
  ucretTarifeleri,
} from '../../db/schema.js';
import { modulAcikMi } from '../hesap/index.js';
import {
  bakiyeSatiriYaz,
  bakiyeTersiYok,
  krediSatiriYaz,
  krediTersiYok,
  type KrediHareketSatiri,
} from './defter.js';
import { aktorOlarak, kilitAl, olayYaz } from './ortak.js';

/**
 * Yoklama ve ders iptali kaynakli kredi/ucret etkisi. `ders` modulunun (yoklama paketi) ayni
 * islemde cagirdigi ic API; `finans` modulunun `index.ts`i uzerinden acilir.
 *
 * Ilkeler:
 *  - Yoklama asla reddedilmez: havuz yoksa `paket_satisi_id NULL` ile negatif bakiyeye dusulur.
 *  - `finans` modulu kapaliysa tum fonksiyonlar etkisizdir (no-op).
 *  - Idempotent: ayni girdi ikinci kez gelirse tekillik indeksleri yuzunden ikinci satir olusmaz.
 *  - Duzeltme ters kayitla yapilir; etkin dusum varken durum artik dusurmuyorsa `iade` eklenir.
 */

export type YoklamaDurumu = 'geldi' | 'gelmedi' | 'izinli' | 'gec';

export interface KrediPolitikasi {
  geldi_dusurur: boolean;
  gec_dusurur: boolean;
  gelmedi_dusurur: boolean;
  izinli_dusurur: boolean;
  ogrenci_gec_iptal_dusurur: boolean;
  gec_iptal_saat: number;
  dusuk_kredi_esigi: number;
}

export const VARSAYILAN_POLITIKA: KrediPolitikasi = {
  geldi_dusurur: true,
  gec_dusurur: true,
  gelmedi_dusurur: true,
  izinli_dusurur: false,
  ogrenci_gec_iptal_dusurur: true,
  gec_iptal_saat: 24,
  dusuk_kredi_esigi: 2,
};

const POLITIKA_ANAHTARLARI = [
  'geldi_dusurur',
  'gec_dusurur',
  'gelmedi_dusurur',
  'izinli_dusurur',
  'ogrenci_gec_iptal_dusurur',
] as const;

/** Kurum politikasi (satir yoksa varsayilan). */
export async function kurumPolitikasiGetir(
  tx: Tx,
  kurumId: string,
): Promise<KrediPolitikasi & { varsayilan: boolean }> {
  const [satir] = await tx
    .select()
    .from(krediPolitikalari)
    .where(eq(krediPolitikalari.kurum_id, kurumId));
  if (!satir) return { ...VARSAYILAN_POLITIKA, varsayilan: true };
  return {
    geldi_dusurur: satir.geldi_dusurur,
    gec_dusurur: satir.gec_dusurur,
    gelmedi_dusurur: satir.gelmedi_dusurur,
    izinli_dusurur: satir.izinli_dusurur,
    ogrenci_gec_iptal_dusurur: satir.ogrenci_gec_iptal_dusurur,
    gec_iptal_saat: satir.gec_iptal_saat,
    dusuk_kredi_esigi: satir.dusuk_kredi_esigi,
    varsayilan: false,
  };
}

/** Politika cozumu, alan alan: paket anahtari varsa o, yoksa kurum satiri, yoksa varsayilan. */
export function politikaCoz(
  kurum: KrediPolitikasi,
  paket: KrediPolitikasiKismi | null,
): KrediPolitikasi {
  const sonuc = { ...kurum };
  if (paket) {
    for (const anahtar of POLITIKA_ANAHTARLARI) {
      const deger = paket[anahtar];
      if (typeof deger === 'boolean') sonuc[anahtar] = deger;
    }
  }
  return sonuc;
}

export function durumDusurur(durum: YoklamaDurumu | null, p: KrediPolitikasi): boolean {
  switch (durum) {
    case 'geldi':
      return p.geldi_dusurur;
    case 'gec':
      return p.gec_dusurur;
    case 'gelmedi':
      return p.gelmedi_dusurur;
    case 'izinli':
      return p.izinli_dusurur;
    case null:
      return false;
  }
}

/** Ogrenci kaynakli iptalin "gec" sayilacagi saat siniri (ders baslangicina kalan saat). */
export async function gecIptalSaatiBul(tx: Tx, kurumId: string): Promise<number> {
  return (await kurumPolitikasiGetir(tx, kurumId)).gec_iptal_saat;
}

interface Havuz {
  id: string;
  kredi_politikasi: KrediPolitikasiKismi | null;
}

/** Paket havuzunun politikasi (paket sablonu `kredi_politikasi`); sablonsuz/NULL ise `null`. */
async function havuzPolitikasi(
  tx: Tx,
  kurumId: string,
  paketSatisiId: string | null,
): Promise<KrediPolitikasiKismi | null> {
  if (!paketSatisiId) return null;
  const satirlar = await tx.execute<{ kredi_politikasi: KrediPolitikasiKismi | null }>(sql`
    select p.kredi_politikasi
    from finans.paket_satislari ps
    left join finans.paketler p on p.kurum_id = ps.kurum_id and p.id = ps.paket_id
    where ps.kurum_id = ${kurumId} and ps.id = ${paketSatisiId}`);
  return satirlar[0]?.kredi_politikasi ?? null;
}

interface DersBaglami {
  dersYerelTarih: string;
  grupTuru: string | null;
  bransKodu: string | null;
}

/**
 * Dusum havuzu: `durum='aktif'`, bitisi gecmemis, kredisi kalmis ve grup turu/brans uyan satislar
 * arasinda `bitis_tarihi` en yakin olan (NULL en sona). Satir kilitlenir: ayni ogrencinin esanli
 * iki yoklamasi son krediyi iki kez almasin. Havuz yoksa `null` (negatif bakiye).
 */
async function havuzSec(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
  d: DersBaglami,
): Promise<Havuz | null> {
  const satirlar = await tx.execute<{
    id: string;
    kredi_politikasi: KrediPolitikasiKismi | null;
  }>(sql`
    select ps.id, p.kredi_politikasi
    from finans.paket_satislari ps
    left join finans.paketler p on p.kurum_id = ps.kurum_id and p.id = ps.paket_id
    where ps.kurum_id = ${kurumId} and ps.ogrenci_id = ${ogrenciId} and ps.durum = 'aktif'
      and (ps.bitis_tarihi is null or ps.bitis_tarihi >= ${d.dersYerelTarih}::date)
      and (p.id is null or p.grup_turu is null or p.grup_turu is not distinct from ${d.grupTuru})
      and (p.id is null or p.brans_kodu is null or p.brans_kodu is not distinct from ${d.bransKodu})
      and (select coalesce(sum(k.miktar), 0) from finans.kredi_hareketleri k
           where k.kurum_id = ps.kurum_id and k.paket_satisi_id = ps.id) > 0
    order by ps.bitis_tarihi asc nulls last, ps.id asc
    limit 1
    for update of ps`);
  const satir = satirlar[0];
  return satir ? { id: satir.id, kredi_politikasi: satir.kredi_politikasi } : null;
}

/** Tarife secimi (docs/schema/api.md): ogrenci > grup > yalniz brans > kurum varsayilani; ayni ozgullukte en yeni. */
async function tarifeSec(
  tx: Tx,
  kurumId: string,
  g: { ogrenciId: string; grupId: string | null } & DersBaglami,
): Promise<number | null> {
  const [satir] = await tx
    .select({ ucret: ucretTarifeleri.ucret_kurus })
    .from(ucretTarifeleri)
    .where(
      and(
        eq(ucretTarifeleri.kurum_id, kurumId),
        sql`(${ucretTarifeleri.ogrenci_id} is null or ${ucretTarifeleri.ogrenci_id} = ${g.ogrenciId})`,
        sql`(${ucretTarifeleri.grup_id} is null or ${ucretTarifeleri.grup_id} is not distinct from ${g.grupId})`,
        sql`(${ucretTarifeleri.brans_kodu} is null or ${ucretTarifeleri.brans_kodu} is not distinct from ${g.bransKodu})`,
        sql`${ucretTarifeleri.gecerlilik_baslangic} <= ${g.dersYerelTarih}::date`,
        sql`(${ucretTarifeleri.gecerlilik_bitis} is null or ${ucretTarifeleri.gecerlilik_bitis} >= ${g.dersYerelTarih}::date)`,
      ),
    )
    .orderBy(
      sql`(${ucretTarifeleri.ogrenci_id} is not null) desc`,
      sql`(${ucretTarifeleri.grup_id} is not null) desc`,
      sql`(${ucretTarifeleri.brans_kodu} is not null) desc`,
      sql`${ucretTarifeleri.gecerlilik_baslangic} desc`,
      asc(ucretTarifeleri.id),
    )
    .limit(1);
  return satir ? satir.ucret : null;
}

async function ogrenciModeli(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
): Promise<'paket' | 'ders_basi' | 'yok'> {
  const [satir] = await tx
    .select({ model: ogrenciFinansProfilleri.model })
    .from(ogrenciFinansProfilleri)
    .where(
      and(
        eq(ogrenciFinansProfilleri.kurum_id, kurumId),
        eq(ogrenciFinansProfilleri.ogrenci_id, ogrenciId),
      ),
    );
  const model = satir?.model;
  return model === 'paket' || model === 'ders_basi' ? model : 'yok';
}

export interface KrediAzaldiBilgisi {
  kalan_kredi: number;
  esik: number;
}

export interface FinansUygulaSonucu {
  uyari?: 'ucret_tarifesi_yok';
  /** Bakiye dusuk kredi esigini bu hareketle gecti (olay yayimlandi). */
  kredi_azaldi?: KrediAzaldiBilgisi;
  /** Bu cagri kredi bakiyesini degistirdiyse guncel kalan kredi. */
  kalan_kredi?: number;
}

interface OrtakGirdi {
  kurumId: string;
  dersId: string;
  ogrenciId: string;
  dersYerelTarih: string;
  grupId: string | null;
  bransKodu: string | null;
  grupTuru: string | null;
  aktorKullaniciId: string | null;
  correlationId?: string;
}

export interface KrediVeUcretiUygulaGirdi extends OrtakGirdi {
  yoklamaId: string;
  yoklamaSurumu: number;
  /** `null`: yoklama yok (silindi); etkin dusum/ucret varsa ters cevrilir. */
  durum: YoklamaDurumu | null;
}

export interface DersIptalUygulaGirdi extends OrtakGirdi {
  iptalKaynagi: 'ogretmen' | 'yonetici' | 'ogrenci';
  /** `gecIptalSaatiBul` ile karsilastirilarak ders cagrisi tarafindan hesaplanir. */
  gecIptal: boolean;
}

/** Kredi dusumu esigi gectiyse olayi yazar ve bilgiyi dondurur. */
async function esikKontrolu(
  tx: Tx,
  g: OrtakGirdi,
  esik: number,
  yoklamaId: string | null,
  onceki: number,
  yeni: number,
): Promise<KrediAzaldiBilgisi | undefined> {
  if (!(onceki > esik && yeni <= esik)) return undefined;
  await olayYaz(
    tx,
    finansKrediAzaldiV1.create({
      kurumId: g.kurumId,
      actor: aktorOlarak(g.aktorKullaniciId),
      correlationId: g.correlationId ?? yoklamaId ?? g.dersId,
      data: { ogrenci_id: g.ogrenciId, kalan_kredi: yeni, esik, yoklama_id: yoklamaId },
    }),
  );
  return { kalan_kredi: yeni, esik };
}

/** Bu kapsamdaki ters cevrilmemis kredi dusumu (yoklama dusumu ya da iptal dusumu). */
async function etkinKredi(
  tx: Tx,
  kurumId: string,
  kosul: ReturnType<typeof and>,
): Promise<KrediHareketSatiri | undefined> {
  const [satir] = await tx
    .select()
    .from(krediHareketleri)
    .where(and(eq(krediHareketleri.kurum_id, kurumId), krediTersiYok, kosul))
    .limit(1);
  return satir;
}

async function krediIade(
  tx: Tx,
  g: OrtakGirdi,
  etkin: KrediHareketSatiri,
  yoklamaSurumu: number | null,
  neden: string,
) {
  return krediSatiriYaz(tx, {
    kurumId: g.kurumId,
    ogrenciId: g.ogrenciId,
    paketSatisiId: etkin.paket_satisi_id,
    tur: 'iade',
    miktar: -etkin.miktar,
    dersId: etkin.ders_id,
    yoklamaId: etkin.yoklama_id,
    yoklamaSurumu,
    tersCevrilenId: etkin.id,
    neden,
    aktorKullaniciId: g.aktorKullaniciId,
  });
}

async function ucretTersCevir(
  tx: Tx,
  g: OrtakGirdi,
  etkinId: string,
  tutarKurus: number,
  neden: string,
) {
  return bakiyeSatiriYaz(tx, {
    kurumId: g.kurumId,
    ogrenciId: g.ogrenciId,
    tur: 'ters_kayit',
    tutarKurus: -tutarKurus,
    kaynakTuru: 'yoklama',
    tersCevrilenId: etkinId,
    neden,
    aktorKullaniciId: g.aktorKullaniciId,
  });
}

export async function krediVeUcretiUygula(
  tx: Tx,
  girdi: KrediVeUcretiUygulaGirdi,
): Promise<FinansUygulaSonucu> {
  const { kurumId, ogrenciId, yoklamaId, yoklamaSurumu, durum } = girdi;
  if (!(await modulAcikMi(tx, kurumId, 'finans', { grupId: girdi.grupId }))) return {};
  await kilitAl(tx, `finans:yoklama:${yoklamaId}:${ogrenciId}`);

  const sonuc: FinansUygulaSonucu = {};
  const kurumPol = await kurumPolitikasiGetir(tx, kurumId);
  const model = await ogrenciModeli(tx, kurumId, ogrenciId);

  // --- Kredi (paket modeli) ----------------------------------------------------------------
  const etkinDusum = await etkinKredi(
    tx,
    kurumId,
    and(eq(krediHareketleri.yoklama_id, yoklamaId), eq(krediHareketleri.tur, 'dusum')),
  );
  if (etkinDusum) {
    const pol = politikaCoz(
      kurumPol,
      await havuzPolitikasi(tx, kurumId, etkinDusum.paket_satisi_id),
    );
    if (!durumDusurur(durum, pol)) {
      const iade = await krediIade(tx, girdi, etkinDusum, yoklamaSurumu, 'yoklama_duzeltildi');
      if (iade) sonuc.kalan_kredi = iade.yeni;
    }
  } else if (model === 'paket' && durum !== null) {
    const havuz = await havuzSec(tx, kurumId, ogrenciId, girdi);
    const pol = politikaCoz(kurumPol, havuz?.kredi_politikasi ?? null);
    if (durumDusurur(durum, pol)) {
      const dusum = await krediSatiriYaz(tx, {
        kurumId,
        ogrenciId,
        paketSatisiId: havuz?.id ?? null,
        tur: 'dusum',
        miktar: -1,
        dersId: girdi.dersId,
        yoklamaId,
        yoklamaSurumu,
        aktorKullaniciId: girdi.aktorKullaniciId,
      });
      if (dusum) {
        sonuc.kalan_kredi = dusum.yeni;
        const bilgi = await esikKontrolu(
          tx,
          girdi,
          pol.dusuk_kredi_esigi,
          yoklamaId,
          dusum.onceki,
          dusum.yeni,
        );
        if (bilgi) sonuc.kredi_azaldi = bilgi;
      }
    }
  }

  // --- Ucret (ders basi modeli) ------------------------------------------------------------
  const [etkinUcret] = await tx
    .select()
    .from(bakiyeHareketleri)
    .where(
      and(
        eq(bakiyeHareketleri.kurum_id, kurumId),
        eq(bakiyeHareketleri.yoklama_id, yoklamaId),
        eq(bakiyeHareketleri.tur, 'ders_ucreti'),
        bakiyeTersiYok,
      ),
    )
    .limit(1);
  if (etkinUcret) {
    if (!durumDusurur(durum, kurumPol)) {
      await ucretTersCevir(tx, girdi, etkinUcret.id, etkinUcret.tutar_kurus, 'yoklama_duzeltildi');
    }
  } else if (model === 'ders_basi' && durum !== null && durumDusurur(durum, kurumPol)) {
    const ucret = await tarifeSec(tx, kurumId, girdi);
    if (ucret === null) {
      sonuc.uyari = 'ucret_tarifesi_yok';
    } else if (ucret > 0) {
      await bakiyeSatiriYaz(tx, {
        kurumId,
        ogrenciId,
        tur: 'ders_ucreti',
        tutarKurus: -ucret,
        kaynakTuru: 'yoklama',
        kaynakId: yoklamaId,
        dersId: girdi.dersId,
        yoklamaId,
        yoklamaSurumu,
        aktorKullaniciId: girdi.aktorKullaniciId,
      });
    }
  }
  return sonuc;
}

/**
 * Ders iptali (`durum='iptal'`), katilimci basina. Ogretmen/yonetici iptalinde hicbir kosulda kredi
 * ya da ucret dusmez ve etkin dusum varsa ters cevrilir. Ogrenci iptalinde yalnizca gec iptal ve
 * politika `ogrenci_gec_iptal_dusurur` ise `iptal_dusum` (ders basi modelinde `ders_ucreti`) eklenir.
 */
export async function dersIptalUygula(
  tx: Tx,
  girdi: DersIptalUygulaGirdi,
): Promise<FinansUygulaSonucu> {
  const { kurumId, ogrenciId, dersId } = girdi;
  if (!(await modulAcikMi(tx, kurumId, 'finans', { grupId: girdi.grupId }))) return {};
  await kilitAl(tx, `finans:ders-iptal:${dersId}:${ogrenciId}`);

  const sonuc: FinansUygulaSonucu = {};
  const kurumPol = await kurumPolitikasiGetir(tx, kurumId);
  const model = await ogrenciModeli(tx, kurumId, ogrenciId);
  const ogrenciGec = girdi.iptalKaynagi === 'ogrenci' && girdi.gecIptal;

  // Dersin etkin kredi dusumu (yoklama dusumu ya da onceki iptal dusumu).
  const etkinler = await tx
    .select()
    .from(krediHareketleri)
    .where(
      and(
        eq(krediHareketleri.kurum_id, kurumId),
        eq(krediHareketleri.ders_id, dersId),
        eq(krediHareketleri.ogrenci_id, ogrenciId),
        sql`${krediHareketleri.tur} in ('dusum', 'iptal_dusum')`,
        krediTersiYok,
      ),
    );
  let iptalDusumuVar = false;
  for (const e of etkinler) {
    const pol = politikaCoz(kurumPol, await havuzPolitikasi(tx, kurumId, e.paket_satisi_id));
    const koru = e.tur === 'iptal_dusum' && ogrenciGec && pol.ogrenci_gec_iptal_dusurur;
    if (koru) {
      iptalDusumuVar = true;
      continue;
    }
    const iade = await krediIade(tx, girdi, e, null, 'ders_iptal_edildi');
    if (iade) sonuc.kalan_kredi = iade.yeni;
  }

  if (ogrenciGec && model === 'paket' && !iptalDusumuVar) {
    const havuz = await havuzSec(tx, kurumId, ogrenciId, girdi);
    const pol = politikaCoz(kurumPol, havuz?.kredi_politikasi ?? null);
    if (pol.ogrenci_gec_iptal_dusurur) {
      const dusum = await krediSatiriYaz(tx, {
        kurumId,
        ogrenciId,
        paketSatisiId: havuz?.id ?? null,
        tur: 'iptal_dusum',
        miktar: -1,
        dersId,
        aktorKullaniciId: girdi.aktorKullaniciId,
      });
      if (dusum) {
        sonuc.kalan_kredi = dusum.yeni;
        const bilgi = await esikKontrolu(
          tx,
          girdi,
          pol.dusuk_kredi_esigi,
          null,
          dusum.onceki,
          dusum.yeni,
        );
        if (bilgi) sonuc.kredi_azaldi = bilgi;
      }
    }
  }

  // Ucret: dersin etkin ucretleri (yoklama ya da iptal kaynakli).
  const ucretler = await tx
    .select()
    .from(bakiyeHareketleri)
    .where(
      and(
        eq(bakiyeHareketleri.kurum_id, kurumId),
        eq(bakiyeHareketleri.ders_id, dersId),
        eq(bakiyeHareketleri.ogrenci_id, ogrenciId),
        eq(bakiyeHareketleri.tur, 'ders_ucreti'),
        bakiyeTersiYok,
      ),
    );
  let iptalUcretiVar = false;
  for (const u of ucretler) {
    if (u.kaynak_turu === 'ders_iptal' && ogrenciGec && kurumPol.ogrenci_gec_iptal_dusurur) {
      iptalUcretiVar = true;
      continue;
    }
    await ucretTersCevir(tx, girdi, u.id, u.tutar_kurus, 'ders_iptal_edildi');
  }
  if (
    ogrenciGec &&
    model === 'ders_basi' &&
    !iptalUcretiVar &&
    kurumPol.ogrenci_gec_iptal_dusurur
  ) {
    const ucret = await tarifeSec(tx, kurumId, girdi);
    if (ucret === null) {
      sonuc.uyari = 'ucret_tarifesi_yok';
    } else if (ucret > 0) {
      await bakiyeSatiriYaz(tx, {
        kurumId,
        ogrenciId,
        tur: 'ders_ucreti',
        tutarKurus: -ucret,
        kaynakTuru: 'ders_iptal',
        kaynakId: dersId,
        dersId,
        aktorKullaniciId: girdi.aktorKullaniciId,
      });
    }
  }
  return sonuc;
}
