import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { gercekAdaptorler } from './gercek';
import { apiHatasiMi, type ApiHata } from './tipler';

const KURUM = '0190f3a0-0000-7000-8000-000000000001';
const KULLANICI = '0190f3a0-0000-7000-8000-000000000005';

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

async function kur(yanit: () => Response) {
  const cagrilar: Cagri[] = [];
  const f = (async (girdi: Request) => {
    const url = new URL(girdi.url);
    const metin = await girdi.clone().text();
    cagrilar.push({
      yol: url.pathname,
      yontem: girdi.method,
      govde: metin ? (JSON.parse(metin) as unknown) : undefined,
      govdeMetni: metin,
      icerikTuru: girdi.headers.get('content-type'),
    });
    return yanit();
  }) as unknown as typeof globalThis.fetch;
  const depo = bellekBelirtecDeposu();
  await depo.yaz({ erisim: 'e', yenileme: 'oturum-1', erisimBitis: Date.now() + 600_000 });
  const adaptorler = gercekAdaptorler({ apiUrl: 'http://api.test', depo, fetch: f });
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

const talep = {
  id: '0190f3a0-0000-7000-8000-000000000030',
  durum: 'beklemede',
  talep_at: '2026-11-08T10:00:00.000Z',
  planlanan_at: '2026-12-08T10:00:00.000Z',
  geri_alindi_at: null,
  tamamlandi_at: null,
};

describe('hesap silme ve verilerim (KVKK)', () => {
  it('durum: talep, engeller ve dogrulama yontemlerini cevirir', async () => {
    const { adaptorler } = await kur(() =>
      json({
        talep,
        soguma_gun: 30,
        engeller: [{ kurum_id: KURUM, kurum_ad: 'Deneme Kurumu', diger_uye_sayisi: 4 }],
        dogrulama_yontemleri: ['otp', 'parola'],
      }),
    );
    const d = await adaptorler.hesap.silmeDurumu();
    expect(d.sogumaGun).toBe(30);
    expect(d.talep).toEqual({
      id: talep.id,
      durum: 'beklemede',
      talep: talep.talep_at,
      planlanan: talep.planlanan_at,
    });
    expect(d.engeller).toEqual([{ kurumId: KURUM, kurumAd: 'Deneme Kurumu', digerUyeSayisi: 4 }]);
    expect(d.dogrulamaYontemleri).toEqual(['otp', 'parola']);
  });

  it('talep acar: dogrulama ve kaynak gider', async () => {
    const { adaptorler, cagrilar } = await kur(() => json({ talep }, 201));
    const r = await adaptorler.hesap.silmeTalebiAc({ yontem: 'otp', kod: '123456' });
    expect(r.durum).toBe('beklemede');
    expect(cagrilar[0]).toMatchObject({
      yontem: 'POST',
      yol: '/v1/hesap/ben/silme-talebi',
      govde: { dogrulama: { yontem: 'otp', kod: '123456' }, kaynak: 'ios' },
    });
  });

  it('yanlis kod 401 kod_gecersiz: `otp_gecersiz` (oturum dusmez), istek tekrarlanmaz', async () => {
    const { adaptorler, depo, cagrilar } = await kur(() => hata(401, 'kod_gecersiz'));
    const e = await hatayiYakala(adaptorler.hesap.silmeTalebiAc({ yontem: 'otp', kod: '000000' }));
    expect(e.kod).toBe('otp_gecersiz');
    expect(cagrilar.filter((c) => c.yol === '/v1/hesap/ben/silme-talebi')).toHaveLength(1);
    expect(cagrilar.some((c) => c.yol === '/auth/token')).toBe(false);
    expect(await depo.oku()).not.toBeNull();
  });

  it('kurum sahibi engeli 409: `cakisma` ve ayrinti', async () => {
    const { adaptorler } = await kur(() => hata(409, 'kurum_sahibi_engeli'));
    const e = await hatayiYakala(adaptorler.hesap.silmeTalebiAc({ yontem: 'parola', parola: 'x' }));
    expect(e.kod).toBe('cakisma');
    expect(e.ayrinti).toBe('kurum_sahibi_engeli');
  });

  it('geri alma: govdesiz DELETE, content-type gonderilmez', async () => {
    const { adaptorler, cagrilar } = await kur(() =>
      json({ talep: { ...talep, durum: 'geri_alindi' } }),
    );
    const r = await adaptorler.hesap.silmeTalebiGeriAl();
    expect(r.durum).toBe('geri_alindi');
    expect(cagrilar[0]).toMatchObject({
      yontem: 'DELETE',
      yol: '/v1/hesap/ben/silme-talebi',
      govdeMetni: '',
      icerikTuru: null,
    });
  });

  it('kod gonder: govdesiz POST', async () => {
    const { adaptorler, cagrilar } = await kur(() =>
      json({ gonderildi: true, gecerlilik_sn: 300 }),
    );
    expect(await adaptorler.hesap.silmeKoduGonder()).toEqual({ gecerlilikSn: 300 });
    expect(cagrilar[0]?.yol).toBe('/v1/hesap/ben/silme-talebi/kod-gonder');
    expect(cagrilar[0]?.govdeMetni).toBe('');
  });

  it('verilerimi indir: JSON metni ve tarihli dosya adi', async () => {
    const { adaptorler } = await kur(() =>
      json({
        kullanici_id: KULLANICI,
        hesap: {},
        bolumler: {},
        servisler: {},
        eksik_servisler: [],
      }),
    );
    const d = await adaptorler.hesap.verilerimiIndir();
    expect(d.dosyaAdi).toMatch(/^kopru-verilerim-\d{4}-\d{2}-\d{2}\.json$/);
    expect((JSON.parse(d.icerik) as { kullanici_id: string }).kullanici_id).toBe(KULLANICI);
  });
});
