import { motivasyonSeriRiskV1 } from '@kopru/contracts';
import { publishInTx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import type { IsBagimliliklari } from './isler.js';
import {
  OUTBOX_TABLOSU,
  SISTEM_AKTORU,
  modulAcikMi,
  ogrenciKilitle,
  yeniId,
  type IsBaglami,
  type Islem,
} from './ortak.js';
import {
  aktiviteOku,
  aninaOnar,
  gunTamam,
  seriAyarlariOku,
  seriGunuYaz,
  seriOku,
  seriYenidenTuret,
  seriniBoz,
  zincirOlc,
  SERI_RISK_SAYACI,
  type SeriAyarlari,
} from './seri.js';
import { sayacArtir } from './xp-cekirdek.js';

/**
 * Seri zamanlanmis isleri (worker, `motivasyon_sistem`: BYPASSRLS). Ogrenci basina ayri islem ve
 * ogrenci kilidi: iki worker ayni anda calissa da sonuc tektir (ikincisi kilidi bekler, isi bitmis bulur).
 * Zaman `simdi` ile enjekte edilir.
 */

/** Testler ve elle calistirma icin: yalniz bir kurumu isler. */
export interface IsFiltresi {
  kurumId?: string;
}

interface Aday {
  kurum_id: string;
  ogrenci_id: string;
  saat_dilimi: string;
  kurum_durum: string;
  gece_gun: string;
}

const kurumSaatiGun = (an: string) =>
  sql`(((${an}::timestamptz at time zone coalesce(k.saat_dilimi, 'Europe/Istanbul')) - interval '4 hours')::date)`;

async function gunEkle(tx: Islem, gun: string, n: number): Promise<string> {
  const [r] = await tx.execute<{ g: string }>(sql`select (${gun}::date + ${n}::int)::text as g`);
  return r?.g ?? gun;
}

/** Dondurma tahakkuku (haftada +1, en cok azami; idempotent) ve onarim hakki yenileme (ayin ilk gunu). */
export async function haklariYenile(
  tx: Islem,
  ogrenciId: string,
  ay: SeriAyarlari,
  gun: string,
): Promise<void> {
  await tx.execute(sql`
    update motivasyon.seriler set
      dondurma_stogu = case
        when dondurma_son_hafta is null or dondurma_son_hafta >= date_trunc('week', ${gun}::date)::date
          then dondurma_stogu
        else least(${ay.dondurmaAzami}, dondurma_stogu
                   + ${ay.dondurmaHaftalik} * ((date_trunc('week', ${gun}::date)::date - dondurma_son_hafta) / 7))
      end::smallint,
      dondurma_son_hafta = case
        when dondurma_son_hafta is null or dondurma_son_hafta < date_trunc('week', ${gun}::date)::date
          then date_trunc('week', ${gun}::date)::date else dondurma_son_hafta end,
      onarim_hakki = case
        when onarim_son_ay is null or onarim_son_ay < date_trunc('month', ${gun}::date)::date then 1
        else onarim_hakki end,
      onarim_son_ay = case
        when onarim_son_ay is null or onarim_son_ay < date_trunc('month', ${gun}::date)::date
          then date_trunc('month', ${gun}::date)::date else onarim_son_ay end
     where ogrenci_id = ${ogrenciId}
       and (dondurma_son_hafta is null or dondurma_son_hafta < date_trunc('week', ${gun}::date)::date
            or onarim_son_ay is null or onarim_son_ay < date_trunc('month', ${gun}::date)::date)`);
}

async function duraklatmaVarMi(tx: Islem, ogrenciId: string, gun: string): Promise<boolean> {
  const r = await tx.execute(sql`
    select 1 from motivasyon.grup_uyesi_kopyalari m
      join motivasyon.seri_duraklatmalari p on p.grup_id = m.grup_id and p.kurum_id = m.kurum_id
     where m.ogrenci_id = ${ogrenciId}
       and m.baslangic_tarihi <= ${gun}::date and (m.bitis_tarihi is null or m.bitis_tarihi >= ${gun}::date)
       and p.iptal_at is null and ${gun}::date between p.baslangic_gun and p.bitis_gun
     limit 1`);
  return r.length > 0;
}

function baglam(a: Aday, gun: string, hafta: string, an: Date): IsBaglami {
  return {
    kurumId: a.kurum_id,
    ogrenciId: a.ogrenci_id,
    olayId: yeniId(),
    olusmaAt: an.toISOString(),
    saatDilimi: a.saat_dilimi,
    gun,
    hafta,
  };
}

/** Tek bir kayitsiz gunu degerlendirir (`gun`): aktif/duraklatma/dondurma/kacirildi. */
async function gunuDegerlendir(
  tx: Islem,
  a: Aday,
  ay: SeriAyarlari,
  gun: string,
  an: Date,
): Promise<void> {
  const b = baglam(a, gun, gun, an);
  // Olay yolu kacirdiysa (ornegin odak) esige ulasmis gun yine aktif sayilir.
  const akt = await aktiviteOku(tx, a.ogrenci_id, gun);
  if (gunTamam(akt, ay)) {
    if (await seriGunuYaz(tx, b, gun, 'aktif', null)) {
      await sayacArtir(tx, b, 'toplam_aktif_gun', 1);
      await seriYenidenTuret(tx, b, ay);
    }
    return;
  }
  const onceki = (await zincirOlc(tx, a.ogrenci_id, await gunEkle(tx, gun, -1))).mevcut;
  if (onceki === 0) return; // korunacak/bozulacak seri yok: kayit acilmaz
  const kurumKapali = a.kurum_durum !== 'aktif';
  if (
    kurumKapali ||
    !(await modulAcikMi(tx, { kurumId: a.kurum_id, ogrenciId: a.ogrenci_id, gun })) ||
    (await duraklatmaVarMi(tx, a.ogrenci_id, gun))
  ) {
    // Ogretmen duraklatmasi (ve kapali modul/askidaki kurum) seriyi bozmaz, dondurma harcamaz.
    await seriGunuYaz(tx, b, gun, 'duraklatma', null);
    await seriYenidenTuret(tx, b, ay);
    return;
  }
  const s = await seriOku(tx, a.ogrenci_id);
  if (!s) return;
  if (s.dondurma_stogu > 0) {
    await tx.execute(sql`
      update motivasyon.seriler set dondurma_stogu = dondurma_stogu - 1 where ogrenci_id = ${a.ogrenci_id}`);
    await seriGunuYaz(tx, b, gun, 'dondurma', null);
    await seriYenidenTuret(tx, b, ay);
    return;
  }
  if (await aninaOnar(tx, b, ay, gun, onceki)) return;
  await seriniBoz(tx, b, ay, gun, onceki, s.onarim_hakki);
}

/** Bir ogrencinin bekleyen gunlerini sirayla degerlendirir ve haklari yeniler (kilit altinda). */
async function ogrenciGeceIsle(tx: Islem, a: Aday, an: Date): Promise<number> {
  await ogrenciKilitle(tx, a.ogrenci_id);
  const ay = await seriAyarlariOku(tx);
  const s = await seriOku(tx, a.ogrenci_id);
  if (!s) return 0;
  let gunler: string[] = [];
  if (s.mevcut_seri > 0) {
    // Kaydi olmayan gunler, eskiden yeniye (sunucu kapali kaldiysa atlananlar; en cok 60 gun geriye).
    // Serisi olmayan donemlerdeki bosluklar `gunuDegerlendir`de (zincir 0) kayit acmadan atlanir.
    const r = await tx.execute<{ g: string }>(sql`
      select d::text as g
        from (select (${a.gece_gun}::date - 1 - i) as d from generate_series(0, 59) i) x
       where d >= (select min(gun) from motivasyon.seri_gunleri where ogrenci_id = ${a.ogrenci_id})
         and not exists (select 1 from motivasyon.seri_gunleri r where r.ogrenci_id = ${a.ogrenci_id} and r.gun = x.d)
       order by d`);
    gunler = r.map((x) => x.g);
  }
  for (const gun of gunler) {
    // O gunu degerlendiren is, ertesi gunun 04:10'unda calisir: hak yenileme once (Pazartesi tahakkuku).
    await haklariYenile(tx, a.ogrenci_id, ay, await gunEkle(tx, gun, 1));
    await gunuDegerlendir(tx, a, ay, gun, an);
  }
  await haklariYenile(tx, a.ogrenci_id, ay, a.gece_gun);
  return gunler.length;
}

/**
 * Gece isi: her kurumun 04:10'undan sonra onceki gunu(leri) degerlendirir; Pazartesi dondurma tahakkuku,
 * ayin ilk gunu onarim hakki yenileme. Idempotenttir (kayitli gun yeniden degerlendirilmez, hak yenileme
 * `dondurma_son_hafta`/`onarim_son_ay` ile). Islenen ogrenci sayisini doner.
 */
export async function seriGeceIsi(
  d: IsBagimliliklari,
  simdi: Date = new Date(),
  filtre: IsFiltresi = {},
): Promise<{ ogrenci: number; gun: number }> {
  const an = simdi.toISOString();
  const adaylar = await d.db.orm.execute<Aday & Record<string, unknown>>(sql`
    select x.kurum_id, x.ogrenci_id, x.saat_dilimi, x.kurum_durum, x.gece_gun::text as gece_gun
      from (
        select s.kurum_id, s.ogrenci_id, s.mevcut_seri, s.dondurma_son_hafta, s.onarim_son_ay,
               coalesce(k.saat_dilimi, 'Europe/Istanbul') as saat_dilimi,
               coalesce(k.durum, 'aktif') as kurum_durum,
               (((${an}::timestamptz at time zone coalesce(k.saat_dilimi, 'Europe/Istanbul'))
                 - interval '4 hours 10 minutes')::date) as gece_gun
          from motivasyon.seriler s
          left join motivasyon.kurum_kopyalari k on k.kurum_id = s.kurum_id
         where not exists (select 1 from motivasyon.uyelik_kopyalari u
                            where u.uyelik_id = s.ogrenci_id and (u.rol <> 'ogrenci' or u.durum <> 'aktif'))
           and (${filtre.kurumId ?? null}::uuid is null or s.kurum_id = ${filtre.kurumId ?? null}::uuid)
      ) x
     where (x.mevcut_seri > 0 and exists (
              select 1 from generate_series(1, 3) i
               where x.gece_gun - i >= (select min(gun) from motivasyon.seri_gunleri m where m.ogrenci_id = x.ogrenci_id)
                 and not exists (select 1 from motivasyon.seri_gunleri g
                                  where g.ogrenci_id = x.ogrenci_id and g.gun = x.gece_gun - i)))
        or x.dondurma_son_hafta is null or x.dondurma_son_hafta < date_trunc('week', x.gece_gun)::date
        or x.onarim_son_ay is null or x.onarim_son_ay < date_trunc('month', x.gece_gun)::date
     order by x.kurum_id, x.ogrenci_id`);
  let gun = 0;
  let hata: Error | undefined;
  for (const a of adaylar) {
    try {
      gun += await d.db.orm.transaction((tx) => ogrenciGeceIsle(tx, a, simdi));
    } catch (err) {
      hata ??= err instanceof Error ? err : new Error(String(err)); // bir ogrencinin hatasi digerlerini durdurmaz
    }
  }
  if (hata) throw hata;
  return { ogrenci: adaylar.length, gun };
}

// --- Risk ------------------------------------------------------------------------------------

interface RiskAdayi {
  kurum_id: string;
  ogrenci_id: string;
  saat_dilimi: string;
  kurum_durum: string;
  gun: string;
  gun_bitis_at: string;
}

async function ogrenciRiskIsle(tx: Islem, a: RiskAdayi, an: Date): Promise<boolean> {
  await ogrenciKilitle(tx, a.ogrenci_id);
  const ay = await seriAyarlariOku(tx);
  const s = await seriOku(tx, a.ogrenci_id);
  if (!s || s.mevcut_seri < 3 || a.kurum_durum !== 'aktif') return false;
  const aktifMi = await tx.execute(sql`
    select 1 from motivasyon.seri_gunleri
     where ogrenci_id = ${a.ogrenci_id} and gun = ${a.gun}::date and durum = 'aktif'`);
  if (aktifMi.length > 0) return false;
  if (gunTamam(await aktiviteOku(tx, a.ogrenci_id, a.gun), ay)) return false;
  if (!(await modulAcikMi(tx, { kurumId: a.kurum_id, ogrenciId: a.ogrenci_id, gun: a.gun })))
    return false;
  if (await duraklatmaVarMi(tx, a.ogrenci_id, a.gun)) return false;
  // Gun basina bir kez: sayac o gunun gun numarasini (1970-01-01'den beri) tutar; ilk yazan kazanir.
  const talep = await tx.execute(sql`
    insert into motivasyon.ogrenci_sayaclari (ogrenci_id, sayac_kodu, kurum_id, deger)
    values (${a.ogrenci_id}, ${SERI_RISK_SAYACI}, ${a.kurum_id}, (${a.gun}::date - date '1970-01-01'))
    on conflict (ogrenci_id, sayac_kodu) do update set deger = excluded.deger
      where motivasyon.ogrenci_sayaclari.deger < excluded.deger
    returning deger`);
  if (talep.length === 0) return false;
  await publishInTx(
    tx,
    motivasyonSeriRiskV1.create({
      kurumId: a.kurum_id,
      actor: SISTEM_AKTORU,
      correlationId: yeniId(),
      occurredAt: an,
      data: {
        ogrenci_id: a.ogrenci_id,
        mevcut_seri: s.mevcut_seri,
        gun_bitis_at: a.gun_bitis_at,
        dondurma_stogu: Math.min(2, Math.max(0, s.dondurma_stogu)),
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
  return true;
}

/**
 * Risk isi: her kurumun `seri.risk_saati`ndan (varsayilan 20:00) sonra, bugun henuz aktif olmayan ve
 * `mevcut_seri >= 3` ogrencilere gun basina bir kez `seri.risk` yayimlar (gun 04:00'e kadar surer).
 * Bildirim gonderimi `bildirim` servisindedir. Yayimlanan olay sayisini doner.
 */
export async function seriRiskIsi(
  d: IsBagimliliklari,
  simdi: Date = new Date(),
  filtre: IsFiltresi = {},
): Promise<number> {
  const an = simdi.toISOString();
  const ay = await seriAyarlariOku(d.db.orm);
  const adaylar = await d.db.orm.execute<RiskAdayi & Record<string, unknown>>(sql`
    select x.kurum_id, x.ogrenci_id, x.saat_dilimi, x.kurum_durum, x.gun::text as gun,
           to_char((((x.gun + 1)::timestamp + interval '4 hours') at time zone x.saat_dilimi) at time zone 'UTC',
                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as gun_bitis_at
      from (
        select s.kurum_id, s.ogrenci_id, s.mevcut_seri,
               coalesce(k.saat_dilimi, 'Europe/Istanbul') as saat_dilimi,
               coalesce(k.durum, 'aktif') as kurum_durum,
               ${kurumSaatiGun(an)} as gun,
               ((${an}::timestamptz at time zone coalesce(k.saat_dilimi, 'Europe/Istanbul')) - interval '4 hours')::time as kaydirilmis_saat
          from motivasyon.seriler s
          left join motivasyon.kurum_kopyalari k on k.kurum_id = s.kurum_id
         where s.mevcut_seri >= 3
           and not exists (select 1 from motivasyon.uyelik_kopyalari u
                            where u.uyelik_id = s.ogrenci_id and (u.rol <> 'ogrenci' or u.durum <> 'aktif'))
           and (${filtre.kurumId ?? null}::uuid is null or s.kurum_id = ${filtre.kurumId ?? null}::uuid)
      ) x
     where x.kaydirilmis_saat >= make_time(${ay.riskSaati - 4}, 0, 0)
       and not exists (select 1 from motivasyon.seri_gunleri g
                        where g.ogrenci_id = x.ogrenci_id and g.gun = x.gun and g.durum = 'aktif')
       and not exists (select 1 from motivasyon.ogrenci_sayaclari c
                        where c.ogrenci_id = x.ogrenci_id and c.sayac_kodu = ${SERI_RISK_SAYACI}
                          and c.deger >= (x.gun - date '1970-01-01'))
     order by x.kurum_id, x.ogrenci_id`);
  let n = 0;
  let hata: Error | undefined;
  for (const a of adaylar) {
    try {
      if (await d.db.orm.transaction((tx) => ogrenciRiskIsle(tx, a, simdi))) n++;
    } catch (err) {
      hata ??= err instanceof Error ? err : new Error(String(err));
    }
  }
  if (hata) throw hata;
  return n;
}
