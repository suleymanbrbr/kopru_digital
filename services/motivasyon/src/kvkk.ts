import type { hesapKullaniciSilindiV1 } from '@kopru/contracts';
import type { Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

/**
 * KVKK (docs/schema/kvkk-silme.md). `ogrenci_id` bir uyelik kimligidir ve hesap anonimlestirildiginde kisiye
 * baglanamaz; XP defteri (yalniz ekleme) ve turev sayaclar bu yuzden ANONIM veri olarak kalir (kurumun
 * sinif siralamasi ve toplamlari bozulmaz). Serbest metin ve cihaz bilgisi silinir/anonimlestirilir.
 */

export const ANONIM_KARAKTER_ADI = 'Anonim';

export interface KvkkSilmeOzeti {
  karakter: number;
  yildiz: number;
  odak: number;
}

const idListesi = (idler: readonly string[]) =>
  idler.length
    ? sql`(${sql.join(
        idler.map((i) => sql`${i}::uuid`),
        sql`, `,
      )})`
    : sql`(select null::uuid where false)`;

/**
 * `hesap.kullanici.silindi.v1`: kullanicinin uyelikleri icin karakter adi anonimlestirilir, "haftanin yildizi"
 * gerekcesi (ogretmenin serbest metni) ve odak oturumu cihaz bilgisi silinir. Kurumlar arasi calistigindan
 * `motivasyon_sistem` baglantisiyla, `kiraci: 'yok'` ile. Idempotent.
 */
export async function kullaniciSilindi(
  tx: Pick<Tx, 'execute'>,
  olay: ReturnType<typeof hesapKullaniciSilindiV1.parse>,
): Promise<KvkkSilmeOzeti> {
  const ids = idListesi(olay.data.uyelik_idleri);
  const karakter = await tx.execute(sql`
    update motivasyon.ogrenci_karakterleri set ad = ${ANONIM_KARAKTER_ADI}
     where ogrenci_id in ${ids} and ad <> ${ANONIM_KARAKTER_ADI} returning 1`);
  const yildiz = await tx.execute(sql`
    update motivasyon.haftanin_yildizlari set gerekce = null
     where ogrenci_id in ${ids} and gerekce is not null returning 1`);
  const odak = await tx.execute(sql`
    update motivasyon.odak_oturumlari set cihaz = null
     where ogrenci_id in ${ids} and cihaz is not null returning 1`);
  return { karakter: karakter.length, yildiz: yildiz.length, odak: odak.length };
}

type Kayit = Record<string, unknown>;

/** Disa aktarma: kurum baglaminda (`withTenant`) yalniz verilen uyeliklerin oyunlastirma verisi. */
export async function kvkkVeri(
  tx: Pick<Tx, 'execute'>,
  girdi: { kurum_id: string; uyelik_idleri: string[] },
): Promise<Record<string, Kayit[]>> {
  const ids = idListesi(girdi.uyelik_idleri);
  const oku = async (q: ReturnType<typeof sql>): Promise<Kayit[]> =>
    [...(await tx.execute<Kayit>(q))].map((r) => ({ ...r }));
  return {
    xp_ozeti: await oku(sql`
      select ogrenci_id, toplam_xp, seviye, bu_hafta_xp, son_aktivite_gun from motivasyon.ogrenci_durumlari
       where kurum_id = ${girdi.kurum_id} and ogrenci_id in ${ids}`),
    xp_hareketleri: await oku(sql`
      select kural_kodu, brans_kodu, xp, gun, olusma_at, neden from motivasyon.xp_hareketleri
       where kurum_id = ${girdi.kurum_id} and ogrenci_id in ${ids} order by olusma_at`),
    karakter: await oku(sql`
      select tur_kodu, ad, asama, secildi_at from motivasyon.ogrenci_karakterleri
       where kurum_id = ${girdi.kurum_id} and ogrenci_id in ${ids}`),
    rozetler: await oku(sql`
      select rozet_kodu, kazanildi_at from motivasyon.ogrenci_rozetleri
       where kurum_id = ${girdi.kurum_id} and ogrenci_id in ${ids} order by kazanildi_at`),
    odak_oturumlari: await oku(sql`
      select baslangic_at, bitis_at, planlanan_dk, gerceklesen_sn, durum, brans_kodu, cihaz
        from motivasyon.odak_oturumlari
       where kurum_id = ${girdi.kurum_id} and ogrenci_id in ${ids} order by baslangic_at`),
    haftanin_yildizi: await oku(sql`
      select hafta_baslangic, gerekce from motivasyon.haftanin_yildizlari
       where kurum_id = ${girdi.kurum_id} and ogrenci_id in ${ids} order by hafta_baslangic`),
  };
}
