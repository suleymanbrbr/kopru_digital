import {
  medyaDosyaHazirV1,
  medyaDosyaIslenemediV1,
  medyaDosyaSilindiV1,
  type EventOf,
} from '@kopru/contracts';
import {
  startConsumer,
  type Database,
  type Tuketici,
  type Tx,
  type TuketiciSecenekleri,
} from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

export const MEDYA_KOPYA_TUKETICISI = 'api.medya';

export const medyaKopyaOlaylari = [
  medyaDosyaHazirV1,
  medyaDosyaIslenemediV1,
  medyaDosyaSilindiV1,
] as const;
export type MedyaKopyaOlayi = EventOf<(typeof medyaKopyaOlaylari)[number]>;

/**
 * `medya.dosya.*` olaylarini `ortak.medya_dosya_kopyalari`na isler (`kaynak_olay_id` = son islenen olay).
 * Calistigi islem tuketicinin `kiraci: 'olaydan'` baglamindadir (RLS, uygulama rolu): satir `kurum_id` = olayin
 * kurumu olarak yazilir ve baska kurumun satirina dokunulamaz (RLS ihlali hatasi). Sira: UUIDv7 olay
 * kimlikleri zamana gore siralidir; daha eski olay yeni durumu ezmez (`kaynak_olay_id <`), `silindi` kalicidir.
 * `silindi` olayi sahip bilgisi tasimaz: kopya yoksa yok sayilir.
 */
export async function medyaKopyasiniIsle(tx: Tx, olay: MedyaKopyaOlayi): Promise<void> {
  if (olay.type === 'medya.dosya.hazir') {
    const d = olay.data;
    await tx.execute(sql`
      insert into ortak.medya_dosya_kopyalari as k
        (id, kurum_id, sahip_kullanici_id, tur, durum, mime_tipi, boyut_bayt, genislik, yukseklik, sure_sn,
         kucuk_resim_var, kaynak_olay_id)
      values (${d.dosya_id}::uuid, ${olay.kurumId}::uuid, ${d.sahip_kullanici_id}::uuid, ${d.tur}, 'hazir',
              ${d.mime_tipi}, ${d.boyut_bayt}, ${d.genislik}, ${d.yukseklik}, ${d.sure_sn},
              ${d.kucuk_resim_var}, ${olay.id}::uuid)
      on conflict (id) do update set
        sahip_kullanici_id = excluded.sahip_kullanici_id, tur = excluded.tur, durum = 'hazir',
        mime_tipi = excluded.mime_tipi, boyut_bayt = excluded.boyut_bayt, genislik = excluded.genislik,
        yukseklik = excluded.yukseklik, sure_sn = excluded.sure_sn,
        kucuk_resim_var = excluded.kucuk_resim_var, kaynak_olay_id = excluded.kaynak_olay_id
      where k.durum <> 'silindi' and k.kaynak_olay_id < excluded.kaynak_olay_id`);
    return;
  }
  if (olay.type === 'medya.dosya.islenemedi') {
    const d = olay.data;
    await tx.execute(sql`
      insert into ortak.medya_dosya_kopyalari as k
        (id, kurum_id, sahip_kullanici_id, tur, durum, mime_tipi, boyut_bayt, kaynak_olay_id)
      values (${d.dosya_id}::uuid, ${olay.kurumId}::uuid, ${d.sahip_kullanici_id}::uuid, ${d.tur},
              'islenemedi', 'application/octet-stream', 0, ${olay.id}::uuid)
      on conflict (id) do update set durum = 'islenemedi', kaynak_olay_id = excluded.kaynak_olay_id
      where k.durum <> 'silindi' and k.kaynak_olay_id < excluded.kaynak_olay_id`);
    return;
  }
  const d = olay.data;
  await tx.execute(sql`
    update ortak.medya_dosya_kopyalari set durum = 'silindi', kaynak_olay_id = ${olay.id}::uuid
    where id = ${d.dosya_id}::uuid and kurum_id = ${olay.kurumId}::uuid
      and kaynak_olay_id < ${olay.id}::uuid`);
}

export interface MedyaKopyaTuketiciSecenekleri extends Pick<
  TuketiciSecenekleri<typeof medyaKopyaOlaylari>,
  'nats' | 'log' | 'stream' | 'esZamanli'
> {
  /** Uygulama rolu (`api_app`) baglantisi: RLS atlanamaz. Sistem rolu BYPASSRLS oldugundan KULLANILMAZ. */
  db: Pick<Database, 'orm'>;
  /** Testler paylasilan NATS'ta cakismasin diye; varsayilan `api.medya`. */
  tuketici?: string;
}

/** `api.medya` tuketicisini baslatir (worker `setup` icinde, uygulama rolu baglantisiyla). */
export function medyaKopyaTuketiciBaslat(s: MedyaKopyaTuketiciSecenekleri): Promise<Tuketici> {
  return startConsumer({
    nats: s.nats,
    db: s.db,
    tuketici: s.tuketici ?? MEDYA_KOPYA_TUKETICISI,
    olaylar: medyaKopyaOlaylari,
    kiraci: 'olaydan',
    isle: medyaKopyasiniIsle,
    ...(s.log ? { log: s.log } : {}),
    ...(s.stream ? { stream: s.stream } : {}),
    ...(s.esZamanli ? { esZamanli: s.esZamanli } : {}),
  });
}
