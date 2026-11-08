import { MODUL_KODLARI } from '@kopru/contracts';

import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { gercekAdaptorler } from './gercek';
import { apiHatasiMi, type ApiHata } from './tipler';

const KURUM = '0190f3a0-0000-7000-8000-000000000001';
const UYELIK = '0190f3a0-0000-7000-8000-000000000002';
const GRUP = '0190f3a0-0000-7000-8000-000000000010';
const ISTEK = '0190f3a0-0000-7000-8000-000000000011';
const KULLANICI = '0190f3a0-0000-7000-8000-000000000005';
const OTURUM = '0190f3a0-0000-7000-8000-000000000020';
const OTURUM_2 = '0190f3a0-0000-7000-8000-000000000021';

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), { status, headers: { 'content-type': 'application/json' } });
const hata = (status: number, code: string) => json({ error: { code, message: 'x' } }, status);

interface Cagri {
  yol: string;
  yontem: string;
  govde: unknown;
  govdeMetni: string;
  icerikTuru: string | null;
}
type Yonlendirici = (c: Cagri) => Response | Promise<Response>;

const apiIstek = {
  id: ISTEK,
  kurum_id: KURUM,
  kurum_ad: 'Deneme Kurumu',
  grup_id: GRUP,
  grup_ad: '8-A',
  durum: 'bekliyor',
  karar_at: null,
  created_at: '2026-11-08T10:00:00.000Z',
};

/** Etkin kurumu olan (uyelikSec yapilmis) adaptor. */
async function kur(yonlendir: Yonlendirici) {
  const cagrilar: Cagri[] = [];
  const f = (async (girdi: Request) => {
    const url = new URL(girdi.url);
    const metin = await girdi.clone().text();
    const c: Cagri = {
      yol: url.pathname + url.search,
      yontem: girdi.method,
      govde: metin ? (JSON.parse(metin) as unknown) : undefined,
      govdeMetni: metin,
      icerikTuru: girdi.headers.get('content-type'),
    };
    cagrilar.push(c);
    if (c.yol === '/v1/hesap/ben') {
      return json({
        kullanici: {
          id: KULLANICI,
          gorunen_ad: 'Hoca',
          telefon_e164: '+905321112233',
          eposta: null,
        },
        uyelikler: [
          {
            uyelik_id: UYELIK,
            kurum_id: KURUM,
            kurum_ad: 'Deneme Kurumu',
            rol: 'ogretmen',
            durum: 'aktif',
          },
        ],
        onay_gerekli: false,
      });
    }
    if (c.yol === '/auth/token') {
      return json({
        access_token: 'kurum-erisim',
        token_type: 'Bearer',
        expires_in: 900,
        kurum_id: KURUM,
        uyelik_id: UYELIK,
        rol: 'ogretmen',
        roller: ['ogretmen'],
        uyelikler: [],
      });
    }
    if (c.yol === '/v1/hesap/modul-ayarlari/etkin-tumu') {
      return json({ moduller: Object.fromEntries(MODUL_KODLARI.map((k) => [k, k !== 'finans'])) });
    }
    return yonlendir(c);
  }) as unknown as typeof globalThis.fetch;
  const depo = bellekBelirtecDeposu();
  await depo.yaz({ erisim: 'e', yenileme: 'oturum-1', erisimBitis: Date.now() + 600_000 });
  const adaptorler = gercekAdaptorler({ apiUrl: 'http://api.test', depo, fetch: f });
  await adaptorler.auth.uyelikSec(UYELIK);
  cagrilar.length = 0;
  return { adaptorler, depo, cagrilar };
}

async function hatayiYakala(p: Promise<unknown>): Promise<ApiHata> {
  try {
    await p;
  } catch (e) {
    if (apiHatasiMi(e)) return e;
    throw e;
  }
  throw new Error('hata bekleniyordu');
}

describe('modul durumu: etkin-tumu', () => {
  it('eksik ya da bilinmeyen modul kodu kapali sayilir (fail-closed)', async () => {
    // Kismi yanit icin ozel fetch: yalniz takvim acik, odev kapali, digerleri yok.
    const depo = bellekBelirtecDeposu();
    await depo.yaz({ erisim: 'e', yenileme: 'o', erisimBitis: Date.now() + 600_000 });
    const a = gercekAdaptorler({
      apiUrl: 'http://api.test',
      depo,
      fetch: ((girdi: Request) => {
        const yol = new URL(girdi.url).pathname;
        if (yol === '/v1/hesap/ben') {
          return json({
            kullanici: { id: KULLANICI, gorunen_ad: null, telefon_e164: null, eposta: null },
            uyelikler: [
              { uyelik_id: UYELIK, kurum_id: KURUM, kurum_ad: 'K', rol: 'ogrenci', durum: 'aktif' },
            ],
            onay_gerekli: false,
          });
        }
        if (yol === '/auth/token') {
          return json({ access_token: 'x', token_type: 'Bearer', expires_in: 900, rol: 'ogrenci' });
        }
        return json({ moduller: { takvim: true, odev: false } });
      }) as unknown as typeof globalThis.fetch,
    });
    const b = await a.auth.uyelikSec(UYELIK);
    expect(b.moduller.takvim).toBe(true);
    expect(b.moduller.odev).toBe(false);
    expect(b.moduller.yoklama).toBe(false);
    expect(Object.keys(b.moduller)).toHaveLength(MODUL_KODLARI.length);
  });
});

describe('govdesiz mutasyonlar bos JSON govdesi gonderir', () => {
  it('cikis, iptal, onay, red, oturum sonlandirma ve kod yenileme `{}` tasir (400 yok)', async () => {
    const { adaptorler, cagrilar } = await kur((c) => {
      if (c.yol.endsWith('/iptal') && c.yol.includes('sinif-kodu')) return json(apiIstek);
      if (c.yol.endsWith('/onayla')) {
        return json({ istek: { ...apiIstek }, uyelik_id: null, grup_uyesi_id: null });
      }
      if (c.yol.endsWith('/reddet')) return json({ ...apiIstek, durum: 'reddedildi' });
      if (c.yontem === 'DELETE') return json({ ok: true });
      if (c.yol.endsWith('/katilim-kodu')) {
        return json(
          {
            id: ISTEK,
            grup_id: GRUP,
            kod: 'ABCD2345',
            aktif: true,
            expires_at: null,
            max_kullanim: null,
            kullanim_sayisi: 0,
            iptal_at: null,
            created_at: apiIstek.created_at,
          },
          201,
        );
      }
      if (c.yol === '/auth/cikis') return json({ cikis: true });
      return json({ kapatilan: 0 });
    });

    await adaptorler.hesap.sinifKoduIstegiIptal(ISTEK);
    await adaptorler.hesap.katilimIstegiOnayla(GRUP, ISTEK);
    await adaptorler.hesap.katilimIstegiReddet(GRUP, ISTEK);
    await adaptorler.hesap.katilimKoduYenile(GRUP);
    await adaptorler.hesap.oturumSonlandir(OTURUM_2, false);
    await adaptorler.hesap.oturumlariKapat(true);
    await adaptorler.auth.cikis();

    const mutasyonlar = cagrilar.filter((c) => c.yontem !== 'GET');
    expect(mutasyonlar).toHaveLength(7);
    for (const c of mutasyonlar) {
      // Ya hic content-type yok ya da govde gecerli JSON; "json basligi + bos govde" asla.
      if (c.icerikTuru?.includes('json')) expect(c.govdeMetni).not.toBe('');
      expect(c.govdeMetni).not.toBe('');
      expect(typeof c.govde).toBe('object');
    }
  });
});

describe('sinif kodu ile katilim (ogrenci)', () => {
  it('katil: kodu gonderir ve istegi cevirir', async () => {
    const { adaptorler, cagrilar } = await kur(() => json(apiIstek, 201));
    const i = await adaptorler.hesap.sinifKoduKatil('ABCD2345');
    expect(cagrilar[0]?.govde).toEqual({ kod: 'ABCD2345' });
    expect(i).toEqual({
      id: ISTEK,
      kurumId: KURUM,
      kurumAd: 'Deneme Kurumu',
      grupId: GRUP,
      grupAd: '8-A',
      durum: 'bekliyor',
      olusturma: apiIstek.created_at,
    });
  });

  it.each([
    [410, 'kod_gecersiz', 'kod_gecersiz'],
    [409, 'zaten_uye', 'zaten_uye'],
    [429, 'cok_fazla_istek', 'cok_istek'],
  ])('katil %i %s -> %s', async (durum, kod, beklenen) => {
    const { adaptorler } = await kur(() => hata(durum, kod));
    const e = await hatayiYakala(adaptorler.hesap.sinifKoduKatil('ABCD2345'));
    expect(e.kod).toBe(beklenen);
    expect(e.durum).toBe(durum);
  });

  it('isteklerim listeler; iptal 409 cakisma olur', async () => {
    const { adaptorler } = await kur((c) => {
      if (c.yol === '/v1/hesap/sinif-kodu/istekler') return json({ istekler: [apiIstek] });
      return hata(409, 'istek_beklemiyor');
    });
    expect(await adaptorler.hesap.sinifKoduIsteklerim()).toHaveLength(1);
    const e = await hatayiYakala(adaptorler.hesap.sinifKoduIstegiIptal(ISTEK));
    expect(e.kod).toBe('cakisma');
    expect(e.ayrinti).toBe('istek_beklemiyor');
  });

  it('OTP uclarinda 429 hala otp_cok_deneme', async () => {
    const { adaptorler } = await kur(() => hata(429, 'cok_fazla_istek'));
    const e = await hatayiYakala(adaptorler.auth.otpIste('+905321112233'));
    expect(e.kod).toBe('otp_cok_deneme');
  });
});

describe('ogretmen onayi', () => {
  it('sinif gruplarini ve bekleyen istekleri getirir (telefon yok, yalniz gorunen ad)', async () => {
    const { adaptorler, cagrilar } = await kur((c) => {
      if (c.yol.startsWith(`/v1/hesap/kurumlar/${KURUM}/gruplar?`)) {
        return json({
          gruplar: [{ id: GRUP, tur: 'sinif', ad: '8-A', uye_sayisi: 12 }],
          kapsam: 'grup',
          sonraki_imlec: null,
        });
      }
      if (c.yol.includes('/katilim-istekleri')) {
        return json({
          istekler: [
            {
              id: ISTEK,
              grup_id: GRUP,
              kullanici_id: KULLANICI,
              gorunen_ad: 'Elif K.',
              durum: 'bekliyor',
              karar_veren_id: null,
              karar_at: null,
              created_at: apiIstek.created_at,
            },
          ],
          sonraki_imlec: null,
        });
      }
      return hata(404, 'bulunamadi');
    });
    const r = await adaptorler.hesap.sinifBekleyenleri();
    expect(r).toEqual([
      {
        grup: { id: GRUP, ad: '8-A', uyeSayisi: 12 },
        istekler: [
          {
            id: ISTEK,
            grupId: GRUP,
            kullaniciId: KULLANICI,
            gorunenAd: 'Elif K.',
            olusturma: apiIstek.created_at,
          },
        ],
      },
    ]);
    expect(cagrilar[0]?.yol).toContain('tur=sinif');
    expect(cagrilar[0]?.yol).toContain('durum=aktif');
    expect(cagrilar[1]?.yol).toContain('durum=bekliyor');
  });

  it('onay 409 kapasite_dolu ayrinti tasir; kod yoksa katilimKodu null doner', async () => {
    const { adaptorler } = await kur((c) =>
      c.yol.endsWith('/onayla') ? hata(409, 'kapasite_dolu') : hata(404, 'bulunamadi'),
    );
    const e = await hatayiYakala(adaptorler.hesap.katilimIstegiOnayla(GRUP, ISTEK));
    expect(e.kod).toBe('cakisma');
    expect(e.ayrinti).toBe('kapasite_dolu');
    expect(await adaptorler.hesap.katilimKodu(GRUP)).toBeNull();
  });

  it('katilimKodu etkin kodu cevirir', async () => {
    const { adaptorler } = await kur(() =>
      json({
        id: ISTEK,
        grup_id: GRUP,
        kod: 'ABCD2345',
        aktif: true,
        expires_at: '2027-01-01T00:00:00.000Z',
        max_kullanim: 40,
        kullanim_sayisi: 3,
        iptal_at: null,
        created_at: apiIstek.created_at,
      }),
    );
    expect(await adaptorler.hesap.katilimKodu(GRUP)).toEqual({
      kod: 'ABCD2345',
      bitis: '2027-01-01T00:00:00.000Z',
      maxKullanim: 40,
      kullanimSayisi: 3,
    });
  });
});

describe('davet kabul', () => {
  it('belirteci govdede gonderir; 410 davet_gecersiz, 409 zaten_uye', async () => {
    const belirtec = 'a'.repeat(32);
    const { adaptorler, cagrilar } = await kur(() =>
      json({
        davet_id: ISTEK,
        kurum_id: KURUM,
        uyelik_id: UYELIK,
        rol: 'ogrenci',
        grup_id: null,
        grup_uyesi_id: null,
      }),
    );
    expect(await adaptorler.hesap.davetKabul(belirtec)).toEqual({
      kurumId: KURUM,
      uyelikId: UYELIK,
      rol: 'ogrenci',
    });
    expect(cagrilar[0]?.govde).toEqual({ belirtec });
    // Belirtec URL'ye (sorgu/yol) sizmaz.
    expect(cagrilar[0]?.yol).not.toContain(belirtec);

    const k2 = await kur(() => hata(410, 'davet_gecersiz'));
    expect((await hatayiYakala(k2.adaptorler.hesap.davetKabul(belirtec))).kod).toBe(
      'davet_gecersiz',
    );
    const k3 = await kur(() => hata(409, 'zaten_uye'));
    expect((await hatayiYakala(k3.adaptorler.hesap.davetKabul(belirtec))).kod).toBe('zaten_uye');
  });
});

describe('oturumlarim', () => {
  const liste = {
    oturumlar: [
      {
        id: OTURUM,
        created_at: '2026-11-01T10:00:00.000Z',
        son_kullanim_at: '2026-11-08T10:00:00.000Z',
        expires_at: '2026-12-01T10:00:00.000Z',
        cihaz: 'iPhone',
        ip_maskeli: '1.2.*.*',
        bu_oturum: true,
      },
      {
        id: OTURUM_2,
        created_at: '2026-11-02T10:00:00.000Z',
        son_kullanim_at: '2026-11-07T10:00:00.000Z',
        expires_at: '2026-12-02T10:00:00.000Z',
        cihaz: null,
        ip_maskeli: null,
        bu_oturum: false,
      },
    ],
  };

  it('listeyi cevirir ve bu oturumu isaretler', async () => {
    const { adaptorler } = await kur(() => json(liste));
    const o = await adaptorler.hesap.oturumlar();
    expect(o.map((x) => [x.id, x.buOturum, x.cihaz])).toEqual([
      [OTURUM, true, 'iPhone'],
      [OTURUM_2, false, null],
    ]);
  });

  it('baska oturumu sonlandirmak yerel belirteci silmez', async () => {
    const { adaptorler, depo, cagrilar } = await kur(() => json({ ok: true }));
    const r = await adaptorler.hesap.oturumSonlandir(OTURUM_2, false);
    expect(r.kendiOturumuKapandi).toBe(false);
    expect(cagrilar[0]).toMatchObject({
      yontem: 'DELETE',
      yol: `/v1/hesap/oturumlar/${OTURUM_2}`,
    });
    expect(await depo.oku()).not.toBeNull();
  });

  it('kendi oturumunu sonlandirmak yerel belirteci siler', async () => {
    const { adaptorler, depo } = await kur(() => json({ ok: true }));
    const r = await adaptorler.hesap.oturumSonlandir(OTURUM, true);
    expect(r.kendiOturumuKapandi).toBe(true);
    expect(await depo.oku()).toBeNull();
  });

  it('digerlerini kapat: mevcut_haric=true, belirtec korunur', async () => {
    const { adaptorler, depo, cagrilar } = await kur(() => json({ kapatilan: 2 }));
    const r = await adaptorler.hesap.oturumlariKapat(true);
    expect(r).toEqual({ kapatilan: 2, kendiOturumuKapandi: false });
    expect(cagrilar[0]?.govde).toEqual({ mevcut_haric: true });
    expect(await depo.oku()).not.toBeNull();
  });

  it('hepsini kapat: mevcut_haric=false, yerel belirtec silinir', async () => {
    const { adaptorler, depo, cagrilar } = await kur(() => json({ kapatilan: 3 }));
    const r = await adaptorler.hesap.oturumlariKapat(false);
    expect(r).toEqual({ kapatilan: 3, kendiOturumuKapandi: true });
    expect(cagrilar[0]?.govde).toEqual({ mevcut_haric: false });
    expect(await depo.oku()).toBeNull();
  });

  it('sunucu hatasinda yerel belirtec silinmez', async () => {
    const { adaptorler, depo } = await kur(() => hata(404, 'bulunamadi'));
    const e = await hatayiYakala(adaptorler.hesap.oturumSonlandir(OTURUM, true));
    expect(e.kod).toBe('bulunamadi');
    expect(await depo.oku()).not.toBeNull();
  });
});
