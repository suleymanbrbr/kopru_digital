import {
  KULLANICI_DUZEYI_KURUM_ID,
  hesapKullaniciSilindiV1,
  hesapKurumDegistiV1,
  hesapUyelikDegistiV1,
  type Actor,
} from '@kopru/contracts';
import { publishInTx, type Database, type Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { withSistem } from './with-sistem.js';

/**
 * KVKK hesap silme: soguma suresi dolan talepleri anonimlestirir (docs/schema/kvkk-silme.md).
 * `api_sistem` (BYPASSRLS) ile calisir, her kullanici TEK islemde: ya hep ya hic. Idempotent: talep
 * `beklemede` degilse (baska worker, geri alma) dokunmaz.
 */

const SISTEM: Actor = { tur: 'sistem', id: 'kvkk-silme' };
const OUTBOX = { table: 'ortak.outbox' } as const;
export const SILINMIS_METIN = '[silindi]';

export interface KurumEngeli {
  kurum_id: string;
  kurum_ad: string;
  diger_uye_sayisi: number;
}

/**
 * Kullanicinin tek etkin sahibi oldugu ve baska etkin uyesi bulunan kurumlar (silmeyi engeller).
 * Tek basina kalan (baska uyesi olmayan) kurum engel degildir: hesapla birlikte kapatilir.
 * `tx` RLS'i atlayan baglantidan (sistem) ya da kurum baglami ayarli bir islemden gelmeli.
 */
export async function kurumEngelleriniBul(tx: Tx, kullaniciId: string): Promise<KurumEngeli[]> {
  const satirlar = await tx.execute<{
    kurum_id: string;
    kurum_ad: string;
    diger_sahip: number;
    diger_uye: number;
  }>(sql`
    select u.kurum_id, k.ad as kurum_ad,
           (select count(*)::int from hesap.uyelikler x
             where x.kurum_id = u.kurum_id and x.durum = 'aktif' and x.rol = 'sahip'
               and x.kullanici_id <> ${kullaniciId}) as diger_sahip,
           (select count(*)::int from hesap.uyelikler x
             where x.kurum_id = u.kurum_id and x.durum = 'aktif'
               and x.kullanici_id <> ${kullaniciId}) as diger_uye
      from hesap.uyelikler u join hesap.kurumlar k on k.id = u.kurum_id
     where u.kullanici_id = ${kullaniciId} and u.rol = 'sahip' and u.durum = 'aktif'
       and k.durum <> 'kapali'
     group by u.kurum_id, k.ad`);
  return satirlar
    .filter((s) => s.diger_sahip === 0 && s.diger_uye > 0)
    .map((s) => ({ kurum_id: s.kurum_id, kurum_ad: s.kurum_ad, diger_uye_sayisi: s.diger_uye }));
}

export interface SilmeIsiSonucu {
  tamamlanan: number;
  engellenen: number;
  hata: number;
}

export interface SilmeIsiBagimliliklari {
  log: { info(o: object, m: string): void; error(o: object, m: string): void };
  /** Oturum `sid`lerini erisim belirteci iptal listesine yazar (ADR 0008). */
  iptalEt: (sid: string) => Promise<void>;
  simdi?: () => Date;
}

export async function kvkkSilmeIsle(
  sistemDb: Database | null,
  b: SilmeIsiBagimliliklari,
): Promise<SilmeIsiSonucu> {
  const sonuc: SilmeIsiSonucu = { tamamlanan: 0, engellenen: 0, hata: 0 };
  if (!sistemDb) return sonuc;
  const simdi = (b.simdi ?? (() => new Date()))();
  const vadesi = await sistemDb.orm.execute<{ id: string; kullanici_id: string }>(sql`
    select id, kullanici_id from hesap.silme_talepleri
     where durum = 'beklemede' and planlanan_at <= ${simdi.toISOString()}::timestamptz
     order by planlanan_at limit 20`);
  for (const talep of vadesi) {
    try {
      const r = await withSistem(
        sistemDb,
        {
          eylem: 'kvkk.hesap_sil',
          neden: 'KVKK silme talebinin soğuma süresi doldu',
          aktorKullaniciId: talep.kullanici_id,
          hedefTuru: 'kullanici',
          hedefId: talep.kullanici_id,
        },
        (tx) => kullaniciyiAnonimlestir(tx, talep, simdi),
      );
      if (r.durum === 'tamam') {
        sonuc.tamamlanan++;
        // Commit sonrasi: oturumlarin erisim belirteclerini hemen gecersiz kil. Hata isi bozmaz
        // (oturum satirlari silindi; kalan pencere <= 15 dk, ADR 0008).
        for (const sid of r.sidler) {
          await b.iptalEt(sid).catch((err: unknown) => {
            b.log.error({ err, sid }, 'oturum iptali yazılamadı');
          });
        }
        b.log.info({ kullanici_id: talep.kullanici_id }, 'hesap anonimleştirildi');
      } else if (r.durum === 'engel') {
        sonuc.engellenen++;
      }
    } catch (err) {
      sonuc.hata++;
      b.log.error({ err, talep_id: talep.id }, 'hesap silme işi başarısız');
    }
  }
  return sonuc;
}

type Sonuc = { durum: 'tamam'; sidler: string[] } | { durum: 'engel' } | { durum: 'atlandi' };

async function kullaniciyiAnonimlestir(
  tx: Tx,
  talep: { id: string; kullanici_id: string },
  simdi: Date,
): Promise<Sonuc> {
  const kid = talep.kullanici_id;
  const at = simdi.toISOString();
  const [kilitli] = await tx.execute<{ id: string }>(sql`
    select id from hesap.silme_talepleri where id = ${talep.id} and durum = 'beklemede' for update skip locked`);
  if (!kilitli) return { durum: 'atlandi' };

  const engeller = await kurumEngelleriniBul(tx, kid);
  if (engeller.length > 0) {
    await tx.execute(sql`
      update hesap.silme_talepleri set durum = 'engellendi', engel_nedeni = 'kurum_sahibi_engeli'
       where id = ${talep.id}`);
    return { durum: 'engel' };
  }

  const uyelikler = await tx.execute<{
    id: string;
    kurum_id: string;
    rol: string;
    durum: string;
    sube_id: string | null;
    kademe_id: string | null;
  }>(sql`
    select id, kurum_id, rol, durum, sube_id, kademe_id from hesap.uyelikler
     where kullanici_id = ${kid} order by id for update`);
  const correlationId = uuidv7();

  // Tek basina kalan kurumlari kapat (engel kontrolunden gecti: baska etkin uye yok).
  const kapatilacak = new Set<string>();
  for (const u of uyelikler) {
    if (u.rol === 'sahip' && u.durum === 'aktif') kapatilacak.add(u.kurum_id);
  }
  for (const kurumId of kapatilacak) {
    const [baskaSahip] = await tx.execute<{ n: number }>(sql`
      select count(*)::int n from hesap.uyelikler
       where kurum_id = ${kurumId} and rol = 'sahip' and durum = 'aktif' and kullanici_id <> ${kid}`);
    if ((baskaSahip?.n ?? 0) > 0) {
      kapatilacak.delete(kurumId); // baska sahip var: kurum acik kalir
      continue;
    }
    const [k] = await tx.execute<{ id: string; ad: string; tur: string; saat_dilimi: string }>(sql`
      update hesap.kurumlar set durum = 'kapali', kapatildi_at = ${at}::timestamptz
       where id = ${kurumId} and durum <> 'kapali' returning id, ad, tur, saat_dilimi`);
    if (k) {
      await publishInTx(
        tx,
        hesapKurumDegistiV1.create({
          kurumId,
          actor: SISTEM,
          correlationId,
          data: {
            kurum_id: k.id,
            ad: k.ad,
            tur: k.tur as 'bireysel' | 'ekip' | 'kurum',
            saat_dilimi: k.saat_dilimi,
            durum: 'kapali',
          },
        }),
        OUTBOX,
      );
    }
  }

  // Uyelikler: kisisel alanlar silinir; uyelik 'ayrildi' olur (kapatilan kurumun sahibi hariç: son sahip
  // korumasi; kurum kapali oldugu icin anonim sahip satiri kalir).
  const uyelikIdleri: string[] = [];
  for (const u of uyelikler) {
    uyelikIdleri.push(u.id);
    const ayril = u.durum !== 'ayrildi' && !(u.rol === 'sahip' && kapatilacak.has(u.kurum_id));
    await tx.execute(sql`
      update hesap.uyelikler
         set gorunen_ad = null, ogrenci_no = null
             ${ayril ? sql`, durum = 'ayrildi', ayrildi_at = ${at}::timestamptz` : sql``}
       where id = ${u.id}`);
    if (ayril) {
      await publishInTx(
        tx,
        hesapUyelikDegistiV1.create({
          kurumId: u.kurum_id,
          actor: SISTEM,
          correlationId,
          data: {
            uyelik_id: u.id,
            kullanici_id: kid,
            rol: u.rol as 'sahip' | 'yonetici' | 'ogretmen' | 'ogrenci' | 'veli',
            durum: 'ayrildi',
            sube_id: u.sube_id,
            kademe_id: u.kademe_id,
          },
        }),
        OUTBOX,
      );
    }
  }

  if (uyelikIdleri.length > 0) {
    const ids = sql`(${sql.join(
      uyelikIdleri.map((i) => sql`${i}::uuid`),
      sql`, `,
    )})`;
    // Kullanicinin urettigi / hakkinda yazilan serbest metinler.
    await tx.execute(sql`update ogrenme.soru_mesajlari set metin = ${SILINMIS_METIN}
                          where yazar_id in ${ids} and metin is not null`);
    await tx.execute(sql`update ogrenme.ogrenci_odevleri set ogrenci_notu = null
                          where ogrenci_id in ${ids} and ogrenci_notu is not null`);
    await tx.execute(sql`update ders.geri_bildirimler set "not" = null
                          where ogrenci_id in ${ids} and "not" is not null`);
    await tx.execute(sql`update ders.yoklamalar set "not" = null
                          where ogrenci_id in ${ids} and "not" is not null`);
    await tx.execute(sql`update ogrenme.denemeler set not_metni = null
                          where ogrenci_id in ${ids} and not_metni is not null`);
    await tx.execute(sql`update finans.ogrenci_finans_profilleri set odeyen_telefon = null
                          where ogrenci_id in ${ids} and odeyen_telefon is not null`);
  }

  // Davet kayitlarindaki iletisim bilgisi (kabul eden bu kullanici).
  await tx.execute(sql`
    update hesap.davetler
       set hedef_telefon_e164 = null, hedef_eposta = null, hedef_ad = null, kanal = 'baglanti'
     where kabul_eden_kullanici_id = ${kid}`);

  // Riza kayitlari yasal kanit olarak kalir; yalniz ip ve user_agent silinir.
  await tx.execute(sql`update hesap.rizalar set ip = null, user_agent = null where kullanici_id = ${kid}`);

  const [k] = await tx.execute<{ telefon_e164: string | null; eposta: string | null }>(sql`
    select telefon_e164, eposta from hesap.kullanicilar where id = ${kid} for update`);
  const tanimlayicilar = [k?.telefon_e164, k?.eposta].filter((x): x is string => !!x);
  if (tanimlayicilar.length > 0) {
    const liste = sql.join(
      tanimlayicilar.map((t) => sql`${t}`),
      sql`, `,
    );
    await tx.execute(sql`delete from hesap.dogrulamalar where tanimlayici in (${liste})`);
    await tx.execute(sql`delete from hesap.otp_istekleri where tanimlayici in (${liste})`);
  }
  await tx.execute(sql`delete from hesap.hesaplar where kullanici_id = ${kid}`);
  const oturumlar = await tx.execute<{ id: string }>(sql`
    delete from hesap.oturumlar where kullanici_id = ${kid} returning id`);
  await tx.execute(sql`
    update hesap.kullanicilar
       set ad = null, soyad = null, gorunen_ad = null, ad_arama = null,
           telefon_e164 = null, telefon_dogrulandi_at = null, eposta = null, eposta_dogrulandi_at = null,
           avatar_dosya_id = null, avatar_url = null, platform_rolu = 'yok',
           durum = 'silindi', anonimlestirildi_at = ${at}::timestamptz
     where id = ${kid}`);
  await tx.execute(sql`
    update hesap.silme_talepleri set durum = 'tamamlandi', tamamlandi_at = ${at}::timestamptz
     where id = ${talep.id}`);

  await publishInTx(
    tx,
    hesapKullaniciSilindiV1.create({
      kurumId: KULLANICI_DUZEYI_KURUM_ID,
      actor: SISTEM,
      correlationId,
      data: { kullanici_id: kid, uyelik_idleri: uyelikIdleri, anonimlestirildi_at: at },
    }),
    OUTBOX,
  );
  return { durum: 'tamam', sidler: oturumlar.map((o) => o.id) };
}
