import type { Rol } from '@kopru/contracts';
import type { Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { platformDenetimYaz } from './platform-denetim.js';
import { isoZaman } from './platform-ortak.js';
import { withSistem, type SistemBaglami } from './with-sistem.js';

/** Taklit belirtecinin azami omru (`taklit_kayitlari_sure_chk`, ADR 0004). */
export const TAKLIT_OMRU_DK = 15;

const ROL_ONCELIGI: readonly Rol[] = ['sahip', 'yonetici', 'ogretmen', 'ogrenci', 'veli'];

export type TaklitBaslatSonucu =
  | { durum: 'hedef_yok' }
  | { durum: 'hedef_platform_kullanicisi' }
  | {
      durum: 'tamam';
      taklitId: string;
      bitisAt: Date;
      uyelikId: string;
      rol: Rol;
      roller: Rol[];
    };

/**
 * Taklit kaydini acar. Hedef: aktif bir kullanici, o kurumda aktif uyeligi var, platform kullanicisi degil
 * (platform yetkisi taklitle devralinamaz). Denetim satiri (`platform.taklit_baslat`, neden dahil) ve
 * `taklit_kayitlari` satiri ayni islemde yazilir.
 */
export async function platformTaklitBaslat(
  sistemDb: Database | null,
  baglam: SistemBaglami & { aktorKullaniciId: string },
  girdi: { hedefKullaniciId: string; kurumId: string; neden: string },
): Promise<TaklitBaslatSonucu> {
  const taklitId = uuidv7();
  return withSistem(
    sistemDb,
    { ...baglam, hedefTuru: 'taklit', hedefId: taklitId, taklitKayitId: taklitId },
    async (tx) => {
      const [hedef] = await tx.execute<{ platform_rolu: string }>(sql`
        select platform_rolu from hesap.kullanicilar
        where id = ${girdi.hedefKullaniciId}::uuid and durum = 'aktif'`);
      if (!hedef) return { durum: 'hedef_yok' };
      if (hedef.platform_rolu !== 'yok') return { durum: 'hedef_platform_kullanicisi' };
      const uyelikler = await tx.execute<{ id: string; rol: Rol }>(sql`
        select id, rol from hesap.uyelikler
        where kurum_id = ${girdi.kurumId}::uuid and kullanici_id = ${girdi.hedefKullaniciId}::uuid
          and durum = 'aktif'`);
      const secilen = [...uyelikler].sort(
        (a, b) => ROL_ONCELIGI.indexOf(a.rol) - ROL_ONCELIGI.indexOf(b.rol),
      )[0];
      if (!secilen) return { durum: 'hedef_yok' };
      const [kayit] = await tx.execute<{ bitis_at: string }>(sql`
        insert into hesap.taklit_kayitlari
          (id, platform_kullanici_id, hedef_kullanici_id, hedef_kurum_id, neden, baslangic_at, bitis_at, ip)
        values (${taklitId}::uuid, ${baglam.aktorKullaniciId}::uuid, ${girdi.hedefKullaniciId}::uuid,
                ${girdi.kurumId}::uuid, ${girdi.neden}, now(),
                now() + make_interval(mins => ${TAKLIT_OMRU_DK}), ${baglam.ip ?? null}::inet)
        returning ${isoZaman('bitis_at')} as bitis_at`);
      if (!kayit) throw new Error('taklit kaydı yazılamadı');
      return {
        durum: 'tamam',
        taklitId,
        bitisAt: new Date(kayit.bitis_at),
        uyelikId: secilen.id,
        rol: secilen.rol,
        roller: [...new Set(uyelikler.map((u) => u.rol))],
      };
    },
  );
}

export type TaklitSonlandirSonucu = 'tamam' | 'yok' | 'yasak' | 'zaten_bitti';

/** Erken sonlandirma. Yalniz taklidi baslatan veya platform yoneticisi sonlandirabilir. */
export async function platformTaklitSonlandir(
  sistemDb: Database | null,
  baglam: SistemBaglami & { aktorKullaniciId: string },
  girdi: { taklitId: string; yonetici: boolean },
): Promise<TaklitSonlandirSonucu> {
  return withSistem(
    sistemDb,
    { ...baglam, hedefTuru: 'taklit', hedefId: girdi.taklitId, taklitKayitId: girdi.taklitId },
    async (tx) => {
      const [kayit] = await tx.execute<{
        platform_kullanici_id: string;
        hedef_kurum_id: string;
        sonlandirildi: boolean;
        bitti: boolean;
      }>(sql`
        select platform_kullanici_id, hedef_kurum_id, (sonlandirildi_at is not null) as sonlandirildi,
               (bitis_at <= now()) as bitti
        from hesap.taklit_kayitlari where id = ${girdi.taklitId}::uuid for update`);
      if (!kayit) return 'yok';
      if (kayit.platform_kullanici_id !== baglam.aktorKullaniciId && !girdi.yonetici)
        return 'yasak';
      if (kayit.sonlandirildi || kayit.bitti) return 'zaten_bitti';
      await tx.execute(sql`
        update hesap.taklit_kayitlari set sonlandirildi_at = now() where id = ${girdi.taklitId}::uuid`);
      return 'tamam';
    },
  );
}

export interface GecerliTaklit {
  taklitId: string;
  aktorId: string;
  kurumId: string;
  hedefKullaniciId: string;
}

/**
 * Taklit belirtecinin her istekte yapilan canli dogrulamasi: kayit sonlandirilmamis, suresi dolmamis, belirtecin
 * hedef/kurumuyla ayni ve taklit eden platform kullanicisi hala yetkili. Denetim satiri yazmaz
 * (istegin denetimi `taklitIstegiDenetle` ile).
 */
export async function taklitGecerliMi(
  sistemDb: Database,
  girdi: { taklitId: string; hedefKullaniciId: string; kurumId: string },
): Promise<GecerliTaklit | null> {
  const rows = await sistemDb.orm.execute<{ platform_kullanici_id: string }>(sql`
    select t.platform_kullanici_id from hesap.taklit_kayitlari t
    join hesap.kullanicilar p on p.id = t.platform_kullanici_id
      and p.durum = 'aktif' and p.platform_rolu in ('destek', 'yonetici')
    where t.id = ${girdi.taklitId}::uuid and t.hedef_kullanici_id = ${girdi.hedefKullaniciId}::uuid
      and t.hedef_kurum_id = ${girdi.kurumId}::uuid
      and t.sonlandirildi_at is null and t.bitis_at > now()`);
  const satir = rows[0];
  if (!satir) return null;
  return {
    taklitId: girdi.taklitId,
    aktorId: satir.platform_kullanici_id,
    kurumId: girdi.kurumId,
    hedefKullaniciId: girdi.hedefKullaniciId,
  };
}

/** Taklit belirteciyle gelen her istegin denetim satiri (`taklit_kayit_id` ile). */
export async function taklitIstegiDenetle(
  sistemDb: Database | null,
  girdi: {
    taklitId: string;
    aktorId: string;
    kurumId: string;
    hedefKullaniciId: string;
    yontem: string;
    yol: string;
    durum: number;
    ip?: string | undefined;
    istekId?: string | undefined;
  },
): Promise<void> {
  await platformDenetimYaz(sistemDb, {
    eylem: 'taklit.istek',
    neden: 'Taklit oturumu isteği',
    aktorKullaniciId: girdi.aktorId,
    kurumId: girdi.kurumId,
    taklitKayitId: girdi.taklitId,
    hedefTuru: 'kullanici',
    hedefId: girdi.hedefKullaniciId,
    ...(girdi.ip ? { ip: girdi.ip } : {}),
    ...(girdi.istekId ? { istekId: girdi.istekId } : {}),
    ayrinti: { yontem: girdi.yontem, yol: girdi.yol, durum: girdi.durum },
  });
}
