import type { Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { withSistem } from '../../sistem/with-sistem.js';
import { bugunIstanbul } from './ortak.js';

/**
 * Gece isleri (ADR 0007 kural 6): ozet tablolari ile defter toplami farkini denetler ve suresi dolan
 * paketlerin kalan kredisini `son_kullanma` satiriyla dusurur. `api_sistem` (BYPASSRLS) baglantisiyla
 * calisir; her calisma `hesap.denetim_kayitlari`na nedeniyle yazilir (`withSistem`). Isler idempotenttir.
 */

export interface GeceIsiGunlugu {
  error(nesne: Record<string, unknown>, mesaj: string): void;
  info(nesne: Record<string, unknown>, mesaj: string): void;
}

export interface OzetUyusmazligi {
  kurum_id: string;
  ogrenci_id: string;
  tur: 'kredi' | 'bakiye';
  ozet: number;
  defter: number;
}

/** Ozet tablo ile `SUM(defter)` farkli olan ogrenciler. Uyusmazlik `error` olarak loglanir (alarm). */
export async function ozetDenetimiCalistir(
  db: Pick<Database, 'orm'>,
  log: GeceIsiGunlugu,
): Promise<OzetUyusmazligi[]> {
  const bulunan = await withSistem(
    db,
    {
      eylem: 'sistem.finans_ozet_denetimi',
      neden: 'Gece işi: finans özet ve defter toplamı denetimi',
    },
    async (tx) => {
      const kredi = await tx.execute<{
        kurum_id: string;
        ogrenci_id: string;
        ozet: string;
        defter: string;
      }>(sql`
        select coalesce(o.kurum_id, d.kurum_id) as kurum_id, coalesce(o.ogrenci_id, d.ogrenci_id) as ogrenci_id,
               coalesce(o.bakiye, 0) as ozet, coalesce(d.toplam, 0) as defter
        from finans.kredi_bakiyeleri o
        full join (select kurum_id, ogrenci_id, sum(miktar) as toplam
                   from finans.kredi_hareketleri group by kurum_id, ogrenci_id) d
          on d.kurum_id = o.kurum_id and d.ogrenci_id = o.ogrenci_id
        where coalesce(o.bakiye, 0) <> coalesce(d.toplam, 0)`);
      const bakiye = await tx.execute<{
        kurum_id: string;
        ogrenci_id: string;
        ozet: string;
        defter: string;
      }>(sql`
        select coalesce(o.kurum_id, d.kurum_id) as kurum_id, coalesce(o.ogrenci_id, d.ogrenci_id) as ogrenci_id,
               coalesce(o.bakiye_kurus, 0) as ozet, coalesce(d.toplam, 0) as defter
        from finans.ogrenci_bakiyeleri o
        full join (select kurum_id, ogrenci_id, sum(tutar_kurus) as toplam
                   from finans.bakiye_hareketleri group by kurum_id, ogrenci_id) d
          on d.kurum_id = o.kurum_id and d.ogrenci_id = o.ogrenci_id
        where coalesce(o.bakiye_kurus, 0) <> coalesce(d.toplam, 0)`);
      const donustur =
        (tur: OzetUyusmazligi['tur']) =>
        (s: { kurum_id: string; ogrenci_id: string; ozet: string; defter: string }) => ({
          kurum_id: s.kurum_id,
          ogrenci_id: s.ogrenci_id,
          tur,
          ozet: Number(s.ozet),
          defter: Number(s.defter),
        });
      return [...kredi.map(donustur('kredi')), ...bakiye.map(donustur('bakiye'))];
    },
  );
  for (const u of bulunan) {
    // Kisisel veri yok: yalniz kimlikler ve sayilar. Alarm bu mesaj anahtarina baglanir.
    log.error({ ...u }, 'finans_ozet_uyusmazligi');
  }
  return bulunan;
}

/**
 * Suresi dolan paket satislari: kalan kredi `son_kullanma` satiri ile sifirlanir, `durum='suresi_doldu'`.
 * Bitis tarihi Europe/Istanbul gunune gore gecmis olmalidir. Donus: islenen satis sayisi.
 */
export async function sonKullanmaCalistir(
  db: Pick<Database, 'orm'>,
  bugun: string = bugunIstanbul(),
): Promise<number> {
  return withSistem(
    db,
    {
      eylem: 'sistem.finans_son_kullanma',
      neden: 'Gece işi: süresi dolan paket kredilerinin düşülmesi',
    },
    async (tx) => {
      const adaylar = await tx.execute<{ id: string; kurum_id: string; ogrenci_id: string }>(sql`
        select id, kurum_id, ogrenci_id from finans.paket_satislari
        where durum in ('aktif', 'tukendi', 'suresi_doldu') and bitis_tarihi < ${bugun}::date
        order by id
        for update`);
      let islenen = 0;
      for (const a of adaylar) {
        const [{ kalan } = { kalan: '0' }] = await tx.execute<{ kalan: string }>(sql`
          select coalesce(sum(miktar), 0) as kalan from finans.kredi_hareketleri
          where kurum_id = ${a.kurum_id} and paket_satisi_id = ${a.id}`);
        const kalanKredi = Number(kalan);
        if (kalanKredi > 0) {
          await tx.execute(sql`
            insert into finans.kredi_hareketleri (id, kurum_id, ogrenci_id, paket_satisi_id, tur, miktar, neden)
            values (${uuidv7()}, ${a.kurum_id}, ${a.ogrenci_id}, ${a.id}, 'son_kullanma', ${-kalanKredi}, 'suresi_doldu')`);
          await tx.execute(sql`
            insert into finans.kredi_bakiyeleri (id, kurum_id, ogrenci_id, bakiye)
            values (${uuidv7()}, ${a.kurum_id}, ${a.ogrenci_id}, ${-kalanKredi})
            on conflict (kurum_id, ogrenci_id)
            do update set bakiye = finans.kredi_bakiyeleri.bakiye + excluded.bakiye`);
          islenen += 1;
        }
        await tx.execute(sql`
          update finans.paket_satislari set durum = 'suresi_doldu'
          where id = ${a.id} and durum <> 'suresi_doldu'`);
      }
      return islenen;
    },
  );
}

export async function geceIsleriniCalistir(db: Pick<Database, 'orm'>, log: GeceIsiGunlugu) {
  const sonKullanma = await sonKullanmaCalistir(db);
  const uyusmazlik = await ozetDenetimiCalistir(db, log);
  log.info({ son_kullanma: sonKullanma, uyusmazlik: uyusmazlik.length }, 'finans_gece_isi_bitti');
  return { sonKullanma, uyusmazlik };
}

const SAAT_MS = 3_600_000;

/**
 * Worker sureci icin zamanlayici: her saat kontrol eder, Europe/Istanbul 03:00 saatinde gunde bir kez
 * calistirir. pg-boss henuz depoda yoktur (kendi `pgboss` semasi migration ister); ayni arayuzle
 * ona tasinabilir. Birden cok worker ayni anda calisirsa isler idempotent oldugu icin zarar vermez.
 */
export function geceIsiZamanla(
  db: Pick<Database, 'orm'>,
  log: GeceIsiGunlugu,
  simdi: () => Date = () => new Date(),
): () => Promise<void> {
  let sonCalisma: string | null = null;
  const kontrol = () => {
    const an = simdi();
    const saat = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Istanbul',
        hour: '2-digit',
        hour12: false,
      }).format(an),
    );
    const gun = bugunIstanbul(an);
    if (saat !== 3 || sonCalisma === gun) return;
    sonCalisma = gun;
    geceIsleriniCalistir(db, log).catch((err: unknown) => {
      log.error({ err: String(err) }, 'finans_gece_isi_hatasi');
      sonCalisma = null;
    });
  };
  const zamanlayici = setInterval(kontrol, SAAT_MS);
  zamanlayici.unref();
  return () => {
    clearInterval(zamanlayici);
    return Promise.resolve();
  };
}
