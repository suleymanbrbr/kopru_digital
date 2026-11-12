import {
  motivasyonKarakterEvrildiV1,
  motivasyonRozetKazanildiV1,
  motivasyonSeviyeAtladiV1,
} from '@kopru/contracts';
import { publishInTx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { OUTBOX_TABLOSU, SISTEM_AKTORU, yeniId, type IsBaglami, type Islem } from './ortak.js';

/** XP kurali (`motivasyon.xp_kurallari`). */
export interface Kural {
  kod: string;
  olay_turu: string;
  kosul: Record<string, unknown>;
  xp: number;
  birim: string | null;
  olay_basi_ust_sinir: number | null;
  gec_carpani: number;
  tavan_grubu: string | null;
  genel_tavana_tabi: boolean;
  aktif: boolean;
}

export async function kuralGetir(tx: Islem, kod: string): Promise<Kural | null> {
  const [k] = await tx.execute<Kural & Record<string, unknown>>(sql`
    select kod, olay_turu, kosul, xp, birim, olay_basi_ust_sinir, gec_carpani::float8 as gec_carpani,
           tavan_grubu, genel_tavana_tabi, aktif
      from motivasyon.xp_kurallari where kod = ${kod}`);
  return k ?? null;
}

/** `{"durum": ["geldi","gec"]}`: her anahtar icin yuk degeri listede (ya da esit) olmali. */
export function kosulSaglanir(
  kosul: Record<string, unknown>,
  veri: Record<string, unknown>,
): boolean {
  return Object.entries(kosul).every(([anahtar, beklenen]) =>
    Array.isArray(beklenen) ? beklenen.includes(veri[anahtar]) : veri[anahtar] === beklenen,
  );
}

export async function ayarOku<T>(tx: Islem, anahtar: string, varsayilan: T): Promise<T> {
  const [a] = await tx.execute<{ deger: T }>(sql`
    select deger from motivasyon.motivasyon_ayarlari where anahtar = ${anahtar}`);
  return a ? a.deger : varsayilan;
}

// --- Sayaclar --------------------------------------------------------------------------------

/** Rozet sayacini `delta` kadar degistirir (en az 0); yeni degeri doner. */
export async function sayacArtir(
  tx: Islem,
  b: Pick<IsBaglami, 'kurumId' | 'ogrenciId'>,
  kod: string,
  delta: number,
): Promise<number> {
  const [s] = await tx.execute<{ deger: number }>(sql`
    insert into motivasyon.ogrenci_sayaclari (ogrenci_id, sayac_kodu, kurum_id, deger)
    values (${b.ogrenciId}, ${kod}, ${b.kurumId}, ${Math.max(delta, 0)})
    on conflict (ogrenci_id, sayac_kodu)
    do update set deger = greatest(0, motivasyon.ogrenci_sayaclari.deger + ${delta})
    returning deger::float8 as deger`);
  return s?.deger ?? 0;
}

/** Sayaci en az `deger` yapar (ornek `en_uzun_seri`; seri paketi kullanir). */
export async function sayacEnAz(
  tx: Islem,
  b: Pick<IsBaglami, 'kurumId' | 'ogrenciId'>,
  kod: string,
  deger: number,
): Promise<void> {
  await tx.execute(sql`
    insert into motivasyon.ogrenci_sayaclari (ogrenci_id, sayac_kodu, kurum_id, deger)
    values (${b.ogrenciId}, ${kod}, ${b.kurumId}, ${deger})
    on conflict (ogrenci_id, sayac_kodu)
    do update set deger = greatest(motivasyon.ogrenci_sayaclari.deger, ${deger})`);
}

/** Gunluk aktivite sayaclarini artirir/azaltir (en az 0); seri bu degerlerden hesaplanir. */
export async function aktiviteArtir(
  tx: Islem,
  b: Pick<IsBaglami, 'kurumId' | 'ogrenciId'>,
  gun: string,
  alan: 'plan_gorevi_sayisi' | 'odak_sn' | 'odev_teslim_sayisi' | 'soru_anladim_sayisi',
  delta: number,
): Promise<void> {
  const kolon = sql.identifier(alan);
  await tx.execute(sql`
    insert into motivasyon.ogrenci_gunluk_aktivite (ogrenci_id, gun, kurum_id, ${kolon})
    values (${b.ogrenciId}, ${gun}::date, ${b.kurumId}, ${Math.max(delta, 0)})
    on conflict (ogrenci_id, gun)
    do update set ${kolon} = greatest(0, motivasyon.ogrenci_gunluk_aktivite.${kolon} + ${delta})`);
}

// --- Ozne durumlari --------------------------------------------------------------------------

export interface OzneDurumu {
  surum: number;
  etkin: boolean;
  gun: string | null;
  etkin_at: string | null;
}

export async function ozneDurumuOku(
  tx: Islem,
  b: IsBaglami,
  kural: string,
  ozneId: string,
): Promise<(OzneDurumu & { son_olay_at: string }) | null> {
  const [d] = await tx.execute<OzneDurumu & { son_olay_at: string } & Record<string, unknown>>(sql`
    select surum::float8 as surum, etkin, gun::text as gun,
           to_char(etkin_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as etkin_at,
           to_char(son_olay_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as son_olay_at
      from motivasyon.xp_ozne_durumlari
     where ogrenci_id = ${b.ogrenciId} and kural_kodu = ${kural} and ozne_id = ${ozneId}`);
  return d ?? null;
}

export async function ozneDurumuYaz(
  tx: Islem,
  b: IsBaglami,
  kural: string,
  ozneId: string,
  yeni: { surum: number; etkin: boolean; etkinOnce: boolean },
): Promise<void> {
  // Etkinlige gecis: gun ve zaman yenilenir; etkinlikten cikista gun/etkin_at korunur (azaltma icin).
  const gecis = yeni.etkin && !yeni.etkinOnce;
  await tx.execute(sql`
    insert into motivasyon.xp_ozne_durumlari
      (ogrenci_id, kural_kodu, ozne_id, kurum_id, surum, etkin, gun, etkin_at, son_olay_at)
    values (${b.ogrenciId}, ${kural}, ${ozneId}, ${b.kurumId}, ${yeni.surum}, ${yeni.etkin},
            ${yeni.etkin ? b.gun : null}::date, ${yeni.etkin ? b.olusmaAt : null}::timestamptz,
            ${b.olusmaAt}::timestamptz)
    on conflict (ogrenci_id, kural_kodu, ozne_id) do update
      set surum = ${yeni.surum}, etkin = ${yeni.etkin},
          gun = case when ${gecis} then ${b.gun}::date else motivasyon.xp_ozne_durumlari.gun end,
          etkin_at = case when ${gecis} then ${b.olusmaAt}::timestamptz else motivasyon.xp_ozne_durumlari.etkin_at end,
          son_olay_at = ${b.olusmaAt}::timestamptz`);
}

/** Ozne icin ilk kez isleniyorsa true (tekrar, odul ve sayac suistimalini engeller). */
export async function ozneIlkKez(
  tx: Islem,
  b: IsBaglami,
  kural: string,
  ozneId: string,
): Promise<boolean> {
  const r = await tx.execute(sql`
    insert into motivasyon.xp_ozne_durumlari
      (ogrenci_id, kural_kodu, ozne_id, kurum_id, surum, etkin, gun, etkin_at, son_olay_at)
    values (${b.ogrenciId}, ${kural}, ${ozneId}, ${b.kurumId}, 0, true, ${b.gun}::date,
            ${b.olusmaAt}::timestamptz, ${b.olusmaAt}::timestamptz)
    on conflict do nothing returning ozne_id`);
  return r.length > 0;
}

// --- XP yazimi -------------------------------------------------------------------------------

export interface Kazanim {
  kural: Kural;
  /** `birim` kurallari (dakika, net) icin miktar; SQL numeric olarak hesaplanir. */
  miktar?: string | number;
  gec?: boolean;
  ozne?: { id: string; surum?: number };
  bransKodu?: string | null;
}

export interface KazanimSonucu {
  verilen: number;
  hareketId: string | null;
  seviyeAtladi: boolean;
  yeniRozetler: string[];
}

const BOS: KazanimSonucu = { verilen: 0, hareketId: null, seviyeAtladi: false, yeniRozetler: [] };

/**
 * XP kazanimi: kural degerini hesaplar, gunluk tavanlari uygular (ogrenci kilidi altinda; cagiran
 * `ogrenciKilitle` yapmis olmali), defteri yazar, ozeti/beceriyi gunceller, seviye, karakter ve kozmetik
 * degisimlerini olaylastirir. Ayni olay/ozne ikinci kez gelirse hicbir sey degismez.
 */
export async function xpKazan(tx: Islem, b: IsBaglami, k: Kazanim): Promise<KazanimSonucu> {
  const { kural } = k;
  if (!kural.aktif) return BOS;

  let ham: number;
  if (kural.birim) {
    const [h] = await tx.execute<{ xp: number }>(sql`
      select least(floor(${k.miktar ?? 0}::numeric * ${kural.xp}::numeric),
                   ${kural.olay_basi_ust_sinir ?? 2147483647}::numeric)::int as xp`);
    ham = h?.xp ?? 0;
  } else {
    ham = kural.olay_basi_ust_sinir ? Math.min(kural.xp, kural.olay_basi_ust_sinir) : kural.xp;
  }
  if (k.gec) ham = Math.floor(ham * kural.gec_carpani);
  if (ham <= 0) return BOS;

  // Tavan gruplari: kural grubu ve (tabiyse) genel.
  const gruplar = [kural.tavan_grubu, kural.genel_tavana_tabi ? 'genel' : null].filter(
    (g): g is string => g !== null,
  );
  let verilecek = ham;
  for (const g of gruplar) {
    await tx.execute(sql`
      insert into motivasyon.xp_gunluk_toplamlari (ogrenci_id, gun, tavan_grubu, kurum_id)
      values (${b.ogrenciId}, ${b.gun}::date, ${g}, ${b.kurumId}) on conflict do nothing`);
    const [t] = await tx.execute<{ kalan: number }>(sql`
      select (v.gunluk_ust_sinir - t.toplam) as kalan
        from motivasyon.xp_gunluk_toplamlari t
        join motivasyon.xp_tavanlari v on v.kod = t.tavan_grubu
       where t.ogrenci_id = ${b.ogrenciId} and t.gun = ${b.gun}::date and t.tavan_grubu = ${g}
         for update of t`);
    verilecek = Math.min(verilecek, Math.max(t?.kalan ?? 0, 0));
  }
  if (verilecek <= 0) return BOS;

  const hareketId = yeniId();
  const eklenen = await tx.execute(sql`
    insert into motivasyon.xp_hareketleri
      (id, kurum_id, ogrenci_id, kural_kodu, kaynak_olay_id, kaynak_ozne_id, kaynak_ozne_surumu,
       brans_kodu, xp, gun, olusma_at, kismi)
    values (${hareketId}, ${b.kurumId}, ${b.ogrenciId}, ${kural.kod}, ${b.olayId},
            ${k.ozne?.id ?? null}, ${k.ozne?.surum ?? 0}, ${k.bransKodu ?? null}, ${verilecek},
            ${b.gun}::date, ${b.olusmaAt}::timestamptz, ${verilecek < ham})
    on conflict do nothing returning id`);
  if (eklenen.length === 0) return BOS; // ayni olay ya da ayni ozne: XP yok

  for (const g of gruplar) {
    await tx.execute(sql`
      update motivasyon.xp_gunluk_toplamlari set toplam = toplam + ${verilecek}
       where ogrenci_id = ${b.ogrenciId} and gun = ${b.gun}::date and tavan_grubu = ${g}`);
  }
  await tx.execute(sql`
    update motivasyon.ogrenci_durumlari set
      toplam_xp = toplam_xp + ${verilecek},
      bu_hafta_xp = case when hafta_baslangic is null or hafta_baslangic < ${b.hafta}::date then ${verilecek}
                         when hafta_baslangic = ${b.hafta}::date then bu_hafta_xp + ${verilecek}
                         else bu_hafta_xp end,
      hafta_baslangic = greatest(hafta_baslangic, ${b.hafta}::date),
      son_aktivite_gun = greatest(son_aktivite_gun, ${b.gun}::date)
     where kurum_id = ${b.kurumId} and ogrenci_id = ${b.ogrenciId}`);
  await beceriGuncelle(tx, b, k.bransKodu ?? null, verilecek);

  const sonuc = await seviyeKontrol(tx, b);
  return { verilen: verilecek, hareketId, ...sonuc, yeniRozetler: [] };
}

async function beceriGuncelle(
  tx: Islem,
  b: Pick<IsBaglami, 'kurumId' | 'ogrenciId'>,
  bransKodu: string | null,
  delta: number,
): Promise<void> {
  if (!bransKodu) return;
  const [e] = await tx.execute<{ beceri_kodu: string }>(sql`
    select beceri_kodu from motivasyon.brans_beceri_eslemesi where brans_kodu = ${bransKodu}`);
  if (!e) return;
  await tx.execute(sql`
    insert into motivasyon.beceri_puanlari (ogrenci_id, beceri_kodu, kurum_id, puan)
    values (${b.ogrenciId}, ${e.beceri_kodu}, ${b.kurumId}, ${Math.max(delta, 0)})
    on conflict (ogrenci_id, beceri_kodu)
    do update set puan = greatest(0, motivasyon.beceri_puanlari.puan + ${delta})`);
}

/** Ters cevrilmemis, en yeni pozitif kazanim (ozne icin); yoksa null. */
export async function aktifKazanim(
  tx: Islem,
  b: IsBaglami,
  kuralKodu: string,
  ozneId: string,
): Promise<{ id: string; xp: number; gun: string; brans_kodu: string | null } | null> {
  const [x] = await tx.execute<{
    id: string;
    xp: number;
    gun: string;
    brans_kodu: string | null;
  }>(sql`
    select x.id, x.xp, x.gun::text as gun, x.brans_kodu
      from motivasyon.xp_hareketleri x
     where x.ogrenci_id = ${b.ogrenciId} and x.kural_kodu = ${kuralKodu}
       and x.kaynak_ozne_id = ${ozneId} and x.xp > 0
       and not exists (select 1 from motivasyon.xp_hareketleri r where r.ters_cevrilen_id = x.id)
     order by x.created_at desc, x.id desc limit 1`);
  return x ?? null;
}

/**
 * Ters kayit: kazanimi negatif bir satirla geri alir (`ters_cevrilen_id`), orijinal gunun tavan
 * sayaclarindan ayni miktari dusurur (en az 0), toplam XP ve beceriyi azaltir. Seviye ve karakter asamasi
 * geri dusmez.
 */
export async function xpTersCevir(
  tx: Islem,
  b: IsBaglami,
  kural: Kural,
  kazanim: { id: string; xp: number; gun: string; brans_kodu: string | null },
  ozne: { id: string; surum: number },
  neden: string,
): Promise<void> {
  const eklenen = await tx.execute(sql`
    insert into motivasyon.xp_hareketleri
      (id, kurum_id, ogrenci_id, kural_kodu, kaynak_olay_id, kaynak_ozne_id, kaynak_ozne_surumu,
       brans_kodu, xp, gun, olusma_at, ters_cevrilen_id, neden)
    values (${yeniId()}, ${b.kurumId}, ${b.ogrenciId}, ${kural.kod}, ${b.olayId}, ${ozne.id}, ${ozne.surum},
            ${kazanim.brans_kodu}, ${-kazanim.xp}, ${kazanim.gun}::date, ${b.olusmaAt}::timestamptz,
            ${kazanim.id}, ${neden})
    on conflict do nothing returning id`);
  if (eklenen.length === 0) return;
  const gruplar = [kural.tavan_grubu, kural.genel_tavana_tabi ? 'genel' : null].filter(
    (g): g is string => g !== null,
  );
  for (const g of gruplar) {
    await tx.execute(sql`
      update motivasyon.xp_gunluk_toplamlari set toplam = greatest(0, toplam - ${kazanim.xp})
       where ogrenci_id = ${b.ogrenciId} and gun = ${kazanim.gun}::date and tavan_grubu = ${g}`);
  }
  await tx.execute(sql`
    update motivasyon.ogrenci_durumlari set
      toplam_xp = toplam_xp - ${kazanim.xp},
      bu_hafta_xp = case when hafta_baslangic = date_trunc('week', ${kazanim.gun}::date)::date
                         then greatest(0, bu_hafta_xp - ${kazanim.xp}) else bu_hafta_xp end
     where kurum_id = ${b.kurumId} and ogrenci_id = ${b.ogrenciId}`);
  await beceriGuncelle(tx, b, kazanim.brans_kodu, -kazanim.xp);
}

// --- Seviye, karakter, rozet, kozmetik -------------------------------------------------------

/**
 * Toplam XP'ye gore seviyeyi yukseltir (asla dusurmez) ve `seviye.atladi` ile, karakter varsa asama
 * degisirse `karakter.evrildi` olaylarini ayni islemde yazar. Seviye atlamissa kozmetikleri acar.
 */
export async function seviyeKontrol(tx: Islem, b: IsBaglami): Promise<{ seviyeAtladi: boolean }> {
  const [d] = await tx.execute<{ seviye: number; toplam_xp: number; hedef: number }>(sql`
    select d.seviye, d.toplam_xp::float8 as toplam_xp,
           coalesce((select max(s.seviye) from motivasyon.seviyeler s
                      where s.gereken_toplam_xp <= d.toplam_xp), 1) as hedef
      from motivasyon.ogrenci_durumlari d
     where d.kurum_id = ${b.kurumId} and d.ogrenci_id = ${b.ogrenciId}`);
  if (!d) return { seviyeAtladi: false };
  let seviye = d.seviye;
  let atladi = false;
  if (d.hedef > d.seviye) {
    await tx.execute(sql`
      update motivasyon.ogrenci_durumlari set seviye = ${d.hedef}
       where kurum_id = ${b.kurumId} and ogrenci_id = ${b.ogrenciId}`);
    await publishInTx(
      tx,
      motivasyonSeviyeAtladiV1.create({
        kurumId: b.kurumId,
        actor: SISTEM_AKTORU,
        correlationId: b.olayId,
        data: {
          ogrenci_id: b.ogrenciId,
          eski_seviye: d.seviye,
          yeni_seviye: d.hedef,
          toplam_xp: d.toplam_xp,
        },
      }),
      { table: OUTBOX_TABLOSU },
    );
    seviye = d.hedef;
    atladi = true;
  }
  await karakterKontrol(tx, b, seviye);
  if (atladi) await kozmetikleriAc(tx, b);
  return { seviyeAtladi: atladi };
}

async function karakterKontrol(tx: Islem, b: IsBaglami, seviye: number): Promise<void> {
  const [k] = await tx.execute<{ tur_kodu: string; asama: number; hedef: number }>(sql`
    select c.tur_kodu, c.asama,
           coalesce((select max(a.asama) from motivasyon.karakter_asamalari a
                      where a.tur_kodu = c.tur_kodu and a.gereken_seviye <= ${seviye}), 1) as hedef
      from motivasyon.ogrenci_karakterleri c
     where c.kurum_id = ${b.kurumId} and c.ogrenci_id = ${b.ogrenciId}`);
  if (!k || k.hedef <= k.asama) return;
  await tx.execute(sql`
    update motivasyon.ogrenci_karakterleri set asama = ${k.hedef}
     where kurum_id = ${b.kurumId} and ogrenci_id = ${b.ogrenciId}`);
  await publishInTx(
    tx,
    motivasyonKarakterEvrildiV1.create({
      kurumId: b.kurumId,
      actor: SISTEM_AKTORU,
      correlationId: b.olayId,
      data: {
        ogrenci_id: b.ogrenciId,
        tur_kodu: k.tur_kodu,
        eski_asama: k.asama,
        yeni_asama: k.hedef,
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
}

/**
 * Verilen sayaclarin esigini gecen rozetleri bir kez kazandirir (`motivasyon.rozet.kazanildi.v1`) ve
 * yeni rozet varsa kozmetikleri acar. Yeni rozet kodlarini doner.
 */
export async function rozetleriDegerlendir(
  tx: Islem,
  b: IsBaglami,
  sayacKodlari: readonly string[],
  zaman: string = b.olusmaAt,
): Promise<string[]> {
  if (sayacKodlari.length === 0) return [];
  const adaylar = await tx.execute<{ kod: string }>(sql`
    select r.kod
      from motivasyon.rozet_tanimlari r
      join motivasyon.ogrenci_sayaclari s on s.sayac_kodu = r.sayac_kodu and s.ogrenci_id = ${b.ogrenciId}
     where r.aktif and s.deger >= r.esik
       and r.sayac_kodu in (${sql.join(
         sayacKodlari.map((k) => sql`${k}`),
         sql`, `,
       )})
       and not exists (select 1 from motivasyon.ogrenci_rozetleri o
                        where o.ogrenci_id = ${b.ogrenciId} and o.rozet_kodu = r.kod)
     order by r.sira`);
  const yeni: string[] = [];
  for (const a of adaylar) {
    const [e] = await tx.execute<{ kazanildi_at: string }>(sql`
      insert into motivasyon.ogrenci_rozetleri (id, kurum_id, ogrenci_id, rozet_kodu, kazanildi_at, kaynak_olay_id)
      values (${yeniId()}, ${b.kurumId}, ${b.ogrenciId}, ${a.kod}, ${zaman}::timestamptz, ${b.olayId})
      on conflict (ogrenci_id, rozet_kodu) do nothing
      returning to_char(kazanildi_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as kazanildi_at`);
    if (!e) continue;
    yeni.push(a.kod);
    await publishInTx(
      tx,
      motivasyonRozetKazanildiV1.create({
        kurumId: b.kurumId,
        actor: SISTEM_AKTORU,
        correlationId: b.olayId,
        data: { ogrenci_id: b.ogrenciId, rozet_kodu: a.kod, kazanildi_at: e.kazanildi_at },
      }),
      { table: OUTBOX_TABLOSU },
    );
  }
  if (yeni.length > 0) await kozmetikleriAc(tx, b);
  return yeni;
}

/** Kosulu saglanan (rozet / seviye / seri) kozmetikleri acar; acilan kodlari doner. */
export async function kozmetikleriAc(tx: Islem, b: IsBaglami): Promise<string[]> {
  const adaylar = await tx.execute<{ kod: string }>(sql`
    select k.kod
      from motivasyon.kozmetik_tanimlari k
     where k.aktif
       and not exists (select 1 from motivasyon.ogrenci_kozmetikleri o
                        where o.ogrenci_id = ${b.ogrenciId} and o.kozmetik_kodu = k.kod)
       and (
         (k.acilma_kosulu ? 'rozet' and exists (
            select 1 from motivasyon.ogrenci_rozetleri r
             where r.ogrenci_id = ${b.ogrenciId} and r.rozet_kodu = k.acilma_kosulu->>'rozet'))
         or (k.acilma_kosulu ? 'seviye' and coalesce((
            select d.seviye from motivasyon.ogrenci_durumlari d
             where d.kurum_id = ${b.kurumId} and d.ogrenci_id = ${b.ogrenciId}), 1)
            >= (k.acilma_kosulu->>'seviye')::int)
         or (k.acilma_kosulu ? 'seri' and coalesce((
            select s.en_uzun_seri from motivasyon.seriler s
             where s.kurum_id = ${b.kurumId} and s.ogrenci_id = ${b.ogrenciId}), 0)
            >= (k.acilma_kosulu->>'seri')::int))`);
  const acilan: string[] = [];
  for (const a of adaylar) {
    const e = await tx.execute(sql`
      insert into motivasyon.ogrenci_kozmetikleri (id, kurum_id, ogrenci_id, kozmetik_kodu, kaynak_olay_id)
      values (${yeniId()}, ${b.kurumId}, ${b.ogrenciId}, ${a.kod}, ${b.olayId})
      on conflict (ogrenci_id, kozmetik_kodu) do nothing returning id`);
    if (e.length > 0) acilan.push(a.kod);
  }
  return acilan;
}
