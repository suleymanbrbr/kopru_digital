import type { hesapKullaniciSilindiV1 } from '@kopru/contracts';
import type { Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

/**
 * KVKK (docs/schema/kvkk-silme.md). Kullanicinin yukledigi dosyalar silinmek uzere isaretlenir
 * (`silinecek_at = now()`, `silme_nedeni = 'kullanici_silindi'`); fiziksel silmeyi silme isi (5 dk) yapar:
 * nesne + kucuk resimler S3'ten kalkar, satir `durum='silindi'` olur.
 *
 * KALANLAR (kurum varligi, kisisel veri tasimaz; dosya `tur`u): `odev_eki` (ogretmenin odev materyali), `plan_eki` (hazir
 * haftalik plan dosyasi), `kurum_logosu` ve `fatura_pdf` (vergi mevzuati). Bunlarin sahip kimligi anonimlesen hesaba
 * baglidir. Ogrenci teslimleri, soru fotograf/cizim/sesleri ve avatar silinir.
 */
export const KVKK_KALAN_TURLER = ['odev_eki', 'plan_eki', 'kurum_logosu', 'fatura_pdf'] as const;

/** Silinmis dosya, guclu plan: baska nedenli (ornegin `kurum_kapandi`) daha erken planlari ezmez. */
export async function kullaniciSilindi(
  tx: Pick<Tx, 'execute'>,
  olay: ReturnType<typeof hesapKullaniciSilindiV1.parse>,
): Promise<number> {
  const kalan = sql.join(
    KVKK_KALAN_TURLER.map((t) => sql`${t}`),
    sql`, `,
  );
  const sonuc = await tx.execute(sql`
    update medya.dosyalar
       set silinecek_at = least(coalesce(silinecek_at, now()), now()), silme_nedeni = 'kullanici_silindi',
           saklama_olay_at = ${olay.occurredAt}::timestamptz
     where sahip_kullanici_id = ${olay.data.kullanici_id} and durum <> 'silindi'
       and tur not in (${kalan})
       and (silme_nedeni is distinct from 'kullanici_silindi' or silinecek_at > now())
    returning 1`);
  return sonuc.length;
}

type Kayit = Record<string, unknown>;

/** Disa aktarma: kullanicinin bu kurumdaki dosya kayitlari (depolama anahtari/ozet yok; icerik `GET /v1/dosyalar/{id}`). */
export async function kvkkVeri(
  tx: Pick<Tx, 'execute'>,
  girdi: { kurum_id: string; kullanici_id: string },
): Promise<Record<string, Kayit[]>> {
  const dosyalar = [
    ...(await tx.execute<Kayit>(sql`
      select id, tur, mime_tipi, boyut_bayt, durum, bagli_tur, genislik, yukseklik, sure_sn, created_at, hazir_at,
             silinecek_at, silme_nedeni, silindi_at
        from medya.dosyalar
       where kurum_id = ${girdi.kurum_id} and sahip_kullanici_id = ${girdi.kullanici_id}
       order by created_at`)),
  ].map((r) => ({ ...r }));
  return { dosyalar };
}
