import { createDb, type Database } from '@kopru/service-kit';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { abonelikGecisleriCalistir, aboneligiAktiflestir } from './modules/abonelik/index.js';
import { abonelikSistemIslemi } from './sistem/abonelik-sistem.js';
import { dbYok, rastgeleTelefon, testDb } from './test/yardimcilar.js';

/** Tek satir bekleyen sorgu sonucu (yoksa test hatasi). */
function tek<T>(satirlar: T[]): T {
  const satir = satirlar[0];
  if (satir === undefined) throw new Error('beklenen satır yok');
  return satir;
}

const GUN = 24 * 60 * 60 * 1000;

describe.skipIf(dbYok())('abonelik: saatlik durum gecisleri (api_sistem)', () => {
  const urls = testDb();
  let sistem: postgres.Sql;
  let sistemDb: Database;
  let planId = '';

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    sistemDb = createDb({ url: urls.sistemUrl, max: 3 });
    const [p] = await sistem<{ id: string }[]>`
      select id from abonelik.planlar where kod = 'kurum' and surum = 1`;
    planId = p?.id ?? '';
  });
  afterAll(async () => {
    await sistemDb.close();
    await sistem.end();
  });

  /** Kurum + abonelik satiri; zamanlar "simdi"ye gore gun farki (negatif = gecmis). */
  async function kurumVeAbonelik(
    durum: string,
    ek: {
      donem?: number;
      deneme?: number | null;
      ekSure?: number | null;
      iptal?: boolean;
      kaynak?: string;
    },
  ) {
    const kurumId = uuidv7();
    const kullaniciId = uuidv7();
    const simdi = Date.now();
    const an = (g: number | null | undefined) => (g == null ? null : new Date(simdi + g * GUN));
    await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${kullaniciId}, ${rastgeleTelefon()})`;
    await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurumId}, 'Geçiş Kurumu', 'kurum', ${kullaniciId})`;
    const donemBitis = new Date(simdi + (ek.donem ?? 30) * GUN);
    const abonelikId = uuidv7();
    await sistem`insert into abonelik.abonelikler
      (id, kurum_id, plan_id, kaynak, durum, donem_baslangic_at, donem_bitis_at, deneme_bitis_at, ek_sure_bitis_at,
       iptal_istendi_at, fiyat_kurus, otomatik_yenileme)
      values (${abonelikId}, ${kurumId}, ${planId}, ${ek.kaynak ?? (durum === 'deneme' ? 'deneme' : 'iyzico')}, ${durum},
              ${new Date(donemBitis.getTime() - 30 * GUN)}, ${donemBitis}, ${an(ek.deneme ?? null)}, ${an(ek.ekSure ?? null)},
              ${ek.iptal ? new Date(simdi - 10 * GUN) : null}, 100, true)`;
    return { kurumId, abonelikId };
  }

  const durumu = async (abonelikId: string) => {
    const [r] = await sistem<
      { durum: string; ek_sure_bitis_at: Date | null; otomatik_yenileme: boolean }[]
    >`
      select durum, ek_sure_bitis_at, otomatik_yenileme from abonelik.abonelikler where id = ${abonelikId}`;
    return r;
  };
  const kurumDurumu = async (kurumId: string) =>
    (await sistem<{ durum: string }[]>`select durum from hesap.kurumlar where id = ${kurumId}`)[0]
      ?.durum;
  const olaylar = async (kurumId: string) =>
    (
      await sistem<{ subject: string }[]>`
        select subject from ortak.outbox where kurum_id = ${kurumId} order by created_at, id`
    ).map((o) => o.subject);

  it('vadesi gelen gecisleri yapar, kurumu esitler, olay yazar; ikinci calisma bir sey yazmaz', async () => {
    const deneme = await kurumVeAbonelik('deneme', { donem: -1, deneme: -1 });
    const iptal = await kurumVeAbonelik('aktif', { donem: -2, iptal: true });
    const odenmedi = await kurumVeAbonelik('aktif', { donem: -40 });
    const ekSure = await kurumVeAbonelik('ek_sure', { donem: -3, ekSure: 4 });
    const aski = await kurumVeAbonelik('askida', { donem: -150, ekSure: -100 });
    const gelecek = await kurumVeAbonelik('deneme', { donem: 5, deneme: 5 });
    const askiTaze = await kurumVeAbonelik('askida', { donem: -50, ekSure: -10 });

    const ozet = await abonelikGecisleriCalistir(sistemDb);
    expect(ozet.gecis).toBeGreaterThanOrEqual(4);

    expect((await durumu(deneme.abonelikId))?.durum).toBe('sona_erdi');
    expect(await kurumDurumu(deneme.kurumId)).toBe('askida');

    const i = await durumu(iptal.abonelikId);
    expect(i).toMatchObject({ durum: 'iptal', otomatik_yenileme: false });
    expect(await kurumDurumu(iptal.kurumId)).toBe('aktif'); // iptal: kilit yok (ucretsiz katman)

    // 40 gun once biten odenmemis donem: odeme_bekliyor -> ek_sure (bitis + 7 gun, gecmis) -> askida
    const o = await durumu(odenmedi.abonelikId);
    expect(o?.durum).toBe('askida');
    expect(o?.ek_sure_bitis_at).not.toBeNull();
    expect(await kurumDurumu(odenmedi.kurumId)).toBe('askida');

    expect((await durumu(ekSure.abonelikId))?.durum).toBe('ek_sure');
    expect(await kurumDurumu(ekSure.kurumId)).toBe('aktif');
    expect((await durumu(aski.abonelikId))?.durum).toBe('sona_erdi');
    expect((await durumu(askiTaze.abonelikId))?.durum).toBe('askida');
    expect((await durumu(gelecek.abonelikId))?.durum).toBe('deneme');
    expect(await kurumDurumu(gelecek.kurumId)).toBe('aktif');

    expect(await olaylar(deneme.kurumId)).toEqual([
      'evt.abonelik.abonelik.degisti.v1',
      'evt.hesap.kurum.degisti.v1',
    ]);
    expect(await olaylar(iptal.kurumId)).toEqual(['evt.abonelik.abonelik.degisti.v1']);
    expect(await olaylar(gelecek.kurumId)).toEqual([]);

    // Idempotent: ayni kayitlar icin ikinci calisma olay/denetim yazmaz.
    const once = await olaylar(deneme.kurumId);
    const { n: denetimOnce } = tek(
      await sistem<{ n: number }[]>`
      select count(*)::int n from hesap.denetim_kayitlari where eylem = 'sistem.abonelik_gecisleri' and created_at > now() - interval '1 minute'`,
    );
    const ikinci = await abonelikGecisleriCalistir(sistemDb);
    expect(ikinci.gecis).toBe(0);
    expect(await olaylar(deneme.kurumId)).toEqual(once);
    const { n: denetimSonra } = tek(
      await sistem<{ n: number }[]>`
      select count(*)::int n from hesap.denetim_kayitlari where eylem = 'sistem.abonelik_gecisleri' and created_at > now() - interval '1 minute'`,
    );
    expect(denetimSonra).toBe(denetimOnce);
    expect(denetimOnce).toBeGreaterThanOrEqual(1);

    // Zaman ilerler (simdi parametresi): 6 gun sonra gelecek deneme biter.
    const sonra = await abonelikGecisleriCalistir(sistemDb, new Date(Date.now() + 6 * GUN));
    expect(sonra.gecis).toBeGreaterThanOrEqual(1);
    expect((await durumu(gelecek.abonelikId))?.durum).toBe('sona_erdi');
    expect(await kurumDurumu(gelecek.kurumId)).toBe('askida');
  });

  it('odeme gelince (aktiflestir) askida kurum aktif olur; eski askida kayit sona erer; tek etkin abonelik', async () => {
    const k = await kurumVeAbonelik('askida', { donem: -40, ekSure: -33 });
    await sistem`update hesap.kurumlar set durum = 'askida' where id = ${k.kurumId}`;
    const sonuc = await abonelikSistemIslemi(
      sistemDb,
      { eylem: 'sistem.abonelik_odeme_isle', neden: 'test odemesi', kurumId: k.kurumId },
      (tx) =>
        aboneligiAktiflestir(tx, {
          kurumId: k.kurumId,
          planKodu: 'kurum',
          kaynak: 'iyzico',
          periyot: 'aylik',
          donemBaslangicAt: new Date(),
          donemBitisAt: new Date(Date.now() + 30 * GUN),
          disAbonelikId: `iyz_${uuidv7()}`,
          actor: { tur: 'sistem', id: 'test' },
          correlationId: uuidv7(),
        }),
    );
    expect(sonuc.abonelik).toMatchObject({
      kaynak: 'iyzico',
      durum: 'aktif',
      otomatik_yenileme: true,
    });
    expect(await kurumDurumu(k.kurumId)).toBe('aktif');
    expect((await durumu(k.abonelikId))?.durum).toBe('sona_erdi');
    const etkin = await sistem<{ id: string }[]>`
      select id from abonelik.abonelikler where kurum_id = ${k.kurumId} and durum in ('deneme','aktif','odeme_bekliyor','ek_sure')`;
    expect(etkin).toHaveLength(1);
    // Zamanlayici yeni aktif aboneligi bozmaz
    await abonelikGecisleriCalistir(sistemDb);
    expect((await durumu(etkin[0]?.id ?? ''))?.durum).toBe('aktif');

    // Ayni kaynakta ikinci aktivasyon ayni satiri gunceller (yeni satir acmaz): yenileme / plan degisimi.
    await abonelikSistemIslemi(
      sistemDb,
      { eylem: 'sistem.abonelik_odeme_isle', neden: 'yenileme', kurumId: k.kurumId },
      (tx) =>
        aboneligiAktiflestir(tx, {
          kurumId: k.kurumId,
          planKodu: 'kurum',
          kaynak: 'iyzico',
          periyot: 'aylik',
          donemBaslangicAt: new Date(Date.now() + 30 * GUN),
          donemBitisAt: new Date(Date.now() + 60 * GUN),
          actor: { tur: 'sistem', id: 'test' },
          correlationId: uuidv7(),
        }),
    );
    const { n } = tek(
      await sistem<{ n: number }[]>`
      select count(*)::int n from abonelik.abonelikler where kurum_id = ${k.kurumId}`,
    );
    expect(n).toBe(2);
  });

  it('kaynak degisiminde (iyzico -> kurumsal) eskisi sona erer, yenisi eklenir; kurumsalda sozlesme no zorunlu', async () => {
    const k = await kurumVeAbonelik('aktif', { donem: 20 });
    const gir = (kaynak: 'kurumsal', sozlesme?: string) =>
      abonelikSistemIslemi(
        sistemDb,
        { eylem: 'sistem.abonelik_kurumsal_aktivasyon', neden: 'test', kurumId: k.kurumId },
        (tx) =>
          aboneligiAktiflestir(tx, {
            kurumId: k.kurumId,
            planKodu: 'kurum',
            kaynak,
            periyot: 'yillik',
            donemBaslangicAt: new Date(),
            donemBitisAt: new Date(Date.now() + 365 * GUN),
            kurumsalSozlesmeNo: sozlesme ?? null,
            actor: { tur: 'sistem', id: 'test' },
            correlationId: uuidv7(),
          }),
      );
    await expect(gir('kurumsal')).rejects.toMatchObject({ statusCode: 422 });
    const s = await gir('kurumsal', 'SZL-1');
    expect(s.abonelik).toMatchObject({ kaynak: 'kurumsal', durum: 'aktif', periyot: 'yillik' });
    expect((await durumu(k.abonelikId))?.durum).toBe('sona_erdi');
  });
});
