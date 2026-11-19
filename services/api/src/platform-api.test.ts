import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { base32Coz, sayacHesapla, totpKodu } from './modules/hesap/index.js';
import { dersYardimcilari } from './test/ders-yardimcilar.js';
import { platformYoneticiEkle } from './sistem/platform-yonetici.js';
import {
  bearer,
  dbYok,
  hataMetni,
  izoleVeritabani,
  kurumluKullanici,
  otpIleGiris,
  rizaKabulEt,
  testServisi,
  tokenAl,
  type GirisSonucu,
  type KurumluKullanici,
  type TestServisi,
} from './test/yardimcilar.js';

interface Hata {
  error: { code: string; message: string };
}

interface PlatformKullanicisi extends GirisSonucu {
  token: string;
  rol: 'destek' | 'yonetici';
}

describe.skipIf(dbYok())('platform yönetimi çekirdeği (/platform/*)', () => {
  let iz: Awaited<ReturnType<typeof izoleVeritabani>>;
  let t: TestServisi;
  let sistem: postgres.Sql;
  let appDb: Database;
  let sistemDb: Database;
  const ayri: TestServisi[] = [];

  beforeAll(async () => {
    iz = await izoleVeritabani();
    t = testServisi({ LOG_LEVEL: process.env.TEST_LOG ?? 'silent' }, iz.urls);
    sistem = postgres(iz.urls.sistemUrl, { max: 2, onnotice: () => undefined });
    appDb = createDb({ url: iz.urls.appUrl, max: 3 });
    sistemDb = createDb({ url: iz.urls.sistemUrl, max: 3 });
  });
  afterAll(async () => {
    await t.service.stop();
    for (const s of ayri) await s.service.stop();
    await sistem.end();
    await appDb.close();
    await sistemDb.close();
    await iz.temizle();
  });

  const cagri = (
    servis: TestServisi,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    url: string,
    token: string | null,
    payload?: unknown,
    remoteAddress?: string,
  ) =>
    servis.service.app.inject({
      method,
      url,
      ...(token ? { headers: bearer(token) } : {}),
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
      ...(remoteAddress ? { remoteAddress } : {}),
    });
  const p = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    token: string | null,
    payload?: unknown,
  ) => cagri(t, method, url, token, payload);

  /** Giris yapmis kullaniciya platform rolu verir ve rolu icerir belirteci alir. */
  async function platformKullanicisi(
    rol: 'destek' | 'yonetici',
    servis: TestServisi = t,
  ): Promise<PlatformKullanicisi> {
    const giris = await otpIleGiris(servis);
    await sistem`update hesap.kullanicilar set platform_rolu = ${rol} where id = ${giris.kullaniciId}`;
    const { accessToken } = await tokenAl(servis, giris.oturum);
    return { ...giris, token: accessToken, rol };
  }

  interface IkinciAdim {
    sir: string;
    yedekKodlar: string[];
  }

  /** Kur + ilk kodla onayla (oturum dogrulanmis olur). */
  async function ikinciAdimTamamla(
    k: PlatformKullanicisi,
    servis: TestServisi = t,
  ): Promise<IkinciAdim> {
    const kur = await cagri(servis, 'POST', '/platform/ikinci-adim/kur', k.token, {});
    expect(kur.statusCode, kur.body).toBe(200);
    const g = kur.json<{ otpauth_uri: string; sir: string; yedek_kodlar: string[] }>();
    expect(g.otpauth_uri).toContain('otpauth://totp/');
    expect(g.yedek_kodlar).toHaveLength(10);
    const kod = totpKodu(base32Coz(g.sir), sayacHesapla(new Date()));
    const onay = await cagri(servis, 'POST', '/platform/ikinci-adim/onayla', k.token, { kod });
    expect(onay.statusCode, onay.body).toBe(200);
    return { sir: g.sir, yedekKodlar: g.yedek_kodlar };
  }

  /** Hazir (2FA'li) platform kullanicisi. */
  async function hazirPlatform(rol: 'destek' | 'yonetici'): Promise<PlatformKullanicisi> {
    const k = await platformKullanicisi(rol);
    await ikinciAdimTamamla(k);
    return k;
  }

  const denetimSayisi = async (eylem: string, aktorId?: string): Promise<number> => {
    const [r] = aktorId
      ? await sistem<{ n: number }[]>`
          select count(*)::int as n from hesap.denetim_kayitlari
          where eylem = ${eylem} and aktor_kullanici_id = ${aktorId}`
      : await sistem<{ n: number }[]>`
          select count(*)::int as n from hesap.denetim_kayitlari where eylem = ${eylem}`;
    return r?.n ?? 0;
  };

  const dersUrl = () =>
    `/v1/ders/kurumlar/${kurum.kurumId}/dersler?baslangic=2026-01-01T00:00:00Z&bitis=2026-02-01T00:00:00Z`;

  let yonetici: PlatformKullanicisi;
  let destek: PlatformKullanicisi;
  let kurum: KurumluKullanici;

  beforeAll(async () => {
    yonetici = await hazirPlatform('yonetici');
    destek = await hazirPlatform('destek');
    kurum = await kurumluKullanici(t, 'kurum', 'Platform Deneme Okulu');
  });

  describe('erişim kapısı', () => {
    it('kimliksiz 401; platform rolü olmayan 403 platform_yetkisi_yok', async () => {
      expect((await p('GET', '/platform/kurumlar', null)).statusCode).toBe(401);
      const res = await p('GET', '/platform/kurumlar', kurum.token);
      expect(res.statusCode).toBe(403);
      expect(res.json<Hata>().error.code).toBe('platform_yetkisi_yok');
      // `plat` claim'i kimse sahte tasiyamaz; claim olsa bile rol veritabanindan dogrulanir.
      await sistem`update hesap.kullanicilar set platform_rolu = 'yok' where id = ${destek.kullaniciId}`;
      const geri = await p('GET', '/platform/kurumlar', destek.token);
      expect(geri.statusCode).toBe(403);
      expect(geri.json<Hata>().error.code).toBe('platform_yetkisi_yok');
      await sistem`update hesap.kullanicilar set platform_rolu = 'destek' where id = ${destek.kullaniciId}`;
      expect((await p('GET', '/platform/kurumlar', destek.token)).statusCode).toBe(200);
    });

    it('token plat claim taşır (yalnız platform kullanıcısında)', () => {
      const payload = JSON.parse(
        Buffer.from(yonetici.token.split('.')[1] ?? '', 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      expect(payload.plat).toBe('yonetici');
      const digerPayload = JSON.parse(
        Buffer.from(kurum.token.split('.')[1] ?? '', 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      expect(digerPayload.plat).toBeUndefined();
    });

    it('plat_2fa_exp: yalnız oturumda taze 2FA varsa ve yeni belirteç alındıktan sonra; taklit/kurum belirtecinde yok', async () => {
      const claim = (jwt: string) =>
        JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<
          string,
          unknown
        >;
      const k = await platformKullanicisi('yonetici');
      // 2FA'dan once: yalniz `plat`.
      expect(claim(k.token).plat).toBe('yonetici');
      expect(claim(k.token).plat_2fa_exp).toBeUndefined();
      await ikinciAdimTamamla(k);
      // Eski belirtec degismez; istemci /auth/token ile yenisini alir.
      expect(claim(k.token).plat_2fa_exp).toBeUndefined();
      const yeni = (await tokenAl(t, k.oturum)).accessToken;
      const exp = claim(yeni).plat_2fa_exp as number;
      const beklenen = Math.floor(Date.now() / 1000) + 8 * 3600;
      expect(Math.abs(exp - beklenen)).toBeLessThan(120);
      // Baska (2FA'siz) oturum claim almaz; platform kullanicisi olmayan da.
      const digerOturum = await otpIleGiris(t, k.telefon);
      expect(
        claim((await tokenAl(t, digerOturum.oturum)).accessToken).plat_2fa_exp,
      ).toBeUndefined();
      expect(claim(kurum.token).plat_2fa_exp).toBeUndefined();
      // Dogrulama suresi (PLATFORM_IKINCI_ADIM_OMRU_SN) dolmus oturum claim almaz.
      await sistem`update hesap.oturumlar set ikinci_adim_at = now() - interval '9 hours' where id in (select id from hesap.oturumlar where kullanici_id = ${k.kullaniciId} and ikinci_adim_at is not null)`;
      expect(claim((await tokenAl(t, k.oturum)).accessToken).plat_2fa_exp).toBeUndefined();
    });

    it('2FA tamamlanmamış platform kullanıcısı /platform/* çağıramaz (yalnız ikinci adım uçları açık)', async () => {
      const k = await platformKullanicisi('yonetici');
      const kapali = await p('GET', '/platform/kurumlar', k.token);
      expect(kapali.statusCode).toBe(403);
      expect(kapali.json<Hata>().error.code).toBe('ikinci_adim_gerekli');
      for (const [yontem, url] of [
        ['POST', '/platform/taklit'],
        ['GET', '/platform/denetim'],
        ['GET', '/platform/sistem-sagligi'],
        ['POST', '/platform/mesajlar'],
      ] as const) {
        const r = await p(yontem, url, k.token, yontem === 'POST' ? {} : undefined);
        expect(r.statusCode, url).toBe(403);
        expect(r.json<Hata>().error.code, url).toBe('ikinci_adim_gerekli');
      }
      const ben = await p('GET', '/platform/ben', k.token);
      expect(ben.statusCode).toBe(200);
      expect(ben.json()).toMatchObject({
        kullanici_id: k.kullaniciId,
        platform_rolu: 'yonetici',
        ikinci_adim: { kurulu: false, oturumda_dogrulandi: false },
      });
      // Kurulum yapilmis ama onaylanmamissa dogrulama da acilmaz.
      const kur = await p('POST', '/platform/ikinci-adim/kur', k.token, {});
      expect(kur.statusCode).toBe(200);
      expect((await p('GET', '/platform/kurumlar', k.token)).statusCode).toBe(403);
      const hataliOnay = await p('POST', '/platform/ikinci-adim/onayla', k.token, {
        kod: '000000',
      });
      expect(hataliOnay.statusCode).toBe(400);
      expect(hataliOnay.json<Hata>().error.code).toBe('kod_gecersiz');
      const { sir } = kur.json<{ sir: string }>();
      const kod = totpKodu(base32Coz(sir), sayacHesapla(new Date()));
      expect((await p('POST', '/platform/ikinci-adim/onayla', k.token, { kod })).statusCode).toBe(
        200,
      );
      expect((await p('GET', '/platform/kurumlar', k.token)).statusCode).toBe(200);
      // Onayli kurulum yeniden yapilamaz.
      const tekrar = await p('POST', '/platform/ikinci-adim/kur', k.token, {});
      expect(tekrar.statusCode).toBe(409);
      expect(tekrar.json<Hata>().error.code).toBe('ikinci_adim_kurulu');
      // Taklit belirteciyle platform ucu cagrilamaz (asagida) ve KVKK rizasi platform ucunda aranmaz.
      expect(
        (await p('GET', '/platform/ben', k.token)).json<{
          ikinci_adim: { oturumda_dogrulandi: boolean };
        }>().ikinci_adim.oturumda_dogrulandi,
      ).toBe(true);
    });

    it('yeni oturum yeniden doğrulama ister; yedek kod tek kullanımlık; yanlış denemeler kilitler', async () => {
      const k = await platformKullanicisi('yonetici');
      const { sir, yedekKodlar } = await ikinciAdimTamamla(k);
      // Yeni oturum (yeni OTP girisi) ikinci adimi miras almaz.
      const giris2 = await otpIleGiris(t, k.telefon);
      const token2 = (await tokenAl(t, giris2.oturum)).accessToken;
      const kapali = await p('GET', '/platform/kurumlar', token2);
      expect(kapali.statusCode).toBe(403);
      expect(kapali.json<Hata>().error.code).toBe('ikinci_adim_gerekli');
      // Onay, o TOTP adimini tuketti: ayni kodla yeni oturum dogrulanamaz (tekrar oynatma korumasi).
      const tekrarKod = totpKodu(base32Coz(sir), sayacHesapla(new Date()));
      const replay = await p('POST', '/platform/ikinci-adim/dogrula', token2, { kod: tekrarKod });
      expect(replay.statusCode).toBe(400);
      const yedek = yedekKodlar[0] ?? '';
      const ok = await p('POST', '/platform/ikinci-adim/dogrula', token2, { yedek_kod: yedek });
      expect(ok.statusCode, ok.body).toBe(200);
      expect(ok.json<{ yedek_kod_kalan: number }>().yedek_kod_kalan).toBe(9);
      expect((await p('GET', '/platform/kurumlar', token2)).statusCode).toBe(200);
      // Ayni yedek kod ikinci oturumda kullanilamaz.
      const giris3 = await otpIleGiris(t, k.telefon);
      const token3 = (await tokenAl(t, giris3.oturum)).accessToken;
      const tekrar = await p('POST', '/platform/ikinci-adim/dogrula', token3, { yedek_kod: yedek });
      expect(tekrar.statusCode).toBe(400);
      // 5 yanlis denemeden sonra kilit (429) — dogru kod da reddedilir.
      for (let i = 0; i < 3; i++) {
        const r = await p('POST', '/platform/ikinci-adim/dogrula', token3, { kod: '111111' });
        expect(r.statusCode).toBe(400);
      }
      const kilit = await p('POST', '/platform/ikinci-adim/dogrula', token3, { kod: '222222' });
      expect([400, 429]).toContain(kilit.statusCode);
      const son = await p('POST', '/platform/ikinci-adim/dogrula', token3, {
        yedek_kod: yedekKodlar[1] ?? '',
      });
      expect(son.statusCode).toBe(429);
      expect((await p('GET', '/platform/kurumlar', token3)).statusCode).toBe(403);
      // Basarisiz denemeler denetimde gorunur.
      expect(
        await denetimSayisi('platform.ikinci_adim_basarisiz', k.kullaniciId),
      ).toBeGreaterThanOrEqual(4);
    });

    it('sırrı ve yedek kodları veritabanında düz saklamaz; api_app tabloya erişemez', async () => {
      const [satir] = await sistem<{ sir_sifreli: Buffer; yedek_kod_ozetleri: string[] }[]>`
        select sir_sifreli, yedek_kod_ozetleri from hesap.platform_ikinci_adim
        where kullanici_id = ${yonetici.kullaniciId}`;
      expect(satir?.sir_sifreli.length).toBeGreaterThan(28);
      expect(satir?.yedek_kod_ozetleri.every((o) => /^[0-9a-f]{64}$/.test(o))).toBe(true);
      for (const tablo of ['platform_ikinci_adim', 'taklit_kayitlari']) {
        const hata = await hataMetni(appDb.orm.execute(sql.raw(`select * from hesap.${tablo}`)));
        expect(hata).toMatch(/permission denied/i);
      }
    });
  });

  describe('IP izin listesi (PLATFORM_IP_IZINLI)', () => {
    it('izin dışı IP 403 platform_ip_yasak; izinli IP geçer; denetime red nedeni yazılır', async () => {
      const s = testServisi({ PLATFORM_IP_IZINLI: '203.0.113.0/24, 198.51.100.7' }, iz.urls);
      ayri.push(s);
      const k = await platformKullanicisi('yonetici', s);
      const izinli = '203.0.113.9';
      // Kurulum/onay izinli IP'den.
      const kur = await cagri(s, 'POST', '/platform/ikinci-adim/kur', k.token, {}, izinli);
      expect(kur.statusCode, kur.body).toBe(200);
      const { sir } = kur.json<{ sir: string }>();
      const kod = totpKodu(base32Coz(sir), sayacHesapla(new Date()));
      expect(
        (await cagri(s, 'POST', '/platform/ikinci-adim/onayla', k.token, { kod }, izinli))
          .statusCode,
      ).toBe(200);
      for (const url of ['/platform/ben', '/platform/kurumlar']) {
        const red = await cagri(s, 'GET', url, k.token, undefined, '192.0.2.50');
        expect(red.statusCode, url).toBe(403);
        expect(red.json<Hata>().error.code).toBe('platform_ip_yasak');
        expect((await cagri(s, 'GET', url, k.token, undefined, izinli)).statusCode, url).toBe(200);
      }
      expect(
        (await cagri(s, 'GET', '/platform/kurumlar', k.token, undefined, '198.51.100.7'))
          .statusCode,
      ).toBe(200);
      const [satir] = await sistem<{ sonra: { red: string; durum: number } }[]>`
        select sonra from hesap.denetim_kayitlari
        where aktor_kullanici_id = ${k.kullaniciId} and eylem = 'platform.kurum_ara'
          and sonra->>'red' = 'ip'`;
      expect(satir?.sonra.durum).toBe(403);
    });

    it('üretimde liste boşsa platform uçları kapalıdır (fail-closed)', async () => {
      // Imzalama anahtarlari BETTER_AUTH_SECRET ile sifreli oldugundan uretim sirri icin ayri veritabani.
      const iz2 = await izoleVeritabani();
      const s = testServisi(
        { NODE_ENV: 'production', BETTER_AUTH_SECRET: 'u'.repeat(48), PLATFORM_IP_IZINLI: '' },
        iz2.urls,
      );
      try {
        const giris = await otpIleGiris(s);
        const sql2 = postgres(iz2.urls.sistemUrl, { max: 1, onnotice: () => undefined });
        await sql2`update hesap.kullanicilar set platform_rolu = 'yonetici' where id = ${giris.kullaniciId}`;
        await sql2.end();
        const { accessToken } = await tokenAl(s, giris.oturum);
        const res = await cagri(s, 'GET', '/platform/ben', accessToken);
        expect(res.statusCode).toBe(403);
        expect(res.json<Hata>().error.code).toBe('platform_ip_yasak');
      } finally {
        await s.service.stop();
        await iz2.temizle();
      }
    });

    it('geçersiz CIDR açılışta reddedilir', () => {
      expect(() => testServisi({ PLATFORM_IP_IZINLI: '0.0.0.0/0' }, iz.urls)).toThrow(
        /PLATFORM_IP_IZINLI/,
      );
      expect(() => testServisi({ PLATFORM_IP_IZINLI: 'merhaba' }, iz.urls)).toThrow(
        /PLATFORM_IP_IZINLI/,
      );
    });
  });

  describe('destek / yönetici farkı', () => {
    it('destek: kurum okuma, taklit ve sistem sağlığı açık; değişiklik ve denetim listesi yönetici işi', async () => {
      for (const url of ['/platform/kurumlar', '/platform/sistem-sagligi', '/platform/mesajlar']) {
        expect((await p('GET', url, destek.token)).statusCode, url).toBe(200);
      }
      const yasaklar: [string, string, unknown][] = [
        ['GET', '/platform/denetim', undefined],
        [
          'PUT',
          `/platform/kurumlar/${kurum.kurumId}/moduller/takvim`,
          { acik: false, neden: 'destek deneme nedeni' },
        ],
        [
          'PUT',
          `/platform/kurumlar/${kurum.kurumId}/beta/yeni_ekran`,
          { acik: true, neden: 'destek deneme nedeni' },
        ],
        [
          'POST',
          '/platform/mesajlar',
          { baslik: 'x', metin: 'y', bitis_at: new Date(Date.now() + 60_000).toISOString() },
        ],
      ];
      for (const [yontem, url, govde] of yasaklar) {
        const r = await p(yontem as 'GET' | 'PUT' | 'POST', url, destek.token, govde);
        expect(r.statusCode, url).toBe(403);
        expect(r.json<Hata>().error.code, url).toBe('platform_izin_yok');
      }
      expect((await p('GET', '/platform/denetim', yonetici.token)).statusCode).toBe(200);
    });
  });

  describe('kurum listesi, arama ve detay', () => {
    it('ad, kurum kimliği, sahip telefonu ve e-postasıyla bulur; kişisel veri maskeli döner', async () => {
      await sistem`update hesap.kullanicilar set eposta = ${`sahip.${kurum.kurumId.slice(0, 8)}@ornek.com`} where id = ${kurum.kullaniciId}`;
      const eposta = `sahip.${kurum.kurumId.slice(0, 8)}@ornek.com`;
      const sorgular: [string, string][] = [
        ['ad', 'deneme OKULU'],
        ['ad (i/İ/ı farkı)', 'platform deneme okulu'],
        ['id', kurum.kurumId],
        ['telefon', kurum.telefon],
        ['telefon (0 5xx biçimi)', `0${kurum.telefon.slice(3)}`],
        ['eposta', eposta.toUpperCase()],
      ];
      for (const [ad, q] of sorgular) {
        const res = await p('GET', `/platform/kurumlar?q=${encodeURIComponent(q)}`, destek.token);
        expect(res.statusCode, ad).toBe(200);
        const govde = res.json<{
          kurumlar: {
            id: string;
            sahipler: {
              kullanici_id: string;
              telefon_maskeli: string | null;
              eposta_maskeli: string | null;
            }[];
          }[];
        }>();
        const bulunan = govde.kurumlar.find((x) => x.id === kurum.kurumId);
        expect(bulunan, ad).toBeDefined();
        const sahip = bulunan?.sahipler[0];
        expect(sahip?.kullanici_id).toBe(kurum.kullaniciId);
        expect(sahip?.telefon_maskeli).not.toContain(kurum.telefon.slice(3, 11));
        expect(sahip?.eposta_maskeli).toMatch(/^s\*\*\*@o\*\*\*\.com$/);
        expect(JSON.stringify(govde)).not.toContain(kurum.telefon);
        expect(JSON.stringify(govde)).not.toContain(eposta);
      }
      // Aramanin kendisi (telefon/e-posta olabilir) denetime GIRMEZ; yalniz turu girer.
      const kayitlar = await sistem<{ sonra: Record<string, unknown> }[]>`
        select sonra from hesap.denetim_kayitlari where eylem = 'platform.kurum_ara'`;
      const hepsi = JSON.stringify(kayitlar);
      expect(hepsi).not.toContain(kurum.telefon);
      expect(hepsi).not.toContain(eposta);
      expect(hepsi).toContain('"arama_turu":"telefon"');
      // Eslesmeyen tam telefon/e-posta bos doner.
      const bos = await p('GET', '/platform/kurumlar?q=%2B905599999999', destek.token);
      expect(bos.json<{ kurumlar: unknown[] }>().kurumlar).toEqual([]);
    });

    it('durum süzgeci, imleçli sayfalama ve geçersiz imleç', async () => {
      for (let i = 0; i < 3; i++)
        await kurumluKullanici(t, 'ekip', `Sayfalama Kurumu ${String(i)}`);
      const ilk = await p('GET', '/platform/kurumlar?q=Sayfalama&limit=2', destek.token);
      const g1 = ilk.json<{ kurumlar: { id: string }[]; sonraki_imlec: string | null }>();
      expect(g1.kurumlar).toHaveLength(2);
      expect(g1.sonraki_imlec).not.toBeNull();
      const ikinci = await p(
        'GET',
        `/platform/kurumlar?q=Sayfalama&limit=2&imlec=${g1.sonraki_imlec ?? ''}`,
        destek.token,
      );
      const g2 = ikinci.json<{ kurumlar: { id: string }[]; sonraki_imlec: string | null }>();
      expect(g2.kurumlar).toHaveLength(1);
      expect(g2.sonraki_imlec).toBeNull();
      expect(new Set([...g1.kurumlar, ...g2.kurumlar].map((k) => k.id)).size).toBe(3);
      const kapali = await p('GET', '/platform/kurumlar?q=Sayfalama&durum=kapali', destek.token);
      expect(kapali.json<{ kurumlar: unknown[] }>().kurumlar).toEqual([]);
      expect((await p('GET', '/platform/kurumlar?imlec=x', destek.token)).statusCode).toBe(400);
    });

    it('detay: üye sayıları, durum, modül ayarları', async () => {
      const res = await p('GET', `/platform/kurumlar/${kurum.kurumId}`, destek.token);
      expect(res.statusCode, res.body).toBe(200);
      const d = res.json<{
        ad: string;
        durum: string;
        uye_sayilari: { aktif_toplam: number; rollere_gore: Record<string, number> };
        moduller: { modul_kodu: string; kurum_acik: boolean }[];
        beta_ozellikleri: unknown[];
      }>();
      expect(d.ad).toBe('Platform Deneme Okulu');
      expect(d.durum).toBe('aktif');
      expect(d.uye_sayilari.aktif_toplam).toBe(1);
      expect(d.uye_sayilari.rollere_gore.sahip).toBe(1);
      expect(d.moduller.length).toBeGreaterThanOrEqual(11);
      expect(d.moduller.every((m) => m.kurum_acik)).toBe(true);
      expect(d.beta_ozellikleri).toEqual([]);
      expect(
        (await p('GET', `/platform/kurumlar/019e0000-0000-7000-8000-000000000000`, destek.token))
          .statusCode,
      ).toBe(404);
    });
  });

  describe('kuruma özel modül ve beta', () => {
    it('modül kapatma kurum içinde etkili olur, olay yayımlanır, mirasa dönüş geri açar', async () => {
      const url = `/platform/kurumlar/${kurum.kurumId}/moduller/takvim`;
      const dersler = () => p('GET', dersUrl(), kurum.token);
      expect((await dersler()).statusCode).toBe(200);

      expect((await p('PUT', url, yonetici.token, { acik: false, neden: 'kısa' })).statusCode).toBe(
        400,
      );
      const kapat = await p('PUT', url, yonetici.token, {
        acik: false,
        neden: 'Kurum talebiyle geçici kapatma',
      });
      expect(kapat.statusCode, kapat.body).toBe(200);
      expect(kapat.json()).toEqual({
        modul_kodu: 'takvim',
        kurum_acik: false,
        kurum_ayari_var: true,
      });
      const kapali = await dersler();
      expect(kapali.statusCode).toBe(403);
      expect(kapali.json<Hata>().error.code).toBe('modul_kapali');

      const olaylar = await sistem<
        { payload: { actor: { id: string }; data: Record<string, unknown> } }[]
      >`
        select payload from ortak.outbox
        where kurum_id = ${kurum.kurumId} and subject = 'evt.hesap.modul_ayari.degisti.v1'
        order by created_at`;
      expect(olaylar).toHaveLength(1);
      expect(olaylar[0]?.payload.data).toMatchObject({
        modul_kodu: 'takvim',
        kapsam: 'kurum',
        kapsam_id: kurum.kurumId,
        acik: false,
      });
      expect(olaylar[0]?.payload.actor.id).toBe(yonetici.kullaniciId);
      // Olayda kisisel veri yok.
      expect(JSON.stringify(olaylar)).not.toContain(kurum.telefon);

      const detay = await p('GET', `/platform/kurumlar/${kurum.kurumId}`, destek.token);
      expect(
        detay
          .json<{
            moduller: { modul_kodu: string; kurum_acik: boolean; kurum_ayari_var: boolean }[];
          }>()
          .moduller.find((m) => m.modul_kodu === 'takvim'),
      ).toMatchObject({ kurum_acik: false, kurum_ayari_var: true });

      const miras = await p('PUT', url, yonetici.token, {
        acik: null,
        neden: 'Kapatma geri alındı (miras)',
      });
      expect(miras.json()).toEqual({
        modul_kodu: 'takvim',
        kurum_acik: true,
        kurum_ayari_var: false,
      });
      expect((await dersler()).statusCode).toBe(200);
      const sonOlay = await sistem<{ payload: { data: { acik: boolean | null } } }[]>`
        select payload from ortak.outbox
        where kurum_id = ${kurum.kurumId} and subject = 'evt.hesap.modul_ayari.degisti.v1'
        order by created_at desc limit 1`;
      expect(sonOlay[0]?.payload.data.acik).toBeNull();
      // Neden denetime yazilir.
      const [d] = await sistem<{ neden: string; kurum_id: string }[]>`
        select neden, kurum_id from hesap.denetim_kayitlari
        where eylem = 'platform.modul_ayarla' and neden = 'Kurum talebiyle geçici kapatma'`;
      expect(d?.kurum_id).toBe(kurum.kurumId);
      expect(
        (
          await p('PUT', `/platform/kurumlar/${kurum.kurumId}/moduller/yok_modul`, yonetici.token, {
            acik: false,
            neden: 'gecersiz modul kodu',
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await p(
            'PUT',
            `/platform/kurumlar/019e0000-0000-7000-8000-000000000000/moduller/takvim`,
            yonetici.token,
            { acik: false, neden: 'olmayan kurum deneme' },
          )
        ).statusCode,
      ).toBe(404);
    });

    it('beta bayrağı: aç, listele, sil; kurum yalnız kendi bayraklarını okur, yazamaz (RLS)', async () => {
      const diger = await kurumluKullanici(t, 'kurum', 'Başka Kurum');
      const url = (kod: string) => `/platform/kurumlar/${kurum.kurumId}/beta/${kod}`;
      const ac = await p('PUT', url('yeni_ekran'), yonetici.token, {
        acik: true,
        neden: 'Pilot kurum, beta erişimi',
      });
      expect(ac.json()).toEqual({ ozellik_kodu: 'yeni_ekran', acik: true });
      expect(
        (await p('PUT', url('Gecersiz-Kod'), yonetici.token, { acik: true, neden: 'geçersiz kod' }))
          .statusCode,
      ).toBe(400);
      await p('PUT', `/platform/kurumlar/${diger.kurumId}/beta/baska_ekran`, yonetici.token, {
        acik: true,
        neden: 'diğer kurum pilotu',
      });
      const detay = await p('GET', `/platform/kurumlar/${kurum.kurumId}`, destek.token);
      expect(
        detay.json<{ beta_ozellikleri: { ozellik_kodu: string; acik: boolean }[] }>()
          .beta_ozellikleri,
      ).toMatchObject([{ ozellik_kodu: 'yeni_ekran', acik: true }]);

      // RLS: api_app yalniz aktif kurumun satirlarini gorur; yazma izni yok.
      const gorulen = await withTenant(appDb, { kurumId: kurum.kurumId }, (tx) =>
        tx.execute<{ ozellik_kodu: string }>(
          sql`select ozellik_kodu from hesap.kurum_beta_ozellikleri`,
        ),
      );
      expect(gorulen.map((r) => r.ozellik_kodu)).toEqual(['yeni_ekran']);
      const digerGorulen = await withTenant(appDb, { kurumId: diger.kurumId }, (tx) =>
        tx.execute<{ ozellik_kodu: string }>(
          sql`select ozellik_kodu from hesap.kurum_beta_ozellikleri`,
        ),
      );
      expect(digerGorulen.map((r) => r.ozellik_kodu)).toEqual(['baska_ekran']);
      const yazma = await hataMetni(
        withTenant(appDb, { kurumId: kurum.kurumId }, (tx) =>
          tx.execute(sql`update hesap.kurum_beta_ozellikleri set acik = false`),
        ),
      );
      expect(yazma).toMatch(/permission denied/i);
      const bos = await appDb.orm.execute<{ n: number }>(
        sql`select count(*)::int as n from hesap.kurum_beta_ozellikleri`,
      );
      expect(bos[0]?.n).toBe(0);

      const sil = await p('PUT', url('yeni_ekran'), yonetici.token, {
        acik: null,
        neden: 'pilot sona erdi',
      });
      expect(sil.json()).toEqual({ ozellik_kodu: 'yeni_ekran', acik: null });
    });
  });

  describe('taklit', () => {
    it('başlat, salt okunur oku, yaz 403, her istek denetime düş, sonlandır -> 401', async () => {
      const neden = 'Destek talebi #4821: ders listesi görünmüyor';
      expect(
        (
          await p('POST', '/platform/taklit', destek.token, {
            hedef_kullanici_id: kurum.kullaniciId,
            kurum_id: kurum.kurumId,
            neden: 'kısa',
          })
        ).statusCode,
      ).toBe(400);
      const basla = await p('POST', '/platform/taklit', destek.token, {
        hedef_kullanici_id: kurum.kullaniciId,
        kurum_id: kurum.kurumId,
        neden,
      });
      expect(basla.statusCode, basla.body).toBe(200);
      const tk = basla.json<{
        taklit_id: string;
        access_token: string;
        expires_in: number;
        bitis_at: string;
        rol: string;
      }>();
      expect(tk.rol).toBe('sahip');
      expect(tk.expires_in).toBeLessThanOrEqual(900);
      expect(tk.expires_in).toBeGreaterThan(850);
      const claims = JSON.parse(
        Buffer.from(tk.access_token.split('.')[1] ?? '', 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      expect(claims.sub).toBe(kurum.kullaniciId);
      expect(claims.aktor).toBe(destek.kullaniciId);
      expect(claims.imp).toMatchObject({ taklit_id: tk.taklit_id });
      expect(claims.sid).toBe(tk.taklit_id);
      expect(claims.plat).toBeUndefined();
      expect((claims.exp as number) - (claims.iat as number)).toBeLessThanOrEqual(900);

      const [kayit] = await sistem<
        { neden: string; ip: string; bitis_at: Date; baslangic_at: Date }[]
      >`
        select neden, host(ip) as ip, bitis_at, baslangic_at from hesap.taklit_kayitlari where id = ${tk.taklit_id}`;
      expect(kayit?.neden).toBe(neden);
      expect(
        (kayit?.bitis_at.getTime() ?? 0) - (kayit?.baslangic_at.getTime() ?? 0),
      ).toBeLessThanOrEqual(15 * 60_000);

      // Okuma 200 (hedefin gordugu).
      const oku = await p('GET', dersUrl(), tk.access_token);
      expect(oku.statusCode, oku.body).toBe(200);
      expect((await p('GET', '/v1/hesap/uyeliklerim', tk.access_token)).statusCode).toBe(200);
      // Yazma 403 taklit_salt_okunur: izinli rota, kapsam disi rota ve izin kapisi olmayan rota.
      for (const [yontem, url, govde] of [
        [
          'PUT',
          `/v1/hesap/kurumlar/${kurum.kurumId}/modul-ayarlari`,
          { modul_kodu: 'takvim', kapsam: 'kurum', acik: false },
        ],
        ['POST', '/v1/hesap/oturumlar/tumunu-kapat', {}],
        ['POST', '/v1/hesap/kurumlar', { ad: 'Yeni', tur: 'bireysel' }],
      ] as const) {
        const yaz = await p(yontem, url, tk.access_token, govde);
        expect(yaz.statusCode, url).toBe(403);
        expect(yaz.json<Hata>().error.code, url).toBe('taklit_salt_okunur');
      }
      // Taklit belirteciyle /platform/* cagrilamaz ve yenilenemez (oturum belirteci yok).
      const platUc = await p('GET', '/platform/kurumlar', tk.access_token);
      expect(platUc.statusCode).toBe(403);
      expect((await p('POST', '/auth/token', tk.access_token, {})).statusCode).toBe(401);
      // Hedefin verisi degismedi.
      const [ayar] = await sistem<{ n: number }[]>`
        select count(*)::int as n from hesap.modul_ayarlari where kurum_id = ${kurum.kurumId}`;
      expect(ayar?.n).toBe(0);

      // Her taklit istegi denetimde (taklit_kayit_id ile), reddedilenler dahil.
      const satirlar = await sistem<
        {
          sonra: { yontem: string; yol: string; durum: number };
          aktor_kullanici_id: string;
          kurum_id: string;
        }[]
      >`
        select sonra, aktor_kullanici_id, kurum_id from hesap.denetim_kayitlari
        where taklit_kayit_id = ${tk.taklit_id} and eylem = 'taklit.istek' order by created_at`;
      expect(satirlar.length).toBeGreaterThanOrEqual(6);
      expect(satirlar.every((s) => s.aktor_kullanici_id === destek.kullaniciId)).toBe(true);
      expect(satirlar.every((s) => s.kurum_id === kurum.kurumId)).toBe(true);
      expect(satirlar.map((s) => `${s.sonra.yontem} ${String(s.sonra.durum)}`)).toEqual(
        expect.arrayContaining(['GET 200', 'PUT 403', 'POST 403']),
      );
      expect(satirlar.some((s) => s.sonra.yol === '/v1/ders/kurumlar/:kurum_id/dersler')).toBe(
        true,
      );

      // Sonlandirma: yalniz baslatan veya yonetici; sonra belirtec 401.
      const baskasi = await p('POST', `/platform/taklit/${tk.taklit_id}/sonlandir`, yonetici.token);
      expect(baskasi.statusCode).toBe(200);
      const sonlandir = await p('POST', `/platform/taklit/${tk.taklit_id}/sonlandir`, destek.token);
      expect(sonlandir.statusCode).toBe(200);
      for (const [yontem, url] of [
        ['GET', dersUrl()],
        ['PUT', `/v1/hesap/kurumlar/${kurum.kurumId}/modul-ayarlari`],
      ] as const) {
        const bitti = await p(yontem, url, tk.access_token, yontem === 'PUT' ? {} : undefined);
        expect(bitti.statusCode, url).toBe(401);
      }
      // Hedefin kendi belirteci etkilenmez.
      expect((await p('GET', dersUrl(), kurum.token)).statusCode).toBe(200);
    });

    it('taklitte yan etkili GET (yoklama listesi katılımcı eşitleme, finans dışa aktarma) hata vermeden okur, yazmaz; işlem READ ONLY', async () => {
      const y = dersYardimcilari({ t, sistem });
      const s = await y.kur({ ogrenciSayisi: 2 });
      const ders = await y.dersAc(s);
      const katilimci = async () =>
        (
          await sistem<{ n: number }[]>`
            select count(*)::int n from ders.ders_katilimcilari where ders_id = ${ders.id}`
        )[0]?.n;
      expect(await katilimci()).toBe(2);
      const [yeni] = await y.topluOgrenci(s.k.kurumId, 1, 'Sonradan');
      await y.gruba(s.k, s.grup.id, [yeni ?? '']);
      const basla = await p('POST', '/platform/taklit', destek.token, {
        hedef_kullanici_id: s.k.kullaniciId,
        kurum_id: s.k.kurumId,
        neden: 'Destek talebi: yoklama listesi eksik görünüyor',
      });
      expect(basla.statusCode, basla.body).toBe(200);
      const tt = basla.json<{ access_token: string }>().access_token;
      const yoklamaUrl = `/v1/ders/kurumlar/${s.k.kurumId}/dersler/${ders.id}/yoklamalar`;
      const taklitOku = await p('GET', yoklamaUrl, tt);
      expect(taklitOku.statusCode, taklitOku.body).toBe(200);
      // Taklit okuma esitleme yazmadi.
      expect(await katilimci()).toBe(2);
      expect(taklitOku.json<{ katilimcilar: unknown[] }>().katilimcilar).toHaveLength(2);
      const ay = new Date().toISOString().slice(0, 7);
      const disaUrl = `/v1/finans/kurumlar/${s.k.kurumId}/disa-aktar?ay=${ay}`;
      const disaSayisi = async () =>
        (
          await sistem<{ n: number }[]>`
            select count(*)::int n from hesap.denetim_kayitlari
            where kurum_id = ${s.k.kurumId} and eylem = 'finans.disa_aktar'`
        )[0]?.n;
      const disa = await p('GET', disaUrl, tt);
      expect(disa.statusCode, disa.body.slice(0, 200)).toBe(200);
      expect(await disaSayisi()).toBe(0);
      expect((await p('GET', disaUrl, s.k.token)).statusCode).toBe(200);
      expect(await disaSayisi()).toBe(1);
      // Ayni okuma hedefin kendi belirteciyle esitler (yazma yolu kapali degil, yalniz taklitte).
      expect((await p('GET', yoklamaUrl, s.k.token)).statusCode).toBe(200);
      expect(await katilimci()).toBe(3);
    });

    it('süresi dolan taklit belirteci 401; başkasının taklidini destek sonlandıramaz', async () => {
      const basla = await p('POST', '/platform/taklit', destek.token, {
        hedef_kullanici_id: kurum.kullaniciId,
        kurum_id: kurum.kurumId,
        neden: 'Süre dolumu denemesi için taklit',
      });
      const tk = basla.json<{ taklit_id: string; access_token: string }>();
      expect((await p('GET', '/v1/hesap/uyeliklerim', tk.access_token)).statusCode).toBe(200);
      const ikinciDestek = await hazirPlatform('destek');
      const yasak = await p(
        'POST',
        `/platform/taklit/${tk.taklit_id}/sonlandir`,
        ikinciDestek.token,
      );
      expect(yasak.statusCode).toBe(403);
      await sistem`update hesap.taklit_kayitlari set bitis_at = now() - interval '1 second' where id = ${tk.taklit_id}`;
      const bitti = await p('GET', '/v1/hesap/uyeliklerim', tk.access_token);
      expect(bitti.statusCode).toBe(401);
      const tekrar = await p('POST', `/platform/taklit/${tk.taklit_id}/sonlandir`, destek.token);
      expect(tekrar.statusCode).toBe(200);
    });

    it('taklit eden platform rolünü kaybederse açık taklit düşer; izin dışı hedefler reddedilir', async () => {
      const gecici = await hazirPlatform('destek');
      const basla = await p('POST', '/platform/taklit', gecici.token, {
        hedef_kullanici_id: kurum.kullaniciId,
        kurum_id: kurum.kurumId,
        neden: 'Rol geri alma denemesi için taklit',
      });
      const tk = basla.json<{ access_token: string }>();
      expect((await p('GET', '/v1/hesap/uyeliklerim', tk.access_token)).statusCode).toBe(200);
      await sistem`update hesap.kullanicilar set platform_rolu = 'yok' where id = ${gecici.kullaniciId}`;
      expect((await p('GET', '/v1/hesap/uyeliklerim', tk.access_token)).statusCode).toBe(401);

      // Platform kullanicisi taklit edilemez; kurumda uye olmayan hedef 404.
      const platHedef = await p('POST', '/platform/taklit', destek.token, {
        hedef_kullanici_id: yonetici.kullaniciId,
        kurum_id: kurum.kurumId,
        neden: 'Platform kullanıcısını taklit denemesi',
      });
      expect([403, 404]).toContain(platHedef.statusCode);
      const baska = await kurumluKullanici(t, 'bireysel', 'Başka Hoca');
      const uyeDegil = await p('POST', '/platform/taklit', destek.token, {
        hedef_kullanici_id: baska.kullaniciId,
        kurum_id: kurum.kurumId,
        neden: 'Üye olmayan hedef denemesi',
      });
      expect(uyeDegil.statusCode).toBe(404);
      const platUyeligi = await p('POST', '/platform/taklit', destek.token, {
        hedef_kullanici_id: destek.kullaniciId,
        kurum_id: kurum.kurumId,
        neden: 'Platform kullanıcısı hedef denemesi',
      });
      expect([403, 404]).toContain(platUyeligi.statusCode);
    });

    it('taklit belirteci IP izin listesi dışından kullanılamaz', async () => {
      const s = testServisi({ PLATFORM_IP_IZINLI: '203.0.113.0/24' }, iz.urls);
      ayri.push(s);
      const k = await platformKullanicisi('destek', s);
      const izinli = '203.0.113.20';
      const kur = await cagri(s, 'POST', '/platform/ikinci-adim/kur', k.token, {}, izinli);
      const kod = totpKodu(base32Coz(kur.json<{ sir: string }>().sir), sayacHesapla(new Date()));
      await cagri(s, 'POST', '/platform/ikinci-adim/onayla', k.token, { kod }, izinli);
      const basla = await cagri(
        s,
        'POST',
        '/platform/taklit',
        k.token,
        {
          hedef_kullanici_id: kurum.kullaniciId,
          kurum_id: kurum.kurumId,
          neden: 'IP kısıtı taklit denemesi',
        },
        izinli,
      );
      expect(basla.statusCode, basla.body).toBe(200);
      const tk = basla.json<{ access_token: string }>().access_token;
      expect(
        (await cagri(s, 'GET', '/v1/hesap/uyeliklerim', tk, undefined, izinli)).statusCode,
      ).toBe(200);
      const dis = await cagri(s, 'GET', '/v1/hesap/uyeliklerim', tk, undefined, '192.0.2.9');
      expect(dis.statusCode).toBe(403);
      expect(dis.json<Hata>().error.code).toBe('platform_ip_yasak');
    });
  });

  describe('denetim', () => {
    it('her platform isteği (okuma, red ve eylem) denetime düşer; süzgeçler ve imleçli sayfalama çalışır', async () => {
      const k = await hazirPlatform('yonetici');
      const oncesi = await denetimSayisi('platform.kurum_ara', k.kullaniciId);
      for (let i = 0; i < 3; i++) {
        expect((await p('GET', '/platform/kurumlar?limit=1', k.token)).statusCode).toBe(200);
      }
      expect(await denetimSayisi('platform.kurum_ara', k.kullaniciId)).toBe(oncesi + 3);
      // 2FA'siz red de kayitli (aktor, durum, kod).
      const yeniK = await platformKullanicisi('destek');
      await p('GET', '/platform/kurumlar', yeniK.token);
      const [red] = await sistem<
        { sonra: { durum: number; kod: string; red: string }; ip: string }[]
      >`
        select sonra, host(ip) as ip from hesap.denetim_kayitlari
        where aktor_kullanici_id = ${yeniK.kullaniciId} and eylem = 'platform.kurum_ara'`;
      expect(red?.sonra).toMatchObject({
        durum: 403,
        kod: 'ikinci_adim_gerekli',
        red: 'ikinci_adim',
      });
      expect(red?.ip).toBeTruthy();

      const liste = async (sorgu: string) => {
        const res = await p('GET', `/platform/denetim?${sorgu}`, k.token);
        expect(res.statusCode, res.body).toBe(200);
        return res.json<{
          kayitlar: {
            id: string;
            eylem: string;
            aktor_kullanici_id: string | null;
            kurum_id: string | null;
            created_at: string;
          }[];
          sonraki_imlec: string | null;
        }>();
      };
      const aktorSuzgeci = await liste(
        `aktor_id=${k.kullaniciId}&eylem=platform.kurum_ara&limit=200`,
      );
      expect(aktorSuzgeci.kayitlar.length).toBeGreaterThanOrEqual(3);
      expect(
        aktorSuzgeci.kayitlar.every(
          (r) => r.eylem === 'platform.kurum_ara' && r.aktor_kullanici_id === k.kullaniciId,
        ),
      ).toBe(true);
      const onek = await liste(
        `aktor_id=${k.kullaniciId}&eylem=${encodeURIComponent('platform.*')}&limit=200`,
      );
      expect(onek.kayitlar.every((r) => r.eylem.startsWith('platform.'))).toBe(true);
      const kurumSuzgeci = await liste(`kurum_id=${kurum.kurumId}&limit=200`);
      expect(kurumSuzgeci.kayitlar.length).toBeGreaterThan(3);
      expect(kurumSuzgeci.kayitlar.every((r) => r.kurum_id === kurum.kurumId)).toBe(true);
      expect(new Set(kurumSuzgeci.kayitlar.map((r) => r.eylem))).toEqual(
        expect.objectContaining({}),
      );
      const eylemler = new Set(kurumSuzgeci.kayitlar.map((r) => r.eylem));
      expect(eylemler.has('platform.modul_ayarla')).toBe(true);
      expect(eylemler.has('taklit.istek')).toBe(true);
      expect(eylemler.has('platform.taklit_baslat')).toBe(true);

      // Tarih araligi: gelecekteki baslangic bos doner.
      const gelecek = await liste(
        `baslangic=${encodeURIComponent(new Date(Date.now() + 3_600_000).toISOString())}`,
      );
      expect(gelecek.kayitlar).toEqual([]);
      const gecmis = await liste(
        `baslangic=${encodeURIComponent(new Date(Date.now() - 3_600_000).toISOString())}&bitis=${encodeURIComponent(new Date(Date.now() + 3_600_000).toISOString())}&limit=1`,
      );
      expect(gecmis.kayitlar).toHaveLength(1);

      // Imleçli sayfalama: tum sayfalar birlestirilince yinelenen/eksik yok ve sira azalan.
      const hepsi: string[] = [];
      let imlec: string | null = null;
      let sayfa = 0;
      do {
        const g: Awaited<ReturnType<typeof liste>> = await liste(
          `aktor_id=${k.kullaniciId}&limit=2${imlec ? `&imlec=${imlec}` : ''}`,
        );
        hepsi.push(...g.kayitlar.map((r) => r.id));
        imlec = g.sonraki_imlec;
        sayfa++;
      } while (imlec && sayfa < 50);
      expect(new Set(hepsi).size).toBe(hepsi.length);
      expect(hepsi.length).toBeGreaterThan(4);
      const hepsiTek = await liste(`aktor_id=${k.kullaniciId}&limit=200`);
      // Sayfalama sirasinda yeni denetim satirlari eklenir (listeleme kendisi denetlenir): yalniz
      // eski kayitlarin ayni sirada ve tam geldigini dogrula.
      const tekIds = hepsiTek.kayitlar.map((r) => r.id);
      const kesisim = tekIds.filter((id) => hepsi.includes(id));
      expect(hepsi.filter((id) => tekIds.includes(id))).toEqual(kesisim);
      expect((await p('GET', '/platform/denetim?imlec=bozuk', k.token)).statusCode).toBe(400);
      // Denetim degismez: api_sistem silemez/guncelleyemez.
      expect(await hataMetni(sistem`delete from hesap.denetim_kayitlari`)).toMatch(
        /permission denied|defter_degistirilemez/i,
      );
    });
  });

  describe('sistem sağlığı', () => {
    it('outbox birikimi, kuyruk durumu ve süreç içi 5xx sayacı döner', async () => {
      const res = await p('GET', '/platform/sistem-sagligi', destek.token);
      expect(res.statusCode, res.body).toBe(200);
      const g = res.json<{
        outbox: { bekleyen: number; en_eski_yas_sn: number | null; hatali: number };
        kuyruklar: { pgboss_kurulu: boolean; derinlikler: unknown[]; basarisiz: number };
        http: {
          kaynak: string;
          pencere_dk: number;
          istek: number;
          hata_5xx: number;
          oran_5xx: number;
        };
      }>();
      // Modul kapatma olaylari NATS olmayan testte yayimlanmadan birikir.
      expect(g.outbox.bekleyen).toBeGreaterThanOrEqual(2);
      expect(g.outbox.en_eski_yas_sn).toBeGreaterThanOrEqual(0);
      expect(g.kuyruklar.pgboss_kurulu).toBe(false);
      expect(g.kuyruklar.derinlikler).toEqual([]);
      expect(g.http).toMatchObject({
        kaynak: 'surec_ici',
        pencere_dk: 60,
        hata_5xx: 0,
        oran_5xx: 0,
      });
      expect(g.http.istek).toBeGreaterThan(10);
    });
  });

  describe('bakım / duyuru mesajı', () => {
    it('yönetici yayınlar, kimliksiz uç etkin mesajı döndürür; önem sırası, zamanlama ve iptal', async () => {
      const acik = () => t.service.app.inject({ url: '/v1/platform-mesaji' });
      const bos = await acik();
      expect(bos.statusCode).toBe(200);
      expect(bos.json()).toEqual({ mesaj: null });

      const simdi = Date.now();
      const bilgi = await p('POST', '/platform/mesajlar', yonetici.token, {
        baslik: 'Planlı bakım',
        metin: 'Pazar 03:00-04:00 arası kısa kesinti olabilir.',
        onem: 'bilgi',
        bitis_at: new Date(simdi + 3_600_000).toISOString(),
      });
      expect(bilgi.statusCode, bilgi.body).toBe(200);
      const gelecek = await p('POST', '/platform/mesajlar', yonetici.token, {
        baslik: 'Gelecek duyuru',
        metin: 'Henüz başlamadı.',
        onem: 'kritik',
        baslangic_at: new Date(simdi + 600_000).toISOString(),
        bitis_at: new Date(simdi + 3_600_000).toISOString(),
      });
      expect(gelecek.statusCode).toBe(200);
      const g1 = (await acik()).json<{ mesaj: { baslik: string; onem: string } | null }>();
      expect(g1.mesaj).toMatchObject({ baslik: 'Planlı bakım', onem: 'bilgi' });
      expect(JSON.stringify(g1)).not.toContain('iptal_at');

      const uyari = await p('POST', '/platform/mesajlar', yonetici.token, {
        baslik: 'Giriş sorunu',
        metin: 'Bazı kullanıcılar giriş yapamıyor; çalışıyoruz.',
        onem: 'uyari',
        bitis_at: new Date(simdi + 3_600_000).toISOString(),
      });
      const uyariId = uyari.json<{ id: string }>().id;
      expect((await acik()).json<{ mesaj: { baslik: string } }>().mesaj.baslik).toBe(
        'Giriş sorunu',
      );
      const r = await acik();
      expect(r.headers['cache-control']).toContain('max-age');

      // Gecersiz sure, bos baslik.
      expect(
        (
          await p('POST', '/platform/mesajlar', yonetici.token, {
            baslik: 'x',
            metin: 'y',
            baslangic_at: new Date(simdi + 5000).toISOString(),
            bitis_at: new Date(simdi).toISOString(),
          })
        ).statusCode,
      ).toBe(400);

      const iptal = await p('POST', `/platform/mesajlar/${uyariId}/iptal`, yonetici.token);
      expect(iptal.statusCode).toBe(200);
      expect(
        (await p('POST', `/platform/mesajlar/${uyariId}/iptal`, yonetici.token)).statusCode,
      ).toBe(404);
      expect((await acik()).json<{ mesaj: { baslik: string } }>().mesaj.baslik).toBe(
        'Planlı bakım',
      );

      const liste = await p('GET', '/platform/mesajlar', destek.token);
      expect(liste.json<{ mesajlar: unknown[] }>().mesajlar).toHaveLength(3);
      // Suresi biten mesaj gorunmez.
      await sistem`update hesap.platform_mesajlari set baslangic_at = now() - interval '2 hours', bitis_at = now() - interval '1 hour' where baslik = 'Planlı bakım'`;
      expect((await acik()).json()).toEqual({ mesaj: null });
      // api_app mesaj yazamaz (yalniz okur).
      expect(await hataMetni(appDb.orm.execute(sql`delete from hesap.platform_mesajlari`))).toMatch(
        /permission denied/i,
      );
    });
  });

  describe('platform yöneticisi ekleme (betik çekirdeği)', () => {
    it('kullanıcı yoksa oluşturur, varsa rolü verir; denetime yazar; 2FA sıfırlanabilir', async () => {
      const telefon = '+905550001122';
      const ilk = await platformYoneticiEkle(sistemDb, {
        telefonE164: telefon,
        rol: 'yonetici',
        ikinciAdimiSifirla: false,
      });
      expect(ilk).toMatchObject({ yeniKullanici: true, rol: 'yonetici' });
      const [u] = await sistem<{ platform_rolu: string; telefon_dogrulandi_at: Date | null }[]>`
        select platform_rolu, telefon_dogrulandi_at from hesap.kullanicilar where id = ${ilk.kullaniciId}`;
      expect(u?.platform_rolu).toBe('yonetici');
      expect(u?.telefon_dogrulandi_at).not.toBeNull();
      // Ayni kullanici OTP ile girince ayni hesaba baglanir ve token plat tasir.
      const giris = await otpIleGiris(t, telefon);
      expect(giris.kullaniciId).toBe(ilk.kullaniciId);
      const { accessToken } = await tokenAl(t, giris.oturum);
      expect((await p('GET', '/platform/ben', accessToken)).json()).toMatchObject({
        platform_rolu: 'yonetici',
      });
      await ikinciAdimTamamla({ ...giris, token: accessToken, rol: 'yonetici' });
      const ikinci = await platformYoneticiEkle(sistemDb, {
        telefonE164: telefon,
        rol: 'destek',
        ikinciAdimiSifirla: true,
      });
      expect(ikinci).toMatchObject({
        yeniKullanici: false,
        rol: 'destek',
        ikinciAdimSifirlandi: true,
      });
      expect(
        (
          await sistem`select 1 from hesap.platform_ikinci_adim where kullanici_id = ${ilk.kullaniciId}`
        ).length,
      ).toBe(0);
      expect(await denetimSayisi('platform.yonetici_ekle')).toBeGreaterThanOrEqual(2);
      // Kisisel veri denetime girmez.
      const kayitlar =
        await sistem`select to_jsonb(d) as satir from hesap.denetim_kayitlari d where eylem like 'platform.yonetici_ekle%'`;
      expect(JSON.stringify(kayitlar)).not.toContain(telefon);
      const eposta = await platformYoneticiEkle(sistemDb, {
        eposta: 'yonetici@ornek.com',
        rol: 'yonetici',
        ikinciAdimiSifirla: false,
      });
      expect(eposta.yeniKullanici).toBe(true);
    });

    it('rıza ekranı platform uçlarında aranmaz', async () => {
      const k = await platformKullanicisi('destek');
      const g = await p('GET', '/v1/hesap/ben', k.token);
      expect(g.statusCode).toBe(200);
      const ben = await p('GET', '/platform/ben', k.token);
      expect(ben.statusCode).toBe(200);
      await rizaKabulEt(t, k.token);
    });
  });

  describe('10.000 kurumda arama', () => {
    it('ad / kimlik / sahip telefonu ve e-postası ile arama hızlı ve indeksli', async () => {
      const [sahip] = await sistem<{ id: string }[]>`select id from hesap.kullanicilar limit 1`;
      const sahipId = sahip?.id ?? '';
      await sistem`
        insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id)
        select gen_random_uuid(), 'Toplu Kurum ' || g || case when g % 977 = 0 then ' Çözüm İlköğretim' else '' end,
               'kurum', ${sahipId}::uuid
        from generate_series(1, 10000) g`;
      await sistem`analyze hesap.kurumlar`;
      const olc = async (q: string) => {
        const bas = performance.now();
        const res = await p(
          'GET',
          `/platform/kurumlar?q=${encodeURIComponent(q)}&limit=25`,
          destek.token,
        );
        expect(res.statusCode, res.body).toBe(200);
        return {
          ms: performance.now() - bas,
          govde: res.json<{ kurumlar: { ad: string }[]; sonraki_imlec: string | null }>(),
        };
      };
      await olc('ısınma'); // baglanti havuzu / plan onbellegi
      const ad = await olc('Çözüm ilkö');
      expect(ad.govde.kurumlar.length).toBeGreaterThan(5);
      expect(ad.govde.kurumlar.every((k) => k.ad.includes('Çözüm İlköğretim'))).toBe(true);
      expect(ad.ms).toBeLessThan(500);
      const tekil = await olc('Toplu Kurum 4242');
      expect(tekil.govde.kurumlar.map((k) => k.ad)).toContain('Toplu Kurum 4242');
      expect(tekil.ms).toBeLessThan(500);
      const kimlik = await olc(kurum.kurumId);
      expect(kimlik.govde.kurumlar).toHaveLength(1);
      expect(kimlik.ms).toBeLessThan(300);
      const telefon = await olc(kurum.telefon);
      expect(telefon.govde.kurumlar.map((k) => k.ad)).toContain('Platform Deneme Okulu');
      expect(telefon.ms).toBeLessThan(300);
      // Ad aramasi trigram indeksini kullanir (tam tarama degil).
      // (10.000 satirda planlayici tarama secer; indeksin KULLANILABILIR oldugunu dogrularız.)
      const plan = await sistem.begin(async (tx) => {
        await tx`set local enable_seqscan = off`;
        return tx<{ 'QUERY PLAN': string }[]>`
          explain select id from hesap.kurumlar
          where translate(ad, 'İIı', 'iii') ilike '%çözüm%'`;
      });
      expect(plan.map((r) => r['QUERY PLAN']).join('\n')).toMatch(/kurumlar_ad_trgm_idx/);
      await sistem`delete from hesap.kurumlar where ad like 'Toplu Kurum %'`;
    }, 60_000);
  });
});
