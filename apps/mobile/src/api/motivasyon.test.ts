import { MODUL_KODLARI } from '@kopru/contracts';

import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { gercekAdaptorler } from './gercek';
import { odakAcikOturumHatasindan } from './motivasyonTipleri';
import { apiHatasiMi, type ApiHata } from './tipler';

const KURUM = '0190f3a0-0000-7000-8000-000000000001';
const UYELIK = '0190f3a0-0000-7000-8000-000000000002';
const KULLANICI = '0190f3a0-0000-7000-8000-000000000005';
const ISTEMCI = '0190f3a0-0000-7000-8000-0000000000a1';
const GRUP = '0190f3a0-0000-7000-8000-000000000031';
const OGRENCI = '0190f3a0-0000-7000-8000-000000000032';

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), { status, headers: { 'content-type': 'application/json' } });
const hata = (status: number, code: string, details?: unknown) =>
  json({ error: { code, message: 'x', ...(details ? { details } : {}) } }, status);

interface Cagri {
  adres: string;
  yol: string;
  yontem: string;
  govde: unknown;
  baslik: (ad: string) => string | null;
}

const oturum = (ek: Record<string, unknown> = {}) => ({
  id: '0190f3a0-0000-7000-8000-0000000000b1',
  istemci_id: ISTEMCI,
  baslangic_at: '2026-11-12T10:00:00.000Z',
  bitis_at: null,
  planlanan_dk: 25,
  gerceklesen_sn: 0,
  durum: 'devam',
  brans_kodu: null,
  plan_gorev_id: null,
  cihaz: null,
  ...ek,
});

async function kur(yonlendir: (c: Cagri) => Response | Promise<Response>) {
  const cagrilar: Cagri[] = [];
  const f = (async (girdi: Request) => {
    const url = new URL(girdi.url);
    const metin = await girdi.clone().text();
    const c: Cagri = {
      adres: url.origin,
      yol: url.pathname + url.search,
      yontem: girdi.method,
      govde: metin ? (JSON.parse(metin) as unknown) : undefined,
      baslik: (ad) => girdi.headers.get(ad),
    };
    if (c.yol === '/v1/hesap/ben') {
      return json({
        kullanici: {
          id: KULLANICI,
          gorunen_ad: 'Ogr',
          telefon_e164: '+905321112233',
          eposta: null,
        },
        uyelikler: [
          { uyelik_id: UYELIK, kurum_id: KURUM, kurum_ad: 'K', rol: 'ogrenci', durum: 'aktif' },
        ],
        onay_gerekli: false,
      });
    }
    if (c.yol === '/auth/token') {
      return json({
        access_token: 'kurum-erisim',
        token_type: 'Bearer',
        expires_in: 900,
        rol: 'ogrenci',
      });
    }
    if (c.yol === '/v1/hesap/modul-ayarlari/etkin-tumu') {
      return json({ moduller: Object.fromEntries(MODUL_KODLARI.map((k) => [k, true])) });
    }
    cagrilar.push(c);
    return yonlendir(c);
  }) as unknown as typeof globalThis.fetch;
  const depo = bellekBelirtecDeposu();
  await depo.yaz({ erisim: 'e', yenileme: 'oturum-1', erisimBitis: Date.now() + 600_000 });
  const adaptorler = gercekAdaptorler({
    apiUrl: 'http://api.test',
    motivasyonUrl: 'http://mot.test',
    depo,
    fetch: f,
  });
  await adaptorler.auth.uyelikSec(UYELIK);
  return { m: adaptorler.motivasyon, cagrilar };
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

describe('gercek motivasyon adaptoru', () => {
  it('motivasyon istekleri motivasyon taban adresine ve kurum yoluna gider', async () => {
    const { m, cagrilar } = await kur(() => json({ oturum: null }));
    await m.odakAcik();
    expect(cagrilar[0]).toMatchObject({
      adres: 'http://mot.test',
      yontem: 'GET',
      yol: `/v1/motivasyon/kurumlar/${KURUM}/odak-oturumlari/acik`,
    });
    expect(cagrilar[0]?.baslik('authorization')).toBe('Bearer kurum-erisim');
  });

  it('odak baslat: istemci_id, mod ve istege bagli alanlar; cevrimdisi baslangic_at gider', async () => {
    const { m, cagrilar } = await kur(() => json(oturum(), 201));
    const o = await m.odakBaslat({
      istemciId: ISTEMCI,
      mod: '25_5',
      planlananDk: 25,
      baslangicAt: '2026-11-12T09:55:00.000Z',
      planGorevId: GRUP,
      bransKodu: 'matematik',
      cihaz: 'ios',
    });
    expect(o.istemci_id).toBe(ISTEMCI);
    expect(cagrilar[0]?.govde).toEqual({
      istemci_id: ISTEMCI,
      mod: '25_5',
      planlanan_dk: 25,
      baslangic_at: '2026-11-12T09:55:00.000Z',
      plan_gorev_id: GRUP,
      brans_kodu: 'matematik',
      cihaz: 'ios',
    });
    // anlik baslatmada baslangic_at yollanmaz (sunucu zamani dogrulanmis sayilir)
    await m.odakBaslat({ istemciId: ISTEMCI, mod: 'serbest', planlananDk: 10 });
    expect(cagrilar[1]?.govde).toEqual({ istemci_id: ISTEMCI, mod: 'serbest', planlanan_dk: 10 });
  });

  it('409 acik_oturum_var: cakisma hatasi ve details.oturum okunabilir', async () => {
    const mevcut = oturum({ istemci_id: '0190f3a0-0000-7000-8000-0000000000a2' });
    const { m } = await kur(() => hata(409, 'acik_oturum_var', { oturum: mevcut }));
    const e = await hatayiYakala(m.odakBaslat({ istemciId: ISTEMCI, mod: '25_5' }));
    expect(e).toMatchObject({ kod: 'cakisma', ayrinti: 'acik_oturum_var', durum: 409 });
    expect(odakAcikOturumHatasindan(e.detay)?.istemci_id).toBe(mevcut.istemci_id);
    expect(odakAcikOturumHatasindan(undefined)).toBeNull();
  });

  it('odak bitir: durum + bitis_at gider, kazanim camelCase doner; 404 bulunamadi', async () => {
    const { m, cagrilar } = await kur((c) =>
      c.yol.includes(`${ISTEMCI}/bitir`)
        ? json({
            oturum: oturum({ durum: 'tamam', gerceklesen_sn: 600 }),
            kazanim: {
              xp: 10,
              seviye_atladi: true,
              yeni_rozetler: ['odak_bronz'],
              dogrulanmamis_sayilan_sn: 1200,
              dogrulanmamis_sayilmayan_sn: 300,
            },
          })
        : hata(404, 'not_found'),
    );
    const r = await m.odakBitir(ISTEMCI, 'tamam', '2026-11-12T10:10:00.000Z');
    expect(cagrilar[0]?.govde).toEqual({ durum: 'tamam', bitis_at: '2026-11-12T10:10:00.000Z' });
    expect(r.kazanim).toEqual({
      xp: 10,
      seviyeAtladi: true,
      yeniRozetler: ['odak_bronz'],
      dogrulanmamisSayilanSn: 1200,
      dogrulanmamisSayilmayanSn: 300,
    });
    const e = await hatayiYakala(m.odakBitir('0190f3a0-0000-7000-8000-0000000000ff', 'tamam'));
    expect(e).toMatchObject({ kod: 'bulunamadi', durum: 404 });
  });

  it('karakter secimi: uygunsuz ad 422 -> dogrulama + ayrinti', async () => {
    const { m, cagrilar } = await kur(() => hata(422, 'karakter_adi_uygunsuz'));
    const e = await hatayiYakala(m.karakterSec('kivilcim', 'kotu'));
    expect(e).toMatchObject({ kod: 'dogrulama', ayrinti: 'karakter_adi_uygunsuz' });
    expect(cagrilar[0]?.govde).toEqual({ tur_kodu: 'kivilcim', ad: 'kotu' });
  });

  it('kozmetik cikarma: govdesiz DELETE content-type gondermez; kusanma govdeli PUT', async () => {
    const { m, cagrilar } = await kur((c) =>
      json(c.yontem === 'PUT' ? { ok: true } : { ok: true }),
    );
    await m.kusan('sapka', 'sapka_bere');
    await m.cikar('sapka');
    expect(cagrilar[0]).toMatchObject({ yontem: 'PUT', govde: { kozmetik_kodu: 'sapka_bere' } });
    expect(cagrilar[0]?.yol).toBe(`/v1/motivasyon/kurumlar/${KURUM}/karakter/kusanimlar/sapka`);
    expect(cagrilar[1]?.yontem).toBe('DELETE');
    expect(cagrilar[1]?.baslik('content-type')).toBeNull();
    expect(cagrilar[1]?.govde).toBeUndefined();
  });

  it('modul kapali 403: modul_kapali', async () => {
    const { m } = await kur(() => hata(403, 'modul_kapali'));
    expect((await hatayiYakala(m.benim())).kod).toBe('modul_kapali');
  });

  it('haftanin yildizi: 409 mesaj kodlari ayrinti olarak gelir; kalan hak okunur', async () => {
    let n = 0;
    const { m, cagrilar } = await kur((c) => {
      if (c.yontem === 'GET') {
        return json({
          hafta_baslangic: '2026-11-09',
          limit: 3,
          verilen: 1,
          kalan: 2,
          yildizlar: [],
        });
      }
      n += 1;
      return hata(409, n === 1 ? 'haftanin_yildizi_verilmis' : 'haftalik_limit_asildi');
    });
    const e1 = await hatayiYakala(
      m.yildizVer({ ogrenciId: OGRENCI, grupId: GRUP, gerekce: 'Harika' }),
    );
    expect(e1.ayrinti).toBe('haftanin_yildizi_verilmis');
    expect(cagrilar[0]?.govde).toEqual({ ogrenci_id: OGRENCI, grup_id: GRUP, gerekce: 'Harika' });
    expect((await hatayiYakala(m.yildizVer({ ogrenciId: OGRENCI, grupId: GRUP }))).ayrinti).toBe(
      'haftalik_limit_asildi',
    );
    expect(await m.yildizVerdiklerim()).toMatchObject({
      limit: 3,
      kalan: 2,
      haftaBaslangic: '2026-11-09',
    });
  });

  it('seri duraklatma: olustur, listele, iptal; cakisma 409', async () => {
    const d = {
      id: '0190f3a0-0000-7000-8000-0000000000d1',
      grup_id: GRUP,
      veren_ogretmen_id: UYELIK,
      baslangic_gun: '2026-11-20',
      bitis_gun: '2026-11-30',
      neden: 'Sinav',
      iptal_at: null,
      created_at: '2026-11-12T10:00:00.000Z',
    };
    const { m, cagrilar } = await kur((c) => {
      if (c.yontem === 'POST') return json(d, 201);
      if (c.yontem === 'DELETE') return json({ ...d, iptal_at: '2026-11-12T11:00:00.000Z' });
      return json({ duraklatmalar: [d] });
    });
    const y = await m.duraklatmaOlustur(GRUP, {
      baslangic_gun: '2026-11-20',
      bitis_gun: '2026-11-30',
      neden: 'Sinav',
    });
    expect(y.id).toBe(d.id);
    expect(cagrilar[0]?.govde).toEqual({
      baslangic_gun: '2026-11-20',
      bitis_gun: '2026-11-30',
      neden: 'Sinav',
    });
    expect(await m.duraklatmalar(GRUP)).toHaveLength(1);
    await m.duraklatmaIptal(GRUP, d.id);
    expect(cagrilar[2]?.yol).toContain(`/seri-duraklatmalari/${d.id}`);
    expect(cagrilar[2]?.baslik('content-type')).toBeNull();
  });

  it('grup ogrencileri hesap modulunden okunur (bitmis uyelikler elenir)', async () => {
    const { m, cagrilar } = await kur(() =>
      json({
        uyeler: [
          {
            id: 'a',
            grup_id: GRUP,
            ogrenci_id: OGRENCI,
            gorunen_ad: 'Elif',
            baslangic_tarihi: '2026-09-01',
            bitis_tarihi: null,
            katilim_yolu: 'davet',
          },
          {
            id: 'b',
            grup_id: GRUP,
            ogrenci_id: UYELIK,
            gorunen_ad: 'Eski',
            baslangic_tarihi: '2026-01-01',
            bitis_tarihi: '2026-06-01',
            katilim_yolu: 'davet',
          },
        ],
      }),
    );
    expect(await m.grupOgrencileri(GRUP)).toEqual([{ ogrenciId: OGRENCI, ad: 'Elif' }]);
    expect(cagrilar[0]?.adres).toBe('http://api.test');
  });
});
