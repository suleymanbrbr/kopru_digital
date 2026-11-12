import type {
  hesapAtamaDegistiV1,
  hesapGrupDegistiV1,
  hesapGrupUyesiDegistiV1,
  hesapKurumDegistiV1,
  hesapModulAyariDegistiV1,
  hesapUyelikDegistiV1,
} from '@kopru/contracts';
import { KaliciHata } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import type { Islem } from './ortak.js';

/**
 * Yerel okuma kopyalari (docs/schema/motivasyon.md). Olay zarfinda ozne surumu olmadigindan siralama
 * (`occurredAt`, olay kimligi) ikilisiyledir: daha eski olay kopyayi ezmez; esit zamanda buyuk (UUIDv7)
 * kimlik kazanir. Ayni durumun yeniden yayimi upsert olarak etkisizdir.
 */

interface Zarf {
  id: string;
  kurumId: string;
  occurredAt: string;
}

const yeni = (o: Zarf) => sql`(${o.occurredAt}::timestamptz, ${o.id}::uuid)`;
const eskiMi = (tablo: string) =>
  sql`(${sql.raw(tablo)}.son_olay_at, ${sql.raw(tablo)}.son_olay_id) < (excluded.son_olay_at, excluded.son_olay_id)`;

export async function kurumDegisti(
  tx: Islem,
  olay: ReturnType<typeof hesapKurumDegistiV1.parse>,
): Promise<void> {
  const d = olay.data;
  if (d.kurum_id !== olay.kurumId) throw new KaliciHata('kurum_id zarftaki kurumla uyuşmuyor');
  const [gecerli] = await tx.execute<{ n: number }>(sql`
    select count(*)::int n from pg_timezone_names where name = ${d.saat_dilimi}`);
  if (!gecerli?.n) throw new KaliciHata('geçersiz saat dilimi');
  await tx.execute(sql`
    insert into motivasyon.kurum_kopyalari (kurum_id, tur, durum, saat_dilimi, son_olay_at, son_olay_id)
    values (${d.kurum_id}, ${d.tur}, ${d.durum}, ${d.saat_dilimi}, ${olay.occurredAt}::timestamptz, ${olay.id})
    on conflict (kurum_id) do update
      set tur = excluded.tur, durum = excluded.durum, saat_dilimi = excluded.saat_dilimi,
          son_olay_at = excluded.son_olay_at, son_olay_id = excluded.son_olay_id
      where ${eskiMi('motivasyon.kurum_kopyalari')}`);
}

export async function uyelikDegisti(
  tx: Islem,
  olay: ReturnType<typeof hesapUyelikDegistiV1.parse>,
): Promise<void> {
  const d = olay.data;
  await tx.execute(sql`
    insert into motivasyon.uyelik_kopyalari
      (uyelik_id, kurum_id, kullanici_id, rol, durum, kademe_id, son_olay_at, son_olay_id)
    values (${d.uyelik_id}, ${olay.kurumId}, ${d.kullanici_id}, ${d.rol}, ${d.durum}, ${d.kademe_id},
            ${olay.occurredAt}::timestamptz, ${olay.id})
    on conflict (uyelik_id) do update
      set kullanici_id = excluded.kullanici_id, rol = excluded.rol, durum = excluded.durum,
          kademe_id = excluded.kademe_id, son_olay_at = excluded.son_olay_at, son_olay_id = excluded.son_olay_id
      where ${eskiMi('motivasyon.uyelik_kopyalari')}`);
}

export async function grupDegisti(
  tx: Islem,
  olay: ReturnType<typeof hesapGrupDegistiV1.parse>,
): Promise<void> {
  const d = olay.data;
  await tx.execute(sql`
    insert into motivasyon.grup_kopyalari (grup_id, kurum_id, kademe_id, tur, durum, son_olay_at, son_olay_id)
    values (${d.grup_id}, ${olay.kurumId}, ${d.kademe_id}, ${d.tur}, ${d.durum},
            ${olay.occurredAt}::timestamptz, ${olay.id})
    on conflict (grup_id) do update
      set kademe_id = excluded.kademe_id, tur = excluded.tur, durum = excluded.durum,
          son_olay_at = excluded.son_olay_at, son_olay_id = excluded.son_olay_id
      where ${eskiMi('motivasyon.grup_kopyalari')}`);
}

export async function grupUyesiDegisti(
  tx: Islem,
  olay: ReturnType<typeof hesapGrupUyesiDegistiV1.parse>,
): Promise<void> {
  const d = olay.data;
  await tx.execute(sql`
    insert into motivasyon.grup_uyesi_kopyalari
      (grup_id, ogrenci_id, kurum_id, grup_uyesi_id, baslangic_tarihi, bitis_tarihi, son_olay_at, son_olay_id)
    values (${d.grup_id}, ${d.ogrenci_id}, ${olay.kurumId}, ${d.grup_uyesi_id}, ${d.baslangic_tarihi}::date,
            ${d.bitis_tarihi}::date, ${olay.occurredAt}::timestamptz, ${olay.id})
    on conflict (grup_id, ogrenci_id) do update
      set grup_uyesi_id = excluded.grup_uyesi_id, baslangic_tarihi = excluded.baslangic_tarihi,
          bitis_tarihi = excluded.bitis_tarihi, son_olay_at = excluded.son_olay_at,
          son_olay_id = excluded.son_olay_id
      where ${eskiMi('motivasyon.grup_uyesi_kopyalari')}`);
}

export async function atamaDegisti(
  tx: Islem,
  olay: ReturnType<typeof hesapAtamaDegistiV1.parse>,
): Promise<void> {
  const d = olay.data;
  await tx.execute(sql`
    insert into motivasyon.atama_kopyalari
      (atama_id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_tarihi, bitis_tarihi, son_olay_at, son_olay_id)
    values (${d.atama_id}, ${olay.kurumId}, ${d.grup_id}, ${d.ogretmen_id}, ${d.brans_kodu},
            ${d.baslangic_tarihi}::date, ${d.bitis_tarihi}::date, ${olay.occurredAt}::timestamptz, ${olay.id})
    on conflict (atama_id) do update
      set grup_id = excluded.grup_id, ogretmen_id = excluded.ogretmen_id, brans_kodu = excluded.brans_kodu,
          baslangic_tarihi = excluded.baslangic_tarihi, bitis_tarihi = excluded.bitis_tarihi,
          son_olay_at = excluded.son_olay_at, son_olay_id = excluded.son_olay_id
      where ${eskiMi('motivasyon.atama_kopyalari')}`);
}

/**
 * Modul ayari: `acik: null` (mirasa donus) satiri SILER (yalniz daha eski bir olayla yazilmis satir silinir);
 * degilse upsert. Silinen satir icin eski bir olay daha sonra gelirse satir yeniden olusabilir; ayni durumun
 * yeniden yayimi bunu duzeltir.
 */
export async function modulAyariDegisti(
  tx: Islem,
  olay: ReturnType<typeof hesapModulAyariDegistiV1.parse>,
): Promise<void> {
  const d = olay.data;
  if (d.acik === null) {
    await tx.execute(sql`
      delete from motivasyon.modul_ayari_kopyalari
       where kurum_id = ${olay.kurumId} and modul_kodu = ${d.modul_kodu} and kapsam = ${d.kapsam}
         and kapsam_id = ${d.kapsam_id}
         and (son_olay_at, son_olay_id) < ${yeni(olay)}`);
    return;
  }
  await tx.execute(sql`
    insert into motivasyon.modul_ayari_kopyalari
      (kurum_id, modul_kodu, kapsam, kapsam_id, acik, son_olay_at, son_olay_id)
    values (${olay.kurumId}, ${d.modul_kodu}, ${d.kapsam}, ${d.kapsam_id}, ${d.acik},
            ${olay.occurredAt}::timestamptz, ${olay.id})
    on conflict (kurum_id, modul_kodu, kapsam, kapsam_id) do update
      set acik = excluded.acik, son_olay_at = excluded.son_olay_at, son_olay_id = excluded.son_olay_id
      where ${eskiMi('motivasyon.modul_ayari_kopyalari')}`);
}
