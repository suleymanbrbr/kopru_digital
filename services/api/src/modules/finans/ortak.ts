import { errorCodes, type Actor, type AnyEventEnvelope } from '@kopru/contracts';
import { AppError, publishInTx, type Database, type Tx } from '@kopru/service-kit';
import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { denetimKayitlari, grupUyeleri, uyelikler } from '../../db/schema.js';
import { atananGruplar, kapsamdakiGruplar, type YetkiBaglami } from '../hesap/index.js';

/** Finans olaylari hesap ile ayni outbox tablosuna, is verisini yazan islemde eklenir. */
const OUTBOX_TABLOSU = 'ortak.outbox';

export function yetkiAl(request: { yetki: YetkiBaglami | null }): YetkiBaglami {
  if (!request.yetki) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
  return request.yetki;
}

export const kiraci = (y: YetkiBaglami) => ({
  kurumId: y.kurumId,
  kullaniciId: y.kullaniciId,
  roller: [y.rol],
});

export const aktorOlarak = (kullaniciId: string | null): Actor =>
  kullaniciId ? { tur: 'kullanici', id: kullaniciId } : { tur: 'sistem', id: 'finans' };

/** Olay tanimindan zarfi olusturup ayni islemde outbox'a yazar. */
export async function olayYaz(tx: Tx, olay: AnyEventEnvelope): Promise<void> {
  await publishInTx(tx, olay, { table: OUTBOX_TABLOSU });
}

/** Europe/Istanbul takvim gunu (`YYYY-MM-DD`). */
export function bugunIstanbul(simdi: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(simdi);
}

/** `YYYY-MM-DD` + gun (UTC takvim aritmetigi; saat dilimi kaymasi yok). */
export function gunEkle(tarih: string, gun: number): string {
  const d = new Date(`${tarih}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM` -> [ayin ilk gunu, sonraki ayin ilk gunu). */
export function ayAraligi(ay: string): { baslangic: string; sonraki: string } {
  const [y, m] = ay.split('-').map(Number) as [number, number];
  const sonraki =
    m === 12 ? `${String(y + 1)}-01-01` : `${String(y)}-${String(m + 1).padStart(2, '0')}-01`;
  return { baslangic: `${ay}-01`, sonraki };
}

export const kalanDersGorunsunMu = (ayarlar: unknown): boolean =>
  typeof ayarlar === 'object' &&
  ayarlar !== null &&
  (ayarlar as { ogrenci_kalan_ders_gorur?: unknown }).ogrenci_kalan_ders_gorur !== false;

/**
 * Rolun kapsaminda gorebildigi ogrenci uyelikleri icin `uyelikler` kosulu (`kurum` kapsaminda
 * `undefined`). `sube`: subedeki uyelikler ya da subedeki gruplarin uyeleri; `grup`: atandigi
 * gruplarin etkin uyeleri; `kendi`: yalniz kendisi.
 */
export function ogrenciKapsami(tx: Tx, y: YetkiBaglami): SQL | undefined {
  const uyeleri = (grupIdleri: SQL) =>
    inArray(
      uyelikler.id,
      tx
        .select({ id: grupUyeleri.ogrenci_id })
        .from(grupUyeleri)
        .where(and(grupIdleri, isNull(grupUyeleri.bitis_tarihi))),
    );
  switch (y.kapsam) {
    case 'kurum':
      return undefined;
    case 'sube':
      return or(
        eq(uyelikler.sube_id, y.subeId ?? '00000000-0000-0000-0000-000000000000'),
        uyeleri(inArray(grupUyeleri.grup_id, kapsamdakiGruplar(tx, y))),
      );
    case 'grup':
      return uyeleri(inArray(grupUyeleri.grup_id, atananGruplar(tx, y.uyelikId)));
    case 'kendi':
      return eq(uyelikler.id, y.uyelikId);
  }
}

export const ogrenciBulunamadi = () =>
  new AppError(404, errorCodes.notFound, 'Öğrenci bulunamadı.');

/** Kapsamdaki aktif ogrenci uyeligi; kapsam disi ya da ogrenci olmayan = yok (404). */
export async function ogrenciBul(tx: Tx, y: YetkiBaglami, ogrenciId: string) {
  const [satir] = await tx
    .select({ id: uyelikler.id, gorunen_ad: uyelikler.gorunen_ad, durum: uyelikler.durum })
    .from(uyelikler)
    .where(
      and(
        eq(uyelikler.id, ogrenciId),
        eq(uyelikler.kurum_id, y.kurumId),
        eq(uyelikler.rol, 'ogrenci'),
        ogrenciKapsami(tx, y),
      ),
    );
  if (!satir) throw ogrenciBulunamadi();
  return satir;
}

/**
 * Her yazma denetim kaydina duser. Kisisel veri (ad, telefon, odeyen) kayda girmez: yalniz kimlikler,
 * tutarlar ve degisen alan adlari.
 */
export async function denetimYaz(
  tx: Tx,
  y: YetkiBaglami,
  ip: string,
  girdi: {
    eylem: string;
    hedefTuru: string;
    hedefId: string;
    once?: Record<string, unknown> | null;
    sonra?: Record<string, unknown> | null;
    neden?: string | null;
    istekId?: string | null;
  },
): Promise<void> {
  await tx.insert(denetimKayitlari).values({
    id: uuidv7(),
    kurum_id: y.kurumId,
    created_by: y.kullaniciId,
    aktor_kullanici_id: y.kullaniciId,
    aktor_uyelik_id: y.uyelikId,
    eylem: girdi.eylem,
    hedef_turu: girdi.hedefTuru,
    hedef_id: girdi.hedefId,
    once: girdi.once ?? null,
    sonra: girdi.sonra ?? null,
    neden: girdi.neden ?? null,
    istek_id: girdi.istekId ?? null,
    ip,
  });
}

/** Ayni anahtara gore seri hale getiren islem-duzeyi (xact) advisory kilidi. */
export async function kilitAl(tx: Tx, anahtar: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${anahtar}, 0))`);
}

/** `ILIKE` ozel karakterlerini kacirir. */
export const likeKacir = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Veritabani yoksa 503; rotalar tek yerden alir. */
export function veritabani(app: { db: Database | null }): Database {
  if (!app.db) throw new AppError(503, errorCodes.unavailable, 'Veritabanı kullanılamıyor.');
  return app.db;
}

/** `returning()` sonucunun tek satiri; yoksa beklenmeyen hata (kod hatasi, kullanici hatasi degil). */
export function tekSatir<T>(satirlar: T[]): T {
  const satir = satirlar[0];
  if (satir === undefined) throw new Error('beklenen satır yazılamadı');
  return satir;
}

/** Anahtar tabanli sayfalama: `limit + 1` satir okunduysa son sayfa satirinin anahtari. */
export function sonrakiImlec<T>(
  satirlar: T[],
  limit: number,
  anahtar: (s: T) => string,
): string | null {
  return satirlar.length > limit ? anahtar(satirlar[limit - 1] as T) : null;
}

/** `undefined` alanlari atar (kismi guncelleme govdesi -> `set` nesnesi). */
export function tanimli<T extends object>(nesne: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(nesne).filter(([, v]) => v !== undefined)) as never;
}
