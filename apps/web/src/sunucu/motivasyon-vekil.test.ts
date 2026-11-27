import {
  KarakterYanitiSema,
  KozmetiklerYanitiSema,
  MotivasyonOgrenciDurumuSema,
  MotivasyonSeriDetaySema,
  OdakAcikOturumHatasiSema,
  OdakAcikYanitiSema,
  OdakBaslatYanitiSema,
  OdakBitirYanitiSema,
} from '@kopru/contracts';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { motivasyonMockSifirla, motivasyonMockXpYaz } from './motivasyon-mock';
import { motivasyonVekili, motivasyonYoluIzinliMi } from './motivasyon-vekil';

import { hataSema } from '@/oturum/tipler';

const K = 'kurum-atlas'; // ogrenci
const OGRETMEN = 'kurum-ege';
const YONETICI = 'kurum-mavi'; // oyunlastirma kapali

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  motivasyonMockSifirla();
});

describe('motivasyon izinli yollar', () => {
  it('ogrenci, ogretmen ve karakter uclarini gecirir', () => {
    const uclar: [string[], string][] = [
      [['benim'], 'GET'],
      [['benim', 'seri'], 'GET'],
      [['ogrenciler', 'o', 'ozet'], 'GET'],
      [['ogrenciler', 'o', 'haftanin-yildizlari'], 'GET'],
      [['odak-oturumlari'], 'POST'],
      [['odak-oturumlari', 'acik'], 'GET'],
      [['odak-oturumlari', 'i', 'bitir'], 'POST'],
      [['haftanin-yildizlari'], 'POST'],
      [['haftanin-yildizlari', 'verdiklerim'], 'GET'],
      [['karakter'], 'POST'],
      [['karakter', 'turler'], 'GET'],
      [['karakter', 'tur'], 'PATCH'],
      [['karakter', 'ad'], 'PATCH'],
      [['karakter', 'kozmetikler'], 'GET'],
      [['karakter', 'kusanimlar', 'sapka'], 'PUT'],
      [['karakter', 'kusanimlar', 'sapka'], 'DELETE'],
      [['gruplar', 'g', 'seri-duraklatmalari'], 'POST'],
      [['gruplar', 'g', 'seri-duraklatmalari', 'd'], 'DELETE'],
    ];
    for (const [son, yontem] of uclar) {
      expect(motivasyonYoluIzinliMi(['kurumlar', K, ...son], yontem), son.join('/')).toBe(true);
    }
  });

  it('izinsiz yollari, yol gezmeyi ve fazladan parcalari reddeder', () => {
    for (const parcalar of [
      [],
      ['kurumlar', K],
      ['kurumlar', K, 'xp'],
      ['kurumlar', K, 'liderlik'],
      ['kurumlar', K, 'benim', 'xp'],
      ['kurumlar', K, 'benim', 'seri', 'x'],
      ['kurumlar', K, 'ogrenciler', 'o', 'finans'],
      ['kurumlar', K, 'karakter', 'kusanimlar'],
      ['kurumlar', K, 'karakter', '..', 'x'],
      ['kurumlar', K, 'odak-oturumlari', 'i', 'sil'],
      ['kurumlar', K, 'gruplar', 'g', 'seri-duraklatmalari', 'd', 'x'],
      ['admin'],
    ]) {
      expect(motivasyonYoluIzinliMi(parcalar), parcalar.join('/')).toBe(false);
    }
  });
});

describe('motivasyon vekili', () => {
  const istek = (yol: string, ek: ConstructorParameters<typeof NextRequest>[1] = {}) =>
    new NextRequest(`http://localhost/api/motivasyon/${yol}`, {
      headers: { authorization: 'Bearer tok', host: 'localhost' },
      ...ek,
    });
  const mockModu = () => {
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '1');
  };

  it('yetkisiz istegi 401, izinsiz yolu 404 ile reddeder', async () => {
    const yetkisiz = await motivasyonVekili(
      new NextRequest('http://localhost/x', { method: 'GET' }),
      ['kurumlar', K, 'benim'],
    );
    expect(yetkisiz.status).toBe(401);
    expect((await motivasyonVekili(istek('x'), ['kurumlar', K, 'baska'])).status).toBe(404);
  });

  it('gercek modda MOTIVASYON_URL ye /v1/motivasyon/<yol> olarak iletir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '0');
    vi.stubEnv('MOTIVASYON_URL', 'http://motivasyon.test:4001');
    await motivasyonVekili(istek('x'), ['kurumlar', K, 'benim', 'seri']);
    const [adres, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(adres).toBe(`http://motivasyon.test:4001/v1/motivasyon/kurumlar/${K}/benim/seri`);
    expect(init.headers.authorization).toBe('Bearer tok');
  });

  it('gosdesiz POST icin {} gonderir; gövdesiz DELETE icin content-type gondermez', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '0');
    await motivasyonVekili(istek('x', { method: 'POST' }), ['kurumlar', K, 'haftanin-yildizlari']);
    const post = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(post[1].body).toBe('{}');
    await motivasyonVekili(istek('x', { method: 'DELETE' }), [
      'kurumlar',
      K,
      'karakter',
      'kusanimlar',
      'sapka',
    ]);
    const del = fetchMock.mock.calls[1] as [string, { headers: Record<string, string> }];
    expect(del[1].headers['content-type']).toBeUndefined();
  });

  const govdeli = (govde: unknown) => ({
    method: 'POST',
    headers: {
      authorization: 'Bearer tok',
      'content-type': 'application/json',
      host: 'localhost',
    },
    body: JSON.stringify(govde),
  });
  const benim = async (kurum = K) =>
    MotivasyonOgrenciDurumuSema.parse(
      await (await motivasyonVekili(istek('x'), ['kurumlar', kurum, 'benim'])).json(),
    );
  const hata = async (yanit: Response) => hataSema.parse(await yanit.json()).error;

  it('mock: karakter secilmeden benim karakter null; secince tum durum doner (sozlesmeye uygun)', async () => {
    mockModu();
    const once = await benim();
    expect(once.karakter).toBeNull();
    expect(once.beceriler).toHaveLength(5);
    expect(once.rozetler.kazanilan.length).toBeGreaterThan(0);
    expect(once.rozetler.kilitli.length).toBeGreaterThan(0);

    const sec = await motivasyonVekili(istek('x', govdeli({ tur_kodu: 'dinamo', ad: 'Pamuk' })), [
      'kurumlar',
      K,
      'karakter',
    ]);
    expect(sec.status).toBe(201);
    KarakterYanitiSema.parse(await sec.json());
    const sonra = await benim();
    expect(sonra.karakter).toMatchObject({ tur_kodu: 'dinamo', ad: 'Pamuk' });
  });

  it('mock: uygunsuz karakter adi 422 karakter_adi_uygunsuz', async () => {
    mockModu();
    const yanit = await motivasyonVekili(istek('x', govdeli({ tur_kodu: 'sedir', ad: 'Hitler' })), [
      'kurumlar',
      K,
      'karakter',
    ]);
    expect(yanit.status).toBe(422);
    expect((await hata(yanit)).code).toBe('karakter_adi_uygunsuz');
  });

  it('mock: kozmetik kusanma ve kilitli kozmetik reddi', async () => {
    mockModu();
    await motivasyonVekili(istek('x', govdeli({ tur_kodu: 'sedir', ad: 'Fındık' })), [
      'kurumlar',
      K,
      'karakter',
    ]);
    const liste = KozmetiklerYanitiSema.parse(
      await (await motivasyonVekili(istek('x'), ['kurumlar', K, 'karakter', 'kozmetikler'])).json(),
    );
    expect(liste.kozmetikler.find((k) => k.kod === 'sapka_kasket')?.sahip).toBe(true);
    expect(liste.kozmetikler.find((k) => k.kod === 'sapka_tac')?.sahip).toBe(false);
    const put = (kod: string) =>
      motivasyonVekili(istek('x', { ...govdeli({ kozmetik_kodu: kod }), method: 'PUT' }), [
        'kurumlar',
        K,
        'karakter',
        'kusanimlar',
        'sapka',
      ]);
    expect((await put('sapka_kasket')).status).toBe(200);
    const kilitli = await put('sapka_tac');
    expect(kilitli.status).toBe(422);
    expect((await hata(kilitli)).code).toBe('kozmetik_sahip_degil');
  });

  it('mock: ogrenci eylemi XP yazar ve gunluk hedef ilerler (sozlesmeye uygun)', async () => {
    mockModu();
    const once = await benim();
    motivasyonMockXpYaz('ogrenme', 'PUT', `kurumlar/${K}/gorevler/g1/gerceklesen`);
    const sonra = await benim();
    expect(sonra.toplam_xp).toBe(once.toplam_xp + 5);
    const seri = MotivasyonSeriDetaySema.parse(
      await (await motivasyonVekili(istek('x'), ['kurumlar', K, 'benim', 'seri'])).json(),
    );
    expect(seri.hedefler.find((h) => h.tur === 'plan_gorevi')?.yapilan).toBe(1);
    expect(seri.bugun_aktif).toBe(true); // plan hedefi esigi 1
    expect(seri.gunler).toHaveLength(35);
    expect(seri.gunler.at(-1)).toMatchObject({ bugun: true, durum: 'aktif' });
  });

  it('mock: mock_durum cerezi ayri durum verir; XP ve karakter eylemleri birbirine karismaz', async () => {
    mockModu();
    const cerezli = (
      yol: string,
      anahtar: string,
      ek: ConstructorParameters<typeof NextRequest>[1] = {},
    ) =>
      new NextRequest(`http://localhost/api/motivasyon/${yol}`, {
        ...ek,
        headers: {
          authorization: 'Bearer tok',
          host: 'localhost',
          cookie: `mock_durum=${anahtar}`,
          ...(ek.headers as Record<string, string> | undefined),
        },
      });
    const benimA = async () =>
      MotivasyonOgrenciDurumuSema.parse(
        await (await motivasyonVekili(cerezli('x', 'abc1'), ['kurumlar', K, 'benim'])).json(),
      );

    const varsayilan = await benim();
    const once = await benimA();
    expect(once.toplam_xp).toBe(varsayilan.toplam_xp);

    // Anahtarli XP yazimi yalniz kendi durumunu degistirir.
    motivasyonMockXpYaz('ogrenme', 'PUT', `kurumlar/${K}/gorevler/g1/gerceklesen`, 'abc1');
    expect((await benimA()).toplam_xp).toBe(once.toplam_xp + 5);
    expect((await benim()).toplam_xp).toBe(varsayilan.toplam_xp);

    // Anahtarsiz yazim da anahtarli durumu degistirmez.
    motivasyonMockXpYaz('ogrenme', 'PUT', `kurumlar/${K}/gorevler/g1/gerceklesen`);
    expect((await benim()).toplam_xp).toBe(varsayilan.toplam_xp + 5);
    expect((await benimA()).toplam_xp).toBe(once.toplam_xp + 5);

    // Karakter secimi de yalitilir; gecersiz cerez varsayilan duruma duser.
    const sec = await motivasyonVekili(
      cerezli('x', 'abc1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tur_kodu: 'dinamo', ad: 'Pamuk' }),
      }),
      ['kurumlar', K, 'karakter'],
    );
    expect(sec.status).toBe(201);
    expect((await benimA()).karakter).toMatchObject({ ad: 'Pamuk' });
    expect((await benim()).karakter).toBeNull();
    const bozuk = MotivasyonOgrenciDurumuSema.parse(
      await (await motivasyonVekili(cerezli('x', 'A/../b'), ['kurumlar', K, 'benim'])).json(),
    );
    expect(bozuk.karakter).toBeNull();
  });

  it('mock: rol uyumsuzlugu 403 izin_yok; modul kapali kurumda 403 modul_kapali', async () => {
    mockModu();
    const ogretmenBenim = await motivasyonVekili(istek('x'), ['kurumlar', OGRETMEN, 'benim']);
    expect(ogretmenBenim.status).toBe(403);
    const kapali = await motivasyonVekili(istek('x'), [
      'kurumlar',
      YONETICI,
      'haftanin-yildizlari',
      'verdiklerim',
    ]);
    expect(kapali.status).toBe(403);
    expect((await hata(kapali)).code).toBe('modul_kapali');
  });

  it('mock odak: idempotent baslat, ikinci oturum 409 acik_oturum_var, bitirince XP', async () => {
    mockModu();
    const id1 = '0190a000-0000-7000-8000-000000000001';
    const id2 = '0190a000-0000-7000-8000-000000000002';
    const basla = (id: string) =>
      motivasyonVekili(istek('x', govdeli({ istemci_id: id, mod: 'serbest', planlanan_dk: 5 })), [
        'kurumlar',
        K,
        'odak-oturumlari',
      ]);
    const ilk = await basla(id1);
    expect(ilk.status).toBe(201);
    OdakBaslatYanitiSema.parse(await ilk.json());
    expect((await basla(id1)).status).toBe(200); // ayni kimlik: ayni oturum
    const catisma = await basla(id2);
    expect(catisma.status).toBe(409);
    const h = await hata(catisma);
    expect(h.code).toBe('acik_oturum_var');
    expect(OdakAcikOturumHatasiSema.parse(h.details).oturum.istemci_id).toBe(id1);

    const once = (await benim()).toplam_xp;
    const bitis = new Date(Date.now() + 5 * 60_000 + 500).toISOString();
    const bitir = await motivasyonVekili(istek('x', govdeli({ durum: 'tamam', bitis_at: bitis })), [
      'kurumlar',
      K,
      'odak-oturumlari',
      id1,
      'bitir',
    ]);
    const sonuc = OdakBitirYanitiSema.parse(await bitir.json());
    expect(sonuc.kazanim.xp).toBe(5);
    expect((await benim()).toplam_xp).toBe(once + 5);
    const acik = OdakAcikYanitiSema.parse(
      await (await motivasyonVekili(istek('x'), ['kurumlar', K, 'odak-oturumlari', 'acik'])).json(),
    );
    expect(acik.oturum).toBeNull();
  });
});
