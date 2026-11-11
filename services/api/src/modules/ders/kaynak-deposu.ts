import {
  DERS_OLAY_PARCA_BOYUTU,
  dersKaynakEklendiV1,
  dersKaynakIzlendiV1,
  dersKaynakSorunBildirildiV1,
  errorCodes,
  kaynakHataKodlari,
  type KaynakSaglayici,
} from '@kopru/contracts';
import { AppError, publishInTx, type Tx } from '@kopru/service-kit';
import {
  and,
  asc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import {
  dersKatilimcilari,
  dersKaynagiAlicilari,
  dersKaynagiIzlemeleri,
  type dersKaynagiSorunlari,
  dersKaynaklari,
  dersler,
  grupUyeleri,
} from '../../db/schema.js';
import {
  grupEtkinOgrencileri,
  kapsamdakiGruplar,
  modulAcikMi,
  type YetkiBaglami,
} from '../hesap/index.js';
import { OUTBOX_TABLOSU, katilimciIdleri, type DersOlayBaglami } from './ders-deposu.js';
import { grupModuluAcikOlmali } from './ders-ortak.js';
import { parolaCoz } from './kaynak-sifre.js';

export type KaynakSatiri = typeof dersKaynaklari.$inferSelect;
export type SorunSatiri = typeof dersKaynagiSorunlari.$inferSelect;

/** Satirla birlikte gelen ders bilgisi (materyalde `null`). */
export interface KaynakDers {
  ders_baslangic_at: Date | null;
  brans_kodu: string | null;
  ders_ogretmen_id: string | null;
}

/** `and` bos kalirsa (hicbir kosul yok) her satiri kabul eden kosul. */
const ve = (...kosullar: (SQL | undefined)[]): SQL => and(...kosullar) ?? sql`true`;

export const kaynakBulunamadi = () => new AppError(404, errorCodes.notFound, 'Kaynak bulunamadı.');

/** Ogrenci rolu (kapsam `kendi`) mu? `kayit.oku` ogrenci icin `kendi`, personel icin `grup`+ kapsamdadir. */
export const ogrenciGorunumu = (y: YetkiBaglami) => y.kapsam === 'kendi';

export function personelOlmali(y: YetkiBaglami): void {
  if (ogrenciGorunumu(y)) {
    throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
  }
}

export function ogrenciOlmali(y: YetkiBaglami): void {
  if (y.rol !== 'ogrenci') {
    throw new AppError(403, errorCodes.izinYok, 'Bu işlem yalnızca öğrenciler içindir.');
  }
}

// --- Yanit donusumleri -----------------------------------------------------------------------

export function kaynakTemeli(k: KaynakSatiri, d: KaynakDers) {
  return {
    id: k.id,
    tur: k.tur as 'kayit' | 'materyal',
    ders_id: k.ders_id,
    grup_id: k.grup_id,
    baslik: k.baslik,
    saglayici: k.saglayici as KaynakSaglayici,
    url: k.url,
    parola_var: k.parola_sifreli !== null,
    gecerlilik_bitis_at: k.gecerlilik_bitis_at?.toISOString() ?? null,
    gorunurluk: k.gorunurluk as 'ogretmen' | 'grup' | 'secili_ogrenciler',
    konu_id: k.konu_id,
    durum: k.durum as 'aktif' | 'suresi_doldu' | 'bozuk' | 'gizli',
    ekleyen_id: k.ekleyen_id,
    created_at: k.created_at.toISOString(),
    updated_at: k.updated_at.toISOString(),
    ders_baslangic_at: d.ders_baslangic_at?.toISOString() ?? null,
    brans_kodu: d.brans_kodu,
    ogretmen_id: d.ders_ogretmen_id ?? k.ekleyen_id,
  };
}

/** Parolayi cozer (yetki kontrolu cagirana aittir). Kayitli parola yoksa `null`. */
export const parolaOku = (k: KaynakSatiri): string | null =>
  k.parola_sifreli ? parolaCoz(k.parola_sifreli) : null;

// --- Personel kapsami ------------------------------------------------------------------------

/**
 * Personel icin kaynak kapsami: sahip/yonetici (`kurum`) hepsi, `sube` subedeki gruplar, ogretmen
 * (`grup`) atandigi gruplar ya da kendi ekledikleri. Silinmisler hep disarida.
 */
export function personelKapsami(tx: Tx, y: YetkiBaglami): SQL {
  const silinmemis = isNull(dersKaynaklari.silindi_at);
  switch (y.kapsam) {
    case 'kurum':
      return silinmemis;
    case 'sube':
      return ve(silinmemis, inArray(dersKaynaklari.grup_id, kapsamdakiGruplar(tx, y)));
    case 'grup':
      return ve(
        silinmemis,
        or(
          inArray(dersKaynaklari.grup_id, kapsamdakiGruplar(tx, y)),
          eq(dersKaynaklari.ekleyen_id, y.uyelikId),
        ),
      );
    case 'kendi':
      throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
  }
}

const dersSutunlari = {
  ders_baslangic_at: dersler.baslangic_at,
  brans_kodu: dersler.brans_kodu,
  ders_ogretmen_id: dersler.ogretmen_id,
};

/** Personel icin tekil kaynak (kapsam disi = 404). `kilit`: satiri `FOR UPDATE` ile kilitler. */
export async function personelKaynagiBul(
  tx: Tx,
  y: YetkiBaglami,
  kaynakId: string,
  kilit = false,
): Promise<{ k: KaynakSatiri; d: KaynakDers }> {
  const kosul = and(
    eq(dersKaynaklari.id, kaynakId),
    eq(dersKaynaklari.kurum_id, y.kurumId),
    personelKapsami(tx, y),
  );
  if (kilit) {
    // `FOR UPDATE` dis birlesimin bos olabilen tarafina uygulanamaz: once yalniz kaynak satiri kilitlenir.
    const [kilitli] = await tx
      .select({ id: dersKaynaklari.id })
      .from(dersKaynaklari)
      .where(kosul)
      .for('update');
    if (!kilitli) throw kaynakBulunamadi();
  }
  const [satir] = await tx
    .select({ k: dersKaynaklari, ...dersSutunlari })
    .from(dersKaynaklari)
    .leftJoin(dersler, eq(dersler.id, dersKaynaklari.ders_id))
    .where(kosul);
  if (!satir) throw kaynakBulunamadi();
  const { k, ...d } = satir;
  return { k, d };
}

// --- Ogrenci gorunurlugu ---------------------------------------------------------------------

/**
 * Gorunurluk kurallarinin 1-5'i (docs/schema/api.md): silinmemis, `aktif|bozuk`, sure dolmamis ve
 * (ders katilimcisi | grup uyesi | alici). Kural 6 (modul) SQL'de degil, `ogrenciGorunurKosul` icinde
 * grup bazinda cozulur: `hesap.modul_acik_mi` satir basina cagrilmaz.
 */
export function ogrenciTemelKosul(tx: Tx, ogrenciId: string): SQL {
  const katilimci = exists(
    tx
      .select({ bir: sql`1` })
      .from(dersKatilimcilari)
      .where(
        and(
          eq(dersKatilimcilari.ders_id, dersKaynaklari.ders_id),
          eq(dersKatilimcilari.ogrenci_id, ogrenciId),
        ),
      ),
  );
  const uye = exists(
    tx
      .select({ bir: sql`1` })
      .from(grupUyeleri)
      .where(
        and(
          eq(grupUyeleri.grup_id, dersKaynaklari.grup_id),
          eq(grupUyeleri.ogrenci_id, ogrenciId),
          isNull(grupUyeleri.bitis_tarihi),
        ),
      ),
  );
  const alici = exists(
    tx
      .select({ bir: sql`1` })
      .from(dersKaynagiAlicilari)
      .where(
        and(
          eq(dersKaynagiAlicilari.kaynak_id, dersKaynaklari.id),
          eq(dersKaynagiAlicilari.ogrenci_id, ogrenciId),
        ),
      ),
  );
  return ve(
    isNull(dersKaynaklari.silindi_at),
    inArray(dersKaynaklari.durum, ['aktif', 'bozuk']),
    or(
      isNull(dersKaynaklari.gecerlilik_bitis_at),
      gt(dersKaynaklari.gecerlilik_bitis_at, sql`now()`),
    ),
    or(
      and(
        eq(dersKaynaklari.gorunurluk, 'grup'),
        or(
          and(sql`${dersKaynaklari.ders_id} is not null`, katilimci),
          and(isNull(dersKaynaklari.ders_id), uye),
        ),
      ),
      and(eq(dersKaynaklari.gorunurluk, 'secili_ogrenciler'), alici),
    ),
  );
}

/**
 * Ogrencinin gorebildigi kaynaklar icin tam kosul (kural 6 dahil): `kayitlar` modulu grubunda kapali
 * olan kaynaklar elenir. Modul cozumu aday gruplar icin birer kez yapilir.
 */
export async function ogrenciGorunurKosul(tx: Tx, y: YetkiBaglami): Promise<SQL> {
  const temel = ogrenciTemelKosul(tx, y.uyelikId);
  const adaylar = await tx
    .selectDistinct({ grup_id: dersKaynaklari.grup_id })
    .from(dersKaynaklari)
    .where(and(eq(dersKaynaklari.kurum_id, y.kurumId), temel));
  const kapali: string[] = [];
  for (const { grup_id } of adaylar) {
    if (!(await modulAcikMi(tx, y.kurumId, 'kayitlar', { grupId: grup_id }))) kapali.push(grup_id);
  }
  return kapali.length === 0 ? temel : ve(temel, notInArray(dersKaynaklari.grup_id, kapali));
}

/** Ogrenci icin tekil kaynak (gorunmuyorsa 404: varligi ifsa etmez). */
export async function ogrenciKaynagiBul(
  tx: Tx,
  y: YetkiBaglami,
  kaynakId: string,
): Promise<{ k: KaynakSatiri; d: KaynakDers; izledi_at: Date | null }> {
  const kosul = await ogrenciGorunurKosul(tx, y);
  const [satir] = await tx
    .select({ k: dersKaynaklari, ...dersSutunlari, izledi_at: dersKaynagiIzlemeleri.izledi_at })
    .from(dersKaynaklari)
    .leftJoin(dersler, eq(dersler.id, dersKaynaklari.ders_id))
    .leftJoin(
      dersKaynagiIzlemeleri,
      and(
        eq(dersKaynagiIzlemeleri.kaynak_id, dersKaynaklari.id),
        eq(dersKaynagiIzlemeleri.ogrenci_id, y.uyelikId),
      ),
    )
    .where(and(eq(dersKaynaklari.id, kaynakId), eq(dersKaynaklari.kurum_id, y.kurumId), kosul));
  if (!satir) throw kaynakBulunamadi();
  const { k, izledi_at, ...d } = satir;
  return { k, d, izledi_at };
}

// --- Alicilar ve hedef kitle -----------------------------------------------------------------

/** Kaynagin hedef ogrencileri (`ogretmen` gorunurlugunde bos). */
export async function hedefOgrenciler(tx: Tx, k: KaynakSatiri): Promise<string[]> {
  if (k.gorunurluk === 'ogretmen') return [];
  if (k.gorunurluk === 'secili_ogrenciler') {
    const satirlar = await tx
      .select({ ogrenci_id: dersKaynagiAlicilari.ogrenci_id })
      .from(dersKaynagiAlicilari)
      .where(eq(dersKaynagiAlicilari.kaynak_id, k.id))
      .orderBy(asc(dersKaynagiAlicilari.id));
    return satirlar.map((s) => s.ogrenci_id);
  }
  return k.ders_id ? katilimciIdleri(tx, k.ders_id) : grupEtkinOgrencileri(tx, k.grup_id);
}

/** `secili_ogrenciler` alicilari dersin katilimcisi / grubun etkin uyesi olmali (yoksa 422). */
export async function alicilariDogrula(
  tx: Tx,
  a: { dersId: string | null; grupId: string; ogrenciIdleri: readonly string[] },
): Promise<string[]> {
  const benzersiz = [...new Set(a.ogrenciIdleri)];
  const gecerli = new Set(
    a.dersId ? await katilimciIdleri(tx, a.dersId) : await grupEtkinOgrencileri(tx, a.grupId),
  );
  const gecersiz = benzersiz.filter((id) => !gecerli.has(id));
  if (gecersiz.length > 0) {
    throw new AppError(
      422,
      kaynakHataKodlari.aliciGecersiz,
      a.dersId
        ? 'Alıcılar dersin katılımcısı olmalı.'
        : 'Alıcılar grubun etkin öğrencileri olmalı.',
      { gecersiz_ogrenci_idleri: gecersiz },
    );
  }
  return benzersiz;
}

export async function alicilariYaz(
  tx: Tx,
  y: YetkiBaglami,
  kaynakId: string,
  ogrenciIdleri: readonly string[],
): Promise<void> {
  if (ogrenciIdleri.length === 0) return;
  await tx.insert(dersKaynagiAlicilari).values(
    ogrenciIdleri.map((ogrenci_id) => ({
      id: uuidv7(),
      kurum_id: y.kurumId,
      created_by: y.kullaniciId,
      kaynak_id: kaynakId,
      ogrenci_id,
    })),
  );
}

/** Kaynagin yazma/okuma yolunda grubundaki `kayitlar` modulunu denetler (kapaliysa 403). */
export const kayitModuluAcikOlmali = (tx: Tx, y: YetkiBaglami, grupId: string) =>
  grupModuluAcikOlmali(tx, y, 'kayitlar', grupId);

// --- Olaylar ---------------------------------------------------------------------------------

/**
 * `ders.kaynak.eklendi.v1`: gorunurluk ogrencilere aciksa ve alici varsa; `ogrenci_idleri` 200'luk parcalar
 * (ders olaylarindaki desen). Yukte baslik/url/parola yoktur.
 */
export async function kaynakEklendiOlayiYaz(
  tx: Tx,
  baglam: DersOlayBaglami,
  k: KaynakSatiri,
  bransKodu: string | null,
): Promise<void> {
  const hedefler = await hedefOgrenciler(tx, k);
  const parcalar: string[][] = [];
  for (let i = 0; i < hedefler.length; i += DERS_OLAY_PARCA_BOYUTU) {
    parcalar.push(hedefler.slice(i, i + DERS_OLAY_PARCA_BOYUTU));
  }
  for (const [i, parca] of parcalar.entries()) {
    await publishInTx(
      tx,
      dersKaynakEklendiV1.create({
        ...baglam,
        data: {
          kaynak_id: k.id,
          tur: k.tur as 'kayit' | 'materyal',
          ders_id: k.ders_id,
          grup_id: k.grup_id,
          brans_kodu: bransKodu,
          gorunurluk: k.gorunurluk as 'grup' | 'secili_ogrenciler',
          ekleyen_id: k.ekleyen_id,
          ogrenci_idleri: parca,
          parca_no: i + 1,
          parca_sayisi: parcalar.length,
        },
      }),
      { table: OUTBOX_TABLOSU },
    );
  }
}

export async function kaynakIzlendiOlayiYaz(
  tx: Tx,
  baglam: DersOlayBaglami,
  k: KaynakSatiri,
  bransKodu: string | null,
  ogrenciId: string,
  izlediAt: Date,
): Promise<void> {
  await publishInTx(
    tx,
    dersKaynakIzlendiV1.create({
      ...baglam,
      data: {
        kaynak_id: k.id,
        ogrenci_id: ogrenciId,
        ders_id: k.ders_id,
        grup_id: k.grup_id,
        brans_kodu: bransKodu,
        izledi_at: izlediAt.toISOString(),
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
}

export async function kaynakSorunOlayiYaz(
  tx: Tx,
  baglam: DersOlayBaglami,
  k: KaynakSatiri,
  s: SorunSatiri,
): Promise<void> {
  await publishInTx(
    tx,
    dersKaynakSorunBildirildiV1.create({
      ...baglam,
      data: {
        sorun_id: s.id,
        kaynak_id: k.id,
        ders_id: k.ders_id,
        grup_id: k.grup_id,
        bildiren_id: s.bildiren_id,
        neden: s.neden as 'acilmiyor' | 'parola_yanlis' | 'suresi_doldu' | 'diger',
        ekleyen_id: k.ekleyen_id,
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
}

export function sorunYaniti(s: SorunSatiri) {
  return {
    id: s.id,
    kaynak_id: s.kaynak_id,
    bildiren_id: s.bildiren_id,
    neden: s.neden as 'acilmiyor' | 'parola_yanlis' | 'suresi_doldu' | 'diger',
    aciklama: s.aciklama,
    durum: s.durum as 'acik' | 'cozuldu',
    cozen_id: s.cozen_id,
    cozuldu_at: s.cozuldu_at?.toISOString() ?? null,
    created_at: s.created_at.toISOString(),
  };
}
