import { MODUL_KODLARI } from '@kopru/contracts';

import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { gercekAdaptorler } from './gercek';
import { apiHatasiMi, type ApiHata } from './tipler';

const KURUM = '0190f3a0-0000-7000-8000-000000000001';
const UYELIK = '0190f3a0-0000-7000-8000-000000000002';
const KULLANICI = '0190f3a0-0000-7000-8000-000000000005';
const GOREV = '0190f3a0-0000-7000-8000-000000000040';
const PLAN = '0190f3a0-0000-7000-8000-000000000041';
const ODEV = '0190f3a0-0000-7000-8000-000000000042';
const SATIR = '0190f3a0-0000-7000-8000-000000000043';
const DENEME = '0190f3a0-0000-7000-8000-000000000044';

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), { status, headers: { 'content-type': 'application/json' } });
const hata = (status: number, code: string) => json({ error: { code, message: 'x' } }, status);

interface Cagri {
  yol: string;
  yontem: string;
  govde: unknown;
}
type Yonlendirici = (c: Cagri) => Response | Promise<Response>;

const apiGorev = (ek: Record<string, unknown> = {}) => ({
  id: GOREV,
  plan_id: PLAN,
  ogrenci_id: UYELIK,
  hafta_baslangic: '2026-11-09',
  gun: '2026-11-10',
  brans_kodu: 'matematik',
  konu_id: null,
  baslik: null,
  hedef_turu: 'soru',
  hedef_miktar: 20,
  gerceklesen_miktar: 15,
  durum: 'kismen',
  tamamlandi_at: null,
  devreden_gorev_id: null,
  sira: 0,
  surum: 4,
  ...ek,
});

const apiDeneme = (ek: Record<string, unknown> = {}) => ({
  id: DENEME,
  ogrenci_id: UYELIK,
  gorunen_ad: null,
  kural_id: PLAN,
  kural_kodu: 'tyt',
  yanlis_katsayisi: 0.25,
  ad: 'Deneme 1',
  yayinevi: null,
  sinav_tarihi: '2026-11-01',
  toplam_net: 35,
  giren_id: UYELIK,
  kaynak: 'ogrenci',
  sure_dk: null,
  not: null,
  onay_durumu: 'bekliyor',
  onaylayan_id: null,
  onay_at: null,
  red_nedeni: null,
  surum: 1,
  created_at: '2026-11-01T10:00:00.000Z',
  bolumler: [
    {
      bolum_kodu: 'matematik',
      brans_kodu: 'matematik',
      soru_sayisi: 40,
      dogru: 36,
      yanlis: 4,
      bos: 0,
      net: 35,
    },
  ],
  ...ek,
});

async function kur(yonlendir: Yonlendirici) {
  const cagrilar: Cagri[] = [];
  const f = (async (girdi: Request) => {
    const url = new URL(girdi.url);
    const metin = await girdi.clone().text();
    const c: Cagri = {
      yol: url.pathname + url.search,
      yontem: girdi.method,
      govde: metin ? (JSON.parse(metin) as unknown) : undefined,
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
  const adaptorler = gercekAdaptorler({ apiUrl: 'http://api.test', depo, fetch: f });
  await adaptorler.auth.uyelikSec(UYELIK);
  return { o: adaptorler.ogrenme, cagrilar };
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

const YOL = `/v1/ogrenme/kurumlar/${KURUM}`;

describe('ogrenme adaptoru: uc eslemesi', () => {
  it('konular: tumu=1 ile sayfalanir; kullanimdan kalkan ve arsivlenen rozetlenir', async () => {
    const konu = (ek: Record<string, unknown>) => ({
      id: 'k1',
      kurum_id: null,
      brans_kodu: 'matematik',
      ust_id: null,
      seviye: 'unite',
      ad: 'Sayılar',
      sira: 1,
      sinif_seviyesi: 8,
      kullanimdan_kalkti: false,
      arsivlendi_at: null,
      ...ek,
    });
    const { o, cagrilar } = await kur((c) =>
      c.yol.includes('imlec=s2')
        ? json({ konular: [konu({ id: 'k3', kullanimdan_kalkti: true })], sonraki_imlec: null })
        : json({
            konular: [konu({}), konu({ id: 'k2', arsivlendi_at: '2026-01-01T00:00:00.000Z' })],
            sonraki_imlec: 's2',
          }),
    );
    const k = await o.konular();
    expect(k.map((x) => [x.id, x.kullanimdanKalkti, x.global])).toEqual([
      ['k1', false, true],
      ['k2', true, true],
      ['k3', true, true],
    ]);
    expect(cagrilar[0]?.yol).toContain(`${YOL}/konular`);
    expect(cagrilar[0]?.yol).toContain('tumu=1');
  });

  it('planim: hafta sorgusu ve camelCase esleme; plan yoksa bos iskelet', async () => {
    const { o, cagrilar } = await kur(() =>
      json({
        ogrenci_id: UYELIK,
        hafta_baslangic: '2026-11-09',
        kilitli: false,
        plan: { id: PLAN, durum: 'yayinda', not: 'Bol bol çöz', surum: 2 },
        gorevler: [apiGorev()],
      }),
    );
    const p = await o.planim('2026-11-12');
    expect(cagrilar[0]?.yol).toBe(`${YOL}/planim?hafta=2026-11-12`);
    expect(p.plan).toEqual({ id: PLAN, durum: 'yayinda', not: 'Bol bol çöz', surum: 2 });
    expect(p.gorevler[0]).toMatchObject({
      id: GOREV,
      hedefTuru: 'soru',
      hedefMiktar: 20,
      gerceklesen: 15,
      durum: 'kismen',
    });

    const { o: bos } = await kur(() =>
      json({
        ogrenci_id: UYELIK,
        hafta_baslangic: '2026-11-09',
        kilitli: true,
        plan: null,
        gorevler: [],
      }),
    );
    expect(await bos.planim('2026-11-09')).toMatchObject({
      plan: null,
      kilitli: true,
      gorevler: [],
    });
  });

  it('gorevGerceklesen: PUT, yalniz gerceklesen_miktar (surum YOK)', async () => {
    const { o, cagrilar } = await kur(() => json(apiGorev({ gerceklesen_miktar: 18 })));
    const g = await o.gorevGerceklesen(GOREV, 18);
    expect(cagrilar[0]).toMatchObject({
      yontem: 'PUT',
      yol: `${YOL}/gorevler/${GOREV}/gerceklesen`,
      govde: { gerceklesen_miktar: 18 },
    });
    expect(Object.keys(cagrilar[0]?.govde as object)).toEqual(['gerceklesen_miktar']);
    expect(g.gerceklesen).toBe(18);
  });

  it('gorevlerim: gun sorgusu ve esleme', async () => {
    const { o, cagrilar } = await kur(() => json({ gun: '2026-11-10', gorevler: [apiGorev()] }));
    const r = await o.gorevlerim('2026-11-10');
    expect(cagrilar[0]?.yol).toBe(`${YOL}/gorevlerim?gun=2026-11-10`);
    expect(r.gorevler[0]).toMatchObject({ id: GOREV, hedefMiktar: 20, gerceklesen: 15 });
  });

  it('incelemeBekleyenler: tek uc (/teslimler), sayfalama, N+1 yok', async () => {
    const t = (id: string, ek: Record<string, unknown> = {}) => ({
      ogrenci_odev_id: id,
      odev_id: ODEV,
      odev_baslik: 'Üslü',
      brans_kodu: 'matematik',
      ogrenci_id: UYELIK,
      gorunen_ad: 'Elif',
      durum: 'teslim_edildi',
      teslim_at: '2026-11-10T10:00:00.000Z',
      son_teslim_at: null,
      gec_teslim: true,
      yapilan_soru_sayisi: 20,
      dogru_sayisi: 15,
      yanlis_sayisi: 3,
      bos_sayisi: 2,
      dogru_orani: 0.75,
      ...ek,
    });
    const { o, cagrilar } = await kur((c) =>
      c.yol.includes('imlec=s2')
        ? json({ teslimler: [t('t2')], sonraki_imlec: null })
        : json({ teslimler: [t('t1')], sonraki_imlec: 's2' }),
    );
    const l = await o.incelemeBekleyenler();
    expect(l).toEqual([
      {
        odevId: ODEV,
        odevBaslik: 'Üslü',
        ogrenciOdevId: 't1',
        ad: 'Elif',
        teslimAt: '2026-11-10T10:00:00.000Z',
        gecTeslim: true,
      },
      expect.objectContaining({ ogrenciOdevId: 't2' }),
    ]);
    expect(cagrilar).toHaveLength(2);
    expect(cagrilar[0]?.yol).toContain(`${YOL}/teslimler`);
    expect(cagrilar[0]?.yol).toContain('durum=teslim_edildi');
  });

  it('gorevDevret: hedef gun verilirse govdede, verilmezse bos govde', async () => {
    const { o, cagrilar } = await kur(() =>
      json(
        {
          eski: apiGorev({ durum: 'devredildi' }),
          yeni: apiGorev({ id: 'yeni', gun: '2026-11-11', devreden_gorev_id: GOREV }),
        },
        201,
      ),
    );
    const s = await o.gorevDevret(GOREV);
    expect(cagrilar[0]).toMatchObject({ yontem: 'POST', yol: `${YOL}/gorevler/${GOREV}/devret` });
    expect(cagrilar[0]?.govde).toEqual({});
    expect(s.yeni.devredenGorevId).toBe(GOREV);
    await o.gorevDevret(GOREV, '2026-11-12');
    expect(cagrilar[1]?.govde).toEqual({ hedef_gun: '2026-11-12' });
  });

  it('ogretmen plan uclari: olustur, gorev ekle/guncelle/sil (204), yayinla', async () => {
    const detay = {
      ogrenci_id: UYELIK,
      hafta_baslangic: '2026-11-09',
      kilitli: false,
      plan: { id: PLAN, durum: 'taslak', not: null, surum: 1 },
      gorevler: [],
    };
    const { o, cagrilar } = await kur((c) => {
      if (c.yontem === 'DELETE') return new Response(null, { status: 204 });
      if (c.yol.endsWith('/gorevler') || c.yol.includes('/gorevler/')) return json(apiGorev(), 201);
      return json(detay, 201);
    });
    await o.planOlustur(UYELIK, '2026-11-09');
    expect(cagrilar[0]).toMatchObject({
      yol: `${YOL}/planlar`,
      govde: { ogrenci_id: UYELIK, hafta_baslangic: '2026-11-09' },
    });
    await o.gorevEkle(PLAN, {
      gun: '2026-11-10',
      bransKodu: 'matematik',
      konuId: 'k1',
      hedefTuru: 'dakika',
      hedefMiktar: 30,
    });
    expect(cagrilar[1]).toMatchObject({
      yol: `${YOL}/planlar/${PLAN}/gorevler`,
      govde: {
        gun: '2026-11-10',
        brans_kodu: 'matematik',
        konu_id: 'k1',
        hedef_turu: 'dakika',
        hedef_miktar: 30,
      },
    });
    await o.gorevGuncelle(GOREV, { hedefMiktar: 25, surum: 4 });
    expect(cagrilar[2]).toMatchObject({
      yontem: 'PATCH',
      govde: { hedef_miktar: 25, surum: 4 },
    });
    await expect(o.gorevSil(GOREV)).resolves.toBeUndefined();
    expect(cagrilar[3]?.yontem).toBe('DELETE');
    await o.planYayinla(PLAN);
    expect(cagrilar[4]).toMatchObject({ yontem: 'POST', yol: `${YOL}/planlar/${PLAN}/yayinla` });
  });

  it('odevlerim, teslim ve inceleme govdeleri', async () => {
    const satir = {
      id: SATIR,
      odev_id: ODEV,
      baslik: 'Üslü',
      aciklama: null,
      brans_kodu: 'matematik',
      konu_id: null,
      tur: 'soru',
      kaynak: null,
      hedef_soru_sayisi: 20,
      fotograf_gerekli: false,
      odev_durum: 'yayinda',
      durum: 'teslim_edildi',
      son_teslim_at: '2026-11-12T20:59:00.000Z',
      yapilan_soru_sayisi: 20,
      dogru_sayisi: 15,
      yanlis_sayisi: 3,
      bos_sayisi: 2,
      ogrenci_notu: 'Zordu',
      teslim_at: '2026-11-11T10:00:00.000Z',
      gec_teslim: false,
      inceleme_sonucu: null,
      inceleme_notu: null,
      incelendi_at: null,
    };
    const { o, cagrilar } = await kur((c) =>
      c.yontem === 'GET' ? json({ odevler: [satir], sonraki_imlec: null }) : json(satir),
    );
    const l = await o.odevlerim();
    expect(l[0]).toMatchObject({
      id: SATIR,
      odevId: ODEV,
      yapilanSoru: 20,
      dogru: 15,
      gecTeslim: false,
    });
    await o.odevTeslim(SATIR, { yapilanSoru: 20, dogru: 15, yanlis: 3, bos: 2, not: 'Zordu' });
    expect(cagrilar[1]).toMatchObject({
      yol: `${YOL}/ogrenci-odevleri/${SATIR}/teslim`,
      govde: {
        yapilan_soru_sayisi: 20,
        dogru_sayisi: 15,
        yanlis_sayisi: 3,
        bos_sayisi: 2,
        ogrenci_notu: 'Zordu',
      },
    });
    await o.odevIncele(SATIR, 'eksik', 'Yanlışlara bak');
    expect(cagrilar[2]).toMatchObject({
      yol: `${YOL}/ogrenci-odevleri/${SATIR}/inceleme`,
      govde: { sonuc: 'eksik', not: 'Yanlışlara bak' },
    });
  });

  it('deneme: kurallar, ayar, olustur (ogrenci_id yok), gelisim ve onay/red', async () => {
    const { o, cagrilar } = await kur((c) => {
      if (c.yol.includes('/deneme-kurallari')) {
        return json({
          kurallar: [
            {
              id: PLAN,
              kurum_id: null,
              global: true,
              kod: 'tyt',
              ad: 'TYT',
              yanlis_katsayisi: 0.25,
              bolumler: [
                {
                  bolum_kodu: 'matematik',
                  brans_kodu: 'matematik',
                  ad: 'Matematik',
                  soru_sayisi: 40,
                },
              ],
              toplam_soru_sayisi: 40,
              toplam_sure_dk: null,
              gecerli_yil: null,
              aktif: true,
              surum: 1,
            },
          ],
        });
      }
      if (c.yol.includes('/deneme-ayarlari')) return json({ ogrenci_deneme_girisi: false });
      if (c.yol.includes('deneme-gelisim')) {
        return json({
          ogrenci_id: UYELIK,
          kural_kodu: 'tyt',
          deneme_sayisi: 2,
          noktalar: [
            {
              deneme_id: DENEME,
              ad: 'D1',
              sinav_tarihi: '2026-11-01',
              toplam_net: 30,
              bolumler: [{ bolum_kodu: 'matematik', brans_kodu: 'matematik', net: 30 }],
            },
          ],
          son5_sayisi: 2,
          son5_ortalama: 31,
          onceki5_sayisi: 0,
          onceki5_ortalama: null,
          degisim: null,
          bolum_gelisimi: [],
        });
      }
      if (c.yol.includes('/onay') || c.yol.includes('/red')) return json({ ok: true });
      if (c.yontem === 'POST') return json(apiDeneme(), 201);
      return json({ denemeler: [apiDeneme()], sonraki_imlec: null });
    });
    const k = await o.denemeKurallari();
    expect(k[0]).toMatchObject({ kod: 'tyt', yanlisKatsayisi: 0.25, toplamSoruSayisi: 40 });
    expect(cagrilar[0]?.yol).toContain('aktif=true');
    expect(await o.ogrenciDenemeGirisi()).toBe(false);
    const d = await o.denemeOlustur({
      kuralKodu: 'tyt',
      ad: 'Deneme 1',
      sinavTarihi: '2026-11-01',
      bolumler: [{ bolumKodu: 'matematik', dogru: 36, yanlis: 4 }],
    });
    expect(d).toMatchObject({ onayDurumu: 'bekliyor', toplamNet: 35, kaynak: 'ogrenci' });
    const olusturma = cagrilar.find((c) => c.yontem === 'POST');
    expect(olusturma?.govde).toEqual({
      kural_kodu: 'tyt',
      ad: 'Deneme 1',
      sinav_tarihi: '2026-11-01',
      bolumler: [{ bolum_kodu: 'matematik', dogru: 36, yanlis: 4 }],
    });
    const g = await o.denemeGelisim(UYELIK, 'tyt');
    expect(g).toMatchObject({ son5Ortalama: 31, denemeSayisi: 2 });
    expect(cagrilar.at(-1)?.yol).toContain(`/ogrenciler/${UYELIK}/deneme-gelisim?kural=tyt`);
    await o.denemeler({ onay: 'bekliyor' });
    expect(cagrilar.at(-1)?.yol).toContain('onay=bekliyor');
    await o.denemeOnayla(DENEME);
    expect(cagrilar.at(-1)?.yol).toBe(`${YOL}/denemeler/${DENEME}/onay`);
    await o.denemeReddet(DENEME, 'Hatalı');
    expect(cagrilar.at(-1)).toMatchObject({
      yol: `${YOL}/denemeler/${DENEME}/red`,
      govde: { red_nedeni: 'Hatalı' },
    });
  });
});

describe('ogrenme adaptoru: hata kodlari', () => {
  const durumlar: [string, number, string, string][] = [
    ['plan_kilitli', 409, 'cakisma', 'gorevGerceklesen'],
    ['gorev_zaten_devredildi', 409, 'cakisma', 'gorevDevret'],
    ['hedef_gun_gecersiz', 422, 'dogrulama', 'gorevDevret'],
    ['teslim_durumu_gecersiz', 409, 'cakisma', 'odevTeslim'],
    ['ogrenci_deneme_girisi_kapali', 403, 'izin_yok', 'denemeOlustur'],
    ['deneme_zaten_var', 409, 'cakisma', 'denemeOlustur'],
  ];

  it.each(durumlar)('%s (%i) -> %s ve ayrinti korunur', async (kod, durum, beklenenKod, islem) => {
    const { o } = await kur(() => hata(durum, kod));
    const cagri = {
      gorevGerceklesen: () => o.gorevGerceklesen(GOREV, 5),
      gorevDevret: () => o.gorevDevret(GOREV),
      odevTeslim: () => o.odevTeslim(SATIR, { yapilanSoru: 1 }),
      denemeOlustur: () =>
        o.denemeOlustur({ kuralKodu: 'tyt', ad: 'a', sinavTarihi: '2026-11-01', bolumler: [] }),
    }[islem as 'gorevGerceklesen'];
    const e = await hatayiYakala(cagri());
    expect(e.kod).toBe(beklenenKod);
    expect(e.ayrinti).toBe(kod);
    expect(e.durum).toBe(durum);
  });

  it('204 olmayan silme hatasi (gorev_silinemez) firlatilir', async () => {
    const { o } = await kur(() => hata(409, 'gorev_silinemez'));
    const e = await hatayiYakala(o.gorevSil(GOREV));
    expect(e.ayrinti).toBe('gorev_silinemez');
  });
});
