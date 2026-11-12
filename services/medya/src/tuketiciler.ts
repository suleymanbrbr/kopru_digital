import {
  hesapKurumDegistiV1,
  ogrenmeSoruCozulduV1,
  ogrenmeSoruYenidenAcildiV1,
  ortakDosyaBaglandiV1,
  ortakDosyaBirakildiV1,
} from '@kopru/contracts';
import {
  KaliciHata,
  startConsumer,
  type Database,
  type Tuketici,
  type TuketiciBaglami,
  type Tx,
} from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import type { NatsConnection } from 'nats';

export const KURUM_KAPANMA_SILME_GUN = 90;

type Log = TuketiciBaglami['log'];

export interface TuketiciBagimliliklari {
  nats: Pick<NatsConnection, 'jetstream' | 'jetstreamManager'>;
  /** `medya_app` baglantisi: RLS atlanamaz, `kiraci: 'olaydan'` ile kurum baglami ayarlanir. */
  db: Pick<Database, 'orm'>;
  log: Log;
  /** Testlerde paylasilan NATS'ta cakismamak icin tuketici adi soneki (uretimde bos). */
  sonek?: string;
}

/**
 * `ortak.dosya.baglandi.v1`: dosyayi iş kaydina baglar; hazirsa silme zamanini politikaya gore ayarlar
 * (yetim/birakildi nedenli plan temizlenir). Dosya henuz hazir degilse yalniz baglama yazilir; hazir
 * olunca ayni kural `isle.ts`te uygulanir. Idempotent (processed_events + ayni sonucu veren UPDATE).
 */
async function baglandi(
  tx: Tx,
  olay: ReturnType<typeof ortakDosyaBaglandiV1.parse>,
): Promise<void> {
  const { dosya_id, bagli_tur, bagli_id } = olay.data;
  const [onceki] = await tx.execute<{ durum: string }>(sql`
    select durum from medya.dosyalar where id = ${dosya_id}`);
  if (!onceki) throw new KaliciHata('Bağlanan dosya bu kurumda yok');
  if (onceki.durum === 'silindi') return;
  await tx.execute(sql`
    update medya.dosyalar d
       set baglandi = true, bagli_tur = ${bagli_tur}, bagli_id = ${bagli_id},
           baglandi_at = ${olay.occurredAt}::timestamptz,
           silinecek_at = case
             when d.durum = 'hazir' and (d.silme_nedeni is null or d.silme_nedeni in ('yetim', 'birakildi'))
               then case when p.varsayilan_saklama_gun is null then null
                         else ${olay.occurredAt}::timestamptz + make_interval(days => p.varsayilan_saklama_gun) end
             else d.silinecek_at end,
           silme_nedeni = case
             when d.durum = 'hazir' and (d.silme_nedeni is null or d.silme_nedeni in ('yetim', 'birakildi'))
               then case when p.varsayilan_saklama_gun is null then null else 'saklama_suresi' end
             else d.silme_nedeni end
      from medya.saklama_politikalari p
     where p.tur = d.tur and d.id = ${dosya_id}`);
}

/** `ortak.dosya.birakildi.v1`: baglantiyi cozer; `hemen_sil` ise `now()`, degilse yetim kurali. */
async function birakildi(
  tx: Tx,
  olay: ReturnType<typeof ortakDosyaBirakildiV1.parse>,
): Promise<void> {
  const { dosya_id, bagli_id, hemen_sil } = olay.data;
  await tx.execute(sql`
    update medya.dosyalar d
       set baglandi = false, bagli_tur = null, bagli_id = null, baglandi_at = null,
           silinecek_at = case when ${hemen_sil} then now()
                               else coalesce(d.hazir_at, now()) + make_interval(hours => p.yetim_saat) end,
           silme_nedeni = case when ${hemen_sil} then 'birakildi' else 'yetim' end
      from medya.saklama_politikalari p
     where p.tur = d.tur and d.id = ${dosya_id} and d.durum <> 'silindi'
       and (d.bagli_id is null or d.bagli_id = ${bagli_id})`);
}

/**
 * `hesap.kurum.degisti.v1` -> `kurum_kopyalari` upsert (olay `occurredAt` sirasiyla; eski olay yazilmaz).
 * Kurum `kapali` ise dosyalar 90 gun sonra silinmek uzere planlanir; kurum yeniden acilirsa bu plan geri alinir.
 */
async function kurumDegisti(
  tx: Tx,
  olay: ReturnType<typeof hesapKurumDegistiV1.parse>,
): Promise<void> {
  const { durum } = olay.data;
  if (olay.data.kurum_id !== olay.kurumId)
    throw new KaliciHata('kurum_id zarftaki kurumla uyuşmuyor');
  const yazilan = await tx.execute(sql`
    insert into medya.kurum_kopyalari (kurum_id, durum, son_olay_at)
    values (${olay.kurumId}, ${durum}, ${olay.occurredAt}::timestamptz)
    on conflict (kurum_id) do update
      set durum = excluded.durum, son_olay_at = excluded.son_olay_at
    where medya.kurum_kopyalari.son_olay_at is null
       or medya.kurum_kopyalari.son_olay_at <= excluded.son_olay_at
    returning kurum_id`);
  if (yazilan.length === 0) return; // daha yeni bir olay zaten islendi
  if (durum === 'kapali') {
    await tx.execute(sql`
      update medya.dosyalar
         set silinecek_at = ${olay.occurredAt}::timestamptz + make_interval(days => ${KURUM_KAPANMA_SILME_GUN}),
             silme_nedeni = 'kurum_kapandi'
       where durum <> 'silindi' and kurum_id = ${olay.kurumId}
         and (silinecek_at is null or silinecek_at > ${olay.occurredAt}::timestamptz + make_interval(days => ${KURUM_KAPANMA_SILME_GUN}))`);
  } else {
    await tx.execute(sql`
      update medya.dosyalar set silinecek_at = null, silme_nedeni = null
       where durum <> 'silindi' and kurum_id = ${olay.kurumId} and silme_nedeni = 'kurum_kapandi'`);
  }
}

/**
 * Soru saklama kurali (docs/schema/medya.md kural 3-4). Sira bagimsizligi: dosyanin `saklama_olay_at`i son
 * uygulanan saklama olayinin `occurredAt`idir; daha eski bir olay (yeniden teslim, ters sira) durumu ezmez.
 * Silinmis dosyalara dokunulmaz. Daha guclu planlar (`kullanici_silindi`, `kurum_kapandi`, `birakildi`,
 * `yukleme_zaman_asimi`) korunur. Ayni olay iki kez gelirse sonuc ayni (`processed_events` + esit zaman).
 */
const GUCLU_PLANLAR = sql`('kullanici_silindi', 'kurum_kapandi', 'birakildi', 'yukleme_zaman_asimi')`;

async function soruCozuldu(
  tx: Tx,
  olay: ReturnType<typeof ogrenmeSoruCozulduV1.parse>,
): Promise<void> {
  const { dosya_idleri, silinecek_at } = olay.data;
  if (dosya_idleri.length === 0) return;
  await tx.execute(sql`
    update medya.dosyalar
       set silinecek_at = ${silinecek_at}::timestamptz, silme_nedeni = 'soru_cozuldu',
           saklama_olay_at = ${olay.occurredAt}::timestamptz
     where id in (${sql.join(
       dosya_idleri.map((d) => sql`${d}::uuid`),
       sql`, `,
     )}) and durum <> 'silindi'
       and (silme_nedeni is null or silme_nedeni not in ${GUCLU_PLANLAR})
       and (saklama_olay_at is null or saklama_olay_at <= ${olay.occurredAt}::timestamptz)`);
}

async function soruYenidenAcildi(
  tx: Tx,
  olay: ReturnType<typeof ogrenmeSoruYenidenAcildiV1.parse>,
): Promise<void> {
  const { dosya_idleri } = olay.data;
  if (dosya_idleri.length === 0) return;
  // Plan yalniz soru cozulmesinden geldiyse geri alinir; baska nedenli plana dokunulmaz.
  await tx.execute(sql`
    update medya.dosyalar
       set silinecek_at = case when silme_nedeni = 'soru_cozuldu' then null else silinecek_at end,
           silme_nedeni = case when silme_nedeni = 'soru_cozuldu' then null else silme_nedeni end,
           saklama_olay_at = ${olay.occurredAt}::timestamptz
     where id in (${sql.join(
       dosya_idleri.map((d) => sql`${d}::uuid`),
       sql`, `,
     )}) and durum <> 'silindi'
       and (saklama_olay_at is null or saklama_olay_at <= ${olay.occurredAt}::timestamptz)`);
}

/**
 * Tuketicileri baslatir (`medya.baglama`, `medya.saklama`, `medya.kopya`).
 *
 * TODO(medya.saklama): `hesap.kullanici.silindi.v1` (kullanici dosyalari `now()`) sozlesmesi
 * `@kopru/contracts`ta hala yok (olay kullanici duzeyinde, zarf `kurumId` zorunlu); gelince ayni tuketiciye eklenir.
 * `abonelik.abonelik.degisti.v1` de henuz yok (kota `VARSAYILAN_KOTA_BAYT`).
 */
export async function tuketicileriBaslat(b: TuketiciBagimliliklari): Promise<Tuketici[]> {
  const ek = b.sonek ?? '';
  const ortak = { nats: b.nats, db: b.db, log: b.log, kiraci: 'olaydan' } as const;
  const baglama = await startConsumer({
    ...ortak,
    tuketici: `medya.baglama${ek}`,
    olaylar: [ortakDosyaBaglandiV1, ortakDosyaBirakildiV1] as const,
    isle: async (tx, olay) => {
      if (olay.type === 'ortak.dosya.baglandi') await baglandi(tx, olay);
      else await birakildi(tx, olay);
    },
  });
  const saklama = await startConsumer({
    ...ortak,
    tuketici: `medya.saklama${ek}`,
    olaylar: [ogrenmeSoruCozulduV1, ogrenmeSoruYenidenAcildiV1] as const,
    isle: async (tx, olay) => {
      if (olay.type === 'ogrenme.soru.cozuldu') await soruCozuldu(tx, olay);
      else await soruYenidenAcildi(tx, olay);
    },
  });
  const kopya = await startConsumer({
    ...ortak,
    tuketici: `medya.kopya${ek}`,
    olaylar: [hesapKurumDegistiV1] as const,
    isle: (tx, olay) => kurumDegisti(tx, olay),
  });
  return [baglama, saklama, kopya];
}
