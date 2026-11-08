import { bellekBelirtecDeposu, type BelirtecDeposu } from '../depo/belirtecDeposu';
import { bellekKv } from '../depo/kv';
import { OfflineKuyruk } from '../offline/kuyruk';
import { apiUrlCoz } from '../ortam';
import { apiHatasiOlustur, gercekAdaptorler } from './gercek';
import { apiHatasiMi, type ApiHata } from './tipler';

const KURUM = '0190f3a0-0000-7000-8000-000000000001';
const UYELIK = '0190f3a0-0000-7000-8000-000000000002';
const UYELIK_2 = '0190f3a0-0000-7000-8000-000000000003';
const METIN = '0190f3a0-0000-7000-8000-000000000004';
const KULLANICI = '0190f3a0-0000-7000-8000-000000000005';

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), { status, headers: { 'content-type': 'application/json' } });
const hata = (status: number, code: string, message = 'hata') =>
  json({ error: { code, message } }, status);

const uyelik = (id: string, rol: string) => ({
  uyelik_id: id,
  kurum_id: KURUM,
  kurum_ad: 'Deneme Kurumu',
  kurum_tur: 'kurum',
  rol,
  durum: 'aktif',
  sube_id: null,
});

const benYaniti = {
  kullanici: {
    id: KULLANICI,
    gorunen_ad: 'Deniz Yılmaz',
    telefon_e164: '+905321112233',
    eposta: null,
    dil: 'tr',
  },
  uyelikler: [uyelik(UYELIK, 'sahip'), uyelik(UYELIK_2, 'ogretmen')],
  onay_gerekli: true,
};

const rizaYaniti = (kabul: boolean) => ({
  onay_gerekli: !kabul,
  metinler: [
    {
      id: METIN,
      tur: 'kvkk_aydinlatma',
      surum: '2026-02',
      dil: 'tr',
      baslik: 'Aydınlatma',
      govde_markdown: '...',
      govde_sha256: 'abc',
      kabul_edildi: kabul,
    },
  ],
});

interface Cagri {
  yol: string;
  yontem: string;
  yetki: string | null;
  govde: unknown;
  istekId: string | null;
}
type Yonlendirici = (c: Cagri, sira: number) => Response | Promise<Response>;

/** Istekleri kaydeden sahte fetch. openapi-fetch `fetch(Request)` cagirir. */
function sahteFetch(yonlendir: Yonlendirici) {
  const cagrilar: Cagri[] = [];
  const f = (async (girdi: Request) => {
    const url = new URL(girdi.url);
    const metin = await girdi.clone().text();
    const c: Cagri = {
      yol: url.pathname + url.search,
      yontem: girdi.method,
      yetki: girdi.headers.get('authorization'),
      govde: metin ? (JSON.parse(metin) as unknown) : undefined,
      istekId: girdi.headers.get('idempotency-key'),
    };
    cagrilar.push(c);
    return yonlendir(c, cagrilar.length);
  }) as unknown as typeof globalThis.fetch;
  return { f, cagrilar };
}

const tokenYaniti = (access: string, ek: Record<string, unknown> = {}) =>
  json({
    access_token: access,
    token_type: 'Bearer',
    expires_in: 900,
    kurum_id: null,
    uyelik_id: null,
    rol: null,
    roller: [],
    uyelikler: [],
    ...ek,
  });

function kur(yonlendir: Yonlendirici, depo: BelirtecDeposu = bellekBelirtecDeposu()) {
  const { f, cagrilar } = sahteFetch(yonlendir);
  const zaman = { t: 1_000_000 };
  const adaptorler = gercekAdaptorler({
    apiUrl: 'http://api.test',
    depo,
    fetch: f,
    simdi: () => zaman.t,
    kaynak: 'ios',
  });
  return { adaptorler, depo, cagrilar, zaman };
}

const tokenCagrilari = (c: Cagri[]) => c.filter((x) => x.yol === '/auth/token');

async function hatayiYakala(p: Promise<unknown>): Promise<ApiHata> {
  try {
    await p;
  } catch (e) {
    if (apiHatasiMi(e)) return e;
    throw e;
  }
  throw new Error('hata bekleniyordu');
}

describe('gercek adaptor: giris ve belirtec yonetimi', () => {
  it('otpDogrula oturum belirtecini saklar; ilk istekte /auth/token ile erisim alir', async () => {
    const { adaptorler, depo, cagrilar } = kur((c) => {
      if (c.yol === '/auth/otp/dogrula') {
        return json({
          oturum_belirteci: 'oturum-1',
          kullanici: benYaniti.kullanici,
          yeni_kullanici: true,
        });
      }
      if (c.yol === '/auth/token') return tokenYaniti('erisim-1');
      if (c.yol === '/v1/hesap/ben') return json(benYaniti);
      if (c.yol === '/v1/hesap/rizalar/guncel') return json(rizaYaniti(false));
      return hata(404, 'bulunamadi');
    });

    await adaptorler.auth.otpDogrula('05321112233', '123456');
    expect((await depo.oku())?.yenileme).toBe('oturum-1');
    expect(cagrilar.at(0)?.govde).toEqual({ telefon: '05321112233', kod: '123456' });

    const bilgi = await adaptorler.auth.oturumBilgisi();
    const token = tokenCagrilari(cagrilar);
    expect(token).toHaveLength(1);
    expect(token[0]?.yetki).toBe('Bearer oturum-1');
    expect(token[0]?.govde).toEqual({});
    const ben = cagrilar.find((c) => c.yol === '/v1/hesap/ben');
    expect(ben?.yetki).toBe('Bearer erisim-1');
    expect(bilgi.kullanici).toEqual({
      id: KULLANICI,
      adSoyad: 'Deniz Yılmaz',
      telefon: '+905321112233',
    });
    expect(bilgi.uyelikler.map((u) => u.rol)).toEqual(['sahip', 'ogretmen']);
    expect(bilgi.kvkk).toEqual({ guncelSurum: '2026-02', kabulEdilenSurum: null });
  });

  it('esZamanli istekler tek /auth/token ucusu paylasir', async () => {
    const depo = bellekBelirtecDeposu();
    await depo.yaz({ erisim: '', yenileme: 'oturum-1', erisimBitis: 0 });
    let serbest!: () => void;
    const kapi = new Promise<void>((r) => (serbest = r));
    const { adaptorler, cagrilar } = kur(async (c) => {
      if (c.yol === '/auth/token') {
        await kapi;
        return tokenYaniti('erisim-1');
      }
      if (c.yol === '/v1/hesap/ben') return json(benYaniti);
      return json(rizaYaniti(true));
    }, depo);

    const hepsi = Promise.all([
      adaptorler.auth.oturumBilgisi(),
      adaptorler.auth.oturumBilgisi(),
      adaptorler.auth.oturumBilgisi(),
    ]);
    await new Promise((r) => setTimeout(r, 20));
    serbest();
    const sonuclar = await hepsi;
    expect(sonuclar).toHaveLength(3);
    expect(tokenCagrilari(cagrilar)).toHaveLength(1);
    expect(sonuclar[0].kvkk.kabulEdilenSurum).toBe('2026-02');
  });

  it('suresi dolmak uzere olan erisim belirteci istekten once yenilenir', async () => {
    const depo = bellekBelirtecDeposu();
    const { adaptorler, cagrilar, zaman } = kur((c) => {
      if (c.yol === '/auth/token') return tokenYaniti('yeni-erisim');
      if (c.yol === '/v1/hesap/ben') return json(benYaniti);
      return json(rizaYaniti(true));
    }, depo);
    await depo.yaz({ erisim: 'eski-erisim', yenileme: 'oturum-1', erisimBitis: zaman.t + 10_000 });

    await adaptorler.auth.oturumBilgisi();
    expect(tokenCagrilari(cagrilar)).toHaveLength(1);
    expect(cagrilar.find((c) => c.yol === '/v1/hesap/ben')?.yetki).toBe('Bearer yeni-erisim');
    expect((await depo.oku())?.erisimBitis).toBe(zaman.t + 900_000);
  });

  it('401 alinca oturum belirteciyle yeniler ve istegi bir kez tekrarlar', async () => {
    const depo = bellekBelirtecDeposu();
    const { adaptorler, cagrilar, zaman } = kur((c) => {
      if (c.yol === '/auth/token') return tokenYaniti('yeni-erisim');
      if (c.yetki !== 'Bearer yeni-erisim') return hata(401, 'yetkisiz');
      if (c.yol === '/v1/hesap/ben') return json(benYaniti);
      return json(rizaYaniti(true));
    }, depo);
    await depo.yaz({ erisim: 'eski-erisim', yenileme: 'oturum-1', erisimBitis: zaman.t + 600_000 });

    const bilgi = await adaptorler.auth.oturumBilgisi();
    expect(bilgi.kullanici.id).toBe(KULLANICI);
    // Iki istek (ben + rizalar) eski belirtecle 401 yedi, ama yenileme tek.
    expect(tokenCagrilari(cagrilar)).toHaveLength(1);
    const benler = cagrilar.filter((c) => c.yol === '/v1/hesap/ben');
    expect(benler.map((b) => b.yetki)).toEqual(['Bearer eski-erisim', 'Bearer yeni-erisim']);
  });

  it('yenileme 401 verirse belirtecler silinir ve yetkisiz firlatilir', async () => {
    const depo = bellekBelirtecDeposu();
    const { adaptorler } = kur((c) => {
      if (c.yol === '/auth/token') return hata(401, 'yetkisiz');
      return hata(401, 'yetkisiz');
    }, depo);
    await depo.yaz({ erisim: 'eski', yenileme: 'oturum-iptal', erisimBitis: Date.now() + 1e9 });

    const e = await hatayiYakala(adaptorler.auth.oturumBilgisi());
    expect(e.kod).toBe('yetkisiz');
    expect(e.durum).toBe(401);
    expect(await depo.oku()).toBeNull();
  });

  it('yenileme sirasinda ag hatasi belirtecleri korur (oturum kapanmaz)', async () => {
    const depo = bellekBelirtecDeposu();
    const { adaptorler } = kur(() => {
      throw new TypeError('Network request failed');
    }, depo);
    await depo.yaz({ erisim: '', yenileme: 'oturum-1', erisimBitis: 0 });

    const e = await hatayiYakala(adaptorler.auth.oturumBilgisi());
    expect(e.kod).toBe('ag');
    expect(e.yenidenDenenebilir).toBe(true);
    expect((await depo.oku())?.yenileme).toBe('oturum-1');
  });

  it('oturum yokken oturumBilgisi yetkisiz firlatir', async () => {
    const { adaptorler, cagrilar } = kur(() => hata(500, 'x'));
    expect((await hatayiYakala(adaptorler.auth.oturumBilgisi())).kod).toBe('yetkisiz');
    expect(cagrilar).toHaveLength(0);
  });

  it('cikis sunucuya oturum belirteciyle bildirir ve yerel belirtecleri siler', async () => {
    const depo = bellekBelirtecDeposu();
    const { adaptorler, cagrilar } = kur(() => json({ cikis: true }), depo);
    await depo.yaz({ erisim: 'e', yenileme: 'oturum-1', erisimBitis: Date.now() + 1e9 });
    await adaptorler.auth.cikis();
    expect(cagrilar[0]?.yol).toBe('/auth/cikis');
    expect(cagrilar[0]?.yetki).toBe('Bearer oturum-1');
    expect(await depo.oku()).toBeNull();
  });

  it('sunucu cikis cagrisi basarisiz olsa da yerel oturum kapanir', async () => {
    const depo = bellekBelirtecDeposu();
    const { adaptorler } = kur(() => {
      throw new TypeError('offline');
    }, depo);
    await depo.yaz({ erisim: 'e', yenileme: 'oturum-1', erisimBitis: 0 });
    await adaptorler.auth.cikis();
    expect(await depo.oku()).toBeNull();
  });
});

describe('gercek adaptor: KVKK ve uyelik secimi', () => {
  async function girisli(yonlendir: Yonlendirici) {
    const depo = bellekBelirtecDeposu();
    const k = kur(yonlendir, depo);
    await depo.yaz({ erisim: 'erisim-1', yenileme: 'oturum-1', erisimBitis: k.zaman.t + 600_000 });
    return k;
  }

  it('kvkkKabulEt yalniz kabul edilmemis metinleri kaynakla birlikte gonderir', async () => {
    const { adaptorler, cagrilar } = await girisli((c) => {
      if (c.yol === '/v1/hesap/rizalar/guncel') return json(rizaYaniti(false));
      return json({ riza_id: METIN, karar: 'kabul', onay_gerekli: false });
    });
    await adaptorler.auth.kvkkKabulEt('2026-02');
    const post = cagrilar.filter((c) => c.yontem === 'POST');
    expect(post).toHaveLength(1);
    expect(post[0]?.govde).toEqual({ riza_metni_id: METIN, karar: 'kabul', kaynak: 'ios' });
  });

  it('uyelikSec kurum+uyelik ile token alir, modulleri okur; sonraki yenileme ayni kapsamda', async () => {
    const { adaptorler, cagrilar, zaman, depo } = await girisli((c) => {
      if (c.yol === '/v1/hesap/ben') return json(benYaniti);
      if (c.yol === '/auth/token') {
        return tokenYaniti('kurum-erisim', {
          kurum_id: KURUM,
          uyelik_id: UYELIK,
          rol: 'sahip',
          roller: ['sahip'],
        });
      }
      if (c.yol.startsWith('/v1/hesap/modul-ayarlari/etkin')) {
        const kod = new URL(`http://x${c.yol}`).searchParams.get('modul_kodu');
        return json({ modul_kodu: kod, acik: kod !== 'finans' });
      }
      return hata(404, 'bulunamadi');
    });

    const b = await adaptorler.auth.uyelikSec(UYELIK);
    expect(b.uyelik).toEqual({
      uyelikId: UYELIK,
      kurumId: KURUM,
      kurumAd: 'Deneme Kurumu',
      rol: 'sahip',
    });
    const tok = tokenCagrilari(cagrilar);
    expect(tok[0]?.govde).toEqual({ kurum_id: KURUM, uyelik_id: UYELIK });
    expect(tok[0]?.yetki).toBe('Bearer oturum-1');
    expect(b.moduller.takvim).toBe(true);
    expect(b.moduller.finans).toBe(false);
    expect(Object.keys(b.moduller)).toHaveLength(11);
    const modulIstekleri = cagrilar.filter((c) => c.yol.includes('modul-ayarlari'));
    expect(modulIstekleri.every((c) => c.yetki === 'Bearer kurum-erisim')).toBe(true);

    // Erisim bitince yenileme ayni kurum/uyelik ile yapilir.
    zaman.t += 20 * 60_000;
    await adaptorler.veri.ogretmenBugun();
    await adaptorler.auth.uyelikSec(UYELIK);
    expect(tokenCagrilari(cagrilar).at(-1)?.govde).toEqual({ kurum_id: KURUM, uyelik_id: UYELIK });
    expect(await depo.oku()).not.toBeNull();
  });

  it('modul sorgusunda 403 riza_gerekli adaptor hatasi olarak yansir', async () => {
    const { adaptorler } = await girisli((c) => {
      if (c.yol === '/v1/hesap/ben') return json(benYaniti);
      if (c.yol === '/auth/token') return tokenYaniti('k', { rol: 'sahip' });
      return hata(403, 'riza_gerekli', 'Onay gerekli');
    });
    const e = await hatayiYakala(adaptorler.auth.uyelikSec(UYELIK));
    expect(e.kod).toBe('riza_gerekli');
    expect(e.durum).toBe(403);
  });

  it('bilinmeyen uyelik bulunamadi doner', async () => {
    const { adaptorler } = await girisli(() => json(benYaniti));
    expect((await hatayiYakala(adaptorler.auth.uyelikSec('yok'))).kod).toBe('bulunamadi');
  });
});

describe('hata esleme (ADR 0004)', () => {
  const kodlar = (durum: number, kod?: string) =>
    apiHatasiOlustur(durum, kod ? { error: { code: kod, message: 'm' } } : undefined);

  it.each([
    [401, 'yetkisiz', 'yetkisiz'],
    [402, 'abonelik_gerekli', 'abonelik_gerekli'],
    [403, 'riza_gerekli', 'riza_gerekli'],
    [403, 'modul_kapali', 'modul_kapali'],
    [403, 'izin_yok', 'izin_yok'],
    [403, 'taklit_salt_okunur', 'izin_yok'],
    [400, 'kod_gecersiz', 'otp_gecersiz'],
    [429, 'cok_fazla_istek', 'otp_cok_deneme'],
    [404, 'bulunamadi', 'bulunamadi'],
    [422, 'dogrulama_hatasi', 'dogrulama'],
    [503, 'hizmet_kullanilamiyor', 'sunucu'],
  ])('%i %s -> %s', (durum, kod, beklenen) => {
    const e = kodlar(durum, kod);
    expect(e.kod).toBe(beklenen);
    expect(e.durum).toBe(durum);
  });

  it('gövdesiz 401/502 de eslenir; yalniz ag/zaman asimi/5xx yeniden denenebilir', () => {
    expect(kodlar(401).kod).toBe('yetkisiz');
    expect(kodlar(502).yenidenDenenebilir).toBe(true);
    expect(kodlar(422, 'dogrulama_hatasi').yenidenDenenebilir).toBe(false);
    expect(kodlar(403, 'izin_yok').yenidenDenenebilir).toBe(false);
  });

  it('402 abonelik_gerekli adaptor uzerinden kullaniciya ulasir', async () => {
    const depo = bellekBelirtecDeposu();
    const { adaptorler, zaman } = kur(() => hata(402, 'abonelik_gerekli'), depo);
    await depo.yaz({ erisim: 'e', yenileme: 'o', erisimBitis: zaman.t + 600_000 });
    expect((await hatayiYakala(adaptorler.auth.oturumBilgisi())).kod).toBe('abonelik_gerekli');
  });

  it('yanlis OTP kodu otp_gecersiz olur', async () => {
    const { adaptorler } = kur(() => hata(400, 'kod_gecersiz', 'Kod hatalı'));
    const e = await hatayiYakala(adaptorler.auth.otpDogrula('05321112233', '000000'));
    expect(e.kod).toBe('otp_gecersiz');
  });
});

describe('cevrimdisi kuyruk ile birlikte', () => {
  it('ag/5xx yeniden denenir (ayni istek_id), 4xx basarisiz listesine gider', async () => {
    const yanitlar = [() => hata(503, 'hizmet_kullanilamiyor'), () => json({ tamam: true })];
    const { f, cagrilar } = sahteFetch((c) => {
      if (c.govde && (c.govde as { ret?: boolean }).ret) return hata(422, 'dogrulama_hatasi');
      return (yanitlar.shift() ?? (() => json({})))();
    });
    let simdi = 1_000;
    let n = 0;
    const q = new OfflineKuyruk({
      depo: bellekKv(),
      yeniId: () => `istek-${++n}`,
      kapsam: () => 'u1',
      simdi: () => simdi,
      gecikme: () => 1000,
    });
    q.kaydet('deneme.gonder', async (is) => {
      const r = await f(
        new Request('http://api.test/v1/deneme', {
          method: 'POST',
          headers: { 'Idempotency-Key': is.istekId },
          body: JSON.stringify(is.yuk),
        }),
      );
      if (!r.ok) throw apiHatasiOlustur(r.status, await r.json());
    });

    q.ekle('deneme.gonder', { ret: false });
    expect((await q.bosalt()).bekleyen).toBe(1);
    simdi += 2_000;
    expect(await q.bosalt()).toEqual({ gonderilen: 1, bekleyen: 0, basarisiz: 0 });
    expect(cagrilar.map((c) => c.istekId)).toEqual(['istek-1', 'istek-1']);

    q.ekle('deneme.gonder', { ret: true });
    const son = await q.bosalt();
    expect(son).toEqual({ gonderilen: 0, bekleyen: 0, basarisiz: 1 });
  });
});

describe('apiUrlCoz', () => {
  it('Android emulatorunde localhost -> 10.0.2.2, iOS ve uzak adreste degismez', () => {
    expect(apiUrlCoz('http://localhost:4000', 'android')).toBe('http://10.0.2.2:4000');
    expect(apiUrlCoz('http://127.0.0.1:4000/x', 'android')).toBe('http://10.0.2.2:4000/x');
    expect(apiUrlCoz('http://localhost:4000', 'ios')).toBe('http://localhost:4000');
    expect(apiUrlCoz('https://api.ornek.com', 'android')).toBe('https://api.ornek.com');
  });
});
