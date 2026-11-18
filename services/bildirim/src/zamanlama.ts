import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { yeniId, type Islem } from './ortak.js';

/**
 * Zamanlanmis bildirimler (`bildirim.zamanlanmis_bildirimler`): gelecekte uretilecek bildirimlerin satirlari.
 * Esleme planlar/yeniler/iptal eder; `zamanlanmis.ts` (dakikalik is) zamani gelenleri `bildirimUret` ile uretir.
 *
 * Iptal nedenleri: `ders`, `yoklama`, `teslim`, `gun` KALICIDIR; `ayar` (kullanici hatirlatmayi kapatti) ve
 * `gecmis` (zamani gecmis) geri alinabilir: ayar degisince ya da erteleme ile yeni zaman gelecekteyse satir
 * yeniden etkinlesir.
 */

export type IptalNedeni = 'ders' | 'yoklama' | 'teslim' | 'gun' | 'ayar' | 'gecmis';

export const KAYNAK_DERS = 'ders';
export const KAYNAK_ODEV = 'odev';
export const KAYNAK_OGRETMEN_GUN = 'ogretmen_gun';

export interface ZamanlamaGirdisi {
  kurumId: string;
  kaynakTuru: string;
  kaynakId: string;
  aliciId: string;
  sablonKodu: string;
  gonderimAt: Date;
  /** Uretim aninda gereken veri (nesne kimlikleri, zamanlar). */
  veri: Readonly<Record<string, unknown>>;
}

/** Kaynak anahtarindan (UUID bicimli) belirlenimci kimlik: gunluk satirlar gibi dogal uuid'si olmayanlar icin. */
export function turetilmisId(...parcalar: string[]): string {
  const h = createHash('sha1').update(parcalar.join('|')).digest();
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x50; // surum 5
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/**
 * Satiri ekler ya da gunceller (idempotent: ayni girdi ikinci kez hicbir seyi degistirmez).
 * - `gonderimAt` gecmisteyse (`simdi` ya da oncesi) yeni satir EKLENMEZ; var olan satir `gecmis` nedeniyle iptal edilir.
 * - `kapali` (`ayar`): satir iptal edilmis olarak yazilir (kullanici kapatti); ayar acilinca yeniden etkinlesir.
 * - Zamani degisen satirda `uretildi_at` sifirlanir (yeni zamanda yeniden uretilir).
 */
export async function zamanla(
  tx: Islem,
  g: ZamanlamaGirdisi,
  simdi: Date,
  secenek: { kapali?: boolean; gecmisiAtla?: boolean } = {},
): Promise<'zamanlandi' | 'kapali' | 'gecmis'> {
  const gecmis = (secenek.gecmisiAtla ?? true) && g.gonderimAt.getTime() <= simdi.getTime();
  const nedeni: IptalNedeni | null = secenek.kapali ? 'ayar' : gecmis ? 'gecmis' : null;
  if (nedeni === 'gecmis') {
    // Yeni satir acilmaz; var olan satir iptal edilir (erteleme gecmise tasindi).
    await tx.execute(sql`
      update bildirim.zamanlanmis_bildirimler
         set iptal_at = coalesce(iptal_at, ${simdi.toISOString()}::timestamptz),
             iptal_nedeni = coalesce(iptal_nedeni, 'gecmis')
       where kurum_id = ${g.kurumId} and kaynak_turu = ${g.kaynakTuru} and kaynak_id = ${g.kaynakId}
         and alici_id = ${g.aliciId} and sablon_kodu = ${g.sablonKodu} and uretildi_at is null`);
    return 'gecmis';
  }
  await tx.execute(sql`
    insert into bildirim.zamanlanmis_bildirimler
      (id, kurum_id, kaynak_turu, kaynak_id, alici_id, sablon_kodu, gonderim_at, veri, iptal_at, iptal_nedeni)
    values (${yeniId()}, ${g.kurumId}, ${g.kaynakTuru}, ${g.kaynakId}, ${g.aliciId}, ${g.sablonKodu},
            ${g.gonderimAt.toISOString()}::timestamptz, ${JSON.stringify(g.veri)}::jsonb,
            ${nedeni ? simdi.toISOString() : null}::timestamptz, ${nedeni})
    on conflict (kurum_id, kaynak_turu, kaynak_id, alici_id, sablon_kodu) do update set
      gonderim_at = excluded.gonderim_at,
      veri = excluded.veri,
      uretildi_at = case when bildirim.zamanlanmis_bildirimler.gonderim_at is distinct from excluded.gonderim_at
                         then null else bildirim.zamanlanmis_bildirimler.uretildi_at end,
      iptal_at = case
        when excluded.iptal_at is not null
          then coalesce(bildirim.zamanlanmis_bildirimler.iptal_at, excluded.iptal_at)
        when bildirim.zamanlanmis_bildirimler.iptal_nedeni in ('ayar', 'gecmis') then null
        else bildirim.zamanlanmis_bildirimler.iptal_at end,
      iptal_nedeni = case
        when excluded.iptal_at is not null
          then coalesce(bildirim.zamanlanmis_bildirimler.iptal_nedeni, excluded.iptal_nedeni)
        when bildirim.zamanlanmis_bildirimler.iptal_nedeni in ('ayar', 'gecmis') then null
        else bildirim.zamanlanmis_bildirimler.iptal_nedeni end`);
  return nedeni ? 'kapali' : 'zamanlandi';
}

/**
 * Henuz uretilmemis satirlari iptal eder (zaten iptal olan satirin nedeni korunur).
 * `aliciIdleri` verilmezse kaynagin tum alicilari; `sablonKodlari` verilmezse tum sablonlar.
 * Doner: iptal edilen (yeni) satir sayisi.
 */
export async function iptalEt(
  tx: Islem,
  k: {
    kurumId: string;
    kaynakTuru: string;
    kaynakId: string;
    nedeni: IptalNedeni;
    aliciIdleri?: readonly string[];
    sablonKodlari?: readonly string[];
  },
  simdi: Date,
): Promise<number> {
  const alici = k.aliciIdleri ? sql`and alici_id = any(${pgDizi(k.aliciIdleri)}::uuid[])` : sql``;
  const sablon = k.sablonKodlari
    ? sql`and sablon_kodu = any(${pgDizi(k.sablonKodlari)}::text[])`
    : sql``;
  const r = await tx.execute(sql`
    update bildirim.zamanlanmis_bildirimler
       set iptal_at = ${simdi.toISOString()}::timestamptz, iptal_nedeni = ${k.nedeni}
     where kurum_id = ${k.kurumId} and kaynak_turu = ${k.kaynakTuru} and kaynak_id = ${k.kaynakId}
       and iptal_at is null and uretildi_at is null ${alici} ${sablon}
    returning 1`);
  return r.length;
}

/**
 * Daha once uretilmis (kutuda duran) bildirimleri gizler: `gecerlilik_bitis_at` simdiye cekilir.
 * Iptal/erteleme sonrasi eski hatirlatmanin kutuda yanlis bilgi vermemesi icin.
 */
export async function uretilmisiGizle(
  tx: Islem,
  g: {
    kurumId: string;
    sablonKodu: string;
    /** `tekil_anahtar` onegi (ornek `ders_hatirlatma:{ders_id}:`); `%`/`_` icermemeli. */
    tekilOnek: string;
    aliciIdleri?: readonly string[];
  },
  simdi: Date,
): Promise<void> {
  const alici = g.aliciIdleri ? sql`and alici_id = any(${pgDizi(g.aliciIdleri)}::uuid[])` : sql``;
  await tx.execute(sql`
    update bildirim.bildirimler
       set gecerlilik_bitis_at = least(coalesce(gecerlilik_bitis_at, ${simdi.toISOString()}::timestamptz),
                                       ${simdi.toISOString()}::timestamptz)
     where kurum_id = ${g.kurumId} and sablon_kodu = ${g.sablonKodu}
       and left(tekil_anahtar, ${g.tekilOnek.length}) = ${g.tekilOnek}
       and (gecerlilik_bitis_at is null or gecerlilik_bitis_at > ${simdi.toISOString()}::timestamptz)
       ${alici}`);
}

/** Dizi parametresi: `= any(...)` icin PostgreSQL dizi sabiti. */
export function pgDizi(degerler: readonly string[]) {
  return `{${degerler.map((d) => `"${d.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')}}`;
}
