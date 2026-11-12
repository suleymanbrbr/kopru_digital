import {
  SORU_VARSAYILAN_FOTO_SAKLAMA_GUN,
  SORU_VARSAYILAN_GUNLUK_LIMIT,
  SORU_VARSAYILAN_TAKIP_LIMITI,
  SORU_SES_EN_FAZLA_SN,
  errorCodes,
  izinVarMi,
  soruHataKodlari,
  type Actor,
  type IzinKodu,
  type SoruKota,
} from '@kopru/contracts';
import { AppError, type Tx } from '@kopru/service-kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import { denetimKayitlari, grupUyeleri, soruAyarlari, uyelikler } from '../../db/schema.js';
import { modulAcikMi, requirePermission, type YetkiBaglami } from '../hesap/index.js';

/**
 * "Soru sor" ortak yardimcilari: yetki baglami, imlec, ayar, yerel zaman, kota (atomik artirim) ve modul
 * denetimi. Yonlendirme `soru-yonlendirme.ts`, medya `soru-medya.ts`, yanit uretimi `soru-detay.ts`'tedir.
 */

export const OUTBOX_TABLOSU = 'ortak.outbox';

export const kurumParam = z.object({ kurum_id: z.uuid() });
export const soruParam = kurumParam.extend({ id: z.uuid() });

export function yetkiAl(request: { yetki: YetkiBaglami | null }): YetkiBaglami {
  if (!request.yetki) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
  return request.yetki;
}

export const kiraci = (y: YetkiBaglami) => ({
  kurumId: y.kurumId,
  kullaniciId: y.kullaniciId,
  roller: [y.rol],
});

export interface SoruOlayBaglami {
  kurumId: string;
  actor: Actor;
  correlationId: string;
}

export const olayBaglami = (y: YetkiBaglami, correlationId: string): SoruOlayBaglami => ({
  kurumId: y.kurumId,
  actor: { tur: 'kullanici', id: y.kullaniciId },
  correlationId,
});

export const soruBulunamadi = () => new AppError(404, errorCodes.notFound, 'Soru bulunamadı.');

/** Kurumdaki tum yazismalari gorebilen/yonetebilen rol (`soru.yonet`, kurum kapsami). */
export const yonetimYetkisi = (y: YetkiBaglami): boolean =>
  izinVarMi(y.rol, 'soru.yonet') && y.kapsam === 'kurum';

/** Yonetim uclari: `soru.yonet` + kurum kapsami (subeye bagli yonetici erisemez). */
export const yonetimKapisi = () => requirePermission('soru.yonet', { scope: 'kurum' });

/**
 * Soru sor uclarinin herhangi birine izni olan kullanici (ogrenci: `soru.sor`, ogretmen: `soru.cevapla`,
 * sahip/yonetici: hepsi). Ilk basarili kapi `request.yetki`yi doldurur; hepsi reddederse ilk hata doner.
 */
export function herhangiBirIzin(...izinler: IzinKodu[]): preHandlerAsyncHookHandler {
  const kapilar = izinler.map((izin) => requirePermission(izin));
  return async function herhangiBirKapisi(this: FastifyInstance, request, reply) {
    let ilkHata: unknown;
    for (const kapi of kapilar) {
      try {
        await kapi.call(this, request, reply);
        return;
      } catch (err) {
        ilkHata ??= err;
      }
    }
    throw ilkHata;
  };
}

export function benzersizlikIhlali(err: unknown, kisit?: string): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    const kod = (e as { code?: string }).code;
    if (kod === '23505') {
      if (kisit === undefined) return true;
      if ((e as { constraint_name?: string }).constraint_name === kisit) return true;
    }
  }
  return false;
}

// --- Imlec -----------------------------------------------------------------------------------

const IMLEC_ZAMAN = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d+)?[+-]\d\d(:?\d\d)?$/;

/** Imlec: `<zaman (PostgreSQL metni, mikrosaniye korunur)>|<satir kimligi>`, base64url. */
export const imlecYaz = (ts: string, id: string) =>
  Buffer.from(`${ts}|${id}`, 'utf8').toString('base64url');

export function imlecCoz(imlec: string | undefined): { ts: string; id: string } | undefined {
  if (imlec === undefined) return undefined;
  const [ts, id, fazla] = Buffer.from(imlec, 'base64url').toString('utf8').split('|');
  if (
    !ts ||
    !id ||
    fazla !== undefined ||
    !IMLEC_ZAMAN.test(ts) ||
    !z.uuid().safeParse(id).success
  ) {
    throw new AppError(400, errorCodes.validation, 'İmleç geçersiz.');
  }
  return { ts, id };
}

/** Turkce harf duyarsiz karsilastirma: I, İ, ı -> i; ILIKE gerisini (ü/Ü, ş/Ş...) katlar. */
export const aramaKatla = (q: string) =>
  q.replace(/[İIı]/g, 'i').replace(/[\\%_]/g, (c) => `\\${c}`);

// --- Ayar ------------------------------------------------------------------------------------

export interface EtkinAyar {
  gunluk: number | null;
  aylik: number | null;
  takip: number;
  sesAzami: number;
  saklamaGun: number;
  varsayilan: boolean;
  surum: number | null;
}

/** Kurum ayari; satir yoksa varsayilanlar (gunde 3, aylik sinirsiz). */
export async function ayarOku(tx: Tx, kurumId: string): Promise<EtkinAyar> {
  const [a] = await tx.select().from(soruAyarlari).where(eq(soruAyarlari.kurum_id, kurumId));
  if (!a) {
    return {
      gunluk: SORU_VARSAYILAN_GUNLUK_LIMIT,
      aylik: null,
      takip: SORU_VARSAYILAN_TAKIP_LIMITI,
      sesAzami: SORU_SES_EN_FAZLA_SN,
      saklamaGun: SORU_VARSAYILAN_FOTO_SAKLAMA_GUN,
      varsayilan: true,
      surum: null,
    };
  }
  return {
    gunluk: a.gunluk_soru_limiti,
    aylik: a.aylik_soru_limiti,
    takip: a.soru_basina_takip_limiti,
    sesAzami: a.ses_azami_sn,
    saklamaGun: a.foto_saklama_gun,
    varsayilan: false,
    surum: a.surum,
  };
}

/**
 * Abonelik plan ust siniri kancasi: `abonelik` blogu gelince plan limiti (`soru_aylik_ogrenci`) burada
 * okunur ve `etkinAylikLimit` ile `LEAST` alinir. Su an plan yok: `null` (sinirsiz).
 */
export function planAylikUstSiniri(_tx: Tx, _kurumId: string): Promise<number | null> {
  return Promise.resolve(null);
}

export async function etkinAylikLimit(tx: Tx, kurumId: string, ayar: EtkinAyar) {
  const plan = await planAylikUstSiniri(tx, kurumId);
  if (ayar.aylik === null) return plan;
  return plan === null ? ayar.aylik : Math.min(ayar.aylik, plan);
}

// --- Yerel zaman -----------------------------------------------------------------------------

export interface YerelZaman {
  tz: string;
  /** Kurum yerel gunu (YYYY-AA-GG). */
  gun: string;
  /** Yerel ayin ilk gunu. */
  ay: string;
  gunSonuAt: string;
  aySonuAt: string;
}

const UTC_ISO = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;

export async function yerelZaman(tx: Tx, kurumId: string): Promise<YerelZaman> {
  const [r] = await tx.execute<{
    tz: string;
    gun: string;
    ay: string;
    gun_sonu: string;
    ay_sonu: string;
  }>(sql`
    select k.saat_dilimi as tz,
           (now() at time zone k.saat_dilimi)::date::text as gun,
           date_trunc('month', now() at time zone k.saat_dilimi)::date::text as ay,
           to_char((((now() at time zone k.saat_dilimi)::date + 1)::timestamp at time zone k.saat_dilimi)
                   at time zone 'UTC', ${sql.raw(UTC_ISO)}) as gun_sonu,
           to_char(((date_trunc('month', now() at time zone k.saat_dilimi) + interval '1 month')
                   at time zone k.saat_dilimi) at time zone 'UTC', ${sql.raw(UTC_ISO)}) as ay_sonu
    from hesap.kurumlar k where k.id = ${kurumId}::uuid`);
  if (!r) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
  return { tz: r.tz, gun: r.gun, ay: r.ay, gunSonuAt: r.gun_sonu, aySonuAt: r.ay_sonu };
}

// --- Kota ------------------------------------------------------------------------------------

async function sayaclariOku(tx: Tx, ogrenciId: string, z: YerelZaman) {
  const satirlar = await tx.execute<{ donem_turu: string; kullanilan: number }>(sql`
    select donem_turu, kullanilan from ogrenme.soru_kota_sayaclari
    where ogrenci_id = ${ogrenciId}::uuid
      and ((donem_turu = 'gun' and donem = ${z.gun}::date) or (donem_turu = 'ay' and donem = ${z.ay}::date))`);
  const gun = satirlar.find((s) => s.donem_turu === 'gun')?.kullanilan ?? 0;
  const ay = satirlar.find((s) => s.donem_turu === 'ay')?.kullanilan ?? 0;
  return { gun, ay };
}

export async function kotaDurumu(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
  ayar: EtkinAyar,
  z: YerelZaman,
): Promise<SoruKota> {
  const { gun, ay } = await sayaclariOku(tx, ogrenciId, z);
  const aylik = await etkinAylikLimit(tx, kurumId, ayar);
  const kalan = (limit: number | null, kullanilan: number) =>
    limit === null ? null : Math.max(0, limit - kullanilan);
  return {
    gunluk_limit: ayar.gunluk,
    gunluk_kullanilan: gun,
    gunluk_kalan: kalan(ayar.gunluk, gun),
    gunluk_sifirlanma_at: z.gunSonuAt,
    aylik_limit: aylik,
    aylik_kullanilan: ay,
    aylik_kalan: kalan(aylik, ay),
    aylik_sifirlanma_at: z.aySonuAt,
  };
}

async function sayacArtir(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
  turu: 'gun' | 'ay',
  donem: string,
  limit: number | null,
): Promise<boolean> {
  const satirlar = await tx.execute<{ kullanilan: number }>(sql`
    insert into ogrenme.soru_kota_sayaclari as k (kurum_id, ogrenci_id, donem_turu, donem, kullanilan)
    values (${kurumId}::uuid, ${ogrenciId}::uuid, ${turu}, ${donem}::date, 1)
    on conflict (ogrenci_id, donem_turu, donem) do update set kullanilan = k.kullanilan + 1
      where ${limit}::int is null or k.kullanilan < ${limit}::int
    returning kullanilan`);
  return satirlar.length > 0;
}

/**
 * Soru basina bir hak harcar. Tek SQL ifadesi (`ON CONFLICT DO UPDATE .. WHERE kullanilan < limit`) satiri
 * kilitleyerek artirir: eszamanli istekler arasinda limit asilamaz. Cagiran soruyu AYNI islemde yazar; soru
 * yazilamazsa islem geri alinir ve hak da geri doner. Asilirsa 429 `kota_asildi` (kalan hak ve sifirlanma
 * zamani `details.kota`).
 */
export async function kotaTuket(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
  ayar: EtkinAyar,
  z: YerelZaman,
): Promise<SoruKota> {
  const aylikLimit = await etkinAylikLimit(tx, kurumId, ayar);
  const gunOk = await sayacArtir(tx, kurumId, ogrenciId, 'gun', z.gun, ayar.gunluk);
  const ayOk = gunOk && (await sayacArtir(tx, kurumId, ogrenciId, 'ay', z.ay, aylikLimit));
  if (!gunOk || !ayOk) {
    // Okunan sayac, bu islemin artirmasini icermez (geri alinacak): gercek kalan hak.
    const kota = await kotaDurumu(tx, kurumId, ogrenciId, ayar, z);
    throw new AppError(
      429,
      soruHataKodlari.kotaAsildi,
      !gunOk ? 'Bugünkü soru hakkınız doldu.' : 'Bu ayki soru hakkınız doldu.',
      { kota, kota_turu: !gunOk ? 'gunluk' : 'aylik' },
    );
  }
  return kotaDurumu(tx, kurumId, ogrenciId, ayar, z);
}

// --- Modul -----------------------------------------------------------------------------------

/**
 * `soru_sor` modulu ogrencinin kapsaminda acik olmali. Kurum duzeyi `requirePermission`da denetlenir; burada
 * grup/kademe duzeyi: ogrencinin etkin gruplarindan en az biri aciksa acik (hicbir grubu yoksa kademesi).
 */
export async function soruModuluAcikOlmali(tx: Tx, kurumId: string, ogrenciId: string) {
  const gruplar = await tx
    .select({ id: grupUyeleri.grup_id })
    .from(grupUyeleri)
    .where(and(eq(grupUyeleri.ogrenci_id, ogrenciId), isNull(grupUyeleri.bitis_tarihi)));
  let acik: boolean;
  if (gruplar.length === 0) {
    const [u] = await tx
      .select({ kademe_id: uyelikler.kademe_id })
      .from(uyelikler)
      .where(eq(uyelikler.id, ogrenciId));
    acik = await modulAcikMi(tx, kurumId, 'soru_sor', { kademeId: u?.kademe_id ?? null });
  } else {
    acik = false;
    for (const g of gruplar) {
      if (await modulAcikMi(tx, kurumId, 'soru_sor', { grupId: g.id })) {
        acik = true;
        break;
      }
    }
  }
  if (!acik) throw new AppError(403, errorCodes.modulKapali, 'Soru sor özelliği kapalı.');
}

// --- Denetim ---------------------------------------------------------------------------------

/** Yonetim yazmalari denetim kaydi (kisisel veri ve serbest metin yok: yalniz kimlik, sayi, durum). */
export async function soruDenetimiYaz(
  tx: Tx,
  y: YetkiBaglami,
  ip: string,
  eylem: string,
  hedefTuru: string,
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

/**
 * Ayni `istek_id` ile eszamanli iki istegi serilestirir (islem sonuna kadar tutulan advisory kilit):
 * ikinci istek birincinin sonucunu gorur (`istek_id` tekrar yolu), cift kota/dosya cakismasi olmaz.
 */
export async function istekKilidi(tx: Tx, kurumId: string, istekId: string | undefined) {
  if (!istekId) return;
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${kurumId}:${istekId}`}, 0))`,
  );
}
