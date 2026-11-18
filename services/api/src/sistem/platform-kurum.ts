import { hesapModulAyariDegistiV1, type ModulKodu } from '@kopru/contracts';
import { publishInTx, type Database } from '@kopru/service-kit';
import { sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { isoZaman, pgDizi } from './platform-ortak.js';
import { withSistem, type SistemBaglami } from './with-sistem.js';

export type KurumAramasi =
  | { tur: 'yok' }
  | { tur: 'id'; deger: string }
  | { tur: 'eposta'; deger: string }
  | { tur: 'telefon'; deger: string }
  | { tur: 'ad'; deger: string };

export interface KurumSatiri extends Record<string, unknown> {
  id: string;
  ad: string;
  tur: string;
  durum: string;
  created_at: string;
}

export interface SahipSatiri extends Record<string, unknown> {
  kurum_id: string;
  kullanici_id: string;
  telefon_e164: string | null;
  eposta: string | null;
}

const likeKacis = (m: string) => m.replace(/[\\%_]/g, (c) => `\\${c}`);
/** Turkce i/I/İ/ı farkini `kurumlar_ad_trgm_idx` ile ayni bicimde yok sayar. */
const adNormal = (kolon: SQL) => sql`translate(${kolon}, 'İIı', 'iii')`;

/** Sahip uyeligi (rol `sahip`) uzerinden kurum bulur; telefon/e-posta tam eslesme ve indeksli. */
const sahipKurumlari = (kosul: SQL) => sql`
  select u.kurum_id from hesap.uyelikler u
  join hesap.kullanicilar ku on ku.id = u.kullanici_id
  where u.rol = 'sahip' and ${kosul}`;

/**
 * Kurum listesi/arama. `ad` icin trigram, id icin birincil anahtar, telefon/e-posta icin kullanicilar
 * uzerindeki tekil indeksler kullanilir. Sayfalama `id` (UUIDv7, zamana gore) azalan imleclidir.
 */
export async function platformKurumAra(
  sistemDb: Database | null,
  baglam: SistemBaglami,
  girdi: {
    arama: KurumAramasi;
    durum?: string | undefined;
    limit: number;
    imlec?: string | undefined;
  },
): Promise<{ kurumlar: KurumSatiri[]; sahipler: SahipSatiri[]; sonraki: string | null }> {
  const kosullar: SQL[] = [];
  const a = girdi.arama;
  switch (a.tur) {
    case 'id':
      kosullar.push(sql`k.id = ${a.deger}::uuid`);
      break;
    case 'eposta':
      kosullar.push(
        sql`(k.id in (${sahipKurumlari(sql`ku.eposta = ${a.deger}`)}) or lower(k.eposta) = lower(${a.deger}))`,
      );
      break;
    case 'telefon':
      kosullar.push(
        sql`(k.id in (${sahipKurumlari(sql`ku.telefon_e164 = ${a.deger}`)}) or k.telefon_e164 = ${a.deger})`,
      );
      break;
    case 'ad':
      kosullar.push(
        sql`${adNormal(sql`k.ad`)} ilike ${`%${likeKacis(a.deger.replace(/[İIı]/g, 'i'))}%`}`,
      );
      break;
    case 'yok':
      break;
  }
  if (girdi.durum) kosullar.push(sql`k.durum = ${girdi.durum}`);
  if (girdi.imlec) kosullar.push(sql`k.id < ${girdi.imlec}::uuid`);
  const where = kosullar.length > 0 ? sql`where ${sql.join(kosullar, sql` and `)}` : sql``;

  return withSistem(sistemDb, baglam, async (tx) => {
    const rows = await tx.execute<KurumSatiri>(sql`
      select k.id, k.ad, k.tur, k.durum, ${isoZaman('k.created_at')} as created_at from hesap.kurumlar k ${where}
      order by k.id desc limit ${girdi.limit + 1}`);
    const fazla = rows.length > girdi.limit;
    const kurumlar = rows.slice(0, girdi.limit);
    const sahipler =
      kurumlar.length === 0
        ? []
        : await tx.execute<SahipSatiri>(sql`
            select u.kurum_id, u.kullanici_id, k.telefon_e164, k.eposta::text as eposta
            from hesap.uyelikler u join hesap.kullanicilar k on k.id = u.kullanici_id
            where u.rol = 'sahip' and u.durum = 'aktif'
              and u.kurum_id = any(${pgDizi(
                kurumlar.map((x) => x.id),
                'uuid',
              )})`);
    const son = kurumlar.at(-1);
    return { kurumlar, sahipler: [...sahipler], sonraki: fazla && son ? son.id : null };
  });
}

export interface KurumDetayi {
  kurum: (KurumSatiri & { saat_dilimi: string }) | null;
  sahipler: SahipSatiri[];
  uyeler: { rol: string; durum: string; sayi: number }[];
  modulAyarlari: { modul_kodu: string; kapsam: string; acik: boolean }[];
  beta: { ozellik_kodu: string; acik: boolean; updated_at: string }[];
}

export async function platformKurumDetayi(
  sistemDb: Database | null,
  baglam: SistemBaglami,
  kurumId: string,
): Promise<KurumDetayi> {
  return withSistem(sistemDb, baglam, async (tx) => {
    const [kurum] = await tx.execute<KurumSatiri & { saat_dilimi: string }>(sql`
      select id, ad, tur, durum, ${isoZaman('created_at')} as created_at, saat_dilimi from hesap.kurumlar where id = ${kurumId}::uuid`);
    if (!kurum) return { kurum: null, sahipler: [], uyeler: [], modulAyarlari: [], beta: [] };
    const sahipler = await tx.execute<SahipSatiri>(sql`
      select u.kurum_id, u.kullanici_id, k.telefon_e164, k.eposta::text as eposta
      from hesap.uyelikler u join hesap.kullanicilar k on k.id = u.kullanici_id
      where u.kurum_id = ${kurumId}::uuid and u.rol = 'sahip' and u.durum = 'aktif'`);
    const uyeler = await tx.execute<{ rol: string; durum: string; sayi: number }>(sql`
      select rol, durum, count(*)::int as sayi from hesap.uyelikler
      where kurum_id = ${kurumId}::uuid group by rol, durum`);
    const modulAyarlari = await tx.execute<{
      modul_kodu: string;
      kapsam: string;
      acik: boolean;
    }>(sql`
      select modul_kodu, kapsam, acik from hesap.modul_ayarlari where kurum_id = ${kurumId}::uuid`);
    const beta = await tx.execute<{ ozellik_kodu: string; acik: boolean; updated_at: string }>(sql`
      select ozellik_kodu, acik, ${isoZaman('updated_at')} as updated_at from hesap.kurum_beta_ozellikleri
      where kurum_id = ${kurumId}::uuid order by ozellik_kodu`);
    return {
      kurum,
      sahipler: [...sahipler],
      uyeler: [...uyeler],
      modulAyarlari: [...modulAyarlari],
      beta: [...beta],
    };
  });
}

export interface ModulAyarSonucu {
  bulundu: boolean;
  kurumAcik: boolean;
  kurumAyariVar: boolean;
}

/**
 * Kuruma ozel modul acma/kapama (kurum duzeyi `hesap.modul_ayarlari`). Satir ve `hesap.modul_ayari.degisti.v1`
 * olayi (diger servislerin kopyalari icin) denetim satiriyla AYNI islemde yazilir. `acik=null` mirasa doner.
 * Plan hakki denetimi abonelik modulu gelince eklenir (ADR 0004).
 */
export async function platformModulAyarla(
  sistemDb: Database | null,
  baglam: SistemBaglami & { aktorKullaniciId: string; kurumId: string },
  girdi: { modulKodu: ModulKodu; acik: boolean | null; correlationId: string },
): Promise<ModulAyarSonucu> {
  return withSistem(sistemDb, baglam, async (tx) => {
    const [kurum] = await tx.execute<{ id: string }>(sql`
      select id from hesap.kurumlar where id = ${baglam.kurumId}::uuid for update`);
    if (!kurum) return { bulundu: false, kurumAcik: true, kurumAyariVar: false };
    const olay = (ayarId: string, acik: boolean | null) =>
      publishInTx(
        tx,
        hesapModulAyariDegistiV1.create({
          kurumId: baglam.kurumId,
          actor: { tur: 'kullanici', id: baglam.aktorKullaniciId },
          correlationId: girdi.correlationId,
          data: {
            modul_ayari_id: ayarId,
            modul_kodu: girdi.modulKodu,
            kapsam: 'kurum',
            kapsam_id: baglam.kurumId,
            acik,
          },
        }),
        { table: 'ortak.outbox' },
      );
    if (girdi.acik === null) {
      const silinen = await tx.execute<{ id: string }>(sql`
        delete from hesap.modul_ayarlari
        where kurum_id = ${baglam.kurumId}::uuid and modul_kodu = ${girdi.modulKodu}
          and kapsam = 'kurum' and kapsam_id = ${baglam.kurumId}::uuid
        returning id`);
      const silinenId = silinen[0]?.id;
      if (silinenId) await olay(silinenId, null);
      return { bulundu: true, kurumAcik: true, kurumAyariVar: false };
    }
    const [satir] = await tx.execute<{ id: string }>(sql`
      insert into hesap.modul_ayarlari (id, kurum_id, modul_kodu, kapsam, kapsam_id, acik, created_by)
      values (${uuidv7()}::uuid, ${baglam.kurumId}::uuid, ${girdi.modulKodu}, 'kurum',
              ${baglam.kurumId}::uuid, ${girdi.acik}, ${baglam.aktorKullaniciId}::uuid)
      on conflict (kurum_id, modul_kodu, kapsam, kapsam_id) do update set acik = excluded.acik
      returning id`);
    if (!satir) throw new Error('modül ayarı yazılamadı');
    await olay(satir.id, girdi.acik);
    return { bulundu: true, kurumAcik: girdi.acik, kurumAyariVar: true };
  });
}

/** Kuruma ozel beta ozellik bayragi. `acik=null` bayragi siler. Olay yok (yalniz api okur). */
export async function platformBetaAyarla(
  sistemDb: Database | null,
  baglam: SistemBaglami & { aktorKullaniciId: string; kurumId: string },
  girdi: { ozellikKodu: string; acik: boolean | null },
): Promise<{ bulundu: boolean; acik: boolean | null }> {
  return withSistem(sistemDb, baglam, async (tx) => {
    const [kurum] = await tx.execute<{ id: string }>(sql`
      select id from hesap.kurumlar where id = ${baglam.kurumId}::uuid for update`);
    if (!kurum) return { bulundu: false, acik: null };
    if (girdi.acik === null) {
      await tx.execute(sql`
        delete from hesap.kurum_beta_ozellikleri
        where kurum_id = ${baglam.kurumId}::uuid and ozellik_kodu = ${girdi.ozellikKodu}`);
      return { bulundu: true, acik: null };
    }
    await tx.execute(sql`
      insert into hesap.kurum_beta_ozellikleri (id, kurum_id, ozellik_kodu, acik, degistiren_id, created_by)
      values (${uuidv7()}::uuid, ${baglam.kurumId}::uuid, ${girdi.ozellikKodu}, ${girdi.acik},
              ${baglam.aktorKullaniciId}::uuid, ${baglam.aktorKullaniciId}::uuid)
      on conflict (kurum_id, ozellik_kodu) do update
        set acik = excluded.acik, degistiren_id = excluded.degistiren_id`);
    return { bulundu: true, acik: girdi.acik };
  });
}
