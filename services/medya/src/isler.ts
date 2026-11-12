import { medyaDosyaSilindiV1, type MedyaDosyaTuru } from '@kopru/contracts';
import { islenmisOlaylariTemizle, publishInTx, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import type { Depolama } from './depolama.js';
import {
  OUTBOX_TABLOSU,
  SISTEM_AKTORU,
  kucukResimAnahtari,
  yuklemeAnahtari,
} from './dosya-deposu.js';
import { takilanlariGeriAl, type IslemeLogu } from './isleme/isle.js';

/**
 * Zamanlanmis isler (worker, `medya_sistem` baglantisi). Hepsi idempotenttir ve `FOR UPDATE SKIP LOCKED`
 * ya da tek ifadelik guncellemelerle coklu worker guvenlidir.
 */
export interface IsBagimliliklari {
  db: Pick<Database, 'orm'>;
  depolama: Depolama;
  log: IslemeLogu;
}

export const SILME_PARTISI = 200;
/** Silme basarisiz olursa satir bu kadar ertelenir (medya.md "Silme isi"). */
export const SILME_ERTELEME_GUN = 1;

export interface SilmeOzeti {
  silinen: number;
  hata: number;
}

interface SilinecekSatir extends Record<string, unknown> {
  id: string;
  kurum_id: string;
  tur: MedyaDosyaTuru;
  depolama_anahtari: string;
  silme_nedeni: string | null;
  kota_bayt: number;
}

/**
 * `silinecek_at` zamani gelen dosyalari fiziksel olarak siler: nesne + kucuk resimler depolamadan,
 * satir `silindi` (anahtar NULL), kota duser, `medya.dosya.silindi.v1` ayni islemde. Nesne yoksa hata
 * sayilmaz. Depolama hatasinda satir yarina ertelenir.
 */
export async function silmeIsi(d: IsBagimliliklari): Promise<SilmeOzeti> {
  return d.db.orm.transaction(async (tx) => {
    const satirlar = await tx.execute<SilinecekSatir>(sql`
      select id, kurum_id, tur, depolama_anahtari, silme_nedeni, kota_bayt::float8 as kota_bayt
        from medya.dosyalar
       where silinecek_at <= now() and durum <> 'silindi'
       order by silinecek_at
       limit ${SILME_PARTISI}
       for update skip locked`);
    const ozet: SilmeOzeti = { silinen: 0, hata: 0 };
    for (const s of satirlar) {
      try {
        await d.depolama.sil([
          s.depolama_anahtari,
          yuklemeAnahtari(s.depolama_anahtari),
          kucukResimAnahtari(s.depolama_anahtari, 'kucuk'),
          kucukResimAnahtari(s.depolama_anahtari, 'orta'),
        ]);
      } catch (err) {
        d.log.warn({ err, dosyaId: s.id }, 'dosya nesneleri silinemedi; yarına ertelendi');
        await tx.execute(sql`
          update medya.dosyalar
             set silinecek_at = now() + make_interval(days => ${SILME_ERTELEME_GUN}),
                 silme_hata_sayisi = silme_hata_sayisi + 1
           where id = ${s.id}`);
        ozet.hata++;
        continue;
      }
      await tx.execute(sql`delete from medya.kucuk_resimler where dosya_id = ${s.id}`);
      await tx.execute(sql`
        update medya.dosyalar
           set durum = 'silindi', depolama_anahtari = null, silindi_at = now(), kota_bayt = 0,
               isleme_basladi_at = null,
               silme_nedeni = coalesce(silme_nedeni, 'saklama_suresi')
         where id = ${s.id}`);
      await tx.execute(sql`
        update medya.kurum_kotalari
           set kullanilan_bayt = greatest(kullanilan_bayt - ${s.kota_bayt}, 0),
               dosya_sayisi = greatest(dosya_sayisi - 1, 0)
         where kurum_id = ${s.kurum_id}`);
      await publishInTx(
        tx,
        medyaDosyaSilindiV1.create({
          kurumId: s.kurum_id,
          actor: SISTEM_AKTORU,
          correlationId: s.id,
          data: {
            dosya_id: s.id,
            tur: s.tur,
            silme_nedeni: (s.silme_nedeni ?? 'saklama_suresi') as
              | 'yetim'
              | 'saklama_suresi'
              | 'soru_cozuldu'
              | 'kullanici_silindi'
              | 'kurum_kapandi'
              | 'birakildi'
              | 'yukleme_zaman_asimi',
            silindi_at: new Date().toISOString(),
          },
        }),
        { table: OUTBOX_TABLOSU },
      );
      ozet.silinen++;
    }
    return ozet;
  });
}

/** `yukleme_son_at + 1 saat` gecen `yukleme_bekliyor` dosyalari silinmek uzere isaretler. */
export async function yuklemeZamanAsimi(db: Pick<Database, 'orm'>): Promise<number> {
  const satirlar = await db.orm.execute(sql`
    update medya.dosyalar
       set silinecek_at = now(), silme_nedeni = 'yukleme_zaman_asimi', hata_kodu = 'yukleme_zaman_asimi'
     where durum = 'yukleme_bekliyor' and silinecek_at is null
       and yukleme_son_at + interval '1 hour' < now()
     returning id`);
  return satirlar.length;
}

/** Hazir, baglanmamis ve silme plani olmayan dosyalara yetim suresini uygular (`hazir_at + yetim_saat`). */
export async function yetimKurali(db: Pick<Database, 'orm'>): Promise<number> {
  const satirlar = await db.orm.execute(sql`
    update medya.dosyalar d
       set silinecek_at = d.hazir_at + make_interval(hours => p.yetim_saat), silme_nedeni = 'yetim'
      from medya.saklama_politikalari p
     where p.tur = d.tur and d.durum = 'hazir' and d.baglandi = false and d.silinecek_at is null
     returning d.id`);
  return satirlar.length;
}

export interface KotaUyusmazligi extends Record<string, unknown> {
  kurum_id: string;
  kayitli_bayt: number;
  gercek_bayt: number;
}

/**
 * Gece denetimi: `kurum_kotalari` ile dosyalarin `kota_bayt` toplamini karsilastirir, farki loglar ve
 * duzeltir. Kota satirlari kilitlenir (kisa), eszamanli rezervasyonlar bekler.
 */
export async function kotaDenetimi(d: IsBagimliliklari): Promise<KotaUyusmazligi[]> {
  return d.db.orm.transaction(async (tx) => {
    await tx.execute(sql`select 1 from medya.kurum_kotalari for update`);
    const farklar = await tx.execute<KotaUyusmazligi>(sql`
      select k.kurum_id, k.kullanilan_bayt::float8 as kayitli_bayt,
             coalesce(s.bayt, 0)::float8 as gercek_bayt
        from medya.kurum_kotalari k
        left join (select kurum_id, sum(kota_bayt) as bayt, count(*) as adet
                     from medya.dosyalar where durum <> 'silindi' group by kurum_id) s
          on s.kurum_id = k.kurum_id
       where k.kullanilan_bayt <> coalesce(s.bayt, 0) or k.dosya_sayisi <> coalesce(s.adet, 0)`);
    for (const f of farklar) {
      d.log.error({ ...f }, 'kota uyuşmazlığı bulundu; düzeltiliyor');
    }
    if (farklar.length > 0) {
      await tx.execute(sql`
        update medya.kurum_kotalari k
           set kullanilan_bayt = coalesce(s.bayt, 0), dosya_sayisi = coalesce(s.adet, 0)
          from medya.kurum_kotalari k2
          left join (select kurum_id, sum(kota_bayt) as bayt, count(*)::int as adet
                       from medya.dosyalar where durum <> 'silindi' group by kurum_id) s
            on s.kurum_id = k2.kurum_id
         where k.id = k2.id
           and (k.kullanilan_bayt <> coalesce(s.bayt, 0) or k.dosya_sayisi <> coalesce(s.adet, 0))`);
    }
    return farklar;
  });
}

/** Silme turu: zaman asimi + yetim + takilan isleme + silme. */
export async function bakimTuru(d: IsBagimliliklari): Promise<void> {
  const takilan = await takilanlariGeriAl(d.db);
  if (takilan > 0) d.log.warn({ adet: takilan }, 'takılan işlemeler kuyruğa geri alındı');
  const asimi = await yuklemeZamanAsimi(d.db);
  if (asimi > 0)
    d.log.info({ adet: asimi }, 'yükleme zaman aşımına uğrayanlar silinmek üzere işaretlendi');
  const yetim = await yetimKurali(d.db);
  if (yetim > 0) d.log.info({ adet: yetim }, 'yetim dosyalara silme süresi atandı');
  let tur = await silmeIsi(d);
  let toplam = tur.silinen;
  while (tur.silinen === SILME_PARTISI) {
    tur = await silmeIsi(d);
    toplam += tur.silinen;
  }
  if (toplam > 0) d.log.info({ adet: toplam }, 'dosyalar silindi');
}

export async function gunlukTemizlik(d: IsBagimliliklari): Promise<number> {
  return islenmisOlaylariTemizle(d.db);
}
