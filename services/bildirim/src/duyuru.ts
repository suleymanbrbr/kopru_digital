import {
  errorCodes,
  izinVarMi,
  type DuyuruAliciRol,
  type DuyuruDurum,
  type DuyuruHedefTuru,
  type Rol,
} from '@kopru/contracts';
import { AppError } from '@kopru/service-kit';
import { sql, type SQL } from 'drizzle-orm';

import { DUYURU_SABLON_KODU } from './duyuru-sablonlari.js';
import { iso, yeniId, VARSAYILAN_SAAT_DILIMI, type Islem } from './ortak.js';
import { sablonlar, yalnizKutuSablonlari } from './sablonlar.js';
import { bildirimUret } from './uretim.js';

/**
 * Duyuru alan mantigi (docs/schema/bildirim.md "Duyurular"): yetki, modul denetimi, alici cozumu, yayin
 * (tek islemde alici satirlari), kutu bildirimi dagitimi, okundu sayaci ve sonradan katilan uye.
 *
 * Yayinda `duyuru_alicilari` satirlari her zaman tek islemde yazilir (hizli, toplu). Kutu bildirimi
 * (`bildirimUret`, alici basina ~7 sorgu) hedef kucukse ayni islemde, buyukse worker'daki dagitim isinde
 * partiler halinde uretilir (`dagitim_tamam_at`).
 */

/** `duyuru_alicilari` toplu yazim parti boyu (dokuman: 500). */
export const ALICI_PARTI = 500;
/** Kutu bildirimi dagitim parti boyu (bir islemde). */
export const DAGITIM_PARTI = 200;
/** Bu sayiya kadar olan hedeflerin kutu bildirimi yayin isteginde uretilir; fazlasi worker'a birakilir. */
export const SENKRON_DAGITIM_ESIGI = 300;
/** Sonradan katilan uye yalniz son bu kadar gun icinde yayinlanan (sabit degilse) duyurulari alir. */
export const SONRADAN_KATILAN_GUN = 14;

export interface DuyuruKimligi {
  kurumId: string;
  uyelikId: string;
  rol: Rol;
}

export interface DuyuruSatiri extends Record<string, unknown> {
  id: string;
  baslik: string;
  govde: string;
  hedef_turu: DuyuruHedefTuru;
  hedef_id: string;
  hedef_roller: DuyuruAliciRol[];
  yazar_id: string;
  durum: DuyuruDurum;
  yayin_at: string | null;
  bitis_at: string | null;
  sabit: boolean;
  push_gonderildi: boolean;
  alici_sayisi: number;
  okunan_sayisi: number;
  dagitim_tamam: boolean;
  created_at: string;
  updated_at: string;
}

/** Tek tablo (alias'siz) secimi. */
export const DUYURU_KOLONLARI = sql`
  id, baslik, govde, hedef_turu, hedef_id, hedef_roller, yazar_id, durum,
  ${iso('yayin_at')} as yayin_at, ${iso('bitis_at')} as bitis_at, sabit, push_gonderildi,
  alici_sayisi, okunan_sayisi, (dagitim_tamam_at is not null) as dagitim_tamam,
  ${iso('created_at')} as created_at, ${iso('updated_at')} as updated_at`;

export const tekilAnahtar = (duyuruId: string) => `${DUYURU_SABLON_KODU}:${duyuruId}`;

export const yoneticiMi = (rol: Rol) => rol === 'sahip' || rol === 'yonetici';

const metinListesi = (d: readonly string[]) =>
  sql.join(
    d.map((x) => sql`${x}`),
    sql`, `,
  );

const bulunamadi = () => new AppError(404, errorCodes.notFound, 'Duyuru bulunamadı.');

// --- Yetki ve hedef -----------------------------------------------------------------------------

/** Kurum saat dilimine gore bugunun tarihi (`YYYY-MM-DD`). */
export async function kurumBugunu(tx: Islem, kurumId: string, simdi: Date): Promise<string> {
  const [k] = await tx.execute<{ saat_dilimi: string }>(sql`
    select saat_dilimi from bildirim.kurum_kopyalari where kurum_id = ${kurumId}`);
  const [t] = await tx.execute<{ gun: string }>(sql`
    select ((${simdi.toISOString()}::timestamptz at time zone ${k?.saat_dilimi ?? VARSAYILAN_SAAT_DILIMI})::date)::text as gun`);
  if (!t) throw new Error('gun hesaplanamadi');
  return t.gun;
}

/** Hedef var ve kullanilabilir mi (kurumun grubu/kademesi, arsivde degil). */
export async function hedefiDogrula(
  tx: Islem,
  kurumId: string,
  hedefTuru: DuyuruHedefTuru,
  hedefId: string,
): Promise<void> {
  if (hedefTuru === 'kurum') {
    if (hedefId !== kurumId) {
      throw new AppError(
        400,
        errorCodes.validation,
        'Kurum hedefi için hedef_id kurum kimliği olmalı.',
      );
    }
    return;
  }
  const [v] =
    hedefTuru === 'grup'
      ? await tx.execute<{ n: number }>(sql`
          select count(*)::int n from bildirim.grup_kopyalari
           where kurum_id = ${kurumId} and grup_id = ${hedefId} and durum = 'aktif'`)
      : await tx.execute<{ n: number }>(sql`
          select count(*)::int n from bildirim.kademe_kopyalari
           where kurum_id = ${kurumId} and kademe_id = ${hedefId} and not arsivlendi`);
  if (!v?.n) {
    throw new AppError(
      404,
      errorCodes.notFound,
      hedefTuru === 'grup' ? 'Hedef grup bulunamadı.' : 'Hedef kademe bulunamadı.',
    );
  }
}

/**
 * Yazma yetkisi: `duyuru.yaz` izni (rol kapsami), yonetici/sahip her hedefe; ogretmen yalniz etkin ataması
 * olan gruplara (`atama_kopyalari`).
 */
export async function hedefYetkisi(
  tx: Islem,
  k: DuyuruKimligi,
  hedefTuru: DuyuruHedefTuru,
  hedefId: string,
  bugun: string,
): Promise<void> {
  if (!izinVarMi(k.rol, 'duyuru.yaz', 'grup')) {
    throw new AppError(403, errorCodes.izinYok, 'Duyuru yazma yetkiniz yok.');
  }
  if (yoneticiMi(k.rol)) return;
  if (hedefTuru !== 'grup') {
    throw new AppError(
      403,
      errorCodes.forbidden,
      'Öğretmen yalnız atandığı gruplara duyuru yapabilir.',
    );
  }
  const [a] = await tx.execute<{ n: number }>(sql`
    select count(*)::int n from bildirim.atama_kopyalari
     where kurum_id = ${k.kurumId} and grup_id = ${hedefId} and ogretmen_id = ${k.uyelikId}
       and baslangic_tarihi <= ${bugun}::date and (bitis_tarihi is null or bitis_tarihi >= ${bugun}::date)`);
  if (!a?.n) {
    throw new AppError(403, errorCodes.forbidden, 'Bu gruba duyuru yapma yetkiniz yok.');
  }
}

/**
 * `duyuru` modulu bu hedef icin acik mi? Kurum > kademe > grup (ADR 0004): her duzey izin veriyorsa acik;
 * kayit yoksa varsayilan acik.
 */
export async function duyuruModuluAcikMi(
  tx: Islem,
  kurumId: string,
  hedefTuru: DuyuruHedefTuru,
  hedefId: string,
): Promise<boolean> {
  const ayarlar = await tx.execute<{ kapsam: string; kapsam_id: string; acik: boolean }>(sql`
    select kapsam, kapsam_id, acik from bildirim.modul_ayari_kopyalari
     where kurum_id = ${kurumId} and modul_kodu = 'duyuru'`);
  const kapali = (kapsam: string, id: string | null | undefined) =>
    id != null && ayarlar.some((a) => a.kapsam === kapsam && a.kapsam_id === id && !a.acik);
  if (kapali('kurum', kurumId)) return false;
  if (hedefTuru === 'kademe') return !kapali('kademe', hedefId);
  if (hedefTuru === 'grup') {
    const [g] = await tx.execute<{ kademe_id: string | null }>(sql`
      select kademe_id from bildirim.grup_kopyalari where kurum_id = ${kurumId} and grup_id = ${hedefId}`);
    return !kapali('grup', hedefId) && !kapali('kademe', g?.kademe_id);
  }
  return true;
}

/** Duyuruyu kilitleyerek okur (`for update`); yok ya da silinmisse 404. */
export async function duyuruKilitle(
  tx: Islem,
  kurumId: string,
  duyuruId: string,
): Promise<DuyuruSatiri> {
  const [d] = await tx.execute<DuyuruSatiri>(sql`
    select ${DUYURU_KOLONLARI} from bildirim.duyurular
     where kurum_id = ${kurumId} and id = ${duyuruId} and silindi_at is null for update`);
  if (!d) throw bulunamadi();
  return d;
}

/** Yazar degilse ogretmen baskasinin duyurusunu yonetemez (varligi da gizlenir). */
export function yonetebilirMi(k: DuyuruKimligi, d: Pick<DuyuruSatiri, 'yazar_id'>): boolean {
  return yoneticiMi(k.rol) || d.yazar_id === k.uyelikId;
}

// --- Alici cozumu -------------------------------------------------------------------------------

/**
 * Hedefin etkin alici uyelikleri (`hedef_roller` suzgeciyle, yazar haric). `grup`: etkin grup uyeleri
 * (ogrenci) ve/veya etkin atamasi olan ogretmenler; `kademe`: `uyelik_kopyalari.kademe_id`; `kurum`: tum
 * etkin uyelikler.
 */
export async function aliciCoz(
  tx: Islem,
  d: Pick<DuyuruSatiri, 'hedef_turu' | 'hedef_id' | 'hedef_roller' | 'yazar_id'>,
  kurumId: string,
  bugun: string,
): Promise<string[]> {
  const roller = metinListesi(d.hedef_roller);
  let satirlar: { id: string }[];
  if (d.hedef_turu === 'grup') {
    const parcalar: SQL[] = [];
    if (d.hedef_roller.includes('ogrenci')) {
      parcalar.push(sql`
        select u.uyelik_id as id
          from bildirim.grup_uyesi_kopyalari m
          join bildirim.uyelik_kopyalari u on u.uyelik_id = m.ogrenci_id and u.kurum_id = m.kurum_id
         where m.kurum_id = ${kurumId} and m.grup_id = ${d.hedef_id}
           and m.baslangic_tarihi <= ${bugun}::date and (m.bitis_tarihi is null or m.bitis_tarihi >= ${bugun}::date)
           and u.durum = 'aktif' and u.rol = 'ogrenci'`);
    }
    if (d.hedef_roller.includes('ogretmen')) {
      parcalar.push(sql`
        select u.uyelik_id as id
          from bildirim.atama_kopyalari a
          join bildirim.uyelik_kopyalari u on u.uyelik_id = a.ogretmen_id and u.kurum_id = a.kurum_id
         where a.kurum_id = ${kurumId} and a.grup_id = ${d.hedef_id}
           and a.baslangic_tarihi <= ${bugun}::date and (a.bitis_tarihi is null or a.bitis_tarihi >= ${bugun}::date)
           and u.durum = 'aktif' and u.rol = 'ogretmen'`);
    }
    if (parcalar.length === 0) return [];
    satirlar = await tx.execute<{ id: string }>(
      sql`select distinct id from (${sql.join(parcalar, sql` union all `)}) x where id <> ${d.yazar_id} order by id`,
    );
  } else if (d.hedef_turu === 'kademe') {
    satirlar = await tx.execute<{ id: string }>(sql`
      select uyelik_id as id from bildirim.uyelik_kopyalari
       where kurum_id = ${kurumId} and kademe_id = ${d.hedef_id} and durum = 'aktif'
         and rol in (${roller}) and uyelik_id <> ${d.yazar_id} order by uyelik_id`);
  } else {
    satirlar = await tx.execute<{ id: string }>(sql`
      select uyelik_id as id from bildirim.uyelik_kopyalari
       where kurum_id = ${kurumId} and durum = 'aktif'
         and rol in (${roller}) and uyelik_id <> ${d.yazar_id} order by uyelik_id`);
  }
  return satirlar.map((s) => s.id);
}

// --- Yayin ve dagitim ---------------------------------------------------------------------------

export interface YayinSonucu {
  duyuru: DuyuruSatiri;
  /** Alici satirlarini yazma suresi (ms). */
  aliciYazmaMs: number;
  /** Yayin isteginde uretilen kutu bildirimi sayisi (buyuk hedeflerde 0: worker). */
  senkronDagitilan: number;
}

/**
 * Taslagi yayinlar: yetki, hedef ve modul denetimi, alici cozumu, `duyuru_alicilari` (500'luk gruplar,
 * `ON CONFLICT DO NOTHING`), `alici_sayisi`; kucuk hedefte kutu bildirimi ayni islemde uretilir.
 */
export async function duyuruYayinla(
  tx: Islem,
  k: DuyuruKimligi,
  duyuruId: string,
  simdi: Date,
  senkronEsik = SENKRON_DAGITIM_ESIGI,
): Promise<YayinSonucu> {
  const d = await duyuruKilitle(tx, k.kurumId, duyuruId);
  if (!yonetebilirMi(k, d)) throw bulunamadi();
  if (d.durum !== 'taslak') {
    throw new AppError(409, errorCodes.conflict, 'Duyuru zaten yayınlanmış.');
  }
  if (d.bitis_at && new Date(d.bitis_at).getTime() <= simdi.getTime()) {
    throw new AppError(400, errorCodes.validation, 'Bitiş zamanı geçmişte olamaz.');
  }
  const bugun = await kurumBugunu(tx, k.kurumId, simdi);
  await hedefYetkisi(tx, k, d.hedef_turu, d.hedef_id, bugun);
  await hedefiDogrula(tx, k.kurumId, d.hedef_turu, d.hedef_id);
  if (!(await duyuruModuluAcikMi(tx, k.kurumId, d.hedef_turu, d.hedef_id))) {
    throw new AppError(403, errorCodes.modulKapali, 'Duyuru özelliği bu hedefte kapalı.');
  }

  const baslangic = performance.now();
  const alicilar = await aliciCoz(tx, d, k.kurumId, bugun);
  for (let i = 0; i < alicilar.length; i += ALICI_PARTI) {
    const parti = alicilar.slice(i, i + ALICI_PARTI);
    await tx.execute(sql`
      insert into bildirim.duyuru_alicilari (id, kurum_id, duyuru_id, alici_id)
      values ${sql.join(
        parti.map((a) => sql`(${yeniId()}, ${k.kurumId}, ${d.id}, ${a})`),
        sql`, `,
      )}
      on conflict (duyuru_id, alici_id) do nothing`);
  }
  const aliciYazmaMs = performance.now() - baslangic;
  const kucuk = alicilar.length <= senkronEsik;
  await tx.execute(sql`
    update bildirim.duyurular
       set durum = 'yayinda', yayin_at = ${simdi.toISOString()}::timestamptz, alici_sayisi = ${alicilar.length},
           dagitim_tamam_at = ${kucuk ? simdi.toISOString() : null}::timestamptz
     where kurum_id = ${k.kurumId} and id = ${d.id}`);

  let senkronDagitilan = 0;
  if (kucuk) {
    const g = await dagitimPartisi(tx, k.kurumId, d, simdi, null, alicilar.length);
    senkronDagitilan = g.islenen;
  }
  const [son] = await tx.execute<DuyuruSatiri>(sql`
    select ${DUYURU_KOLONLARI} from bildirim.duyurular where kurum_id = ${k.kurumId} and id = ${d.id}`);
  if (!son) throw bulunamadi();
  return { duyuru: son, aliciYazmaMs, senkronDagitilan };
}

/**
 * Bir partilik kutu bildirimi uretir: henuz bildirimi olmayan alicilar, `sonAliciId`den buyuk olanlar
 * (anahtarli sayfalama; uyeligi artik aktif olmayan alici donguyu tikamaz). Idempotent (`tekilAnahtar`).
 */
export async function dagitimPartisi(
  tx: Islem,
  kurumId: string,
  d: Pick<DuyuruSatiri, 'id' | 'baslik' | 'bitis_at' | 'push_gonderildi'>,
  simdi: Date,
  sonAliciId: string | null,
  parti = DAGITIM_PARTI,
): Promise<{ islenen: number; sonAliciId: string | null }> {
  const anahtar = tekilAnahtar(d.id);
  const adaylar = await tx.execute<{ alici_id: string }>(sql`
    select a.alici_id from bildirim.duyuru_alicilari a
     where a.kurum_id = ${kurumId} and a.duyuru_id = ${d.id}
       and a.alici_id > ${sonAliciId ?? '00000000-0000-0000-0000-000000000000'}::uuid
       and not exists (select 1 from bildirim.bildirimler b
                        where b.kurum_id = a.kurum_id and b.alici_id = a.alici_id and b.tekil_anahtar = ${anahtar})
     order by a.alici_id limit ${parti}`);
  if (adaylar.length === 0) return { islenen: 0, sonAliciId };
  await duyuruBildirimiUret(
    tx,
    kurumId,
    d,
    adaylar.map((a) => a.alici_id),
    simdi,
  );
  return {
    islenen: adaylar.length,
    sonAliciId: adaylar[adaylar.length - 1]?.alici_id ?? sonAliciId,
  };
}

async function duyuruBildirimiUret(
  tx: Islem,
  kurumId: string,
  d: Pick<DuyuruSatiri, 'id' | 'baslik' | 'bitis_at' | 'push_gonderildi'>,
  aliciIdleri: string[],
  simdi: Date,
  pushVar = d.push_gonderildi,
): Promise<void> {
  const [k] = await tx.execute<{ ad: string }>(sql`
    select ad from bildirim.kurum_kopyalari where kurum_id = ${kurumId}`);
  await bildirimUret(
    tx,
    {
      kurumId,
      aliciUyelikIdleri: aliciIdleri,
      sablonKodu: DUYURU_SABLON_KODU,
      degiskenler: { duyuru_baslik: d.baslik, duyuru_id: d.id, kurum: k?.ad ?? 'Kurumun' },
      veri: { duyuru_id: d.id },
      kaynakOlayId: d.id,
      tekilAnahtar: tekilAnahtar(d.id),
      ...(d.bitis_at ? { gecerlilikBitisAt: new Date(d.bitis_at) } : {}),
    },
    { simdi, sablonlar: pushVar ? sablonlar : yalnizKutuSablonlari },
  );
}

/** Dagitim bekleyen yayindaki duyurular (worker; `bildirim_sistem` ile okunur). */
export async function dagitimBekleyenler(
  tx: Islem,
  limit = 10,
): Promise<{ kurum_id: string; id: string }[]> {
  return tx.execute<{ kurum_id: string; id: string }>(sql`
    select kurum_id, id from bildirim.duyurular
     where durum = 'yayinda' and dagitim_tamam_at is null and silindi_at is null
     order by yayin_at limit ${limit}`);
}

export async function dagitimiBitir(tx: Islem, kurumId: string, duyuruId: string, simdi: Date) {
  await tx.execute(sql`
    update bildirim.duyurular set dagitim_tamam_at = ${simdi.toISOString()}::timestamptz
     where kurum_id = ${kurumId} and id = ${duyuruId} and dagitim_tamam_at is null`);
}

/** Dagitim isi icin duyuruyu (silinmemis, yayinda) okur; yoksa `null`. */
export async function dagitilacakDuyuru(
  tx: Islem,
  kurumId: string,
  duyuruId: string,
): Promise<DuyuruSatiri | null> {
  const [d] = await tx.execute<DuyuruSatiri>(sql`
    select ${DUYURU_KOLONLARI} from bildirim.duyurular
     where kurum_id = ${kurumId} and id = ${duyuruId} and durum = 'yayinda' and silindi_at is null`);
  return d ?? null;
}

// --- Kutu bildirimi omru ------------------------------------------------------------------------

/**
 * Duyurunun kutu bildirimlerinin gecerlilik bitisini ayarlar: arsiv/silme icin simdi (gizler), bitis
 * guncellemesinde yeni bitis (ya da `null`: kaldir).
 */
export async function kutuGecerliligiAyarla(
  tx: Islem,
  kurumId: string,
  duyuruId: string,
  bitis: Date | null,
): Promise<void> {
  await tx.execute(sql`
    update bildirim.bildirimler b set gecerlilik_bitis_at = ${bitis ? bitis.toISOString() : null}::timestamptz
      from bildirim.duyuru_alicilari a
     where a.kurum_id = ${kurumId} and a.duyuru_id = ${duyuruId}
       and b.kurum_id = a.kurum_id and b.alici_id = a.alici_id and b.tekil_anahtar = ${tekilAnahtar(duyuruId)}`);
}

// --- Okundu -------------------------------------------------------------------------------------

/**
 * Alici duyuruyu okudu: `okundu_at` yalniz ilk seferde dolar ve yalniz o zaman `okunan_sayisi` artar (tekrar
 * okuma ve eszamanli istekler sayaci artirmaz: `okundu_at is null` kosullu guncelleme satir kilidiyle
 * serilesir). Ayni duyurunun kutu bildirimi de okundu olur. Aliciya ait degilse 404.
 */
export async function okunduIsaretle(
  tx: Islem,
  k: DuyuruKimligi,
  duyuruId: string,
  simdi: Date,
): Promise<string> {
  const an = simdi.toISOString();
  const [gecerli] = await tx.execute<{ id: string }>(sql`
    select a.id from bildirim.duyuru_alicilari a
      join bildirim.duyurular d on d.kurum_id = a.kurum_id and d.id = a.duyuru_id
     where a.kurum_id = ${k.kurumId} and a.duyuru_id = ${duyuruId} and a.alici_id = ${k.uyelikId}
       and d.durum = 'yayinda' and d.silindi_at is null`);
  if (!gecerli) throw bulunamadi();

  const ilk = await tx.execute(sql`
    update bildirim.duyuru_alicilari set okundu_at = ${an}::timestamptz
     where kurum_id = ${k.kurumId} and duyuru_id = ${duyuruId} and alici_id = ${k.uyelikId} and okundu_at is null
    returning 1`);
  if (ilk.length === 1) {
    await tx.execute(sql`
      update bildirim.duyurular set okunan_sayisi = okunan_sayisi + 1
       where kurum_id = ${k.kurumId} and id = ${duyuruId}`);
  }
  await tx.execute(sql`
    update bildirim.bildirimler set okundu_at = coalesce(okundu_at, ${an}::timestamptz)
     where kurum_id = ${k.kurumId} and alici_id = ${k.uyelikId} and tekil_anahtar = ${tekilAnahtar(duyuruId)}`);
  const [o] = await tx.execute<{ okundu_at: string }>(sql`
    select ${iso('okundu_at')} as okundu_at from bildirim.duyuru_alicilari
     where kurum_id = ${k.kurumId} and duyuru_id = ${duyuruId} and alici_id = ${k.uyelikId}`);
  return o?.okundu_at ?? an;
}

// --- Sonradan katilan uye -----------------------------------------------------------------------

/**
 * `grup_uyesi` kopyasi etkinse: grubun yayindaki, suresi gecmemis ve (sabit ya da son 14 gun) duyurularini
 * yeni uyeye `duyuru_alicilari` + kutu bildirimi (push'suz) olarak ekler. Idempotent: var olan alici satiri
 * ve bildirim yeniden uretilmez.
 */
export async function sonradanKatilanaDagit(
  tx: Islem,
  b: { kurumId: string; grupId: string; ogrenciId: string; bitisTarihi: string | null },
  simdi: Date = new Date(),
): Promise<number> {
  const bugun = await kurumBugunu(tx, b.kurumId, simdi);
  if (b.bitisTarihi !== null && b.bitisTarihi < bugun) return 0;
  const [u] = await tx.execute<{ durum: string; rol: string }>(sql`
    select durum, rol from bildirim.uyelik_kopyalari
     where kurum_id = ${b.kurumId} and uyelik_id = ${b.ogrenciId}`);
  // Uyelik kopyasi henuz yoksa bildirimUret (asagida) YenidenDene ile olayi gecikmeli tekrarlatir.
  if (u && (u.durum !== 'aktif' || u.rol !== 'ogrenci')) return 0;

  const pencere = new Date(simdi.getTime() - SONRADAN_KATILAN_GUN * 86_400_000).toISOString();
  const adaylar = await tx.execute<DuyuruSatiri>(sql`
    select ${DUYURU_KOLONLARI} from bildirim.duyurular
     where kurum_id = ${b.kurumId} and hedef_turu = 'grup' and hedef_id = ${b.grupId}
       and durum = 'yayinda' and silindi_at is null and 'ogrenci' = any(hedef_roller)
       and (bitis_at is null or bitis_at > ${simdi.toISOString()}::timestamptz)
       and (sabit or yayin_at > ${pencere}::timestamptz)
     order by yayin_at`);
  let eklenen = 0;
  for (const d of adaylar) {
    const yazilan = await tx.execute(sql`
      insert into bildirim.duyuru_alicilari (id, kurum_id, duyuru_id, alici_id)
      values (${yeniId()}, ${b.kurumId}, ${d.id}, ${b.ogrenciId})
      on conflict (duyuru_id, alici_id) do nothing returning 1`);
    if (yazilan.length === 0) continue;
    await tx.execute(sql`
      update bildirim.duyurular set alici_sayisi = alici_sayisi + 1
       where kurum_id = ${b.kurumId} and id = ${d.id}`);
    await duyuruBildirimiUret(tx, b.kurumId, d, [b.ogrenciId], simdi, false);
    eklenen++;
  }
  return eklenen;
}
