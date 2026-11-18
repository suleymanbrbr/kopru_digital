import { MODUL_KODLARI } from '@kopru/contracts';

import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { cevrimiciKorumaliBildirim } from './cevrimiciBildirim';
import { gercekAdaptorler } from './gercek';
import { apiHatasiMi } from './tipler';

const KURUM = '0190f3a0-0000-7000-8000-000000000001';
const UYELIK = '0190f3a0-0000-7000-8000-000000000002';
const KULLANICI = '0190f3a0-0000-7000-8000-000000000005';
const BILDIRIM = '0190f3a0-0000-7000-8000-0000000000b1';

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), { status, headers: { 'content-type': 'application/json' } });

interface Cagri {
  adres: string;
  yol: string;
  yontem: string;
  govde: unknown;
  govdeMetni: string;
  yetki: string | null;
}

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
      govdeMetni: metin,
      yetki: girdi.headers.get('authorization'),
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
    bildirimUrl: 'http://bil.test',
    depo,
    fetch: f,
  });
  await adaptorler.auth.uyelikSec(UYELIK);
  return { b: adaptorler.bildirim, cagrilar };
}

const oge = (ek: Record<string, unknown> = {}) => ({
  id: BILDIRIM,
  kategori: 'soru',
  sablon_kodu: 'soru_cevaplandi',
  baslik: 'Sorun cevaplandı',
  govde: 'Sorduğun soruya cevap geldi.',
  derin_baglanti: 'kopru://soru/x',
  veri: {},
  okundu_at: null,
  gecerlilik_bitis_at: null,
  created_at: '2026-11-18T10:00:00.000Z',
  ...ek,
});

describe('gercek bildirim adaptoru', () => {
  it('cihaz kaydi: kullanici duzeyi PUT, bildirim taban adresine, govde sozlesmeye uygun', async () => {
    const { b, cagrilar } = await kur(() => json({ cihaz_kimligi: 'c1', aktif: true }));
    await b.cihazKaydet({
      platform: 'ios',
      push_belirteci: 'ExponentPushToken[abc]',
      cihaz_kimligi: 'c1',
      uygulama_surumu: '0.1.0',
      dil: 'tr',
    });
    expect(cagrilar[0]).toMatchObject({
      adres: 'http://bil.test',
      yontem: 'PUT',
      yol: '/v1/bildirim/cihazlar',
      govde: {
        platform: 'ios',
        push_belirteci: 'ExponentPushToken[abc]',
        cihaz_kimligi: 'c1',
        uygulama_surumu: '0.1.0',
        dil: 'tr',
      },
      yetki: 'Bearer kurum-erisim',
    });
  });

  it('cihaz silme: govdesiz DELETE, kimlik yola kodlanir', async () => {
    const { b, cagrilar } = await kur(() => json({ cihaz_kimligi: 'a b', aktif: false }));
    await b.cihazSil('a b');
    expect(cagrilar[0]).toMatchObject({
      yontem: 'DELETE',
      yol: '/v1/bildirim/cihazlar/a%20b',
      govdeMetni: '',
    });
  });

  it('kutu: kurum yolu, imlec ve limit sorgusu; sonraki imlec adaptor modeline cevrilir', async () => {
    const { b, cagrilar } = await kur(() => json({ ogeler: [oge()], sonraki_imlec: 'abc' }));
    const s = await b.kutu({ limit: 20, imlec: 'xyz' });
    expect(cagrilar[0]).toMatchObject({
      yontem: 'GET',
      yol: `/v1/bildirim/kurumlar/${KURUM}/kutu?imlec=xyz&limit=20`,
    });
    expect(s.sonrakiImlec).toBe('abc');
    expect(s.ogeler[0]?.baslik).toBe('Sorun cevaplandı');
  });

  it('okunmamis sayisi, okundu, tumunu oku ve arsivle', async () => {
    const { b, cagrilar } = await kur((c) => {
      if (c.yol.endsWith('/okunmamis-sayisi')) return json({ okunmamis: 3 });
      if (c.yol.endsWith('/tumunu-oku')) return json({ guncellenen: 3 });
      return json({ id: BILDIRIM, okundu_at: '2026-11-18T10:01:00.000Z', arsivlendi_at: null });
    });
    await expect(b.okunmamisSayisi()).resolves.toBe(3);
    await b.okundu(BILDIRIM);
    await expect(b.tumunuOku()).resolves.toBe(3);
    await b.arsivle(BILDIRIM);
    expect(
      cagrilar.map((c) => `${c.yontem} ${c.yol.replace(KURUM, 'K').replace(BILDIRIM, 'B')}`),
    ).toEqual([
      'GET /v1/bildirim/kurumlar/K/kutu/okunmamis-sayisi',
      'POST /v1/bildirim/kurumlar/K/kutu/B/okundu',
      'POST /v1/bildirim/kurumlar/K/kutu/tumunu-oku',
      'POST /v1/bildirim/kurumlar/K/kutu/B/arsivle',
    ]);
    // Govdesiz POST'lar bos JSON govdesiyle gider (service-kit bos govdeyi reddeder).
    expect(cagrilar[1]?.govdeMetni).toBe('{}');
  });

  it('tercihler ve ayarlar: okuma ve kismi guncelleme', async () => {
    const ayarlar = {
      sessiz_baslangic: '23:00',
      sessiz_bitis: '07:00',
      sessiz_gunler: [1, 2],
      saat_dilimi: 'Europe/Istanbul',
      ders_hatirlatma_dk: 30,
    };
    const { b, cagrilar } = await kur((c) =>
      c.yol.endsWith('/ayarlar')
        ? json(ayarlar)
        : json({ tercihler: [{ kategori: 'soru', kanal: 'push', acik: false, kilitli: false }] }),
    );
    const t1 = await b.tercihGuncelle([{ kategori: 'soru', kanal: 'push', acik: false }]);
    expect(t1[0]?.acik).toBe(false);
    expect(cagrilar[0]).toMatchObject({
      yontem: 'PUT',
      yol: `/v1/bildirim/kurumlar/${KURUM}/tercihler`,
      govde: { tercihler: [{ kategori: 'soru', kanal: 'push', acik: false }] },
    });
    await expect(b.ayarGuncelle({ ders_hatirlatma_dk: 30 })).resolves.toEqual(ayarlar);
    expect(cagrilar[1]?.govde).toEqual({ ders_hatirlatma_dk: 30 });
    await b.ayarlar();
    expect(cagrilar[2]).toMatchObject({
      yontem: 'GET',
      yol: `/v1/bildirim/kurumlar/${KURUM}/ayarlar`,
    });
  });

  it('hata: 400 -> dogrulama, 404 -> bulunamadi', async () => {
    const { b } = await kur((c) =>
      json(
        { error: { code: c.yontem === 'PUT' ? 'tercih_kilitli' : 'bulunamadi', message: 'x' } },
        c.yontem === 'PUT' ? 400 : 404,
      ),
    );
    const e1 = await b
      .tercihGuncelle([{ kategori: 'sistem', kanal: 'push', acik: false }])
      .catch((e: unknown) => e);
    expect(apiHatasiMi(e1) && e1.kod).toBe('dogrulama');
    expect(apiHatasiMi(e1) && e1.ayrinti).toBe('tercih_kilitli');
    const e2 = await b.okundu(BILDIRIM).catch((e: unknown) => e);
    expect(apiHatasiMi(e2) && e2.kod).toBe('bulunamadi');
  });
});

describe('cevrimiciKorumaliBildirim', () => {
  it('cevrimdisiyken istek atmaz ve cevrimdisi hatasi verir', async () => {
    const { b, cagrilar } = await kur(() => json({ okunmamis: 1 }));
    let cevrimici = false;
    const k = cevrimiciKorumaliBildirim(b, () => cevrimici);
    const e = await k.okunmamisSayisi().catch((x: unknown) => x);
    expect(apiHatasiMi(e) && e.kod).toBe('cevrimdisi');
    expect(cagrilar).toHaveLength(0);
    cevrimici = true;
    await expect(k.okunmamisSayisi()).resolves.toBe(1);
  });
});
