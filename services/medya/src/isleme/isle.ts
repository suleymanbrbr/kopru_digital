import { createHash } from 'node:crypto';

import {
  MEDYA_SES_AZAMI_SURE_SN,
  MEDYA_TUR_KURALLARI,
  medyaDosyaHazirV1,
  type MedyaDosyaTuru,
} from '@kopru/contracts';
import { publishInTx, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { type Depolama } from '../depolama.js';
import {
  OUTBOX_TABLOSU,
  SISTEM_AKTORU,
  dosyayiBasarisizYap,
  kucukResimAnahtari,
  yuklemeAnahtari,
  type IslemeHatasi,
} from '../dosya-deposu.js';
import { gorselIsle, type KucukResim } from './gorsel.js';
import { icerikSinifi, icerikTuruTespit, mimeUyusuyor } from './icerik.js';
import { sesSuresiSn } from './ses.js';

export interface IslemeLogu {
  info(nesne: Record<string, unknown>, mesaj: string): void;
  warn(nesne: Record<string, unknown>, mesaj: string): void;
  error(nesne: Record<string, unknown>, mesaj: string): void;
}

export interface IslemeBagimliliklari {
  /** `medya_sistem` (BYPASSRLS): kiracilar arasi kuyruk. */
  db: Pick<Database, 'orm'>;
  depolama: Depolama;
  log: IslemeLogu;
}

/** Geri dönüşsüz is hatasi: dosya `islenemedi` olur. */
class IslemeReddi extends Error {
  constructor(
    readonly hata: IslemeHatasi,
    mesaj: string,
  ) {
    super(mesaj);
    this.name = 'IslemeReddi';
  }
}

/** Gecici hata (depolama, ag): dosya `yuklendi`ye doner ve gecikmeyle yeniden denenir. */
export const AZAMI_ISLEME_DENEMESI = 5;
const YENIDEN_DENEME_SN: readonly number[] = [10, 30, 120, 600, 1800];
/** `isleniyor`da bu kadar kalan satir (cokmus worker) kuyruga geri alinir. */
export const TAKILMA_SURESI_DK = 10;

interface IslemeSatiri extends Record<string, unknown> {
  id: string;
  kurum_id: string;
  sahip_kullanici_id: string;
  sahip_uyelik_id: string;
  tur: MedyaDosyaTuru;
  mime_tipi: string;
  boyut_bayt: number;
  bildirilen_sha256: string;
  depolama_anahtari: string;
  kota_bayt: number;
  isleme_deneme: number;
}

interface Politika extends Record<string, unknown> {
  kucuk_resim: boolean;
  ek_islem: string | null;
}

interface HazirSonuc {
  mime: string;
  /** `depolama_anahtari`na yazilacak nihai icerik (gecis turlerinde ham bayt). */
  govde: Buffer;
  boyutBayt: number;
  genislik: number | null;
  yukseklik: number | null;
  sureSn: number | null;
  sha256: Buffer;
  kucukResimler: KucukResim[];
}

/** Cokmus workerlarin biraktigi `isleniyor` satirlarini kuyruga geri alir. Idempotent. */
export async function takilanlariGeriAl(db: Pick<Database, 'orm'>): Promise<number> {
  const satirlar = await db.orm.execute(sql`
    update medya.dosyalar
       set durum = 'yuklendi', isleme_basladi_at = null
     where durum = 'isleniyor'
       and isleme_basladi_at < now() - make_interval(mins => ${TAKILMA_SURESI_DK})
     returning id`);
  return satirlar.length;
}

/**
 * `yuklendi` satirlarini `FOR UPDATE SKIP LOCKED` ile alip `isleniyor` yapar (kisa islem); agir is
 * islem disinda yapilir. Birden fazla worker ayni satiri iki kez almaz.
 */
export async function islenecekleriAl(
  db: Pick<Database, 'orm'>,
  adet: number,
): Promise<IslemeSatiri[]> {
  return db.orm.execute<IslemeSatiri>(sql`
    update medya.dosyalar d
       set durum = 'isleniyor', isleme_basladi_at = now(), isleme_deneme = d.isleme_deneme + 1
     where d.id in (
       select id from medya.dosyalar
        where durum = 'yuklendi' and (sonraki_isleme_at is null or sonraki_isleme_at <= now())
        order by sonraki_isleme_at nulls first, created_at
        limit ${adet}
        for update skip locked)
    returning d.id, d.kurum_id, d.sahip_kullanici_id, d.sahip_uyelik_id, d.tur, d.mime_tipi,
              d.boyut_bayt::float8 as boyut_bayt, encode(d.bildirilen_sha256, 'hex') as bildirilen_sha256,
              d.depolama_anahtari, d.kota_bayt::float8 as kota_bayt, d.isleme_deneme`);
}

async function hazirla(
  d: IslemeBagimliliklari,
  satir: IslemeSatiri,
  politika: Politika,
): Promise<HazirSonuc> {
  const kural = MEDYA_TUR_KURALLARI[satir.tur];
  const girdi = await d.depolama.oku(
    yuklemeAnahtari(satir.depolama_anahtari),
    kural.azami_boyut_bayt,
  );
  if (girdi.length !== satir.boyut_bayt) {
    throw new IslemeReddi('boyut_uyusmazligi', 'Nesne boyutu doğrulanan boyutla uyuşmuyor');
  }
  const sha256 = createHash('sha256').update(girdi).digest();
  if (sha256.toString('hex') !== satir.bildirilen_sha256) {
    throw new IslemeReddi('bozuk_dosya', 'SHA-256 özeti bildirilenle uyuşmuyor');
  }
  const tespit = await icerikTuruTespit(girdi);
  if (!mimeUyusuyor(satir.mime_tipi, tespit)) {
    throw new IslemeReddi('mime_uyusmazligi', 'Bayt imzası bildirilen içerik türüyle uyuşmuyor');
  }
  const sinif = icerikSinifi(satir.mime_tipi);
  const temel = {
    sha256,
    kucukResimler: [] as KucukResim[],
    genislik: null,
    yukseklik: null,
    sureSn: null,
  };

  if (sinif === 'gorsel') {
    if (politika.ek_islem === 'yok') {
      return { ...temel, mime: satir.mime_tipi, govde: girdi, boyutBayt: girdi.length };
    }
    try {
      const sonuc = await gorselIsle(girdi, satir.tur, satir.mime_tipi, {
        kucukResim: politika.kucuk_resim,
      });
      return {
        ...temel,
        mime: sonuc.asil.mime,
        govde: sonuc.asil.govde,
        boyutBayt: sonuc.asil.govde.length,
        genislik: sonuc.asil.genislik,
        yukseklik: sonuc.asil.yukseklik,
        kucukResimler: sonuc.kucukResimler,
      };
    } catch (err) {
      throw new IslemeReddi('bozuk_dosya', `Görsel çözümlenemedi: ${(err as Error).message}`);
    }
  }

  if (sinif === 'ses') {
    let sure: number | null;
    try {
      sure = await sesSuresiSn(girdi, satir.mime_tipi);
    } catch (err) {
      throw new IslemeReddi('bozuk_dosya', `Ses çözümlenemedi: ${(err as Error).message}`);
    }
    if (sure === null) throw new IslemeReddi('bozuk_dosya', 'Ses süresi doğrulanamadı');
    const azami = MEDYA_SES_AZAMI_SURE_SN;
    if (sure > azami)
      throw new IslemeReddi('sure_asimi', `Ses ${String(azami)} sn sınırını aşıyor`);
    return { ...temel, mime: satir.mime_tipi, govde: girdi, boyutBayt: girdi.length, sureSn: sure };
  }

  // PDF: bayt imzasi dogrulandi; icerik degistirilmez.
  return { ...temel, mime: satir.mime_tipi, govde: girdi, boyutBayt: girdi.length };
}

async function yenidenPlanla(
  d: IslemeBagimliliklari,
  satir: IslemeSatiri,
  neden: unknown,
): Promise<void> {
  if (satir.isleme_deneme >= AZAMI_ISLEME_DENEMESI) {
    d.log.error(
      { dosyaId: satir.id, deneme: satir.isleme_deneme, err: neden },
      'dosya işleme denemeleri tükendi',
    );
    await d.db.orm.transaction((tx) => dosyayiBasarisizYap(tx, satir, 'bozuk_dosya'));
    return;
  }
  const bekleme =
    YENIDEN_DENEME_SN[Math.min(satir.isleme_deneme - 1, YENIDEN_DENEME_SN.length - 1)] ?? 600;
  d.log.warn(
    { dosyaId: satir.id, deneme: satir.isleme_deneme, bekleme, err: neden },
    'dosya işleme geçici olarak başarısız; yeniden denenecek',
  );
  await d.db.orm.execute(sql`
    update medya.dosyalar
       set durum = 'yuklendi', isleme_basladi_at = null,
           sonraki_isleme_at = now() + make_interval(secs => ${bekleme})
     where id = ${satir.id} and durum = 'isleniyor'`);
}

async function tamamla(
  d: IslemeBagimliliklari,
  satir: IslemeSatiri,
  sonuc: HazirSonuc,
): Promise<void> {
  const anahtar = satir.depolama_anahtari;
  const yazilanlar: string[] = [anahtar];
  await d.depolama.yaz(anahtar, sonuc.govde, sonuc.mime);
  for (const k of sonuc.kucukResimler) {
    const kAnahtar = kucukResimAnahtari(anahtar, k.varyant);
    await d.depolama.yaz(kAnahtar, k.govde, k.mime);
    yazilanlar.push(kAnahtar);
  }
  const yeniKota = sonuc.boyutBayt + sonuc.kucukResimler.reduce((t, k) => t + k.govde.length, 0);

  const bitti = await d.db.orm.transaction(async (tx) => {
    const guncel = await tx.execute<{ id: string; kota_bayt: number }>(sql`
      select id, kota_bayt::float8 as kota_bayt from medya.dosyalar
       where id = ${satir.id} and durum = 'isleniyor' for update`);
    if (guncel.length === 0) return false;
    const eskiKota = guncel[0]?.kota_bayt ?? 0;

    await tx.execute(sql`
      update medya.dosyalar d
         set durum = 'hazir', mime_tipi = ${sonuc.mime}, boyut_bayt = ${sonuc.boyutBayt},
             sha256 = ${sonuc.sha256}, genislik = ${sonuc.genislik}, yukseklik = ${sonuc.yukseklik},
             sure_sn = ${sonuc.sureSn}, hazir_at = now(), isleme_basladi_at = null,
             kota_bayt = ${yeniKota},
             silinecek_at = coalesce(d.silinecek_at, case
               when d.baglandi then
                 case when p.varsayilan_saklama_gun is null then null
                      else d.baglandi_at + make_interval(days => p.varsayilan_saklama_gun) end
               else now() + make_interval(hours => p.yetim_saat) end),
             silme_nedeni = case
               when d.silinecek_at is not null then d.silme_nedeni
               when d.baglandi then case when p.varsayilan_saklama_gun is null then null else 'saklama_suresi' end
               else 'yetim' end
        from medya.saklama_politikalari p
       where p.tur = d.tur and d.id = ${satir.id}`);

    for (const k of sonuc.kucukResimler) {
      await tx.execute(sql`
        insert into medya.kucuk_resimler
          (id, kurum_id, dosya_id, varyant, depolama_anahtari, genislik, yukseklik, boyut_bayt, mime_tipi)
        values (${uuidv7()}, ${satir.kurum_id}, ${satir.id}, ${k.varyant},
                ${kucukResimAnahtari(satir.depolama_anahtari, k.varyant)}, ${k.genislik},
                ${k.yukseklik}, ${k.govde.length}, ${k.mime})
        on conflict (dosya_id, varyant) do update
          set genislik = excluded.genislik, yukseklik = excluded.yukseklik,
              boyut_bayt = excluded.boyut_bayt, mime_tipi = excluded.mime_tipi`);
    }

    await tx.execute(sql`
      update medya.kurum_kotalari
         set kullanilan_bayt = greatest(kullanilan_bayt + ${yeniKota - eskiKota}, 0)
       where kurum_id = ${satir.kurum_id}`);

    await publishInTx(
      tx,
      medyaDosyaHazirV1.create({
        kurumId: satir.kurum_id,
        actor: SISTEM_AKTORU,
        correlationId: satir.id,
        data: {
          dosya_id: satir.id,
          sahip_kullanici_id: satir.sahip_kullanici_id,
          sahip_uyelik_id: satir.sahip_uyelik_id,
          tur: satir.tur,
          mime_tipi: sonuc.mime,
          boyut_bayt: sonuc.boyutBayt,
          genislik: sonuc.genislik,
          yukseklik: sonuc.yukseklik,
          sure_sn: sonuc.sureSn,
          kucuk_resim_var: sonuc.kucukResimler.length > 0,
        },
      }),
      { table: OUTBOX_TABLOSU },
    );
    return true;
  });

  if (!bitti) {
    // Isleme sirasinda dosya silindi/iptal edildi: yazdigimiz nesneleri geri al.
    d.log.warn({ dosyaId: satir.id }, 'dosya işleme sırasında silindi; çıktılar temizleniyor');
    await d.depolama.sil(yazilanlar);
    return;
  }
  // Ham yukleme nesnesi artik gereksiz; silinemezse silme isi (herhangi bir nedenle) temizler.
  try {
    await d.depolama.sil([yuklemeAnahtari(anahtar)]);
  } catch (err) {
    d.log.warn({ err, dosyaId: satir.id }, 'ham yükleme nesnesi silinemedi');
  }
}

/** Tek dosyayi isler (satir `isleniyor`da). Hata ne olursa olsun satiri kararli bir duruma tasir. */
async function birDosyaIsle(d: IslemeBagimliliklari, satir: IslemeSatiri): Promise<void> {
  try {
    const [politika] = await d.db.orm.execute<Politika>(sql`
      select kucuk_resim, ek_islem from medya.saklama_politikalari where tur = ${satir.tur}`);
    if (!politika) throw new IslemeReddi('bozuk_dosya', 'Saklama politikası bulunamadı');
    const sonuc = await hazirla(d, satir, politika);
    await tamamla(d, satir, sonuc);
    d.log.info({ dosyaId: satir.id, tur: satir.tur }, 'dosya hazır');
  } catch (err) {
    try {
      if (err instanceof IslemeReddi) {
        d.log.warn({ dosyaId: satir.id, hata: err.hata, neden: err.message }, 'dosya işlenemedi');
        await d.db.orm.transaction((tx) => dosyayiBasarisizYap(tx, satir, err.hata));
      } else {
        // DepolamaHatasi ve beklenmeyen hatalar gecici sayilir.
        await yenidenPlanla(d, satir, err);
      }
    } catch (ikincil) {
      // Satir `isleniyor`da kalir; `takilanlariGeriAl` toparlar.
      d.log.error({ err: ikincil, dosyaId: satir.id }, 'işleme sonucu kaydedilemedi');
    }
  }
}

/** Kuyruktan en fazla `adet` dosya alip eszamanli isler. Islenen dosya sayisini dondurur. */
export async function kuyrugunuIsle(d: IslemeBagimliliklari, adet: number): Promise<number> {
  const satirlar = await islenecekleriAl(d.db, adet);
  await Promise.all(satirlar.map((s) => birDosyaIsle(d, s)));
  return satirlar.length;
}
