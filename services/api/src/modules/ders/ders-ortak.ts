import { dersHataKodlari, errorCodes, hesapHataKodlari, type DersKapsami } from '@kopru/contracts';
import { AppError, withTenant, type Database, type Tx } from '@kopru/service-kit';
import { and, asc, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  atamalar,
  bransler,
  dersSerileri,
  dersler,
  gruplar,
  kurumlar,
  uyelikler,
} from '../../db/schema.js';
import { grupKapsami, type YetkiBaglami } from '../hesap/index.js';
import {
  cakisanYaniti,
  dersBul,
  exclusionIhlaliMi,
  ogretmenCakismalari,
  type Aralik,
  type DersOlayBaglami,
  type DersSatiri,
} from './ders-deposu.js';

export const kurumParam = z.object({ kurum_id: z.uuid() });
export const dersParam = kurumParam.extend({ id: z.uuid() });

export function yetkiAl(request: { yetki: YetkiBaglami | null }): YetkiBaglami {
  if (!request.yetki) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
  return request.yetki;
}

export const kiraci = (y: YetkiBaglami) => ({
  kurumId: y.kurumId,
  kullaniciId: y.kullaniciId,
  roller: [y.rol],
});

export const olayBaglami = (y: YetkiBaglami, correlationId: string): DersOlayBaglami => ({
  kurumId: y.kurumId,
  actor: { tur: 'kullanici', id: y.kullaniciId },
  correlationId,
});

/** Kapsamdaki aktif grup (kapsam disi = 404, arsivli = 409). */
export async function aktifGrupBul(tx: Tx, y: YetkiBaglami, grupId: string) {
  const [g] = await tx
    .select()
    .from(gruplar)
    .where(and(eq(gruplar.id, grupId), eq(gruplar.kurum_id, y.kurumId), grupKapsami(tx, y)));
  if (!g) throw new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
  if (g.durum !== 'aktif') {
    throw new AppError(409, hesapHataKodlari.grupArsivde, 'Arşivlenmiş gruba ders eklenemez.');
  }
  return g;
}

export async function kurumSaatDilimi(tx: Tx, kurumId: string): Promise<string> {
  const [k] = await tx
    .select({ saat_dilimi: kurumlar.saat_dilimi })
    .from(kurumlar)
    .where(eq(kurumlar.id, kurumId));
  return k?.saat_dilimi ?? 'Europe/Istanbul';
}

/**
 * Dersi verecek ogretmen uyeligi.
 * - `istenen` verilmisse: kurumda etkin `ogretmen` uyeligi olmali (yoksa 422); ogretmen rolu yalniz kendi
 *   adina ders acar (baskasi 403).
 * - Bos: ogretmen rolunde cagirinin kendisi; sahip/yonetici icin ayni kullanicinin ayni kurumdaki
 *   `ogretmen` uyeligi (bireysel kurumda hoca iki uyelik tasir: sahip + ogretmen); o da yoksa 422.
 */
export async function ogretmenCoz(
  tx: Tx,
  y: YetkiBaglami,
  istenen: string | undefined,
): Promise<string> {
  if (istenen !== undefined) {
    if (y.rol === 'ogretmen' && istenen !== y.uyelikId) {
      throw new AppError(403, errorCodes.izinYok, 'Öğretmen yalnızca kendi adına ders açabilir.');
    }
    const [u] = await tx
      .select({ id: uyelikler.id })
      .from(uyelikler)
      .where(
        and(
          eq(uyelikler.id, istenen),
          eq(uyelikler.kurum_id, y.kurumId),
          eq(uyelikler.rol, 'ogretmen'),
          eq(uyelikler.durum, 'aktif'),
        ),
      );
    if (!u) {
      throw new AppError(
        422,
        dersHataKodlari.ogretmenGecersiz,
        'Öğretmen bu kurumda etkin bir öğretmen üyeliği değil.',
      );
    }
    return u.id;
  }
  if (y.rol === 'ogretmen') return y.uyelikId;
  const [u] = await tx
    .select({ id: uyelikler.id })
    .from(uyelikler)
    .where(
      and(
        eq(uyelikler.kurum_id, y.kurumId),
        eq(uyelikler.kullanici_id, y.kullaniciId),
        eq(uyelikler.rol, 'ogretmen'),
        eq(uyelikler.durum, 'aktif'),
      ),
    );
  if (!u) {
    throw new AppError(
      422,
      dersHataKodlari.ogretmenGerekli,
      'Dersi verecek öğretmen belirtilmeli (ogretmen_id).',
    );
  }
  return u.id;
}

/** Brans: gövdedeki kod (etkin olmali) ya da ogretmenin gruptaki atamasi (ana ogretmen once). */
export async function bransCoz(
  tx: Tx,
  grupId: string,
  ogretmenId: string,
  istenen: string | undefined,
): Promise<string> {
  if (istenen !== undefined) {
    const [b] = await tx
      .select({ kod: bransler.kod })
      .from(bransler)
      .where(and(eq(bransler.kod, istenen), eq(bransler.aktif, true)));
    if (!b) throw new AppError(422, errorCodes.validation, 'Branş kodu geçersiz.');
    return b.kod;
  }
  const [a] = await tx
    .select({ brans_kodu: atamalar.brans_kodu })
    .from(atamalar)
    .where(
      and(
        eq(atamalar.grup_id, grupId),
        eq(atamalar.ogretmen_id, ogretmenId),
        or(isNull(atamalar.bitis_tarihi), gt(atamalar.bitis_tarihi, sql`current_date`)),
      ),
    )
    .orderBy(desc(atamalar.ana_ogretmen), asc(atamalar.baslangic_tarihi));
  if (!a) {
    throw new AppError(
      422,
      dersHataKodlari.bransGerekli,
      'Branş belirtilmeli (öğretmenin bu grupta ataması yok).',
    );
  }
  return a.brans_kodu;
}

/**
 * Degistirilecek ders (satir kilitli). Ayni grupta birden cok brans ogretmeni olabilir: ogretmen rolu
 * gruptaki dersleri gorur ama yalniz kendi dersini degistirir; sahip ve yonetici kapsamindaki her dersi.
 */
export async function yazilacakDersBul(
  tx: Tx,
  y: YetkiBaglami,
  dersId: string,
): Promise<DersSatiri> {
  const d = await dersBul(tx, y, dersId, true);
  if (y.rol === 'ogretmen' && d.ogretmen_id !== y.uyelikId) {
    throw new AppError(403, errorCodes.izinYok, 'Yalnızca kendi dersinizi değiştirebilirsiniz.');
  }
  return d;
}

export function planliOlmali(d: DersSatiri): void {
  if (d.durum !== 'planli') {
    throw new AppError(
      409,
      dersHataKodlari.dersPlanliDegil,
      d.durum === 'iptal' ? 'Ders iptal edilmiş.' : 'Ders tamamlanmış.',
    );
  }
}

/** Iyimser kilit: istemcinin okudugu `surum` eskiyse 409. */
export function surumKontrol(d: DersSatiri, surum: number | undefined): void {
  if (surum !== undefined && d.surum !== surum) {
    throw new AppError(
      409,
      dersHataKodlari.surumCakismasi,
      'Ders bu arada değişti. Güncel hâlini alıp tekrar deneyin.',
      { guncel_surum: d.surum },
    );
  }
}

export const cakismaHatasi = (cakisanlar: DersSatiri[]) =>
  new AppError(409, dersHataKodlari.dersCakismasi, 'Öğretmenin bu saatte başka dersi var.', {
    cakisanlar: cakisanlar.map(cakisanYaniti),
  });

/**
 * Secilen dersin etkiledigi kume: `yalniz_bu` -> yalniz kendisi; `bu_ve_sonrakiler` -> kendisi ve
 * ayni serinin SONRAKI (seri sirasi buyuk), `seri_istisna=false`, planli dersleri. Istisna dersler
 * (elle tasinmis/degistirilmis) korunur.
 */
export async function etkilenenDersler(
  tx: Tx,
  hedef: DersSatiri,
  kapsam: DersKapsami,
): Promise<DersSatiri[]> {
  if (kapsam === 'yalniz_bu') return [hedef];
  if (hedef.seri_id === null || hedef.seri_sirasi === null) {
    throw new AppError(
      422,
      dersHataKodlari.dersSeridedeDegil,
      '"Bu ve sonrakiler" yalnızca tekrarlayan derslerde kullanılabilir.',
    );
  }
  const sonrakiler = await tx
    .select()
    .from(dersler)
    .where(
      and(
        eq(dersler.seri_id, hedef.seri_id),
        gt(dersler.seri_sirasi, hedef.seri_sirasi),
        eq(dersler.seri_istisna, false),
        eq(dersler.durum, 'planli'),
      ),
    )
    .orderBy(asc(dersler.seri_sirasi))
    .for('update');
  return [hedef, ...sonrakiler];
}

export async function seriBul(tx: Tx, seriId: string | null, kilit = false) {
  if (seriId === null) return null;
  const sorgu = tx.select().from(dersSerileri).where(eq(dersSerileri.id, seriId));
  const [s] = await (kilit ? sorgu.for('update') : sorgu);
  return s ?? null;
}

export interface CakismaNiyeti {
  ogretmenId: string;
  araliklar: Aralik[];
  haric: string[];
}

/**
 * Yaris korumasi: on sorgudan sonra baska bir istek ayni ogretmen/saate yazarsa veritabani EXCLUDE
 * kisiti 23P01 verir; bunu 500 degil, cakisan derslerle `409 ders_cakismasi`ya cevirir.
 */
export async function cakismaKorumali<T>(
  db: Pick<Database, 'orm'>,
  y: YetkiBaglami,
  niyet: { current: CakismaNiyeti | null },
  islem: () => Promise<T>,
): Promise<T> {
  try {
    return await islem();
  } catch (err) {
    if (!exclusionIhlaliMi(err)) throw err;
    const n = niyet.current;
    const cakisanlar = n
      ? (
          await withTenant(db, kiraci(y), (tx) =>
            ogretmenCakismalari(tx, y.kurumId, n.ogretmenId, n.araliklar, n.haric),
          )
        ).hepsi
      : [];
    throw cakismaHatasi(cakisanlar);
  }
}
