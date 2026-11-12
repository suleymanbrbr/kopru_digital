import { errorCodes, type HaftaninYildizi } from '@kopru/contracts';
import { AppError, type Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import {
  etkinOgrenciMi,
  grupUyesiMi,
  modulKontrol,
  ogretmenGrubundaMi,
  zamanBilgisi,
  type Kimlik,
} from './odak-ortak.js';
import { durumuGarantile, iso, ogrenciKilitle, yeniId, type IsBaglami } from './ortak.js';
import { ayarOku, kuralGetir, rozetleriDegerlendir, sayacArtir, xpKazan } from './xp-cekirdek.js';

const VARSAYILAN_LIMIT = 3;
/** Ogretmen sayim kilidi alani (ogrenci kilidi 727003'ten ayri). */
const OGRETMEN_KILIT_ALANI = 727004;

interface YildizSatiri extends Record<string, unknown> {
  id: string;
  ogrenci_id: string;
  veren_ogretmen_id: string;
  grup_id: string;
  hafta_baslangic: string;
  gerekce: string | null;
  created_at: string;
}

const KOLONLAR = sql`
  id, ogrenci_id, veren_ogretmen_id, grup_id, hafta_baslangic::text as hafta_baslangic, gerekce,
  ${iso('created_at')} as created_at`;

const yildiz = (s: YildizSatiri): HaftaninYildizi => ({ ...s });

const bulunamadi = () => new AppError(404, errorCodes.notFound, 'Öğrenci bulunamadı.');

export async function haftalikLimit(tx: Tx): Promise<number> {
  const v = await ayarOku<unknown>(
    tx,
    'haftanin_yildizi.ogretmen_haftalik_limit',
    VARSAYILAN_LIMIT,
  );
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : VARSAYILAN_LIMIT;
}

export async function yildizVer(
  tx: Tx,
  k: Kimlik,
  istek: { ogrenci_id: string; grup_id: string; gerekce?: string | undefined },
  an: Date,
): Promise<{ yildiz: HaftaninYildizi; xp: number; yeni_rozetler: string[] }> {
  const z = await zamanBilgisi(tx, k.kurumId, an);
  const ogretmenMi = k.rol === 'ogretmen';

  // Kapsam: ogretmen yalniz aktif atandigi gruptaki ogrenciye; yonetici/sahip kurumdaki grup uyesine.
  // Kapsam disi ve bilinmeyen ogrenci ayni sekilde 404 (varligi sizdirilmaz).
  const kapsamda = ogretmenMi
    ? await ogretmenGrubundaMi(tx, {
        kurumId: k.kurumId,
        ogretmenId: k.uyelikId,
        ogrenciId: istek.ogrenci_id,
        gun: z.gun,
        grupId: istek.grup_id,
      })
    : await grupUyesiMi(tx, {
        kurumId: k.kurumId,
        ogrenciId: istek.ogrenci_id,
        grupId: istek.grup_id,
        gun: z.gun,
      });
  if (!kapsamda || !(await etkinOgrenciMi(tx, istek.ogrenci_id))) throw bulunamadi();
  await modulKontrol(tx, k.kurumId, istek.ogrenci_id, z.gun, istek.grup_id);

  // Kilit sirasi sabit: once ogretmen (sayim), sonra ogrenci (XP). Es zamanli istekler sirayla calisir.
  if (ogretmenMi) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${OGRETMEN_KILIT_ALANI}, hashtext(${k.uyelikId}))`,
    );
  }
  await ogrenciKilitle(tx, istek.ogrenci_id);
  await durumuGarantile(tx, k.kurumId, istek.ogrenci_id);

  const [zaten] = await tx.execute(sql`
    select 1 from motivasyon.haftanin_yildizlari
     where ogrenci_id = ${istek.ogrenci_id} and hafta_baslangic = ${z.hafta}::date`);
  if (zaten) {
    throw new AppError(
      409,
      'haftanin_yildizi_verilmis',
      'Bu öğrenci bu hafta zaten haftanın yıldızı seçildi.',
    );
  }
  if (ogretmenMi) {
    const limit = await haftalikLimit(tx);
    const [s] = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from motivasyon.haftanin_yildizlari
       where kurum_id = ${k.kurumId} and veren_ogretmen_id = ${k.uyelikId}
         and hafta_baslangic = ${z.hafta}::date`);
    if ((s?.n ?? 0) >= limit) {
      throw new AppError(
        409,
        'haftalik_limit_asildi',
        'Bu hafta verebileceğin haftanın yıldızı hakkını kullandın.',
        { limit },
      );
    }
  }

  const id = yeniId();
  const [satir] = await tx.execute<YildizSatiri>(sql`
    insert into motivasyon.haftanin_yildizlari
      (id, kurum_id, created_by, ogrenci_id, veren_ogretmen_id, grup_id, hafta_baslangic, gerekce)
    values (${id}, ${k.kurumId}, ${k.kullaniciId}, ${istek.ogrenci_id}, ${k.uyelikId}, ${istek.grup_id},
            ${z.hafta}::date, ${istek.gerekce?.length ? istek.gerekce : null})
    returning ${KOLONLAR}`);
  if (!satir) throw new Error('haftanin yildizi yazilamadi');

  const b: IsBaglami = {
    kurumId: k.kurumId,
    ogrenciId: istek.ogrenci_id,
    olayId: id,
    olusmaAt: an.toISOString(),
    saatDilimi: z.saatDilimi,
    gun: z.gun,
    hafta: z.hafta,
  };
  const kural = await kuralGetir(tx, 'haftanin_yildizi');
  if (!kural) throw new Error('xp kurali yok: haftanin_yildizi');
  const s = await xpKazan(tx, b, { kural, ozne: { id } });
  await sayacArtir(tx, b, 'haftanin_yildizi', 1);
  const yeniRozetler = await rozetleriDegerlendir(tx, b, ['haftanin_yildizi']);
  return { yildiz: yildiz(satir), xp: s.verilen, yeni_rozetler: yeniRozetler };
}

export async function verdiklerim(
  tx: Tx,
  k: Kimlik,
  an: Date,
): Promise<{
  hafta_baslangic: string;
  limit: number | null;
  verilen: number;
  kalan: number | null;
  yildizlar: HaftaninYildizi[];
}> {
  const z = await zamanBilgisi(tx, k.kurumId, an);
  const satirlar = await tx.execute<YildizSatiri>(sql`
    select ${KOLONLAR} from motivasyon.haftanin_yildizlari
     where kurum_id = ${k.kurumId} and veren_ogretmen_id = ${k.uyelikId} and hafta_baslangic = ${z.hafta}::date
     order by created_at desc, id desc`);
  const ogretmenMi = k.rol === 'ogretmen';
  const limit = ogretmenMi ? await haftalikLimit(tx) : null;
  return {
    hafta_baslangic: z.hafta,
    limit,
    verilen: satirlar.length,
    kalan: limit === null ? null : Math.max(limit - satirlar.length, 0),
    yildizlar: satirlar.map(yildiz),
  };
}

/** Ogrencinin aldigi yildizlar. Kapsam kontrolu cagirandadir (ogrenci kendi, ogretmen grup, yonetici kurum). */
export async function aldiklari(tx: Tx, kurumId: string, ogrenciId: string) {
  const satirlar = await tx.execute<YildizSatiri>(sql`
    select ${KOLONLAR} from motivasyon.haftanin_yildizlari
     where kurum_id = ${kurumId} and ogrenci_id = ${ogrenciId}
     order by hafta_baslangic desc, id desc limit 100`);
  return satirlar.map(yildiz);
}
