import { MODUL_KODLARI } from '@kopru/contracts';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bearer,
  dbYok,
  kurumluKullanici,
  otpIleGiris,
  rizaKabulEt,
  testDb,
  testServisi,
  yeniIp,
  type KurumluKullanici,
  type TestServisi,
} from './test/yardimcilar.js';

interface Hata {
  error: { code: string };
}
interface TopluSonuc {
  sonuclar: {
    sira: number;
    durum: 'basarili' | 'hata';
    belirtec: string | null;
    hata_kodu: string | null;
    davet: { id: string } | null;
  }[];
  basarili_sayisi: number;
  hata_sayisi: number;
}
interface OturumListe {
  oturumlar: { id: string; bu_oturum: boolean; cihaz: string | null; ip_maskeli: string | null }[];
}

async function tokenAl(
  { service }: TestServisi,
  oturum: string,
  govde: { kurum_id?: string } = {},
): Promise<{ accessToken: string; uyelikId: string }> {
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

/** Erisim belirtecindeki oturum kimligi (sid claim). */
const sidOku = (jwt: string): string =>
  (JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString()) as { sid: string }).sid;

describe.skipIf(dbYok())('hesap: oturum yonetimi, toplu davet, toplu modul', () => {
  const urls = testDb();
  const t = testServisi({ WEB_URL: 'https://web.test/' });
  const { app } = t.service;
  let sistem: postgres.Sql;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
  });

  const ben = (token: string) =>
    app.inject({ url: '/v1/hesap/ben', headers: bearer(token) }).then((r) => r.statusCode);

  /** Ayni telefonla n oturum acar; her biri icin oturum belirteci, erisim belirteci ve oturum id'si. */
  async function oturumlar(n: number) {
    const ilk = await otpIleGiris(t);
    const hepsi = [ilk];
    for (let i = 1; i < n; i++) hepsi.push(await otpIleGiris(t, ilk.telefon));
    const sonuc: { oturum: string; token: string; sid: string }[] = [];
    for (const g of hepsi) {
      const tk = await tokenAl(t, g.oturum);
      sonuc.push({ oturum: g.oturum, token: tk.accessToken, sid: sidOku(tk.accessToken) });
    }
    await rizaKabulEt(t, sonuc[0]?.token ?? '');
    return { kullaniciId: ilk.kullaniciId, telefon: ilk.telefon, oturumlar: sonuc };
  }

  describe('oturumlar', () => {
    it('listeler: kendi acik oturumlari, bu_oturum isareti, IP tam donmez', async () => {
      const u = await oturumlar(2);
      const [a, b] = u.oturumlar;
      const res = await app.inject({ url: '/v1/hesap/oturumlar', headers: bearer(a?.token ?? '') });
      expect(res.statusCode).toBe(200);
      const govde = res.json<OturumListe>();
      expect(govde.oturumlar.map((o) => o.id).sort()).toEqual([a?.sid, b?.sid].sort());
      expect(govde.oturumlar.find((o) => o.id === a?.sid)?.bu_oturum).toBe(true);
      expect(govde.oturumlar.find((o) => o.id === b?.sid)?.bu_oturum).toBe(false);
      expect(res.body).not.toMatch(/"ip"/);
      for (const o of govde.oturumlar) expect(o.ip_maskeli ?? '').toMatch(/^(\d+\.\d+\.\*\.\*)?$/);
      // suresi dolmus oturum listelenmez
      await sistem`update hesap.oturumlar set expires_at = now() - interval '1 minute' where id = ${b?.sid ?? ''}`;
      const sonra = await app.inject({
        url: '/v1/hesap/oturumlar',
        headers: bearer(a?.token ?? ''),
      });
      expect(sonra.json<OturumListe>().oturumlar).toHaveLength(1);
    });

    it('kimliksiz istek 401', async () => {
      expect((await app.inject({ url: '/v1/hesap/oturumlar' })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: 'POST', url: '/v1/hesap/oturumlar/tumunu-kapat' })).statusCode,
      ).toBe(401);
    });

    it('rıza kapısı: rıza vermemis kullanici oturumlari goremez (muaf degil)', async () => {
      const g = await otpIleGiris(t);
      const tk = await tokenAl(t, g.oturum);
      const res = await app.inject({ url: '/v1/hesap/oturumlar', headers: bearer(tk.accessToken) });
      expect(res.statusCode).toBe(403);
      expect(res.json<Hata>().error.code).toBe('riza_gerekli');
    });

    it('tek oturum sonlanir: belirteci aninda 401, digeri 200, denetim kaydi var, tekrar 404', async () => {
      const u = await oturumlar(2);
      const [a, b] = u.oturumlar;
      expect(await ben(b?.token ?? '')).toBe(200);
      const sil = await app.inject({
        method: 'DELETE',
        url: `/v1/hesap/oturumlar/${b?.sid ?? ''}`,
        headers: bearer(a?.token ?? ''),
      });
      expect(sil.statusCode).toBe(200);
      expect(sil.json()).toEqual({ sonlandirildi: true });
      expect(await ben(b?.token ?? '')).toBe(401);
      expect(await ben(a?.token ?? '')).toBe(200);
      // oturum belirteciyle yeni erisim belirteci de alinamaz
      const yenile = await app.inject({
        method: 'POST',
        url: '/auth/token',
        remoteAddress: yeniIp(),
        headers: bearer(b?.oturum ?? ''),
        payload: {},
      });
      expect(yenile.statusCode).toBe(401);
      const tekrar = await app.inject({
        method: 'DELETE',
        url: `/v1/hesap/oturumlar/${b?.sid ?? ''}`,
        headers: bearer(a?.token ?? ''),
      });
      expect(tekrar.statusCode).toBe(404);
      const denetim = await sistem<{ eylem: string; aktor_kullanici_id: string }[]>`
        select eylem, aktor_kullanici_id from hesap.denetim_kayitlari
        where eylem = 'hesap.oturum_sonlandir' and hedef_id = ${b?.sid ?? ''}`;
      expect(denetim).toHaveLength(1);
      expect(denetim[0]?.aktor_kullanici_id).toBe(u.kullaniciId);
    });

    it('baskasinin oturumu sonlandirilamaz (404) ve sahibi etkilenmez; olmayan id de 404', async () => {
      const kurban = await oturumlar(1);
      const saldirgan = await oturumlar(1);
      const hedef = kurban.oturumlar[0];
      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/hesap/oturumlar/${hedef?.sid ?? ''}`,
        headers: bearer(saldirgan.oturumlar[0]?.token ?? ''),
      });
      expect(res.statusCode).toBe(404);
      expect(await ben(hedef?.token ?? '')).toBe(200);
      const [satir] = await sistem`select 1 from hesap.oturumlar where id = ${hedef?.sid ?? ''}`;
      expect(satir).toBeDefined();
      const yok = await app.inject({
        method: 'DELETE',
        url: '/v1/hesap/oturumlar/0197c9c0-0000-7000-8000-000000000000',
        headers: bearer(saldirgan.oturumlar[0]?.token ?? ''),
      });
      expect(yok.statusCode).toBe(404);
      // baskasinin oturumu listede de gorunmez
      const liste = await app.inject({
        url: '/v1/hesap/oturumlar',
        headers: bearer(saldirgan.oturumlar[0]?.token ?? ''),
      });
      expect(liste.json<OturumListe>().oturumlar.map((o) => o.id)).not.toContain(hedef?.sid);
    });

    it('tumunu-kapat mevcut_haric: digerleri 401, mevcut 200; sonra mevcut_haric olmadan hepsi', async () => {
      const u = await oturumlar(3);
      const [a, b, c] = u.oturumlar;
      const diger = await oturumlar(1); // baska kullanici etkilenmemeli
      const haric = await app.inject({
        method: 'POST',
        url: '/v1/hesap/oturumlar/tumunu-kapat',
        headers: bearer(a?.token ?? ''),
        payload: { mevcut_haric: true },
      });
      expect(haric.statusCode).toBe(200);
      expect(haric.json()).toEqual({ kapatilan: 2 });
      expect(await ben(b?.token ?? '')).toBe(401);
      expect(await ben(c?.token ?? '')).toBe(401);
      expect(await ben(a?.token ?? '')).toBe(200);
      expect(await ben(diger.oturumlar[0]?.token ?? '')).toBe(200);
      const liste = await app.inject({
        url: '/v1/hesap/oturumlar',
        headers: bearer(a?.token ?? ''),
      });
      expect(liste.json<OturumListe>().oturumlar.map((o) => o.id)).toEqual([a?.sid]);

      const hepsi = await app.inject({
        method: 'POST',
        url: '/v1/hesap/oturumlar/tumunu-kapat',
        headers: bearer(a?.token ?? ''),
      });
      expect(hepsi.json()).toEqual({ kapatilan: 1 });
      expect(await ben(a?.token ?? '')).toBe(401);
      expect(await ben(diger.oturumlar[0]?.token ?? '')).toBe(200);
      const denetim = await sistem<{ sonra: { kapatilan: number; mevcut_haric: boolean } }[]>`
        select sonra from hesap.denetim_kayitlari
        where eylem = 'hesap.oturumlar_tumunu_kapat' and aktor_kullanici_id = ${u.kullaniciId}
        order by created_at`;
      expect(denetim.map((d) => d.sonra)).toEqual([
        { kapatilan: 2, mevcut_haric: true },
        { kapatilan: 1, mevcut_haric: false },
      ]);
    });
  });

  describe('toplu davet', () => {
    const toplu = (
      k: KurumluKullanici,
      davetler: unknown[],
      token = k.token,
      kurumId = k.kurumId,
    ) =>
      app.inject({
        method: 'POST',
        url: `/v1/hesap/kurumlar/${kurumId}/davetler/toplu`,
        headers: bearer(token),
        payload: { davetler },
      });

    async function grupAc(k: KurumluKullanici, ad: string) {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/hesap/kurumlar/${k.kurumId}/gruplar`,
        headers: bearer(k.token),
        payload: { tur: 'sinif', ad },
      });
      expect(res.statusCode).toBe(201);
      return res.json<{ id: string }>().id;
    }

    it('kismi basari: hatali satirlar digerlerini geri almaz; baglanti WEB_URL ile kurulur', async () => {
      const k = await kurumluKullanici(t);
      const grup = await grupAc(k, '7-A');
      const tel = '05321234567';
      const onceSms = t.sms.mesajlar.length;
      const res = await toplu(k, [
        { kanal: 'sms', rol: 'ogrenci', telefon: tel, hedef_ad: 'Ali', grup_id: grup },
        { kanal: 'sms', rol: 'ogrenci', telefon: 'abc' },
        { kanal: 'eposta', rol: 'ogretmen', eposta: 'hoca@ornek.com' },
        { kanal: 'baglanti', rol: 'ogrenci', grup_id: grup },
        { kanal: 'sms', rol: 'ogrenci' },
        { kanal: 'baglanti', rol: 'ogrenci', grup_id: '0197c9c0-0000-7000-8000-000000000000' },
      ]);
      expect(res.statusCode).toBe(200);
      const g = res.json<TopluSonuc>();
      expect(g.sonuclar.map((s) => s.durum)).toEqual([
        'basarili',
        'hata',
        'basarili',
        'basarili',
        'hata',
        'hata',
      ]);
      expect(g.sonuclar.map((s) => s.sira)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(g.sonuclar[1]?.hata_kodu).toBe('gecersiz_telefon');
      expect(g.sonuclar[4]?.hata_kodu).toBe('dogrulama_hatasi');
      expect(g.sonuclar[5]?.hata_kodu).toBe('bulunamadi');
      expect(g.basarili_sayisi).toBe(3);
      expect(g.hata_sayisi).toBe(3);
      // basarili satir kaydi ve gonderimi gercek
      const [say] = await sistem<{ n: number }[]>`
        select count(*)::int n from hesap.davetler where kurum_id = ${k.kurumId}`;
      expect(say?.n).toBe(3);
      const yeniSms = t.sms.mesajlar.slice(onceSms);
      expect(yeniSms).toHaveLength(1);
      expect(yeniSms[0]?.telefon).toBe('+905321234567');
      expect(yeniSms[0]?.metin).toBe(
        `Köprü daveti: https://web.test/davet/${g.sonuclar[0]?.belirtec ?? ''}`,
      );
      // belirtec gecerli: ayni kodla kabul edilebilir
      const yeni = await otpIleGiris(t);
      const tk = await tokenAl(t, yeni.oturum);
      await rizaKabulEt(t, tk.accessToken);
      const kabul = await app.inject({
        method: 'POST',
        url: '/v1/hesap/davetler/kabul',
        headers: bearer(tk.accessToken),
        payload: { belirtec: g.sonuclar[3]?.belirtec },
      });
      expect(kabul.statusCode).toBe(200);
    });

    it('sinirlar: 101 satir ve bos liste 400', async () => {
      const k = await kurumluKullanici(t);
      const satir = { kanal: 'baglanti', rol: 'ogrenci' };
      expect(
        (
          await toplu(
            k,
            Array.from({ length: 101 }, () => satir),
          )
        ).statusCode,
      ).toBe(400);
      expect((await toplu(k, [])).statusCode).toBe(400);
      const yuz = await toplu(
        k,
        Array.from({ length: 100 }, () => satir),
      );
      expect(yuz.statusCode).toBe(200);
      expect(yuz.json<TopluSonuc>().basarili_sayisi).toBe(100);
    });

    it('ogretmen yalniz kendi grubuna ogrenci davet eder; kapsam disi satirlar hata', async () => {
      const k = await kurumluKullanici(t);
      const gA = await grupAc(k, 'A');
      const gB = await grupAc(k, 'B');
      // ogretmen: baglanti daveti, kabul, atama
      const d = (
        await app.inject({
          method: 'POST',
          url: `/v1/hesap/kurumlar/${k.kurumId}/davetler`,
          headers: bearer(k.token),
          payload: { kanal: 'baglanti', rol: 'ogretmen' },
        })
      ).json<{ belirtec: string }>();
      const hoca = await otpIleGiris(t);
      const ilk = await tokenAl(t, hoca.oturum);
      await rizaKabulEt(t, ilk.accessToken);
      const kabul = await app.inject({
        method: 'POST',
        url: '/v1/hesap/davetler/kabul',
        headers: bearer(ilk.accessToken),
        payload: { belirtec: d.belirtec },
      });
      const uyelikId = kabul.json<{ uyelik_id: string }>().uyelik_id;
      const hocaToken = (await tokenAl(t, hoca.oturum, { kurum_id: k.kurumId })).accessToken;
      const ata = await app.inject({
        method: 'POST',
        url: `/v1/hesap/kurumlar/${k.kurumId}/gruplar/${gA}/atamalar`,
        headers: bearer(k.token),
        payload: { ogretmen_id: uyelikId, brans_kodu: 'matematik', ana_ogretmen: true },
      });
      expect(ata.statusCode).toBe(201);

      const res = await toplu(
        k,
        [
          { kanal: 'baglanti', rol: 'ogrenci', grup_id: gA },
          { kanal: 'baglanti', rol: 'ogrenci', grup_id: gB },
          { kanal: 'baglanti', rol: 'ogrenci' },
          { kanal: 'baglanti', rol: 'ogretmen' },
          { kanal: 'baglanti', rol: 'ogrenci', grup_id: gA },
        ],
        hocaToken,
      );
      expect(res.statusCode).toBe(200);
      const g = res.json<TopluSonuc>();
      expect(g.sonuclar.map((s) => s.durum)).toEqual([
        'basarili',
        'hata',
        'hata',
        'hata',
        'basarili',
      ]);
      expect(g.sonuclar[1]?.hata_kodu).toBe('bulunamadi');
      expect(g.sonuclar[2]?.hata_kodu).toBe('izin_yok');
      expect(g.sonuclar[3]?.hata_kodu).toBe('izin_yok');
      const [gb] = await sistem<{ n: number }[]>`
        select count(*)::int n from hesap.davetler where kurum_id = ${k.kurumId} and grup_id = ${gB}`;
      expect(gb?.n).toBe(0);
    });

    it('ogrenci toplu davet gonderemez (403)', async () => {
      const k = await kurumluKullanici(t);
      const d = (
        await app.inject({
          method: 'POST',
          url: `/v1/hesap/kurumlar/${k.kurumId}/davetler`,
          headers: bearer(k.token),
          payload: { kanal: 'baglanti', rol: 'ogrenci' },
        })
      ).json<{ belirtec: string }>();
      const ogr = await otpIleGiris(t);
      const ilk = await tokenAl(t, ogr.oturum);
      await rizaKabulEt(t, ilk.accessToken);
      await app.inject({
        method: 'POST',
        url: '/v1/hesap/davetler/kabul',
        headers: bearer(ilk.accessToken),
        payload: { belirtec: d.belirtec },
      });
      const ogrToken = (await tokenAl(t, ogr.oturum, { kurum_id: k.kurumId })).accessToken;
      const res = await toplu(k, [{ kanal: 'baglanti', rol: 'ogrenci' }], ogrToken);
      expect(res.statusCode).toBe(403);
    });

    it('kiraci izolasyonu: B kurumu A icin davet yaratamaz', async () => {
      const a = await kurumluKullanici(t, 'kurum', 'A Kurumu');
      const b = await kurumluKullanici(t, 'kurum', 'B Kurumu');
      const res = await toplu(b, [{ kanal: 'baglanti', rol: 'ogrenci' }], b.token, a.kurumId);
      expect([403, 404]).toContain(res.statusCode);
      const [sayA] = await sistem<{ n: number }[]>`
        select count(*)::int n from hesap.davetler where kurum_id = ${a.kurumId}`;
      expect(sayA?.n).toBe(0);
      // B kendi kurumuna yazar; A'nin grubunu kullanamaz
      const grupA = await grupAc(a, 'A grubu');
      const ok = await toplu(b, [
        { kanal: 'baglanti', rol: 'ogrenci' },
        { kanal: 'baglanti', rol: 'ogrenci', grup_id: grupA },
      ]);
      const g = ok.json<TopluSonuc>();
      expect(g.sonuclar.map((s) => s.durum)).toEqual(['basarili', 'hata']);
      expect(g.sonuclar[1]?.hata_kodu).toBe('bulunamadi');
      const [sayA2] = await sistem<{ n: number }[]>`
        select count(*)::int n from hesap.davetler where kurum_id = ${a.kurumId}`;
      expect(sayA2?.n).toBe(0);
    });
  });

  describe('toplu modul durumu', () => {
    it('etkin-tumu her modul icin tekil etkin ucu ile ayni sonucu verir', async () => {
      const k = await kurumluKullanici(t);
      const [kademe] = await sistem<{ id: string }[]>`
        select id from hesap.kademeler where kurum_id = ${k.kurumId} order by sira limit 1`;
      const grupId = (
        await app.inject({
          method: 'POST',
          url: `/v1/hesap/kurumlar/${k.kurumId}/gruplar`,
          headers: bearer(k.token),
          payload: { tur: 'sinif', ad: 'M-1', kademe_id: kademe?.id },
        })
      ).json<{ id: string }>().id;
      const yaz = (
        modul_kodu: string,
        kapsam: string,
        kapsam_id: string | undefined,
        acik: boolean,
      ) =>
        app.inject({
          method: 'PUT',
          url: `/v1/hesap/kurumlar/${k.kurumId}/modul-ayarlari`,
          headers: bearer(k.token),
          payload: { modul_kodu, kapsam, ...(kapsam_id ? { kapsam_id } : {}), acik },
        });
      expect((await yaz('finans', 'kurum', undefined, false)).statusCode).toBe(200);
      expect((await yaz('odev', 'grup', grupId, false)).statusCode).toBe(200);
      expect((await yaz('deneme', 'kademe', kademe?.id, false)).statusCode).toBe(200);

      for (const q of ['', `?grup_id=${grupId}`, `?kademe_id=${kademe?.id ?? ''}`]) {
        const tumu = await app.inject({
          url: `/v1/hesap/modul-ayarlari/etkin-tumu${q}`,
          headers: bearer(k.token),
        });
        expect(tumu.statusCode).toBe(200);
        const { moduller } = tumu.json<{ moduller: Record<string, boolean> }>();
        expect(Object.keys(moduller).sort()).toEqual([...MODUL_KODLARI].sort());
        for (const kod of MODUL_KODLARI) {
          const tekil = await app.inject({
            url: `/v1/hesap/modul-ayarlari/etkin?modul_kodu=${kod}${q.replace('?', '&')}`,
            headers: bearer(k.token),
          });
          expect(tekil.json<{ acik: boolean }>().acik, `${kod}${q}`).toBe(moduller[kod]);
        }
        expect(moduller.finans).toBe(false);
      }
      const grupluTumu = (
        await app.inject({
          url: `/v1/hesap/modul-ayarlari/etkin-tumu?grup_id=${grupId}`,
          headers: bearer(k.token),
        })
      ).json<{ moduller: Record<string, boolean> }>().moduller;
      expect(grupluTumu.odev).toBe(false);
      expect(grupluTumu.deneme).toBe(false); // grubun kademesi
      expect(grupluTumu.takvim).toBe(true);
      // kurum seviyesinde odev hala acik
      const kurumTumu = (
        await app.inject({ url: '/v1/hesap/modul-ayarlari/etkin-tumu', headers: bearer(k.token) })
      ).json<{ moduller: Record<string, boolean> }>().moduller;
      expect(kurumTumu.odev).toBe(true);
    });

    it('kimliksiz 401', async () => {
      expect((await app.inject({ url: '/v1/hesap/modul-ayarlari/etkin-tumu' })).statusCode).toBe(
        401,
      );
    });
  });
});
