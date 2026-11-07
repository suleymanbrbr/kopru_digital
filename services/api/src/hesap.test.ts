import { hesapKurumDegistiV1 } from '@kopru/contracts';
import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { kurumlar } from './db/schema.js';
import { modulAcikMi } from './modules/hesap/index.js';
import { withSistem } from './sistem/with-sistem.js';
import {
  bearer,
  dbYok,
  kurumluKullanici,
  otpIleGiris,
  rizaKabulEt,
  testDb,
  testServisi,
  tokenAl,
  hataMetni,
  izoleVeritabani,
} from './test/yardimcilar.js';

describe.skipIf(dbYok())('hesap: KVKK, kurum, uyelik, modul, izin, outbox', () => {
  const urls = testDb();
  const t = testServisi();
  const { app } = t.service;
  let sistem: postgres.Sql;
  let appDb: Database;
  let sistemDb: Database;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    appDb = createDb({ url: urls.appUrl, max: 3 });
    sistemDb = createDb({ url: urls.sistemUrl, max: 3 });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
    await appDb.close();
    await sistemDb.close();
  });

  describe('KVKK rıza korumasi', () => {
    it('onaysiz kullanici muaf olmayan her uc noktada 403 riza_gerekli alir; muaflar acik', async () => {
      const g = await otpIleGiris(t);
      const { accessToken } = await tokenAl(t, g.oturum);
      for (const [method, url] of [
        ['GET', '/v1/hesap/uyeliklerim'],
        ['POST', '/v1/hesap/kurumlar'],
      ] as const) {
        const res = await app.inject({
          method,
          url,
          headers: bearer(accessToken),
          payload: method === 'POST' ? { ad: 'X', tur: 'bireysel' } : undefined,
        });
        expect(res.statusCode).toBe(403);
        expect(res.json<{ error: { code: string } }>().error.code).toBe('riza_gerekli');
      }
      expect(
        (await app.inject({ url: '/v1/hesap/ben', headers: bearer(accessToken) })).statusCode,
      ).toBe(200);
      const guncel = await app.inject({
        url: '/v1/hesap/rizalar/guncel',
        headers: bearer(accessToken),
      });
      const govde = guncel.json<{
        metinler: {
          id: string;
          tur: string;
          baslik: string;
          kabul_edildi: boolean;
          govde_sha256: string;
        }[];
        onay_gerekli: boolean;
      }>();
      expect(govde.onay_gerekli).toBe(true);
      expect(govde.metinler[0]?.tur).toBe('kvkk_aydinlatma');
      expect(govde.metinler[0]?.baslik).toContain('YER TUTUCU');
      expect(govde.metinler[0]?.govde_sha256).toMatch(/^[0-9a-f]{64}$/);

      await rizaKabulEt(t, accessToken);
      expect(
        (await app.inject({ url: '/v1/hesap/uyeliklerim', headers: bearer(accessToken) }))
          .statusCode,
      ).toBe(200);
    });

    it('yeni surum yayinlaninca kullanici yeniden onaylamak zorunda; geri cekme de engeller (izole DB)', async () => {
      const iz = await izoleVeritabani();
      const ti = testServisi({}, iz.urls);
      const ozel = postgres(iz.urls.sistemUrl, { max: 1, onnotice: () => undefined });
      try {
        const g = await otpIleGiris(ti);
        const { accessToken } = await tokenAl(ti, g.oturum);
        await rizaKabulEt(ti, accessToken);
        const kontrol = () =>
          ti.service.app.inject({ url: '/v1/hesap/uyeliklerim', headers: bearer(accessToken) });
        expect((await kontrol()).statusCode).toBe(200);

        await ozel`insert into hesap.riza_metinleri (id, tur, surum, baslik, govde_markdown, govde_sha256, gecerli_baslangic_at, yayinlandi_at)
                   values (${uuidv7()}, 'kvkk_aydinlatma', '2099-01-01', 'Yeni', 'icerik', digest('icerik', 'sha256'), now() - interval '1 minute', now() - interval '1 minute')`;
        expect((await kontrol()).statusCode).toBe(403);
        await rizaKabulEt(ti, accessToken);
        expect((await kontrol()).statusCode).toBe(200);

        const guncel = (
          await ti.service.app.inject({
            url: '/v1/hesap/rizalar/guncel',
            headers: bearer(accessToken),
          })
        ).json<{ metinler: { id: string; surum: string }[] }>();
        expect(guncel.metinler[0]?.surum).toBe('2099-01-01');
        await ti.service.app.inject({
          method: 'POST',
          url: '/v1/hesap/rizalar',
          headers: bearer(accessToken),
          payload: { riza_metni_id: guncel.metinler[0]?.id, karar: 'geri_cekildi' },
        });
        expect((await kontrol()).statusCode).toBe(403);
        // defterde ucu kayit da (kabul, kabul, geri_cekildi) degismeden duruyor
        const [sayi] = await ozel<
          { n: number }[]
        >`select count(*)::int n from hesap.rizalar where kullanici_id = ${g.kullaniciId}`;
        expect(sayi?.n).toBe(3);
      } finally {
        await ti.service.stop();
        await ozel.end();
        await iz.temizle();
      }
    });

    it('riza defteri degistirilemez: UPDATE/DELETE tetikleyici ve yetkiyle engellenir', async () => {
      const g = await otpIleGiris(t);
      const { accessToken } = await tokenAl(t, g.oturum);
      await rizaKabulEt(t, accessToken);
      const metin = await hataMetni(
        sistem`delete from hesap.rizalar where kullanici_id = ${g.kullaniciId}`,
      );
      expect(metin).toMatch(/permission denied|defter_degistirilemez/);
    });
  });

  describe('kurum olusturma ve uyelikler', () => {
    it('bireysel: sahip + ogretmen uyeligi, kademe yok, tek varsayilan sube, olaylar outboxta', async () => {
      const k = await kurumluKullanici(t, 'bireysel', 'Ahmet Hoca');
      const uyelikler = await sistem<
        { rol: string; durum: string }[]
      >`select rol, durum from hesap.uyelikler where kurum_id = ${k.kurumId} order by rol`;
      expect(uyelikler).toEqual([
        { rol: 'ogretmen', durum: 'aktif' },
        { rol: 'sahip', durum: 'aktif' },
      ]);
      expect(
        (await sistem`select 1 from hesap.kademeler where kurum_id = ${k.kurumId}`).length,
      ).toBe(0);
      expect(
        (
          await sistem<{ ad: string }[]>`select ad from hesap.subeler where kurum_id = ${k.kurumId}`
        ).map((s) => s.ad),
      ).toEqual(['Merkez']);
      const olaylar = await sistem<
        { subject: string }[]
      >`select subject from ortak.outbox where kurum_id = ${k.kurumId} order by created_at`;
      expect(olaylar.map((o) => o.subject)).toEqual([
        'evt.hesap.kurum.degisti.v1',
        'evt.hesap.uyelik.degisti.v1',
        'evt.hesap.uyelik.degisti.v1',
      ]);
      const [denetim] = await sistem<
        { eylem: string; neden: string }[]
      >`select eylem, neden from hesap.denetim_kayitlari where kurum_id = ${k.kurumId}`;
      expect(denetim?.eylem).toBe('sistem.kurum_olustur');
      expect(denetim?.neden).toBeTruthy();
    });

    it('kurum: yalnizca sahip uyeligi ve varsayilan kademeler; token bireysel icin iki rol tasir', async () => {
      const k = await kurumluKullanici(t, 'kurum');
      expect(
        (
          await sistem<
            { rol: string }[]
          >`select rol from hesap.uyelikler where kurum_id = ${k.kurumId}`
        ).map((u) => u.rol),
      ).toEqual(['sahip']);
      expect(
        (
          await sistem<
            { n: number }[]
          >`select count(*)::int n from hesap.kademeler where kurum_id = ${k.kurumId}`
        )[0]?.n,
      ).toBe(9);
      const b = await kurumluKullanici(t, 'bireysel');
      const tok = await tokenAl(t, b.oturum, { kurum_id: b.kurumId });
      expect(tok.govde.roller.sort()).toEqual(['ogretmen', 'sahip']);
      expect(tok.govde.rol).toBe('sahip'); // varsayilan etkin uyelik: en yuksek oncelik
      const ogretmenUyelik = tok.govde.uyelikler.find((u) => u.rol === 'ogretmen')?.uyelik_id;
      const gecis = await tokenAl(t, b.oturum, { uyelik_id: ogretmenUyelik });
      expect(gecis.govde.rol).toBe('ogretmen');
    });

    it('uyeliklerim ve kurum bilgisi; PATCH logo/vurgu rengi; gecersiz renk 400; ogrenci PATCH yapamaz', async () => {
      const k = await kurumluKullanici(t, 'kurum', 'Boyalı Kurum');
      const benim = (
        await app.inject({ url: '/v1/hesap/uyeliklerim', headers: bearer(k.token) })
      ).json<{ uyelikler: { kurum_ad: string; rol: string }[] }>();
      expect(benim.uyelikler).toMatchObject([{ kurum_ad: 'Boyalı Kurum', rol: 'sahip' }]);

      const patch = await app.inject({
        method: 'PATCH',
        url: `/v1/hesap/kurumlar/${k.kurumId}`,
        headers: bearer(k.token),
        payload: { vurgu_rengi: '#0A84FF', logo_url: 'https://cdn.example.com/logo.png' },
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json<{ ayarlar: Record<string, string> }>().ayarlar).toEqual({
        vurgu_rengi: '#0A84FF',
        logo_url: 'https://cdn.example.com/logo.png',
      });
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/v1/hesap/kurumlar/${k.kurumId}`,
            headers: bearer(k.token),
            payload: { vurgu_rengi: 'mavi' },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/v1/hesap/kurumlar/${k.kurumId}`,
            headers: bearer(k.token),
            payload: {},
          })
        ).statusCode,
      ).toBe(400);

      // ad degisimi olay uretir, yalnizca ayar degisimi uretmez
      const once =
        (
          await sistem<
            { n: number }[]
          >`select count(*)::int n from ortak.outbox where kurum_id = ${k.kurumId} and subject = 'evt.hesap.kurum.degisti.v1'`
        )[0]?.n ?? 0;
      await app.inject({
        method: 'PATCH',
        url: `/v1/hesap/kurumlar/${k.kurumId}`,
        headers: bearer(k.token),
        payload: { ad: 'Yeni Ad' },
      });
      const sonra =
        (
          await sistem<
            { n: number }[]
          >`select count(*)::int n from ortak.outbox where kurum_id = ${k.kurumId} and subject = 'evt.hesap.kurum.degisti.v1'`
        )[0]?.n ?? 0;
      expect(sonra).toBe(once + 1);
    });
  });

  describe('izin kapisi ve kapsam', () => {
    /** Kurumda ogrenci/ogretmen uyeligi olan, giris yapmis ek kullanici ekler (davet akisi sonraki dalga). */
    async function uyeEkle(
      kurumId: string,
      rol: 'ogrenci' | 'ogretmen' | 'yonetici',
      subeId: string | null = null,
    ) {
      const g = await otpIleGiris(t);
      const ilk = await tokenAl(t, g.oturum);
      await rizaKabulEt(t, ilk.accessToken);
      const uyelikId = uuidv7();
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol, sube_id, gorunen_ad) values (${uyelikId}, ${kurumId}, ${g.kullaniciId}, ${rol}, ${subeId}, ${rol + ' ' + uyelikId.slice(-4)})`;
      const tok = await tokenAl(t, g.oturum, { kurum_id: kurumId });
      return { ...g, uyelikId, token: tok.accessToken };
    }

    it('ogrenci modul ayarini yazamaz (403 izin_yok), kurum bilgisini okuyabilir', async () => {
      const k = await kurumluKullanici(t, 'kurum');
      const ogr = await uyeEkle(k.kurumId, 'ogrenci');
      const yaz = await app.inject({
        method: 'PUT',
        url: `/v1/hesap/kurumlar/${k.kurumId}/modul-ayarlari`,
        headers: bearer(ogr.token),
        payload: { modul_kodu: 'odev', kapsam: 'kurum', acik: false },
      });
      expect(yaz.statusCode).toBe(403);
      expect(yaz.json<{ error: { code: string } }>().error.code).toBe('izin_yok');
      expect(
        (await app.inject({ url: `/v1/hesap/kurumlar/${k.kurumId}`, headers: bearer(ogr.token) }))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/v1/hesap/kurumlar/${k.kurumId}`,
            headers: bearer(ogr.token),
            payload: { ad: 'x' },
          })
        ).statusCode,
      ).toBe(403);
    });

    it('uye listesi kapsama gore daralir: sahip hepsini, ogrenci yalniz kendini, ogretmen kendi grubundakileri gorur', async () => {
      const k = await kurumluKullanici(t, 'kurum');
      const ogr1 = await uyeEkle(k.kurumId, 'ogrenci');
      const ogr2 = await uyeEkle(k.kurumId, 'ogrenci');
      const hoca = await uyeEkle(k.kurumId, 'ogretmen');
      const grupId = uuidv7();
      await sistem`insert into hesap.gruplar (id, kurum_id, tur, ad) values (${grupId}, ${k.kurumId}, 'grup', 'Mat')`;
      await sistem`insert into hesap.grup_uyeleri (id, kurum_id, grup_id, ogrenci_id) values (${uuidv7()}, ${k.kurumId}, ${grupId}, ${ogr1.uyelikId})`;
      await sistem`insert into hesap.atamalar (id, kurum_id, grup_id, ogretmen_id, brans_kodu) values (${uuidv7()}, ${k.kurumId}, ${grupId}, ${hoca.uyelikId}, 'matematik')`;

      const liste = async (token: string) => {
        const res = await app.inject({
          url: `/v1/hesap/kurumlar/${k.kurumId}/uyelikler`,
          headers: bearer(token),
        });
        expect(res.statusCode).toBe(200);
        return res.json<{ kapsam: string; uyeler: { uyelik_id: string }[] }>();
      };
      const sahip = await liste(k.token);
      expect(sahip.kapsam).toBe('kurum');
      expect(sahip.uyeler).toHaveLength(4);
      const ogrenci = await liste(ogr1.token);
      expect(ogrenci.kapsam).toBe('kendi');
      expect(ogrenci.uyeler.map((u) => u.uyelik_id)).toEqual([ogr1.uyelikId]);
      const ogretmen = await liste(hoca.token);
      expect(ogretmen.kapsam).toBe('grup');
      expect(ogretmen.uyeler.map((u) => u.uyelik_id).sort()).toEqual(
        [hoca.uyelikId, ogr1.uyelikId].sort(),
      );
      expect(ogretmen.uyeler.map((u) => u.uyelik_id)).not.toContain(ogr2.uyelikId);

      // sayfalama
      const sayfa = (
        await app.inject({
          url: `/v1/hesap/kurumlar/${k.kurumId}/uyelikler?limit=2`,
          headers: bearer(k.token),
        })
      ).json<{ uyeler: unknown[]; sonraki_imlec: string | null }>();
      expect(sayfa.uyeler).toHaveLength(2);
      expect(sayfa.sonraki_imlec).not.toBeNull();
    });

    it('sube bagli yonetici sube kapsaminda gorur', async () => {
      const k = await kurumluKullanici(t, 'kurum');
      const [sube] = await sistem<
        { id: string }[]
      >`select id from hesap.subeler where kurum_id = ${k.kurumId}`;
      const yon = await uyeEkle(k.kurumId, 'yonetici', sube?.id ?? null);
      const res = (
        await app.inject({
          url: `/v1/hesap/kurumlar/${k.kurumId}/uyelikler`,
          headers: bearer(yon.token),
        })
      ).json<{ kapsam: string; uyeler: unknown[] }>();
      expect(res.kapsam).toBe('sube');
      expect(res.uyeler).toHaveLength(1); // yalnizca kendisi (sube_id eslesen tek uyelik)
      // sube kapsamli yonetici kurum kapsami isteyen uc noktada reddedilir
      const yaz = await app.inject({
        method: 'PATCH',
        url: `/v1/hesap/kurumlar/${k.kurumId}`,
        headers: bearer(yon.token),
        payload: { ad: 'Yeni' },
      });
      expect(yaz.statusCode).toBe(403);
    });

    it('baska kurumun kimligi URLde 403, ayrilan uyelik anında izin kaybeder', async () => {
      const a = await kurumluKullanici(t, 'kurum');
      const b = await kurumluKullanici(t, 'kurum');
      expect(
        (await app.inject({ url: `/v1/hesap/kurumlar/${b.kurumId}`, headers: bearer(a.token) }))
          .statusCode,
      ).toBe(403);
      const hoca = await uyeEkle(a.kurumId, 'ogretmen');
      expect(
        (await app.inject({ url: `/v1/hesap/kurumlar/${a.kurumId}`, headers: bearer(hoca.token) }))
          .statusCode,
      ).toBe(200);
      await sistem`update hesap.uyelikler set durum = 'ayrildi', ayrildi_at = now() where id = ${hoca.uyelikId}`;
      expect(
        (await app.inject({ url: `/v1/hesap/kurumlar/${a.kurumId}`, headers: bearer(hoca.token) }))
          .statusCode,
      ).toBe(403);
    });

    it('kurum secilmemis token kiraci uc noktasinda 403 kurum_gerekli', async () => {
      const g = await otpIleGiris(t);
      const { accessToken } = await tokenAl(t, g.oturum);
      await rizaKabulEt(t, accessToken);
      const res = await app.inject({
        url: `/v1/hesap/kurumlar/${uuidv7()}`,
        headers: bearer(accessToken),
      });
      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('kurum_gerekli');
    });
  });

  describe('modul ayarlari onceligi (kurum > kademe > grup)', () => {
    async function hazirla() {
      const k = await kurumluKullanici(t, 'kurum');
      const kademe = await sistem<
        { id: string }[]
      >`select id from hesap.kademeler where kurum_id = ${k.kurumId} order by sira limit 2`;
      const [k1, k2] = [kademe[0]?.id ?? '', kademe[1]?.id ?? ''];
      const g1 = uuidv7();
      const g2 = uuidv7();
      await sistem`insert into hesap.gruplar (id, kurum_id, tur, ad, kademe_id) values (${g1}, ${k.kurumId}, 'grup', 'G1', ${k1}), (${g2}, ${k.kurumId}, 'grup', 'G2', ${k2})`;
      const yaz = (
        modul: string,
        kapsam: 'kurum' | 'kademe' | 'grup',
        kapsamId: string | undefined,
        acik: boolean | null,
      ) =>
        app.inject({
          method: 'PUT',
          url: `/v1/hesap/kurumlar/${k.kurumId}/modul-ayarlari`,
          headers: bearer(k.token),
          payload: { modul_kodu: modul, kapsam, kapsam_id: kapsamId, acik },
        });
      const etkin = (modul: string, kademeId?: string, grupId?: string) =>
        withTenant(appDb, { kurumId: k.kurumId, kullaniciId: k.kullaniciId }, (tx) =>
          modulAcikMi(tx, k.kurumId, modul as 'odev', {
            kademeId: kademeId ?? null,
            grupId: grupId ?? null,
          }),
        );
      return { k, k1, k2, g1, g2, yaz, etkin };
    }

    it('kayit yoksa acik (miras)', async () => {
      const { k1, g1, etkin } = await hazirla();
      expect(await etkin('odev')).toBe(true);
      expect(await etkin('odev', k1, g1)).toBe(true);
    });

    it('kurum kapaliysa her yerde kapali; alt duzeyi acmak 422 ust_duzey_kapali', async () => {
      const { k1, g1, yaz, etkin } = await hazirla();
      expect((await yaz('finans', 'kurum', undefined, false)).statusCode).toBe(200);
      expect(await etkin('finans')).toBe(false);
      expect(await etkin('finans', k1, g1)).toBe(false);
      const ac = await yaz('finans', 'kademe', k1, true);
      expect(ac.statusCode).toBe(422);
      expect(ac.json<{ error: { code: string } }>().error.code).toBe('ust_duzey_kapali');
      expect((await yaz('finans', 'grup', g1, true)).statusCode).toBe(422);
    });

    it('kademe kapaliysa yalniz o kademedeki gruplar kapali; grup kademesi otomatik cozulur', async () => {
      const { k1, k2, g1, g2, yaz, etkin } = await hazirla();
      expect((await yaz('odev', 'kademe', k1, false)).statusCode).toBe(200);
      expect(await etkin('odev')).toBe(true);
      expect(await etkin('odev', k1)).toBe(false);
      expect(await etkin('odev', undefined, g1)).toBe(false); // g1 -> k1
      expect(await etkin('odev', undefined, g2)).toBe(true);
      expect(await etkin('odev', k2, g2)).toBe(true);
      expect((await yaz('odev', 'grup', g1, true)).statusCode).toBe(422);
    });

    it('grup kapaliysa yalniz o grup kapali; mirasa donus satiri siler ve acar', async () => {
      const { g1, g2, yaz, etkin } = await hazirla();
      expect((await yaz('deneme', 'grup', g1, false)).statusCode).toBe(200);
      expect(await etkin('deneme', undefined, g1)).toBe(false);
      expect(await etkin('deneme', undefined, g2)).toBe(true);
      const geri = await yaz('deneme', 'grup', g1, null);
      expect(geri.json<{ ayar: null }>().ayar).toBeNull();
      expect(await etkin('deneme', undefined, g1)).toBe(true);
    });

    it('ust duzey acilinca alt duzeydeki kapatma devam eder (yalniz daraltir)', async () => {
      const { k1, yaz, etkin } = await hazirla();
      await yaz('plan_x_yok', 'kurum', undefined, false).catch(() => undefined);
      await yaz('haftalik_plan', 'kademe', k1, false);
      await yaz('haftalik_plan', 'kurum', undefined, true);
      expect(await etkin('haftalik_plan', k1)).toBe(false);
    });

    it('baska kurumun kademesi/grubu 404; modul kapaliyken ilgili izin 403 modul_kapali (izinden once)', async () => {
      const { k, yaz } = await hazirla();
      const diger = await kurumluKullanici(t, 'kurum');
      const [yabanci] = await sistem<
        { id: string }[]
      >`select id from hesap.kademeler where kurum_id = ${diger.kurumId} limit 1`;
      expect((await yaz('odev', 'kademe', yabanci?.id, false)).statusCode).toBe(404);
      expect((await yaz('odev', 'grup', uuidv7(), false)).statusCode).toBe(404);

      // modul.ayar.oku cekirdek; ogrenci rolunun 'finans.oku' izni var -> modul kapaninca 403 modul_kapali
      await yaz('finans', 'kurum', undefined, false);
      const kapali = await withTenant(
        appDb,
        { kurumId: k.kurumId, kullaniciId: k.kullaniciId },
        (tx) => modulAcikMi(tx, k.kurumId, 'finans'),
      );
      expect(kapali).toBe(false);
    });

    it('modul ayari olaylari outboxa yazilir (kapatma ve mirasa donus)', async () => {
      const { k, g1, yaz } = await hazirla();
      await yaz('duyuru', 'grup', g1, false);
      await yaz('duyuru', 'grup', g1, null);
      const satirlar = await sistem<
        { payload: { data: { acik: boolean | null } } }[]
      >`select payload from ortak.outbox where kurum_id = ${k.kurumId} and subject = 'evt.hesap.modul_ayari.degisti.v1' order by created_at`;
      expect(satirlar.map((s) => s.payload.data.acik)).toEqual([false, null]);
    });
  });

  describe('requirePermission: modul > izin sirasi', () => {
    it('modul kapaliyken izni olmayan rol de 403 modul_kapali alir; modul acilinca izin_yok', async () => {
      const { requirePermission } = await import('./modules/hesap/index.js');
      const k = await kurumluKullanici(t, 'kurum');
      const ogr = await otpIleGiris(t);
      const ogrUyelik = uuidv7();
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogrUyelik}, ${k.kurumId}, ${ogr.kullaniciId}, 'ogrenci')`;
      const put = (acik: boolean) =>
        app.inject({
          method: 'PUT',
          url: `/v1/hesap/kurumlar/${k.kurumId}/modul-ayarlari`,
          headers: bearer(k.token),
          payload: { modul_kodu: 'finans', kapsam: 'kurum', acik },
        });
      const kapi = requirePermission('finans.tahsilat.yaz');
      const cagir = (kullaniciId: string, uyelikId: string, rol: string) =>
        kapi.call(
          app,
          {
            auth: {
              kullaniciId,
              kurumId: k.kurumId,
              uyelikId,
              rol,
              sessionId: null,
              roller: [rol],
              claims: {},
            },
            params: {},
            method: 'POST',
            server: app,
          } as never,
          {} as never,
        );

      await put(false);
      await expect(cagir(ogr.kullaniciId, ogrUyelik, 'ogrenci')).rejects.toMatchObject({
        statusCode: 403,
        code: 'modul_kapali',
      });
      await expect(cagir(k.kullaniciId, k.uyelikId, 'sahip')).rejects.toMatchObject({
        statusCode: 403,
        code: 'modul_kapali',
      });
      await put(true);
      await expect(cagir(ogr.kullaniciId, ogrUyelik, 'ogrenci')).rejects.toMatchObject({
        statusCode: 403,
        code: 'izin_yok',
      });
      await expect(cagir(k.kullaniciId, k.uyelikId, 'sahip')).resolves.toBeUndefined();
    });
  });

  describe('outbox: is verisiyle ayni islemde', () => {
    it('islem geri alinirsa olay da yazilmaz; commit olursa ikisi birlikte yazilir', async () => {
      const k = await kurumluKullanici(t, 'kurum');
      const olayAdedi = async () =>
        (
          await sistem<
            { n: number }[]
          >`select count(*)::int n from ortak.outbox where kurum_id = ${k.kurumId} and subject = 'evt.hesap.kurum.degisti.v1'`
        )[0]?.n ?? 0;
      const once = await olayAdedi();
      const { olayYaz } = await import('./modules/hesap/olaylar.js');
      const baglam = {
        kurumId: k.kurumId,
        actor: { tur: 'kullanici' as const, id: k.kullaniciId },
        correlationId: 'test-1',
      };
      const veri = {
        kurum_id: k.kurumId,
        ad: 'Geri alinan',
        tur: 'kurum' as const,
        saat_dilimi: 'Europe/Istanbul',
        durum: 'aktif' as const,
      };

      await expect(
        withTenant(appDb, { kurumId: k.kurumId, kullaniciId: k.kullaniciId }, async (tx) => {
          await tx.update(kurumlar).set({ ad: 'Geri alinan' }).where(eq(kurumlar.id, k.kurumId));
          await olayYaz(tx, hesapKurumDegistiV1, baglam, veri);
          throw new Error('geri al');
        }),
      ).rejects.toThrow('geri al');
      expect(await olayAdedi()).toBe(once);
      const [ad] = await sistem<
        { ad: string }[]
      >`select ad from hesap.kurumlar where id = ${k.kurumId}`;
      expect(ad?.ad).not.toBe('Geri alinan');

      await withTenant(appDb, { kurumId: k.kurumId, kullaniciId: k.kullaniciId }, async (tx) => {
        await tx.update(kurumlar).set({ ad: 'Onaylanan' }).where(eq(kurumlar.id, k.kurumId));
        await olayYaz(tx, hesapKurumDegistiV1, baglam, { ...veri, ad: 'Onaylanan' });
      });
      expect(await olayAdedi()).toBe(once + 1);
      const [son] = await sistem<
        { payload: { kurumId: string; data: { ad: string }; actor: { id: string } } }[]
      >`select payload from ortak.outbox where kurum_id = ${k.kurumId} order by created_at desc limit 1`;
      expect(son?.payload.data.ad).toBe('Onaylanan');
      expect(son?.payload.actor.id).toBe(k.kullaniciId);
    });

    it('withSistem: nedensiz reddedilir, hata olursa denetim satiri da geri alinir', async () => {
      await expect(
        withSistem(sistemDb, { eylem: 'test.x', neden: '  ' }, () => Promise.resolve(1)),
      ).rejects.toThrow(/neden/);
      const eylem = `test.${uuidv7()}`;
      await expect(
        withSistem(sistemDb, { eylem, neden: 'deneme' }, () => Promise.reject(new Error('patla'))),
      ).rejects.toThrow('patla');
      expect(
        (await sistem`select 1 from hesap.denetim_kayitlari where eylem = ${eylem}`).length,
      ).toBe(0);
      await withSistem(sistemDb, { eylem, neden: 'deneme' }, () => Promise.resolve(1));
      expect(
        (await sistem`select 1 from hesap.denetim_kayitlari where eylem = ${eylem}`).length,
      ).toBe(1);
    });
  });

  it('OpenAPI: tum hesap ve kimlik rotalari semali yayimlanir', async () => {
    const res = await app.inject({ url: '/openapi.json' });
    const paths = Object.keys(res.json<{ paths: Record<string, unknown> }>().paths);
    for (const yol of [
      '/auth/otp/gonder',
      '/auth/otp/dogrula',
      '/auth/token',
      '/.well-known/jwks.json',
      '/v1/hesap/kurumlar',
      '/v1/hesap/kurumlar/{kurum_id}',
      '/v1/hesap/kurumlar/{kurum_id}/modul-ayarlari',
      '/v1/hesap/kurumlar/{kurum_id}/uyelikler',
      '/v1/hesap/rizalar/guncel',
      '/v1/hesap/ben',
    ]) {
      expect(paths).toContain(yol);
    }
  });
});
