import { MODUL_KODLARI } from '@kopru/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiKimlik } from './api';

interface Cagri {
  yontem: string;
  yol: string;
  arama: URLSearchParams;
  yetki: string | null;
  govde: unknown;
}

const UUID_A = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
const UUID_B = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';

let cagrilar: Cagri[] = [];
let yanitlar: Record<string, () => Response> = {};

const json = (govde: unknown, durum = 200) =>
  new Response(JSON.stringify(govde), {
    status: durum,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  cagrilar = [];
  yanitlar = {};
  vi.stubGlobal('fetch', async (girdi: Request) => {
    const url = new URL(girdi.url);
    const metin = await girdi.text();
    cagrilar.push({
      yontem: girdi.method,
      yol: url.pathname,
      arama: url.searchParams,
      yetki: girdi.headers.get('authorization'),
      govde: metin ? (JSON.parse(metin) as unknown) : undefined,
    });
    const yanit = yanitlar[`${girdi.method} ${url.pathname}`];
    return yanit ? yanit() : json({ error: { code: 'bulunamadi', message: 'yok' } }, 404);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gercek kimlik adaptoru', () => {
  it('OTP gonderir ve dogrular (gercek yollar, telefon gövdede)', async () => {
    yanitlar['POST /auth/otp/gonder'] = () => json({ gonderildi: true, gecerlilik_sn: 300 });
    yanitlar['POST /auth/otp/dogrula'] = () =>
      json({
        oturum_belirteci: 'oturum-1',
        kullanici: {
          id: UUID_A,
          gorunen_ad: null,
          telefon_e164: '+905321234567',
          eposta: null,
          dil: 'tr',
        },
        yeni_kullanici: true,
      });
    const adaptor = apiKimlik();
    await expect(adaptor.kodIste('+905321234567')).resolves.toEqual({ yenidenSn: 60 });
    await expect(adaptor.kodDogrula('+905321234567', '123456')).resolves.toEqual({
      oturumBelirteci: 'oturum-1',
    });
    expect(cagrilar.map((c) => c.govde)).toEqual([
      { telefon: '+905321234567' },
      { telefon: '+905321234567', kod: '123456' },
    ]);
  });

  it('api hata kodlarini web kodlarina cevirir', async () => {
    yanitlar['POST /auth/otp/dogrula'] = () =>
      json({ error: { code: 'kod_gecersiz', message: 'Kod hatalı.' } }, 400);
    await expect(apiKimlik().kodDogrula('+905321234567', '000000')).rejects.toMatchObject({
      durum: 400,
      kod: 'otp_gecersiz',
    });
  });

  it('api ulasilamazsa 502 hizmet_kullanilamiyor verir', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')));
    await expect(apiKimlik().kodIste('+905321234567')).rejects.toMatchObject({
      durum: 502,
      kod: 'hizmet_kullanilamiyor',
    });
  });

  it('oturumAl: token + ben birlestirilir, riza durumu ben.onay_gerekli ile gelir', async () => {
    yanitlar['POST /auth/token'] = () =>
      json({
        access_token: 'erisim-1',
        token_type: 'Bearer',
        expires_in: 900,
        kurum_id: UUID_B,
        uyelik_id: UUID_A,
        rol: 'sahip',
        roller: ['sahip'],
        uyelikler: [
          {
            uyelik_id: UUID_A,
            kurum_id: UUID_B,
            kurum_ad: 'Deneme',
            kurum_tur: 'kurum',
            rol: 'sahip',
            durum: 'aktif',
            sube_id: null,
          },
          {
            uyelik_id: UUID_B,
            kurum_id: UUID_A,
            kurum_ad: 'Askıda',
            kurum_tur: 'kurum',
            rol: 'ogretmen',
            durum: 'askida',
            sube_id: null,
          },
        ],
      });
    yanitlar['GET /v1/hesap/ben'] = () =>
      json({
        kullanici: {
          id: UUID_A,
          gorunen_ad: 'Elif Yılmaz',
          telefon_e164: '+905321234567',
          eposta: null,
          dil: 'tr',
        },
        onay_gerekli: true,
        uyelikler: [],
      });

    const { oturum } = await apiKimlik().oturumAl('oturum-1', { uyelikId: UUID_A });

    expect(oturum).toMatchObject({
      erisimBelirteci: 'erisim-1',
      aktifUyelikId: UUID_A,
      rizaGerekli: true,
      kullanici: { id: UUID_A, ad: 'Elif Yılmaz', telefon: '+905321234567' },
      uyelikler: [{ id: UUID_A, kurumId: UUID_B, kurumAd: 'Deneme', rol: 'sahip' }],
    });
    expect(cagrilar[0]).toMatchObject({
      yetki: 'Bearer oturum-1',
      govde: { uyelik_id: UUID_A },
    });
    expect(cagrilar[1]?.yetki).toBe('Bearer erisim-1');
  });

  it('kurumBaglami: etkin-tumu ucunu tek istekle sorar, yalniz aciklari dondurur', async () => {
    yanitlar['GET /v1/hesap/modul-ayarlari/etkin-tumu'] = () =>
      json({
        moduller: Object.fromEntries(MODUL_KODLARI.map((kod) => [kod, kod !== 'finans'])),
      });

    const baglam = await apiKimlik().kurumBaglami('oturum', 'erisim-1', UUID_B);

    expect(cagrilar).toHaveLength(1);
    expect(cagrilar[0]?.yetki).toBe('Bearer erisim-1');
    expect(baglam.moduller).not.toContain('finans');
    expect(baglam.moduller).toContain('takvim');
    expect(baglam.moduller).toHaveLength(MODUL_KODLARI.length - 1);
  });

  it('kurumBaglami: modul.ayar.oku izni yoksa (403 izin_yok) yalniz cekirdek, hata firlatmaz', async () => {
    yanitlar['GET /v1/hesap/modul-ayarlari/etkin-tumu'] = () =>
      json({ error: { code: 'izin_yok', message: 'Yetkin yok.' } }, 403);
    const baglam = await apiKimlik().kurumBaglami('o', 'e', UUID_B);
    expect(baglam.moduller).toEqual([]);
  });

  it('rizaMetni bekleyen metinleri doner, rizaKabul her metni ayri kaydeder', async () => {
    yanitlar['POST /auth/token'] = () =>
      json({
        access_token: 'erisim-1',
        token_type: 'Bearer',
        expires_in: 900,
        kurum_id: null,
        uyelik_id: null,
        rol: null,
        roller: [],
        uyelikler: [],
      });
    const metin = (id: string, baslik: string, kabul: boolean) => ({
      id,
      tur: 'kvkk_aydinlatma',
      surum: '2026-11',
      dil: 'tr',
      baslik,
      govde_markdown: `${baslik} metni`,
      govde_sha256: 'ab',
      kabul_edildi: kabul,
    });
    yanitlar['GET /v1/hesap/rizalar/guncel'] = () =>
      json({
        onay_gerekli: true,
        metinler: [metin(UUID_A, 'KVKK', false), metin(UUID_B, 'Açık rıza', false)],
      });
    yanitlar['POST /v1/hesap/rizalar'] = () =>
      json({ riza_id: UUID_A, karar: 'kabul', onay_gerekli: false });

    const adaptor = apiKimlik();
    const riza = await adaptor.rizaMetni('oturum-1');
    expect(riza.metinIdleri).toEqual([UUID_A, UUID_B]);
    expect(riza.bolumler.map((b) => b.baslik)).toEqual(['KVKK', 'Açık rıza']);

    await adaptor.rizaKabul('oturum-1', { surum: riza.surum, metinIdleri: riza.metinIdleri });
    const kabuller = cagrilar.filter((c) => c.yol === '/v1/hesap/rizalar' && c.yontem === 'POST');
    expect(kabuller.map((c) => c.govde)).toEqual([
      { riza_metni_id: UUID_A, karar: 'kabul', kaynak: 'web' },
      { riza_metni_id: UUID_B, karar: 'kabul', kaynak: 'web' },
    ]);
  });

  it('403 riza_gerekli ve 402 abonelik_gerekli kodlari oldugu gibi gecer', async () => {
    yanitlar['GET /v1/hesap/modul-ayarlari/etkin-tumu'] = () =>
      json({ error: { code: 'riza_gerekli', message: 'Onay gerekli.' } }, 403);
    await expect(apiKimlik().kurumBaglami('o', 'e', UUID_B)).rejects.toMatchObject({
      durum: 403,
      kod: 'riza_gerekli',
    });
    yanitlar['GET /v1/hesap/modul-ayarlari/etkin-tumu'] = () =>
      json({ error: { code: 'abonelik_gerekli', message: 'Abonelik yok.' } }, 402);
    await expect(apiKimlik().kurumBaglami('o', 'e', UUID_B)).rejects.toMatchObject({
      durum: 402,
      kod: 'abonelik_gerekli',
    });
  });

  it('cikis hatayi yutar', async () => {
    yanitlar['POST /auth/cikis'] = () => json({ error: { code: 'yetkisiz', message: 'x' } }, 401);
    await expect(apiKimlik().cikis('oturum-1')).resolves.toBeUndefined();
  });
});
