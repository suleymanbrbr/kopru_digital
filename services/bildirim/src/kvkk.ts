import type { hesapKullaniciDegistiV1, hesapKullaniciSilindiV1 } from '@kopru/contracts';
import { sql } from 'drizzle-orm';

import type { Islem } from './ortak.js';

/**
 * KVKK (docs/schema/kvkk-silme.md): kullanici kopyasi ve kisisel veri temizligi/disa aktarma.
 */

/** `hesap.kullanici.degisti.v1`: kullanici kopyasi upsert (eski olay yeniyi ezmez; esitte buyuk kimlik kazanir). */
export async function kullaniciDegisti(
  tx: Islem,
  olay: ReturnType<typeof hesapKullaniciDegistiV1.parse>,
): Promise<void> {
  const d = olay.data;
  await tx.execute(sql`
    insert into bildirim.kullanici_kopyalari (kullanici_id, dil, durum, son_olay_at, son_olay_id)
    values (${d.kullanici_id}, ${d.dil}, ${d.durum}, ${olay.occurredAt}::timestamptz, ${olay.id})
    on conflict (kullanici_id) do update
      set dil = excluded.dil, durum = excluded.durum,
          son_olay_at = excluded.son_olay_at, son_olay_id = excluded.son_olay_id
    where (bildirim.kullanici_kopyalari.son_olay_at, bildirim.kullanici_kopyalari.son_olay_id)
        < (excluded.son_olay_at, excluded.son_olay_id)
      and bildirim.kullanici_kopyalari.durum <> 'silindi'`);
}

export interface KvkkSilmeOzeti {
  cihaz: number;
  bildirim: number;
  gonderim: number;
}

/**
 * `hesap.kullanici.silindi.v1`: kutu, gonderim kayitlari, zamanlanmis bildirimler, cihazlar, tercihler ve
 * ayarlar SILINIR. `kullanici_kopyalari` satiri `durum='silindi'` (yalniz kimlik; geç gelen `degisti` olayi
 * satiri geri getirmesin diye) olarak kalir. Kurumlar arasi calistigindan `bildirim_sistem` (BYPASSRLS)
 * baglantisiyla, `kiraci: 'yok'` ile calisir. Idempotent.
 */
export async function kullaniciSilindi(
  tx: Islem,
  olay: ReturnType<typeof hesapKullaniciSilindiV1.parse>,
): Promise<KvkkSilmeOzeti> {
  const { kullanici_id: kid, uyelik_idleri: uyelikler } = olay.data;
  const ids = uyelikler.length
    ? sql`(${sql.join(
        uyelikler.map((u) => sql`${u}::uuid`),
        sql`, `,
      )})`
    : sql`(select null::uuid where false)`;
  const gonderim = await tx.execute(sql`
    delete from bildirim.gonderimler where alici_kullanici_id = ${kid} returning 1`);
  await tx.execute(sql`delete from bildirim.duyuru_alicilari where alici_id in ${ids}`);
  await tx.execute(sql`delete from bildirim.zamanlanmis_bildirimler where alici_id in ${ids}`);
  const bildirim = await tx.execute(sql`
    delete from bildirim.bildirimler where alici_id in ${ids} returning 1`);
  const cihaz = await tx.execute(
    sql`delete from bildirim.cihazlar where kullanici_id = ${kid} returning 1`,
  );
  await tx.execute(sql`delete from bildirim.tercihler where kullanici_id = ${kid}`);
  await tx.execute(sql`delete from bildirim.kullanici_ayarlari where kullanici_id = ${kid}`);
  await tx.execute(sql`
    insert into bildirim.kullanici_kopyalari (kullanici_id, dil, durum, son_olay_at, son_olay_id)
    values (${kid}, 'tr', 'silindi', ${olay.occurredAt}::timestamptz, ${olay.id})
    on conflict (kullanici_id) do update
      set dil = 'tr', durum = 'silindi', son_olay_at = excluded.son_olay_at, son_olay_id = excluded.son_olay_id`);
  return { cihaz: cihaz.length, bildirim: bildirim.length, gonderim: gonderim.length };
}

type Kayit = Record<string, unknown>;

/** Disa aktarma: kurum baglaminda (`withTenant`, kullanici baglamiyla) yalniz bu kullanicinin verisi. */
export async function kvkkVeri(
  tx: Islem,
  girdi: { kurum_id: string; kullanici_id: string; uyelik_idleri: string[] },
): Promise<Record<string, Kayit[]>> {
  const ids = girdi.uyelik_idleri.length
    ? sql`(${sql.join(
        girdi.uyelik_idleri.map((u) => sql`${u}::uuid`),
        sql`, `,
      )})`
    : sql`(select null::uuid where false)`;
  const oku = async (q: ReturnType<typeof sql>): Promise<Kayit[]> =>
    [...(await tx.execute<Kayit>(q))].map((r) => ({ ...r }));
  return {
    kullanici_kopyasi: await oku(sql`
      select dil, durum from bildirim.kullanici_kopyalari where kullanici_id = ${girdi.kullanici_id}`),
    cihazlar: await oku(sql`
      select platform, saglayici, uygulama_surumu, dil, aktif, son_gorulme_at, created_at
        from bildirim.cihazlar where kullanici_id = ${girdi.kullanici_id} order by created_at`),
    tercihler: await oku(sql`
      select kategori, kanal, acik from bildirim.tercihler
       where kullanici_id = ${girdi.kullanici_id} and kurum_id = ${girdi.kurum_id} order by kategori, kanal`),
    ayarlar: await oku(sql`
      select sessiz_baslangic, sessiz_bitis, sessiz_gunler, saat_dilimi, ders_hatirlatma_dk
        from bildirim.kullanici_ayarlari
       where kullanici_id = ${girdi.kullanici_id} and kurum_id = ${girdi.kurum_id}`),
    bildirimler: await oku(sql`
      select kategori, baslik, govde, okundu_at, created_at from bildirim.bildirimler
       where kurum_id = ${girdi.kurum_id} and alici_id in ${ids} order by created_at`),
  };
}
