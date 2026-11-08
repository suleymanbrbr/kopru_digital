import { createHash } from 'node:crypto';

import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bearer,
  dbYok,
  otpIleGiris,
  rastgeleTelefon,
  yeniIp,
  rizaKabulEt,
  testDb,
  testServisi,
  type KurumluKullanici,
  type TestServisi,
} from './test/yardimcilar.js';

interface Grup {
  id: string;
  uye_sayisi: number;
  durum: string;
}
interface Davet {
  davet: { id: string; durum: string; gonderim_sayisi: number; kullanim_sayisi: number };
  belirtec: string;
}
interface Hata {
  error: { code: string };
}

/** /auth/token IP basina dakikada 10 istekle sinirli: her cagri ayri istemci IP'si kullanir. */
async function tokenAl(
  { service }: TestServisi,
  oturum: string,
  govde: { kurum_id?: string } = {},
) {
  const res = await service.app.inject({
    method: 'POST',
    url: '/auth/token',
    remoteAddress: yeniIp(),
    headers: bearer(oturum),
    payload: govde,
  });
  if (res.statusCode !== 200) throw new Error(`token: ${res.body}`);
  const j = res.json<{ access_token: string; uyelik_id: string | null }>();
  return { accessToken: j.access_token, uyelikId: j.uyelik_id ?? '' };
}

async function kurumluKullanici(
  t: TestServisi,
  tur: 'bireysel' | 'ekip' | 'kurum' = 'kurum',
  ad = 'Test Kurumu',
): Promise<KurumluKullanici> {
  const giris = await otpIleGiris(t);
  const ilk = await tokenAl(t, giris.oturum);
  await rizaKabulEt(t, ilk.accessToken);
  const res = await t.service.app.inject({
    method: 'POST',
    url: '/v1/hesap/kurumlar',
    headers: bearer(ilk.accessToken),
    payload: { ad, tur },
  });
  if (res.statusCode !== 201) throw new Error(`kurum: ${res.body}`);
  const kurumId = res.json<{ kurum: { id: string } }>().kurum.id;
  const sonuc = await tokenAl(t, giris.oturum, { kurum_id: kurumId });
  return { ...giris, kurumId, token: sonuc.accessToken, uyelikId: sonuc.uyelikId };
}

describe.skipIf(dbYok())('hesap: gruplar, atamalar, davetler', () => {
  const urls = testDb();
  const t = testServisi();
  const { app } = t.service;
  let sistem: postgres.Sql;
  let appDb: Database;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    appDb = createDb({ url: urls.appUrl, max: 3 });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
    await appDb.close();
  });

  const api = (k: { kurumId: string }, yol: string) => `/v1/hesap/kurumlar/${k.kurumId}${yol}`;

  async function grupAc(k: KurumluKullanici, ek: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: api(k, '/gruplar'),
      headers: bearer(k.token),
      payload: { tur: 'sinif', ad: '6-A', ...ek },
    });
    expect(res.statusCode).toBe(201);
    return res.json<Grup>();
  }

  async function davetEt(k: KurumluKullanici, payload: Record<string, unknown>, token = k.token) {
    return app.inject({
      method: 'POST',
      url: api(k, '/davetler'),
      headers: bearer(token),
      payload,
    });
  }

  /** Yeni kullanici: giris + KVKK; daveti kabul eder ve kurum bagli token alir. */
  async function kabulEt(belirtec: string, kurumId?: string) {
    const g = await otpIleGiris(t);
    const ilk = await tokenAl(t, g.oturum);
    await rizaKabulEt(t, ilk.accessToken);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/hesap/davetler/kabul',
      headers: bearer(ilk.accessToken),
      payload: { belirtec },
    });
    const kurumToken =
      res.statusCode === 200 && kurumId
        ? (await tokenAl(t, g.oturum, { kurum_id: kurumId })).accessToken
        : null;
    return { g, res, ilk: ilk.accessToken, token: kurumToken };
  }

  async function ekle(k: KurumluKullanici, rol: 'ogrenci' | 'ogretmen', ek = {}) {
    const d = (await davetEt(k, { kanal: 'baglanti', rol, ...ek })).json<Davet>();
    const r = await kabulEt(d.belirtec, k.kurumId);
    expect(r.res.statusCode).toBe(200);
    return { ...r, uyelikId: r.res.json<{ uyelik_id: string }>().uyelik_id, davet: d };
  }

  describe('gruplar', () => {
    it('CRUD, coklu ekleme, kapasite, cikarma ve arsivleme; olaylar outbox ta', async () => {
      const k = await kurumluKullanici(t);
      const grup = await grupAc(k, { kapasite: 2 });
      const o1 = await ekle(k, 'ogrenci');
      const o2 = await ekle(k, 'ogrenci');
      const o3 = await ekle(k, 'ogrenci');

      const gec = await app.inject({
        method: 'POST',
        url: api(k, `/gruplar/${grup.id}/uyeler`),
        headers: bearer(k.token),
        payload: { ogrenci_idleri: [o1.uyelikId, o2.uyelikId, o3.uyelikId] },
      });
      expect(gec.statusCode).toBe(409);
      expect(gec.json<Hata>().error.code).toBe('kapasite_dolu');

      const ok = await app.inject({
        method: 'POST',
        url: api(k, `/gruplar/${grup.id}/uyeler`),
        headers: bearer(k.token),
        payload: { ogrenci_idleri: [o1.uyelikId, o2.uyelikId] },
      });
      expect(ok.statusCode).toBe(201);
      expect(ok.json<{ eklenenler: unknown[] }>().eklenenler).toHaveLength(2);
      const tekrar = await app.inject({
        method: 'POST',
        url: api(k, `/gruplar/${grup.id}/uyeler`),
        headers: bearer(k.token),
        payload: { ogrenci_idleri: [o1.uyelikId] },
      });
      expect(tekrar.json<{ zaten_uye: string[] }>().zaten_uye).toEqual([o1.uyelikId]);

      const cikar = await app.inject({
        method: 'DELETE',
        url: api(k, `/gruplar/${grup.id}/uyeler/${o1.uyelikId}`),
        headers: bearer(k.token),
      });
      expect(cikar.statusCode).toBe(200);
      expect(cikar.json<{ bitis_tarihi: string | null }>().bitis_tarihi).toMatch(/^\d{4}-/);
      const tekil = await app.inject({
        url: api(k, `/gruplar/${grup.id}`),
        headers: bearer(k.token),
      });
      expect(tekil.json<Grup>().uye_sayisi).toBe(1);

      const guncel = await app.inject({
        method: 'PATCH',
        url: api(k, `/gruplar/${grup.id}`),
        headers: bearer(k.token),
        payload: { ad: '6-B', renk: '#112233' },
      });
      expect(guncel.json<{ ad: string }>().ad).toBe('6-B');
      const arsiv = await app.inject({
        method: 'POST',
        url: api(k, `/gruplar/${grup.id}/arsivle`),
        headers: bearer(k.token),
      });
      expect(arsiv.json<Grup>().durum).toBe('arsiv');
      const liste = await app.inject({ url: api(k, '/gruplar'), headers: bearer(k.token) });
      expect(liste.json<{ gruplar: Grup[] }>().gruplar).toHaveLength(0);
      const arsivli = await app.inject({
        url: api(k, '/gruplar?durum=arsiv'),
        headers: bearer(k.token),
      });
      expect(arsivli.json<{ gruplar: Grup[] }>().gruplar).toHaveLength(1);
      const arsivEkle = await app.inject({
        method: 'POST',
        url: api(k, `/gruplar/${grup.id}/uyeler`),
        headers: bearer(k.token),
        payload: { ogrenci_idleri: [o3.uyelikId] },
      });
      expect(arsivEkle.json<Hata>().error.code).toBe('grup_arsivde');

      const olaylar = await sistem<{ subject: string }[]>`
        select subject from ortak.outbox where kurum_id = ${k.kurumId} and subject like 'evt.hesap.grup%' order by created_at`;
      const konular = olaylar.map((o) => o.subject);
      expect(konular.filter((s) => s === 'evt.hesap.grup.degisti.v1')).toHaveLength(3);
      expect(konular.filter((s) => s === 'evt.hesap.grup_uyesi.degisti.v1')).toHaveLength(3);
    });

    it('yetkisiz roller: ogrenci grup acamaz, ogretmen grup acamaz', async () => {
      const k = await kurumluKullanici(t);
      const ogr = await ekle(k, 'ogrenci');
      const hoca = await ekle(k, 'ogretmen');
      for (const token of [ogr.token, hoca.token]) {
        const res = await app.inject({
          method: 'POST',
          url: api(k, '/gruplar'),
          headers: bearer(token ?? ''),
          payload: { tur: 'grup', ad: 'X' },
        });
        expect(res.statusCode).toBe(403);
      }
    });

    it('solo hoca: bireysel kurumda gruplu olmayan ogrenci davetle kabulde birebir grup alir', async () => {
      const k = await kurumluKullanici(t, 'bireysel');
      const ogr = await ekle(k, 'ogrenci');
      const kabul = ogr.res.json<{ grup_id: string | null; grup_uyesi_id: string | null }>();
      expect(kabul.grup_id).not.toBeNull();
      const [g] = await sistem<
        { tur: string; kapasite: number }[]
      >`select tur, kapasite from hesap.gruplar where id = ${kabul.grup_id}`;
      expect(g).toEqual({ tur: 'birebir', kapasite: 1 });
    });
  });

  describe('davetler', () => {
    it('belirtec yalniz hash olarak saklanir; telefon ve e-posta kanali; sahip davet edilemez', async () => {
      const k = await kurumluKullanici(t);
      const sms = await davetEt(k, { kanal: 'sms', rol: 'ogrenci', telefon: '0532 111 22 33' });
      expect(sms.statusCode).toBe(201);
      const d = sms.json<Davet & { gonderim: string }>();
      expect(d.gonderim).toBe('gonderildi');
      expect(t.sms.mesajlar.at(-1)?.telefon).toBe('+905321112233');
      expect(t.sms.mesajlar.at(-1)?.metin).toContain(d.belirtec);
      const [satir] = await sistem<{ belirtec_hash: Buffer; n: number }[]>`
        select belirtec_hash, (select count(*)::int from hesap.davetler where kurum_id = ${k.kurumId} and position(${d.belirtec} in hedef_ad) > 0) n
        from hesap.davetler where id = ${d.davet.id}`;
      expect(satir?.belirtec_hash.equals(createHash('sha256').update(d.belirtec).digest())).toBe(
        true,
      );

      const em = await davetEt(k, { kanal: 'eposta', rol: 'ogretmen', eposta: 'Hoca@Ornek.com' });
      expect(em.statusCode).toBe(201);
      expect(em.json<{ davet: { hedef_eposta: string } }>().davet.hedef_eposta.toLowerCase()).toBe(
        'hoca@ornek.com',
      );
      expect((await davetEt(k, { kanal: 'eposta', rol: 'ogrenci' })).statusCode).toBe(400);
      expect((await davetEt(k, { kanal: 'sms', rol: 'ogrenci', telefon: '123' })).statusCode).toBe(
        400,
      );
      expect((await davetEt(k, { kanal: 'baglanti', rol: 'sahip' })).statusCode).toBe(400);
      expect(
        (
          await davetEt(k, {
            kanal: 'sms',
            rol: 'ogrenci',
            telefon: rastgeleTelefon(),
            max_kullanim: 5,
          })
        ).statusCode,
      ).toBe(400);
    });

    it('kabul: uyelik + gruba ekleme + olay; ikinci kabul, iptal ve suresi dolmus 410', async () => {
      const k = await kurumluKullanici(t);
      const grup = await grupAc(k);
      const d = (
        await davetEt(k, {
          kanal: 'sms',
          rol: 'ogrenci',
          telefon: rastgeleTelefon(),
          grup_id: grup.id,
        })
      ).json<Davet>();
      const r = await kabulEt(d.belirtec, k.kurumId);
      expect(r.res.statusCode).toBe(200);
      const kabul = r.res.json<{ uyelik_id: string; grup_uyesi_id: string; rol: string }>();
      expect(kabul.rol).toBe('ogrenci');
      const [gu] = await sistem<
        { katilim_yolu: string }[]
      >`select katilim_yolu from hesap.grup_uyeleri where id = ${kabul.grup_uyesi_id}`;
      expect(gu?.katilim_yolu).toBe('davet');

      // tekrar kabul (tek kullanimlik)
      const tekrar = await kabulEt(d.belirtec);
      expect(tekrar.res.statusCode).toBe(410);
      expect(tekrar.res.json<Hata>().error.code).toBe('davet_gecersiz');
      expect((await kabulEt('x'.repeat(43))).res.statusCode).toBe(410);

      // iptal
      const d2 = (await davetEt(k, { kanal: 'baglanti', rol: 'ogrenci' })).json<Davet>();
      const iptal = await app.inject({
        method: 'POST',
        url: api(k, `/davetler/${d2.davet.id}/iptal`),
        headers: bearer(k.token),
      });
      expect(iptal.json<{ durum: string }>().durum).toBe('iptal');
      expect((await kabulEt(d2.belirtec)).res.statusCode).toBe(410);

      // suresi dolmus
      const d3 = (await davetEt(k, { kanal: 'baglanti', rol: 'ogrenci' })).json<Davet>();
      await sistem`update hesap.davetler set expires_at = now() - interval '1 minute' where id = ${d3.davet.id}`;
      expect((await kabulEt(d3.belirtec)).res.statusCode).toBe(410);
      const dolmus = await app.inject({
        url: api(k, '/davetler?durum=suresi_doldu'),
        headers: bearer(k.token),
      });
      expect(dolmus.json<{ davetler: { id: string }[] }>().davetler.map((x) => x.id)).toEqual([
        d3.davet.id,
      ]);
      const bekleyen = await app.inject({
        url: api(k, '/davetler?durum=bekliyor'),
        headers: bearer(k.token),
      });
      expect(bekleyen.json<{ davetler: { id: string }[] }>().davetler).toHaveLength(0);
      const kullanilan = await app.inject({
        url: api(k, '/davetler?durum=kullanildi'),
        headers: bearer(k.token),
      });
      expect(kullanilan.json<{ davetler: unknown[] }>().davetler).toHaveLength(1);

      const olay = await sistem<{ payload: { data: Record<string, unknown> } }[]>`
        select payload from ortak.outbox where kurum_id = ${k.kurumId} and subject = 'evt.hesap.davet.kabul_edildi.v1'`;
      expect(olay).toHaveLength(1);
      expect(Object.keys(olay[0]?.payload.data ?? {}).sort()).toEqual([
        'davet_eden_id',
        'davet_id',
        'rol',
        'uyelik_id',
      ]);
    });

    it('cok kullanimli baglanti: limitte durur; ayni kullanici ikinci kez 409; yaris tek kazanan', async () => {
      const k = await kurumluKullanici(t);
      const d = (
        await davetEt(k, { kanal: 'baglanti', rol: 'ogrenci', max_kullanim: 2 })
      ).json<Davet>();
      expect((await kabulEt(d.belirtec)).res.statusCode).toBe(200);
      expect((await kabulEt(d.belirtec)).res.statusCode).toBe(200);
      expect((await kabulEt(d.belirtec)).res.statusCode).toBe(410);

      const tek = (await davetEt(k, { kanal: 'baglanti', rol: 'ogrenci' })).json<Davet>();
      const hazir = await Promise.all([otpIleGiris(t), otpIleGiris(t), otpIleGiris(t)]);
      const tokenlar = await Promise.all(
        hazir.map(async (g) => {
          const ilk = await tokenAl(t, g.oturum);
          await rizaKabulEt(t, ilk.accessToken);
          return ilk.accessToken;
        }),
      );
      const sonuc = await Promise.all(
        tokenlar.map((token) =>
          app.inject({
            method: 'POST',
            url: '/v1/hesap/davetler/kabul',
            headers: bearer(token),
            payload: { belirtec: tek.belirtec },
          }),
        ),
      );
      expect(sonuc.map((r) => r.statusCode).sort()).toEqual([200, 410, 410]);

      // ayni kullanici ayni role iki kez: 409 ve davet tuketilmez
      const d3 = (
        await davetEt(k, { kanal: 'baglanti', rol: 'ogrenci', max_kullanim: 3 })
      ).json<Davet>();
      const g = await otpIleGiris(t);
      const ilk = await tokenAl(t, g.oturum);
      await rizaKabulEt(t, ilk.accessToken);
      const kabul = () =>
        app.inject({
          method: 'POST',
          url: '/v1/hesap/davetler/kabul',
          headers: bearer(ilk.accessToken),
          payload: { belirtec: d3.belirtec },
        });
      expect((await kabul()).statusCode).toBe(200);
      const ikinci = await kabul();
      expect(ikinci.statusCode).toBe(409);
      expect(ikinci.json<Hata>().error.code).toBe('zaten_uye');
      const [sayi] = await sistem<
        { kullanim_sayisi: number }[]
      >`select kullanim_sayisi from hesap.davetler where id = ${d3.davet.id}`;
      expect(sayi?.kullanim_sayisi).toBe(1);
    });

    it('KVKK onayi olmadan kabul edilemez; belirtecsiz istek 401', async () => {
      const k = await kurumluKullanici(t);
      const d = (await davetEt(k, { kanal: 'baglanti', rol: 'ogrenci' })).json<Davet>();
      const g = await otpIleGiris(t);
      const ilk = await tokenAl(t, g.oturum);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/hesap/davetler/kabul',
        headers: bearer(ilk.accessToken),
        payload: { belirtec: d.belirtec },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json<Hata>().error.code).toBe('riza_gerekli');
      const anon = await app.inject({
        method: 'POST',
        url: '/v1/hesap/davetler/kabul',
        payload: { belirtec: d.belirtec },
      });
      expect(anon.statusCode).toBe(401);
    });

    it('yeniden gonderme: yeni belirtec, eski gecersiz, en cok 3 gonderim; baglanti kanali 422', async () => {
      const k = await kurumluKullanici(t);
      const d = (
        await davetEt(k, { kanal: 'sms', rol: 'ogrenci', telefon: rastgeleTelefon() })
      ).json<Davet>();
      const yeniden = () =>
        app.inject({
          method: 'POST',
          url: api(k, `/davetler/${d.davet.id}/yeniden-gonder`),
          headers: bearer(k.token),
        });
      const r2 = await yeniden();
      expect(r2.statusCode).toBe(200);
      const j2 = r2.json<Davet>();
      expect(j2.davet.gonderim_sayisi).toBe(2);
      expect(j2.belirtec).not.toBe(d.belirtec);
      expect((await yeniden()).json<Davet>().davet.gonderim_sayisi).toBe(3);
      const asim = await yeniden();
      expect(asim.statusCode).toBe(429);
      expect(asim.json<Hata>().error.code).toBe('gonderim_siniri_asildi');
      expect((await kabulEt(d.belirtec)).res.statusCode).toBe(410);

      const b = (await davetEt(k, { kanal: 'baglanti', rol: 'ogrenci' })).json<Davet>();
      const r = await app.inject({
        method: 'POST',
        url: api(k, `/davetler/${b.davet.id}/yeniden-gonder`),
        headers: bearer(k.token),
      });
      expect(r.statusCode).toBe(422);
    });
  });

  describe('atamalar ve ogretmen kapsami', () => {
    it('ogretmen yalniz atandigi gruplari, davetleri ve atamalari gorur; bitirince kapsam duser', async () => {
      const k = await kurumluKullanici(t);
      const gA = await grupAc(k, { ad: 'A sinifi' });
      const gB = await grupAc(k, { ad: 'B sinifi' });
      const hoca = await ekle(k, 'ogretmen');
      const hocaToken = hoca.token ?? '';
      const ogr = await ekle(k, 'ogrenci');
      await app.inject({
        method: 'POST',
        url: api(k, `/gruplar/${gA.id}/uyeler`),
        headers: bearer(k.token),
        payload: { ogrenci_idleri: [ogr.uyelikId] },
      });

      const gruplariGor = async () =>
        (await app.inject({ url: api(k, '/gruplar'), headers: bearer(hocaToken) })).json<{
          gruplar: Grup[];
          kapsam: string;
        }>();
      expect((await gruplariGor()).gruplar).toHaveLength(0);

      const ata = await app.inject({
        method: 'POST',
        url: api(k, `/gruplar/${gA.id}/atamalar`),
        headers: bearer(k.token),
        payload: { ogretmen_id: hoca.uyelikId, brans_kodu: 'matematik', ana_ogretmen: true },
      });
      expect(ata.statusCode).toBe(201);
      const atama = ata.json<{ id: string }>();
      const gorulen = await gruplariGor();
      expect(gorulen.kapsam).toBe('grup');
      expect(gorulen.gruplar.map((g) => g.id)).toEqual([gA.id]);

      // atanmadigi grup: tekil 404, uye listesi 404, atama listesi bos, yazma 403
      for (const yol of [
        `/gruplar/${gB.id}`,
        `/gruplar/${gB.id}/uyeler`,
        `/gruplar/${gB.id}/atamalar`,
      ]) {
        expect(
          (await app.inject({ url: api(k, yol), headers: bearer(hocaToken) })).statusCode,
        ).toBe(404);
      }
      const atamalar = await app.inject({ url: api(k, '/atamalar'), headers: bearer(hocaToken) });
      expect(
        atamalar.json<{ atamalar: { grup_id: string }[] }>().atamalar.map((a) => a.grup_id),
      ).toEqual([gA.id]);
      expect(
        (
          await app.inject({ url: api(k, `/gruplar/${gA.id}/uyeler`), headers: bearer(hocaToken) })
        ).json<{ uyeler: unknown[] }>().uyeler,
      ).toHaveLength(1);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: api(k, `/gruplar/${gA.id}/atamalar`),
            headers: bearer(hocaToken),
            payload: { ogretmen_id: hoca.uyelikId, brans_kodu: 'fizik' },
          })
        ).statusCode,
      ).toBe(403);

      // davet kapsami: kendi grubuna ogrenci davet eder; baska gruba 404; grupsuz/ogretmen daveti 403
      const kendi = await davetEt(
        k,
        { kanal: 'baglanti', rol: 'ogrenci', grup_id: gA.id },
        hocaToken,
      );
      expect(kendi.statusCode).toBe(201);
      expect(
        (await davetEt(k, { kanal: 'baglanti', rol: 'ogrenci', grup_id: gB.id }, hocaToken))
          .statusCode,
      ).toBe(404);
      expect((await davetEt(k, { kanal: 'baglanti', rol: 'ogrenci' }, hocaToken)).statusCode).toBe(
        403,
      );
      expect((await davetEt(k, { kanal: 'baglanti', rol: 'ogretmen' }, hocaToken)).statusCode).toBe(
        403,
      );
      const digerDavet = (
        await davetEt(k, { kanal: 'baglanti', rol: 'ogrenci', grup_id: gB.id })
      ).json<Davet>();
      const davetListe = await app.inject({ url: api(k, '/davetler'), headers: bearer(hocaToken) });
      const idler = davetListe.json<{ davetler: { id: string }[] }>().davetler.map((d) => d.id);
      expect(idler).toContain(kendi.json<Davet>().davet.id);
      expect(idler).not.toContain(digerDavet.davet.id);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: api(k, `/davetler/${digerDavet.davet.id}/iptal`),
            headers: bearer(hocaToken),
          })
        ).statusCode,
      ).toBe(404);

      // ana ogretmen tekilligi ve ayni atama cakismasi
      const hoca2 = await ekle(k, 'ogretmen');
      const cakisanAna = await app.inject({
        method: 'POST',
        url: api(k, `/gruplar/${gA.id}/atamalar`),
        headers: bearer(k.token),
        payload: { ogretmen_id: hoca2.uyelikId, brans_kodu: 'matematik', ana_ogretmen: true },
      });
      expect(cakisanAna.statusCode).toBe(409);
      expect(cakisanAna.json<Hata>().error.code).toBe('atama_cakisiyor');
      const tekrarAtama = await app.inject({
        method: 'POST',
        url: api(k, `/gruplar/${gA.id}/atamalar`),
        headers: bearer(k.token),
        payload: { ogretmen_id: hoca.uyelikId, brans_kodu: 'matematik' },
      });
      expect(tekrarAtama.statusCode).toBe(409);
      expect(tekrarAtama.json<Hata>().error.code).toBe('atama_cakisiyor');
      for (const ek of [{}, { ana_ogretmen: true }, { ana_ogretmen: false }]) {
        const tekrar = await app.inject({
          method: 'POST',
          url: api(k, `/gruplar/${gA.id}/atamalar`),
          headers: bearer(k.token),
          payload: { ogretmen_id: hoca.uyelikId, brans_kodu: 'matematik', ...ek },
        });
        expect(tekrar.statusCode, JSON.stringify(ek)).toBe(409);
        expect(tekrar.json<Hata>().error.code).toBe('atama_cakisiyor');
      }
      expect(
        (
          await app.inject({
            method: 'POST',
            url: api(k, `/gruplar/${gA.id}/atamalar`),
            headers: bearer(k.token),
            payload: { ogretmen_id: hoca2.uyelikId, brans_kodu: 'yok_boyle_brans' },
          })
        ).statusCode,
      ).toBe(422);
      // ogrenci ogretmen olarak atanamaz
      expect(
        (
          await app.inject({
            method: 'POST',
            url: api(k, `/gruplar/${gA.id}/atamalar`),
            headers: bearer(k.token),
            payload: { ogretmen_id: ogr.uyelikId, brans_kodu: 'fizik' },
          })
        ).statusCode,
      ).toBe(404);

      // bitir: kapsam hemen duser, tekrar etkisiz
      const bitir = () =>
        app.inject({
          method: 'POST',
          url: api(k, `/atamalar/${atama.id}/bitir`),
          headers: bearer(k.token),
        });
      expect((await bitir()).json<{ bitis_tarihi: string | null }>().bitis_tarihi).not.toBeNull();
      const b2 = await bitir();
      expect(b2.statusCode, b2.body).toBe(200);
      expect((await gruplariGor()).gruplar).toHaveLength(0);

      const olaylar = await sistem<{ payload: { data: Record<string, unknown> } }[]>`
        select payload from ortak.outbox where kurum_id = ${k.kurumId} and subject = 'evt.hesap.atama.degisti.v1' order by created_at`;
      expect(olaylar).toHaveLength(2);
      expect(olaylar[1]?.payload.data.bitis_tarihi).not.toBeNull();
    });

    it('ogrenci yalniz uyesi oldugu grubu ve yalniz kendini gorur', async () => {
      const k = await kurumluKullanici(t);
      const g1 = await grupAc(k, { ad: 'Benim' });
      const g2 = await grupAc(k, { ad: 'Baska' });
      const a = await ekle(k, 'ogrenci', { grup_id: g1.id });
      await ekle(k, 'ogrenci', { grup_id: g1.id });
      const token = a.token ?? '';
      const liste = await app.inject({ url: api(k, '/gruplar'), headers: bearer(token) });
      expect(liste.json<{ gruplar: Grup[] }>().gruplar.map((g) => g.id)).toEqual([g1.id]);
      expect(
        (await app.inject({ url: api(k, `/gruplar/${g2.id}`), headers: bearer(token) })).statusCode,
      ).toBe(404);
      const uyeler = await app.inject({
        url: api(k, `/gruplar/${g1.id}/uyeler`),
        headers: bearer(token),
      });
      expect(
        uyeler.json<{ uyeler: { ogrenci_id: string }[] }>().uyeler.map((u) => u.ogrenci_id),
      ).toEqual([a.uyelikId]);
    });
  });

  describe('kiraci izolasyonu', () => {
    it('B kurumunun belirteci A nin grup, davet ve atamalarini goremez/degistiremez (404/403)', async () => {
      const a = await kurumluKullanici(t, 'kurum', 'A Kurumu');
      const b = await kurumluKullanici(t, 'kurum', 'B Kurumu');
      const grup = await grupAc(a);
      const hoca = await ekle(a, 'ogretmen');
      const atama = (
        await app.inject({
          method: 'POST',
          url: api(a, `/gruplar/${grup.id}/atamalar`),
          headers: bearer(a.token),
          payload: { ogretmen_id: hoca.uyelikId, brans_kodu: 'matematik' },
        })
      ).json<{ id: string }>();
      const davet = (await davetEt(a, { kanal: 'baglanti', rol: 'ogrenci' })).json<Davet>();

      // URL'deki kurum baska: 403
      expect(
        (await app.inject({ url: api(a, '/gruplar'), headers: bearer(b.token) })).statusCode,
      ).toBe(403);
      // B kendi kurumunda A nin kimliklerini arar: 404
      const yollar: [string, string][] = [
        ['GET', `/gruplar/${grup.id}`],
        ['GET', `/gruplar/${grup.id}/uyeler`],
        ['GET', `/gruplar/${grup.id}/atamalar`],
        ['PATCH', `/gruplar/${grup.id}`],
        ['POST', `/gruplar/${grup.id}/arsivle`],
        ['POST', `/atamalar/${atama.id}/bitir`],
        ['POST', `/davetler/${davet.davet.id}/iptal`],
        ['POST', `/davetler/${davet.davet.id}/yeniden-gonder`],
      ];
      for (const [method, yol] of yollar) {
        const res = await app.inject({
          method: method as 'GET',
          url: api(b, yol),
          headers: bearer(b.token),
          payload: method === 'PATCH' ? { ad: 'ele gecirildi' } : undefined,
        });
        expect(res.statusCode, `${method} ${yol}`).toBe(404);
      }
      for (const yol of ['/gruplar', '/atamalar', '/davetler']) {
        const res = await app.inject({ url: api(b, yol), headers: bearer(b.token) });
        expect(res.statusCode).toBe(200);
        const govde = res.json<Record<string, unknown>>();
        const liste = govde.gruplar ?? govde.atamalar ?? govde.davetler;
        expect(liste).toEqual([]);
      }
      const hala = await sistem<
        { ad: string }[]
      >`select ad from hesap.gruplar where id = ${grup.id}`;
      expect(hala[0]?.ad).toBe('6-A');
    });

    it('RLS: davetler B baglaminda gorunmez ve guncellenemez (api_app dogrudan)', async () => {
      const a = await kurumluKullanici(t);
      const b = await kurumluKullanici(t);
      const davet = (await davetEt(a, { kanal: 'baglanti', rol: 'ogrenci' })).json<Davet>();
      const ctxB = { kurumId: b.kurumId, kullaniciId: b.kullaniciId };
      const gor = await withTenant(appDb, ctxB, (tx) =>
        tx.execute(sql`select id from hesap.davetler where id = ${davet.davet.id}`),
      );
      expect(gor).toHaveLength(0);
      const upd = await withTenant(appDb, ctxB, (tx) =>
        tx.execute(
          sql`update hesap.davetler set durum = 'iptal' where id = ${davet.davet.id} returning id`,
        ),
      );
      expect(upd).toHaveLength(0);
      await expect(
        withTenant(appDb, ctxB, (tx) =>
          tx.execute(
            sql`insert into hesap.davetler (id, kurum_id, kanal, rol, belirtec_hash, davet_eden_id, expires_at)
                values (${uuidv7()}, ${a.kurumId}, 'baglanti', 'ogrenci', ${Buffer.from('x')}, ${a.uyelikId}, now())`,
          ),
        ),
      ).rejects.toThrow();
    });

    it('davet_coz yalniz dar kimlik doner ve hata durumlarinda satir yok', async () => {
      const a = await kurumluKullanici(t);
      const davet = (await davetEt(a, { kanal: 'baglanti', rol: 'ogrenci' })).json<Davet>();
      const hash = createHash('sha256').update(davet.belirtec).digest();
      const satir = await appDb.orm.execute(sql`select * from hesap.davet_coz(${hash})`);
      expect(Object.keys(satir[0] ?? {}).sort()).toEqual([
        'davet_id',
        'durum',
        'expires_at',
        'kurum_id',
      ]);
    });
  });

  it('outbox yukleri kisisel veri tasimaz (telefon, e-posta, belirtec)', async () => {
    const k = await kurumluKullanici(t);
    const tel = rastgeleTelefon();
    const grup = await grupAc(k);
    const d = (
      await davetEt(k, {
        kanal: 'sms',
        rol: 'ogrenci',
        telefon: tel,
        hedef_ad: 'Zeynep Kaya',
        grup_id: grup.id,
      })
    ).json<Davet>();
    await kabulEt(d.belirtec, k.kurumId);
    const satirlar = await sistem<{ p: string }[]>`
      select payload::text p from ortak.outbox
      where kurum_id = ${k.kurumId} and subject in
        ('evt.hesap.grup.degisti.v1','evt.hesap.grup_uyesi.degisti.v1','evt.hesap.atama.degisti.v1','evt.hesap.davet.kabul_edildi.v1')`;
    expect(satirlar.length).toBeGreaterThanOrEqual(3);
    for (const s of satirlar) {
      expect(s.p).not.toContain(tel);
      expect(s.p).not.toContain('Zeynep');
      expect(s.p).not.toContain(d.belirtec);
      expect(s.p).not.toContain('@');
    }
  });

  it('OpenAPI: grup, atama ve davet rotalari yayimlanir', async () => {
    const res = await app.inject({ url: '/openapi.json' });
    const paths = Object.keys(res.json<{ paths: Record<string, unknown> }>().paths);
    for (const yol of [
      '/v1/hesap/kurumlar/{kurum_id}/gruplar',
      '/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/uyeler',
      '/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/atamalar',
      '/v1/hesap/kurumlar/{kurum_id}/atamalar/{atama_id}/bitir',
      '/v1/hesap/kurumlar/{kurum_id}/davetler',
      '/v1/hesap/kurumlar/{kurum_id}/davetler/{davet_id}/yeniden-gonder',
      '/v1/hesap/davetler/kabul',
    ]) {
      expect(paths).toContain(yol);
    }
  });
});
