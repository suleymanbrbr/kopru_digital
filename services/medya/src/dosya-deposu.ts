import { medyaDosyaIslenemediV1, type MedyaDosyaTuru } from '@kopru/contracts';
import { publishInTx, type Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

export const OUTBOX_TABLOSU = 'ortak.outbox';

export const SISTEM_AKTORU = { tur: 'sistem', id: 'medya' } as const;

/** `timestamptz` -> ISO 8601 (UTC, ms). drizzle `execute` ham metin dondurur; JS `Date` ayristirmasina guvenme. */
export const iso = (kolon: string) =>
  sql.raw(`to_char(${kolon} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

/** Depolama anahtari: `{kurum_id}/{tur}/{yyyy}/{mm}/{dosya_id}` (kullanici adi/ozgun dosya adi yok). */
export function depolamaAnahtari(
  kurumId: string,
  tur: MedyaDosyaTuru,
  dosyaId: string,
  an: Date = new Date(),
): string {
  const yil = String(an.getUTCFullYear());
  const ay = String(an.getUTCMonth() + 1).padStart(2, '0');
  return `${kurumId}/${tur}/${yil}/${ay}/${dosyaId}`;
}

/**
 * Istemcinin presigned PUT ile yazdigi ham nesne. Islenmis cikti `depolama_anahtari`na yazilir; ham nesne
 * isleme kaydi commit edilince silinir. Boylece cokme/yeniden denemede ozgun bayt (sha256) hep elde kalir.
 */
export const yuklemeAnahtari = (asilAnahtar: string) => `${asilAnahtar}.yukleme`;

export const kucukResimAnahtari =(asilAnahtar: string, varyant: 'kucuk' | 'orta') =>
  `${asilAnahtar}.${varyant}.webp`;

export type IslemeHatasi = 'mime_uyusmazligi' | 'boyut_uyusmazligi' | 'bozuk_dosya' | 'sure_asimi';

/** `sure_asimi` olay sozlesmesinde yok (dar enum); olayda `bozuk_dosya` olarak yayimlanir. */
export const olayHataKodu = (hata: IslemeHatasi) =>
  hata === 'sure_asimi' ? ('bozuk_dosya' as const) : hata;

export interface BasarisizDosya {
  id: string;
  kurum_id: string;
  sahip_kullanici_id: string;
  tur: MedyaDosyaTuru;
}

/**
 * Dosyayi `islenemedi` yapar, nesnelerin silinmesini planlar (silme isi) ve `medya.dosya.islenemedi.v1`
 * yayimlar (ayni islemde). Dosya zaten `islenemedi`/`silindi` ise bir sey yapmaz.
 */
export async function dosyayiBasarisizYap(
  tx: Pick<Tx, 'execute'>,
  dosya: BasarisizDosya,
  hata: IslemeHatasi,
): Promise<boolean> {
  const guncel = await tx.execute(sql`
    update medya.dosyalar
       set durum = 'islenemedi', hata_kodu = ${hata}, isleme_basladi_at = null,
           silinecek_at = coalesce(silinecek_at, now()),
           silme_nedeni = case when silinecek_at is null then 'yetim' else silme_nedeni end
     where id = ${dosya.id} and durum in ('yukleme_bekliyor', 'yuklendi', 'isleniyor')
     returning id`);
  if (guncel.length === 0) return false;
  await publishInTx(
    tx,
    medyaDosyaIslenemediV1.create({
      kurumId: dosya.kurum_id,
      actor: SISTEM_AKTORU,
      correlationId: dosya.id,
      data: {
        dosya_id: dosya.id,
        sahip_kullanici_id: dosya.sahip_kullanici_id,
        tur: dosya.tur,
        hata_kodu: olayHataKodu(hata),
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
  return true;
}
