import { createHash } from 'node:crypto';

import { errorCodes, type Rol } from '@kopru/contracts';
import { AppError, type AuthContext, type Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { gunHesapla, kurumBilgisi, modulAcikMi, type Islem } from './ortak.js';

/**
 * Odak, haftanin yildizi ve karakter uclarinin ortak yardimcilari. Yazma izinleri izin sozlugunde yoktur
 * (`oyunlastirma.oku` var, yazma yok): karar rol + kapsamla verilir (rapor: sozluk degistirilmedi).
 */

export interface Kimlik {
  kullaniciId: string;
  kurumId: string;
  uyelikId: string;
  rol: Rol;
}

export function kimlikAl(request: { auth: AuthContext | null }, kurumId: string): Kimlik {
  const a = request.auth;
  if (!a) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
  if (!a.kurumId || !a.uyelikId || !a.rol) {
    throw new AppError(403, errorCodes.kurumGerekli, 'Bu işlem için bir kurum seçmelisiniz.');
  }
  if (a.kurumId !== kurumId) {
    throw new AppError(403, errorCodes.forbidden, 'Bu kuruma erişiminiz yok.');
  }
  return { kullaniciId: a.kullaniciId, kurumId, uyelikId: a.uyelikId, rol: a.rol as Rol };
}

export function ogrenciZorunlu(k: Kimlik): void {
  if (k.rol !== 'ogrenci') {
    throw new AppError(403, errorCodes.izinYok, 'Bu uç yalnızca öğrenciler içindir.');
  }
}

export const modulKapali = () =>
  new AppError(403, errorCodes.modulKapali, 'Bu özellik kurumunuzda kapalı.');

/** Kurum aktif degilse ya da `oyunlastirma` kapaliysa `403 modul_kapali`. */
export async function modulKontrol(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
  gun: string,
  grupId?: string,
): Promise<void> {
  const kurum = await kurumBilgisi(tx, kurumId);
  const acik = await modulAcikMi(tx, { kurumId, ogrenciId, gun, ...(grupId ? { grupId } : {}) });
  if (kurum.durum !== 'aktif' || !acik) throw modulKapali();
}

export interface Zaman {
  saatDilimi: string;
  gun: string;
  hafta: string;
}

export async function zamanBilgisi(tx: Tx, kurumId: string, an: Date): Promise<Zaman> {
  const kurum = await kurumBilgisi(tx, kurumId);
  const { gun, hafta } = await gunHesapla(tx, kurum.saatDilimi, an.toISOString());
  return { saatDilimi: kurum.saatDilimi, gun, hafta };
}

const OLAY_ISIM_ALANI = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // RFC 9562 DNS ad alani

/** UUIDv5 (SHA-1; RFC 9562). `odak:{oturum_id}` -> `xp_hareketleri.kaynak_olay_id`. */
export function uuidv5(ad: string, alan: string = OLAY_ISIM_ALANI): string {
  const ns = Buffer.from(alan.replaceAll('-', ''), 'hex');
  const h = createHash('sha1').update(ns).update(ad).digest();
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x50;
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export const odakOlayId = (oturumId: string) => uuidv5(`odak:${oturumId}`);

/**
 * Ogretmen `ogrenciId`'yi atandigi (ve ogrencinin uye oldugu) bir grupta goruyor mu? `grupId` verilirse
 * yalniz o grup. `atama_kopyalari` + `grup_uyesi_kopyalari`; tarih araliklari `gun`u icermeli.
 */
export async function ogretmenGrubundaMi(
  tx: Islem,
  b: { kurumId: string; ogretmenId: string; ogrenciId: string; gun: string; grupId?: string },
): Promise<boolean> {
  const r = await tx.execute(sql`
    select 1 from motivasyon.atama_kopyalari a
      join motivasyon.grup_uyesi_kopyalari m on m.grup_id = a.grup_id and m.kurum_id = a.kurum_id
     where a.kurum_id = ${b.kurumId} and a.ogretmen_id = ${b.ogretmenId} and m.ogrenci_id = ${b.ogrenciId}
       ${b.grupId ? sql`and a.grup_id = ${b.grupId}` : sql``}
       and a.baslangic_tarihi <= ${b.gun}::date and (a.bitis_tarihi is null or a.bitis_tarihi >= ${b.gun}::date)
       and m.baslangic_tarihi <= ${b.gun}::date and (m.bitis_tarihi is null or m.bitis_tarihi >= ${b.gun}::date)
     limit 1`);
  return r.length > 0;
}

/** Ogrenci grupta etkin uye mi (yonetici/sahip icin grup dogrulamasi). */
export async function grupUyesiMi(
  tx: Islem,
  b: { kurumId: string; ogrenciId: string; grupId: string; gun: string },
): Promise<boolean> {
  const r = await tx.execute(sql`
    select 1 from motivasyon.grup_uyesi_kopyalari m
     where m.kurum_id = ${b.kurumId} and m.grup_id = ${b.grupId} and m.ogrenci_id = ${b.ogrenciId}
       and m.baslangic_tarihi <= ${b.gun}::date and (m.bitis_tarihi is null or m.bitis_tarihi >= ${b.gun}::date)
     limit 1`);
  return r.length > 0;
}

/** Uyelik kopyasi varsa etkin `ogrenci` olmali; kopya yoksa etkin sayilir (XP tuketicisiyle ayni kural). */
export async function etkinOgrenciMi(tx: Islem, ogrenciId: string): Promise<boolean> {
  const [u] = await tx.execute<{ rol: string; durum: string }>(sql`
    select rol, durum from motivasyon.uyelik_kopyalari where uyelik_id = ${ogrenciId}`);
  return !u || (u.rol === 'ogrenci' && u.durum === 'aktif');
}
