import { createDb, type Database } from '@kopru/service-kit';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { kvkkSilmeIsle } from './sistem/kvkk-silme.js';
import {
  bearer,
  dbYok,
  kurumluKullanici,
  otpIleGiris,
  rizaKabulEt,
  testDb,
  testServisi,
  tokenAl,
  type KurumluKullanici,
} from './test/yardimcilar.js';

interface Hata {
  error: { code: string; details?: { kurumlar: { kurum_id: string }[] } };
}
interface Durum {
  talep: { id: string; durum: string; planlanan_at: string } | null;
  engeller: { kurum_id: string }[];
  dogrulama_yontemleri: string[];
}

describe.skipIf(dbYok())('hesap: KVKK silme talebi, anonimlestirme, veri disa aktarma', () => {
  const urls = testDb();
  const t = testServisi();
  const { app } = t.service;
  let sistem: postgres.Sql;
  let sistemDb: Database;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    sistemDb = createDb({ url: urls.sistemUrl, max: 2 });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
    await sistemDb.close();
  });

  /** Giris + kurum; `ilkOtp` kodu yakalayiciya dusmus olur, silme icin yeni kod istenir. */
  async function otpKodu(k: KurumluKullanici): Promise<string> {
    const r = await app.inject({
      method: 'POST',
      url: '/v1/hesap/ben/silme-talebi/kod-gonder',
      headers: bearer(k.token),
    });
    expect(r.statusCode).toBe(200);
    const kod = t.sms.sonKod(k.telefon);
    if (!kod) throw new Error('kod yok');
    return kod;
  }
  const talepEt = (k: KurumluKullanici, kod: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/hesap/ben/silme-talebi',
      headers: bearer(k.token),
      payload: { dogrulama: { yontem: 'otp', kod } },
    });
  const durumOku = (k: KurumluKullanici) =>
    app
      .inject({ url: '/v1/hesap/ben/silme-talebi', headers: bearer(k.token) })
      .then((r) => r.json<Durum>());

  it('yanlis kod reddedilir; dogru kodla talep acilir, ikinci talep 409, geri alinir', async () => {
    const k = await kurumluKullanici(t, 'bireysel');
    await otpKodu(k);
    const yanlis = await talepEt(k, '000000');
    expect(yanlis.statusCode).toBe(401);

    const talep = await talepEt(k, await otpKodu(k));
    expect(talep.statusCode).toBe(201);
    const gun = (new Date(talep.json<{ talep: { planlanan_at: string; talep_at: string } }>().talep.planlanan_at).getTime() -
      new Date(talep.json<{ talep: { talep_at: string } }>().talep.talep_at).getTime()) / 86_400_000;
    expect(Math.round(gun)).toBe(30);

    const ikinci = await talepEt(k, await otpKodu(k));
    expect(ikinci.statusCode).toBe(409);
    expect(ikinci.json<Hata>().error.code).toBe('silme_talebi_var');
    expect((await durumOku(k)).talep?.durum).toBe('beklemede');

    const geri = await app.inject({
      method: 'DELETE',
      url: '/v1/hesap/ben/silme-talebi',
      headers: bearer(k.token),
    });
    expect(geri.statusCode).toBe(200);
    expect((await durumOku(k)).talep?.durum).toBe('geri_alindi');
    const yok = await app.inject({
      method: 'DELETE',
      url: '/v1/hesap/ben/silme-talebi',
      headers: bearer(k.token),
    });
    expect(yok.statusCode).toBe(404);
    // Geri alinan talep isle: dokunulmaz.
    const o = await kvkkSilmeIsle(sistemDb, { log: sessiz, iptalEt: () => Promise.resolve() });
    expect(o.tamamlanan).toBe(0);
    const [u] = await sistem`select durum from hesap.kullanicilar where id = ${k.kullaniciId}`;
    expect(u?.durum).toBe('aktif');
  });

  const sessiz = { info: () => undefined, error: () => undefined };

  it('soguma sonunda anonimlestirir: kisisel alanlar gider, oturumlar iptal, riza kaniti ve olay kalir', async () => {
    const k = await kurumluKullanici(t, 'bireysel');
    await rizaKabulEt(t, k.token);
    await talepEt(k, await otpKodu(k));
    const sid = (JSON.parse(Buffer.from(k.token.split('.')[1] ?? '', 'base64url').toString()) as { sid: string }).sid;
    await sistem`update hesap.uyelikler set gorunen_ad = 'Ayse Hoca', ogrenci_no = '123' where kullanici_id = ${k.kullaniciId}`;
    await sistem`update hesap.kullanicilar set gorunen_ad = 'Ayse Hoca', eposta = ${`ayse${uuidv7()}@example.com`} where id = ${k.kullaniciId}`;

    // Soguma bitmeden is dokunmaz.
    const iptaller: string[] = [];
    const onceki = await kvkkSilmeIsle(sistemDb, { log: sessiz, iptalEt: (s) => (iptaller.push(s), Promise.resolve()) });
    expect(onceki.tamamlanan).toBe(0);

    await sistem`update hesap.silme_talepleri set talep_at = now() - interval '31 days', planlanan_at = now() - interval '1 day'
                  where kullanici_id = ${k.kullaniciId} and durum = 'beklemede'`;
    const o = await kvkkSilmeIsle(sistemDb, { log: sessiz, iptalEt: (s) => (iptaller.push(s), Promise.resolve()) });
    expect(o.tamamlanan).toBe(1);
    expect(iptaller).toContain(sid);

    const [u] = await sistem`select * from hesap.kullanicilar where id = ${k.kullaniciId}`;
    expect(u).toMatchObject({
      durum: 'silindi',
      telefon_e164: null,
      eposta: null,
      gorunen_ad: null,
      ad: null,
      avatar_url: null,
    });
    expect(u?.anonimlestirildi_at).not.toBeNull();
    const [h] = await sistem`select count(*)::int n from hesap.hesaplar where kullanici_id = ${k.kullaniciId}`;
    const [os] = await sistem`select count(*)::int n from hesap.oturumlar where kullanici_id = ${k.kullaniciId}`;
    expect([h?.n, os?.n]).toEqual([0, 0]);
    const [dg] = await sistem`select count(*)::int n from hesap.dogrulamalar where tanimlayici = ${k.telefon}`;
    expect(dg?.n).toBe(0);
    const [uy] = await sistem`select gorunen_ad, ogrenci_no from hesap.uyelikler where kullanici_id = ${k.kullaniciId}`;
    expect(uy).toMatchObject({ gorunen_ad: null, ogrenci_no: null });
    const [kurum] = await sistem`select durum from hesap.kurumlar where id = ${k.kurumId}`;
    expect(kurum?.durum).toBe('kapali');
    // Riza kaydi yasal kanit olarak kalir; ip/user_agent bosalir.
    const rizalar = await sistem`select ip, user_agent from hesap.rizalar where kullanici_id = ${k.kullaniciId}`;
    expect(rizalar.length).toBeGreaterThan(0);
    expect(rizalar.every((r) => r.ip === null && r.user_agent === null)).toBe(true);
    // Talep tamamlandi; eski erisim belirteci ile kullanici artik gorunmez.
    const [tl] = await sistem`select durum, tamamlandi_at from hesap.silme_talepleri where kullanici_id = ${k.kullaniciId}`;
    expect(tl?.durum).toBe('tamamlandi');

    // Olay: kurumsuz zarf, yalniz kimlikler; kisisel veri yok.
    const olaylar = await sistem`select kurum_id, subject, payload from ortak.outbox
      where subject = 'evt.hesap.kullanici.silindi.v1' and payload->'data'->>'kullanici_id' = ${k.kullaniciId}`;
    expect(olaylar).toHaveLength(1);
    expect(olaylar[0]?.kurum_id).toBe('00000000-0000-0000-0000-000000000000');
    const yuk = JSON.stringify(olaylar[0]?.payload);
    expect(yuk).not.toContain(k.telefon);
    expect(yuk).not.toContain('Ayse');
    expect((olaylar[0]?.payload as { data: { uyelik_idleri: string[] } }).data.uyelik_idleri).toContain(k.uyelikId);
    // Idempotent: ikinci kosu bir sey yapmaz.
    const tekrar = await kvkkSilmeIsle(sistemDb, { log: sessiz, iptalEt: () => Promise.resolve() });
    expect(tekrar.tamamlanan).toBe(0);
  });

  it('kurumun tek sahibi ve baska uyesi varsa talep 409 kurum_sahibi_engeli', async () => {
    const k = await kurumluKullanici(t, 'kurum');
    const diger = await otpIleGiris(t);
    await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol, durum, katildi_at)
                 values (${uuidv7()}, ${k.kurumId}, ${diger.kullaniciId}, 'ogrenci', 'aktif', now())`;
    const d = await durumOku(k);
    expect(d.engeller.map((e) => e.kurum_id)).toEqual([k.kurumId]);
    const r = await talepEt(k, await otpKodu(k));
    expect(r.statusCode).toBe(409);
    expect(r.json<Hata>().error.code).toBe('kurum_sahibi_engeli');
    expect(r.json<Hata>().error.details?.kurumlar[0]?.kurum_id).toBe(k.kurumId);
  });

  it('talep acildiktan sonra baska uye eklenirse is talebi engellendi isaretler, hesaba dokunmaz', async () => {
    const k = await kurumluKullanici(t, 'kurum');
    await talepEt(k, await otpKodu(k));
    const diger = await otpIleGiris(t);
    await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol, durum, katildi_at)
                 values (${uuidv7()}, ${k.kurumId}, ${diger.kullaniciId}, 'ogrenci', 'aktif', now())`;
    await sistem`update hesap.silme_talepleri set talep_at = now() - interval '31 days', planlanan_at = now() - interval '1 day'
                  where kullanici_id = ${k.kullaniciId} and durum = 'beklemede'`;
    const o = await kvkkSilmeIsle(sistemDb, { log: sessiz, iptalEt: () => Promise.resolve() });
    expect(o.engellenen).toBeGreaterThanOrEqual(1);
    const [tl] = await sistem`select durum, engel_nedeni from hesap.silme_talepleri where kullanici_id = ${k.kullaniciId}`;
    expect(tl).toMatchObject({ durum: 'engellendi', engel_nedeni: 'kurum_sahibi_engeli' });
    const [u] = await sistem`select durum from hesap.kullanicilar where id = ${k.kullaniciId}`;
    expect(u?.durum).toBe('aktif');
  });

  it('baska sahip varsa sahip hesabi silinir, kurum acik kalir', async () => {
    const k = await kurumluKullanici(t, 'kurum');
    const diger = await otpIleGiris(t);
    await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol, durum, katildi_at)
                 values (${uuidv7()}, ${k.kurumId}, ${diger.kullaniciId}, 'sahip', 'aktif', now())`;
    await talepEt(k, await otpKodu(k));
    await sistem`update hesap.silme_talepleri set talep_at = now() - interval '31 days', planlanan_at = now() - interval '1 day'
                  where kullanici_id = ${k.kullaniciId} and durum = 'beklemede'`;
    const o = await kvkkSilmeIsle(sistemDb, { log: sessiz, iptalEt: () => Promise.resolve() });
    expect(o.tamamlanan).toBeGreaterThanOrEqual(1);
    const [kurum] = await sistem`select durum from hesap.kurumlar where id = ${k.kurumId}`;
    expect(kurum?.durum).toBe('aktif');
    const [uy] = await sistem`select durum from hesap.uyelikler where kullanici_id = ${k.kullaniciId}`;
    expect(uy?.durum).toBe('ayrildi');
  });

  it('verilerim: yalniz kendi verisi; baska kullanicinin ve kurumun verisi yok', async () => {
    const a = await kurumluKullanici(t, 'kurum', 'Kurum A');
    const b = await kurumluKullanici(t, 'kurum', 'Kurum B');
    await rizaKabulEt(t, a.token);
    const r = await app.inject({ url: '/v1/hesap/ben/verilerim', headers: bearer(a.token) });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toContain('verilerim.json');
    const j = r.json<{
      kullanici_id: string;
      hesap: { telefon_e164: string };
      bolumler: { uyelikler: { id: string; kurum_id: string }[]; rizalar: unknown[] };
      eksik_servisler: string[];
    }>();
    expect(j.kullanici_id).toBe(a.kullaniciId);
    expect(j.hesap.telefon_e164).toBe(a.telefon);
    expect(j.bolumler.uyelikler.map((u) => u.id)).toEqual([a.uyelikId]);
    expect(j.bolumler.rizalar.length).toBeGreaterThan(0);
    const metin = r.body;
    expect(metin).not.toContain(b.telefon);
    expect(metin).not.toContain(b.kurumId);
    expect(j.eksik_servisler).toEqual(['bildirim', 'medya', 'motivasyon']);
  });

  it('silme_talepleri RLS: baska kullanici baglaminda talep gorunmez', async () => {
    if (!urls) return;
    const k = await kurumluKullanici(t, 'bireysel');
    await talepEt(k, await otpKodu(k));
    const app_ = postgres(urls.appUrl, { max: 1, onnotice: () => undefined });
    try {
      const gor = async (kullanici: string) =>
        app_.begin(async (tx) => {
          await tx`select set_config('app.kullanici_id', ${kullanici}, true)`;
          return tx`select id from hesap.silme_talepleri where kullanici_id = ${k.kullaniciId}`;
        });
      expect((await gor(k.kullaniciId)).length).toBe(1);
      expect((await gor(uuidv7())).length).toBe(0);
      await expect(
        app_`select id from hesap.silme_talepleri`,
      ).resolves.toHaveLength(0);
    } finally {
      await app_.end();
    }
  });

  it('PATCH /ben gorunen ad degisince olay yayimlar (adsiz yuk)', async () => {
    const k = await kurumluKullanici(t, 'bireysel');
    const r = await app.inject({
      method: 'PATCH',
      url: '/v1/hesap/ben',
      headers: bearer(k.token),
      payload: { gorunen_ad: 'Yeni Gizli Ad' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json<{ degisen_alanlar: string[] }>().degisen_alanlar).toEqual(['gorunen_ad']);
    const olaylar = await sistem`select payload from ortak.outbox
      where subject = 'evt.hesap.kullanici.degisti.v1' and payload->'data'->>'kullanici_id' = ${k.kullaniciId}
      order by created_at`;
    expect(olaylar.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(olaylar.at(-1)?.payload)).not.toContain('Yeni Gizli Ad');
    expect((olaylar.at(-1)?.payload as { data: { degisen_alanlar: string[] } }).data.degisen_alanlar).toContain('gorunen_ad');
    void tokenAl;
  });
});
