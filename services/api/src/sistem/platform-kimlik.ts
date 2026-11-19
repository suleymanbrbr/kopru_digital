import type { PlatformRolu } from '@kopru/contracts';
import type { Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { isoZaman, pgDizi } from './platform-ortak.js';
import { withSistem, type SistemBaglami } from './with-sistem.js';

export interface PlatformKullanicisi {
  id: string;
  rol: PlatformRolu;
}

/**
 * Platform kapisinin her istekte yaptigi okuma (denetim satiri yazmaz; istegin denetimi `onSend`te yazilir).
 * Yetkinin kaynagi veritabanidir, `plat` claim'i yalniz ipucudur: rol geri alinirsa belirtec omru
 * (15 dk) beklenmeden platform uclari kapanir.
 */
export async function platformKullanicisiGetir(
  sistemDb: Database,
  kullaniciId: string,
): Promise<PlatformKullanicisi | null> {
  const rows = await sistemDb.orm.execute<{ id: string; platform_rolu: string }>(sql`
    select id, platform_rolu from hesap.kullanicilar
    where id = ${kullaniciId}::uuid and durum = 'aktif' and platform_rolu in ('destek', 'yonetici')`);
  const satir = rows[0];
  if (!satir) return null;
  return { id: satir.id, rol: satir.platform_rolu as PlatformRolu };
}

export interface OturumIkinciAdimDurumu {
  /** Oturum var, iptal edilmemis ve suresi dolmamis. */
  gecerli: boolean;
  ikinciAdimAt: Date | null;
}

export async function oturumIkinciAdimDurumu(
  sistemDb: Database,
  oturumId: string,
): Promise<OturumIkinciAdimDurumu> {
  const rows = await sistemDb.orm.execute<{ ikinci_adim_at: string | null }>(sql`
    select ${isoZaman('ikinci_adim_at')} as ikinci_adim_at from hesap.oturumlar
    where id = ${oturumId}::uuid and iptal_at is null and expires_at > now()`);
  const satir = rows[0];
  return {
    gecerli: satir !== undefined,
    ikinciAdimAt: satir?.ikinci_adim_at ? new Date(satir.ikinci_adim_at) : null,
  };
}

/** `GET /platform/ben` icin: kurulu mu, kac yedek kod kaldi. */
export async function ikinciAdimOzeti(
  sistemDb: Database,
  kullaniciId: string,
): Promise<{ kurulu: boolean; yedekKodKalan: number }> {
  const rows = await sistemDb.orm.execute<{ kalan: number }>(sql`
    select coalesce(cardinality(yedek_kod_ozetleri), 0)::int as kalan
    from hesap.platform_ikinci_adim
    where kullanici_id = ${kullaniciId}::uuid and onaylandi_at is not null`);
  return { kurulu: rows.length > 0, yedekKodKalan: rows[0]?.kalan ?? 0 };
}

export interface IkinciAdimSatiri extends Record<string, unknown> {
  sir_sifreli: Buffer;
  onaylandi_at: string | null;
  son_sayac: number | null;
  yedek_kod_ozetleri: string[];
  yanlis_deneme: number;
  kilitli_bitis_at: string | null;
}

/** Kurulum: onaysiz kayit yeniden yazilir, onayli kayit varsa `null` (cagiran 409 doner). */
export async function ikinciAdimKurSistem(
  sistemDb: Database | null,
  baglam: SistemBaglami,
  girdi: { id: string; kullaniciId: string; sirSifreli: Buffer; yedekKodOzetleri: string[] },
): Promise<boolean> {
  return withSistem(sistemDb, baglam, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      insert into hesap.platform_ikinci_adim (id, kullanici_id, sir_sifreli, yedek_kod_ozetleri)
      values (${girdi.id}::uuid, ${girdi.kullaniciId}::uuid, ${girdi.sirSifreli},
              ${pgDizi(girdi.yedekKodOzetleri)})
      on conflict (kullanici_id) do update
        set sir_sifreli = excluded.sir_sifreli, yedek_kod_ozetleri = excluded.yedek_kod_ozetleri,
            son_sayac = null, yanlis_deneme = 0, kilitli_bitis_at = null
        where hesap.platform_ikinci_adim.onaylandi_at is null
      returning id`);
    return rows.length > 0;
  });
}

export type IkinciAdimKarari =
  | {
      sonuc: 'dogru';
      guncelle: { sonSayac?: number; yedekKodOzetleri?: string[]; onayla?: boolean };
    }
  | { sonuc: 'yanlis' };

export type IkinciAdimSonucu =
  | { durum: 'dogrulandi'; yedekKodKalan: number }
  | { durum: 'yanlis'; kalanDeneme: number }
  | { durum: 'kilitli'; kilitBitis: Date }
  | { durum: 'kurulu_degil' };

export const IKINCI_ADIM_EN_COK_YANLIS = 5;
export const IKINCI_ADIM_KILIT_DK = 15;

/**
 * Ikinci adim kodunu satir kilidi altinda degerlendirir (eszamanli denemeler siralanir; yanlis sayaci ve
 * tekrar oynatma korumasi atomik). `degerlendir` saf bir fonksiyondur. Basarida oturum satirina
 * `ikinci_adim_at` yazilir. `onayli` true ise yalniz onayli kayitlar, false ise yalniz onaysiz (kurulum
 * onayi) kayitlar degerlendirilir.
 */
export async function ikinciAdimDegerlendir(
  sistemDb: Database | null,
  baglam: SistemBaglami,
  girdi: { kullaniciId: string; oturumId: string; onayli: boolean },
  degerlendir: (satir: IkinciAdimSatiri) => IkinciAdimKarari,
): Promise<IkinciAdimSonucu> {
  return withSistem(sistemDb, baglam, async (tx) => {
    const rows = await tx.execute<IkinciAdimSatiri>(sql`
      select sir_sifreli, ${isoZaman('onaylandi_at')} as onaylandi_at, son_sayac::double precision as son_sayac,
             yedek_kod_ozetleri, yanlis_deneme, ${isoZaman('kilitli_bitis_at')} as kilitli_bitis_at
      from hesap.platform_ikinci_adim where kullanici_id = ${girdi.kullaniciId}::uuid for update`);
    const satir = rows[0];
    if (!satir || (satir.onaylandi_at !== null) !== girdi.onayli) return { durum: 'kurulu_degil' };
    const simdi = new Date();
    const kilit = satir.kilitli_bitis_at ? new Date(satir.kilitli_bitis_at) : null;
    if (kilit && kilit > simdi) {
      return { durum: 'kilitli', kilitBitis: kilit };
    }
    const karar = degerlendir(satir);
    if (karar.sonuc === 'yanlis') {
      const yeni = satir.yanlis_deneme + 1;
      const kilitle = yeni >= IKINCI_ADIM_EN_COK_YANLIS;
      await tx.execute(sql`
        update hesap.platform_ikinci_adim
        set yanlis_deneme = ${kilitle ? 0 : yeni},
            kilitli_bitis_at = ${kilitle ? sql`now() + make_interval(mins => ${IKINCI_ADIM_KILIT_DK})` : sql`null`}
        where kullanici_id = ${girdi.kullaniciId}::uuid`);
      return kilitle
        ? { durum: 'kilitli', kilitBitis: new Date(Date.now() + IKINCI_ADIM_KILIT_DK * 60_000) }
        : { durum: 'yanlis', kalanDeneme: IKINCI_ADIM_EN_COK_YANLIS - yeni };
    }
    const g = karar.guncelle;
    const yedek = g.yedekKodOzetleri ?? satir.yedek_kod_ozetleri;
    await tx.execute(sql`
      update hesap.platform_ikinci_adim
      set yanlis_deneme = 0, kilitli_bitis_at = null,
          son_sayac = ${g.sonSayac ?? satir.son_sayac},
          yedek_kod_ozetleri = ${pgDizi(yedek)},
          onaylandi_at = ${g.onayla ? sql`now()` : sql`onaylandi_at`}
      where kullanici_id = ${girdi.kullaniciId}::uuid`);
    await tx.execute(sql`
      update hesap.oturumlar set ikinci_adim_at = now() where id = ${girdi.oturumId}::uuid`);
    return { durum: 'dogrulandi', yedekKodKalan: yedek.length };
  });
}
