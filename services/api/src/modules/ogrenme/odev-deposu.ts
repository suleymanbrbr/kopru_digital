import {
  ODEV_FAN_OUT_PARCA_BOYUTU,
  ODEV_OLAY_PARCA_BOYUTU,
  errorCodes,
  odevHataKodlari,
  ogrenmeOdevYayinlandiV1,
  type Actor,
  type OdevTipi,
  type OgrenciOdeviTipi,
} from '@kopru/contracts';
import { AppError, publishInTx, type Tx } from '@kopru/service-kit';
import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  bransler,
  denetimKayitlari,
  gruplar,
  grupUyeleri,
  kademeler,
  odevler,
  ogrenciOdevleri,
  uyelikler,
} from '../../db/schema.js';
import {
  atananGruplar,
  grupEtkinOgrencileri,
  grupKapsami,
  kapsamdakiGruplar,
  modulAcikMi,
  type YetkiBaglami,
} from '../hesap/index.js';

export type OdevSatiri = typeof odevler.$inferSelect;
export type OgrenciOdevSatiri = typeof ogrenciOdevleri.$inferSelect;

export const OUTBOX_TABLOSU = 'ortak.outbox';

export const kurumParam = z.object({ kurum_id: z.uuid() });
export const odevParam = kurumParam.extend({ id: z.uuid() });

export function yetkiAl(request: { yetki: YetkiBaglami | null }): YetkiBaglami {
  if (!request.yetki) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
  return request.yetki;
}

export const kiraci = (y: YetkiBaglami) => ({
  kurumId: y.kurumId,
  kullaniciId: y.kullaniciId,
  roller: [y.rol],
});

export interface OdevOlayBaglami {
  kurumId: string;
  actor: Actor;
  correlationId: string;
}

export const olayBaglami = (y: YetkiBaglami, correlationId: string): OdevOlayBaglami => ({
  kurumId: y.kurumId,
  actor: { tur: 'kullanici', id: y.kullaniciId },
  correlationId,
});

export const odevBulunamadi = () => new AppError(404, errorCodes.notFound, 'Ödev bulunamadı.');

// --- Yanit donusumleri -----------------------------------------------------------------------

export function odevYaniti(o: OdevSatiri): OdevTipi {
  return {
    id: o.id,
    baslik: o.baslik,
    aciklama: o.aciklama,
    brans_kodu: o.brans_kodu,
    konu_id: o.konu_id,
    tur: o.tur as OdevTipi['tur'],
    kaynak: o.kaynak,
    hedef_turu: o.hedef_turu as OdevTipi['hedef_turu'],
    hedef_id: o.hedef_id,
    veren_id: o.veren_id,
    son_teslim_at: o.son_teslim_at?.toISOString() ?? null,
    hedef_soru_sayisi: o.hedef_soru_sayisi,
    fotograf_gerekli: o.fotograf_gerekli,
    durum: o.durum as OdevTipi['durum'],
    yayin_at: o.yayin_at?.toISOString() ?? null,
    fan_out_durum: o.fan_out_durum as OdevTipi['fan_out_durum'],
    atanan_sayisi: o.atanan_sayisi,
    surum: o.surum,
    created_at: o.created_at.toISOString(),
  };
}

export function ogrenciOdeviYaniti(s: OgrenciOdevSatiri, o: OdevSatiri): OgrenciOdeviTipi {
  return {
    id: s.id,
    odev_id: o.id,
    baslik: o.baslik,
    aciklama: o.aciklama,
    brans_kodu: o.brans_kodu,
    konu_id: o.konu_id,
    tur: o.tur as OgrenciOdeviTipi['tur'],
    kaynak: o.kaynak,
    hedef_soru_sayisi: o.hedef_soru_sayisi,
    fotograf_gerekli: o.fotograf_gerekli,
    odev_durum: o.durum as OgrenciOdeviTipi['odev_durum'],
    durum: s.durum as OgrenciOdeviTipi['durum'],
    son_teslim_at: s.son_teslim_at?.toISOString() ?? null,
    yapilan_soru_sayisi: s.yapilan_soru_sayisi,
    dogru_sayisi: s.dogru_sayisi,
    yanlis_sayisi: s.yanlis_sayisi,
    bos_sayisi: s.bos_sayisi,
    ogrenci_notu: s.ogrenci_notu,
    teslim_at: s.teslim_at?.toISOString() ?? null,
    gec_teslim: s.gec_teslim,
    inceleme_sonucu: s.inceleme_sonucu as OgrenciOdeviTipi['inceleme_sonucu'],
    inceleme_notu: s.inceleme_notu,
    incelendi_at: s.incelendi_at?.toISOString() ?? null,
  };
}

/** Dogru orani: yalniz dogru sayisi ve yapilan sayisi (> 0) varsa. */
export const dogruOrani = (dogru: number | null, yapilan: number | null): number | null =>
  dogru === null || yapilan === null || yapilan === 0
    ? null
    : Math.round((dogru / yapilan) * 1000) / 1000;

// --- Imlec -----------------------------------------------------------------------------------

export const imlecCoz = (imlec: string | undefined): string | undefined => {
  if (imlec === undefined) return undefined;
  const id = Buffer.from(imlec, 'base64url').toString('utf8');
  if (!z.uuid().safeParse(id).success) {
    throw new AppError(400, errorCodes.validation, 'İmleç geçersiz.');
  }
  return id;
};
export const imlecYaz = (id: string) => Buffer.from(id, 'utf8').toString('base64url');

// --- Kapsam ----------------------------------------------------------------------------------

/**
 * `odevler` okuma kapsami (ADR 0004). Kapsam disi kayit 404.
 * - `kurum`: tumu; `sube`: verenleri kendi subesinde olan ya da subedeki gruba verilen odevler
 * - `grup` (ogretmen): kendi odevleri, atandigi gruba ya da gruptaki ogrenciye verilenler
 *   (ayni gruptaki baska ogretmen gorur ama degistiremez)
 */
export function odevKapsami(tx: Tx, y: YetkiBaglami): SQL | undefined {
  switch (y.kapsam) {
    case 'kurum':
      return undefined;
    case 'sube':
      return or(
        eq(odevler.veren_id, y.uyelikId),
        inArray(
          odevler.veren_id,
          tx
            .select({ id: uyelikler.id })
            .from(uyelikler)
            .where(eq(uyelikler.sube_id, y.subeId ?? '00000000-0000-0000-0000-000000000000')),
        ),
        and(eq(odevler.hedef_turu, 'grup'), inArray(odevler.hedef_id, kapsamdakiGruplar(tx, y))),
      );
    case 'grup':
      return or(
        eq(odevler.veren_id, y.uyelikId),
        and(
          eq(odevler.hedef_turu, 'grup'),
          inArray(odevler.hedef_id, atananGruplar(tx, y.uyelikId)),
        ),
        and(
          eq(odevler.hedef_turu, 'ogrenci'),
          inArray(
            odevler.hedef_id,
            tx
              .select({ id: grupUyeleri.ogrenci_id })
              .from(grupUyeleri)
              .where(
                and(
                  isNull(grupUyeleri.bitis_tarihi),
                  inArray(grupUyeleri.grup_id, atananGruplar(tx, y.uyelikId)),
                ),
              ),
          ),
        ),
      );
    case 'kendi':
      return sql`false`;
  }
}

/** Kapsamdaki tek odev (kapsam disi = 404). `kilit`: satiri `FOR UPDATE` ile kilitler. */
export async function odevBul(tx: Tx, y: YetkiBaglami, odevId: string, kilit = false) {
  const sorgu = tx
    .select()
    .from(odevler)
    .where(and(eq(odevler.id, odevId), eq(odevler.kurum_id, y.kurumId), odevKapsami(tx, y)));
  const [o] = await (kilit ? sorgu.for('update') : sorgu);
  if (!o) throw odevBulunamadi();
  return o;
}

/** Degistirilecek odev: ogretmen rolu yalniz kendi odevini degistirir/inceler (baskasi 403). */
export async function yazilacakOdevBul(tx: Tx, y: YetkiBaglami, odevId: string, kilit = true) {
  const o = await odevBul(tx, y, odevId, kilit);
  if (y.rol === 'ogretmen' && o.veren_id !== y.uyelikId) {
    throw new AppError(403, errorCodes.izinYok, 'Yalnızca kendi ödevinizi değiştirebilirsiniz.');
  }
  await odevModuluAcikOlmali(tx, y.kurumId, o);
  return o;
}

// --- Modul ----------------------------------------------------------------------------------

async function ogrenciKademesi(tx: Tx, ogrenciId: string): Promise<string | null> {
  const [u] = await tx
    .select({ kademe_id: uyelikler.kademe_id })
    .from(uyelikler)
    .where(eq(uyelikler.id, ogrenciId));
  return u?.kademe_id ?? null;
}

/** `odev` modulu odevin hedefi (grup/kademe) duzeyinde kapaliysa yazma 403 `modul_kapali`. */
export async function odevModuluAcikOlmali(
  tx: Tx,
  kurumId: string,
  hedef: { hedef_turu: string; hedef_id: string },
): Promise<void> {
  const baglam =
    hedef.hedef_turu === 'grup'
      ? { grupId: hedef.hedef_id }
      : hedef.hedef_turu === 'kademe'
        ? { kademeId: hedef.hedef_id }
        : hedef.hedef_turu === 'ogrenci'
          ? { kademeId: await ogrenciKademesi(tx, hedef.hedef_id) }
          : {};
  if (!(await modulAcikMi(tx, kurumId, 'odev', baglam))) {
    throw new AppError(403, errorCodes.modulKapali, 'Ödev özelliği bu hedefte kapalı.');
  }
}

// --- Hedef ----------------------------------------------------------------------------------

/**
 * Hedefi dogrular ve yetkiyi uygular. `kademe`/`kurum` hedefi yalniz kurum kapsamli rollerdedir (403);
 * kapsam disi grup/ogrenci 404. `odev` modulu hedef duzeyinde kapaliysa 403.
 */
export async function hedefiDogrula(
  tx: Tx,
  y: YetkiBaglami,
  turu: string,
  hedefId: string | undefined,
): Promise<string> {
  if (turu === 'kurum') {
    if (y.kapsam !== 'kurum') {
      throw new AppError(403, errorCodes.izinYok, 'Kurum geneline ödev verme yetkiniz yok.');
    }
    if (hedefId !== undefined && hedefId !== y.kurumId) {
      throw new AppError(422, odevHataKodlari.hedefGecersiz, 'Kurum hedefinde hedef kurum olmalı.');
    }
    await odevModuluAcikOlmali(tx, y.kurumId, { hedef_turu: 'kurum', hedef_id: y.kurumId });
    return y.kurumId;
  }
  if (hedefId === undefined) {
    throw new AppError(422, odevHataKodlari.hedefGecersiz, 'Hedef kimliği gerekli.');
  }
  if (turu === 'kademe') {
    if (y.kapsam !== 'kurum') {
      throw new AppError(403, errorCodes.izinYok, 'Kademeye ödev verme yetkiniz yok.');
    }
    const [k] = await tx
      .select({ id: kademeler.id })
      .from(kademeler)
      .where(
        and(
          eq(kademeler.id, hedefId),
          eq(kademeler.kurum_id, y.kurumId),
          isNull(kademeler.arsivlendi_at),
        ),
      );
    if (!k) throw new AppError(404, errorCodes.notFound, 'Kademe bulunamadı.');
  } else if (turu === 'grup') {
    const [g] = await tx
      .select({ id: gruplar.id, durum: gruplar.durum })
      .from(gruplar)
      .where(and(eq(gruplar.id, hedefId), eq(gruplar.kurum_id, y.kurumId), grupKapsami(tx, y)));
    if (!g) throw new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
    if (g.durum !== 'aktif') {
      throw new AppError(422, odevHataKodlari.hedefGecersiz, 'Arşivlenmiş gruba ödev verilemez.');
    }
  } else {
    const [u] = await tx
      .select({ id: uyelikler.id, sube_id: uyelikler.sube_id })
      .from(uyelikler)
      .where(
        and(
          eq(uyelikler.id, hedefId),
          eq(uyelikler.kurum_id, y.kurumId),
          eq(uyelikler.rol, 'ogrenci'),
          eq(uyelikler.durum, 'aktif'),
        ),
      );
    if (!u) throw new AppError(404, errorCodes.notFound, 'Öğrenci bulunamadı.');
    if (y.kapsam === 'sube' || y.kapsam === 'grup') {
      const kapsamdaMi = y.kapsam === 'sube' && u.sube_id !== null && u.sube_id === y.subeId;
      const [uye] = kapsamdaMi
        ? [{ id: u.id }]
        : await tx
            .select({ id: grupUyeleri.id })
            .from(grupUyeleri)
            .where(
              and(
                eq(grupUyeleri.ogrenci_id, hedefId),
                isNull(grupUyeleri.bitis_tarihi),
                inArray(grupUyeleri.grup_id, kapsamdakiGruplar(tx, y)),
              ),
            )
            .limit(1);
      if (!uye) throw new AppError(404, errorCodes.notFound, 'Öğrenci bulunamadı.');
    }
  }
  await odevModuluAcikOlmali(tx, y.kurumId, { hedef_turu: turu, hedef_id: hedefId });
  return hedefId;
}

export async function bransGecerliOlmali(tx: Tx, kod: string): Promise<void> {
  const [b] = await tx
    .select({ kod: bransler.kod })
    .from(bransler)
    .where(and(eq(bransler.kod, kod), eq(bransler.aktif, true)));
  if (!b) throw new AppError(422, errorCodes.validation, 'Branş kodu geçersiz.');
}

/** Hedefteki etkin ogrenci uyelikleri (yayin ve atama esitleme). */
export async function hedefOgrencileri(
  tx: Tx,
  kurumId: string,
  turu: string,
  hedefId: string,
): Promise<string[]> {
  if (turu === 'grup') return grupEtkinOgrencileri(tx, hedefId);
  const kosullar = [
    eq(uyelikler.kurum_id, kurumId),
    eq(uyelikler.rol, 'ogrenci'),
    eq(uyelikler.durum, 'aktif'),
  ];
  if (turu === 'ogrenci') kosullar.push(eq(uyelikler.id, hedefId));
  if (turu === 'kademe') kosullar.push(eq(uyelikler.kademe_id, hedefId));
  const satirlar = await tx
    .select({ id: uyelikler.id })
    .from(uyelikler)
    .where(and(...kosullar))
    .orderBy(uyelikler.id);
  return satirlar.map((s) => s.id);
}

// --- Fan-out --------------------------------------------------------------------------------

/**
 * Ogrenci satirlarini 500'luk parcalarla `ON CONFLICT DO NOTHING` ile acar. Yalnizca YENI acilan
 * ogrenci kimliklerini dondurur (tekrar calisinca bos: idempotent).
 */
export async function ogrenciSatirlariniAc(
  tx: Tx,
  y: YetkiBaglami,
  odev: OdevSatiri,
  ogrenciIdleri: readonly string[],
): Promise<string[]> {
  const eklenen: string[] = [];
  for (let i = 0; i < ogrenciIdleri.length; i += ODEV_FAN_OUT_PARCA_BOYUTU) {
    const parca = ogrenciIdleri.slice(i, i + ODEV_FAN_OUT_PARCA_BOYUTU);
    const satirlar = await tx
      .insert(ogrenciOdevleri)
      .values(
        parca.map((ogrenciId) => ({
          id: uuidv7(),
          kurum_id: y.kurumId,
          created_by: y.kullaniciId,
          odev_id: odev.id,
          ogrenci_id: ogrenciId,
          son_teslim_at: odev.son_teslim_at,
        })),
      )
      .onConflictDoNothing({ target: [ogrenciOdevleri.odev_id, ogrenciOdevleri.ogrenci_id] })
      .returning({ ogrenci_id: ogrenciOdevleri.ogrenci_id });
    for (const s of satirlar) eklenen.push(s.ogrenci_id);
  }
  return eklenen;
}

/** `yayinlandi` olayi: ogrenci listesi 200'luk parcalar, ayni islemde outbox. Bos listede olay yok. */
export async function yayinlandiOlayiYaz(
  tx: Tx,
  baglam: OdevOlayBaglami,
  o: OdevSatiri,
  ogrenciIdleri: readonly string[],
): Promise<number> {
  const parcaSayisi = Math.ceil(ogrenciIdleri.length / ODEV_OLAY_PARCA_BOYUTU);
  for (let i = 0; i < parcaSayisi; i++) {
    const olay = ogrenmeOdevYayinlandiV1.create({
      ...baglam,
      data: {
        odev_id: o.id,
        brans_kodu: o.brans_kodu,
        son_teslim_at: o.son_teslim_at?.toISOString() ?? null,
        veren_id: o.veren_id,
        hedef_turu: o.hedef_turu as OdevTipi['hedef_turu'],
        hedef_id: o.hedef_id,
        ogrenci_idleri: ogrenciIdleri.slice(
          i * ODEV_OLAY_PARCA_BOYUTU,
          (i + 1) * ODEV_OLAY_PARCA_BOYUTU,
        ),
        parca_no: i + 1,
        parca_sayisi: parcaSayisi,
      },
    });
    await publishInTx(tx, olay, { table: OUTBOX_TABLOSU });
  }
  return parcaSayisi;
}

/** Odevin ogrenci satiri sayisi (iptal dahil degil). */
export async function atananSayisi(tx: Tx, odevId: string): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(ogrenciOdevleri)
    .where(and(eq(ogrenciOdevleri.odev_id, odevId), sql`${ogrenciOdevleri.durum} <> 'iptal'`));
  return r?.n ?? 0;
}

// --- Denetim --------------------------------------------------------------------------------

/** Yazma eylemi denetim kaydi (kisisel veri ve serbest metin yok: yalniz kimlik, sayi, durum). */
export async function odevDenetimiYaz(
  tx: Tx,
  y: YetkiBaglami,
  ip: string,
  eylem: string,
  hedefTuru: 'odev' | 'ogrenci_odevi' | 'odev_sablonu',
  hedefId: string,
  once: Record<string, unknown> | null,
  sonra: Record<string, unknown>,
): Promise<void> {
  await tx.insert(denetimKayitlari).values({
    id: uuidv7(),
    kurum_id: y.kurumId,
    created_by: y.kullaniciId,
    aktor_kullanici_id: y.kullaniciId,
    aktor_uyelik_id: y.uyelikId,
    eylem,
    hedef_turu: hedefTuru,
    hedef_id: hedefId,
    once,
    sonra,
    ip,
  });
}
