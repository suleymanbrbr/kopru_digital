import {
  ogrenmeSoruCozulduV1,
  ogrenmeSoruMesajiEklendiV1,
  ogrenmeSoruYenidenAcildiV1,
} from '@kopru/contracts';
import { publishInTx, type Tx } from '@kopru/service-kit';
import { and, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { soruMesajlari } from '../../db/schema.js';
import type { YetkiBaglami } from '../hesap/index.js';
import { soruDosyaIdleri, type SoruSatiri } from './soru-detay.js';
import { OUTBOX_TABLOSU, type SoruOlayBaglami } from './soru-ortak.js';

/** Ayni `istek_id` ile daha once yazilmis mesaj (istemci yeniden denemesi). */
export async function oncekiMesaj(tx: Tx, y: YetkiBaglami, istekId: string | undefined) {
  if (!istekId) return undefined;
  const [m] = await tx
    .select()
    .from(soruMesajlari)
    .where(and(eq(soruMesajlari.kurum_id, y.kurumId), eq(soruMesajlari.istek_id, istekId)));
  return m;
}

/** Soru satiri kilitliyken (`FOR UPDATE`) sonraki sirayla mesaj ekler. */
export async function mesajEkle(
  tx: Tx,
  y: YetkiBaglami,
  soruId: string,
  alan: {
    yazarRolu: 'ogrenci' | 'ogretmen' | 'yonetici';
    tur: 'soru' | 'cevap' | 'takip';
    metin: string | null;
    derste: boolean;
    istekId: string | undefined;
  },
): Promise<string> {
  const [r] = await tx.execute<{ sira: number }>(
    sql`select coalesce(max(sira), 0)::int + 1 as sira from ogrenme.soru_mesajlari where soru_id = ${soruId}::uuid`,
  );
  const id = uuidv7();
  await tx.insert(soruMesajlari).values({
    id,
    kurum_id: y.kurumId,
    created_by: y.kullaniciId,
    soru_id: soruId,
    yazar_id: y.uyelikId,
    yazar_rolu: alan.yazarRolu,
    tur: alan.tur,
    metin: alan.metin,
    sira: r?.sira ?? 1,
    derste_konusalim: alan.derste,
    istek_id: alan.istekId ?? null,
  });
  return id;
}

export async function mesajEklendiOlayiYaz(
  tx: Tx,
  baglam: SoruOlayBaglami,
  s: SoruSatiri,
  mesajId: string,
  tur: 'cevap' | 'takip',
  yazarId: string,
  aliciIdleri: string[],
): Promise<void> {
  await publishInTx(
    tx,
    ogrenmeSoruMesajiEklendiV1.create({
      ...baglam,
      data: {
        soru_id: s.id,
        mesaj_id: mesajId,
        tur,
        yazar_id: yazarId,
        ogrenci_id: s.ogrenci_id,
        alici_idleri: aliciIdleri,
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
}

/**
 * Soruyu `cozuldu` yapar (ogrenci "anladim" ya da otomatik) ve `soru.cozuldu.v1` yayimlar:
 * `silinecek_at = cozuldu_at + foto_saklama_gun`. Durum `cozuldu` ise hicbir sey yapmaz (false doner).
 */
export async function soruCoz(
  tx: Tx,
  baglam: SoruOlayBaglami,
  soruId: string,
  kaynak: 'ogrenci' | 'otomatik',
  saklamaGun: number,
): Promise<boolean> {
  const [g] = await tx.execute<{
    ogrenci_id: string;
    brans_kodu: string;
    cozuldu_at: Date | string;
    foto_silinme_at: Date | string;
  }>(sql`
    update ogrenme.sorular
    set durum = 'cozuldu', cozuldu_at = now(), cozuldu_kaynagi = ${kaynak}, son_hareket_at = now(),
        foto_silinme_at = now() + make_interval(days => ${saklamaGun}::int)
    where id = ${soruId}::uuid and durum in ('cevaplandi', 'takip_bekliyor')
    returning ogrenci_id, brans_kodu, cozuldu_at, foto_silinme_at`);
  if (!g) return false;
  await publishInTx(
    tx,
    ogrenmeSoruCozulduV1.create({
      ...baglam,
      data: {
        soru_id: soruId,
        ogrenci_id: g.ogrenci_id,
        brans_kodu: g.brans_kodu,
        cozuldu_at: new Date(g.cozuldu_at).toISOString(),
        dosya_idleri: await soruDosyaIdleri(tx, soruId),
        silinecek_at: new Date(g.foto_silinme_at).toISOString(),
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
  return true;
}

export async function yenidenAcildiOlayiYaz(
  tx: Tx,
  baglam: SoruOlayBaglami,
  s: SoruSatiri,
): Promise<void> {
  await publishInTx(
    tx,
    ogrenmeSoruYenidenAcildiV1.create({
      ...baglam,
      data: {
        soru_id: s.id,
        ogrenci_id: s.ogrenci_id,
        dosya_idleri: await soruDosyaIdleri(tx, s.id),
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
}
